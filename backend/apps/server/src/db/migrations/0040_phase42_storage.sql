-- Phase 42 — Storage production hardening.
--
-- Extends the Phase-32 tus_uploads + render_cache foundation with the
-- pieces needed for real production traffic:
--   • S3-style multipart uploads (>5 GB objects)
--   • Presigned POST policies (browser direct upload with constraints)
--   • Antivirus scan queue (ClamAV worker enqueues + writes verdicts)
--   • CDN cache-purge audit log

-- ---- Multipart uploads -------------------------------------------------
create table if not exists public.storage_multipart_uploads (
  id             uuid primary key default gen_random_uuid(),
  bucket_name    text not null references public.buckets(name) on delete cascade,
  object_key     text not null,
  content_type   text,
  metadata       jsonb not null default '{}'::jsonb,
  created_by     uuid references public.users(id) on delete set null,
  expires_at     timestamptz not null default (now() + interval '7 days'),
  completed_at   timestamptz,
  aborted_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists ix_smpu_expires
  on public.storage_multipart_uploads(expires_at) where completed_at is null and aborted_at is null;

create table if not exists public.storage_multipart_parts (
  upload_id      uuid not null references public.storage_multipart_uploads(id) on delete cascade,
  part_number    int  not null check (part_number between 1 and 10000),
  size           bigint not null check (size >= 0),
  etag           text not null,     -- md5 of the part bytes (S3 semantics)
  uploaded_at    timestamptz not null default now(),
  primary key (upload_id, part_number)
);

revoke all on public.storage_multipart_uploads, public.storage_multipart_parts from public, anon, authenticated;
grant  all on public.storage_multipart_uploads, public.storage_multipart_parts to service_role;
alter  table public.storage_multipart_uploads enable row level security;
alter  table public.storage_multipart_parts   enable row level security;

-- ---- Presigned POST policies ------------------------------------------
--
-- Server signs a policy (bucket, key prefix, content-type list, max-size,
-- expiry) and the browser posts a multipart/form-data body directly to
-- /storage/v1/presigned-post/upload. The uploader never sees a long-lived
-- credential; the signed policy IS the credential.
create table if not exists public.storage_presigned_posts (
  id             uuid primary key default gen_random_uuid(),
  bucket_name    text not null references public.buckets(name) on delete cascade,
  key_prefix     text not null,               -- e.g. 'user/${uid}/'
  max_size       bigint not null default 10485760,
  content_types  text[] not null default '{}',
  expires_at     timestamptz not null,
  policy_hash    text not null unique,
  created_by     uuid references public.users(id) on delete set null,
  consumed_at    timestamptz,
  created_object_key text,
  created_at     timestamptz not null default now()
);
create index if not exists ix_pps_expires on public.storage_presigned_posts(expires_at) where consumed_at is null;

revoke all on public.storage_presigned_posts from public, anon, authenticated;
grant  all on public.storage_presigned_posts to service_role;
alter  table public.storage_presigned_posts enable row level security;

-- ---- Antivirus (ClamAV) scan queue ------------------------------------
create table if not exists public.storage_scan_queue (
  id             bigserial primary key,
  bucket_name    text not null,
  object_key     text not null,
  size           bigint,
  content_type   text,
  status         text not null default 'pending'
                   check (status in ('pending','scanning','clean','infected','error','skipped')),
  verdict        text,               -- e.g. 'Eicar-Test-Signature'
  scanner        text,               -- e.g. 'clamd 0.104'
  attempts       int  not null default 0,
  enqueued_at    timestamptz not null default now(),
  scanned_at     timestamptz,
  error          text
);
create index if not exists ix_ssq_pending on public.storage_scan_queue(status, enqueued_at)
  where status in ('pending','scanning');
create unique index if not exists ux_ssq_object on public.storage_scan_queue(bucket_name, object_key);

revoke all on public.storage_scan_queue from public, anon, authenticated;
grant  all on public.storage_scan_queue to service_role;
alter  table public.storage_scan_queue enable row level security;

-- ---- CDN purge audit log ----------------------------------------------
create table if not exists public.storage_cdn_purges (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null default 'generic',       -- cloudflare | fastly | generic
  target         text not null,                          -- URL or key
  ok             boolean not null,
  status         int,
  response       text,
  requested_by   uuid,
  requested_at   timestamptz not null default now()
);
create index if not exists ix_scp_time on public.storage_cdn_purges(requested_at desc);

revoke all on public.storage_cdn_purges from public, anon, authenticated;
grant  all on public.storage_cdn_purges to service_role;
alter  table public.storage_cdn_purges enable row level security;
