-- Phase 35 — Edge Functions v3 (hardened isolate runtime).
--
-- v3 deployments layer on top of v2 secrets/schedules. Each deployment
-- pins a source code blob + resource envelope (timeout, memory, network
-- allow-list) that the isolate worker enforces per invocation.

create table if not exists public.fn_v3_deployments (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid,
  slug            text not null,
  version         int  not null,
  code            text not null,
  entry           text not null default 'default',
  timeout_ms      int  not null default 5000,
  memory_mb       int  not null default 128,
  allow_hosts     text[] not null default '{}',
  active          boolean not null default true,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  unique (workspace_id, slug, version)
);
create index if not exists ix_fn_v3_active on public.fn_v3_deployments(workspace_id, slug, active);

revoke all on public.fn_v3_deployments from public, anon, authenticated;
grant  all on public.fn_v3_deployments to service_role;
alter  table public.fn_v3_deployments enable row level security;

create table if not exists public.fn_v3_invocations (
  id             bigserial primary key,
  deployment_id  uuid references public.fn_v3_deployments(id) on delete set null,
  workspace_id   uuid,
  slug           text not null,
  ok             boolean not null,
  duration_ms    int,
  status         int,
  error          text,
  cpu_ms         int,
  mem_peak_mb    int,
  started_at     timestamptz not null default now()
);
create index if not exists ix_fn_v3_inv_slug on public.fn_v3_invocations(workspace_id, slug, started_at desc);

revoke all on public.fn_v3_invocations from public, anon, authenticated;
grant  all on public.fn_v3_invocations to service_role;
