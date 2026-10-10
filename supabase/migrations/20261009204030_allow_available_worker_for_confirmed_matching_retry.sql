begin;

create or replace function private.reserve_fresh_matching_workers(p_job_id uuid,p_confirmation_id uuid)
returns uuid[] language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_confirmation public.confirmation_operations%rowtype;
  v_worker record;
  v_capacity public.matching_capacity_reservations%rowtype;
  v_worker_ids uuid[] := array[]::uuid[];
  v_required integer;
  v_now timestamptz;
begin
  select job.* into strict v_job from public.jobs job where job.id=p_job_id for update;
  select confirmation.* into strict v_confirmation from public.confirmation_operations confirmation
    where confirmation.id=p_confirmation_id and confirmation.job_id=v_job.id
      and confirmation.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id;
  v_now := clock_timestamp();
  -- This helper is used after a job has already passed Customer confirmation.
  -- Initial public booking keeps its separate three-Worker coverage gate.
  v_required := 1;
  for v_worker in
    select worker.id from public.worker_profiles worker
      join private.eligible_matching_worker_ids(v_job.service_type,
        public.normalize_hcmc_district_code(v_job.address_district),v_job.quote_mode,v_job.diagnosis_scope,
        v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,v_now,v_job.id,v_confirmation.id) eligible
        on eligible.worker_id=worker.id
    where not exists(select 1 from public.job_broadcasts prior where prior.job_id=v_job.id and prior.worker_id=worker.id)
      and not exists(select 1 from public.worker_cancellation_requests cancellation
        where cancellation.job_id=v_job.id and cancellation.worker_id=worker.id and cancellation.status='approved')
    order by worker.id limit 50 for update of worker skip locked
  loop
    -- Expired unique-index holders can be reclaimed only if their capacity row is not busy.
    select capacity.* into v_capacity from public.matching_capacity_reservations capacity
      where capacity.worker_id=v_worker.id and capacity.status in ('held','offered') for update skip locked;
    if found then
      if v_capacity.expires_at>clock_timestamp() then
        if v_capacity.operation_id is distinct from v_confirmation.id or v_capacity.job_id is distinct from v_job.id
        then continue; end if;
      else
        update public.matching_capacity_reservations set status='expired',released_at=clock_timestamp(),
          updated_at=clock_timestamp() where id=v_capacity.id;
      end if;
    elsif exists(select 1 from public.matching_capacity_reservations capacity
      where capacity.worker_id=v_worker.id and capacity.status in ('held','offered')) then continue;
    end if;
    if not exists(select 1 from private.eligible_matching_worker_ids(v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district),v_job.quote_mode,v_job.diagnosis_scope,
      v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,clock_timestamp(),v_job.id,v_confirmation.id) eligible
      where eligible.worker_id=v_worker.id) then continue; end if;
    v_worker_ids := array_append(v_worker_ids,v_worker.id);
    exit when cardinality(v_worker_ids)=5;
  end loop;
  if cardinality(v_worker_ids)<v_required then
    raise exception using errcode='55000',message='COVERAGE_UNAVAILABLE';
  end if;

  v_now := clock_timestamp();
  insert into public.matching_capacity_reservations(operation_id,job_id,worker_id,service_type,district_code,
    status,held_at,expires_at,synthetic_cohort_id)
    select v_confirmation.id,v_job.id,worker_id,v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district),'held',v_now,v_now+interval '5 minutes',v_job.synthetic_cohort_id
    from unnest(v_worker_ids) selected(worker_id)
    on conflict(operation_id,worker_id) do update set status='held',held_at=excluded.held_at,
      expires_at=excluded.expires_at,released_at=null,updated_at=v_now;

  return v_worker_ids;
end;
$func$;

commit;
