create or replace function public.submit_worker_registration_atomic(
  p_actor_id uuid,
  p_worker_id uuid,
  p_legal_name text,
  p_date_of_birth date,
  p_gender text,
  p_service_types public.service_type[],
  p_years_experience integer,
  p_districts text[],
  p_home_lat numeric,
  p_home_lng numeric,
  p_service_radius_km integer,
  p_problem_specializations text[],
  p_cccd_front_url text,
  p_cccd_back_url text,
  p_selfie_url text,
  p_bank_account text,
  p_bank_name text
) returns table (
  ok boolean,
  error_code text,
  worker_id_out uuid,
  verification_status_out public.worker_verification_status,
  submitted_at_ts timestamptz,
  idempotent_out boolean
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_profile record;
  v_worker record;
  v_written record;
  v_verification_paths text[];
  v_verified_objects integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_actor_id is null or p_worker_id is null then
    return query select
      false, 'INVALID_INPUT'::text, null::uuid,
      null::public.worker_verification_status, null::timestamptz, false;
    return;
  end if;

  if p_actor_id is distinct from p_worker_id then
    return query select
      false, 'NOT_OWNER'::text, null::uuid,
      null::public.worker_verification_status, null::timestamptz, false;
    return;
  end if;

  if p_legal_name is null
     or char_length(p_legal_name) not between 2 and 200
     or p_date_of_birth is null
     or p_gender not in ('male', 'female', 'other')
     or p_service_types is null
     or cardinality(p_service_types) not between 1 and 6
     or exists (
       select 1
       from unnest(p_service_types) as service_type(value)
       where service_type.value is null
     )
     or p_years_experience is null
     or p_years_experience not between 0 and 60
     or p_districts is null
     or cardinality(p_districts) not between 1 and 20
     or exists (
       select 1
       from unnest(p_districts) as district(value)
       where district.value is null
         or district.value not in (
         'q1', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q10', 'q11', 'q12',
         'binh_thanh', 'thu_duc', 'tan_binh', 'go_vap', 'phu_nhuan',
         'binh_tan', 'tan_phu', 'hoc_mon', 'binh_chanh', 'cu_chi', 'nha_be',
         'can_gio', 'hcmc_all'
       )
     )
     or (p_home_lat is not null and p_home_lat not between -90 and 90)
     or (p_home_lng is not null and p_home_lng not between -180 and 180)
     or p_service_radius_km is null
     or p_service_radius_km not between 1 and 30
     or p_problem_specializations is null
     or cardinality(p_problem_specializations) > 20
     or exists (
       select 1
       from unnest(p_problem_specializations) as specialization(value)
       where specialization.value is null
         or char_length(specialization.value) not between 1 and 100
     )
     or p_cccd_front_url is null
     or p_cccd_front_url !~ (
       '^supabase://worker-verification/' || p_worker_id::text
       || '/cccd-front/[A-Za-z0-9][A-Za-z0-9._-]{0,119}[.](jpg|jpeg|png|webp)$'
     )
     or p_cccd_back_url is null
     or p_cccd_back_url !~ (
       '^supabase://worker-verification/' || p_worker_id::text
       || '/cccd-back/[A-Za-z0-9][A-Za-z0-9._-]{0,119}[.](jpg|jpeg|png|webp)$'
     )
     or p_selfie_url is null
     or p_selfie_url !~ (
       '^supabase://worker-verification/' || p_worker_id::text
       || '/selfie/[A-Za-z0-9][A-Za-z0-9._-]{0,119}[.](jpg|jpeg|png|webp)$'
     )
     or p_bank_account is null
     or char_length(p_bank_account) not between 6 and 50
     or p_bank_name is null
     or char_length(p_bank_name) not between 2 and 100 then
    return query select
      false, 'INVALID_INPUT'::text, null::uuid,
      null::public.worker_verification_status, null::timestamptz, false;
    return;
  end if;

  -- Lock the parent first. Besides validating the server-supplied actor, this
  -- serializes two first submissions even when no worker_profiles row exists.
  select profile.id, profile.role
  into v_profile
  from public.profiles as profile
  where profile.id = p_worker_id
  for update;

  if not found then
    return query select
      false, 'NOT_FOUND'::text, null::uuid,
      null::public.worker_verification_status, null::timestamptz, false;
    return;
  end if;

  if v_profile.role <> 'worker'::public.user_role then
    return query select
      false, 'WRONG_ROLE'::text, null::uuid,
      null::public.worker_verification_status, null::timestamptz, false;
    return;
  end if;

  v_verification_paths := array[
    pg_catalog.substr(
      p_cccd_front_url,
      pg_catalog.char_length('supabase://worker-verification/') + 1
    ),
    pg_catalog.substr(
      p_cccd_back_url,
      pg_catalog.char_length('supabase://worker-verification/') + 1
    ),
    pg_catalog.substr(
      p_selfie_url,
      pg_catalog.char_length('supabase://worker-verification/') + 1
    )
  ];

  -- A syntactically owned ref is insufficient: all three exact objects must
  -- exist in the private bucket, belong to the worker auth user, and remain
  -- within the image size/type contract. Lock them before any worker write.
  select pg_catalog.count(*)::integer
    into v_verified_objects
    from (
      select object.id
      from storage.objects as object
      where object.bucket_id = 'worker-verification'
        and object.name = any(v_verification_paths)
        and object.owner is not distinct from p_worker_id
        and pg_catalog.lower(
          coalesce(object.metadata ->> 'mimetype', '')
        ) in ('image/jpeg', 'image/png', 'image/webp')
        and coalesce(
          case
            when coalesce(object.metadata ->> 'size', '') ~ '^[0-9]+$'
              then (object.metadata ->> 'size')::bigint
            else null
          end,
          -1
        ) between 1 and 10485760
      for share of object
    ) as verified;

  if v_verified_objects <> 3 then
    return query select
      false, 'INVALID_INPUT'::text, null::uuid,
      null::public.worker_verification_status, null::timestamptz, false;
    return;
  end if;

  select worker.*
  into v_worker
  from public.worker_profiles as worker
  where worker.id = p_worker_id
  for update;

  if found then
    if v_worker.is_approved is true
       or v_worker.is_suspended is true
       or v_worker.verification_status in (
         'under_review'::public.worker_verification_status,
         'approved'::public.worker_verification_status,
         'suspended'::public.worker_verification_status
       ) then
      return query select
        false, 'ALREADY_FINALIZED'::text, v_worker.id,
        v_worker.verification_status, v_worker.updated_at, false;
      return;
    end if;

    -- An exact submitted replay is a read-only success. This keeps retries
    -- idempotent and avoids touching updated_at or retriggering review work.
    if v_worker.verification_status = 'submitted'::public.worker_verification_status
       and v_worker.is_approved is false
       and v_worker.is_available is false
       and v_worker.is_suspended is false
       and v_worker.legal_name is not distinct from p_legal_name
       and v_worker.date_of_birth is not distinct from p_date_of_birth
       and v_worker.gender is not distinct from p_gender
       and v_worker.service_types is not distinct from p_service_types
       and v_worker.years_experience is not distinct from p_years_experience
       and v_worker.districts is not distinct from p_districts
       and v_worker.home_lat is not distinct from p_home_lat
       and v_worker.home_lng is not distinct from p_home_lng
       and v_worker.service_radius_km is not distinct from p_service_radius_km
       and v_worker.problem_specializations is not distinct from p_problem_specializations
       and v_worker.cccd_front_url is not distinct from p_cccd_front_url
       and v_worker.cccd_back_url is not distinct from p_cccd_back_url
       and v_worker.selfie_url is not distinct from p_selfie_url
       and v_worker.bank_account is not distinct from p_bank_account
       and v_worker.bank_name is not distinct from p_bank_name then
      return query select
        true, null::text, v_worker.id, v_worker.verification_status,
        v_worker.updated_at, true;
      return;
    end if;

    -- A different submitted payload is a new revision, not a retry. Only an
    -- explicit review rejection may reopen the snapshot for corrections.
    if v_worker.verification_status = 'submitted'::public.worker_verification_status then
      return query select
        false, 'ALREADY_FINALIZED'::text, v_worker.id,
        v_worker.verification_status, v_worker.updated_at, false;
      return;
    end if;
  end if;

  insert into public.worker_profiles as worker (
    id,
    legal_name,
    date_of_birth,
    gender,
    service_types,
    years_experience,
    districts,
    home_lat,
    home_lng,
    service_radius_km,
    problem_specializations,
    cccd_front_url,
    cccd_back_url,
    selfie_url,
    bank_account,
    bank_name,
    verification_status,
    is_approved,
    is_available,
    is_suspended,
    updated_at
  ) values (
    p_worker_id,
    p_legal_name,
    p_date_of_birth,
    p_gender,
    p_service_types,
    p_years_experience,
    p_districts,
    p_home_lat,
    p_home_lng,
    p_service_radius_km,
    p_problem_specializations,
    p_cccd_front_url,
    p_cccd_back_url,
    p_selfie_url,
    p_bank_account,
    p_bank_name,
    'submitted'::public.worker_verification_status,
    false,
    false,
    false,
    v_now
  ) on conflict (id) do update
  set
    legal_name = excluded.legal_name,
    date_of_birth = excluded.date_of_birth,
    gender = excluded.gender,
    service_types = excluded.service_types,
    years_experience = excluded.years_experience,
    districts = excluded.districts,
    home_lat = excluded.home_lat,
    home_lng = excluded.home_lng,
    service_radius_km = excluded.service_radius_km,
    problem_specializations = excluded.problem_specializations,
    cccd_front_url = excluded.cccd_front_url,
    cccd_back_url = excluded.cccd_back_url,
    selfie_url = excluded.selfie_url,
    bank_account = excluded.bank_account,
    bank_name = excluded.bank_name,
    verification_status = 'submitted'::public.worker_verification_status,
    is_approved = false,
    is_available = false,
    is_suspended = false,
    updated_at = v_now
  where worker.is_approved is false
    and worker.is_suspended is false
    and worker.verification_status not in (
      'submitted'::public.worker_verification_status,
      'under_review'::public.worker_verification_status,
      'approved'::public.worker_verification_status,
      'suspended'::public.worker_verification_status
    )
  returning worker.id, worker.verification_status, worker.updated_at
  into v_written;

  if not found then
    -- Defensive conflict guard for a legacy/admin insert that did not lock the
    -- parent profile. Never turn that concurrent final row back into submitted.
    select worker.*
    into v_worker
    from public.worker_profiles as worker
    where worker.id = p_worker_id
    for update;

    if found and (
      v_worker.is_approved is true
      or v_worker.is_suspended is true
      or v_worker.verification_status in (
        'submitted'::public.worker_verification_status,
        'under_review'::public.worker_verification_status,
        'approved'::public.worker_verification_status,
        'suspended'::public.worker_verification_status
      )
    ) then
      return query select
        false, 'ALREADY_FINALIZED'::text, v_worker.id,
        v_worker.verification_status, v_worker.updated_at, false;
      return;
    end if;

    return query select
      false, 'WRITE_CONFLICT'::text, null::uuid,
      null::public.worker_verification_status, null::timestamptz, false;
    return;
  end if;

  return query select
    true, null::text, v_written.id, v_written.verification_status,
    v_written.updated_at, false;
end;
$func$;

revoke execute on function public.submit_worker_registration_atomic(
  uuid, uuid, text, date, text, public.service_type[], integer, text[],
  numeric, numeric, integer, text[], text, text, text, text, text
) from public;
revoke execute on function public.submit_worker_registration_atomic(
  uuid, uuid, text, date, text, public.service_type[], integer, text[],
  numeric, numeric, integer, text[], text, text, text, text, text
) from anon;
revoke execute on function public.submit_worker_registration_atomic(
  uuid, uuid, text, date, text, public.service_type[], integer, text[],
  numeric, numeric, integer, text[], text, text, text, text, text
) from authenticated;
grant execute on function public.submit_worker_registration_atomic(
  uuid, uuid, text, date, text, public.service_type[], integer, text[],
  numeric, numeric, integer, text[], text, text, text, text, text
) to service_role;

comment on function public.submit_worker_registration_atomic(
  uuid, uuid, text, date, text, public.service_type[], integer, text[],
  numeric, numeric, integer, text[], text, text, text, text, text
) is
  'Service-role-only B0 registration finalization with profile ownership/role validation, exact owned Storage-object checks, row locks, review-state guards, and idempotent replay.';
