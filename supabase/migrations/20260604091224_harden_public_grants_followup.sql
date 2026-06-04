-- ============================================================
-- Follow-up hardening for public grants/default privileges.
--
-- Staging already records the 20260604090000/90100/90200 migration
-- versions, so any post-review tightening has to be expressed as a
-- new forward migration. This file is intentionally idempotent and
-- repeats the missing hardening so existing environments converge to
-- the same posture as a fresh database built from the current files.
--
-- Runtime contract:
--   - no anonymous public-schema access
--   - no direct authenticated DML/RPC access by default
--   - mobile workflow writes stay behind the mobile-api Edge function
--   - migrations must grant future table/RPC access intentionally
-- ============================================================

begin;

-- Existing public-schema objects.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables    in schema public from public;
revoke all on all sequences in schema public from public;
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;
grant execute on all functions in schema public to service_role;
revoke usage on schema public from public;
revoke usage on schema public from anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- Residual authenticated grants missed by the broader workflow DML revoke.
revoke all on public.kael_market_artifacts   from authenticated;
revoke all on public.service_knowledge_boxes from authenticated;
grant select on public.kael_market_artifacts   to authenticated;
grant select on public.service_knowledge_boxes to authenticated;

revoke all on public.kael_cost_daily_summary            from authenticated;
revoke all on public.kael_cost_projection_daily         from authenticated;
revoke all on public.kael_monitoring_ab_price_synthesis from authenticated;
revoke all on public.kael_monitoring_provider_daily     from authenticated;
grant select on public.kael_cost_daily_summary            to authenticated;
grant select on public.kael_cost_projection_daily         to authenticated;
grant select on public.kael_monitoring_ab_price_synthesis to authenticated;
grant select on public.kael_monitoring_provider_daily     to authenticated;

-- Future objects created by migrations must be granted intentionally.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;

commit;
