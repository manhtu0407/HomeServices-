begin;

create or replace function private.withdraw_unavailable_worker_candidate(p_job_id uuid,p_candidate_id uuid)
returns void language plpgsql security definer set search_path='' as $func$
declare
  v_job public.jobs%rowtype;
  v_candidate public.job_worker_candidates%rowtype;
  v_now timestamptz;
begin
  select job.* into strict v_job from public.jobs job where job.id=p_job_id for update;
  select candidate.* into strict v_candidate from public.job_worker_candidates candidate
    where candidate.id=p_candidate_id and candidate.job_id=v_job.id for update;
  if v_job.status<>'worker_candidate_pending' or v_job.worker_id is not null or v_candidate.status<>'proposed' then
    raise exception using errcode='55000',message='CANDIDATE_RECOVERY_NOT_READY';
  end if;
  v_now:=clock_timestamp();
  update public.job_worker_candidates set status='withdrawn',updated_at=v_now where id=v_candidate.id;
  update public.worker_matching_proposals set status='withdrawn',updated_at=v_now
    where candidate_id=v_candidate.id and status='proposed';
  update public.job_broadcasts set status='expired',responded_at=v_now
    where id=v_candidate.broadcast_id and status in ('pending','sent','accepted');
  update public.matching_recipient_deliveries set status='expired',updated_at=v_now
    where broadcast_id=v_candidate.broadcast_id and status in ('queued','delivered','seen','accepted');
  update public.matching_capacity_reservations set status='released',released_at=v_now,updated_at=v_now
    where job_id=v_job.id and worker_id=v_candidate.worker_id and status in ('held','offered');
  update public.jobs set status='broadcasting',broadcast_at=null where id=v_job.id;
  perform private.reconcile_closed_candidate_matching(v_job.id,v_candidate.id);
end;
$func$;
revoke all on function private.withdraw_unavailable_worker_candidate(uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.confirm_worker_matching_proposal_atomic(p_job_id uuid, p_candidate_id uuid, p_customer_id uuid)
 RETURNS TABLE(ok boolean, error_code text, job_status job_status, candidate_id uuid, worker_id uuid, already_applied boolean)
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_job public.jobs%rowtype; v_candidate public.job_worker_candidates%rowtype;
  v_proposal public.worker_matching_proposals%rowtype;
  v_worker public.worker_profiles%rowtype; v_job_district text;
  v_expiry record;
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
  if v_candidate.status = 'proposed' and v_job.status = 'worker_candidate_pending' then
    select * into strict v_expiry from public.expire_worker_candidate_atomic(p_job_id,v_candidate.id,p_customer_id);
    if v_expiry.ok or v_expiry.error_code is distinct from 'NOT_EXPIRED' then
      return query select false,case when v_expiry.ok then 'EXPIRED'::text else v_expiry.error_code end,
        v_expiry.job_status,v_expiry.candidate_id,v_expiry.worker_id,false;
      return;
    end if;
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
    perform private.withdraw_unavailable_worker_candidate(p_job_id,v_candidate.id);
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

CREATE OR REPLACE FUNCTION public.confirm_worker_candidate_atomic(p_job_id uuid, p_candidate_id uuid, p_customer_id uuid)
 RETURNS TABLE(ok boolean, error_code text, job_status job_status, candidate_id uuid, worker_id uuid, already_applied boolean)
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_candidate record;
  v_job record;
  v_worker record;
  v_job_district text;
  v_customer_total integer;
  v_commission_level integer;
  v_commission_rate_bps integer;
  v_now timestamptz;
  v_expiry record;
begin
  select j.id, j.status, j.customer_id, j.worker_id, j.matched_at,
      j.service_type, j.address_district, j.final_price
    into v_job
    from public.jobs as j
    where j.id = p_job_id
    for update;

  if not found or p_customer_id is null or v_job.customer_id is distinct from p_customer_id
    or not exists (select 1 from public.profiles as customer_actor
      where customer_actor.id = p_customer_id and customer_actor.role = 'customer') then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::uuid, null::uuid, false;
    return;
  end if;

  select c.id, c.worker_id, c.broadcast_id, c.status, c.expires_at,
      c.original_scope_price_quote
    into v_candidate
    from public.job_worker_candidates as c
    where c.id = p_candidate_id
      and c.job_id = p_job_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      v_job.status, null::uuid, null::uuid, false;
    return;
  end if;

  if v_candidate.status = 'proposed' and v_job.status = 'worker_candidate_pending' then
    select * into strict v_expiry from public.expire_worker_candidate_atomic(p_job_id,v_candidate.id,p_customer_id);
    if v_expiry.ok or v_expiry.error_code is distinct from 'NOT_EXPIRED' then
      return query select false,case when v_expiry.ok then 'EXPIRED'::text else v_expiry.error_code end,
        v_expiry.job_status,v_expiry.candidate_id,v_expiry.worker_id,false;
      return;
    end if;
  end if;
  v_now := clock_timestamp();

  if v_candidate.status = 'customer_confirmed'
    and v_job.worker_id = v_candidate.worker_id
    and v_job.status in (
      'worker_matched'::public.job_status,
      'worker_on_way'::public.job_status,
      'arrived'::public.job_status,
      'inspecting'::public.job_status,
      'repairing'::public.job_status,
      'scope_change_pending'::public.job_status,
      'completed_by_worker'::public.job_status,
      'confirmed_by_customer'::public.job_status,
      'payment_pending'::public.job_status,
      'paid'::public.job_status,
      'reviewed'::public.job_status
    )
    and (
      v_candidate.original_scope_price_quote is null
      or v_job.final_price = (
        v_candidate.original_scope_price_quote ->> 'customer_total'
      )::integer
      or exists (
        select 1
        from public.scope_change_requests as scope
        where scope.job_id = p_job_id
          and scope.status = 'approved_by_customer'::public.scope_change_status
          and scope.kael_computed_max = v_job.final_price
      )
    )
  then
    return query select true, null::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, true;
    return;
  end if;

  if v_candidate.status <> 'proposed'
    or v_job.status <> 'worker_candidate_pending'::public.job_status
  then
    return query select false, 'INVALID_STATUS'::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  if not private.is_valid_original_scope_price_quote(
    v_candidate.original_scope_price_quote,
    p_job_id,
    v_candidate.worker_id,
    v_candidate.broadcast_id,
    v_candidate.expires_at,
    true
  ) then
    return query select false, 'PRICE_QUOTE_INVALID'::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  v_customer_total := (
    v_candidate.original_scope_price_quote ->> 'customer_total'
  )::integer;
  v_commission_level := (
    v_candidate.original_scope_price_quote ->> 'commission_level'
  )::integer;
  v_commission_rate_bps := (
    v_candidate.original_scope_price_quote ->> 'commission_rate_bps'
  )::integer;

  select wp.id, wp.is_approved, wp.is_available, wp.is_suspended,
      wp.selected_service_types, wp.districts
    into v_worker
    from public.worker_profiles as wp
    where wp.id = v_candidate.worker_id
    for update;

  v_job_district := public.normalize_hcmc_district_code(v_job.address_district);

  if not found
    or v_worker.is_approved is not true
    or v_worker.is_available is not true
    or v_worker.is_suspended is true
    or v_job_district is null
    or v_job_district = 'hcmc_all'
    or v_worker.selected_service_types is null
    or cardinality(v_worker.selected_service_types) = 0
    or not (v_job.service_type = any(v_worker.selected_service_types))
    or v_worker.districts is null
    or cardinality(v_worker.districts) = 0
    or not (
      v_job_district = any(v_worker.districts)
      or 'hcmc_all' = any(v_worker.districts)
    )
    or exists (
      select 1
      from public.worker_service_quality_status as quality
      where quality.worker_id = v_candidate.worker_id
        and quality.service_type = v_job.service_type
        and quality.is_locked
    )
    or exists (
      select 1
      from public.jobs as active_job
      where active_job.worker_id = v_candidate.worker_id
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
  then
    perform private.withdraw_unavailable_worker_candidate(p_job_id,v_candidate.id);
    return query select false, 'WORKER_NOT_ELIGIBLE'::text,
      'broadcasting'::public.job_status,
      v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  update public.job_worker_candidates as c
    set status = 'customer_confirmed',
        customer_decided_at = v_now,
        updated_at = v_now
    where c.id = v_candidate.id
      and c.status = 'proposed';

  if not found then
    return query select false, 'STATUS_CHANGED'::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  update public.jobs as j
    set worker_id = v_candidate.worker_id,
        status = 'worker_matched'::public.job_status,
        matched_at = v_now,
        final_price = v_customer_total,
        worker_commission_level = v_commission_level,
        worker_commission_rate_bps = v_commission_rate_bps
    where j.id = p_job_id
      and j.customer_id = p_customer_id
      and j.status = 'worker_candidate_pending'::public.job_status;

  if not found then
    raise exception using errcode = '40001',
      message = 'job status changed while confirming worker';
  end if;

  return query select true, null::text,
    'worker_matched'::public.job_status,
    v_candidate.id, v_candidate.worker_id, false;
end;
$function$;
revoke all on function public.confirm_worker_matching_proposal_atomic(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_worker_matching_proposal_atomic(uuid,uuid,uuid) to service_role;
revoke all on function public.confirm_worker_candidate_atomic(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_worker_candidate_atomic(uuid,uuid,uuid) to service_role;

commit;
