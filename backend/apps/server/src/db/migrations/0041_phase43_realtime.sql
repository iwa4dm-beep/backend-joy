-- Phase 43 — Realtime CDC v3: NATS backplane + RLS-aware channels + replay.
--
-- Adds:
--   * rt3_channels       — channel registry with an RLS predicate expression
--                          evaluated per subscriber (server-side filtering).
--   * rt3_subscriptions  — durable subscriber cursors for replay-after-outage.
--   * rt3_backplane_log  — fan-out audit + fallback replay when NATS is down.
--   * rt3_nats_config    — single-row config for the NATS backplane URL/creds
--                          reference (secret name only; value lives in env).

create table if not exists public.rt3_channels (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid,
  name             text not null,
  schema_name      text not null default 'public',
  table_name       text not null,
  rls_predicate    text,                    -- e.g. "user_id = auth.uid()"; null = public
  require_role     text,                    -- optional role gate: 'authenticated' | 'admin' | null
  replay_window_s  int  not null default 3600 check (replay_window_s between 60 and 86400),
  created_at       timestamptz not null default now(),
  unique (workspace_id, name)
);
create index if not exists ix_rt3_channels_ws on public.rt3_channels(workspace_id);

revoke all on public.rt3_channels from authenticated, anon;
grant  all on public.rt3_channels to service_role;
alter table public.rt3_channels enable row level security;

create table if not exists public.rt3_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  channel_id     uuid not null references public.rt3_channels(id) on delete cascade,
  subscriber_id  text not null,
  user_id        uuid,
  last_event_id  bigint not null default 0,
  last_seen      timestamptz not null default now(),
  unique (channel_id, subscriber_id)
);
create index if not exists ix_rt3_subs_channel on public.rt3_subscriptions(channel_id);

revoke all on public.rt3_subscriptions from authenticated, anon;
grant  all on public.rt3_subscriptions to service_role;
alter table public.rt3_subscriptions enable row level security;

create table if not exists public.rt3_backplane_log (
  id              bigserial primary key,
  ts              timestamptz not null default now(),
  channel_name    text not null,
  event_type      text not null,           -- INSERT|UPDATE|DELETE|BROADCAST
  payload         jsonb not null,
  nats_subject    text,
  delivered_nats  boolean not null default false,
  delivery_error  text
);
create index if not exists ix_rt3_bp_ts       on public.rt3_backplane_log(ts desc);
create index if not exists ix_rt3_bp_channel  on public.rt3_backplane_log(channel_name, id desc);

revoke all on public.rt3_backplane_log from authenticated, anon;
grant  all on public.rt3_backplane_log to service_role;
alter table public.rt3_backplane_log enable row level security;

create table if not exists public.rt3_nats_config (
  id              int primary key default 1 check (id = 1),
  enabled         boolean not null default false,
  url             text,                    -- e.g. nats://nats:4222
  subject_prefix  text not null default 'pluto.rt3',
  cluster_name    text,
  updated_at      timestamptz not null default now()
);

revoke all on public.rt3_nats_config from authenticated, anon;
grant  all on public.rt3_nats_config to service_role;
alter table public.rt3_nats_config enable row level security;

insert into public.rt3_nats_config(id) values (1) on conflict do nothing;
