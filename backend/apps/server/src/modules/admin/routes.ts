// TODO Phase 3: Admin API (requires SERVICE_ROLE_KEY).
//
//   GET    /users                 -> list users
//   PATCH  /users/:id  { role }   -> set role
//   DELETE /users/:id             -> delete
//   GET    /tables                -> introspect information_schema
//   POST   /sql        { sql }    -> run arbitrary SQL (admin-only)
//   GET    /logs?source=&level=   -> stream from api_logs

import type { FastifyInstance } from "fastify";

export async function adminRoutes(app: FastifyInstance) {
  app.get("/users", async () => ({ todo: "phase-3" }));
}
