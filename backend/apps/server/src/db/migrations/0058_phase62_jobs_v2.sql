-- Phase 62 — Jobs v2 (durable workflow runs + step ledger + side-effect ledger).

create table if not exists public.jobs_v2_runs (
  run_id        text primary key,
  workspace_id  uuid not null,
  workflow      text not null,
  version       int  not null,
  status        text not null,
  input         jsonb,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index if not exists idx_jobs_v2_runs_ws_wf on public.jobs_v2_runs(workspace_id, workflow, started_at desc);
grant select, insert, update on public.jobs_v2_runs to authenticated;
grant all on public.jobs_v2_runs to service_role;
alter table public.jobs_v2_runs enable row level security;

create table if not exists public.jobs_v2_steps (
  run_id      text not null references public.jobs_v2_runs(run_id) on delete cascade,
  step_id     text not null,
  status      text not null,
  attempts    int  not null default 0,
  output      jsonb,
  error       text,
  started_at  timestamptz,
  ended_at    timestamptz,
  primary key (run_id, step_id)
);
grant select, insert, update on public.jobs_v2_steps to authenticated;
grant all on public.jobs_v2_steps to service_role;
alter table public.jobs_v2_steps enable row level security;

create table if not exists public.jobs_v2_side_effects (
  run_id      text not null,
  step_id     text not null,
  key         text not null,
  result      jsonb,
  committed_at timestamptz not null default now(),
  primary key (run_id, step_id, key)
);
grant select, insert on public.jobs_v2_side_effects to authenticated;
grant all on public.jobs_v2_side_effects to service_role;
alter table public.jobs_v2_side_effects enable row level security;
