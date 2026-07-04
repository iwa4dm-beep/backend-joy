-- Phase 36 — Point-in-time recovery + cross-region backup replication.

create table if not exists public.wal_archive_config (
  id              int primary key default 1,
  enabled         boolean not null default false,
  archive_url     text,                -- s3://bucket/wal or file:///var/pluto/wal
  retention_days  int not null default 7,
  last_archived_lsn text,
  last_archived_at timestamptz,
  updated_at      timestamptz not null default now(),
  check (id = 1)
);
insert into public.wal_archive_config(id) values (1) on conflict do nothing;

create table if not exists public.pitr_snapshots (
  id              uuid primary key default gen_random_uuid(),
  taken_at        timestamptz not null default now(),
  lsn             text,
  bytes           bigint,
  storage_url     text not null,
  kind            text not null default 'basebackup', -- basebackup | wal_segment
  verified_at     timestamptz,
  notes           text
);
create index if not exists ix_pitr_taken on public.pitr_snapshots(taken_at desc);

create table if not exists public.backup_replicas (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null,      -- pitr_snapshots.id OR backup_exports.id
  source_kind     text not null check (source_kind in ('pitr','export')),
  region          text not null,
  target_url      text not null,
  bytes           bigint,
  replicated_at   timestamptz,
  verified_at     timestamptz,
  status          text not null default 'pending', -- pending | ok | failed
  error           text,
  created_at      timestamptz not null default now()
);
create index if not exists ix_replicas_source on public.backup_replicas(source_id);

create table if not exists public.pitr_restores (
  id              uuid primary key default gen_random_uuid(),
  target_time     timestamptz not null,
  base_snapshot_id uuid references public.pitr_snapshots(id),
  status          text not null default 'pending', -- pending | running | done | failed
  dry_run         boolean not null default true,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  error           text,
  requested_by    uuid
);

revoke all on public.wal_archive_config, public.pitr_snapshots,
             public.backup_replicas, public.pitr_restores
  from public, anon, authenticated;
grant  all on public.wal_archive_config, public.pitr_snapshots,
             public.backup_replicas, public.pitr_restores
  to service_role;
