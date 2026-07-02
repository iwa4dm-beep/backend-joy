-- 0009: dashboard-managed service settings.
--
-- A single row per (workspace_id, key) namespace, JSON value, edited
-- exclusively from the admin dashboard. Sensitive values are marked so
-- the API can redact them on read.

create table if not exists public.service_settings (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  key           text not null,
  value         jsonb not null,
  is_secret     boolean not null default false,
  updated_by    uuid references public.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, key)
);

grant select on public.service_settings to authenticated;
grant all    on public.service_settings to service_role;

alter table public.service_settings enable row level security;
drop policy if exists ss_service_only on public.service_settings;
create policy ss_service_only on public.service_settings
  for all to authenticated using (false) with check (false);
