-- ============================================================
-- Follow-up hardening for public grants/default privileges.
--
-- Existing environments had already recorded earlier hardening
-- versions, so this forward migration repeats the intended posture
-- without editing applied history.
-- ============================================================

begin;

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

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;

commit;
