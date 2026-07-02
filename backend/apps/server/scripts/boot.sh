#!/bin/sh
# Container entrypoint: dry-run pending migrations, apply if clean, then start the API.
# Overridable via env:
#   MIGRATE_ON_BOOT=1|0     (default 1)  — apply pending migrations before start
#   MIGRATE_DRY_RUN_FIRST=1|0 (default 1) — run dry-run pass first, abort boot on error
set -eu

# Signal to migrate.ts that this is a boot invocation: it will take a
# Postgres advisory lock (so only one replica runs pending migrations at
# a time) and record the outcome into public.migration_boot_runs.
export PLUTO_BOOT_ACTOR="${PLUTO_BOOT_ACTOR:-boot}"

if [ "${MIGRATE_ON_BOOT:-1}" = "1" ]; then
  if [ "${MIGRATE_DRY_RUN_FIRST:-1}" = "1" ]; then
    echo "[boot] migrations: dry-run"
    node dist/db/migrate.js --dry-run
  fi
  echo "[boot] migrations: apply (advisory lock)"
  node dist/db/migrate.js
else
  echo "[boot] MIGRATE_ON_BOOT=0 — skipping migrations"
fi

echo "[boot] starting Pluto API on :${PORT:-8000}"
exec node dist/server.js
