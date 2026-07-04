// Phase 61 — Vector v3 plugin.
//
// Endpoints (gated by PLUTO_ENABLE_VECTOR_V3=1):
//   POST /vec/v3/hnsw/config       — set per-index HNSW params
//   GET  /vec/v3/hnsw/config       — list configs for workspace
//   GET  /vec/v3/hnsw/:index/ddl   — emit CREATE INDEX DDL
//   POST /vec/v3/hybrid/search     — hybrid rerank over supplied candidates
//   POST /vec/v3/embeddings/stream — NDJSON stream of per-input vectors

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getHnswConfig, listHnswConfigs, setHnswConfig, ddlFor, HnswValidationError } from "../../lib/hnsw-tuning.js";
import { hybridRerank } from "../../lib/hybrid-rerank.js";
import { embedStream } from "../../lib/streaming-embeddings.js";
import { streamNdjson } from "../../lib/stream-json.js";

const enabled = process.env.PLUTO_ENABLE_VECTOR_V3 === "1";

export async function vectorV3Plugin(app: FastifyInstance) {
  if (!enabled) return;

  app.addHook("preHandler", async (req, reply) => {
    if (!req.headers["x-workspace-id"]) { reply.code(400); return { error: "missing_workspace" }; }
  });

  // ---- HNSW tuning --------------------------------------------------------
  app.post("/vec/v3/hnsw/config", async (req, reply) => {
    const ws = req.headers["x-workspace-id"] as string;
    const b = z.object({
      index_name: z.string().regex(/^[a-z_][a-z0-9_]*$/i).max(63),
      m: z.number().int().optional(),
      ef_construction: z.number().int().optional(),
      ef_search: z.number().int().optional(),
      metric: z.enum(["cosine", "l2", "ip"]).optional(),
    }).safeParse(req.body);
    if (!b.success) { reply.code(400); return { error: "bad_request", issues: b.error.issues }; }
    try {
      const { index_name, ...params } = b.data;
      return { config: setHnswConfig(ws, index_name, params) };
    } catch (e) {
      if (e instanceof HnswValidationError) { reply.code(400); return { error: e.message }; }
      throw e;
    }
  });

  app.get("/vec/v3/hnsw/config", async (req) => {
    const ws = req.headers["x-workspace-id"] as string;
    return { configs: listHnswConfigs(ws) };
  });

  app.get("/vec/v3/hnsw/:index/ddl", async (req) => {
    const ws = req.headers["x-workspace-id"] as string;
    const index = (req.params as { index: string }).index;
    const q = z.object({ table: z.string(), column: z.string().default("embedding") }).safeParse(req.query);
    if (!q.success) return { error: "bad_request" };
    return { ddl: ddlFor(getHnswConfig(ws, index), q.data.table, q.data.column) };
  });

  // ---- hybrid search ------------------------------------------------------
  app.post("/vec/v3/hybrid/search", async (req, reply) => {
    const b = z.object({
      candidates: z.array(z.object({
        id: z.string(),
        vector_score: z.number().optional(),
        lexical_score: z.number().optional(),
        payload: z.unknown().optional(),
      })).max(10_000),
      strategy: z.enum(["linear", "rrf"]).default("linear"),
      alpha: z.number().min(0).max(1).optional(),
      k: z.number().int().min(1).max(1000).optional(),
      limit: z.number().int().min(1).max(1000).default(50),
    }).safeParse(req.body);
    if (!b.success) { reply.code(400); return { error: "bad_request", issues: b.error.issues }; }
    return { results: hybridRerank(b.data.candidates, b.data) };
  });

  // ---- streaming embeddings ----------------------------------------------
  app.post("/vec/v3/embeddings/stream", async (req, reply) => {
    const b = z.object({
      inputs: z.array(z.string().min(1).max(50_000)).min(1).max(5000),
      batch_size: z.number().int().min(1).max(100).default(32),
    }).safeParse(req.body);
    if (!b.success) { reply.code(400); return { error: "bad_request", issues: b.error.issues }; }
    await streamNdjson(reply, embedStream(b.data.inputs, { batch_size: b.data.batch_size }), {
      schema: "embeddings",
      total: b.data.inputs.length,
    });
  });
}
