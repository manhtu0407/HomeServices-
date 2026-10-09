begin;

create or replace function private.eligible_matching_worker_ids(
  p_service_type public.service_type,
  p_district_code text,
  p_quote_mode public.service_quote_mode,
  p_diagnosis_scope jsonb,
  p_intake_scope_snapshot jsonb,
  p_synthetic_cohort_id text,
  p_observed_at timestamptz,
  p_excluded_job_id uuid default null,
  p_operation_id uuid default null
) returns table(worker_id uuid)
language sql
stable
security definer
set search_path = ''
as $func$
  select worker.id
  from public.worker_profiles as worker
  where worker.is_approved
    and worker.verification_status = 'approved'::public.worker_verification_status
    and worker.is_available
    and not worker.is_suspended
    and p_service_type = any(worker.selected_service_types)
    and (
      p_district_code = any(worker.districts)
      or 'hcmc_all' = any(worker.districts)
    )
    and worker.synthetic_cohort_id is not distinct from p_synthetic_cohort_id
    and (
      (
        worker.matching_push_proven_at between p_observed_at - interval '24 hours' and p_observed_at
        and exists (
          select 1
          from public.device_push_tokens as push_token
          where push_token.user_id = worker.id
            and push_token.enabled
            and push_token.permission_status = 'granted'
            and push_token.updated_at <= worker.matching_push_proven_at
        )
      )
      or worker.matching_foreground_active_until >= p_observed_at
    )
    and not exists (
      select 1
      from public.worker_service_quality_status as quality
      where quality.worker_id = worker.id
        and quality.service_type = p_service_type
        and quality.is_locked
    )
    and not exists (
      select 1
      from public.jobs as busy_job
      where busy_job.worker_id = worker.id
        and busy_job.id is distinct from p_excluded_job_id
        and busy_job.status in (
          'worker_matched', 'worker_on_way', 'arrived', 'inspecting',
          'repairing', 'scope_change_pending', 'completed_by_worker',
          'confirmed_by_customer'
        )
    )
    and not exists (
      select 1
      from public.job_worker_candidates as candidate
      where candidate.worker_id = worker.id
        and candidate.status = 'proposed'
        and (candidate.expires_at is null or candidate.expires_at > p_observed_at)
        and candidate.job_id is distinct from p_excluded_job_id
    )
    and not exists (
      select 1
      from public.matching_capacity_reservations as capacity
      where capacity.worker_id = worker.id
        and capacity.status in ('held', 'offered')
        and capacity.expires_at > p_observed_at
        and capacity.operation_id is distinct from p_operation_id
    )
    and private.worker_meets_job_matching_requirements(
      p_quote_mode,
      p_diagnosis_scope,
      p_intake_scope_snapshot,
      worker.problem_specializations
    );
$func$;

revoke execute on function private.eligible_matching_worker_ids(
  public.service_type,text,public.service_quote_mode,jsonb,jsonb,text,timestamptz,uuid,uuid
) from public, anon, authenticated;
grant execute on function private.eligible_matching_worker_ids(
  public.service_type,text,public.service_quote_mode,jsonb,jsonb,text,timestamptz,uuid,uuid
) to service_role;

create or replace function public.recover_legacy_kael_confirmation_atomic(
  p_session_id uuid,p_customer_id uuid,p_job_id uuid,p_price_reasoning_receipt_id text
) returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $func$
declare
  v_session public.kael_chat_sessions%rowtype;
  v_job public.jobs%rowtype;
  v_policy public.service_intake_policies%rowtype;
  v_operation public.confirmation_operations%rowtype;
  v_offer jsonb;
  v_price_card jsonb;
  v_market jsonb;
  v_fairness jsonb;
  v_missing_field text;
  v_problem_id uuid;
  v_key text;
  v_minimum_source_count integer;
  v_minimum_high_trust_source_count integer;
begin
  select session.* into v_session from public.kael_chat_sessions session
    join public.profiles actor on actor.id=session.customer_id and actor.role='customer'
    where session.id=p_session_id and session.customer_id=p_customer_id for update of session;
  if not found or v_session.job_id is distinct from p_job_id then
    raise exception using errcode='42501',message='LEGACY_RECOVERY_NOT_OWNED';
  end if;
  select job.* into v_job from public.jobs job
    where job.id=p_job_id and job.customer_id=p_customer_id for update;
  if not found or v_job.synthetic_cohort_id is distinct from v_session.synthetic_cohort_id then
    raise exception using errcode='42501',message='LEGACY_RECOVERY_NOT_OWNED';
  end if;
  v_key:='kael-confirm:'||p_session_id::text||':'||p_customer_id::text;
  select operation.* into v_operation from public.confirmation_operations operation
    where operation.session_id=p_session_id and operation.customer_id=p_customer_id;
  if found then
    if v_operation.job_id is distinct from p_job_id or v_operation.idempotency_key is distinct from v_key then
      raise exception using errcode='23514',message='LEGACY_RECOVERY_NOT_READY';
    end if;
    return (select (to_jsonb(receipt)-'operation_state')||jsonb_build_object('state',receipt.operation_state)
      from public.get_kael_confirmation_operation(p_session_id,p_customer_id) receipt);
  end if;
  if v_session.status is distinct from 'confirmed' or v_session.case_phase is distinct from 'matching'
    or v_job.status is distinct from 'broadcasting' or v_job.worker_id is not null
    or v_job.quote_mode is not null or v_job.final_price is not null
    or exists(select 1 from public.matching_operations where job_id=p_job_id)
    or exists(select 1 from public.job_broadcasts where job_id=p_job_id)
    or exists(select 1 from public.job_worker_candidates where job_id=p_job_id)
    or not exists(select 1 from public.job_events where job_id=p_job_id and event_type='no_worker_found')
  then raise exception using errcode='23514',message='LEGACY_RECOVERY_NOT_READY'; end if;

  v_offer:=private.validate_legacy_kael_offer(p_session_id,p_price_reasoning_receipt_id);
  v_problem_id:=nullif(v_offer->>'service_problem_id','')::uuid;
  if v_job.service_problem_id is distinct from v_problem_id or v_job.service_type is distinct from v_session.service_type
    or v_job.diagnosis_scope is distinct from v_session.diagnosis_scope
    or v_job.kael_estimate_card_v3 is distinct from v_offer->'estimate_card_v3'
    or v_job.kael_price_min is distinct from (v_offer#>>'{estimate,price_min}')::integer
    or v_job.kael_price_max is distinct from (v_offer#>>'{estimate,price_max}')::integer
    or public.normalize_hcmc_district_code(v_job.address_district) is distinct from
      public.normalize_hcmc_district_code(v_session.safe_metadata->>'address_district')
    or v_job.scheduled_at is distinct from v_session.scheduled_at
  then raise exception using errcode='23514',message='LEGACY_OFFER_CHANGED'; end if;
  select policy.* into v_policy from public.service_intake_policies policy
    where policy.service_problem_id=v_problem_id and policy.status='active' order by version desc limit 1;
  if not found then raise exception using errcode='23514',message='POLICY_UNAVAILABLE'; end if;
  if v_policy.quote_mode='blocked' then raise exception using errcode='23514',message='POLICY_BLOCKED'; end if;
  if v_policy.quote_mode is distinct from 'kael_auto_quote' then
    raise exception using errcode='23514',message='CONFIRMATION_KIND_MISMATCH';
  end if;
  if jsonb_typeof(v_policy.evidence_requirements) is distinct from 'object'
    or coalesce(v_policy.evidence_requirements->>'requires_active_baseline','') not in ('true','false')
    or coalesce(v_policy.evidence_requirements->>'minimum_source_count','') !~ '^[0-9]+$'
    or coalesce(v_policy.evidence_requirements->>'minimum_high_trust_source_count','') !~ '^[0-9]+$'
  then raise exception using errcode='23514',message='KAEL_PRICE_EVIDENCE_REQUIRED'; end if;
  v_minimum_source_count:=(v_policy.evidence_requirements->>'minimum_source_count')::integer;
  v_minimum_high_trust_source_count:=(v_policy.evidence_requirements->>'minimum_high_trust_source_count')::integer;

  if v_policy.evidence_requirements->>'requires_active_baseline'='true' then
    if not exists(select 1 from public.price_baseline_versions baseline
      where baseline.service_problem_id=v_problem_id and baseline.status='active'
        and baseline.district_code=public.normalize_hcmc_district_code(v_job.address_district)
        and baseline.complexity=v_job.kael_complexity
        and public.price_evidence_has_quorum(baseline.price_evidence)
        and (
          select count(distinct source.value->>'domain')
          from jsonb_array_elements(baseline.price_evidence->'sources') as source(value)
        )>=v_minimum_source_count
        and (
          select count(distinct source.value->>'domain')
          from jsonb_array_elements(baseline.price_evidence->'sources') as source(value)
          join public.source_trust_registry as registry on registry.domain=source.value->>'domain'
          where registry.is_active and registry.integrity_flag and registry.auto_tier<=2
        )>=v_minimum_high_trust_source_count) then
      raise exception using errcode='23514',message='KAEL_PRICE_EVIDENCE_REQUIRED';
    end if;
    if not exists(select 1 from public.price_baseline_versions baseline
      where baseline.service_problem_id=v_problem_id and baseline.status='active'
        and baseline.district_code=public.normalize_hcmc_district_code(v_job.address_district)
        and baseline.complexity=v_job.kael_complexity
        and baseline.price_min=v_job.kael_price_min and baseline.price_max=v_job.kael_price_max) then
      raise exception using errcode='23514',message='LEGACY_OFFER_CHANGED';
    end if;
  else
    v_price_card:=coalesce(
      nullif(v_offer#>'{estimate_card_v3,card}','{}'::jsonb),
      v_offer->'estimate_card_v3',
      '{}'::jsonb
    );
    v_market:=coalesce(v_price_card#>'{analysis_receipt,market}','{}'::jsonb);
    v_fairness:=coalesce(v_price_card#>'{price_reasoning_receipt,fairness}','{}'::jsonb);
    if v_policy.evidence_requirements->>'allow_live_market_evidence' is distinct from 'true'
      or v_price_card->>'price_source' not in ('perplexity_validated','baseline_with_market')
      or v_market->>'quorum_met' is distinct from 'true'
      or v_fairness->>'quorum_met' is distinct from 'true'
      or coalesce(v_market->>'accepted_source_count','') !~ '^[0-9]+$'
      or coalesce(v_market->>'high_trust_source_count','') !~ '^[0-9]+$'
      or coalesce(v_fairness->>'market_source_count','') !~ '^[0-9]+$'
      or coalesce(v_fairness->>'high_trust_source_count','') !~ '^[0-9]+$'
    then raise exception using errcode='23514',message='KAEL_PRICE_EVIDENCE_REQUIRED'; end if;
    if (v_market->>'accepted_source_count')::integer<v_minimum_source_count
      or (v_market->>'high_trust_source_count')::integer<v_minimum_high_trust_source_count
      or (v_market->>'high_trust_source_count')::integer>(v_market->>'accepted_source_count')::integer
      or (v_fairness->>'market_source_count')::integer<>(v_market->>'accepted_source_count')::integer
      or (v_fairness->>'high_trust_source_count')::integer<>(v_market->>'high_trust_source_count')::integer
    then raise exception using errcode='23514',message='KAEL_PRICE_EVIDENCE_REQUIRED'; end if;
  end if;

  select field.value into v_missing_field from jsonb_array_elements_text(v_policy.tier_a_fields) field(value)
    where case field.value
      when 'service_type' then v_session.service_type is null
      when 'problem_slug' then v_policy.problem_slug is null
      when 'address_district' then nullif(btrim(v_session.safe_metadata->>'address_district'),'') is null
      when 'address_label' then nullif(btrim(v_session.safe_metadata->>'address_label'),'') is null
      when 'scheduled_at' then v_session.scheduled_at is null or v_session.scheduled_at<=now()
      when 'description_min' then length(coalesce(v_session.diagnosis_scope->>'scope_summary',''))<10
      else nullif(btrim(coalesce(v_session.safe_metadata->>field.value,
        v_session.diagnosis_scope->'facts'->>field.value)),'') is null end limit 1;
  if v_missing_field is not null then raise exception using errcode='23514',message='TIER_A_INCOMPLETE'; end if;
  if coalesce(v_session.safe_metadata#>'{intake_coverage,safety_blocker}','null'::jsonb)<>'null'::jsonb then
    raise exception using errcode='23514',message='SAFETY_BLOCKED';
  end if;

  update public.jobs set quote_mode=v_policy.quote_mode where id=p_job_id;
  insert into public.confirmation_operations(idempotency_key,session_id,customer_id,job_id,quote_mode,
    confirmation_kind,state,support_code,synthetic_cohort_id,accepted_at)
  values(v_key,p_session_id,p_customer_id,p_job_id,v_policy.quote_mode,'priced_offer','no_reachable_worker',
    upper(substr(md5(gen_random_uuid()::text),1,8)),v_job.synthetic_cohort_id,v_job.created_at)
  returning * into v_operation;
  insert into public.confirmation_operation_receipts(operation_id,request_fingerprint,response_snapshot)
  values(v_operation.id,md5(v_key||':priced_offer'),jsonb_build_object('accepted',true,
    'quote_mode',v_policy.quote_mode,'recovered',true,'price_reasoning_receipt_id',p_price_reasoning_receipt_id));
  insert into public.matching_operations(confirmation_operation_id,job_id,state,synthetic_cohort_id)
    values(v_operation.id,p_job_id,'no_reachable_worker',v_job.synthetic_cohort_id);
  insert into public.workflow_outbox(operation_id,event_type,status,safe_payload)
    values(v_operation.id,'confirmation_accepted','completed',jsonb_build_object('job_id',p_job_id,'recovered',true));
  insert into public.job_events(job_id,actor_id,actor_role,event_type,safe_metadata)
    values(p_job_id,p_customer_id,'customer','legacy_confirmation_recovered',
      jsonb_build_object('operation_id',v_operation.id,'policy_id',v_policy.id,'policy_version',v_policy.version));
  return (select (to_jsonb(receipt)-'operation_state')||jsonb_build_object('state',receipt.operation_state)
    from public.get_kael_confirmation_operation(p_session_id,p_customer_id) receipt);
end;
$func$;

revoke execute on function public.recover_legacy_kael_confirmation_atomic(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.recover_legacy_kael_confirmation_atomic(uuid,uuid,uuid,text) to service_role;

commit;
