// TODO Phase 2: PostgREST-style auto REST API.
//
// Per request:
//   1. Validate apikey header (ANON_KEY or SERVICE_ROLE_KEY).
//   2. Parse Authorization bearer; if present, set GUC `pluto.user_id`
//      inside a transaction via `SET LOCAL pluto.user_id = '<uuid>'`.
//   3. Build a Kysely query from URL filters:
//        ?col=eq.x  ?col=gt.10  ?col=in.(a,b)
//        ?select=col1,col2   ?order=col.desc   ?limit=20  ?offset=0
//   4. Run inside the same transaction so RLS applies via current_user_id().
//
// Endpoints (per table <t>):
//   GET    /:table        -> array
//   POST   /:table        -> created row(s)
//   PATCH  /:table?<flt>  -> updated row(s)
//   DELETE /:table?<flt>  -> 204

import type { FastifyInstance } from "fastify";

export async function restRoutes(app: FastifyInstance) {
  app.get("/:table", async (req) => ({ todo: "phase-2", table: (req.params as { table: string }).table }));
}
