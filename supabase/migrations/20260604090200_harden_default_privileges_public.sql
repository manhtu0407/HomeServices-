-- ============================================================
-- Harden DEFAULT PRIVILEGES for the public schema (root-cause fix).
--
-- Supabase's default ACL grants Data API privileges to anon/authenticated
-- on new public tables/functions in existing projects.
-- That default is the source of every residual grant cleaned up by
-- the revoke_anon_public_grants and revoke_residual_authenticated_dml
-- migrations. Without this fix, the next `create table` reintroduces
-- the same exposure.
--
-- New posture for objects created by `postgres` (i.e. all migrations):
--   anon           -> nothing
--   authenticated  -> nothing by default; explicit grants per table/view
--   service_role   -> nothing by default; explicit grants per RPC/table
--
-- Migrations run as `postgres`, so only the postgres default ACL is
-- overridden. supabase_admin's default ACL is platform-internal and
-- intentionally left untouched (and is not alterable by `postgres`).
--
-- A future probe table/function should show no automatic grants to anon,
-- authenticated, public, or service_role. Migrations must grant intentionally.
--
-- Idempotent. Apply to BOTH HomeServices (prod) and Staging.
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
