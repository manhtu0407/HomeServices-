begin;

CREATE OR REPLACE FUNCTION public.confirm_worker_matching_proposal_atomic(p_job_id uuid, p_candidate_id uuid, p_customer_id uuid)
 RETURNS TABLE(ok boolean, error_code text, job_status job_status, candidate_id uuid, worker_id uuid, already_applied boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_job public.jobs%rowtype; v_candidate public.job_worker_candidates%rowtype;
  v_proposal public.worker_matching_proposals%rowtype;
  v_worker public.worker_profiles%rowtype; v_job_district text;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if v_job.id is null or p_customer_id is null or v_job.customer_id is distinct from p_customer_id
    or not exists (select 1 from public.profiles as customer_actor
      where customer_actor.id = p_customer_id and customer_actor.role = 'customer')
    then return query select false, 'NOT_FOUND', null::public.job_status, null::uuid, null::uuid, false; return; end if;
  select candidate.* into v_candidate from public.job_worker_candidates candidate
    where candidate.id=p_candidate_id and candidate.job_id=v_job.id for update;
  if not found then
    return query select false,'NOT_FOUND'::text,v_job.status,null::uuid,null::uuid,false;
    return;
  end if;
  select proposal.* into v_proposal from public.worker_matching_proposals proposal
    where proposal.candidate_id=v_candidate.id and proposal.job_id=v_job.id
      and proposal.worker_id=v_candidate.worker_id for update;
  if not found then
    return query select false,'NOT_FOUND'::text,v_job.status,null::uuid,null::uuid,false;
    return;
  end if;
  if v_job.quote_mode is null or v_job.quote_mode not in ('rfq','inspection_only') then
    return query select false,'INVALID_STATUS'::text,v_job.status,v_candidate.id,v_candidate.worker_id,false;
    return;
  end if;
  if v_candidate.status = 'customer_confirmed' and v_job.worker_id = v_candidate.worker_id
    then return query select true, null::text, v_job.status, v_candidate.id, v_candidate.worker_id, true; return; end if;
  if v_candidate.status = 'proposed' and v_candidate.expires_at <= now() then
    update public.job_worker_candidates set status = 'expired', updated_at = now()
      where id = v_candidate.id and status = 'proposed';
    update public.worker_matching_proposals set status = 'expired', updated_at = now()
      where id = v_proposal.id and status = 'proposed';
    update public.matching_recipient_deliveries set status = 'expired', updated_at = now()
      where broadcast_id = v_candidate.broadcast_id and status <> 'expired';
    update public.jobs set status = 'broadcasting', broadcast_at = null
      where id = p_job_id and status = 'worker_candidate_pending';
    update public.matching_operations set state = 'broadcasting', updated_at = now()
      where job_id = p_job_id and state = 'candidate_ready';
    update public.confirmation_operations set state = 'broadcasting', updated_at = now()
      where job_id = p_job_id and state = 'candidate_ready';
    return query select false, 'EXPIRED', 'broadcasting'::public.job_status,
      v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;
  if v_job.status <> 'worker_candidate_pending' or v_candidate.status <> 'proposed'
    or v_proposal.status <> 'proposed'
    then return query select false, 'INVALID_STATUS', v_job.status, v_candidate.id, v_candidate.worker_id, false; return; end if;
  select * into v_worker from public.worker_profiles
    where id = v_candidate.worker_id for update;
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
  then
    update public.job_worker_candidates set status = 'withdrawn', updated_at = now()
      where id = v_candidate.id and status = 'proposed';
    update public.worker_matching_proposals set status = 'withdrawn', updated_at = now()
      where id = v_proposal.id and status = 'proposed';
    update public.jobs set status = 'broadcasting', broadcast_at = null
      where id = p_job_id and status = 'worker_candidate_pending';
    update public.matching_operations set state = 'broadcasting', updated_at = now()
      where job_id = p_job_id and state = 'candidate_ready';
    update public.confirmation_operations set state = 'broadcasting', updated_at = now()
      where job_id = p_job_id and state = 'candidate_ready';
    return query select false, 'WORKER_NOT_ELIGIBLE', 'broadcasting'::public.job_status,
      v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;
  update public.job_worker_candidates set status = 'customer_confirmed',
    customer_decided_at = now(), updated_at = now() where id = v_candidate.id and status = 'proposed';
  if not found then raise exception using errcode = '40001', message = 'CANDIDATE_RACE_LOST'; end if;
  update public.worker_matching_proposals set status = 'customer_confirmed', updated_at = now()
    where id = v_proposal.id and status = 'proposed';
  update public.jobs set worker_id = v_candidate.worker_id, status = 'worker_matched',
    matched_at = now(), kael_price_min = coalesce(v_proposal.price_min, kael_price_min),
    kael_price_max = coalesce(v_proposal.price_max, kael_price_max)
    where id = p_job_id and status = 'worker_candidate_pending';
  if not found then raise exception using errcode = '40001', message = 'JOB_MATCH_RACE_LOST'; end if;
  update public.job_broadcasts set status = 'reassigned', responded_at = now()
    where job_id = p_job_id and id <> v_candidate.broadcast_id and status = 'sent';
  update public.matching_recipient_deliveries set status = 'expired', updated_at = now()
    where job_id = p_job_id and broadcast_id <> v_candidate.broadcast_id
      and status in ('queued', 'delivered', 'seen');
  update public.matching_operations set state = 'official_match', updated_at = now()
    where job_id = p_job_id and state = 'candidate_ready';
  update public.confirmation_operations set state = 'official_match', updated_at = now()
    where job_id = p_job_id;
  return query select true, null::text, 'worker_matched'::public.job_status,
    v_candidate.id, v_candidate.worker_id, false;
end;
$function$;

revoke all on function public.confirm_worker_matching_proposal_atomic(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_worker_matching_proposal_atomic(uuid,uuid,uuid) to service_role;

commit;
