-- ============================================================
-- Revoke residual `authenticated` table/view privileges left by the
-- Supabase default grants on two legacy tables + four reporting views.
--
-- The revoke_authenticated_workflow_dml migration stripped authenticated
-- INSERT/UPDATE/DELETE from the workflow tables, but missed
-- kael_market_artifacts and service_knowledge_boxes (both Edge/admin
-- managed). The four kael_* reporting views also carried the default
-- table grants, and the four kael_* reporting views also carried
-- meaningless non-SELECT grants.
--
-- All real writes go through the Edge service_role; RLS already blocks
-- non-admin authenticated. SELECT is restored explicitly below.
--
-- INTENTIONALLY PRESERVED (admin-tunable via RLS + grant):
--   - source_trust_registry  (ALL policy gated by private.is_admin())
--   - customer_kael_feedback (column-scoped update(status, safe_metadata))
--
-- Idempotent. Apply to BOTH HomeServices (prod) and Staging.
-- ============================================================

begin;

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

commit;
