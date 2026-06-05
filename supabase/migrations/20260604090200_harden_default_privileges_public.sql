-- ============================================================
-- Harden default privileges for objects created in public.
--
-- Supabase default ACLs can grant Data API privileges to anon and
-- authenticated on new public objects. Migrations must grant runtime
-- access intentionally instead of inheriting broad defaults.
--
-- Idempotent. Already present in remote migration history; restored
-- locally so source migrations match staging/prod history.
-- ============================================================

begin;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;

commit;
