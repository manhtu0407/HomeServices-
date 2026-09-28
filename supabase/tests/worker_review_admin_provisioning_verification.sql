begin;

do $verification$
declare
  v_function regprocedure;
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.admin_operator_provisioning'::regclass and relrowsecurity
  ) then
    raise exception 'admin_operator_provisioning must keep RLS enabled';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.admin_operator_provisioning', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_operator_provisioning', 'select')
     or not pg_catalog.has_table_privilege('service_role', 'public.admin_operator_provisioning', 'select') then
    raise exception 'operator provisioning storage is not service-owned';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_operator_provisioning'
      and column_name like '%password%'
  ) then
    raise exception 'operator provisioning must never persist a password';
  end if;

  foreach v_function in array array[
    'public.save_worker_registration_draft_atomic(uuid,uuid,jsonb)'::regprocedure,
    'public.admin_review_worker_profile_snapshot_atomic(uuid,uuid,text,text,timestamptz,uuid)'::regprocedure,
    'public.admin_begin_operator_provisioning(uuid,text,text,text[])'::regprocedure,
    'public.admin_complete_operator_provisioning(uuid,uuid,uuid)'::regprocedure,
    'public.admin_fail_operator_provisioning(uuid,uuid,text)'::regprocedure
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc
      where oid = v_function and prosecdef and proconfig = array['search_path=""']::text[]
    ) then
      raise exception 'RPC % is not a locked-path definer', v_function;
    end if;
    if pg_catalog.has_function_privilege('anon', v_function, 'execute')
       or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
       or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'RPC % is not service-only', v_function;
    end if;
  end loop;

  v_function := 'public.get_admin_operator_activation_status(uuid)'::regprocedure;
  if not exists (
    select 1 from pg_catalog.pg_proc
    where oid = v_function and prosecdef and proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'activation receipt RPC is not a locked-path definer';
  end if;
  if pg_catalog.has_function_privilege('anon', v_function, 'execute')
     or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
     or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
    raise exception 'activation receipt RPC is not service-owned';
  end if;

  v_function := 'public.activate_admin_operator_atomic(uuid)'::regprocedure;
  if not exists (
    select 1 from pg_catalog.pg_proc
    where oid = v_function and prosecdef and proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'operator activation RPC is not a locked-path definer';
  end if;
  if pg_catalog.has_function_privilege('anon', v_function, 'execute')
     or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
     or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
    raise exception 'operator activation RPC is not service-owned';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created'
      and tgfoid = 'private.handle_new_user()'::regprocedure and not tgisinternal
  ) then
    raise exception 'signup trigger is not attached to the hardened private handler';
  end if;
end;
$verification$;

do $workflow$
declare
  v_owner constant uuid := 'b3100000-0000-4000-8000-000000000001';
  v_worker constant uuid := 'b3100000-0000-4000-8000-000000000002';
  v_operator constant uuid := 'b3100000-0000-4000-8000-000000000003';
  v_metadata_user constant uuid := 'b3100000-0000-4000-8000-000000000004';
  v_access_queue constant uuid := 'b3200000-0000-4000-8000-000000000001';
  v_profile_queue uuid;
  v_profile_revision timestamptz;
  v_provisioning uuid;
  v_retry_provisioning uuid;
  v_result record;
begin
  insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (v_owner, 'authenticated', 'authenticated', 'upgrade-owner@example.test',
      '{"provider":"email","providers":["email"]}', '{"full_name":"Upgrade Owner"}', now(), now()),
    (v_worker, 'authenticated', 'authenticated', 'upgrade-worker@example.test',
      '{"provider":"email","providers":["email"]}', '{"full_name":"Worker Candidate"}', now(), now()),
    (v_metadata_user, 'authenticated', 'authenticated', 'metadata-role@example.test',
      '{"provider":"email","providers":["email"]}', '{"role":"worker","full_name":"  Metadata   User  "}', now(), now());

  update public.profiles set role = 'admin'::public.user_role where id = v_owner;
  if not exists (
    select 1 from public.profiles
    where id = v_metadata_user and role = 'customer'::public.user_role and full_name = 'Metadata User'
  ) then
    raise exception 'client metadata changed the signup role or name normalization drifted';
  end if;

  insert into public.kael_admin_queue (
    id, actor_id, actor_role, queue_type, priority, status, escalation_level,
    reason_code, response_summary, safe_metadata
  ) values (
    v_access_queue, v_worker, 'customer', 'worker_application_review', 'medium',
    'open', 'soft', 'worker_signup', 'Worker access review',
    '{"contact_type":"email","contact_suffix":"test","language":"vi"}'
  );

  select * into v_result from public.admin_review_worker_application_atomic(
    v_access_queue, v_owner, 'approve', null
  );
  if v_result.ok is not true or v_result.role_out <> 'worker'::public.user_role then
    raise exception 'access approval did not grant Worker Sections access';
  end if;
  if not exists (
    select 1 from public.worker_profiles
    where id = v_worker and verification_status = 'draft'
      and not is_approved and not is_available
  ) then
    raise exception 'access approval incorrectly verified or enabled the worker';
  end if;

  select * into v_result from public.save_worker_registration_draft_atomic(
    v_worker, v_worker, '{"legal_name":"Nguyen Van B","districts":["q1"]}'
  );
  if v_result.ok is not true or not exists (
    select 1 from public.worker_profiles where id = v_worker and legal_name = 'Nguyen Van B'
  ) then
    raise exception 'valid partial worker draft was not persisted';
  end if;
  select * into v_result from public.save_worker_registration_draft_atomic(
    v_worker, v_worker, '{"unsupported":true}'
  );
  if v_result.ok is not false or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'unknown worker draft fields were accepted';
  end if;

  insert into storage.objects (bucket_id, name, owner, metadata) values
    ('worker-verification', v_worker || '/cccd-front/front.jpg', v_worker, '{"mimetype":"image/jpeg","size":"1024"}'),
    ('worker-verification', v_worker || '/cccd-back/back.jpg', v_worker, '{"mimetype":"image/jpeg","size":"1024"}'),
    ('worker-verification', v_worker || '/selfie/selfie.jpg', v_worker, '{"mimetype":"image/jpeg","size":"1024"}');

  select * into v_result from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van B', '1992-05-12'::date, null,
    array['electrical'::public.service_type], 4, array['q1'], null, null, 8,
    '{}'::text[],
    'supabase://worker-verification/' || v_worker || '/cccd-front/front.jpg',
    'supabase://worker-verification/' || v_worker || '/cccd-back/back.jpg',
    'supabase://worker-verification/' || v_worker || '/selfie/selfie.jpg',
    '0123456789', 'Vietcombank'
  );
  if v_result.ok is not true or v_result.verification_status_out <> 'submitted' then
    raise exception 'complete worker profile was not submitted';
  end if;
  select id into v_profile_queue from public.kael_admin_queue
  where actor_id = v_worker and queue_type = 'worker_profile_verification'
    and status = 'open';
  if v_profile_queue is null then
    raise exception 'profile submission did not enter the verification queue';
  end if;
  select updated_at into strict v_profile_revision from public.worker_profiles where id = v_worker;
  -- First approval requires the CCCD number the admin reads off the ID photo (20260925121000).
  insert into public.worker_identity_numbers (worker_id, cccd_hmac, cccd_last4, entered_by)
  values (v_worker, repeat('c7', 32), '6789', v_owner);

  select * into v_result from public.admin_review_worker_profile_snapshot_atomic(
    v_profile_queue, v_owner, 'request_changes', null, v_profile_revision, v_access_queue
  );
  if v_result.ok is not false or v_result.error_code <> 'INVALID_DECISION' then
    raise exception 'profile change request was accepted without a reason';
  end if;
  select * into v_result from public.admin_review_worker_profile_snapshot_atomic(
    v_profile_queue, v_owner, 'approve', null, v_profile_revision, v_access_queue
  );
  if v_result.ok is not true or v_result.verification_status <> 'approved' then
    raise exception 'complete worker profile was not verified';
  end if;
  if not exists (
    select 1 from public.worker_profiles
    where id = v_worker and is_approved and not is_available
  ) or not exists (
    select 1 from public.admin_worker_application_reviews
    where queue_id = v_profile_queue and review_stage = 'profile'
  ) then
    raise exception 'profile verification state or audit history is incomplete';
  end if;

  select * into v_result from public.admin_begin_operator_provisioning(
    v_owner, 'upgrade.operator@gmail.com', 'Upgrade Operator',
    array['finance.read','workers.read','team.read']
  );
  if v_result.ok is not true then raise exception 'Owner could not begin operator provisioning'; end if;
  v_provisioning := v_result.provisioning_id;

  insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_operator, 'authenticated', 'authenticated', 'upgrade.operator@gmail.com',
    '{"provider":"email","providers":["email"]}', '{"full_name":"Upgrade Operator"}', now(), now()
  );
  select * into v_result from public.admin_complete_operator_provisioning(v_owner, v_provisioning, v_operator);
  if v_result.ok is not true or not exists (
    select 1 from public.admin_operator_provisioning
    where id = v_provisioning and status = 'pending_password_change' and user_id = v_operator
  ) then
    raise exception 'provisioned account did not enter first-password state';
  end if;
  if not exists (
    select 1 from public.profiles where id = v_operator and role = 'customer'::public.user_role
  ) then
    raise exception 'operator received privilege before first-password activation';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  perform pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, true);
  select * into v_result from public.activate_admin_operator_atomic(v_operator);
  if v_result.ok is not false or v_result.error_code <> 'ACTOR_MISMATCH' then
    raise exception 'operator activation accepted a different authenticated actor';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
  perform pg_catalog.set_config('request.jwt.claim.sub', v_operator::text, true);
  select * into v_result from public.get_admin_operator_activation_status(v_operator);
  if v_result.status <> 'pending_password_change'
     or v_result.email <> 'upgrade.operator@gmail.com'
     or not ('finance.read' = any(v_result.capabilities)) then
    raise exception 'operator activation status receipt is incomplete';
  end if;

  select * into v_result from public.activate_admin_operator_atomic(v_operator);
  if v_result.ok is not true or v_result.role_out <> 'admin_operator'::public.user_role
     or not ('finance.read' = any(v_result.capabilities_out)) then
    raise exception 'first-password activation did not atomically grant exact operator access';
  end if;
  select * into v_result from public.activate_admin_operator_atomic(v_operator);
  if v_result.ok is not true then raise exception 'operator activation is not idempotent'; end if;

  select * into v_result from public.admin_begin_operator_provisioning(
    v_owner, 'retry.operator@gmail.com', 'Retry Operator', array['finance.read']
  );
  v_retry_provisioning := v_result.provisioning_id;
  perform public.admin_fail_operator_provisioning(v_owner, v_retry_provisioning, 'AUTH_CREATE_FAILED');
  select * into v_result from public.admin_begin_operator_provisioning(
    v_owner, 'retry.operator@gmail.com', 'Retry Operator', array['finance.read']
  );
  if v_result.ok is not true or v_result.provisioning_id <> v_retry_provisioning then
    raise exception 'failed provisioning intent could not be retried safely';
  end if;
end;
$workflow$;

select jsonb_build_object(
  'worker_access_and_verification_are_separate', true,
  'worker_drafts_are_server_owned', true,
  'operator_passwords_are_not_persisted', true,
  'operator_activation_is_atomic', true
);

rollback;
