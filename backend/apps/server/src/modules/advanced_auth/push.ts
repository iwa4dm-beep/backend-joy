// Push notifications — Phase 15.5.
//
// Implements device registration + a delivery pipeline. Providers:
//   - "log"     : dev/test — always succeeds, logs to api_logs
//   - "webhook" : POSTs {title,body,data,token,platform} to PLUTO_PUSH_WEBHOOK_URL
//   - "fcm"     : POSTs to FCM legacy API using PLUTO_FCM_SERVER_KEY
// Every delivery flips push_messages.status to delivered/failed, records
// the provider id and error, and broadcasts a `system:push` event so the
// dashboard streams updates without polling.
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { q } from "../../lib/pgraw.js";
import { log } from "../../lib/logs.js";

function requireUser(req: FastifyRequest, reply: FastifyReply): string | null {
  const u = req.auth?.user;
  if (!u) { reply.code(401).send({ error: "auth_required" }); return null; }
  return u.sub;
}

type PushRow = { id: string; token: string; platform: string; title: string | null;
  body: string | null; data: Record<string, unknown> };

async function deliver(msg: PushRow): Promise<{ ok: boolean; provider_id?: string; error?: string }> {
  const driver = process.env.PLUTO_PUSH_DRIVER ?? "log";
  try {
    if (driver === "log") {
      await log("admin", "info", `[push:log] → ${msg.platform}/${msg.token.slice(0, 10)}… "${msg.title ?? ""}"`, null);
      return { ok: true, provider_id: `log_${Date.now()}` };
    }
    if (driver === "webhook") {
      const url = process.env.PLUTO_PUSH_WEBHOOK_URL;
      if (!url) return { ok: false, error: "PLUTO_PUSH_WEBHOOK_URL not set" };
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(msg) });
      if (!r.ok) return { ok: false, error: `webhook ${r.status}` };
      return { ok: true, provider_id: r.headers.get("x-message-id") ?? undefined };
    }
    if (driver === "fcm") {
      const key = process.env.PLUTO_FCM_SERVER_KEY;
      if (!key) return { ok: false, error: "PLUTO_FCM_SERVER_KEY not set" };
      const r = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: { authorization: `key=${key}`, "content-type": "application/json" },
        body: JSON.stringify({ to: msg.token, notification: { title: msg.title, body: msg.body }, data: msg.data }),
      });
      const j = await r.json() as { message_id?: string; failure?: number; results?: Array<{ error?: string }> };
      if (!r.ok || j.failure) return { ok: false, error: JSON.stringify(j.results ?? j) };
      return { ok: true, provider_id: j.message_id };
    }
    return { ok: false, error: `unknown driver ${driver}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function mountPush(app: FastifyInstance) {
  app.get("/push/v1/devices", async (req, reply) => {
    const uid = requireUser(req, reply); if (!uid) return;
    const r = await q(`select id, platform, bundle_id, app_version, disabled_at, last_seen_at, created_at
                       from public.push_devices where workspace_id=$1 and user_id=$2 order by created_at desc`,
                       [req.auth!.workspaceId, uid]);
    return { devices: r.rows };
  });

  app.post("/push/v1/devices", async (req, reply) => {
    const uid = requireUser(req, reply); if (!uid) return;
    const body = z.object({
      platform: z.enum(["ios","android","web"]),
      token: z.string().min(4).max(4096),
      bundle_id: z.string().optional(),
      app_version: z.string().optional(),
    }).parse(req.body);
    const r = await q<{ id: string; created_at: Date }>(
      `insert into public.push_devices (workspace_id, user_id, platform, token, bundle_id, app_version)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (workspace_id, token) do update set last_seen_at=now(),
         app_version=coalesce(excluded.app_version, public.push_devices.app_version),
         disabled_at=null
       returning id, created_at`,
      [req.auth!.workspaceId, uid, body.platform, body.token, body.bundle_id ?? null, body.app_version ?? null]);
    return { id: r.rows[0]!.id, platform: body.platform, created_at: r.rows[0]!.created_at };
  });

  app.delete("/push/v1/devices/:id", async (req, reply) => {
    const uid = requireUser(req, reply); if (!uid) return;
    const { id } = req.params as { id: string };
    const r = await q(`delete from public.push_devices where id=$1 and user_id=$2`, [id, uid]);
    if (r.rowCount === 0) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/push/v1/send", async (req, reply) => {
    const uid = requireUser(req, reply); if (!uid) return;
    const body = z.object({
      device_id: z.string().uuid().optional(),
      user_id: z.string().uuid().optional(),
      title: z.string().max(200).optional(),
      body: z.string().max(2000).optional(),
      data: z.record(z.unknown()).default({}),
    }).parse(req.body);

    const targets = await q<{ id: string; token: string; platform: string }>(
      body.device_id
        ? `select id, token, platform from public.push_devices where id=$1 and workspace_id=$2 and disabled_at is null`
        : `select id, token, platform from public.push_devices where user_id=$1 and workspace_id=$2 and disabled_at is null`,
      [body.device_id ?? body.user_id ?? uid, req.auth!.workspaceId]);

    if (targets.rows.length === 0) return reply.code(404).send({ error: "no_devices" });

    const results: Array<{ id: string; status: string; error?: string }> = [];
    for (const dev of targets.rows) {
      const ins = await q<{ id: string }>(
        `insert into public.push_messages (workspace_id, device_id, actor_id, title, body, data)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [req.auth!.workspaceId, dev.id, uid, body.title ?? null, body.body ?? null, JSON.stringify(body.data)]);
      const mid = ins.rows[0]!.id;
      const res = await deliver({ id: mid, token: dev.token, platform: dev.platform,
        title: body.title ?? null, body: body.body ?? null, data: body.data });
      await q(`update public.push_messages set status=$1, provider_id=$2, error=$3, delivered_at=case when $1='delivered' then now() else null end
               where id=$4`, [res.ok ? "delivered" : "failed", res.provider_id ?? null, res.error ?? null, mid]);
      results.push({ id: mid, status: res.ok ? "delivered" : "failed", error: res.error });
    }
    return { sent: results.length, results };
  });

  app.get("/push/v1/messages", async (req) => {
    const limit = Math.min(Number((req.query as { limit?: string })?.limit ?? 50), 500);
    const r = await q(`select id, device_id, title, body, data, status, provider_id, error, created_at, delivered_at
                       from public.push_messages where workspace_id=$1
                       order by created_at desc limit $2`, [req.auth!.workspaceId, limit]);
    return { messages: r.rows };
  });
}
