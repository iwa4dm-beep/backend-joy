// Phase 61 unit tests — hybrid rerank, HNSW tuning, streaming embeddings.
import { describe, it, expect, beforeEach } from "vitest";
import { hybridRerank, type Candidate } from "../lib/hybrid-rerank.js";
import { setHnswConfig, getHnswConfig, ddlFor, HnswValidationError, _resetHnswForTests } from "../lib/hnsw-tuning.js";
import { embedStream, _resetEmbedderForTests, setEmbedder } from "../lib/streaming-embeddings.js";

const cands: Candidate[] = [
  { id: "a", vector_score: 0.90, lexical_score: 0.10 },
  { id: "b", vector_score: 0.20, lexical_score: 0.95 },
  { id: "c", vector_score: 0.60, lexical_score: 0.60 },
  { id: "d", vector_score: 0.60, lexical_score: 0.60 }, // tie with c → id tiebreak
];

describe("hybrid rerank — linear", () => {
  it("respects alpha weighting toward vector at alpha=1", () => {
    const r = hybridRerank(cands, { strategy: "linear", alpha: 1 });
    expect(r[0].id).toBe("a");
  });
  it("respects alpha weighting toward lexical at alpha=0", () => {
    const r = hybridRerank(cands, { strategy: "linear", alpha: 0 });
    expect(r[0].id).toBe("b");
  });
  it("ties break by id, then insertion order (stable)", () => {
    const r = hybridRerank(cands, { strategy: "linear", alpha: 0.5 });
    const cRank = r.findIndex((x) => x.id === "c");
    const dRank = r.findIndex((x) => x.id === "d");
    expect(cRank).toBeLessThan(dRank);
  });
  it("respects limit", () => {
    const r = hybridRerank(cands, { strategy: "linear", limit: 2 });
    expect(r).toHaveLength(2);
  });
});

describe("hybrid rerank — RRF", () => {
  it("combines rank positions from both signals", () => {
    const r = hybridRerank(cands, { strategy: "rrf", k: 5 });
    expect(r.map((x) => x.id)).toContain("a");
    expect(r.map((x) => x.id)).toContain("b");
    // The middle "c/d" ties should still be deterministically ordered.
    const ids = r.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("HNSW per-tenant tuning", () => {
  beforeEach(() => _resetHnswForTests());
  it("stores per-workspace params without cross-tenant leakage", () => {
    setHnswConfig("w1", "docs_idx", { m: 32, ef_construction: 400 });
    setHnswConfig("w2", "docs_idx", { m: 8 });
    expect(getHnswConfig("w1", "docs_idx").m).toBe(32);
    expect(getHnswConfig("w2", "docs_idx").m).toBe(8);
  });
  it("rejects out-of-range parameters", () => {
    expect(() => setHnswConfig("w", "i", { m: 200 })).toThrow(HnswValidationError);
    expect(() => setHnswConfig("w", "i", { ef_construction: 2 })).toThrow(HnswValidationError);
  });
  it("emits DDL that includes m and ef_construction", () => {
    const c = setHnswConfig("w", "documents_embedding_idx", { m: 24, ef_construction: 256, metric: "cosine" });
    const ddl = ddlFor(c, "documents", "embedding");
    expect(ddl).toMatch(/m = 24/);
    expect(ddl).toMatch(/ef_construction = 256/);
    expect(ddl).toMatch(/vector_cosine_ops/);
  });
});

describe("streaming embeddings", () => {
  beforeEach(() => _resetEmbedderForTests());
  it("emits one embedding per input, in order", async () => {
    const inputs = ["alpha", "beta", "gamma", "delta"];
    const seen: number[] = [];
    for await (const row of embedStream(inputs, { batch_size: 2 })) {
      expect(row.embedding.length).toBeGreaterThan(0);
      seen.push(row.index);
    }
    expect(seen).toEqual([0, 1, 2, 3]);
  });
  it("uses a custom embedder when injected", async () => {
    setEmbedder(async (batch) => ({
      indices: batch.map((_, i) => i),
      vectors: batch.map(() => [1, 2, 3]),
      model: "test/model",
    }));
    const rows: unknown[] = [];
    for await (const row of embedStream(["x", "y"])) rows.push(row);
    expect(rows).toHaveLength(2);
    expect((rows[0] as { model: string }).model).toBe("test/model");
  });
});
