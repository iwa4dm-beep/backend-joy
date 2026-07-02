// Runs pending SQL migrations against DATABASE_URL, mirroring the strategy the
// dashboard exposes (dry-run first, then apply, tracked in a ledger).
//
//   tsx src/db/migrate.ts             # apply pending
//   tsx src/db/migrate.ts --dry-run   # execute inside a transaction and roll back
//   tsx src/db/migrate.ts --plan      # list pending files without touching the DB
//
// When run from boot.sh (PLUTO_BOOT_ACTOR=boot) we ALSO acquire a Postgres
// advisory lock so that only one replica performs migrations at a time,
// and we record the outcome into public.migration_boot_runs so the admin
// dashboard can display the last deploy's plan / drift / applied set.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { env } from "../config.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");

// Stable 63-bit key derived from a string; both replicas hash to the same
// value so `pg_try_advisory_lock` serializes them.
const ADVISORY_KEY = 0x504c55544f4d4752n & 0x7fffffffffffffffn; // "PLUTOMGR" mask

type Mode = "apply" | "dry-run" | "plan";

function parseMode(argv: string[]): Mode {
  if (argv.includes("--dry-run")) return "dry-run";
  if (argv.includes("--plan")) return "plan";
  return "apply";
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

const isBoot = (process.env.PLUTO_BOOT_ACTOR ?? "").toLowerCase() === "boot";

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  // Only one replica may run pending migrations at a time. Others wait
  // via a shared advisory lock — the wait is bounded because they will
  // find nothing pending once the leader finishes.
  let lockAcquired = true;
  if (isBoot && mode !== "plan") {
    const r = await client.query<{ ok: boolean }>(
      "select pg_try_advisory_lock($1::bigint) as ok",
      [ADVISORY_KEY.toString()],
    );
    lockAcquired = r.rows[0]?.ok === true;
    if (!lockAcquired) {
      console.log(`[migrate] another instance holds the advisory lock — waiting…`);
      await client.query("select pg_advisory_lock($1::bigint)", [ADVISORY_KEY.toString()]);
      lockAcquired = true;
    }
    console.log(`[migrate] advisory lock acquired (key=${ADVISORY_KEY.toString()})`);
  }

  const runStart = Date.now();
  const pendingList: string[] = [];
  const appliedList: string[] = [];
  const failedList: { version: string; error: string }[] = [];
  const driftList: string[] = [];
  let bootRunErr: string | null = null;

  try {
    await client.query(`
      create table if not exists _pluto_migrations (
        name        text primary key,
        checksum    text not null,
        applied_at  timestamptz not null default now(),
        duration_ms integer
      );
      alter table _pluto_migrations
        add column if not exists checksum text,
        add column if not exists duration_ms integer;
    `);

    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Map<string, string>();
    const rows = await client.query<{ name: string; checksum: string | null }>(
      "select name, checksum from _pluto_migrations"
    );
    for (const r of rows.rows) applied.set(r.name, r.checksum ?? "");

    const pending: { name: string; sql: string; checksum: string }[] = [];
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      const cs = sha256(sql);
      if (!applied.has(file)) { pending.push({ name: file, sql, checksum: cs }); pendingList.push(file); }
      else if (applied.get(file) && applied.get(file) !== cs) driftList.push(file);
    }

    if (driftList.length) {
      console.warn(`⚠  checksum drift on already-applied migrations: ${driftList.join(", ")}`);
      console.warn("    (edit new migrations instead of mutating history)");
    }

    console.log(`mode=${mode}  applied=${applied.size}  pending=${pending.length}`);
    if (mode === "plan" || !pending.length) {
      for (const p of pending) console.log(`  • ${p.name}  (${p.sql.length} bytes, sha ${p.checksum.slice(0, 10)}…)`);
    } else {
      for (const p of pending) {
        const t0 = Date.now();
        console.log(`→ ${p.name}`);
        await client.query("begin");
        try {
          await client.query(p.sql);
          await client.query(
            "insert into _pluto_migrations(name, checksum, duration_ms) values ($1,$2,$3)",
            [p.name, p.checksum, Date.now() - t0]
          );
          if (mode === "dry-run") {
            await client.query("rollback");
            console.log(`  ✓ dry-run ok (${Date.now() - t0}ms) — rolled back`);
          } else {
            await client.query("commit");
            console.log(`  ✓ applied (${Date.now() - t0}ms)`);
            appliedList.push(p.name);
          }
        } catch (e) {
          await client.query("rollback");
          const message = (e as Error).message;
          console.error(`  ✗ FAILED: ${message}`);
          failedList.push({ version: p.name, error: message });
          throw e;
        }
      }
    }
  } catch (e) {
    bootRunErr = e instanceof Error ? e.message : String(e);
    // record before rethrowing
    await recordBootRun(client, mode, pendingList, driftList, appliedList, failedList, Date.now() - runStart, bootRunErr, lockAcquired).catch(() => {});
    if (isBoot) await client.query("select pg_advisory_unlock($1::bigint)", [ADVISORY_KEY.toString()]).catch(() => {});
    await client.end();
    throw e;
  }

  await recordBootRun(client, mode, pendingList, driftList, appliedList, failedList, Date.now() - runStart, null, lockAcquired);
  if (isBoot) await client.query("select pg_advisory_unlock($1::bigint)", [ADVISORY_KEY.toString()]).catch(() => {});
  await client.end();
  console.log(mode === "dry-run" ? "✓ dry-run complete (no changes committed)" : "✓ migrations done");
}

async function recordBootRun(
  client: pg.Client, mode: Mode,
  pending: string[], drift: string[],
  applied: string[], failed: { version: string; error: string }[],
  duration_ms: number, err: string | null, lockAcquired: boolean,
) {
  if (!isBoot) return;
  // The table may not exist yet the very first time (0013 introduces it).
  try {
    await client.query(
      `insert into public.migration_boot_runs
         (finished_at, actor, mode, host, version_tag, pending, drift, applied, failed,
          duration_ms, status, error, lock_acquired, advisory_key)
       values (now(), $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13)`,
      [
        process.env.PLUTO_BOOT_ACTOR ?? "boot",
        mode,
        hostname(),
        process.env.PLUTO_VERSION ?? null,
        JSON.stringify(pending),
        JSON.stringify(drift),
        JSON.stringify(applied),
        JSON.stringify(failed),
        duration_ms,
        err ? "error" : "ok",
        err,
        lockAcquired,
        ADVISORY_KEY.toString(),
      ],
    );
  } catch { /* first-boot before 0013 — ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
