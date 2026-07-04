-- Phase 34 — Data API (auto REST/GraphQL) allowlist + view registry.
--
-- The REST + GraphQL surface exposes tables in the `public` schema by
-- default. `data_api_exposed` lets an admin narrow that surface per
-- workspace (allowlist mode) and store friendly rename hints for
-- GraphQL type naming. When no row exists for a workspace, all public
-- tables are exposed (back-compat with the pre-Phase-34 REST module).

create table if not exists public.data_api_exposed (
  workspace_id  uuid not null,
  schema_name   text not null default 'public',
  table_name    text not null,
  gql_type_name text,
  read_only     boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (workspace_id, schema_name, table_name)
);

revoke all on public.data_api_exposed from public, anon, authenticated;
grant  all on public.data_api_exposed to service_role;
alter  table public.data_api_exposed enable row level security;

-- Cached introspection snapshot (refreshed by the module on demand).
create table if not exists public.data_api_introspect_cache (
  id             int primary key default 1,
  snapshot       jsonb not null,
  refreshed_at   timestamptz not null default now(),
  check (id = 1)
);
revoke all on public.data_api_introspect_cache from public, anon, authenticated;
grant  all on public.data_api_introspect_cache to service_role;
