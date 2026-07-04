// Phase 59 — Playwright e2e for Data API v4 (RPC, cursor pagination, streaming).
// Skips unless PLUTO_ENABLE_DATA_API_V4=1.
import { test, expect } from "@playwright/test";

const BASE = process.env.PLUTO_API_BASE ?? "http://localhost:8080";
const API_KEY = process.env.PLUTO_API_KEY ?? "dev-anon";
const enabled = process.env.PLUTO_ENABLE_DATA_API_V4 === "1";
const WS = "00000000-0000-0000-0000-000000000059";
const H = { apikey: API_KEY, "x-workspace-id": WS };

test.describe("data api v4 e2e", () => {
  test.skip(!enabled, "PLUTO_ENABLE_DATA_API_V4=1 required");

  test("built-in ping RPC round-trips typed input/output", async ({ request }) => {
    const r = await request.post(`${BASE}/rest/v4/rpc/ping`, {
      headers: { ...H, "content-type": "application/json" },
      data: { msg: "hello" },
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.data.echo).toBe("hello");
    expect(typeof body.data.server_time).toBe("string");
  });

  test("invalid RPC input yields 400 invalid_input", async ({ request }) => {
    const r = await request.post(`${BASE}/rest/v4/rpc/ping`, {
      headers: { ...H, "content-type": "application/json" },
      data: { msg: 12345 },
    });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toBe("invalid_input");
  });

  test("cursor pagination yields the full dataset with stable ordering", async ({ request }) => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 50; i++) {
      const url = new URL(`${BASE}/rest/v4/query`);
      url.searchParams.set("limit", "40");
      if (cursor) url.searchParams.set("cursor", cursor);
      const r = await request.get(url.toString(), { headers: H });
      expect(r.ok()).toBeTruthy();
      const body = await r.json();
      for (const it of body.items) seen.push(it.id);
      if (!body.has_more) break;
      cursor = body.next_cursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual([...seen].sort());
  });

  test("streaming endpoint emits NDJSON with meta and end frames", async ({ request }) => {
    const r = await request.get(`${BASE}/rest/v4/stream?limit=30&chunk=10`, { headers: H });
    expect(r.ok()).toBeTruthy();
    expect(r.headers()["content-type"]).toContain("application/x-ndjson");
    const text = await r.text();
    const frames = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(frames[0].type).toBe("meta");
    expect(frames.filter((f) => f.type === "row").length).toBe(30);
    expect(frames[frames.length - 1].type).toBe("end");
  });
});
