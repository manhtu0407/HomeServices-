-- ============================================================
-- Revoke residual authenticated table/view privileges.
--
-- Real workflow writes are mediated by the Edge service role. Keep
-- authenticated direct access narrow and intentional, with SELECT
-- restored only where the current runtime contract needs it.
--
-- Idempotent. Already present in remote migration history; restored
-- locally so source migrations match staging/prod history.
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
