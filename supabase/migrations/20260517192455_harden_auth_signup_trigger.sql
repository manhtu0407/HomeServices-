-- =============================================================================
-- Migration: harden_auth_signup_trigger
--
-- The auth.users signup trigger still needs SECURITY DEFINER because it writes
-- the public profile row during Supabase Auth signup. Keep it in the private
-- schema and tightly scoped:
-- - force customer role server-side
-- - pin search_path
-- - remove direct EXECUTE from exposed roles
-- =============================================================================

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $func$
begin
  insert into public.profiles (id, role, phone)
  values (
    new.id,
    'customer',
    new.phone
  );
  return new;
end;
$func$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop function if exists public.handle_new_user();

revoke execute on function private.handle_new_user() from public;
revoke execute on function private.handle_new_user() from anon;
revoke execute on function private.handle_new_user() from authenticated;

comment on function private.handle_new_user() is
  'Auth signup trigger: creates a customer profile with pinned search_path. Direct execute revoked from exposed roles.';
