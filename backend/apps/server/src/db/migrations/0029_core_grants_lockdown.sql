-- 0029_core_grants_lockdown.sql
--
-- Phase 30 hardening: lock down the five core tables that migration
-- 0008 disabled RLS on. See docs/security/core-tables-rls.md for the
-- full rationale.
--
-- These tables are only reachable through the Fastify server (which
-- connects as `service_role`). Direct `authenticated` / `anon` access
-- via PostgREST is intentionally rejected at the GRANT layer so a
-- misrouted request cannot leak rows even if RLS is off.

-- users -------------------------------------------------------------
REVOKE ALL ON public.users FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.users TO service_role;

-- refresh_tokens ----------------------------------------------------
REVOKE ALL ON public.refresh_tokens FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.refresh_tokens TO service_role;

-- buckets -----------------------------------------------------------
REVOKE ALL ON public.buckets FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.buckets TO service_role;

-- objects -----------------------------------------------------------
REVOKE ALL ON public.objects FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.objects TO service_role;

-- oauth_accounts ----------------------------------------------------
-- Table only exists once auth Phase 10 migration ran; guard with DO block.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'oauth_accounts') THEN
    EXECUTE 'REVOKE ALL ON public.oauth_accounts FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT  ALL ON public.oauth_accounts TO service_role';
  END IF;
END $$;
