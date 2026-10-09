begin;

create or replace function private.validate_legacy_kael_offer(
  p_session_id uuid, p_price_reasoning_receipt_id text
) returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $func$
declare
  v_session public.kael_chat_sessions%rowtype;
  v_estimate_turn public.kael_chat_turns%rowtype;
  v_estimate jsonb;
  v_estimate_card jsonb;
  v_price_card jsonb;
  v_price_reasoning jsonb;
  v_analysis_receipt jsonb;
  v_price_reasoning_receipt jsonb;
  v_components jsonb;
  v_service_problem_id uuid;
  v_address_district text;
begin
  select session.* into strict v_session from public.kael_chat_sessions session where session.id=p_session_id;
  if v_session.diagnosis_scope is null
    or v_session.diagnosis_scope ->> 'quote_ready' is distinct from 'true'
    or jsonb_array_length(coalesce(v_session.diagnosis_scope -> 'quote_blockers', '[]'::jsonb)) <> 0
    or coalesce((v_session.diagnosis_scope -> 'facts' ->> 'needs_inspection')::boolean, false)
    or v_session.diagnosis_scope -> 'next_action' ->> 'kind' is distinct from 'prepare_offer'
    or nullif(v_session.diagnosis_scope ->> 'scope_summary', '') is null
  then
    raise exception using errcode='23514', message='MISSING_SCOPE';
  end if;

  select * into v_estimate_turn
  from public.kael_chat_turns
  where session_id = p_session_id
    and role = 'kael'
    and content_type = 'estimate'
  order by turn_index desc
  limit 1
  for update;

  if not found then
    raise exception using errcode='23514', message='MISSING_ESTIMATE';
  end if;

  v_estimate := coalesce(v_estimate_turn.safe_metadata -> 'estimate', '{}'::jsonb);
  v_estimate_card := nullif(
    coalesce(v_estimate_turn.safe_metadata -> 'estimate_card_v3', '{}'::jsonb),
    '{}'::jsonb
  );
  v_price_card := coalesce(
    nullif(v_estimate_card -> 'card', '{}'::jsonb),
    v_estimate_card,
    '{}'::jsonb
  );
  v_price_reasoning := coalesce(v_price_card -> 'kael_reasoning', '{}'::jsonb);
  v_analysis_receipt := coalesce(v_price_card -> 'analysis_receipt', '{}'::jsonb);
  v_price_reasoning_receipt := coalesce(
    v_price_card -> 'price_reasoning_receipt',
    '{}'::jsonb
  );
  v_service_problem_id := nullif(
    v_estimate_turn.safe_metadata ->> 'service_problem_id',
    ''
  )::uuid;

  if v_estimate = '{}'::jsonb
    or nullif(v_estimate ->> 'problem_summary', '') is null
    or nullif(v_estimate ->> 'complexity', '') is null
    or coalesce(v_estimate ->> 'price_min', '') !~ '^[0-9]+$'
    or coalesce(v_estimate ->> 'price_max', '') !~ '^[0-9]+$'
  then
    raise exception using errcode='23514', message='MISSING_ESTIMATE';
  end if;

  if coalesce(jsonb_typeof(v_price_card), '') <> 'object'
    or coalesce(v_price_card ->> 'price_source', '') not in (
      'perplexity_validated',
      'baseline_with_market',
      'baseline_only',
      'inspection_required'
    )
    or coalesce(jsonb_typeof(v_price_reasoning), '') <> 'object'
    or nullif(v_price_reasoning ->> 'baseline_used', '') is null
    or nullif(v_price_reasoning ->> 'complexity_reasoning', '') is null
    or coalesce(jsonb_typeof(v_analysis_receipt), '') <> 'object'
    or coalesce(v_analysis_receipt ->> 'schema_version', '') <> 'analysis_receipt.v1'
    or coalesce(jsonb_typeof(v_analysis_receipt -> 'evidence'), '') <> 'object'
    or coalesce(jsonb_typeof(v_analysis_receipt -> 'market'), '') <> 'object'
    or coalesce(jsonb_typeof(v_analysis_receipt -> 'evidence' -> 'photo_count'), '') <> 'number'
    or coalesce(jsonb_typeof(v_analysis_receipt -> 'evidence' -> 'video_frame_count'), '') <> 'number'
    or coalesce(jsonb_typeof(v_analysis_receipt -> 'evidence' -> 'voice_transcript_count'), '') <> 'number'
    or coalesce(jsonb_typeof(v_analysis_receipt -> 'evidence' -> 'skipped'), '') <> 'boolean'
    or coalesce(v_analysis_receipt -> 'evidence' ->> 'analysis_status', '') not in (
      '',
      'analyzed',
      'not_provided',
      'unavailable'
    )
    or coalesce(jsonb_typeof(v_analysis_receipt -> 'evidence' -> 'findings'), 'null') not in ('array', 'null')
    or coalesce(jsonb_typeof(v_analysis_receipt -> 'market' -> 'accepted_source_count'), '') not in ('number', 'null')
    or coalesce(jsonb_typeof(v_analysis_receipt -> 'market' -> 'high_trust_source_count'), '') not in ('number', 'null')
    or coalesce(jsonb_typeof(v_analysis_receipt -> 'market' -> 'quorum_met'), '') not in ('boolean', 'null')
  then
    raise exception using errcode='23514', message='MISSING_REASONING_RECEIPT';
  end if;

  if nullif(trim(p_price_reasoning_receipt_id), '') is null
    or char_length(p_price_reasoning_receipt_id) < 8
    or coalesce(jsonb_typeof(v_price_reasoning_receipt), '') <> 'object'
    or coalesce(v_price_reasoning_receipt ->> 'schema_version', '') <> 'price_reasoning_receipt.v1'
    or coalesce(v_price_reasoning_receipt ->> 'receipt_id', '') <> coalesce(p_price_reasoning_receipt_id, '')
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'problem'), '') <> 'object'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'scope'), '') <> 'object'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'costs'), '') <> 'object'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'scenarios'), '') <> 'object'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'fairness'), '') <> 'object'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'problem' -> 'confirmed_facts'), '') <> 'array'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'problem' -> 'possible_causes'), '') <> 'array'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'problem' -> 'unknowns'), '') <> 'array'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'scope' -> 'included'), '') <> 'array'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'scope' -> 'conditional'), '') <> 'array'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'scope' -> 'excluded'), '') <> 'array'
    or coalesce(v_price_reasoning_receipt -> 'costs' ->> 'currency', '') <> 'VND'
    or coalesce(v_price_reasoning_receipt -> 'costs' ->> 'reconciliation', '') not in ('package_total', 'exact')
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'costs' -> 'total_min'), '') <> 'number'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'costs' -> 'total_max'), '') <> 'number'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'costs' -> 'components'), '') <> 'array'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'scenarios' -> 'low'), '') <> 'object'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'scenarios' -> 'high'), '') <> 'object'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'scenarios' -> 'low' -> 'total'), '') <> 'number'
    or coalesce(jsonb_typeof(v_price_reasoning_receipt -> 'scenarios' -> 'high' -> 'total'), '') <> 'number'
    or coalesce(v_price_reasoning_receipt -> 'fairness' ->> 'price_source', '') <> coalesce(v_price_card ->> 'price_source', '')
    or coalesce(v_price_reasoning_receipt -> 'fairness' ->> 'confidence', '') not in ('low', 'medium', 'high')
    or nullif(v_price_reasoning_receipt -> 'fairness' ->> 'cap_statement', '') is null
  then
    raise exception using errcode='23514', message='MISSING_REASONING_RECEIPT';
  end if;

  v_components := v_price_reasoning_receipt -> 'costs' -> 'components';
  if jsonb_array_length(v_price_reasoning_receipt -> 'problem' -> 'confirmed_facts') = 0
    or jsonb_array_length(v_price_reasoning_receipt -> 'problem' -> 'possible_causes') = 0
    or jsonb_array_length(v_price_reasoning_receipt -> 'scope' -> 'included') = 0
    or jsonb_array_length(v_components) = 0
    or exists (
      select 1
      from jsonb_array_elements(v_components) as component(value)
      where jsonb_typeof(component.value) <> 'object'
        or coalesce(component.value ->> 'kind', '') not in (
          'service_package',
          'labor',
          'travel',
          'materials',
          'replacement_parts',
          'equipment',
          'other'
        )
        or coalesce(component.value ->> 'status', '') not in (
          'priced',
          'included_unitemized',
          'conditional_unpriced',
          'excluded',
          'undetermined'
        )
        or nullif(component.value ->> 'explanation', '') is null
        or (
          component.value ->> 'status' = 'priced'
          and (
            component.value ->> 'kind' <> 'service_package'
            or jsonb_typeof(component.value -> 'amount_min') <> 'number'
            or jsonb_typeof(component.value -> 'amount_max') <> 'number'
          )
        )
        or (
          component.value ->> 'status' <> 'priced'
          and (
            coalesce(component.value -> 'amount_min', 'null'::jsonb) <> 'null'::jsonb
            or coalesce(component.value -> 'amount_max', 'null'::jsonb) <> 'null'::jsonb
          )
        )
    )
  then
    raise exception using errcode='23514', message='MISSING_REASONING_RECEIPT';
  end if;

  if (v_price_reasoning_receipt -> 'costs' ->> 'total_min')::numeric <> (v_estimate ->> 'price_min')::numeric
    or (v_price_reasoning_receipt -> 'costs' ->> 'total_max')::numeric <> (v_estimate ->> 'price_max')::numeric
    or (v_price_reasoning_receipt -> 'costs' ->> 'total_min')::numeric <= 0
    or (v_price_reasoning_receipt -> 'costs' ->> 'total_max')::numeric < (v_price_reasoning_receipt -> 'costs' ->> 'total_min')::numeric
    or (v_price_reasoning_receipt -> 'scenarios' -> 'low' ->> 'total')::numeric <> (v_price_reasoning_receipt -> 'costs' ->> 'total_min')::numeric
    or (v_price_reasoning_receipt -> 'scenarios' -> 'high' ->> 'total')::numeric <> (v_price_reasoning_receipt -> 'costs' ->> 'total_max')::numeric
    or exists (
      select 1
      from jsonb_array_elements(v_components) as component(value)
      where component.value ->> 'status' = 'priced'
        and (
          (component.value ->> 'amount_min')::numeric <= 0
          or (component.value ->> 'amount_max')::numeric < (component.value ->> 'amount_min')::numeric
        )
    )
  then
    raise exception using errcode='23514', message='MISSING_REASONING_RECEIPT';
  end if;

  if v_price_reasoning_receipt -> 'costs' ->> 'reconciliation' = 'package_total' then
    if (
      select count(*)
      from jsonb_array_elements(v_components) as component(value)
      where component.value ->> 'status' = 'priced'
        and component.value ->> 'kind' = 'service_package'
    ) <> 1
    or exists (
      select 1
      from jsonb_array_elements(v_components) as component(value)
      where component.value ->> 'status' = 'priced'
        and (
          (component.value ->> 'amount_min')::numeric <> (v_price_reasoning_receipt -> 'costs' ->> 'total_min')::numeric
          or (component.value ->> 'amount_max')::numeric <> (v_price_reasoning_receipt -> 'costs' ->> 'total_max')::numeric
        )
    ) then
      raise exception using errcode='23514', message='MISSING_REASONING_RECEIPT';
    end if;
  elsif (
    select coalesce(sum((component.value ->> 'amount_min')::numeric), -1)
    from jsonb_array_elements(v_components) as component(value)
    where component.value ->> 'status' = 'priced'
  ) <> (v_price_reasoning_receipt -> 'costs' ->> 'total_min')::numeric
  or (
    select coalesce(sum((component.value ->> 'amount_max')::numeric), -1)
    from jsonb_array_elements(v_components) as component(value)
    where component.value ->> 'status' = 'priced'
  ) <> (v_price_reasoning_receipt -> 'costs' ->> 'total_max')::numeric then
    raise exception using errcode='23514', message='MISSING_REASONING_RECEIPT';
  end if;

  v_address_district := nullif(v_session.safe_metadata ->> 'address_district', '');
  if v_address_district is null then
    raise exception using errcode='23514', message='NO_DISTRICT';
  end if;

  return v_estimate_turn.safe_metadata;
exception when data_exception then
  raise exception using errcode='23514',message='MISSING_REASONING_RECEIPT';
end;
$func$;
revoke execute on function private.validate_legacy_kael_offer(uuid,text) from public,anon,authenticated;
grant execute on function private.validate_legacy_kael_offer(uuid,text) to service_role;

create or replace function public.recover_legacy_kael_confirmation_atomic(
  p_session_id uuid,p_customer_id uuid,p_job_id uuid,p_price_reasoning_receipt_id text
) returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $func$
declare
  v_session public.kael_chat_sessions%rowtype;
  v_job public.jobs%rowtype;
  v_policy public.service_intake_policies%rowtype;
  v_operation public.confirmation_operations%rowtype;
  v_offer jsonb;
  v_missing_field text;
  v_problem_id uuid;
  v_key text;
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
  if not exists(select 1 from public.price_baseline_versions baseline
    where baseline.service_problem_id=v_problem_id and baseline.status='active'
      and baseline.district_code=public.normalize_hcmc_district_code(v_job.address_district)
      and baseline.complexity=v_job.kael_complexity
      and public.price_evidence_has_quorum(baseline.price_evidence)) then
    raise exception using errcode='23514',message='KAEL_PRICE_EVIDENCE_REQUIRED';
  end if;
  if not exists(select 1 from public.price_baseline_versions baseline
    where baseline.service_problem_id=v_problem_id and baseline.status='active'
      and baseline.district_code=public.normalize_hcmc_district_code(v_job.address_district)
      and baseline.complexity=v_job.kael_complexity
      and baseline.price_min=v_job.kael_price_min and baseline.price_max=v_job.kael_price_max) then
    raise exception using errcode='23514',message='LEGACY_OFFER_CHANGED';
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
