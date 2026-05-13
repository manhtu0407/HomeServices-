-- =============================================================================
-- Migration: 20260513125704_harden_function_execution.sql
--
-- Purpose:
-- - Resolve Supabase security advisor warnings before production migration.
-- - Pin trigger/helper function search_path values.
-- - Prevent exposed API roles from executing trigger-only SECURITY DEFINER RPCs.
--
-- Scope:
-- - staging verified first
-- - no data model change
-- =============================================================================

alter function public.update_updated_at()
  set search_path = public;

alter function public.update_worker_rating()
  set search_path = public;

alter function public.handle_new_user()
  set search_path = public;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
