-- Phase 47 — Observability production (OpenTelemetry, RED metrics, SLOs, log alerts)
-- OTel-shaped spans (superset of Phase 18 obs_spans), keyed by hex ids.

create table if not exists public.obs_v2_spans (
  id           bigserial primary key,
  trace_id     text not null,               -- 32 hex (W3C traceparent)
  span_id      text not null,               -- 16 hex
  parent_id    text,
  name         text not null,
  kind         text not null default 'server',
  service      text not null default 'pluto-api',
  status_code  int  not null default 0,     -- 0 unset, 1 ok, 2 error
  attributes   jsonb not null default '{}'::jsonb,
  events       jsonb not null default '[]'::jsonb,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  duration_ms  double precision
);
create index if not exists obs_v2_spans_trace_idx on public.obs_v2_spans(trace_id);
create index if not exists obs_v2_spans_started_idx on public.obs_v2_spans(started_at desc);

-- SLO definitions (availability or latency), with objective + window.
create table if not exists public.obs_v2_slos (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  service       text not null default 'pluto-api',
  route_pattern text not null default '.*',     -- regex on route path
  kind          text not null check (kind in ('availability','latency')),
  objective     double precision not null,      -- e.g. 0.999 (99.9%)
  threshold_ms  integer,                        -- for latency SLOs
  window_days   integer not null default 30,
  created_at    timestamptz not null default now()
);

-- Recorded burn-rate evaluations (multi-window: 5m/1h/6h/24h).
create table if not exists public.obs_v2_burn_events (
  id           bigserial primary key,
  slo_id       uuid not null references public.obs_v2_slos(id) on delete cascade,
  window_label text not null,                   -- '5m','1h','6h','24h'
  burn_rate    double precision not null,       -- errors_ratio / (1-objective)
  breaching    boolean not null,
  evaluated_at timestamptz not null default now()
);
create index if not exists obs_v2_burn_events_slo_idx
  on public.obs_v2_burn_events(slo_id, evaluated_at desc);

-- Log-based alert rules (matches structured log stream).
create table if not exists public.obs_v2_log_alerts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  level        text not null default 'error',   -- info|warn|error|fatal
  contains     text,                            -- substring match on message
  route_regex  text,                            -- optional route filter
  threshold    integer not null default 10,     -- events in window
  window_secs  integer not null default 300,
  webhook_url  text,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  last_fired_at timestamptz
);

grant select, insert, update, delete on public.obs_v2_spans        to authenticated;
grant select, insert, update, delete on public.obs_v2_slos         to authenticated;
grant select, insert, update, delete on public.obs_v2_burn_events  to authenticated;
grant select, insert, update, delete on public.obs_v2_log_alerts   to authenticated;
grant all on public.obs_v2_spans        to service_role;
grant all on public.obs_v2_slos         to service_role;
grant all on public.obs_v2_burn_events  to service_role;
grant all on public.obs_v2_log_alerts   to service_role;
grant usage, select on sequence public.obs_v2_spans_id_seq       to authenticated, service_role;
grant usage, select on sequence public.obs_v2_burn_events_id_seq to authenticated, service_role;

alter table public.obs_v2_spans        enable row level security;
alter table public.obs_v2_slos         enable row level security;
alter table public.obs_v2_burn_events  enable row level security;
alter table public.obs_v2_log_alerts   enable row level security;

create policy "svc all spans"      on public.obs_v2_spans        for all to service_role using (true) with check (true);
create policy "svc all slos"       on public.obs_v2_slos         for all to service_role using (true) with check (true);
create policy "svc all burn"       on public.obs_v2_burn_events  for all to service_role using (true) with check (true);
create policy "svc all logalerts"  on public.obs_v2_log_alerts   for all to service_role using (true) with check (true);
