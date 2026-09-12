begin;

create or replace function private.require_live_matching_capacity(
  p_job_id uuid, p_worker_id uuid, p_broadcast_id uuid default null
) returns timestamptz language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_matching public.matching_operations%rowtype;
  v_capacity public.matching_capacity_reservations%rowtype;
  v_delivery public.matching_recipient_deliveries%rowtype;
  v_observed_at timestamptz;
  v_error text := 'MATCHING_CAPACITY_UNAVAILABLE';
begin
  select job.* into strict v_job from public.jobs as job where job.id = p_job_id for update;
  -- Unversioned legacy jobs keep their existing compatibility RPC contract.
  if v_job.quote_mode is null and not exists (
    select 1 from public.confirmation_operations where job_id = p_job_id
  ) then return null; end if;

  perform worker.id from public.worker_profiles as worker where worker.id = p_worker_id for update;
  select delivery.* into v_delivery from public.matching_recipient_deliveries as delivery
    join public.job_broadcasts as broadcast on broadcast.id = delivery.broadcast_id
      and broadcast.job_id = p_job_id and broadcast.worker_id = p_worker_id
    join public.matching_operations as matching on matching.id = delivery.operation_id
      and matching.job_id = p_job_id
      and matching.state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required')
    where delivery.job_id = p_job_id and delivery.worker_id = p_worker_id
      and (p_broadcast_id is not null and delivery.broadcast_id = p_broadcast_id
        or p_broadcast_id is null and exists (
          select 1 from public.job_worker_candidates as candidate
          where candidate.job_id = p_job_id and candidate.worker_id = p_worker_id
            and candidate.broadcast_id = delivery.broadcast_id
            and candidate.status = 'customer_confirmed'
            and candidate.expires_at > clock_timestamp()
        ))
    order by delivery.created_at desc limit 1;
  select matching.* into v_matching from public.matching_operations as matching
    where matching.id = v_delivery.operation_id;
  if exists (select 1 from public.workflow_outbox as outbox
    where outbox.replacement_matching_operation_id = v_matching.id
  ) then v_error := 'MATCHING_REPLACEMENT_CAPACITY_UNAVAILABLE'; end if;

  select capacity.* into v_capacity from public.matching_capacity_reservations as capacity
    where capacity.operation_id = v_matching.confirmation_operation_id and capacity.job_id = p_job_id
      and capacity.worker_id = p_worker_id for update;
  -- Read wall time after locks; transaction-start time can accept an expired offer after waiting.
  v_observed_at := clock_timestamp();
  if v_matching.id is null or v_matching.confirmation_operation_id is null
    or v_matching.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or v_capacity.id is null or v_capacity.status not in ('held', 'offered')
    or v_capacity.expires_at <= v_observed_at
    or v_capacity.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or v_delivery.id is null or v_delivery.expires_at <= v_observed_at
    or v_delivery.status not in ('queued', 'delivered', 'seen', 'accepted')
    or v_delivery.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or not exists (select 1 from public.profiles where id = p_worker_id and role = 'worker')
    or not exists (
      select 1 from private.eligible_matching_worker_ids(v_job.service_type,
        public.normalize_hcmc_district_code(v_job.address_district), v_job.quote_mode,
        v_job.diagnosis_scope, v_job.intake_scope_snapshot, v_job.synthetic_cohort_id,
        v_observed_at, v_job.id, v_matching.confirmation_operation_id) as eligible
      where eligible.worker_id = p_worker_id
    )
  then raise exception using errcode = '55000', message = v_error; end if;
  return least(v_capacity.expires_at, v_delivery.expires_at);
end;
$func$;

create or replace function private.require_live_replacement_capacity(
  p_job_id uuid, p_worker_id uuid, p_broadcast_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $func$
begin
  perform private.require_live_matching_capacity(p_job_id, p_worker_id, p_broadcast_id);
end;
$func$;

create or replace function private.guard_replacement_candidate_capacity()
returns trigger language plpgsql security definer set search_path = '' as $func$
declare v_expires_at timestamptz;
begin
  v_expires_at := private.require_live_matching_capacity(new.job_id, new.worker_id, new.broadcast_id);
  if v_expires_at is not null then
    new.expires_at := least(new.expires_at, v_expires_at);
  end if;
  return new;
end;
$func$;

revoke execute on function private.require_live_matching_capacity(uuid,uuid,uuid),
  private.require_live_replacement_capacity(uuid,uuid,uuid),
  private.guard_replacement_candidate_capacity() from public, anon, authenticated;

commit;
