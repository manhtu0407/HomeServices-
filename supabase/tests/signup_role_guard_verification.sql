-- =============================================================================
-- Signup role guard verification
--
-- Rollback-only proof that a self-declared role in auth metadata cannot become a
-- privileged profile role, that the old public entry point is gone, and that no exposed
-- API role can invoke the signup trigger directly.
--
-- The hardening exists (20260517192455_harden_auth_signup_trigger.sql,
-- 20260809124500_harden_public_signup_trigger_execution.sql). Its only previous "test"
-- asserted that the migration text does NOT contain the word coalesce, which is the
-- sharpest example in the repository of a privilege-escalation claim resting on a
-- substring (docs/test-debt-ledger.md §2b).
--
-- Pattern source: governance/protocols/test-pillars.md (P10 prototype).
-- =============================================================================

begin;

-- 1. A signup that asks for admin gets customer.
do $signup_role_forced$
declare
  v_role public.user_role;
begin
  insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    'b7300000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'signup-guard-escalation@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin","is_admin":true}'::jsonb,
    now(), now()
  );

  select role into v_role from public.profiles where id = 'b7300000-0000-4000-8000-000000000001';

  if v_role is distinct from 'customer'::public.user_role then
    raise exception
      'signup metadata escalated the profile role to % (expected customer). authority: governance/RULES.md Security Invariants. next: staging_security_verification.sql',
      coalesce(v_role::text, '<null>');
  end if;
end;
$signup_role_forced$;

-- 2. The same holds for a worker claim; worker status is an admin decision, not a signup field.
do $signup_worker_claim$
declare
  v_role public.user_role;
begin
  insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    'b7300000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'signup-guard-worker-claim@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"worker"}'::jsonb,
    now(), now()
  );

  select role into v_role from public.profiles where id = 'b7300000-0000-4000-8000-000000000002';

  if v_role is distinct from 'customer'::public.user_role then
    raise exception
      'a self-declared worker role survived signup as % (expected customer). authority: governance/STRUCTURES.md §3 (workers are approved manually by admin)',
      coalesce(v_role::text, '<null>');
  end if;
end;
$signup_worker_claim$;

-- 3. The trigger still has to do its job, so the guard above is not passing by inaction.
do $signup_profile_created$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.profiles
  where id in (
    'b7300000-0000-4000-8000-000000000001',
    'b7300000-0000-4000-8000-000000000002'
  );

  if v_count <> 2 then
    raise exception 'signup created % profile rows for 2 users; the trigger is not running', v_count;
  end if;
end;
$signup_profile_created$;

-- 4. The public entry point was dropped when the function moved into private.
do $signup_public_entry_point$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    raise exception
      'public.handle_new_user() is reachable again. authority: governance/RULES.md Security Invariants';
  end if;
end;
$signup_public_entry_point$;

-- 5. No exposed role may call the trigger function directly.
do $signup_execute_revoked$
declare
  v_role text;
  v_granted boolean;
  v_exists boolean;
begin
  select exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'handle_new_user'
  ) into v_exists;

  if not v_exists then
    raise exception 'private.handle_new_user() is missing; signup has no server-side role guard at all';
  end if;

  foreach v_role in array array['public', 'anon', 'authenticated'] loop
    select has_function_privilege(v_role, p.oid, 'EXECUTE')
    into v_granted
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'handle_new_user'
    limit 1;

    if coalesce(v_granted, false) then
      raise exception
        'role % can execute private.handle_new_user() directly. authority: governance/RULES.md Security Invariants',
        v_role;
    end if;
  end loop;
end;
$signup_execute_revoked$;

select jsonb_build_object(
  'metadata_role_ignored', true,
  'worker_claim_ignored', true,
  'profile_still_created', true,
  'public_entry_point_dropped', true,
  'direct_execute_revoked', true
) as signup_role_guard_verification;

rollback;
