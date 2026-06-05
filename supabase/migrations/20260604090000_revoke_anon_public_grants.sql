-- ============================================================
-- Revoke all anon privileges on the public schema.
--
-- The product has no anonymous public data surface. Mobile signs in
-- through Supabase Auth, then workflow-sensitive reads/writes go
-- through the mobile-api Edge function. This migration removes legacy
-- anon/PUBLIC grants from existing public objects and keeps runtime
-- access explicit.
--
-- Idempotent. Already present in remote migration history; restored
-- locally so source migrations match staging/prod history.
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
