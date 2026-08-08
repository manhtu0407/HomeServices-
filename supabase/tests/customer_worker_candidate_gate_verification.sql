-- Rollback-only ownership, idempotency, and serialized-race verification for
-- the customer-confirmed worker candidate gate. Run only on local or staging.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'b1100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'candidate-owner@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b1100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'candidate-outsider@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b1100000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'candidate-worker-one@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b1100000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'candidate-worker-two@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set role = 'worker'
where id in (
  'b1100000-0000-4000-8000-000000000003',
  'b1100000-0000-4000-8000-000000000004'
);

insert into public.customer_profiles (id, district) values
  ('b1100000-0000-4000-8000-000000000001', 'q7'),
  ('b1100000-0000-4000-8000-000000000002', 'q2');

insert into public.worker_profiles (
  id, service_types, selected_service_types, years_experience, districts, is_approved, is_available,
  legal_name, date_of_birth, verification_status
) values
  (
    'b1100000-0000-4000-8000-000000000003',
    array['electrical']::public.service_type[], array['electrical']::public.service_type[], 5, array['q7'], true, true,
    'Candidate Worker One', '1990-01-01', 'approved'
  ),
  (
    'b1100000-0000-4000-8000-000000000004',
    array['electrical']::public.service_type[], array['electrical']::public.service_type[], 4, array['q7'], true, true,
    'Candidate Worker Two', '1991-01-01', 'approved'
  );

insert into public.jobs (
  id, customer_id, service_type, service_problem_id, description,
  address_building, address_unit, address_floor, address_district, status
) values
  (
    'b1200000-0000-4000-8000-000000000001',
    'b1100000-0000-4000-8000-000000000001',
    'electrical',
    (select id from public.service_problems where slug = 'electrical-general'),
    'Candidate confirmation fixture', 'Private Building', '1201', '12', 'q7',
    'broadcasting'
  ),
  (
    'b1200000-0000-4000-8000-000000000002',
    'b1100000-0000-4000-8000-000000000001',
    'electrical',
    (select id from public.service_problems where slug = 'electrical-general'),
    'Candidate rejection fixture', 'Private Building', '1202', '12', 'q7',
    'broadcasting'
  );

insert into public.job_broadcasts (
  id, job_id, worker_id, status, sent_at, expires_at
) values
  (
    'b1300000-0000-4000-8000-000000000001',
    'b1200000-0000-4000-8000-000000000001',
    'b1100000-0000-4000-8000-000000000003',
    'sent', now(), now() + interval '5 minutes'
  ),
  (
    'b1300000-0000-4000-8000-000000000002',
    'b1200000-0000-4000-8000-000000000001',
    'b1100000-0000-4000-8000-000000000004',
    'sent', now(), now() + interval '5 minutes'
  ),
  (
    'b1300000-0000-4000-8000-000000000003',
    'b1200000-0000-4000-8000-000000000002',
    'b1100000-0000-4000-8000-000000000004',
    'sent', now(), now() + interval '5 minutes'
  );

do $$
declare
  v_first record;
  v_second record;
  v_non_owner record;
  v_confirm record;
  v_confirm_retry record;
begin
  select * into v_first
  from public.accept_broadcast_atomic(
    'b1200000-0000-4000-8000-000000000001',
    'b1100000-0000-4000-8000-000000000003'
  );

  if v_first.ok is not true
    or v_first.job_status <> 'worker_candidate_pending'
    or v_first.candidate_id is null
  then
    raise exception 'first worker did not become the proposed candidate';
  end if;

  if exists (
    select 1 from public.jobs
    where id = 'b1200000-0000-4000-8000-000000000001'
      and (worker_id is not null or matched_at is not null)
  ) then
    raise exception 'jobs.worker_id leaked before customer confirmation';
  end if;

  select * into v_second
  from public.accept_broadcast_atomic(
    'b1200000-0000-4000-8000-000000000001',
    'b1100000-0000-4000-8000-000000000004'
  );
  -- Reassigned broadcasts fail the pre-status membership privacy check.
  if v_second.ok is true or v_second.error_code <> 'NOT_FOUND' then
    raise exception 'second worker accept won the same job';
  end if;

  select * into v_non_owner
  from public.confirm_worker_candidate_atomic(
    'b1200000-0000-4000-8000-000000000001',
    v_first.candidate_id,
    'b1100000-0000-4000-8000-000000000002'
  );
  if v_non_owner.ok is true or v_non_owner.error_code <> 'NOT_FOUND' then
    raise exception 'non-owner customer confirmation was denied';
  end if;

  select * into v_confirm
  from public.confirm_worker_candidate_atomic(
    'b1200000-0000-4000-8000-000000000001',
    v_first.candidate_id,
    'b1100000-0000-4000-8000-000000000001'
  );
  if v_confirm.ok is not true
    or v_confirm.job_status <> 'worker_matched'
    or v_confirm.already_applied is true
  then
    raise exception 'owning customer confirmation failed';
  end if;

  select * into v_confirm_retry
  from public.confirm_worker_candidate_atomic(
    'b1200000-0000-4000-8000-000000000001',
    v_first.candidate_id,
    'b1100000-0000-4000-8000-000000000001'
  );
  if v_confirm_retry.ok is not true
    or v_confirm_retry.already_applied is not true
  then
    raise exception 'confirm retry was not idempotent';
  end if;
end;
$$;

do $$
declare
  v_accept record;
  v_reject record;
  v_retry record;
begin
  select * into v_accept
  from public.accept_broadcast_atomic(
    'b1200000-0000-4000-8000-000000000002',
    'b1100000-0000-4000-8000-000000000004'
  );
  if v_accept.ok is not true then
    raise exception 'reject fixture worker accept failed';
  end if;

  select * into v_reject
  from public.reject_worker_candidate_atomic(
    'b1200000-0000-4000-8000-000000000002',
    v_accept.candidate_id,
    'b1100000-0000-4000-8000-000000000001'
  );
  if v_reject.ok is not true
    or v_reject.job_status <> 'broadcasting'
    or v_reject.already_applied is true
  then
    raise exception 'owning customer rejection failed';
  end if;

  if not exists (
    select 1 from public.worker_profiles
    where id = 'b1100000-0000-4000-8000-000000000004'
      and is_available is true
  ) then
    raise exception 'candidate lifecycle overwrote worker availability preference';
  end if;

  select * into v_retry
  from public.reject_worker_candidate_atomic(
    'b1200000-0000-4000-8000-000000000002',
    v_accept.candidate_id,
    'b1100000-0000-4000-8000-000000000001'
  );
  if v_retry.ok is not true or v_retry.already_applied is not true then
    raise exception 'reject retry was not idempotent';
  end if;
end;
$$;

do $$
begin
  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.accept_broadcast_atomic(uuid, uuid)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.confirm_worker_candidate_atomic(uuid, uuid, uuid)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.reject_worker_candidate_atomic(uuid, uuid, uuid)',
    'execute'
  ) then
    raise exception 'authenticated role can execute a server-owned candidate RPC';
  end if;
end;
$$;

select jsonb_build_object(
  'owner_confirmation', true,
  'non_owner_denied', true,
  'serialized_accept_race', true,
  'confirm_idempotency', true,
  'reject_idempotency', true,
  'reservation_release', true,
  'preconfirm_address_lock', true,
  'service_role_only_rpc', true
) as customer_worker_candidate_gate_verification;

rollback;
