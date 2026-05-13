-- =============================================================================
-- Migration: 20260513131949_revoke_rls_auto_enable_rpc.sql
--
-- Purpose:
-- - Resolve the production-only Supabase advisor warning for public.rls_auto_enable().
-- - Keep the migration safe on environments where the function does not exist.
-- - Do not drop or alter the event trigger helper behavior; only remove direct
--   API role execute privileges.
--
-- Quality constraints:
-- - conditional/idempotent
-- - no data model changes
-- - no production-only hard failure when staging lacks the function
-- =============================================================================

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    revoke execute on function public.rls_auto_enable() from public;
    revoke execute on function public.rls_auto_enable() from anon;
    revoke execute on function public.rls_auto_enable() from authenticated;
  end if;
end $$;
