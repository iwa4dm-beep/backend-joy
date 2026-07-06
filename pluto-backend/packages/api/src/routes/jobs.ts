// Job tokens: mint / list / revoke short-lived server-to-server credentials.
// Workers authenticate with `X-Job-Token: pjt_...` against /jobs/v1/exec or
// /jobs/v1/rpc/<job>. Token secret is only visible once at mint time; the DB
// stores a SHA-256 hash. Superadmin or service_role required to manage tokens.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { getSql } from '../db/pool.js';
import type { Config } from '../config.js';
import { requireAuth, type Actor } from '../util/auth.js';
import { logAudit } from '../audit/logger.js';

const MINT_TTL_MIN = 60;                    // 1 min
const MINT_TTL_MAX = 60 * 60 * 24 * 365;    // 1 year

const mintBody = z.object({
  name: z.string().min(1).max(120).regex(/^[A-Za-z0-9._-]+$/, 'name must be [A-Za-z0-9._-]'),
  scope: z.array(z.string().min(1).max(120)).max(64).default([]),
  ttl_seconds: z.number().int().min(MINT_TTL_MIN).max(MINT_TTL_MAX),
});

const execBody = z.object({
  sql: z.string().min(1).max(50_000),
  params: z.array(z.any()).max(1000).default([]),
});

const rpcBody = z.object({
  args: z.record(z.any()).default({}),
});

function requireAdmin(actor: Actor) {
  if (actor.isSuperadmin || actor.role === 'service_role') return;
  const e: Error & { statusCode?: number } = new Error('Forbidden — superadmin required');
  e.statusCode = 403;
  throw e;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function newTokenSecret(): { raw: string; prefix: string; hash: string } {
  const raw = 'pjt_' + randomBytes(32).toString('base64url');
  return { raw, prefix: raw.slice(0, 12), hash: hashToken(raw) };
}

type JobTokenRow = {
  id: string;
  name: string;
  scope: string[];
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
};

async function verifyJobToken(req: FastifyRequest, cfg: Config): Promise<JobTokenRow> {
  const raw = req.headers['x-job-token'];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token || !token.startsWith('pjt_')) {
    const e: Error & { statusCode?: number } = new Error('Missing or malformed X-Job-Token');
    e.statusCode = 401;
    throw e;
  }
  const sql = getSql(cfg);
  const [row] = await sql<JobTokenRow[]>`
    select id, name, scope, created_at, expires_at, revoked_at, last_used_at, use_count
    from admin.job_tokens
    where token_hash = ${hashToken(token)}
    limit 1`;
  if (!row) { const e: Error & { statusCode?: number } = new Error('Invalid job token'); e.statusCode = 401; throw e; }
  if (row.revoked_at) { const e: Error & { statusCode?: number } = new Error('Token revoked'); e.statusCode = 401; throw e; }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const e: Error & { statusCode?: number } = new Error('Token expired'); e.statusCode = 401; throw e;
  }
  await sql`update admin.job_tokens
              set last_used_at = now(), use_count = use_count + 1
              where id = ${row.id}`;
  return row;
}

export async function jobsRoutes(app: FastifyInstance, cfg: Config) {
  // ---------- Token management (admin UI) ----------
  app.get('/jobs/v1/tokens', async (req) => {
    const actor = await requireAuth(req, cfg);
    requireAdmin(actor);
    return getSql(cfg)<JobTokenRow[]>`
      select id, name, scope, created_at, expires_at, revoked_at, last_used_at, use_count
      from admin.job_tokens
      order by revoked_at nulls first, created_at desc
      limit 500`;
  });

  app.post('/jobs/v1/tokens', async (req, reply) => {
    const actor = await requireAuth(req, cfg);
    requireAdmin(actor);
    const body = mintBody.parse(req.body);
    const secret = newTokenSecret();
    const expiresAt = new Date(Date.now() + body.ttl_seconds * 1000).toISOString();
    const sql = getSql(cfg);
    const [row] = await sql<{ id: string; name: string; expires_at: string }[]>`
      insert into admin.job_tokens (name, scope, token_hash, token_prefix, created_by, expires_at)
      values (${body.name}, ${body.scope as unknown as string[]},
              ${secret.hash}, ${secret.prefix}, ${actor.userId}, ${expiresAt})
      returning id, name, expires_at`;
    await logAudit(cfg, {
      actor_id: actor.userId,
      action: 'job_token.mint',
      target: row.id,
      detail: { name: body.name, scope: body.scope, ttl_seconds: body.ttl_seconds, prefix: secret.prefix },
    });
    reply.code(201).send({ id: row.id, name: row.name, expires_at: row.expires_at, token: secret.raw });
  });

  app.delete('/jobs/v1/tokens/:id', async (req, reply) => {
    const actor = await requireAuth(req, cfg);
    requireAdmin(actor);
    const { id } = req.params as { id: string };
    const sql = getSql(cfg);
    const [row] = await sql<{ name: string }[]>`
      update admin.job_tokens
        set revoked_at = coalesce(revoked_at, now())
        where id = ${id}
      returning name`;
    if (!row) { reply.code(404).send({ error: 'not_found' }); return; }
    await logAudit(cfg, {
      actor_id: actor.userId,
      action: 'job_token.revoke',
      target: id,
      detail: { name: row.name },
    });
    reply.code(204).send();
  });

  // ---------- Worker endpoints ----------
  // /jobs/v1/exec — arbitrary SQL. Requires a token whose scope is empty
  // (empty scope = /exec only, per dashboard docs).
  app.post('/jobs/v1/exec', async (req, reply) => {
    const tok = await verifyJobToken(req, cfg);
    if (tok.scope.length > 0) {
      reply.code(403).send({ error: 'scope_denied', message: 'Token has named scope; /exec requires empty scope.' });
      return;
    }
    const body = execBody.parse(req.body);
    const sql = getSql(cfg);
    try {
      const rows = await sql.unsafe(body.sql, body.params as unknown[]);
      return { rows, row_count: Array.isArray(rows) ? rows.length : 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.code(400).send({ error: 'sql_error', message: msg });
    }
  });

  // /jobs/v1/rpc/:job — call a named Postgres function. Scope must include :job.
  app.post('/jobs/v1/rpc/:job', async (req, reply) => {
    const tok = await verifyJobToken(req, cfg);
    const { job } = req.params as { job: string };
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(job)) {
      reply.code(400).send({ error: 'bad_job_name' });
      return;
    }
    if (!tok.scope.includes(job)) {
      reply.code(403).send({ error: 'scope_denied', message: `Token scope does not include "${job}"` });
      return;
    }
    const body = rpcBody.parse(req.body ?? {});
    const sql = getSql(cfg);
    try {
      // Public-schema RPC only (mirrors PostgREST /rpc/:fn behavior).
      const rows = await sql.unsafe(`select * from public.${job}($1::jsonb)`, [body.args as unknown]);
      return { rows, row_count: Array.isArray(rows) ? rows.length : 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.code(400).send({ error: 'rpc_error', message: msg });
    }
  });
}
