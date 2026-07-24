-- Workers choose supported services themselves. Matching remains fail-closed
-- when a service-specific review record crosses the quality threshold.

alter table public.worker_profiles
  add column if not exists selected_service_types public.service_type[]
  not null default '{}'::public.service_type[];

update public.worker_profiles
set selected_service_types = coalesce(
  nullif(active_service_types, '{}'::public.service_type[]),
  service_types,
  '{}'::public.service_type[]
)
where cardinality(selected_service_types) = 0;

update public.worker_profiles
set active_service_types = selected_service_types
where active_service_types is null
  and cardinality(selected_service_types) > 0;

alter table public.worker_profiles
  drop constraint if exists worker_profiles_selected_service_types_valid;

alter table public.worker_profiles
  add constraint worker_profiles_selected_service_types_valid
  check (
    cardinality(selected_service_types) between 0 and 6
    and array_position(selected_service_types, null) is null
  );

alter table public.worker_profiles
  drop constraint if exists worker_profiles_active_service_types_subset;

alter table public.worker_profiles
  add constraint worker_profiles_active_service_types_subset
  check (
    active_service_types is null
    or (
      cardinality(active_service_types) >= 1
      and active_service_types <@ selected_service_types
    )
  );

create index if not exists worker_profiles_selected_service_types_gin
  on public.worker_profiles using gin (selected_service_types);

comment on column public.worker_profiles.selected_service_types is
  'Supported services the worker chooses to receive. Matching also applies service-specific quality locks.';

create or replace view public.worker_service_quality_status
with (security_invoker = true)
as
select
  r.worker_id,
  j.service_type,
  count(*)::integer as review_count,
  round(avg(r.rating)::numeric, 2) as average_rating,
  max(r.created_at) as last_reviewed_at,
  case
    when count(*) >= 3 and avg(r.rating) < 4
      then max(r.created_at) + interval '14 days'
    else null
  end as locked_until,
  (
    count(*) >= 3
    and avg(r.rating) < 4
    and max(r.created_at) + interval '14 days' > now()
  ) as is_locked
from public.reviews as r
join public.jobs as j on j.id = r.job_id
where r.rating between 1 and 5
group by r.worker_id, j.service_type;

revoke all on public.worker_service_quality_status from public;
revoke all on public.worker_service_quality_status from anon;
revoke all on public.worker_service_quality_status from authenticated;
grant select on public.worker_service_quality_status to service_role;

comment on view public.worker_service_quality_status is
  'Per-worker, per-service quality gate: at least 3 reviews and average below 4.0 locks matching for 14 days from the latest review.';

drop function if exists public.accept_broadcast_atomic(uuid, uuid);

create function public.accept_broadcast_atomic(
  p_job_id uuid,
  p_worker_id uuid
) returns table (
  ok boolean,
  error_code text,
  job_status public.job_status,
  candidate_id uuid,
  already_applied boolean
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_broadcast record;
  v_candidate record;
  v_job record;
  v_worker record;
  v_job_district text;
  v_now timestamptz := now();
begin
  select j.id, j.status, j.service_type, j.address_district
    into v_job
    from public.jobs as j
    where j.id = p_job_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  select jb.id, jb.status, jb.expires_at
    into v_broadcast
    from public.job_broadcasts as jb
    where jb.job_id = p_job_id
      and jb.worker_id = p_worker_id
      and jb.status in (
        'sent'::public.broadcast_status,
        'accepted'::public.broadcast_status
      )
    order by jb.sent_at desc nulls last,
      jb.broadcast_at desc nulls last,
      jb.id desc
    limit 1
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  if v_job.status = 'worker_candidate_pending'::public.job_status then
    select c.id, c.worker_id, c.status
      into v_candidate
      from public.job_worker_candidates as c
      where c.job_id = p_job_id
        and c.worker_id = p_worker_id
        and c.status = 'proposed'
      order by c.proposed_at desc, c.id desc
      limit 1;

    if found then
      return query select true, null::text,
        'worker_candidate_pending'::public.job_status,
        v_candidate.id, true;
      return;
    end if;

    return query select false, 'ALREADY_TAKEN'::text,
      v_job.status, null::uuid, false;
    return;
  end if;

  if v_job.status <> 'broadcasting'::public.job_status then
    return query select false, 'ALREADY_TAKEN'::text,
      v_job.status, null::uuid, false;
    return;
  end if;

  if v_broadcast.status <> 'sent'::public.broadcast_status then
    return query select false, 'BROADCAST_NOT_ACTIVE'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  if v_broadcast.expires_at is not null and v_broadcast.expires_at <= v_now then
    update public.job_broadcasts as jb
      set status = 'expired'::public.broadcast_status,
          responded_at = v_now
      where jb.id = v_broadcast.id
        and jb.status = 'sent'::public.broadcast_status;
    return query select false, 'EXPIRED'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  select wp.id, wp.is_approved, wp.is_available, wp.is_suspended,
      wp.selected_service_types, wp.districts
    into v_worker
    from public.worker_profiles as wp
    where wp.id = p_worker_id
    for update;

  if v_job.address_district is null
    or v_job.address_district = 'hcmc_all'
  then
    return query select false, 'WORKER_NOT_ELIGIBLE'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  v_job_district := v_job.address_district;

  if not found
    or v_worker.is_approved is not true
    or v_worker.is_available is not true
    or v_worker.is_suspended is true
    or v_worker.selected_service_types is null
    or cardinality(v_worker.selected_service_types) = 0
    or v_worker.districts is null
    or cardinality(v_worker.districts) = 0
    or not (v_job.service_type = any(v_worker.selected_service_types))
    or not (
      v_job_district = any(v_worker.districts)
      or 'hcmc_all' = any(v_worker.districts)
    )
    or exists (
      select 1
      from public.worker_service_quality_status as quality
      where quality.worker_id = p_worker_id
        and quality.service_type = v_job.service_type
        and quality.is_locked
    )
    or exists (
      select 1
      from public.jobs as active_job
      where active_job.worker_id = p_worker_id
        and active_job.id <> p_job_id
        and active_job.status in (
          'worker_matched'::public.job_status,
          'worker_on_way'::public.job_status,
          'arrived'::public.job_status,
          'inspecting'::public.job_status,
          'repairing'::public.job_status,
          'scope_change_pending'::public.job_status,
          'completed_by_worker'::public.job_status
        )
      limit 1
    )
    or exists (
      select 1
      from public.job_worker_candidates as reserved
      where reserved.worker_id = p_worker_id
        and reserved.job_id <> p_job_id
        and reserved.status = 'proposed'
        and reserved.expires_at > v_now
      limit 1
    )
  then
    return query select false, 'WORKER_NOT_ELIGIBLE'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  insert into public.job_worker_candidates (
    job_id,
    worker_id,
    broadcast_id,
    status,
    proposed_at,
    expires_at
  ) values (
    p_job_id,
    p_worker_id,
    v_broadcast.id,
    'proposed',
    v_now,
    v_now + interval '10 minutes'
  )
  returning id, worker_id, status into v_candidate;

  update public.jobs as j
    set status = 'worker_candidate_pending'::public.job_status,
        worker_id = null,
        matched_at = null
    where j.id = p_job_id
      and j.status = 'broadcasting'::public.job_status;

  if not found then
    raise exception using errcode = '40001',
      message = 'job status changed while proposing worker';
  end if;

  update public.job_broadcasts as jb
    set status = 'accepted'::public.broadcast_status,
        responded_at = v_now
    where jb.id = v_broadcast.id
      and jb.status = 'sent'::public.broadcast_status;

  update public.job_broadcasts as jb
    set status = 'reassigned'::public.broadcast_status,
        responded_at = v_now
    where jb.job_id = p_job_id
      and jb.id <> v_broadcast.id
      and jb.status = 'sent'::public.broadcast_status;

  return query select true, null::text,
    'worker_candidate_pending'::public.job_status,
    v_candidate.id, false;
end;
$func$;

revoke execute on function public.accept_broadcast_atomic(uuid, uuid) from public;
revoke execute on function public.accept_broadcast_atomic(uuid, uuid) from anon;
revoke execute on function public.accept_broadcast_atomic(uuid, uuid) from authenticated;
grant execute on function public.accept_broadcast_atomic(uuid, uuid) to service_role;

comment on function public.accept_broadcast_atomic(uuid, uuid) is
  'Service-role-only worker proposal guarded by self-selected services, temporary quality locks, district, workload, and reservation state.';
