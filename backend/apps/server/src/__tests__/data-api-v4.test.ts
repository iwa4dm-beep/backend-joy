// Phase 59 unit tests — RPC registry, cursor pagination, streaming JSON.
import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { registerRpc, invokeRpc, listRpcs, emitOpenApi, resetRpcRegistry } from "../lib/rpc-registry.js";
import { paginate, encodeCursor, decodeCursor } from "../lib/cursor-pagination.js";
import { parseNdjson } from "../lib/stream-json.js";

describe("rpc-registry", () => {
  beforeEach(() => resetRpcRegistry());

  it("validates input and output against Zod schemas", async () => {
    registerRpc({
      workspace_id: "w1",
      name: "add",
      input: z.object({ a: z.number(), b: z.number() }),
      output: z.object({ sum: z.number() }),
      handler: async ({ a, b }) => ({ sum: a + b }),
    });
    const ok = await invokeRpc("w1", "add", { a: 2, b: 3 });
    expect(ok).toEqual({ ok: true, data: { sum: 5 } });
    const bad = await invokeRpc("w1", "add", { a: "x" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("invalid_input");
  });

  it("isolates rpcs per workspace", async () => {
    registerRpc({
      workspace_id: "w1", name: "only_w1",
      input: z.object({}), output: z.object({ v: z.number() }),
      handler: async () => ({ v: 1 }),
    });
    expect(listRpcs("w1")).toHaveLength(1);
    expect(listRpcs("w2")).toHaveLength(0);
    const miss = await invokeRpc("w2", "only_w1", {});
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.error).toBe("rpc_not_found");
  });

  it("catches handler that returns an invalid output shape", async () => {
    registerRpc({
      workspace_id: "w1", name: "bad_out",
      input: z.object({}), output: z.object({ n: z.number() }),
      // deliberately wrong type
      handler: async () => ({ n: "oops" as unknown as number }),
    });
    const res = await invokeRpc("w1", "bad_out", {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_output");
  });

  it("emits OpenAPI with paths for each registered RPC", () => {
    registerRpc({
      workspace_id: "w1", name: "hello", description: "say hi",
      input: z.object({ name: z.string() }),
      output: z.object({ greeting: z.string() }),
      handler: async ({ name }) => ({ greeting: `hi ${name}` }),
    });
    const doc = emitOpenApi("w1") as { paths: Record<string, unknown> };
    expect(doc.paths["/rest/v4/rpc/hello"]).toBeDefined();
  });
});

describe("cursor-pagination", () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    id: `id_${String(i).padStart(3, "0")}`,
    created_at: new Date(2026, 0, 1, 0, i).toISOString(),
    title: `t${i}`,
  }));
  const spec = { order_by: "created_at", direction: "asc" as const, id_column: "id" };

  it("returns stable pages that fully cover the dataset without duplicates", () => {
    const seen = new Set<string>();
    let cursor: string | undefined;
    let iter = 0;
    while (iter++ < 20) {
      const page = paginate(rows, spec, { limit: 7, cursor });
      for (const r of page.items) {
        expect(seen.has(r.id)).toBe(false);
        seen.add(r.id);
      }
      if (!page.has_more) break;
      cursor = page.next_cursor!;
    }
    expect(seen.size).toBe(rows.length);
  });

  it("rejects a cursor bound to a different spec", () => {
    const c = encodeCursor(rows[0], spec);
    expect(() => decodeCursor(c, { ...spec, direction: "desc" })).toThrow(/cursor_spec_mismatch/);
  });

  it("handles descending direction and duplicate order keys via id tiebreak", () => {
    const dupes = [
      { id: "a", ts: 1 }, { id: "b", ts: 1 }, { id: "c", ts: 1 },
      { id: "d", ts: 2 },
    ];
    const s = { order_by: "ts", direction: "asc" as const, id_column: "id" };
    const p1 = paginate(dupes, s, { limit: 2 });
    expect(p1.items.map((r) => r.id)).toEqual(["a", "b"]);
    const p2 = paginate(dupes, s, { limit: 2, cursor: p1.next_cursor! });
    expect(p2.items.map((r) => r.id)).toEqual(["c", "d"]);
    expect(p2.has_more).toBe(false);
  });
});

describe("stream-json helpers", () => {
  it("parses a well-formed NDJSON body", () => {
    const body = [
      JSON.stringify({ type: "meta", total: 2 }),
      JSON.stringify({ type: "row", data: { id: 1 } }),
      JSON.stringify({ type: "row", data: { id: 2 } }),
      JSON.stringify({ type: "end", count: 2, next_cursor: null }),
      "",
    ].join("\n");
    const frames = parseNdjson(body);
    expect(frames[0].type).toBe("meta");
    expect(frames.filter((f) => f.type === "row")).toHaveLength(2);
    expect(frames[frames.length - 1].type).toBe("end");
  });
});
