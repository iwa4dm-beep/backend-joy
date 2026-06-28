// TODO Phase 2: implement auth routes.
//
// POST /sign-up           { email, password }       -> { user, session }
// POST /sign-in           { email, password }       -> { user, session }
// POST /refresh           { refresh_token }         -> { session }
// POST /sign-out          (bearer)                  -> { ok }
// POST /reset/request     { email }                 -> 204
// POST /reset/confirm     { token, new_password }   -> { ok }
// POST /verify-email      { token }                 -> { ok }
// GET  /user              (bearer)                  -> { user }
//
// Implementation notes:
// - argon2id for password_hash (memoryCost: 19456, timeCost: 2)
// - Access token: jose HS256, claims { sub, role, iat, exp }
// - Refresh token: random 256-bit, store SHA-256 hash in refresh_tokens
// - Rate-limit /sign-in by IP+email (5/min)
// - Emit logs to api_logs

import type { FastifyInstance } from "fastify";

export async function authRoutes(app: FastifyInstance) {
  app.post("/sign-in", async () => ({ todo: "phase-2" }));
  app.post("/sign-up", async () => ({ todo: "phase-2" }));
  app.post("/refresh", async () => ({ todo: "phase-2" }));
  app.post("/sign-out", async () => ({ todo: "phase-2" }));
  app.get("/user", async () => ({ todo: "phase-2" }));
}
