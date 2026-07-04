-- Phase 32 — Storage: TUS resumable uploads staging table.
--
-- Chunks are held on the storage driver at `.tus/<id>/<offset>` and
-- concatenated to the final object once Upload-Offset == Upload-Length.
-- One row per in-flight upload; sweeper purges rows past expires_at.

create table if not exists public.tus_uploads (
  id             uuid primary key default gen_random_uuid(),
  bucket_name    text not null references public.buckets(name) on delete cascade,
  object_key     text not null,
  total_size     bigint not null check (total_size >= 0),
  uploaded_size  bigint not null default 0 check (uploaded_size >= 0),
  metadata       jsonb not null default '{}'::jsonb,
  content_type   text,
  created_by     uuid references public.users(id) on delete set null,
  expires_at     timestamptz not null default (now() + interval '24 hours'),
  completed_at   timestamptz,
  aborted_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists ix_tus_expires
  on public.tus_uploads(expires_at) where completed_at is null and aborted_at is null;

revoke all on public.tus_uploads from authenticated, anon;
grant all  on public.tus_uploads to service_role;
alter table public.tus_uploads enable row level security;

-- Render cache manifest — rows mirror objects stored under the
-- `.render-cache/<hash>` prefix in the target bucket. Purely operational
-- metadata; the actual bytes live in storage, keyed by the same hash.
create table if not exists public.render_cache (
  cache_key      text primary key,       -- sha256(bucket|key|params)
  bucket_name    text not null,
  source_key     text not null,
  params_json    jsonb not null,
  content_type   text not null,
  bytes          bigint not null,
  hit_count      bigint not null default 0,
  last_hit_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists ix_render_cache_last_hit on public.render_cache(last_hit_at desc);

revoke all on public.render_cache from authenticated, anon;
grant all  on public.render_cache to service_role;
alter table public.render_cache enable row level security;
