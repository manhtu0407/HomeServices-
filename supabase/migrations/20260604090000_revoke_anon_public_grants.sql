-- ============================================================
-- Revoke ALL anon privileges on the public schema.
--
-- Context: the product has no anonymous/guest surface. The mobile
-- app makes exactly one direct Supabase call (a post-login read of
-- public.profiles); everything else is mediated by the mobile-api
-- Edge function using the service role. Yet ~27 legacy tables still
-- grant INSERT/UPDATE/DELETE/SELECT to `anon`. RLS already blocks
-- anon (no policy targets it), so this is not an active breach, but
-- the residual grants are a defense-in-depth liability — the exact
-- failure that exposed worker_profiles_districts_backup_x3 once RLS
-- was off. This strips `anon` to zero in public, including inherited
-- PUBLIC grants and function execution.
--
-- Idempotent. Apply to BOTH HomeServices (prod) and Staging.
-- Future tables are covered separately by the default-privileges
-- migration; this only fixes already-existing objects.
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

commit;
