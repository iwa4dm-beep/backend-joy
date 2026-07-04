-- Phase 61 — Vector v3 (per-tenant HNSW config).

create table if not exists public.vector_v3_hnsw_configs (
  workspace_id     uuid not null,
  index_name       text not null,
  m                int  not null default 16,
  ef_construction  int  not null default 200,
  ef_search        int  not null default 64,
  metric           text not null default 'cosine',
  updated_at       timestamptz not null default now(),
  primary key (workspace_id, index_name),
  check (m between 2 and 64),
  check (ef_construction between 4 and 1024),
  check (ef_search between 1 and 2048),
  check (metric in ('cosine', 'l2', 'ip'))
);

grant select, insert, update on public.vector_v3_hnsw_configs to authenticated;
grant all on public.vector_v3_hnsw_configs to service_role;
alter table public.vector_v3_hnsw_configs enable row level security;
