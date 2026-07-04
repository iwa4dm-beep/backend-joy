-- Phase 36 — Stripe billing + plan enforcement.

create table if not exists public.billing_plans (
  code            text primary key,               -- 'free' | 'pro' | 'team' | 'enterprise'
  name            text not null,
  stripe_price_id text,
  monthly_cents   int not null default 0,
  features        jsonb not null default '{}'::jsonb,
  limits          jsonb not null default '{}'::jsonb, -- { rows, storage_gb, fn_invocations, ai_tokens }
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

insert into public.billing_plans(code, name, monthly_cents, features, limits) values
  ('free',      'Free',         0,   '{"branching":false,"sso":false}'::jsonb,
                                     '{"rows":50000,"storage_gb":1,"fn_invocations":100000,"ai_tokens":100000}'::jsonb),
  ('pro',       'Pro',        2500,  '{"branching":true,"sso":false}'::jsonb,
                                     '{"rows":5000000,"storage_gb":100,"fn_invocations":5000000,"ai_tokens":5000000}'::jsonb),
  ('team',      'Team',      9900,   '{"branching":true,"sso":true}'::jsonb,
                                     '{"rows":50000000,"storage_gb":1000,"fn_invocations":50000000,"ai_tokens":50000000}'::jsonb),
  ('enterprise','Enterprise', 0,     '{"branching":true,"sso":true,"custom":true}'::jsonb,
                                     '{"rows":-1,"storage_gb":-1,"fn_invocations":-1,"ai_tokens":-1}'::jsonb)
on conflict (code) do nothing;

create table if not exists public.billing_subscriptions (
  workspace_id      uuid primary key,
  plan_code         text not null references public.billing_plans(code),
  stripe_customer_id  text,
  stripe_subscription_id text,
  status            text not null default 'active', -- active | past_due | canceled | trialing
  current_period_end timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.billing_events (
  id             bigserial primary key,
  workspace_id   uuid,
  type           text not null,
  stripe_event_id text unique,
  payload        jsonb,
  received_at    timestamptz not null default now()
);

revoke all on public.billing_plans, public.billing_subscriptions, public.billing_events
  from public, anon, authenticated;
grant  select on public.billing_plans to authenticated;
grant  all    on public.billing_plans, public.billing_subscriptions, public.billing_events
  to service_role;
alter  table public.billing_subscriptions enable row level security;
alter  table public.billing_events enable row level security;
