create or replace function public.confirm_kael_chat_atomic(
  p_session_id uuid,
  p_customer_id uuid
) returns table (
  ok boolean,
  error_code text,
  job_id uuid,
  job_status public.job_status,
  service_type public.service_type,
  district_code text
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_session public.kael_chat_sessions%rowtype;
  v_estimate_turn public.kael_chat_turns%rowtype;
  v_estimate jsonb;
  v_estimate_card jsonb;
  v_price_card jsonb;
  v_price_reasoning jsonb;
  v_analysis_receipt jsonb;
  v_service_problem_id uuid;
  v_description text;
  v_problem_chips text[];
  v_photo_urls text[];
  v_address_district text;
  v_job_id uuid;
begin
  select * into v_session
  from public.kael_chat_sessions
  where id = p_session_id
  for update;

  if not found or v_session.customer_id <> p_customer_id then
    return query select false, 'NOT_FOUND', null::uuid, null::public.job_status, null::public.service_type, null::text;
    return;
  end if;

  if v_session.status = 'confirmed' or v_session.job_id is not null then
    return query select false, 'ALREADY_CONFIRMED', v_session.job_id, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  if v_session.status <> 'estimate_ready' or v_session.case_phase <> 'offer_review' then
    return query select false, 'INVALID_STATUS', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  if v_session.diagnosis_scope is null
    or v_session.diagnosis_scope ->> 'quote_ready' <> 'true'
    or jsonb_array_length(coalesce(v_session.diagnosis_scope -> 'quote_blockers', '[]'::jsonb)) <> 0
    or coalesce((v_session.diagnosis_scope -> 'facts' ->> 'needs_inspection')::boolean, false)
    or v_session.diagnosis_scope -> 'next_action' ->> 'kind' <> 'prepare_offer'
    or nullif(v_session.diagnosis_scope ->> 'scope_summary', '') is null
  then
    return query select false, 'MISSING_SCOPE', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
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
    return query select false, 'MISSING_ESTIMATE', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
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
  v_service_problem_id := nullif(
    v_estimate_turn.safe_metadata ->> 'service_problem_id',
    ''
  )::uuid;
  if v_estimate = '{}'::jsonb
    or nullif(v_estimate ->> 'problem_summary', '') is null
    or nullif(v_estimate ->> 'complexity', '') is null
    or nullif(v_estimate ->> 'price_min', '') is null
    or nullif(v_estimate ->> 'price_max', '') is null
  then
    return query select false, 'MISSING_ESTIMATE', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
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
    return query select false, 'MISSING_REASONING_RECEIPT', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  v_address_district := nullif(v_session.safe_metadata ->> 'address_district', '');
  if v_address_district is null then
    return query select false, 'NO_DISTRICT', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  v_description := v_session.diagnosis_scope ->> 'scope_summary';
  v_problem_chips := coalesce(
    array(select jsonb_array_elements_text(v_session.safe_metadata -> 'problem_chips')),
    array[]::text[]
  );
  if cardinality(v_problem_chips) = 0 then
    v_problem_chips := array[v_estimate ->> 'problem_category'];
  end if;

  v_photo_urls := coalesce(
    array(
      select distinct evidence ->> 'ref'
      from jsonb_array_elements(v_session.diagnosis_scope -> 'evidence') as evidence
      where evidence ->> 'kind' in ('photo', 'video_frame')
        and nullif(evidence ->> 'ref', '') is not null
    ),
    array[]::text[]
  );

  insert into public.jobs (
    customer_id,
    service_type,
    description,
    problem_chips,
    photo_urls,
    address_district,
    scheduled_at,
    status,
    service_problem_id,
    diagnosis_scope,
    kael_problem_identified,
    kael_complexity,
    kael_price_min,
    kael_price_max,
    kael_advisory,
    kael_estimate_card_v3,
    estimate_ready_at
  ) values (
    v_session.customer_id,
    v_session.service_type,
    v_description,
    v_problem_chips,
    v_photo_urls,
    v_address_district,
    v_session.scheduled_at,
    'awaiting_customer_confirm'::public.job_status,
    v_service_problem_id,
    v_session.diagnosis_scope,
    v_estimate ->> 'problem_summary',
    (v_estimate ->> 'complexity')::public.complexity_level,
    (v_estimate ->> 'price_min')::int,
    (v_estimate ->> 'price_max')::int,
    nullif(v_estimate ->> 'advisory', ''),
    v_estimate_card,
    now()
  ) returning id into v_job_id;

  update public.kael_chat_sessions
  set job_id = v_job_id,
      status = 'confirmed',
      case_phase = 'matching',
      updated_at = now()
  where id = p_session_id;

  return query select true, null::text, v_job_id,
    'awaiting_customer_confirm'::public.job_status,
    v_session.service_type,
    v_address_district;
end;
$func$;

revoke execute on function public.confirm_kael_chat_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_kael_chat_atomic(uuid, uuid) to service_role;
