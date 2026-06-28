-- Pluto core schema
create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  role text not null default 'user' check (role in ('user','admin')),
  email_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table if not exists public.buckets (
  name text primary key,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.objects (
  id uuid primary key default gen_random_uuid(),
  bucket text not null references public.buckets(name) on delete cascade,
  key text not null,
  size bigint not null,
  content_type text not null default 'application/octet-stream',
  owner_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, key)
);

create table if not exists public.api_logs (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  level text not null default 'info' check (level in ('info','warn','error')),
  source text not null check (source in ('auth','rest','storage','admin')),
  message text not null,
  user_id uuid references public.users(id) on delete set null
);

-- Helper: read current request user from RLS GUC.
create or replace function public.current_user_id()
returns uuid language sql stable as $$
  select nullif(current_setting('pluto.user_id', true), '')::uuid
$$;
