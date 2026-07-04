// Server-side metering helper used by storage / functions / AI modules to
// record billable events and (optionally) enforce quota overage behavior.
// Behavior rules honoured from public.workspace_quotas.overage_behavior:
//   'allow' — record and return { ok: true }
//   'warn'  — record and return { ok: true, warn: true } when over soft/hard
//   'block' — return { ok: false, blocked: true } when hard limit exceeded
//             (event is NOT recorded so we never bill for a denied action)
import { q } from "./pgraw.js";

export type MeteredMetric =
  | "storage_gb" | "egress_gb" | "function_invocations"
  | "ai_tokens"  | "db_rows"   | "realtime_msgs";
export type MeteringEnv = "production" | "preview" | "development";

export interface MeterInput {
  workspaceId: string | null | undefined;
  metric: MeteredMetric;
  quantity: number;
  environment?: MeteringEnv;
  billingLabel?: string;
  meta?: Record<string, unknown>;
}

export interface MeterResult {
  ok: boolean;
  blocked?: boolean;
  warn?: boolean;
  over_soft?: boolean;
  over_hard?: boolean;
  used?: number;
  hard_limit?: number | null;
}

async function currentUsage(ws: string, metric: MeteredMetric, period: "day" | "month"): Promise<number> {
  const interval = period === "day" ? "1 day" : "30 days";
  const r = await q<{ total: string | null }>(
    `select coalesce(sum(quantity), 0)::text as total
     from public.usage_events
     where workspace_id=$1::uuid and metric=$2
       and observed_at > now() - interval '${interval}'`,
    [ws, metric]);
  return Number(r.rows[0]?.total ?? 0);
}

export async function recordUsage(input: MeterInput): Promise<MeterResult> {
  const ws = input.workspaceId;
  if (!ws) return { ok: true }; // no workspace context (system call) — skip

  const env = input.environment ?? "production";
  const label = input.billingLabel ?? null;

  // Check quota first (if any).
  const qrow = await q<{ hard_limit: number; soft_limit: number | null; period: string; overage_behavior: string; billing_label: string | null; alert_pct: number | null }>(
    `select hard_limit, soft_limit, period, overage_behavior, billing_label, alert_pct
     from public.workspace_quotas
     where workspace_id=$1::uuid and metric=$2
     order by case when period='day' then 0 else 1 end
     limit 1`, [ws, input.metric]);
  const quota = qrow.rows[0];

  if (quota) {
    const used = await currentUsage(ws, input.metric, (quota.period as "day" | "month") ?? "month");
    const projected = used + input.quantity;
    const overSoft = quota.soft_limit != null && projected > quota.soft_limit;
    const overHard = projected > quota.hard_limit;
    if (overHard && quota.overage_behavior === "block") {
      return { ok: false, blocked: true, over_soft: overSoft, over_hard: true, used, hard_limit: quota.hard_limit };
    }
    await q(
      `insert into public.usage_events (workspace_id, metric, quantity, meta, environment, billing_label)
       values ($1,$2,$3,$4::jsonb,$5,$6)`,
      [ws, input.metric, input.quantity, JSON.stringify(input.meta ?? {}), env, label ?? quota.billing_label]);
    // Alert threshold trigger — fire-and-forget so metering stays cheap.
    const pct = quota.hard_limit > 0 ? (projected / quota.hard_limit) * 100 : 0;
    const alertPct = quota.alert_pct ?? 80;
    if (pct >= alertPct) {
      void maybeFireAlert(ws, input.metric, pct, projected, quota.hard_limit);
    }
    return { ok: true, warn: (overSoft || overHard) && quota.overage_behavior !== "allow",
             over_soft: overSoft, over_hard: overHard, used: projected, hard_limit: quota.hard_limit };
  }

  await q(
    `insert into public.usage_events (workspace_id, metric, quantity, meta, environment, billing_label)
     values ($1,$2,$3,$4::jsonb,$5,$6)`,
    [ws, input.metric, input.quantity, JSON.stringify(input.meta ?? {}), env, label]);
  return { ok: true };
}

// Non-recording pre-flight check (e.g. before large uploads).
export async function checkQuota(ws: string, metric: MeteredMetric, quantity: number): Promise<MeterResult> {
  const qrow = await q<{ hard_limit: number; soft_limit: number | null; period: string; overage_behavior: string }>(
    `select hard_limit, soft_limit, period, overage_behavior
     from public.workspace_quotas where workspace_id=$1::uuid and metric=$2 limit 1`, [ws, metric]);
  const quota = qrow.rows[0];
  if (!quota) return { ok: true };
  const used = await currentUsage(ws, metric, (quota.period as "day" | "month") ?? "month");
  const projected = used + quantity;
  const overHard = projected > quota.hard_limit;
  const overSoft = quota.soft_limit != null && projected > quota.soft_limit;
  if (overHard && quota.overage_behavior === "block") {
    return { ok: false, blocked: true, over_soft: overSoft, over_hard: true, used, hard_limit: quota.hard_limit };
  }
  return { ok: true, warn: overSoft || overHard, over_soft: overSoft, over_hard: overHard, used, hard_limit: quota.hard_limit };
}

// ---- Alert fan-out --------------------------------------------------------
// Fires at most once per hour per (workspace, metric) — coalesces bursts.
// - Persists a quota_alert row.
// - Broadcasts `system:usage_alert` over pg_notify('pluto_broadcast', ...)
//   so dashboards get the event over SSE without polling.
// - Enqueues a delivery per registered webhook (best-effort, with retry).
async function maybeFireAlert(ws: string, metric: string, pct: number, used: number, hardLimit: number) {
  try {
    const existing = await q<{ id: string }>(
      `select id from public.quota_alerts
       where workspace_id=$1::uuid and metric=$2
         and triggered_at > now() - interval '1 hour' and resolved_at is null
       limit 1`, [ws, metric]);
    if (existing.rows[0]) return;
    const ins = await q<{ id: string }>(
      `insert into public.quota_alerts (workspace_id, metric, pct, used, hard_limit)
       values ($1::uuid, $2, $3, $4, $5) returning id`,
      [ws, metric, pct.toFixed(2), used, hardLimit]);
    const alertId = ins.rows[0].id;
    const payload = {
      type: "quota.alert",
      workspace_id: ws, metric, pct: Number(pct.toFixed(2)),
      used, hard_limit: hardLimit,
      alert_id: alertId,
      triggered_at: new Date().toISOString(),
    };

    // SSE broadcast — dashboards subscribed to /usage/v1/alerts/stream
    // filter by workspace_id and repaint the banner immediately.
    await q(`select pg_notify('pluto_broadcast', $1)`, [JSON.stringify({
      channel: "system:usage_alert", event: "quota.alert", payload, ts: new Date().toISOString(),
    })]).catch(() => undefined);

    const hooks = await q<{ id: string; url: string; secret: string | null; events: string[] }>(
      `select id, url, secret, events from public.workspace_webhooks
       where workspace_id=$1::uuid and active=true`, [ws]);
    const body = JSON.stringify(payload);
    for (const h of hooks.rows) {
      if (h.events && h.events.length && !h.events.includes("quota.alert")) continue;
      void deliverWebhook(h.id, h.url, h.secret, body, alertId, "quota.alert", 1);
    }
    await q(`update public.quota_alerts set notified=true where id=$1::uuid`, [alertId]);
  } catch { /* metering must never throw */ }
}

// Retry schedule (seconds since previous attempt): 30, 120, 300, 900, exhausted.
const RETRY_DELAYS_S = [30, 120, 300, 900];

export async function deliverWebhook(
  webhookId: string, url: string, secret: string | null,
  body: string, alertId: string | null, event: string, attempt: number,
): Promise<void> {
  const { createHmac, createHash } = await import("node:crypto");
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const started = Date.now();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-pluto-signature"] = createHmac("sha256", secret).update(body).digest("hex");
  let status: number | null = null;
  let errMsg: string | null = null;
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(5000) });
    status = res.status;
    if (!res.ok) errMsg = `HTTP ${res.status}`;
  } catch (e) {
    errMsg = (e as Error).message.slice(0, 300);
  }
  const rt = Date.now() - started;
  const succeeded = status !== null && status >= 200 && status < 300;
  const nextDelay = succeeded ? null : RETRY_DELAYS_S[attempt - 1] ?? null;
  const nextRetryAt = nextDelay ? new Date(Date.now() + nextDelay * 1000) : null;

  await q(
    `insert into public.webhook_deliveries
       (webhook_id, alert_id, event, attempt, status_code, response_time_ms, error, payload, payload_hash, next_retry_at, succeeded)
     values ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
    [webhookId, alertId, event, attempt, status, rt, errMsg, body, payloadHash, nextRetryAt, succeeded],
  ).catch(() => undefined);

  await q(
    `update public.workspace_webhooks
       set last_status=$2, last_error=$3, last_delivered_at=now() where id=$1::uuid`,
    [webhookId, status ?? 0, errMsg],
  ).catch(() => undefined);

  if (!succeeded && nextRetryAt) {
    setTimeout(() => {
      void deliverWebhook(webhookId, url, secret, body, alertId, event, attempt + 1);
    }, nextDelay! * 1000).unref?.();
  }
}


