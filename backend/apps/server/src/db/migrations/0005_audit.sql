-- Phase 7: dedicated audit trail for privileged dashboard actions.
--
-- Every migration run / rerun / rollback and every job-token mint /
-- revoke lands here. Rows are append-only from the app (no update /
-- delete grants). The realtime layer also mirrors each insert onto the
-- `system:audit` broadcast channel so dashboards update live.

create table if not exists public.audit_events (
  id           uuid primary key default gen_random_uuid(),
  ts           timestamptz not null default now(),
  actor_id     uuid references public.users(id) on delete set null,
  actor_email  text,
  actor_role   text,
  action       text not null,       -- e.g. "migration.run", "job_token.mint"
  target       text,                -- version, token id, etc.
  status       text not null default 'ok'
                 check (status in ('ok','error','dry_run')),
  metadata     jsonb not null default '{}'::jsonb,
  ip           inet,
  user_agent   text
);

create index if not exists audit_events_ts_idx     on public.audit_events (ts desc);
create index if not exists audit_events_action_idx on public.audit_events (action, ts desc);

grant select on public.audit_events to authenticated;
grant all    on public.audit_events to service_role;

alter table public.audit_events enable row level security;
drop policy if exists audit_events_admin_read on public.audit_events;
create policy audit_events_admin_read on public.audit_events
  for select to authenticated
  using (public.is_admin());

-- +migrate down
drop table if exists public.audit_events;
