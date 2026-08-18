-- Rollback-only verification for the customer identity/profile invariant.
--
-- A customer is identified by public.profiles, while matching preferences
-- deliberately reference public.customer_profiles. The database must create
-- the role-specific row whenever a profile becomes a customer so matching
-- cannot fail on a missing subtype row.
begin;

do $schema$
declare
  v_function regprocedure := 'private.ensure_customer_profile_for_role()'::regprocedure;
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc
    where oid = v_function
      and prosecdef
      and proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'customer profile invariant function is not a locked-path security definer';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_customer_profile_invariant'
      and tgfoid = v_function
      and not tgisinternal
  ) then
    raise exception 'customer profile invariant trigger is not attached to public.profiles';
  end if;

  foreach v_function in array ARRAY[
    'private.ensure_customer_profile_for_role()'::regprocedure
  ] loop
    if pg_catalog.has_function_privilege('public', v_function, 'execute')
       or pg_catalog.has_function_privilege('anon', v_function, 'execute')
       or pg_catalog.has_function_privilege('authenticated', v_function, 'execute') then
      raise exception 'exposed role can invoke the customer profile invariant function directly';
    end if;
  end loop;
end;
$schema$;

do $signup$
declare
  v_user constant uuid := 'b7400000-0000-4000-8000-000000000001';
  v_job constant uuid := 'b7410000-0000-4000-8000-000000000001';
  v_result record;
begin
  insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user,
    'authenticated',
    'authenticated',
    'customer-profile-invariant-signup@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Invariant Signup"}'::jsonb,
    now(),
    now()
  );

  if not exists (
    select 1
    from public.profiles
    where id = v_user and role = 'customer'::public.user_role
  ) then
    raise exception 'signup did not create a customer identity profile';
  end if;

  if not exists (select 1 from public.customer_profiles where id = v_user) then
    raise exception 'signup created profiles without the required customer_profiles row';
  end if;

  insert into public.jobs (
    id, customer_id, service_type, description, status, kael_price_min, kael_price_max
  )
  values (
    v_job,
    v_user,
    'handyman'::public.service_type,
    'Matching invariant verification job',
    'awaiting_customer_confirm'::public.job_status,
    150000,
    200000
  );

  select *
  into v_result
  from public.begin_job_matching_preference_atomic(
    v_job,
    v_user,
    200000,
    '{"summary":"verified customer profile"}'::jsonb
  );

  if not coalesce(v_result.ok, false) then
    raise exception 'matching preference write failed with %', coalesce(v_result.error_code, '<null>');
  end if;

  if not exists (
    select 1
    from public.job_matching_preferences
    where job_id = v_job and customer_id = v_user
  ) then
    raise exception 'matching preference was not created for a valid customer profile';
  end if;
end;
$signup$;

do $role_transition$
declare
  v_user constant uuid := 'b7400000-0000-4000-8000-000000000002';
begin
  insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user,
    'authenticated',
    'authenticated',
    'customer-profile-invariant-transition@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Invariant Transition"}'::jsonb,
    now(),
    now()
  );

  delete from public.customer_profiles where id = v_user;
  update public.profiles
  set role = 'worker'::public.user_role
  where id = v_user;
  update public.profiles
  set role = 'customer'::public.user_role
  where id = v_user;

  if not exists (select 1 from public.customer_profiles where id = v_user) then
    raise exception 'role transition to customer did not restore customer_profiles';
  end if;
end;
$role_transition$;

do $backfill_gate$
declare
  v_missing integer;
begin
  select count(*)
  into v_missing
  from public.profiles as profile
  left join public.customer_profiles as customer_profile on customer_profile.id = profile.id
  where profile.role = 'customer'::public.user_role
    and customer_profile.id is null;

  if v_missing <> 0 then
    raise exception 'customer profile backfill left % customer identity rows without subprofiles', v_missing;
  end if;
end;
$backfill_gate$;

select jsonb_build_object(
  'signup_creates_customer_profile', true,
  'matching_preference_write_succeeds', true,
  'customer_role_transition_restores_profile', true,
  'existing_customer_rows_satisfy_invariant', true,
  'direct_function_execution_revoked', true
) as customer_profile_invariant_verification;

rollback;
