begin;

create or replace function public.submit_worker_matching_proposal_atomic(
  p_job_id uuid, p_broadcast_id uuid, p_worker_id uuid,
  p_scope_summary text, p_price_min integer default null, p_price_max integer default null
) returns table(ok boolean, error_code text, candidate_id uuid, proposal_id uuid,
  already_applied boolean)
language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare v_job public.jobs%rowtype; v_delivery public.matching_recipient_deliveries%rowtype;
  v_worker public.worker_profiles%rowtype; v_job_district text;
  v_candidate_id uuid; v_proposal_id uuid; v_existing public.worker_matching_proposals%rowtype;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  select * into v_delivery from public.matching_recipient_deliveries
    where broadcast_id = p_broadcast_id and worker_id = p_worker_id for update;
  if length(btrim(coalesce(p_scope_summary, ''))) not between 3 and 2000
  then return query select false, 'SCOPE_INVALID', null::uuid, null::uuid, false; return; end if;
  if v_job.id is null or v_delivery.id is null or v_delivery.job_id is distinct from p_job_id
    or not exists (select 1 from public.profiles where id=p_worker_id and role='worker') then
    return query select false, 'DELIVERY_NOT_ACTIVE', null::uuid, null::uuid, false; return;
  end if;
  select * into v_existing from public.worker_matching_proposals
    where broadcast_id = p_broadcast_id for update;
  if found then
    if v_job.status <> 'worker_candidate_pending' or v_existing.job_id is distinct from p_job_id
      or v_existing.status <> 'proposed' or v_delivery.status <> 'accepted'
      or v_delivery.expires_at <= clock_timestamp()
      or not exists (select 1 from public.job_worker_candidates as candidate
        where candidate.id=v_existing.candidate_id and candidate.job_id=p_job_id
          and candidate.worker_id=p_worker_id and candidate.status='proposed'
          and candidate.expires_at > clock_timestamp()) then
      return query select false, 'DELIVERY_NOT_ACTIVE', null::uuid, null::uuid, false; return;
    end if;
    if v_existing.worker_id = p_worker_id
      and v_existing.scope_summary = btrim(p_scope_summary)
      and v_existing.price_min is not distinct from p_price_min
      and v_existing.price_max is not distinct from p_price_max
    then
      return query select true, null::text, v_existing.candidate_id, v_existing.id, true;
    else
      return query select false, 'PROPOSAL_ALREADY_SUBMITTED',
        v_existing.candidate_id, v_existing.id, false;
    end if;
    return;
  end if;
  if v_job.id is null or v_delivery.id is null or v_job.status <> 'broadcasting'
    or v_delivery.status not in ('queued', 'delivered', 'seen')
    or v_delivery.expires_at <= clock_timestamp()
  then return query select false, 'DELIVERY_NOT_ACTIVE', null::uuid, null::uuid, false; return; end if;
  select * into v_worker from public.worker_profiles where id = p_worker_id for update;
  v_job_district := public.normalize_hcmc_district_code(v_job.address_district);
  if v_worker.id is null or not v_worker.is_approved or not v_worker.is_available
    or v_worker.is_suspended or v_job_district is null or v_job_district = 'hcmc_all'
    or v_worker.selected_service_types is null
    or not (v_job.service_type = any(v_worker.selected_service_types))
    or v_worker.districts is null
    or not (v_job_district = any(v_worker.districts) or 'hcmc_all' = any(v_worker.districts))
    or v_worker.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or exists (
      select 1 from public.worker_service_quality_status quality
      where quality.worker_id = v_worker.id and quality.service_type = v_job.service_type
        and quality.is_locked
    )
    or exists (
      select 1 from public.jobs busy where busy.worker_id = v_worker.id
        and busy.id <> p_job_id and busy.status in (
          'worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing',
          'scope_change_pending', 'completed_by_worker'
        )
    )
    or exists (
      select 1 from public.job_worker_candidates reserved
      where reserved.worker_id = v_worker.id and reserved.job_id <> p_job_id
        and reserved.status = 'proposed'
        and (reserved.expires_at is null or reserved.expires_at > now())
    )
    or not private.worker_meets_job_matching_requirements(
      v_job.quote_mode,
      v_job.diagnosis_scope,
      v_job.intake_scope_snapshot,
      v_worker.problem_specializations
    )
  then return query select false, 'WORKER_NOT_ELIGIBLE', null::uuid, null::uuid, false; return; end if;
  if v_job.quote_mode = 'rfq' and (
    p_price_min is null or p_price_max is null or p_price_min <= 0 or p_price_max < p_price_min
  ) then return query select false, 'PRICE_REQUIRED', null::uuid, null::uuid, false; return; end if;
  if v_job.quote_mode = 'inspection_only' and (p_price_min is not null or p_price_max is not null)
  then return query select false, 'PRICE_NOT_ALLOWED', null::uuid, null::uuid, false; return; end if;
  if v_job.quote_mode is null or v_job.quote_mode not in ('rfq', 'inspection_only')
  then return query select false, 'QUOTE_MODE_INVALID', null::uuid, null::uuid, false; return; end if;
  insert into public.job_worker_candidates(job_id, worker_id, broadcast_id, status,
    proposed_at, expires_at, synthetic_cohort_id)
    values (p_job_id, p_worker_id, p_broadcast_id, 'proposed', now(),
      v_delivery.expires_at, v_job.synthetic_cohort_id) returning id into v_candidate_id;
  insert into public.worker_matching_proposals(job_id, broadcast_id, candidate_id,
    worker_id, scope_summary, price_min, price_max, synthetic_cohort_id)
    values (p_job_id, p_broadcast_id, v_candidate_id, p_worker_id,
      btrim(p_scope_summary), p_price_min, p_price_max, v_job.synthetic_cohort_id)
    returning id into v_proposal_id;
  update public.job_broadcasts set status = 'accepted', responded_at = now()
    where id = p_broadcast_id and status = 'sent';
  update public.matching_recipient_deliveries set status = 'accepted',
    accepted_at = now(), seen_at = coalesce(seen_at, now()),
    delivered_at = coalesce(delivered_at, now()), updated_at = now()
    where id = v_delivery.id;
  update public.jobs set status = 'worker_candidate_pending' where id = p_job_id;
  update public.matching_operations set state = 'candidate_ready', updated_at = now()
    where id = v_delivery.operation_id;
  update public.confirmation_operations set state = 'candidate_ready', updated_at = now()
    where id = (select confirmation_operation_id from public.matching_operations
      where id = v_delivery.operation_id);
  return query select true, null::text, v_candidate_id, v_proposal_id, false;
end;
$func$;
revoke all on function public.submit_worker_matching_proposal_atomic(uuid,uuid,uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.submit_worker_matching_proposal_atomic(uuid,uuid,uuid,text,integer,integer) to service_role;

commit;
