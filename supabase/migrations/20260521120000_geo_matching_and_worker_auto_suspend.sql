-- =============================================================================
-- Migration: geo_matching_and_worker_auto_suspend
--
-- Adds Phase 3 geo fields for distance-ranked matching and adds cancellation
-- abuse auto-suspend without implementing rating penalties.
-- =============================================================================

begin;

alter table public.jobs
  add column if not exists address_lat numeric(9,6),
  add column if not exists address_lng numeric(9,6),
  add column if not exists geo_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jobs_geo_source_check'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_geo_source_check
      check (geo_source in ('google_maps', 'manual', 'fallback'));
  end if;
end $$;

alter table public.worker_profiles
  add column if not exists home_lat numeric(9,6),
  add column if not exists home_lng numeric(9,6),
  add column if not exists service_radius_km int not null default 8,
  add column if not exists problem_specializations text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'worker_profiles_service_radius_km_check'
      and conrelid = 'public.worker_profiles'::regclass
  ) then
    alter table public.worker_profiles
      add constraint worker_profiles_service_radius_km_check
      check (service_radius_km between 1 and 30);
  end if;
end $$;

create or replace function public.distance_km(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
) returns double precision
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    when abs(lat1) > 90 or abs(lat2) > 90 or abs(lng1) > 180 or abs(lng2) > 180 then null
    else 6371 * acos(
      least(1, greatest(-1,
        cos(radians(lat1)) * cos(radians(lat2)) *
        cos(radians(lng2) - radians(lng1)) +
        sin(radians(lat1)) * sin(radians(lat2))
      ))
    )
  end;
$$;

revoke execute on function public.distance_km(double precision, double precision, double precision, double precision) from public;
revoke execute on function public.distance_km(double precision, double precision, double precision, double precision) from anon;
revoke execute on function public.distance_km(double precision, double precision, double precision, double precision) from authenticated;
grant execute on function public.distance_km(double precision, double precision, double precision, double precision) to service_role;

comment on function public.distance_km(double precision, double precision, double precision, double precision) is
  'Returns Haversine distance in kilometers for Phase 3 geo-ranked worker matching.';

drop function if exists public.request_worker_cancellation_atomic(uuid, uuid, text, text[]);

create function public.request_worker_cancellation_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_reason text,
  p_evidence_photo_urls text[] default '{}'::text[]
) returns table (
  ok boolean,
  error_code text,
  cancellation_id uuid,
  cancellation_status text,
  job_id_out uuid,
  job_status public.job_status,
  service_type_out public.service_type,
  district_code text,
  worker_id_out uuid,
  created_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_job record;
  v_existing record;
  v_id uuid;
  v_created timestamptz;
  v_now timestamptz := now();
  v_recent_approved_count int := 0;
  v_recent_approved_count_7d int := 0;
  v_updated_rows int := 0;
begin
  if p_reason is null or char_length(p_reason) < 10 or char_length(p_reason) > 1000 then
    return query select false, 'INVALID_REASON'::text, null::uuid, null::text,
      null::uuid, null::public.job_status, null::public.service_type,
      null::text, null::uuid, null::timestamptz;
    return;
  end if;

  select id, status, worker_id, service_type, address_district
    into v_job
    from public.jobs
    where id = p_job_id
    for update;

  if not found or v_job.worker_id <> p_worker_id then
    return query select false, 'NOT_FOUND'::text, null::uuid, null::text,
      null::uuid, null::public.job_status, null::public.service_type,
      null::text, null::uuid, null::timestamptz;
    return;
  end if;

  if v_job.status not in (
    'worker_matched'::public.job_status,
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status,
    'scope_change_pending'::public.job_status
  ) then
    return query select false, 'INVALID_STATUS'::text, null::uuid, null::text,
      null::uuid, null::public.job_status, null::public.service_type,
      null::text, null::uuid, null::timestamptz;
    return;
  end if;

  select id, status into v_existing
    from public.worker_cancellation_requests
    where job_id = p_job_id
      and worker_id = p_worker_id
      and status in ('requested', 'reviewing_by_kael')
    order by created_at desc
    limit 1
    for update;

  if found then
    return query select false, 'ALREADY_REQUESTED'::text, v_existing.id, v_existing.status,
      p_job_id, v_job.status, v_job.service_type, v_job.address_district, p_worker_id,
      null::timestamptz;
    return;
  end if;

  select count(*)::int into v_recent_approved_count
    from public.worker_cancellation_requests
    where worker_id = p_worker_id
      and status = 'approved'
      and created_at >= v_now - interval '24 hours';

  if v_recent_approved_count >= 2 then
    return query select false, 'RATE_LIMITED'::text, null::uuid, null::text,
      p_job_id, v_job.status, v_job.service_type, v_job.address_district, p_worker_id,
      null::timestamptz;
    return;
  end if;

  insert into public.worker_cancellation_requests (
    job_id,
    worker_id,
    status,
    reason,
    evidence_photo_urls,
    admin_decision_at,
    review_note
  ) values (
    p_job_id,
    p_worker_id,
    'approved',
    p_reason,
    coalesce(p_evidence_photo_urls, '{}'::text[]),
    v_now,
    'auto-approved by Edge worker cancellation workflow'
  )
  returning id, created_at into v_id, v_created;

  select count(*)::int into v_recent_approved_count_7d
    from public.worker_cancellation_requests
    where worker_id = p_worker_id
      and status = 'approved'
      and created_at >= v_now - interval '7 days';

  if v_recent_approved_count_7d >= 5 then
    update public.worker_profiles
      set is_suspended = true,
          is_available = false,
          verification_status = 'suspended'::public.worker_verification_status,
          updated_at = v_now
      where id = p_worker_id;
  end if;

  update public.job_broadcasts
    set status = 'reassigned'::public.broadcast_status,
        responded_at = v_now
    where job_id = v_job.id
      and status in (
        'pending'::public.broadcast_status,
        'sent'::public.broadcast_status,
        'accepted'::public.broadcast_status
      );

  update public.scope_change_requests
    set status = 'cancelled'::public.scope_change_status
    where job_id = v_job.id
      and status in (
        'waiting_customer_decision'::public.scope_change_status,
        'reviewing_by_kael'::public.scope_change_status
      );

  update public.jobs
    set worker_id = null,
        status = 'broadcasting'::public.job_status,
        broadcast_at = v_now,
        matched_at = null,
        arrived_at = null
    where id = v_job.id
      and worker_id = p_worker_id;

  get diagnostics v_updated_rows = row_count;
  if v_updated_rows <> 1 then
    return query select false, 'STATUS_CHANGED'::text, v_id, 'approved'::text,
      v_job.id, v_job.status, v_job.service_type, v_job.address_district, p_worker_id,
      v_created;
    return;
  end if;

  return query select true, null::text, v_id, 'approved'::text,
    v_job.id, 'broadcasting'::public.job_status, v_job.service_type,
    v_job.address_district, p_worker_id, v_created;
end;
$func$;

revoke execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) from public;
revoke execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) from anon;
revoke execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) from authenticated;
grant execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) to service_role;

comment on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) is
  'Auto-approves valid worker cancellations, resets the job to broadcasting, and auto-suspends repeat cancellation abuse. Rating penalties are intentionally omitted.';

commit;
