// Phase 47 — Minimal OpenTelemetry primitives (W3C traceparent + OTLP/HTTP export)
// We avoid adding the full @opentelemetry SDK to keep the Worker bundle lean;
// this speaks OTLP/JSON directly which any collector (Tempo, Honeycomb, Jaeger,
// Grafana Agent) accepts on /v1/traces.

import { randomBytes } from "node:crypto";

export type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";
export type StatusCode = 0 | 1 | 2; // unset | ok | error

const KIND_MAP: Record<SpanKind, number> = { internal:1, server:2, client:3, producer:4, consumer:5 };

export function newTraceId(): string { return randomBytes(16).toString("hex"); }
export function newSpanId():  string { return randomBytes(8).toString("hex"); }

// Parse a W3C traceparent header: 00-<trace>-<parent>-<flags>
export function parseTraceparent(v: string | undefined): { traceId: string; spanId: string; sampled: boolean } | null {
  if (!v) return null;
  const p = v.split("-");
  if (p.length !== 4 || p[0] !== "00") return null;
  if (!/^[0-9a-f]{32}$/i.test(p[1]) || !/^[0-9a-f]{16}$/i.test(p[2])) return null;
  return { traceId: p[1].toLowerCase(), spanId: p[2].toLowerCase(), sampled: (parseInt(p[3], 16) & 1) === 1 };
}

export function formatTraceparent(traceId: string, spanId: string, sampled = true): string {
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

export interface OtelSpan {
  traceId: string;
  spanId: string;
  parentId?: string | null;
  name: string;
  kind: SpanKind;
  service: string;
  startedAt: number;   // epoch ms
  endedAt?: number;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; time: number; attributes?: Record<string, unknown> }>;
  status: StatusCode;
}

// Convert to OTLP/JSON resourceSpans payload for POST /v1/traces
export function toOtlpPayload(spans: OtelSpan[], service = "pluto-api") {
  const nsFromMs = (ms: number) => (BigInt(ms) * 1000000n).toString();
  const byService = new Map<string, OtelSpan[]>();
  for (const s of spans) {
    const svc = s.service || service;
    if (!byService.has(svc)) byService.set(svc, []);
    byService.get(svc)!.push(s);
  }
  return {
    resourceSpans: [...byService.entries()].map(([svc, list]) => ({
      resource: { attributes: [{ key: "service.name", value: { stringValue: svc } }] },
      scopeSpans: [{
        scope: { name: "pluto", version: "0.47.0" },
        spans: list.map((s) => ({
          traceId: s.traceId,
          spanId: s.spanId,
          parentSpanId: s.parentId ?? undefined,
          name: s.name,
          kind: KIND_MAP[s.kind],
          startTimeUnixNano: nsFromMs(s.startedAt),
          endTimeUnixNano: nsFromMs(s.endedAt ?? s.startedAt),
          attributes: Object.entries(s.attributes).map(([k, v]) => ({
            key: k,
            value: typeof v === "number"
              ? Number.isInteger(v) ? { intValue: v } : { doubleValue: v }
              : typeof v === "boolean" ? { boolValue: v }
              : { stringValue: String(v) },
          })),
          events: s.events.map((e) => ({
            timeUnixNano: nsFromMs(e.time), name: e.name,
            attributes: Object.entries(e.attributes ?? {}).map(([k, v]) => ({
              key: k, value: { stringValue: String(v) },
            })),
          })),
          status: { code: s.status },
        })),
      }],
    })),
  };
}

// Best-effort OTLP export. Returns true on 2xx; failures are swallowed by
// caller (observability must never break the hot path).
export async function exportOtlp(endpoint: string, payload: unknown, headers: Record<string,string> = {}): Promise<boolean> {
  try {
    const res = await fetch(endpoint.replace(/\/+$/, "") + "/v1/traces", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch { return false; }
}
