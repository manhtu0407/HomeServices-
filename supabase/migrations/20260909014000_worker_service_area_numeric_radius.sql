create or replace function public.update_worker_service_area_atomic(
  p_actor_id uuid,
  p_worker_id uuid,
  p_patch jsonb
) returns table (ok boolean, error_code text, worker_id uuid, updated_at timestamptz)
language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_role public.user_role;
  v_worker public.worker_profiles%rowtype;
  v_districts text[];
  v_lat numeric;
  v_lng numeric;
  v_radius integer;
  v_updated_at timestamptz;
begin
  if p_actor_id is null or p_worker_id is null then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if p_actor_id is distinct from p_worker_id then
    return query select false, 'NOT_OWNER'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if p_patch is null or jsonb_typeof(p_patch) is distinct from 'object' then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_patch) as field(name)
    where field.name not in ('districts', 'home_lat', 'home_lng', 'service_radius_km')
  ) or jsonb_typeof(p_patch->'districts') is distinct from 'array'
    or (p_patch ? 'home_lat') is distinct from (p_patch ? 'home_lng') then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if jsonb_array_length(p_patch->'districts') not between 1 and 20
    or exists (
      select 1 from jsonb_array_elements(p_patch->'districts') as district(value)
      where jsonb_typeof(value) is distinct from 'string'
        or value #>> '{}' not in (
          'q1', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q10', 'q11', 'q12',
          'binh_thanh', 'thu_duc', 'tan_binh', 'go_vap', 'phu_nhuan',
          'binh_tan', 'tan_phu', 'hoc_mon', 'binh_chanh', 'cu_chi', 'nha_be',
          'can_gio', 'hcmc_all'
        )
    ) then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if exists (
    select 1 from jsonb_each(p_patch) as field(name, value)
    where field.name in ('home_lat', 'home_lng', 'service_radius_km')
      and jsonb_typeof(field.value) not in ('number', 'null')
  ) then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if (p_patch ? 'home_lat') and (
    (p_patch->'home_lat' = 'null'::jsonb) is distinct from (p_patch->'home_lng' = 'null'::jsonb)
    or (p_patch->>'home_lat')::numeric not between -90 and 90
    or (p_patch->>'home_lng')::numeric not between -180 and 180
  ) then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if p_patch ? 'service_radius_km' and p_patch->'service_radius_km' = 'null'::jsonb then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if p_patch ? 'service_radius_km' then
    if (p_patch->>'service_radius_km')::numeric not between 1 and 30
      or trunc((p_patch->>'service_radius_km')::numeric) <> (p_patch->>'service_radius_km')::numeric then
      return query select false, 'INVALID_INPUT'::text, null::uuid, null::timestamptz;
      return;
    end if;
  end if;

  select profile.role into v_role from public.profiles as profile
  where profile.id = p_worker_id for update;
  if not found then
    return query select false, 'NOT_FOUND'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if v_role is distinct from 'worker'::public.user_role then
    return query select false, 'WRONG_ROLE'::text, null::uuid, null::timestamptz;
    return;
  end if;

  -- Serialize with registration and Admin review; a separate status read would
  -- let an area write modify the snapshot after it entered the review queue.
  select worker.* into v_worker from public.worker_profiles as worker
  where worker.id = p_worker_id for update;
  if not found then
    return query select false, 'NOT_FOUND'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if v_worker.verification_status not in ('draft', 'rejected', 'approved')
    or v_worker.is_suspended is not false
    or (v_worker.verification_status = 'approved') is distinct from v_worker.is_approved then
    return query select false, 'ALREADY_FINALIZED'::text, v_worker.id, v_worker.updated_at;
    return;
  end if;

  select array_agg(district.value order by district.ordinality) into v_districts
  from jsonb_array_elements_text(p_patch->'districts') with ordinality as district(value, ordinality);
  v_lat := case when p_patch ? 'home_lat' then (p_patch->>'home_lat')::numeric else v_worker.home_lat end;
  v_lng := case when p_patch ? 'home_lng' then (p_patch->>'home_lng')::numeric else v_worker.home_lng end;
  v_radius := case when p_patch ? 'service_radius_km' then (p_patch->>'service_radius_km')::numeric::integer else v_worker.service_radius_km end;
  if v_worker.districts is not distinct from v_districts
    and v_worker.home_lat is not distinct from v_lat
    and v_worker.home_lng is not distinct from v_lng
    and v_worker.service_radius_km is not distinct from v_radius then
    return query select true, null::text, v_worker.id, v_worker.updated_at;
    return;
  end if;

  update public.worker_profiles as worker set
    districts = v_districts, home_lat = v_lat, home_lng = v_lng,
    service_radius_km = v_radius, updated_at = clock_timestamp()
  where worker.id = p_worker_id
  returning worker.updated_at into v_updated_at;
  return query select true, null::text, p_worker_id, v_updated_at;
end;
$func$;

revoke all on function public.update_worker_service_area_atomic(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_worker_service_area_atomic(uuid, uuid, jsonb) to service_role;
