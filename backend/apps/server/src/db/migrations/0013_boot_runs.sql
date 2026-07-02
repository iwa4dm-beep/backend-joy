-- Phase 13.5: boot-time migration run history.
--
-- Every time the container's boot.sh (or `migrate.ts` invoked with
-- PLUTO_BOOT_ACTOR=boot) runs pending migrations it inserts one row here
-- describing the dry-run plan, the drift set, and the statements it
-- actually applied. The admin dashboard reads the most-recent row so
-- operators can see exactly what happened during the last deploy.

create table if not exists public.migration_boot_runs (
  id             uuid primary key default gen_random_uuid(),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  actor          text not null default 'boot',
  mode           text not null,           -- 'dry-run' | 'apply' | 'plan'
  host           text,
  version_tag    text,                    -- e.g. git sha
  pending        jsonb not null default '[]'::jsonb,   -- versions considered
  drift          jsonb not null default '[]'::jsonb,   -- versions with changed checksums
  applied        jsonb not null default '[]'::jsonb,   -- versions successfully applied
  failed         jsonb not null default '[]'::jsonb,   -- [{ version, error }]
  duration_ms    integer not null default 0,
  status         text not null default 'ok',           -- 'ok' | 'error'
  error          text,
  lock_acquired  boolean not null default true,
  advisory_key   bigint
);

create index if not exists migration_boot_runs_started_idx
  on public.migration_boot_runs (started_at desc);

grant select on public.migration_boot_runs to authenticated;
grant all    on public.migration_boot_runs to service_role;
alter table public.migration_boot_runs enable row level security;

-- service_role only from clients (matches schema_migrations pattern).
create policy migration_boot_runs_service_only on public.migration_boot_runs
  for all to authenticated using (false) with check (false);
