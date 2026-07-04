// Phase 47 — SLO burn-rate evaluation.
// Google SRE multi-window multi-burn-rate: short (5m/1h) + long (1h/6h).
// A burn rate of 14.4 exhausts a 30-day budget in ~2 days.

import { q } from "./pgraw.js";

export interface SloRow {
  id: string; slug: string; service: string; route_pattern: string;
  kind: "availability" | "latency";
  objective: number; threshold_ms: number | null; window_days: number;
}

export const BURN_WINDOWS: Array<{ label: string; minutes: number; alertBurn: number }> = [
  { label: "5m",  minutes: 5,    alertBurn: 14.4 },
  { label: "1h",  minutes: 60,   alertBurn: 6 },
  { label: "6h",  minutes: 360,  alertBurn: 3 },
  { label: "24h", minutes: 1440, alertBurn: 1 },
];

// Evaluate error ratio inside a window using recorded obs_v2_spans as the
// source of truth (kind=server root spans). Returns {ratio, total}.
export async function evaluateErrorRatio(slo: SloRow, windowMinutes: number): Promise<{ total: number; bad: number; ratio: number }> {
  const routePat = slo.route_pattern;
  const svc = slo.service;
  const sinceIso = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const kind = slo.kind;
  const thresh = slo.threshold_ms ?? 1000;
  const rows = await q<{ total: string; bad: string }>(
    `select count(*)::bigint as total,
            count(*) filter (where ${kind === "latency"
              ? "duration_ms > $4"
              : "status_code = 2"})::bigint as bad
       from public.obs_v2_spans
      where service = $1
        and name ~ $2
        and started_at >= $3::timestamptz`,
    [svc, routePat, sinceIso, thresh],
  );
  const total = Number(rows[0]?.total ?? 0);
  const bad   = Number(rows[0]?.bad ?? 0);
  const ratio = total === 0 ? 0 : bad / total;
  return { total, bad, ratio };
}

export function burnRate(ratio: number, objective: number): number {
  const budget = 1 - objective;
  if (budget <= 0) return ratio > 0 ? Number.POSITIVE_INFINITY : 0;
  return ratio / budget;
}
