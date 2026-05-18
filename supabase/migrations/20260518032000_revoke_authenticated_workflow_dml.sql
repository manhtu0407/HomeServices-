-- =============================================================================
-- Migration: revoke_authenticated_workflow_dml
--
-- Why:
-- - Mobile production writes workflow state through Supabase Edge mobile-api.
-- - Older grants left broad table DML privileges on the authenticated role.
--   RLS still blocked normal users, but least privilege should not depend on
--   every future policy staying perfect.
-- - Keep authenticated clients read-only for public workflow tables. Edge
--   Functions and server/admin paths continue to write via service_role.
-- =============================================================================

revoke insert, update, delete on
  public.profiles,
  public.customer_profiles,
  public.worker_profiles,
  public.service_categories,
  public.service_problems,
  public.price_baselines,
  public.jobs,
  public.job_broadcasts,
  public.chat_messages,
  public.reviews,
  public.job_events,
  public.scope_change_requests,
  public.notifications,
  public.api_logs,
  public.learning_candidates,
  public.learning_rules,
  public.learning_rule_versions
from authenticated;

grant all on
  public.profiles,
  public.customer_profiles,
  public.worker_profiles,
  public.service_categories,
  public.service_problems,
  public.price_baselines,
  public.jobs,
  public.job_broadcasts,
  public.chat_messages,
  public.reviews,
  public.job_events,
  public.scope_change_requests,
  public.notifications,
  public.api_logs,
  public.learning_candidates,
  public.learning_rules,
  public.learning_rule_versions
to service_role;
