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
  v_saved jsonb;
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


  foreach v_status in array array['submitted','under_review','suspended']::public.worker_verification_status[] loop
    update public.worker_profiles set verification_status=v_status, is_approved=false, is_suspended=false where id=v_worker;
    select ctid::text into v_before_ctid from public.worker_profiles where id=v_worker;
    select * into v_result from public.update_worker_service_area_atomic(v_worker,v_worker,'{"districts":["q3"]}'::jsonb);
    select ctid::text into v_after_ctid from public.worker_profiles where id=v_worker;
    if v_result.ok is not false or v_result.error_code is distinct from 'ALREADY_FINALIZED'
      or v_after_ctid is distinct from v_before_ctid then
      raise exception 'service-area altered review-locked worker state %',v_status;
    end if;
  end loop;

  -- First approval requires the CCCD number the admin reads off the ID photo (20260928121000).
  insert into public.worker_identity_numbers (worker_id, cccd_hmac, cccd_last4, entered_by)
  values (v_worker, repeat('c7', 32), '6789', v_worker)
  on conflict (worker_id) do nothing;
  foreach v_status in array array['draft','rejected','approved']::public.worker_verification_status[] loop
    update public.worker_profiles set verification_status=v_status, is_approved=(v_status='approved'),
      is_suspended=false, districts=array['q1'], home_lat=10.775, home_lng=106.7, service_radius_km=8 where id=v_worker;
    select * into v_result from public.update_worker_service_area_atomic(v_worker,v_worker,'{"districts":["q3"]}'::jsonb);
    if v_result.ok is not true or v_result.worker_id is distinct from v_worker or v_result.updated_at is null
      or not exists(select 1 from public.worker_profiles where id=v_worker and districts=array['q3']
        and home_lat=10.775 and home_lng=106.7 and service_radius_km=8 and verification_status=v_status) then
      raise exception 'service-area failed valid update or overwrote omitted values in state %',v_status;
    end if;
    select ctid::text into v_before_ctid from public.worker_profiles where id=v_worker;
    perform public.update_worker_service_area_atomic(v_worker,v_worker,'{"districts":["q3"]}'::jsonb);
    select ctid::text into v_after_ctid from public.worker_profiles where id=v_worker;
    if v_after_ctid is distinct from v_before_ctid then
      raise exception 'service-area exact replay performed a write';
    end if;
  end loop;

  select * into v_result from public.update_worker_service_area_atomic(v_worker,v_worker,'{"districts":["q3"],"service_radius_km":8.0}'::jsonb);
  if v_result.ok is not true then
    raise exception 'service-area integral JSON number with scale was rejected';
  end if;

  select * into v_result from public.update_worker_service_area_atomic(
    v_worker,v_worker,'{"districts":["q3"],"home_lat":null,"home_lng":null}'::jsonb);
  if v_result.ok is not true or not exists(select 1 from public.worker_profiles
    where id=v_worker and home_lat is null and home_lng is null and service_radius_km=8) then
    raise exception 'service-area explicit nullable fields were not honored';
  end if;
  select to_jsonb(worker) into v_saved from public.worker_profiles worker where id=v_worker;
  for v_patch in select value from jsonb_array_elements('[
    null, [], {}, {"districts":"q1"}, {"districts":[]}, {"districts":[null]},
    {"districts":["invalid"]}, {"districts":["q3"],"verification_status":"approved"},
    {"districts":["q3"],"home_lat":10}, {"districts":["q3"],"home_lng":106},
    {"districts":["q3"],"home_lat":null,"home_lng":106},
    {"districts":["q3"],"home_lat":91,"home_lng":106},
    {"districts":["q3"],"home_lat":10,"home_lng":181},
    {"districts":["q3"],"home_lat":"10","home_lng":106},
    {"districts":["q3"],"service_radius_km":0},
    {"districts":["q3"],"service_radius_km":31},
    {"districts":["q3"],"service_radius_km":1.5},
    {"districts":["q3"],"service_radius_km":"8"},
    {"districts":["q3"],"service_radius_km":null}
  ]'::jsonb) loop
    select * into v_result from public.update_worker_service_area_atomic(v_worker,v_worker,v_patch);
    if v_result.ok is not false or v_result.error_code is distinct from 'INVALID_INPUT'
      or (select to_jsonb(worker) from public.worker_profiles worker where id=v_worker) is distinct from v_saved then
      raise exception 'service-area invalid patch was accepted or partially written';
    end if;
  end loop;

  update public.worker_profiles set is_suspended=true where id=v_worker;
  select * into v_result from public.update_worker_service_area_atomic(v_worker,v_worker,'{"districts":["q1"]}'::jsonb);
  if v_result.ok is not false or v_result.error_code is distinct from 'ALREADY_FINALIZED' then
    raise exception 'service-area suspension flag was bypassed';
  end if;
  update public.worker_profiles set is_suspended=false,is_approved=false where id=v_worker;
  select * into v_result from public.update_worker_service_area_atomic(v_worker,v_worker,'{"districts":["q1"]}'::jsonb);
  if v_result.ok is not false or v_result.error_code is distinct from 'ALREADY_FINALIZED' then
    raise exception 'service-area inconsistent approval was accepted';
  end if;
  select * into v_result from public.update_worker_service_area_atomic(v_customer,v_worker,'{"districts":["q1"]}'::jsonb);
  if v_result.ok is not false or v_result.error_code is distinct from 'NOT_OWNER' then
    raise exception 'service-area cross-actor mutation accepted';
  end if;
  select * into v_result from public.update_worker_service_area_atomic(v_customer,v_customer,'{"districts":["q1"]}'::jsonb);
  if v_result.ok is not false or v_result.error_code is distinct from 'WRONG_ROLE' then
    raise exception 'service-area customer role accepted';
  end if;
  if has_function_privilege('anon','public.update_worker_service_area_atomic(uuid,uuid,jsonb)','execute')
    or has_function_privilege('authenticated','public.update_worker_service_area_atomic(uuid,uuid,jsonb)','execute')
    or not has_function_privilege('service_role','public.update_worker_service_area_atomic(uuid,uuid,jsonb)','execute') then
    raise exception 'service-area RPC privilege boundary violated';
  end if;
end $$;
select 'PASS' as worker_service_area_authority_sql;
rollback;
