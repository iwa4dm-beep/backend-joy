// Phase 47 — RED metrics (Rate, Errors, Duration) in-process registry.
// Kept low-cardinality: labels are {route, method, status_class, service}.

type Bucket = { count: number; sum: number; le: number[]; buckets: number[] };

const RATE_KEY = (r: string, m: string, sc: string) => `${r}|${m}|${sc}`;

const LATENCY_LE = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

const requests = new Map<string, number>();          // rate + errors
const latency  = new Map<string, Bucket>();          // histograms

function ensureBucket(k: string): Bucket {
  let b = latency.get(k);
  if (!b) {
    b = { count: 0, sum: 0, le: LATENCY_LE, buckets: new Array(LATENCY_LE.length + 1).fill(0) };
    latency.set(k, b);
  }
  return b;
}

export function recordRequest(route: string, method: string, statusCode: number, durationMs: number, service = "pluto-api") {
  const sc = statusCode >= 500 ? "5xx" : statusCode >= 400 ? "4xx" : statusCode >= 300 ? "3xx" : "2xx";
  const key = `${service}|${RATE_KEY(route, method, sc)}`;
  requests.set(key, (requests.get(key) ?? 0) + 1);
  const b = ensureBucket(key);
  b.count++; b.sum += durationMs;
  let placed = false;
  for (let i = 0; i < b.le.length; i++) {
    if (durationMs <= b.le[i]) { b.buckets[i]++; placed = true; break; }
  }
  if (!placed) b.buckets[b.le.length]++;
}

export interface RedSnapshot {
  requests: Array<{ service: string; route: string; method: string; status_class: string; count: number }>;
  latency:  Array<{ service: string; route: string; method: string; status_class: string; count: number; sum_ms: number; buckets: Array<{ le: number | "inf"; count: number }> }>;
}

export function snapshot(): RedSnapshot {
  const req: RedSnapshot["requests"] = [];
  for (const [k, v] of requests) {
    const [service, route, method, status_class] = k.split("|");
    req.push({ service, route, method, status_class, count: v });
  }
  const lat: RedSnapshot["latency"] = [];
  for (const [k, b] of latency) {
    const [service, route, method, status_class] = k.split("|");
    const cum: Array<{ le: number | "inf"; count: number }> = [];
    let acc = 0;
    for (let i = 0; i < b.le.length; i++) { acc += b.buckets[i]; cum.push({ le: b.le[i], count: acc }); }
    acc += b.buckets[b.le.length]; cum.push({ le: "inf", count: acc });
    lat.push({ service, route, method, status_class, count: b.count, sum_ms: b.sum, buckets: cum });
  }
  return { requests: req, latency: lat };
}

export function toPrometheus(): string {
  const s = snapshot();
  const lines: string[] = [];
  lines.push("# HELP pluto_http_requests_total Total HTTP requests (RED)");
  lines.push("# TYPE pluto_http_requests_total counter");
  for (const r of s.requests) {
    lines.push(`pluto_http_requests_total{service="${r.service}",route="${r.route}",method="${r.method}",status_class="${r.status_class}"} ${r.count}`);
  }
  lines.push("# HELP pluto_http_request_duration_ms HTTP request duration (ms)");
  lines.push("# TYPE pluto_http_request_duration_ms histogram");
  for (const l of s.latency) {
    const base = `service="${l.service}",route="${l.route}",method="${l.method}",status_class="${l.status_class}"`;
    for (const b of l.buckets) {
      lines.push(`pluto_http_request_duration_ms_bucket{${base},le="${b.le}"} ${b.count}`);
    }
    lines.push(`pluto_http_request_duration_ms_sum{${base}} ${l.sum_ms}`);
    lines.push(`pluto_http_request_duration_ms_count{${base}} ${l.count}`);
  }
  return lines.join("\n") + "\n";
}

export function resetRedMetrics() { requests.clear(); latency.clear(); }
