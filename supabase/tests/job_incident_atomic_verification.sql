begin;

-- duplicate chat source must be idempotent
-- stale assistant result must not apply
-- service_role must retain execute
-- authenticated must not execute

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a7100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'incident-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a7100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'incident-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set role = 'worker'
where id = 'a7100000-0000-4000-8000-000000000002';

insert into public.jobs (
  id,
  customer_id,
  worker_id,
  service_type,
  description,
  address_district,
  status,
  kael_problem_identified,
  kael_complexity,
  kael_price_min,
  kael_price_max
) values (
  'a7200000-0000-4000-8000-000000000001',
  'a7100000-0000-4000-8000-000000000001',
  'a7100000-0000-4000-8000-000000000002',
  'electrical',
  'Verify atomic job incident transitions',
  'q1',
  'repairing',
  'electrical-general',
  'medium',
  200000,
  400000
);

do $$
declare
  v_first record;
  v_first_retry record;
  v_description_conflict record;
  v_reason_conflict record;
  v_first_conflict record;
  v_first_reclaimed record;
  v_second record;
  v_chat record;
  v_chat_content_invalid record;
  v_chat_replay_content_invalid record;
  v_chat_retry record;
  v_chat_phase_stale record;
  v_chat_job_stale record;
  v_chat_reclaimed record;
  v_chat_after_job_stale record;
  v_stale record;
  v_scope_transition_invalid record;
  v_applied record;
  v_apply_retry record;
  v_claim_job_stale record;
  v_claim_one record;
  v_claim_two_blocked record;
  v_claim_two record;
  v_claim_retry record;
  v_quote_one record;
  v_quote_two record;
  v_after_claim_signal record;
  v_stale_scope record;
  v_scope record;
  v_scope_valid_chat record;
  v_scope_valid_apply record;
  v_scope_pending_chat record;
  v_scope_missing_link_stale record;
  v_scope_reclaimed_chat record;
  v_scope_decision_stale record;
  v_post_decision_chat record;
  v_message_id uuid := 'a7300000-0000-4000-8000-000000000001';
  v_incident_id uuid;
  v_event_count integer;
  v_kael_message_count integer;
  v_evidence jsonb;
  v_quote_one_id uuid := 'a7700000-0000-4000-8000-000000000001';
  v_quote_two_id uuid := 'a7700000-0000-4000-8000-000000000002';
  v_review jsonb := '{
    "price_min": 350000,
    "price_max": 350000,
    "confidence": 0.84,
    "problem_summary": "The cable and heat-damaged terminal require replacement.",
    "advisory": "The customer must approve the changed scope before work continues.",
    "complexity_assessment": "medium",
    "disclaimer": "Kael estimate for explicit customer confirmation.",
    "fallback_used": false,
    "anti_fraud": {"score": 0.1, "challenge_required": false},
    "worker_challenge": {"challenge_required": false},
    "customer_card": {"decision_required": true},
    "price_source": "verified_baseline",
    "pricing_mode": "full_scope_total",
    "selection_rule": "verified_neutral_midpoint_with_bilateral_confirmation",
    "baseline_used": "electrical_terminal_replacement_medium_hcmc",
    "baseline_source": "verified_test_baseline",
    "reference_price_min": 250000,
    "reference_price_max": 450000,
    "stakeholder_balance": {
      "customer_total": 350000,
      "platform_fee": 35000,
      "worker_net": 315000,
      "commission_rate_bps": 1000,
      "worker_confirmation_required": true,
      "customer_confirmation_required": true
    },
    "worker_price_confirmation": {
      "confirmed": true,
      "quote_id": "a7700000-0000-4000-8000-000000000001",
      "confirmed_at": "pending"
    }
  }'::jsonb;
begin
  select * into v_first
  from public.upsert_job_incident_signal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'The damaged cable must be replaced safely.',
    'The cable insulation is visibly burned.',
    '["ref-a", "ref-b", "ref-c", "ref-d", "ref-e"]'::jsonb,
    'a7400000-0000-4000-8000-000000000001',
    'a7600000-0000-4000-8000-000000000001',
    'First worker incident signal'
  );

  if v_first.ok is not true or v_first.idempotent is true or v_first.revision <> 1 then
    raise exception 'first incident signal was not accepted at revision one';
  end if;
  v_incident_id := (v_first.incident->>'id')::uuid;

  select * into v_first_retry
  from public.upsert_job_incident_signal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'The damaged cable must be replaced safely.',
    'The cable insulation is visibly burned.',
    '["ref-a", "ref-b", "ref-c", "ref-d", "ref-e"]'::jsonb,
    'a7400000-0000-4000-8000-000000000001',
    'a7600000-0000-4000-8000-000000000002',
    'First worker incident signal'
  );

  if v_first_retry.ok is not true
    or v_first_retry.idempotent is not true
    or v_first_retry.revision <> 1
    or (v_first_retry.incident->>'id')::uuid <> v_incident_id
  then
    raise exception 'duplicate incident request was not idempotent';
  end if;

  select * into v_description_conflict
  from public.upsert_job_incident_signal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'A different description reused the same durable identifier.',
    'The cable insulation is visibly burned.',
    '["ref-a", "ref-b", "ref-c", "ref-d", "ref-e"]'::jsonb,
    'a7400000-0000-4000-8000-000000000001',
    'a7600000-0000-4000-8000-000000000008',
    'First worker incident signal'
  );
  if v_description_conflict.ok is not false
    or v_description_conflict.error_code <> 'IDEMPOTENCY_CONFLICT'
  then
    raise exception 'reused request id accepted a different reported description';
  end if;

  select * into v_reason_conflict
  from public.upsert_job_incident_signal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'The damaged cable must be replaced safely.',
    'A different reason reused the same durable identifier.',
    '["ref-a", "ref-b", "ref-c", "ref-d", "ref-e"]'::jsonb,
    'a7400000-0000-4000-8000-000000000001',
    'a7600000-0000-4000-8000-000000000008',
    'First worker incident signal'
  );
  if v_reason_conflict.ok is not false
    or v_reason_conflict.error_code <> 'IDEMPOTENCY_CONFLICT'
  then
    raise exception 'reused request id accepted a different reported reason';
  end if;

  select * into v_first_conflict
  from public.upsert_job_incident_signal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'A different request reused the same durable identifier.',
    'This must not silently return the first mutation.',
    '["ref-z"]'::jsonb,
    'a7400000-0000-4000-8000-000000000001',
    'a7600000-0000-4000-8000-000000000009',
    'Conflicting worker incident signal'
  );
  if v_first_conflict.ok is not false
    or v_first_conflict.error_code <> 'IDEMPOTENCY_CONFLICT'
  then
    raise exception 'reused request id accepted a different incident payload';
  end if;

  perform * from public.release_job_incident_assistant_claim_atomic(
    'a7200000-0000-4000-8000-000000000001',
    v_first.source_event_id,
    'a7600000-0000-4000-8000-000000000001'
  );
  select * into v_first_reclaimed
  from public.upsert_job_incident_signal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'The damaged cable must be replaced safely.',
    'The cable insulation is visibly burned.',
    '["ref-a", "ref-b", "ref-c", "ref-d", "ref-e"]'::jsonb,
    'a7400000-0000-4000-8000-000000000001',
    'a7600000-0000-4000-8000-000000000002',
    'First worker incident signal'
  );
  if v_first_reclaimed.claimed is not true
    or v_first_reclaimed.idempotent is not true
    or v_first_reclaimed.revision <> 1
  then
    raise exception 'released assistant claim could not be recovered idempotently';
  end if;

  select * into v_second
  from public.upsert_job_incident_signal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'The cable and damaged terminal must both be replaced.',
    'The terminal shows additional heat damage.',
    '["ref-e", "ref-f"]'::jsonb,
    'a7400000-0000-4000-8000-000000000002',
    'a7600000-0000-4000-8000-000000000003',
    'Second worker incident signal'
  );

  select evidence_photo_urls into v_evidence
  from public.kael_job_incidents
  where id = v_incident_id;
  if v_second.ok is not true
    or v_second.revision <> 2
    or v_evidence is distinct from '["ref-e", "ref-f", "ref-a", "ref-b", "ref-c"]'::jsonb
  then
    raise exception 'serialized incident signal lost merged evidence';
  end if;

  insert into public.chat_messages (
    id, job_id, sender_id, sender_role, content
  ) values (
    v_message_id,
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'The worker supplied the final clarification.'
  );

  select * into v_chat_content_invalid
  from public.claim_job_incident_chat_turn_atomic(
    'a7200000-0000-4000-8000-000000000001',
    v_message_id,
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'a7600000-0000-4000-8000-000000000013',
    'Forged content that does not match the durable chat message.'
  );
  if v_chat_content_invalid.ok is not false
    or v_chat_content_invalid.error_code <> 'MESSAGE_SOURCE_INVALID'
  then
    raise exception 'chat claim accepted content that differed from the authoritative message';
  end if;

  select * into v_chat
  from public.claim_job_incident_chat_turn_atomic(
    'a7200000-0000-4000-8000-000000000001',
    v_message_id,
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'a7600000-0000-4000-8000-000000000004',
    'The worker supplied the final clarification.'
  );
  select * into v_chat_retry
  from public.claim_job_incident_chat_turn_atomic(
    'a7200000-0000-4000-8000-000000000001',
    v_message_id,
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'a7600000-0000-4000-8000-000000000005',
    'The worker supplied the final clarification.'
  );
  select * into v_chat_replay_content_invalid
  from public.claim_job_incident_chat_turn_atomic(
    'a7200000-0000-4000-8000-000000000001',
    v_message_id,
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'a7600000-0000-4000-8000-000000000014',
    'Forged replay content that does not match the durable chat message.'
  );

  if v_chat.claimed is not true
    or v_chat.revision <> 3
    or v_chat_retry.claimed is true
    or v_chat_retry.idempotent is not true
    or v_chat_retry.revision <> 3
  then
    raise exception 'duplicate chat source must be idempotent';
  end if;
  if v_chat_replay_content_invalid.ok is not false
    or v_chat_replay_content_invalid.error_code <> 'MESSAGE_SOURCE_INVALID'
  then
    raise exception 'chat replay accepted content that differed from the authoritative message';
  end if;

  update public.jobs
  set status = 'inspecting'
  where id = 'a7200000-0000-4000-8000-000000000001';
  select * into v_chat_phase_stale
  from public.apply_job_incident_assistant_turn_atomic(
    v_incident_id,
    'a7200000-0000-4000-8000-000000000001',
    v_chat.revision,
    v_chat.source_event_id,
    'a7600000-0000-4000-8000-000000000004',
    'ready_for_scope_proposal',
    'ready',
    'This answer was produced after the job phase changed.',
    'This question must remain invisible.',
    'worker',
    'Workflow-stale assistant event',
    '{"fallback_used":false}'::jsonb,
    'Workflow-stale user-visible Kael message'
  );
  if v_chat_phase_stale.stale is not true or v_chat_phase_stale.applied is true then
    raise exception 'assistant result applied after the job phase changed';
  end if;
  update public.jobs
  set status = 'repairing'
  where id = 'a7200000-0000-4000-8000-000000000001';
  select * into v_chat_reclaimed
  from public.claim_job_incident_chat_turn_atomic(
    'a7200000-0000-4000-8000-000000000001',
    v_message_id,
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'a7600000-0000-4000-8000-000000000006',
    'The worker supplied the final clarification.'
  );
  if v_chat_reclaimed.claimed is not true
    or v_chat_reclaimed.idempotent is not true
    or v_chat_reclaimed.revision <> v_chat.revision
  then
    raise exception 'phase-stale assistant source could not be reclaimed';
  end if;

  update public.jobs
  set status = 'cancelled'
  where id = 'a7200000-0000-4000-8000-000000000001';
  select * into v_chat_job_stale
  from public.apply_job_incident_assistant_turn_atomic(
    v_incident_id,
    'a7200000-0000-4000-8000-000000000001',
    v_chat_reclaimed.revision,
    v_chat_reclaimed.source_event_id,
    'a7600000-0000-4000-8000-000000000006',
    'ready_for_scope_proposal',
    'ready',
    'This answer was produced after the job left the incident phase.',
    'This question must remain invisible.',
    'worker',
    'Workflow-stale assistant event',
    '{"fallback_used":false}'::jsonb,
    'Workflow-stale user-visible Kael message'
  );
  if v_chat_job_stale.stale is not true or v_chat_job_stale.applied is true then
    raise exception 'assistant result applied after the job left the incident phase';
  end if;
  update public.jobs
  set status = 'repairing'
  where id = 'a7200000-0000-4000-8000-000000000001';
  select * into v_chat_after_job_stale
  from public.claim_job_incident_chat_turn_atomic(
    'a7200000-0000-4000-8000-000000000001',
    v_message_id,
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'a7600000-0000-4000-8000-000000000010',
    'The worker supplied the final clarification.'
  );
  if v_chat_after_job_stale.claimed is not true
    or v_chat_after_job_stale.idempotent is not true
    or v_chat_after_job_stale.revision <> v_chat.revision
  then
    raise exception 'workflow-stale assistant source could not be reclaimed';
  end if;

  select * into v_stale
  from public.apply_job_incident_assistant_turn_atomic(
    v_incident_id,
    'a7200000-0000-4000-8000-000000000001',
    v_second.revision,
    v_second.source_event_id,
    'a7600000-0000-4000-8000-000000000003',
    'awaiting_customer',
    'needs_more',
    'This answer was produced from an older signal.',
    'This question must remain invisible.',
    'customer',
    'Stale assistant event',
    '{"fallback_used":false}'::jsonb,
    'Stale user-visible Kael message'
  );
  if v_stale.stale is not true or v_stale.applied is true then
    raise exception 'stale assistant result must not apply';
  end if;

  select * into v_scope_transition_invalid
  from public.apply_job_incident_assistant_turn_atomic(
    v_incident_id,
    'a7200000-0000-4000-8000-000000000001',
    v_chat_after_job_stale.revision,
    v_chat_after_job_stale.source_event_id,
    'a7600000-0000-4000-8000-000000000010',
    'scope_proposed',
    'ready',
    'An assistant result must not create a scope proposal state directly.',
    'This question must remain invisible.',
    'worker',
    'Invalid direct scope proposal event',
    '{"fallback_used":false}'::jsonb,
    'Invalid direct scope proposal message'
  );
  if v_scope_transition_invalid.ok is not false
    or v_scope_transition_invalid.error_code <> 'INVALID_TRANSITION'
    or v_scope_transition_invalid.applied is true
  then
    raise exception 'assistant turn created scope_proposed without a durable scope change';
  end if;

  select count(*) into v_kael_message_count
  from public.chat_messages
  where job_id = 'a7200000-0000-4000-8000-000000000001'
    and sender_role = 'kael';
  if v_kael_message_count <> 0 then
    raise exception 'stale assistant result emitted a user-visible message';
  end if;

  select * into v_applied
  from public.apply_job_incident_assistant_turn_atomic(
    v_incident_id,
    'a7200000-0000-4000-8000-000000000001',
    v_chat_after_job_stale.revision,
    v_chat_after_job_stale.source_event_id,
    'a7600000-0000-4000-8000-000000000010',
    'ready_for_scope_proposal',
    'ready',
    'The evidence is sufficient for a scope proposal.',
    'Create the customer-confirmed proposal now.',
    'worker',
    'Fresh assistant event',
    '{"fallback_used":false}'::jsonb,
    'Kael Work: evidence is ready for a proposal.'
  );
  select * into v_apply_retry
  from public.apply_job_incident_assistant_turn_atomic(
    v_incident_id,
    'a7200000-0000-4000-8000-000000000001',
    v_chat.revision,
    v_chat.source_event_id,
    'a7600000-0000-4000-8000-000000000004',
    'ready_for_scope_proposal',
    'ready',
    'The evidence is sufficient for a scope proposal.',
    'Create the customer-confirmed proposal now.',
    'worker',
    'Fresh assistant event',
    '{"fallback_used":false}'::jsonb,
    'Kael Work: evidence is ready for a proposal.'
  );

  if v_applied.applied is not true
    or v_apply_retry.applied is true
    or v_apply_retry.stale is not true
  then
    raise exception 'assistant apply retry was not silent';
  end if;
  select count(*) into v_kael_message_count
  from public.chat_messages
  where job_id = 'a7200000-0000-4000-8000-000000000001'
    and sender_role = 'kael';
  if v_kael_message_count <> 1 then
    raise exception 'fresh assistant turn did not emit exactly one Kael message';
  end if;

  select * into v_quote_one
  from public.save_job_incident_scope_price_quote_atomic(
    v_incident_id,
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    (select incident.revision::integer from public.kael_job_incidents as incident where incident.id = v_incident_id),
    v_quote_one_id,
    jsonb_build_object(
      'schema_version', 'scope_change_worker_quote.v1',
      'quote_id', v_quote_one_id,
      'incident_id', v_incident_id,
      'job_id', 'a7200000-0000-4000-8000-000000000001',
      'selection_rule', 'verified_neutral_midpoint_with_bilateral_confirmation',
      'customer_total', 350000,
      'platform_fee', 35000,
      'worker_net', 315000
    ),
    pg_catalog.clock_timestamp() + interval '20 minutes'
  );
  if v_quote_one.ok is not true then
    raise exception 'first worker-confirmed scope quote was not saved';
  end if;

  update public.jobs
  set status = 'cancelled'
  where id = 'a7200000-0000-4000-8000-000000000001';
  select * into v_claim_job_stale
  from public.claim_job_incident_scope_proposal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'a7500000-0000-4000-8000-000000000009',
    v_quote_one_id
  );
  if v_claim_job_stale.error_code <> 'STATUS_CHANGED'
    or v_claim_job_stale.claimed is true
  then
    raise exception 'scope proposal work started after the job left the incident phase';
  end if;
  update public.jobs
  set status = 'repairing'
  where id = 'a7200000-0000-4000-8000-000000000001';

  select * into v_claim_one
  from public.claim_job_incident_scope_proposal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'a7500000-0000-4000-8000-000000000001',
    v_quote_one_id
  );
  select * into v_claim_two_blocked
  from public.claim_job_incident_scope_proposal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'a7500000-0000-4000-8000-000000000002',
    v_quote_one_id
  );
  if v_claim_one.claimed is not true
    or (v_claim_one.incident ->> 'scope_price_quote_revision')::integer
      <> (v_claim_one.incident ->> 'revision')::integer
    or v_claim_two_blocked.error_code <> 'PROPOSAL_IN_PROGRESS'
  then
    raise exception 'concurrent proposal claim was not excluded';
  end if;
  v_review := jsonb_set(
    v_review,
    '{worker_price_confirmation,confirmed_at}',
    pg_catalog.to_jsonb(v_claim_one.incident ->> 'scope_price_quote_confirmed_at')
  );

  select * into v_after_claim_signal
  from public.upsert_job_incident_signal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'The cable, terminal, and breaker connection must be reviewed.',
    'The latest inspection added material evidence.',
    '["ref-g"]'::jsonb,
    'a7400000-0000-4000-8000-000000000003',
    'a7600000-0000-4000-8000-000000000007',
    'New evidence received during proposal computation'
  );
  select * into v_stale_scope
  from public.request_job_incident_scope_change_atomic(
    v_incident_id,
    'a7500000-0000-4000-8000-000000000001',
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'The cable and damaged terminal must both be replaced.',
    'The terminal shows additional heat damage.',
    array['ref-e', 'ref-f', 'ref-a', 'ref-b', 'ref-c'],
    350000,
    350000,
    v_review
  );
  if v_after_claim_signal.ok is not true
    or v_stale_scope.error_code <> 'INCIDENT_CLAIM_STALE'
    or exists (
      select 1
      from public.scope_change_requests
      where job_id = 'a7200000-0000-4000-8000-000000000001'
    )
  then
    raise exception 'new incident evidence did not invalidate the in-flight proposal';
  end if;
  perform * from public.release_job_incident_assistant_claim_atomic(
    'a7200000-0000-4000-8000-000000000001',
    v_after_claim_signal.source_event_id,
    'a7600000-0000-4000-8000-000000000007'
  );
  select * into v_quote_two
  from public.save_job_incident_scope_price_quote_atomic(
    v_incident_id,
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    (select incident.revision::integer from public.kael_job_incidents as incident where incident.id = v_incident_id),
    v_quote_two_id,
    jsonb_build_object(
      'schema_version', 'scope_change_worker_quote.v1',
      'quote_id', v_quote_two_id,
      'incident_id', v_incident_id,
      'job_id', 'a7200000-0000-4000-8000-000000000001',
      'selection_rule', 'verified_neutral_midpoint_with_bilateral_confirmation',
      'customer_total', 350000,
      'platform_fee', 35000,
      'worker_net', 315000
    ),
    pg_catalog.clock_timestamp() + interval '20 minutes'
  );
  if v_quote_two.ok is not true then
    raise exception 'revised worker-confirmed scope quote was not saved';
  end if;
  select * into v_claim_two
  from public.claim_job_incident_scope_proposal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'a7500000-0000-4000-8000-000000000002',
    v_quote_two_id
  );
  if v_claim_two.claimed is not true then
    raise exception 'released proposal claim could not be reacquired';
  end if;
  v_review := jsonb_set(
    jsonb_set(
      v_review,
      '{worker_price_confirmation,quote_id}',
      pg_catalog.to_jsonb(v_quote_two_id::text)
    ),
    '{worker_price_confirmation,confirmed_at}',
    pg_catalog.to_jsonb(v_claim_two.incident ->> 'scope_price_quote_confirmed_at')
  );

  select * into v_scope
  from public.request_job_incident_scope_change_atomic(
    v_incident_id,
    'a7500000-0000-4000-8000-000000000002',
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'The cable and damaged terminal must both be replaced.',
    'The terminal shows additional heat damage.',
    array['ref-e', 'ref-f', 'ref-a', 'ref-b', 'ref-c'],
    350000,
    350000,
    v_review
  );
  if v_scope.ok is not true
    or not exists (
      select 1
      from public.kael_job_incidents
      where id = v_incident_id
        and status = 'scope_proposed'
        and scope_change_id = v_scope.scope_change_id
    )
  then
    raise exception 'scope proposal and incident were not finalized together';
  end if;

  select count(*) into v_event_count
  from public.kael_job_incident_events
  where incident_id = v_incident_id
    and source_kind = 'scope_proposed';
  if v_event_count <> 1 then
    raise exception 'scope proposal event was not emitted exactly once';
  end if;

  insert into public.chat_messages (
    id, job_id, sender_id, sender_role, content
  ) values (
    'a7300000-0000-4000-8000-000000000004',
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'The customer is still reviewing the durable scope proposal.'
  );
  select * into v_scope_valid_chat
  from public.claim_job_incident_chat_turn_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000004',
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'a7600000-0000-4000-8000-000000000016',
    'The customer is still reviewing the durable scope proposal.'
  );
  select * into v_scope_valid_apply
  from public.apply_job_incident_assistant_turn_atomic(
    v_incident_id,
    'a7200000-0000-4000-8000-000000000001',
    v_scope_valid_chat.revision,
    v_scope_valid_chat.source_event_id,
    'a7600000-0000-4000-8000-000000000016',
    'scope_proposed',
    'ready',
    'The durable scope proposal remains pending customer review.',
    'Would you like any clarification before deciding?',
    'customer',
    'Valid pending scope proposal assistant event',
    '{"fallback_used":false}'::jsonb,
    'Kael Work: the scope proposal is still waiting for your decision.'
  );
  if v_scope_valid_chat.claimed is not true
    or v_scope_valid_apply.applied is not true
    or v_scope_valid_apply.incident->>'status' <> 'scope_proposed'
    or (v_scope_valid_apply.incident->>'scope_change_id')::uuid <> v_scope.scope_change_id
  then
    raise exception 'valid pending scope proposal assistant turn was rejected';
  end if;

  insert into public.chat_messages (
    id, job_id, sender_id, sender_role, content
  ) values (
    'a7300000-0000-4000-8000-000000000002',
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'This clarification started before the customer scope decision.'
  );
  select * into v_scope_pending_chat
  from public.claim_job_incident_chat_turn_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000002',
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'a7600000-0000-4000-8000-000000000011',
    'This clarification started before the customer scope decision.'
  );
  if v_scope_pending_chat.claimed is not true then
    raise exception 'scope-pending chat source was not claimed';
  end if;

  update public.kael_job_incidents
  set scope_change_id = null
  where id = v_incident_id;
  select * into v_scope_missing_link_stale
  from public.apply_job_incident_assistant_turn_atomic(
    v_incident_id,
    'a7200000-0000-4000-8000-000000000001',
    v_scope_pending_chat.revision,
    v_scope_pending_chat.source_event_id,
    'a7600000-0000-4000-8000-000000000011',
    'scope_proposed',
    'needs_more',
    'This result must not apply without a durable scope change link.',
    'This question must remain invisible.',
    'customer',
    'Missing-link scope proposal assistant event',
    '{"fallback_used":false}'::jsonb,
    'Missing-link scope proposal message'
  );
  if v_scope_missing_link_stale.stale is not true
    or v_scope_missing_link_stale.applied is true
  then
    raise exception 'scope_proposed applied without a durable scope change link';
  end if;
  update public.kael_job_incidents
  set scope_change_id = v_scope.scope_change_id
  where id = v_incident_id;
  select * into v_scope_reclaimed_chat
  from public.claim_job_incident_chat_turn_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000002',
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'a7600000-0000-4000-8000-000000000015',
    'This clarification started before the customer scope decision.'
  );
  if v_scope_reclaimed_chat.claimed is not true
    or v_scope_reclaimed_chat.idempotent is not true
  then
    raise exception 'scope chat could not recover after a missing-link stale turn';
  end if;

  update public.jobs
  set status = 'repairing'
  where id = 'a7200000-0000-4000-8000-000000000001';
  select * into v_scope_decision_stale
  from public.apply_job_incident_assistant_turn_atomic(
    v_incident_id,
    'a7200000-0000-4000-8000-000000000001',
    v_scope_reclaimed_chat.revision,
    v_scope_reclaimed_chat.source_event_id,
    'a7600000-0000-4000-8000-000000000015',
    'scope_proposed',
    'needs_more',
    'This answer was produced before the customer scope decision.',
    'This question must remain invisible.',
    'customer',
    'Scope-decision-stale assistant event',
    '{"fallback_used":false}'::jsonb,
    'Scope-decision-stale user-visible Kael message'
  );
  if v_scope_decision_stale.stale is not true or v_scope_decision_stale.applied is true then
    raise exception 'assistant result applied after the customer scope decision';
  end if;
  insert into public.chat_messages (
    id, job_id, sender_id, sender_role, content
  ) values (
    'a7300000-0000-4000-8000-000000000003',
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'The customer decision has already closed this scope proposal.'
  );
  select * into v_post_decision_chat
  from public.claim_job_incident_chat_turn_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7300000-0000-4000-8000-000000000003',
    'a7100000-0000-4000-8000-000000000002',
    'worker',
    'a7600000-0000-4000-8000-000000000012',
    'The customer decision has already closed this scope proposal.'
  );
  if v_post_decision_chat.claimed is true or v_post_decision_chat.incident is not null then
    raise exception 'decided scope proposal kept consuming ordinary job chat';
  end if;

  select * into v_claim_retry
  from public.claim_job_incident_scope_proposal_atomic(
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000002',
    'a7500000-0000-4000-8000-000000000003',
    v_quote_two_id
  );
  if v_claim_retry.ok is not true
    or v_claim_retry.claimed is true
    or v_claim_retry.idempotent is not true
    or (v_claim_retry.incident->>'scope_change_id')::uuid <> v_scope.scope_change_id
  then
    raise exception 'lost-response proposal retry did not converge to the durable scope change';
  end if;
end;
$$;

do $$
declare
  v_signature text;
  v_signatures text[] := array[
    'public.upsert_job_incident_signal_atomic(uuid, uuid, text, text, jsonb, uuid, uuid, text)',
    'public.claim_job_incident_chat_turn_atomic(uuid, uuid, uuid, text, uuid, text)',
    'public.apply_job_incident_assistant_turn_atomic(uuid, uuid, bigint, uuid, uuid, text, text, text, text, text, text, jsonb, text)',
    'public.release_job_incident_assistant_claim_atomic(uuid, uuid, uuid)',
    'public.save_job_incident_scope_price_quote_atomic(uuid, uuid, uuid, integer, uuid, jsonb, timestamp with time zone)',
    'public.claim_job_incident_scope_proposal_atomic(uuid, uuid, uuid, uuid)',
    'public.release_job_incident_scope_proposal_atomic(uuid, uuid, uuid)',
    'public.request_job_incident_scope_change_atomic(uuid, uuid, uuid, uuid, text, text, text[], int, int, jsonb)'
  ];
  v_security_definer boolean;
  v_config text[];
begin
  foreach v_signature in array v_signatures loop
    if not pg_catalog.has_function_privilege('service_role', v_signature, 'execute') then
      raise exception 'service_role must retain execute on %', v_signature;
    end if;
    if pg_catalog.has_function_privilege('authenticated', v_signature, 'execute')
      or pg_catalog.has_function_privilege('anon', v_signature, 'execute')
    then
      raise exception 'client roles must not execute %', v_signature;
    end if;

    select function_row.prosecdef, function_row.proconfig
      into v_security_definer, v_config
      from pg_catalog.pg_proc as function_row
      where function_row.oid = pg_catalog.to_regprocedure(v_signature);
    if v_security_definer is distinct from true
      or v_config is distinct from array['search_path=""']::text[]
    then
      raise exception 'unsafe security-definer configuration on %', v_signature;
    end if;
  end loop;
end;
$$;

select pg_catalog.jsonb_build_object(
  'request_idempotent', true,
  'request_payload_bound', true,
  'evidence_merge_serialized', true,
  'chat_message_idempotent', true,
  'chat_content_authoritative', true,
  'stale_turn_silent', true,
  'workflow_stale_turn_silent', true,
  'workflow_phase_stale_turn_silent', true,
  'stale_job_stops_proposal', true,
  'proposal_claim_exclusive', true,
  'proposal_retry_idempotent', true,
  'new_source_invalidates_proposal', true,
  'decided_proposal_stops_chat', true,
  'scope_decision_stale_turn_silent', true,
  'scope_proposal_invariants', true,
  'scope_finalize_atomic', true,
  'service_role_only', true
) as job_incident_atomic_verification;

rollback;
