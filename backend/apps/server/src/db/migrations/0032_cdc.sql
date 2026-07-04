-- Phase 33 — Postgres CDC (Change Data Capture).
--
-- Creates the configuration surface that the CDC module reads on boot:
--   * `cdc_config`  — per-workspace tables to include in the publication
--   * `cdc_events`  — durable ring buffer for delivered/undelivered events
--                      (useful for missed-event replay after subscriber outage)
--
-- The actual Postgres publication + replication slot are provisioned by
-- the CDC module at startup so they can be reconciled with cdc_config
-- as tables are added/removed at runtime.

create table if not exists public.cdc_config (
  workspace_id  uuid,
  schema_name   text not null default 'public',
  table_name    text not null,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, schema_name, table_name)
);

revoke all on public.cdc_config from authenticated, anon;
grant all  on public.cdc_config to service_role;
alter table public.cdc_config enable row level security;

create table if not exists public.cdc_events (
  id            bigserial primary key,
  commit_ts     timestamptz not null default now(),
  schema_name   text not null,
  table_name    text not null,
  op            text not null check (op in ('INSERT','UPDATE','DELETE','TRUNCATE')),
  row_pk        jsonb,
  new_row       jsonb,
  old_row       jsonb,
  lsn           text
);
create index if not exists ix_cdc_events_ts_desc  on public.cdc_events(commit_ts desc);
create index if not exists ix_cdc_events_table    on public.cdc_events(schema_name, table_name, commit_ts desc);

revoke all on public.cdc_events from authenticated, anon;
grant all  on public.cdc_events to service_role;
alter table public.cdc_events enable row level security;

-- Retention: 24h ring buffer. The CDC module trims via a background
-- sweeper so this is a floor, not a guarantee.
