-- An auto-quote case whose live price research found no validated evidence used to stop dead:
-- the confirm RPC accepted only priced_offer for an auto-quote policy. A policy may now name
-- "rfq" as its evidence_unavailable_fallback; the customer then confirms rfq_request and a
-- worker quotes before any price is agreed (RULES #4). The fallback must have been recorded by
-- the Edge for exactly the active policy id and version, so a client cannot claim it on its own.
begin;

create or replace function public.confirm_kael_chat_durable_atomic(
  p_session_id uuid,
  p_customer_id uuid,
  p_idempotency_key text,
  p_confirmation_kind text,
  p_price_reasoning_receipt_id text default null
) returns table (
  ok boolean,
  error_code text,
  operation_id uuid,
  receipt_id uuid,
  job_id uuid,
  job_status public.job_status,
  quote_mode public.service_quote_mode,
  operation_state text,
  already_applied boolean,
  accepted_at timestamptz,
  updated_at timestamptz
) language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare
  v_session public.kael_chat_sessions%rowtype;
  v_policy public.service_intake_policies%rowtype;
  v_operation public.confirmation_operations%rowtype;
  v_receipt public.confirmation_operation_receipts%rowtype;
  v_old record;
  v_service_problem_id uuid;
  v_description text;
  v_district text;
  v_problem_chips text[];
  v_photo_urls text[];
  v_missing_field text;
  v_job_id uuid;
  v_effective_quote_mode public.service_quote_mode;
begin
  if p_idempotency_key is distinct from ('kael-confirm:' || p_session_id::text || ':' || p_customer_id::text)
    or p_confirmation_kind not in ('priced_offer', 'rfq_request', 'inspection_request')
  then
    return query select false, 'IDEMPOTENCY_INVALID', null::uuid, null::uuid,
      null::uuid, null::public.job_status, null::public.service_quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_session from public.kael_chat_sessions
    where id = p_session_id for update;
  if not found or v_session.customer_id <> p_customer_id then
    return query select false, 'NOT_FOUND', null::uuid, null::uuid,
      null::uuid, null::public.job_status, null::public.service_quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_operation from public.confirmation_operations
    where idempotency_key = p_idempotency_key for update;
  if found then
    select * into strict v_receipt from public.confirmation_operation_receipts as operation_receipt
      where operation_receipt.operation_id = v_operation.id;
    return query select true, null::text, v_operation.id, v_receipt.id,
      v_operation.job_id, coalesce((select status from public.jobs where id = v_operation.job_id),
        'awaiting_customer_confirm'::public.job_status), v_operation.quote_mode,
      v_operation.state, true, v_operation.accepted_at, v_operation.updated_at;
    return;
  end if;

  select nullif(turn.safe_metadata ->> 'service_problem_id', '')::uuid
    into v_service_problem_id
  from public.kael_chat_turns turn
  where turn.session_id = p_session_id
    and nullif(turn.safe_metadata ->> 'service_problem_id', '') is not null
  order by turn.turn_index desc limit 1;

  if v_service_problem_id is null then
    return query select false, 'POLICY_UNAVAILABLE', null::uuid, null::uuid,
      null::uuid, null::public.job_status, null::public.service_quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;
  select * into v_policy from public.service_intake_policies
    where service_problem_id = v_service_problem_id and status = 'active'
    order by version desc limit 1;
  if not found then
    return query select false, 'POLICY_UNAVAILABLE', null::uuid, null::uuid,
      null::uuid, null::public.job_status, null::public.service_quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_policy.quote_mode = 'blocked' then
    return query select false, 'POLICY_BLOCKED', null::uuid, null::uuid,
      null::uuid, null::public.job_status, v_policy.quote_mode,
      'stopped', false, null::timestamptz, null::timestamptz;
    return;
  end if;
  -- An auto-quote case with no validated price may be sent for a worker quote, but only when the
  -- active policy allows that fallback and the Edge recorded it for exactly this policy version.
  v_effective_quote_mode := v_policy.quote_mode;
  if v_policy.quote_mode = 'kael_auto_quote'
    and p_confirmation_kind = 'rfq_request'
    and v_policy.evidence_requirements ->> 'evidence_unavailable_fallback' = 'rfq'
    and v_session.safe_metadata #>> '{quote_mode_fallback,mode}' = 'rfq'
    and v_session.safe_metadata #>> '{quote_mode_fallback,policy_id}' = v_policy.id::text
    and v_session.safe_metadata #>> '{quote_mode_fallback,policy_version}' = v_policy.version::text
  then
    v_effective_quote_mode := 'rfq';
  end if;
  if (v_effective_quote_mode = 'kael_auto_quote' and p_confirmation_kind <> 'priced_offer')
    or (v_effective_quote_mode = 'rfq' and p_confirmation_kind <> 'rfq_request')
    or (v_effective_quote_mode = 'inspection_only' and p_confirmation_kind <> 'inspection_request')
  then
    return query select false, 'CONFIRMATION_KIND_MISMATCH', null::uuid, null::uuid,
      null::uuid, null::public.job_status, v_effective_quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_description := nullif(btrim(v_session.diagnosis_scope ->> 'scope_summary'), '');
  v_district := nullif(btrim(v_session.safe_metadata ->> 'address_district'), '');
  select field.value into v_missing_field
  from jsonb_array_elements_text(v_policy.tier_a_fields) field(value)
  where case field.value
    when 'service_type' then v_session.service_type is null
    when 'problem_slug' then v_policy.problem_slug is null
    when 'address_district' then v_district is null
    when 'address_label' then nullif(btrim(v_session.safe_metadata ->> 'address_label'), '') is null
    when 'scheduled_at' then v_session.scheduled_at is null
    when 'description_min' then v_description is null or length(v_description) < 10
    else nullif(btrim(coalesce(v_session.safe_metadata ->> field.value,
      v_session.diagnosis_scope -> 'facts' ->> field.value)), '') is null
  end limit 1;
  if v_missing_field is not null then
    return query select false, 'TIER_A_INCOMPLETE', null::uuid, null::uuid,
      null::uuid, null::public.job_status, v_effective_quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_session.safe_metadata #> '{intake_coverage,safety_blocker}' is not null
    and v_session.safe_metadata #> '{intake_coverage,safety_blocker}' <> 'null'::jsonb
  then
    return query select false, 'SAFETY_BLOCKED', null::uuid, null::uuid,
      null::uuid, null::public.job_status, v_effective_quote_mode,
      'stopped', false, null::timestamptz, null::timestamptz;
    return;
  end if;

  insert into public.confirmation_operations(
    idempotency_key, session_id, customer_id, quote_mode, confirmation_kind,
    state, support_code, synthetic_cohort_id
  ) values (
    p_idempotency_key, p_session_id, p_customer_id, v_effective_quote_mode,
    p_confirmation_kind, 'confirmation_pending', upper(substr(md5(gen_random_uuid()::text), 1, 8)),
    v_session.synthetic_cohort_id
  ) returning * into v_operation;

  if v_effective_quote_mode = 'kael_auto_quote' then
    if not exists (
      select 1 from public.price_baseline_versions baseline
      where baseline.service_problem_id = v_service_problem_id
        and baseline.status = 'active'
        and public.price_evidence_has_quorum(baseline.price_evidence)
    ) then
      raise exception using errcode = '23514', message = 'KAEL_PRICE_EVIDENCE_REQUIRED';
    end if;
    select * into v_old from public.confirm_kael_chat_atomic(
      p_session_id, p_customer_id, p_price_reasoning_receipt_id
    );
    if not coalesce(v_old.ok, false) then
      raise exception using errcode = '55000', message = coalesce(v_old.error_code, 'KAEL_CONFIRM_FAILED');
    end if;
    v_job_id := v_old.job_id;
    update public.jobs set quote_mode = v_effective_quote_mode,
      synthetic_cohort_id = v_session.synthetic_cohort_id where id = v_job_id;
  else
    v_problem_chips := coalesce(array(
      select jsonb_array_elements_text(v_session.safe_metadata -> 'problem_chips')
    ), array[v_policy.problem_slug]);
    if cardinality(v_problem_chips) = 0 then v_problem_chips := array[v_policy.problem_slug]; end if;
    v_photo_urls := coalesce(array(
      select distinct evidence ->> 'ref'
      from jsonb_array_elements(coalesce(v_session.diagnosis_scope -> 'evidence', '[]'::jsonb)) evidence
      where evidence ->> 'kind' in ('photo', 'video_frame')
        and nullif(evidence ->> 'ref', '') is not null
    ), array[]::text[]);
    insert into public.jobs(
      customer_id, service_type, description, problem_chips, photo_urls,
      address_district, scheduled_at, status, service_problem_id, diagnosis_scope,
      intake_scope_snapshot, kael_problem_identified, quote_mode, synthetic_cohort_id
    ) values (
      p_customer_id, v_session.service_type, v_description, v_problem_chips, v_photo_urls,
      v_district, v_session.scheduled_at, 'awaiting_customer_confirm',
      v_service_problem_id, null, v_session.diagnosis_scope, v_description,
      v_effective_quote_mode, v_session.synthetic_cohort_id
    ) returning id into v_job_id;
    update public.kael_chat_sessions set job_id = v_job_id, status = 'confirmed',
      case_phase = 'matching', updated_at = now() where id = p_session_id;
  end if;

  update public.confirmation_operations set job_id = v_job_id,
    state = 'matching_queued', updated_at = now()
    where id = v_operation.id returning * into v_operation;
  insert into public.confirmation_operation_receipts(
    operation_id, request_fingerprint, response_snapshot
  ) values (
    v_operation.id, md5(p_idempotency_key || ':' || p_confirmation_kind),
    jsonb_build_object('accepted', true, 'quote_mode', v_effective_quote_mode)
  ) returning * into v_receipt;
  insert into public.workflow_outbox(operation_id, event_type, status, safe_payload)
    values (v_operation.id, 'confirmation_accepted', 'completed',
      jsonb_build_object('job_id', v_job_id))
    on conflict do nothing;
  insert into public.workflow_outbox(operation_id, event_type, safe_payload)
    values (v_operation.id, 'matching_requested', jsonb_build_object('job_id', v_job_id))
    on conflict do nothing;
  insert into public.matching_operations(
    confirmation_operation_id, job_id, state, synthetic_cohort_id
  ) values (v_operation.id, v_job_id, 'queued', v_session.synthetic_cohort_id)
    on conflict do nothing;

  return query select true, null::text, v_operation.id, v_receipt.id,
    v_job_id, 'awaiting_customer_confirm'::public.job_status, v_effective_quote_mode,
    v_operation.state, false, v_operation.accepted_at, v_operation.updated_at;
end;
$func$;

create temporary table evidence_gap_fallback_policy_moves on commit drop as
select policy.*,
  (select max(version) + 1 from public.service_intake_policies existing
   where existing.service_problem_id = policy.service_problem_id) as next_version
from public.service_intake_policies policy
where policy.status = 'active'
  and policy.quote_mode = 'kael_auto_quote'
  and not (policy.evidence_requirements ? 'evidence_unavailable_fallback');

update public.service_intake_policies policy
set status = 'retired', updated_at = now()
from evidence_gap_fallback_policy_moves moved
where policy.id = moved.id;

insert into public.service_intake_policies(
  service_problem_id, service_type, problem_slug, version, status, quote_mode,
  tier_a_fields, tier_b_slots, question_overrides, safety_requirements,
  capability_requirements, evidence_requirements, reason,
  created_by, approved_by, approved_at, published_by, published_at, updated_by
)
select moved.service_problem_id, moved.service_type, moved.problem_slug,
  moved.next_version, 'active', moved.quote_mode,
  moved.tier_a_fields, moved.tier_b_slots, moved.question_overrides,
  moved.safety_requirements, moved.capability_requirements,
  moved.evidence_requirements || '{"evidence_unavailable_fallback":"rfq"}'::jsonb,
  'Auto-quote may fall back to a customer-confirmed worker quote when no validated price exists',
  null, null, now(), null, now(), null
from evidence_gap_fallback_policy_moves moved;

update public.service_intake_policy_heads head
set active_version = moved.next_version,
  revision = head.revision + 1,
  updated_at = now()
from evidence_gap_fallback_policy_moves moved
where head.service_problem_id = moved.service_problem_id;

insert into public.service_intake_policy_audit(
  policy_id, service_problem_id, event, from_version, to_version,
  revision, actor_id, reason, actor_kind
)
select current_policy.id, current_policy.service_problem_id, 'published',
  moved.version, moved.next_version, head.revision, null,
  'Migration let auto-quote cases without validated price evidence ask a worker to quote',
  'migration'
from evidence_gap_fallback_policy_moves moved
join public.service_intake_policies current_policy
  on current_policy.service_problem_id = moved.service_problem_id
  and current_policy.version = moved.next_version
join public.service_intake_policy_heads head
  on head.service_problem_id = moved.service_problem_id;

commit;
