begin;

do $$
declare
  v_worker constant uuid := '96000000-0000-4000-8000-000000000001';
  v_customer constant uuid := '96000000-0000-4000-8000-000000000002';
  v_before_ctid text;
  v_after_ctid text;
  v_result record;
  v_status public.worker_verification_status;
  v_approved boolean;
  v_suspended boolean;
  v_patch jsonb;
  v_attempt public.worker_profiles%rowtype;
  v_before_row jsonb;
  v_before_queue jsonb;
begin
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
      v_worker,
      'authenticated',
      'authenticated',
      'codex-worker-registration@example.test',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_customer,
      'authenticated',
      'authenticated',
      'codex-worker-registration-customer@example.test',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    );

  update public.profiles
  set role = 'worker'::public.user_role
  where id = v_worker;

  insert into storage.objects (bucket_id, name, owner, metadata) values
    (
      'worker-verification',
      '96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
      v_worker,
      '{"mimetype":"image/jpeg","size":"1024"}'::jsonb
    ),
    (
      'worker-verification',
      '96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
      v_worker,
      '{"mimetype":"image/jpeg","size":"1024"}'::jsonb
    ),
    (
      'worker-verification',
      '96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
      v_worker,
      '{"mimetype":"image/jpeg","size":"1024"}'::jsonb
    ),
    (
      'job-media',
      '96000000-0000-4000-8000-000000000001/cccd-front/wrong-bucket.jpg',
      v_worker,
      '{"mimetype":"image/jpeg","size":"1024"}'::jsonb
    ),
    (
      'worker-verification',
      '96000000-0000-4000-8000-000000000001/cccd-front/oversize.jpg',
      v_worker,
      '{"mimetype":"image/jpeg","size":"10485761"}'::jsonb
    ),
    (
      'worker-verification',
      '96000000-0000-4000-8000-000000000001/cccd-front/wrong-owner.jpg',
      v_customer,
      '{"mimetype":"image/jpeg","size":"1024"}'::jsonb
    ),
    (
      'worker-verification',
      '96000000-0000-4000-8000-000000000001/cccd-front/disallowed-mime.jpg',
      v_worker,
      '{"mimetype":"application/pdf","size":"1024"}'::jsonb
    );

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker,
    v_worker,
    'Nguyen Van A',
    '1990-01-15'::date,
    'male',
    array['electrical'::public.service_type],
    5,
    array['q1'],
    10.775,
    106.7,
    8,
    array['outlet_repair'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '0123456789',
    'Vietcombank'
  );

  if v_result.ok is not true
     or v_result.verification_status_out <> 'submitted'::public.worker_verification_status
     or v_result.idempotent_out is true then
    raise exception 'initial worker registration did not submit atomically';
  end if;

  select ctid::text into v_before_ctid
  from public.worker_profiles
  where id = v_worker;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker,
    v_worker,
    'Nguyen Van A',
    '1990-01-15'::date,
    'male',
    array['electrical'::public.service_type],
    5,
    array['q1'],
    10.775,
    106.7,
    8,
    array['outlet_repair'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '0123456789',
    'Vietcombank'
  );

  select ctid::text into v_after_ctid
  from public.worker_profiles
  where id = v_worker;

  if v_result.ok is not true
     or v_result.idempotent_out is not true
     or v_after_ctid is distinct from v_before_ctid then
    raise exception 'idempotent replay performed a write';
  end if;

  select to_jsonb(worker) into v_before_row
  from public.worker_profiles as worker where worker.id = v_worker;
  select jsonb_agg(to_jsonb(queue) order by queue.id) into v_before_queue
  from public.kael_admin_queue as queue where queue.actor_id = v_worker;

  insert into storage.objects (bucket_id, name, owner, metadata)
  select bucket_id, replace(name, '.jpg', '-replacement.jpg'), owner, metadata
  from storage.objects
  where bucket_id = 'worker-verification' and owner = v_worker
    and name in (
      v_worker::text || '/cccd-front/front.jpg',
      v_worker::text || '/cccd-back/back.jpg',
      v_worker::text || '/selfie/selfie.jpg'
    );

  -- Review must observe the submitted snapshot even if a delayed client sends
  -- another valid payload. Validate every mutable field, including owned media.
  for v_patch in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('legal_name', 'Nguyen Van B'),
    jsonb_build_object('date_of_birth', '1991-02-16'),
    jsonb_build_object('gender', 'female'),
    jsonb_build_object('service_types', array['plumbing']),
    jsonb_build_object('years_experience', 6),
    jsonb_build_object('districts', array['q3']),
    jsonb_build_object('home_lat', 10.776),
    jsonb_build_object('home_lng', 106.701),
    jsonb_build_object('service_radius_km', 9),
    jsonb_build_object('problem_specializations', array['pipe_leak']),
    jsonb_build_object('cccd_front_url', replace(v_before_row->>'cccd_front_url', '.jpg', '-replacement.jpg')),
    jsonb_build_object('cccd_back_url', replace(v_before_row->>'cccd_back_url', '.jpg', '-replacement.jpg')),
    jsonb_build_object('selfie_url', replace(v_before_row->>'selfie_url', '.jpg', '-replacement.jpg')),
    jsonb_build_object('bank_account', '9988776655'),
    jsonb_build_object('bank_name', 'Techcombank')
  )) loop
    select * into v_attempt from jsonb_populate_record(
      null::public.worker_profiles, v_before_row || v_patch
    );
    select * into v_result from public.submit_worker_registration_atomic(
      v_worker, v_worker, v_attempt.legal_name, v_attempt.date_of_birth, v_attempt.gender,
      v_attempt.service_types, v_attempt.years_experience, v_attempt.districts,
      v_attempt.home_lat, v_attempt.home_lng, v_attempt.service_radius_km,
      v_attempt.problem_specializations, v_attempt.cccd_front_url,
      v_attempt.cccd_back_url, v_attempt.selfie_url, v_attempt.bank_account, v_attempt.bank_name
    );
    select ctid::text into v_after_ctid from public.worker_profiles where id = v_worker;
    if v_result.ok is not false
       or v_result.error_code is distinct from 'ALREADY_FINALIZED'
       or v_result.worker_id_out is distinct from v_worker
       or v_result.verification_status_out is distinct from 'submitted'::public.worker_verification_status
       or v_result.idempotent_out is not false
       or v_after_ctid is distinct from v_before_ctid
       or (select to_jsonb(worker) from public.worker_profiles as worker where worker.id = v_worker)
          is distinct from v_before_row
       or (select jsonb_agg(to_jsonb(queue) order by queue.id)
           from public.kael_admin_queue as queue where queue.actor_id = v_worker)
          is distinct from v_before_queue then
      raise exception 'submitted KYC payload or review queue was overwritten for field %',
        (select jsonb_object_keys(v_patch));
    end if;
  end loop;

  -- Rejected rows remain correctable under the current B0 contract; the row
  -- lock makes their transition back to submitted atomic.
  update public.worker_profiles
  set verification_status = 'rejected'::public.worker_verification_status
  where id = v_worker;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], 10.775, 106.7,
    8, array['outlet_repair'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '9988776655', 'Vietcombank'
  );

  if v_result.ok is not true
     or v_result.verification_status_out <> 'submitted'::public.worker_verification_status
     or v_result.idempotent_out is true then
    raise exception 'corrected rejected registration was not resubmitted';
  end if;

  update public.worker_profiles
  set verification_status = 'under_review'::public.worker_verification_status
  where id = v_worker;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], 10.775, 106.7,
    8, array['outlet_repair'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1122334455', 'Techcombank'
  );

  select verification_status
  into v_status
  from public.worker_profiles
  where id = v_worker;

  if v_result.ok is true
     or v_result.error_code <> 'ALREADY_FINALIZED'
     or v_status <> 'under_review'::public.worker_verification_status
     or exists (
       select 1
       from public.worker_profiles
       where id = v_worker
         and bank_name = 'Techcombank'
     ) then
    raise exception 'under-review registration was reset or overwritten';
  end if;

  update public.worker_profiles
  set
    verification_status = 'under_review'::public.worker_verification_status,
    is_approved = true
  where id = v_worker;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], 10.775, 106.7,
    8, array['outlet_repair'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '3344556677', 'Vietcombank'
  );

  select verification_status, is_approved
  into v_status, v_approved
  from public.worker_profiles
  where id = v_worker;

  if v_result.ok is true
     or v_result.error_code <> 'ALREADY_FINALIZED'
     or v_status <> 'under_review'::public.worker_verification_status
     or v_approved is not true then
    raise exception 'approved flag was reopened by registration';
  end if;

  -- Admin-first is one legal serialization outcome: the registration waits on
  -- the same row and must observe the final approval instead of reopening it.
  -- First approval requires the CCCD number the admin reads off the ID photo (20260928121000).
  insert into public.worker_identity_numbers (worker_id, cccd_hmac, cccd_last4, entered_by)
  values (v_worker, repeat('c7', 32), '6789', v_worker)
  on conflict (worker_id) do nothing;
  update public.worker_profiles
  set
    verification_status = 'approved'::public.worker_verification_status,
    is_approved = true
  where id = v_worker;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], 10.775, 106.7,
    8, array['outlet_repair'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '5566778899', 'Vietcombank'
  );

  select verification_status, is_approved
  into v_status, v_approved
  from public.worker_profiles
  where id = v_worker;

  if v_result.ok is true
     or v_result.error_code <> 'ALREADY_FINALIZED'
     or v_status <> 'approved'::public.worker_verification_status
     or v_approved is not true then
    raise exception 'approved registration was reopened';
  end if;

  update public.worker_profiles
  set
    verification_status = 'under_review'::public.worker_verification_status,
    is_approved = false,
    is_suspended = true
  where id = v_worker;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], 10.775, 106.7,
    8, array['outlet_repair'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '6677889900', 'Vietcombank'
  );

  select verification_status, is_suspended
  into v_status, v_suspended
  from public.worker_profiles
  where id = v_worker;

  if v_result.ok is true
     or v_result.error_code <> 'ALREADY_FINALIZED'
     or v_status <> 'under_review'::public.worker_verification_status
     or v_suspended is not true then
    raise exception 'suspended registration was reopened';
  end if;

  -- Registration-first is the other legal serialization outcome. A later
  -- admin finalization remains final and is never reverted by a retry.
  update public.worker_profiles
  set
    verification_status = 'rejected'::public.worker_verification_status,
    is_suspended = false
  where id = v_worker;

  perform public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], 10.775, 106.7,
    8, array['outlet_repair'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '7788990011', 'Vietcombank'
  );

  -- First approval requires the CCCD number the admin reads off the ID photo (20260928121000).
  insert into public.worker_identity_numbers (worker_id, cccd_hmac, cccd_last4, entered_by)
  values (v_worker, repeat('c7', 32), '6789', v_worker)
  on conflict (worker_id) do nothing;
  update public.worker_profiles
  set
    verification_status = 'approved'::public.worker_verification_status,
    is_approved = true
  where id = v_worker;

  perform public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], 10.775, 106.7,
    8, array['outlet_repair'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '8899001122', 'Vietcombank'
  );

  select verification_status, is_approved
  into v_status, v_approved
  from public.worker_profiles
  where id = v_worker;

  if v_status <> 'approved'::public.worker_verification_status
     or v_approved is not true then
    raise exception 'registration-first serialization lost later admin approval';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array[null::public.service_type], 5, array['q1'], null, null,
    8, array['outlet_repair'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1234567890', 'Vietcombank'
  );

  if v_result.ok is true or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'null service type element crossed the registration boundary';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array[null::text], null, null,
    8, array['outlet_repair'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1234567890', 'Vietcombank'
  );

  if v_result.ok is true or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'null district element crossed the registration boundary';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], null, null,
    8, array[null::text],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1234567890', 'Vietcombank'
  );

  if v_result.ok is true or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'null specialization element crossed the registration boundary';
  end if;

  update public.worker_profiles
  set verification_status = 'rejected'::public.worker_verification_status,
      is_approved = false,
      is_suspended = false,
      bank_name = 'StorageGuardBank'
  where id = v_worker;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], null, null,
    8, '{}'::text[],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/missing.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1234567890', 'ShouldNotWrite'
  );
  if v_result.ok is true or v_result.error_code <> 'INVALID_INPUT'
    or (
      select worker.bank_name from public.worker_profiles as worker
      where worker.id = v_worker
    ) is distinct from 'StorageGuardBank'
  then
    raise exception 'missing verification object was accepted or partially written';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], null, null,
    8, '{}'::text[],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/wrong-bucket.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1234567890', 'ShouldNotWrite'
  );
  if v_result.ok is true or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'wrong-bucket verification object was accepted';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], null, null,
    8, '{}'::text[],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/wrong-owner.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1234567890', 'ShouldNotWrite'
  );
  if v_result.ok is true or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'wrong-owner verification object was accepted';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], null, null,
    8, '{}'::text[],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/oversize.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1234567890', 'ShouldNotWrite'
  );
  if v_result.ok is true or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'oversize verification object was accepted';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], null, null,
    8, '{}'::text[],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/disallowed-mime.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1234567890', 'ShouldNotWrite'
  );
  if v_result.ok is true or v_result.error_code <> 'INVALID_INPUT'
    or (
      select worker.bank_name from public.worker_profiles as worker
      where worker.id = v_worker
    ) is distinct from 'StorageGuardBank'
  then
    raise exception 'disallowed-mime verification object was accepted or partially written';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], null, null,
    8, '{}'::text[],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000002/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1234567890', 'Vietcombank'
  );

  if v_result.ok is true or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'cross-worker verification ref was accepted';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], null, null,
    8, '{}'::text[],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1234567890', 'Vietcombank'
  );

  if v_result.ok is true or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'wrong verification document folder was accepted';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], null, null,
    8, '{}'::text[],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/../selfie.jpg',
    '1234567890', 'Vietcombank'
  );

  if v_result.ok is true or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'verification ref traversal was accepted';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_customer, v_customer, 'Customer Actor', '1990-01-15'::date, null,
    array['cleaning'::public.service_type], 1, array['q1'], null, null,
    8, '{}'::text[],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000002/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000002/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000002/selfie/selfie.jpg',
    '1234567890', 'Vietcombank'
  );

  if v_result.ok is true or v_result.error_code <> 'WRONG_ROLE' then
    raise exception 'customer profile bypassed worker role validation';
  end if;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_customer, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    array['electrical'::public.service_type], 5, array['q1'], null, null,
    8, '{}'::text[],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '1234567890', 'Vietcombank'
  );

  if v_result.ok is true or v_result.error_code <> 'NOT_OWNER' then
    raise exception 'service caller bypassed worker ownership validation';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.submit_worker_registration_atomic(uuid,uuid,text,date,text,public.service_type[],integer,text[],numeric,numeric,integer,text[],text,text,text,text,text)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.submit_worker_registration_atomic(uuid,uuid,text,date,text,public.service_type[],integer,text[],numeric,numeric,integer,text[],text,text,text,text,text)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.submit_worker_registration_atomic(uuid,uuid,text,date,text,public.service_type[],integer,text[],numeric,numeric,integer,text[],text,text,text,text,text)',
    'execute'
  ) then
    raise exception 'service_role_only_rpc privilege contract failed';
  end if;
end $$;

rollback;
