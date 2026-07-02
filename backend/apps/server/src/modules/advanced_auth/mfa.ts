// MFA (TOTP) implementation — Phase 15.1.
// Endpoints mounted under /auth/v1 by advanced_auth/plugin.ts.
//
// Design: enrollment mints a 160-bit shared secret, stores the AES-GCM
// ciphertext in `auth_mfa_factors`, returns the otpauth URL + plaintext
// base32 secret exactly once. Verify uses ±1 step tolerance. Challenge
// endpoints let an admin session step-up during high-risk actions.
import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { q } from "../../lib/pgraw.js";
import { aesEncrypt, aesDecrypt } from "../../lib/aes.js";
import { generateTotpSecret, verifyTotp, otpauthUrl } from "../../lib/totp.js";
import { MFA_ISSUER_DEFAULT } from "./types.js";

function requireUser(req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply): string | null {
  const u = req.auth?.user;
  if (!u) { reply.code(401).send({ error: "auth_required" }); return null; }
  return u.sub;
}

export function mountMfa(app: FastifyInstance) {
  app.get("/auth/v1/mfa/factors", async (req, reply) => {
    const uid = requireUser(req, reply); if (!uid) return;
    const r = await q<{ id: string; factor_type: string; friendly_name: string | null;
      status: string; created_at: Date; last_used_at: Date | null }>(
      `select id, factor_type, friendly_name, status, created_at, last_used_at
       from public.auth_mfa_factors where user_id=$1 order by created_at desc`, [uid]);
    return { factors: r.rows };
  });

  app.post("/auth/v1/mfa/enroll", async (req, reply) => {
    const uid = requireUser(req, reply); if (!uid) return;
    const body = z.object({ friendly_name: z.string().max(80).optional() }).parse(req.body ?? {});
    const { secret_b32, secret_bytes } = generateTotpSecret();
    const { ct, nonce } = aesEncrypt(secret_bytes);
    const ws = req.auth!.workspaceId;
    const email = req.auth!.user!.email;
    const r = await q<{ id: string }>(
      `insert into public.auth_mfa_factors
         (user_id, workspace_id, factor_type, friendly_name, secret_ct, secret_nonce, status)
       values ($1,$2,'totp',$3,$4,$5,'unverified') returning id`,
      [uid, ws, body.friendly_name ?? "Authenticator", ct, nonce]);
    return {
      factor_id: r.rows[0]!.id,
      factor_type: "totp",
      secret: secret_b32,
      otpauth_url: otpauthUrl(secret_b32, email, MFA_ISSUER_DEFAULT),
    };
  });

  app.post("/auth/v1/mfa/verify", async (req, reply) => {
    const uid = requireUser(req, reply); if (!uid) return;
    const { factor_id, code } = z.object({ factor_id: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const r = await q<{ secret_ct: Buffer; secret_nonce: Buffer; status: string }>(
      `select secret_ct, secret_nonce, status from public.auth_mfa_factors
       where id=$1 and user_id=$2`, [factor_id, uid]);
    const row = r.rows[0]; if (!row) return reply.code(404).send({ error: "not_found" });
    if (row.status === "revoked") return reply.code(400).send({ error: "revoked" });
    if (!verifyTotp(aesDecrypt(row.secret_ct, row.secret_nonce), code))
      return reply.code(400).send({ error: "invalid_code" });
    await q(`update public.auth_mfa_factors set status='verified', last_used_at=now() where id=$1`, [factor_id]);
    return { ok: true };
  });

  app.post("/auth/v1/mfa/challenge", async (req, reply) => {
    const uid = requireUser(req, reply); if (!uid) return;
    const { factor_id } = z.object({ factor_id: z.string().uuid() }).parse(req.body);
    const exp = new Date(Date.now() + 5 * 60_000);
    const r = await q<{ id: string }>(
      `insert into public.auth_mfa_challenges (factor_id, user_id, expires_at)
       values ($1,$2,$3) returning id`, [factor_id, uid, exp]);
    return { challenge_id: r.rows[0]!.id, expires_at: exp.toISOString() };
  });

  app.post("/auth/v1/mfa/challenge/verify", async (req, reply) => {
    const uid = requireUser(req, reply); if (!uid) return;
    const { challenge_id, code } = z.object({ challenge_id: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const r = await q<{ factor_id: string; expires_at: Date; consumed_at: Date | null;
      secret_ct: Buffer; secret_nonce: Buffer }>(
      `select c.factor_id, c.expires_at, c.consumed_at, f.secret_ct, f.secret_nonce
       from public.auth_mfa_challenges c
       join public.auth_mfa_factors f on f.id=c.factor_id
       where c.id=$1 and c.user_id=$2`, [challenge_id, uid]);
    const row = r.rows[0]; if (!row) return reply.code(404).send({ error: "not_found" });
    if (row.consumed_at) return reply.code(400).send({ error: "consumed" });
    if (row.expires_at.getTime() < Date.now()) return reply.code(400).send({ error: "expired" });
    if (!verifyTotp(aesDecrypt(row.secret_ct, row.secret_nonce), code))
      return reply.code(400).send({ error: "invalid_code" });
    await q(`update public.auth_mfa_challenges set consumed_at=now() where id=$1`, [challenge_id]);
    await q(`update public.auth_mfa_factors set last_used_at=now() where id=$1`, [row.factor_id]);
    return { ok: true, verified_at: new Date().toISOString() };
  });

  app.delete("/auth/v1/mfa/factors/:id", async (req, reply) => {
    const uid = requireUser(req, reply); if (!uid) return;
    const { id } = req.params as { id: string };
    const r = await q(`update public.auth_mfa_factors set status='revoked'
                       where id=$1 and user_id=$2`, [id, uid]);
    if (r.rowCount === 0) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.post("/auth/v1/mfa/recovery-codes", async (req, reply) => {
    const uid = requireUser(req, reply); if (!uid) return;
    // Invalidate previous codes and mint 10 fresh single-use codes.
    await q(`update public.auth_recovery_codes set consumed_at=now()
             where user_id=$1 and consumed_at is null`, [uid]);
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const c = randomBytes(5).toString("hex"); // 10-char hex
      codes.push(c);
      const hash = await argon2.hash(c, { type: argon2.argon2id });
      await q(`insert into public.auth_recovery_codes (user_id, code_hash) values ($1,$2)`, [uid, hash]);
    }
    return { codes };
  });
}
