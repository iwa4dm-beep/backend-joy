import type { FastifyInstance } from 'fastify';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { pingDb } from '../db/pool.js';
import { getS3 } from '../storage/s3.js';
import type { Config } from '../config.js';

const startTime = Date.now();

type CheckResult = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  [k: string]: unknown;
};

async function checkPostgres(cfg: Config): Promise<CheckResult> {
  const r = await pingDb(cfg);
  return { ...r, driver: 'postgres.js', url: redactUrl(cfg.DATABASE_URL) };
}

async function checkS3(cfg: Config): Promise<CheckResult> {
  const start = Date.now();
  try {
    const s3 = getS3(cfg);
    await s3.send(new HeadBucketCommand({ Bucket: cfg.S3_BUCKET }));
    return {
      ok: true,
      latencyMs: Date.now() - start,
      endpoint: cfg.S3_ENDPOINT ?? 'aws',
      bucket: cfg.S3_BUCKET,
      region: cfg.S3_REGION,
    };
  } catch (e: any) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: e?.message ?? String(e),
      code: e?.name ?? e?.Code,
      endpoint: cfg.S3_ENDPOINT ?? 'aws',
      bucket: cfg.S3_BUCKET,
      region: cfg.S3_REGION,
    };
  }
}

function redactUrl(u: string): string {
  try {
    const p = new URL(u);
    if (p.password) p.password = '***';
    return p.toString();
  } catch {
    return 'invalid-url';
  }
}

export async function healthRoutes(app: FastifyInstance, cfg: Config) {
  // Liveness — process alive
  app.get('/livez', async () => ({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    ts: new Date().toISOString(),
  }));

  // Readiness — dependencies reachable
  app.get('/readyz', async (_req, reply) => {
    const checks: Record<string, any> = {};

    checks.db = await pingDb(cfg);

    // JWT sign+verify round-trip
    try {
      const token = await app.jwt.sign({ probe: true }, { expiresIn: '10s' });
      await app.jwt.verify(token);
      checks.jwt = { ok: true };
    } catch (e: any) {
      checks.jwt = { ok: false, error: e.message };
    }

    const healthy = Object.values(checks).every((c: any) => c.ok);
    reply.code(healthy ? 200 : 503);
    return { status: healthy ? 'ready' : 'degraded', checks, ts: new Date().toISOString() };
  });

  // Detailed per-dependency health — Postgres + S3/MinIO breakdown
  app.get('/health/deps', async (_req, reply) => {
    const [postgresCheck, s3Check] = await Promise.all([checkPostgres(cfg), checkS3(cfg)]);
    const deps = { postgres: postgresCheck, s3: s3Check };
    const healthy = postgresCheck.ok && s3Check.ok;
    reply.code(healthy ? 200 : 503);
    return {
      status: healthy ? 'ok' : 'degraded',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      ts: new Date().toISOString(),
      deps,
    };
  });

  // Public health snapshot for /api/pluto/status probes
  app.get('/healthz', async () => ({ status: 'ok', service: 'pluto-api', ts: new Date().toISOString() }));

  // Auth v1 health (SDK / Lovable dashboard probe)
  app.get('/auth/v1/health', async () => ({ status: 'ok', service: 'pluto-auth', ts: new Date().toISOString() }));
}
