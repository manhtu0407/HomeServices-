begin;

-- The admin control-plane migration recreates this trigger in public. Keep it
-- trigger-only: API roles must not be able to invoke a SECURITY DEFINER signup
-- helper directly.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

commit;
