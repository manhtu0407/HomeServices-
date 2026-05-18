-- =============================================================================
-- Staging Accept Privacy Guard Verification
--
-- Single-statement harness for `supabase db query`. It cleans deterministic
-- fixtures before and after the probe.
-- =============================================================================

do $$
declare
  v_outsider_no_broadcast_error text;
  v_eligible_accept_ok boolean;
  v_eligible_accept_status public.job_status;
  v_job_status_after public.job_status;
  v_broadcast_status_after public.broadcast_status;
  v_worker_available_after boolean;
begin
  delete from public.job_broadcasts
  where job_id in (
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002'
  );
  delete from public.jobs
  where id in (
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002'
  );
  delete from public.worker_profiles
  where id in (
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000003'
  );
  delete from public.customer_profiles
  where id = '91000000-0000-4000-8000-000000000001';
  delete from public.profiles
  where id in (
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000003'
  );
  delete from auth.users
  where id in (
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000003'
  );

  insert into auth.users (
    id,
    aud,
    role,
    email,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values
    (
      '91000000-0000-4000-8000-000000000001',
      'authenticated',
      'authenticated',
      'codex-privacy-customer@example.test',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      '91000000-0000-4000-8000-000000000002',
      'authenticated',
      'authenticated',
      'codex-privacy-worker-ok@example.test',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      '91000000-0000-4000-8000-000000000003',
      'authenticated',
      'authenticated',
      'codex-privacy-worker-outsider@example.test',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    );

  update public.profiles
  set role = 'customer', full_name = 'Codex Privacy Customer'
  where id = '91000000-0000-4000-8000-000000000001';

  update public.profiles
  set role = 'worker', full_name = 'Codex Privacy Worker OK'
  where id = '91000000-0000-4000-8000-000000000002';

  update public.profiles
  set role = 'worker', full_name = 'Codex Privacy Worker Outsider'
  where id = '91000000-0000-4000-8000-000000000003';

  insert into public.worker_profiles (
    id,
    service_types,
    years_experience,
    districts,
    is_approved,
    is_available,
    legal_name,
    date_of_birth,
    verification_status,
    is_suspended
  ) values
    (
      '91000000-0000-4000-8000-000000000002',
      array['plumbing']::public.service_type[],
      5,
      array['q7'],
      true,
      true,
      'Codex Worker OK',
      '1990-01-01',
      'approved',
      false
    ),
    (
      '91000000-0000-4000-8000-000000000003',
      array['plumbing']::public.service_type[],
      5,
      array['q7'],
      true,
      true,
      'Codex Worker Outsider',
      '1990-01-01',
      'approved',
      false
    );

  insert into public.jobs (
    id,
    customer_id,
    service_type,
    service_problem_id,
    problem_chips,
    description,
    address_building,
    address_unit,
    address_floor,
    address_district,
    status
  ) values
    (
      '92000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'plumbing',
      (select id from public.service_problems where service_type = 'plumbing' limit 1),
      array['pipe_leak'],
      'Privacy probe non-broadcast job',
      'Codex Tower',
      '1',
      '1',
      'q7',
      'cancelled'
    ),
    (
      '92000000-0000-4000-8000-000000000002',
      '91000000-0000-4000-8000-000000000001',
      'plumbing',
      (select id from public.service_problems where service_type = 'plumbing' limit 1),
      array['pipe_leak'],
      'Privacy probe broadcasting job',
      'Codex Tower',
      '1',
      '1',
      'q7',
      'broadcasting'
    );

  insert into public.job_broadcasts (
    id,
    job_id,
    worker_id,
    status,
    sent_at,
    broadcast_at,
    expires_at
  ) values (
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    'sent',
    now(),
    now(),
    now() + interval '60 seconds'
  );

  select error_code
  into v_outsider_no_broadcast_error
  from public.accept_broadcast_atomic(
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000003'
  );

  select ok, job_status
  into v_eligible_accept_ok, v_eligible_accept_status
  from public.accept_broadcast_atomic(
    '92000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002'
  );

  select status
  into v_job_status_after
  from public.jobs
  where id = '92000000-0000-4000-8000-000000000002';

  select status
  into v_broadcast_status_after
  from public.job_broadcasts
  where id = '93000000-0000-4000-8000-000000000001';

  select is_available
  into v_worker_available_after
  from public.worker_profiles
  where id = '91000000-0000-4000-8000-000000000002';

  if v_outsider_no_broadcast_error <> 'NOT_FOUND' then
    raise exception 'privacy probe expected NOT_FOUND, got %', v_outsider_no_broadcast_error;
  end if;

  if v_eligible_accept_ok is not true then
    raise exception 'positive accept expected ok=true';
  end if;

  if v_eligible_accept_status <> 'worker_matched'::public.job_status then
    raise exception 'positive accept expected worker_matched, got %', v_eligible_accept_status;
  end if;

  if v_job_status_after <> 'worker_matched'::public.job_status then
    raise exception 'job status expected worker_matched, got %', v_job_status_after;
  end if;

  if v_broadcast_status_after <> 'accepted'::public.broadcast_status then
    raise exception 'broadcast status expected accepted, got %', v_broadcast_status_after;
  end if;

  if v_worker_available_after is not false then
    raise exception 'worker availability expected false';
  end if;

  raise notice
    'accept_privacy_guard ok: outsider=%, accept=%, job=%, broadcast=%, worker_available=%',
    v_outsider_no_broadcast_error,
    v_eligible_accept_status,
    v_job_status_after,
    v_broadcast_status_after,
    v_worker_available_after;

  delete from public.job_broadcasts
  where job_id in (
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002'
  );
  delete from public.jobs
  where id in (
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002'
  );
  delete from public.worker_profiles
  where id in (
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000003'
  );
  delete from public.customer_profiles
  where id = '91000000-0000-4000-8000-000000000001';
  delete from public.profiles
  where id in (
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000003'
  );
  delete from auth.users
  where id in (
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000003'
  );
exception
  when others then
    delete from public.job_broadcasts
    where job_id in (
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000002'
    );
    delete from public.jobs
    where id in (
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000002'
    );
    delete from public.worker_profiles
    where id in (
      '91000000-0000-4000-8000-000000000002',
      '91000000-0000-4000-8000-000000000003'
    );
    delete from public.customer_profiles
    where id = '91000000-0000-4000-8000-000000000001';
    delete from public.profiles
    where id in (
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000002',
      '91000000-0000-4000-8000-000000000003'
    );
    delete from auth.users
    where id in (
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000002',
      '91000000-0000-4000-8000-000000000003'
    );
    raise;
end $$;
