-- =============================================================================
-- Migration: harden_private_rls_helper_execution
--
-- Why:
-- - The private RLS helper functions are intentionally SECURITY DEFINER because
--   RLS policies need stable, role-safe predicates.
-- - They should not inherit default EXECUTE for PUBLIC, even though anon has no
--   USAGE on the private schema.
-- - Pin pg_catalog explicitly in search_path for the same defense-in-depth
--   posture used by the mobile RPCs.
-- =============================================================================

alter function private.is_admin()
  set search_path = public, pg_catalog;

alter function private.is_job_participant(uuid)
  set search_path = public, pg_catalog;

alter function private.is_job_customer(uuid)
  set search_path = public, pg_catalog;

alter function private.is_job_worker(uuid)
  set search_path = public, pg_catalog;

revoke execute on function private.is_admin() from public;
revoke execute on function private.is_admin() from anon;
revoke execute on function private.is_admin() from authenticated;
grant execute on function private.is_admin() to authenticated;

revoke execute on function private.is_job_participant(uuid) from public;
revoke execute on function private.is_job_participant(uuid) from anon;
revoke execute on function private.is_job_participant(uuid) from authenticated;
grant execute on function private.is_job_participant(uuid) to authenticated;

revoke execute on function private.is_job_customer(uuid) from public;
revoke execute on function private.is_job_customer(uuid) from anon;
revoke execute on function private.is_job_customer(uuid) from authenticated;
grant execute on function private.is_job_customer(uuid) to authenticated;

revoke execute on function private.is_job_worker(uuid) from public;
revoke execute on function private.is_job_worker(uuid) from anon;
revoke execute on function private.is_job_worker(uuid) from authenticated;
grant execute on function private.is_job_worker(uuid) to authenticated;

comment on function private.is_admin() is
  'RLS helper: checks admin role with explicit search_path and authenticated-only execute.';

comment on function private.is_job_participant(uuid) is
  'RLS helper: checks job participant/admin with explicit search_path and authenticated-only execute.';

comment on function private.is_job_customer(uuid) is
  'RLS helper: checks job customer/admin with explicit search_path and authenticated-only execute.';

comment on function private.is_job_worker(uuid) is
  'RLS helper: checks job worker/admin with explicit search_path and authenticated-only execute.';
