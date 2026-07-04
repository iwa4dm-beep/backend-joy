// Phase 36 — Point-in-time recovery + cross-region backup replication.
//
// Endpoints (gated by PLUTO_ENABLE_PITR=1):
//   GET  /pitr/v1/config                       — WAL archive config
//   POST /pitr/v1/config                       — service-role: update
//   GET  /pitr/v1/snapshots                    — list base backups + WAL segments
//   POST /pitr/v1/snapshots                    — record a snapshot (external agent)
//   POST /pitr/v1/restore                      — schedule PITR to target_time
//   GET  /pitr/v1/restore/:id                  — status
//   GET  /pitr/v1/replicas                     — list cross-region replicas
//   POST /pitr/v1/replicas                     — register a replica target
//   POST /pitr/v1/replicas/:id/verify          — mark verified after checksum
//
// The actual WAL streaming + `pg_basebackup` orchestration is expected
// to run out-of-process (see backend/scripts/backup.sh). This module is
// the control plane + audit log — it records what was captured and where
// it lives so the restore path is deterministic.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { q } from "../../lib/pgraw.js";
import { requireApiKey, requireServiceRole, requireWorkspaceAdmin } from "../../lib/apikey.js";

export const pitrPlugin: FastifyPluginAsync = async (app) => {
  if (process.env.PLUTO_ENABLE_PITR !== "1") {
    app.log.info("[pitr] disabled (set PLUTO_ENABLE_PITR=1 to enable)");
    return;
  }

  app.get("/pitr/v1/config", { preHandler: requireApiKey }, async () => {
    const r = await q(`select enabled, archive_url, retention_days,
                              last_archived_lsn, last_archived_at, updated_at
                       from public.wal_archive_config where id=1`);
    return r.rows[0] ?? { enabled: false };
  });

  app.post("/pitr/v1/config", { preHandler: requireServiceRole }, async (req) => {
    const b = z.object({
      enabled: z.boolean(),
      archive_url: z.string().min(1).max(500),
      retention_days: z.number().int().min(1).max(365),
    }).parse(req.body);
    await q(
      `update public.wal_archive_config
       set enabled=$1, archive_url=$2, retention_days=$3, updated_at=now() where id=1`,
      [b.enabled, b.archive_url, b.retention_days]);
    return { ok: true };
  });

  app.get("/pitr/v1/snapshots", { preHandler: requireApiKey }, async (req) => {
    const { limit = "100" } = (req.query ?? {}) as { limit?: string };
    const r = await q(
      `select id, taken_at, lsn, bytes, storage_url, kind, verified_at
       from public.pitr_snapshots order by taken_at desc limit ${Math.min(1000, Number(limit) || 100)}`);
    return { snapshots: r.rows };
  });

  app.post("/pitr/v1/snapshots", { preHandler: requireServiceRole }, async (req) => {
    const b = z.object({
      lsn: z.string().max(64).optional(),
      bytes: z.number().int().nonnegative().optional(),
      storage_url: z.string().min(1).max(500),
      kind: z.enum(["basebackup", "wal_segment"]).default("basebackup"),
      notes: z.string().max(500).optional(),
    }).parse(req.body);
    const r = await q<{ id: string }>(
      `insert into public.pitr_snapshots(lsn, bytes, storage_url, kind, notes)
       values ($1,$2,$3,$4,$5) returning id`,
      [b.lsn ?? null, b.bytes ?? null, b.storage_url, b.kind, b.notes ?? null]);
    // Also update the archive config high-water mark for WAL segments.
    if (b.kind === "wal_segment" && b.lsn) {
      await q(`update public.wal_archive_config set last_archived_lsn=$1, last_archived_at=now() where id=1`, [b.lsn]);
    }
    return { id: r.rows[0].id };
  });

  app.post("/pitr/v1/restore", { preHandler: requireWorkspaceAdmin }, async (req, reply) => {
    const b = z.object({
      target_time: z.string().datetime(),
      dry_run: z.boolean().default(true),
    }).parse(req.body);
    // Pick most recent basebackup on/before target_time.
    const base = await q<{ id: string; taken_at: string }>(
      `select id, taken_at from public.pitr_snapshots
       where kind='basebackup' and taken_at <= $1::timestamptz
       order by taken_at desc limit 1`, [b.target_time]);
    if (!base.rows[0]) { reply.code(400); return { error: "no_basebackup_before_target" }; }
    const r = await q<{ id: string }>(
      `insert into public.pitr_restores(target_time, base_snapshot_id, dry_run, requested_by, status)
       values ($1::timestamptz, $2::uuid, $3, $4::uuid, 'pending') returning id`,
      [b.target_time, base.rows[0].id, b.dry_run, req.auth?.user?.sub ?? null]);
    // In prod: enqueue a job that runs pg_basebackup restore + WAL replay.
    // Here we short-circuit dry_run to done so the UI can flow-test.
    if (b.dry_run) {
      await q(`update public.pitr_restores set status='done', finished_at=now() where id=$1::uuid`, [r.rows[0].id]);
    }
    return { id: r.rows[0].id, base_snapshot_id: base.rows[0].id };
  });

  app.get("/pitr/v1/restore/:id", { preHandler: requireApiKey }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const r = await q(
      `select id, target_time, base_snapshot_id, status, dry_run, started_at, finished_at, error
       from public.pitr_restores where id=$1::uuid`, [id]);
    if (!r.rows[0]) { reply.code(404); return { error: "not_found" }; }
    return r.rows[0];
  });

  app.get("/pitr/v1/replicas", { preHandler: requireApiKey }, async () => {
    const r = await q(
      `select id, source_id, source_kind, region, target_url, bytes,
              replicated_at, verified_at, status, error, created_at
       from public.backup_replicas order by created_at desc limit 500`);
    return { replicas: r.rows };
  });

  app.post("/pitr/v1/replicas", { preHandler: requireServiceRole }, async (req) => {
    const b = z.object({
      source_id: z.string().uuid(),
      source_kind: z.enum(["pitr", "export"]),
      region: z.string().min(1).max(80),
      target_url: z.string().min(1).max(500),
      bytes: z.number().int().nonnegative().optional(),
      status: z.enum(["pending", "ok", "failed"]).default("pending"),
      error: z.string().max(500).optional(),
    }).parse(req.body);
    const r = await q<{ id: string }>(
      `insert into public.backup_replicas
        (source_id, source_kind, region, target_url, bytes, status, error, replicated_at)
       values ($1::uuid, $2, $3, $4, $5, $6, $7,
               case when $6='ok' then now() else null end)
       returning id`,
      [b.source_id, b.source_kind, b.region, b.target_url,
       b.bytes ?? null, b.status, b.error ?? null]);
    return { id: r.rows[0].id };
  });

  app.post("/pitr/v1/replicas/:id/verify", { preHandler: requireServiceRole }, async (req) => {
    const id = (req.params as { id: string }).id;
    await q(`update public.backup_replicas set verified_at=now(), status='ok' where id=$1::uuid`, [id]);
    return { ok: true };
  });
};
