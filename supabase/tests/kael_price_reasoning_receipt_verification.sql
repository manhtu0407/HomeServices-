-- =============================================================================
-- Kael price reasoning receipt verification
--
-- @pillar id: P20-price-receipt-gate
-- @pillar invariant: a Kael quote cannot become a job unless its price card carries a
--   well-formed analysis_receipt.v1; dropping any required field yields MISSING_REASONING_RECEIPT
-- @pillar authority: governance/RULES.md #3 (AI output is validated before it reaches a user) |
--   governance/RULES.md #7 (money-impacting state needs a validated server decision) |
--   docs/test-debt-ledger.md section 1
-- @pillar target: supabase/migrations/20260811093000_require_kael_price_reasoning_receipt.sql
-- @pillar layer: sql
-- @pillar siblings: P12-workflow-transition-composition, P14-kael-chat-cost-cap, P10-per-actor-rls
-- @pillar mutation: delete one conjunct from the receipt guard in confirm_kael_chat_atomic --
--   the drop-one-field case for that path stops raising and the script exits nonzero
--
-- Rollback-only proof against a real Postgres. The gate exists; nothing executed it, so a later
-- migration could have relaxed it and every JS gate would still have been green.
--
-- Pattern source: governance/protocols/test-pillars.md (P10 prototype).
-- =============================================================================

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'b7400000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'receipt-guard-customer@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.customer_profiles (id, building_name, unit_number, district)
values ('b7400000-0000-4000-8000-000000000001', 'Receipt Guard Building', 'D-01', 'q7')
on conflict (id) do nothing;

-- A session that is quote-ready in every respect except the receipt under test, so any refusal
-- below is attributable to the receipt and not to the surrounding preconditions.
create temporary table p20_scope on commit drop as
select '{
  "version": 1,
  "service_type": "plumbing",
  "profile_id": "water_diagnose",
  "case_phase": "offer_review",
  "facts": {"customer_goal": "Vòi nước rò rỉ", "address_district": "q7"},
  "missing_facts": [],
  "evidence": [],
  "safety_flags": [],
  "scope_summary": "Thay vòi nước bồn rửa bị rò rỉ",
  "quote_ready": true,
  "quote_blockers": [],
  "worker_requirements": ["water_leak_diagnosis"],
  "confidence": 0.9,
  "next_action": {"kind": "prepare_offer"}
}'::jsonb as value;

create temporary table p20_receipt on commit drop as
select '{
  "schema_version": "analysis_receipt.v1",
  "evidence": {
    "photo_count": 2,
    "video_frame_count": 0,
    "voice_transcript_count": 0,
    "skipped": false,
    "analysis_status": "analyzed",
    "findings": []
  },
  "market": {
    "accepted_source_count": 3,
    "high_trust_source_count": 2,
    "quorum_met": true
  }
}'::jsonb as value;

-- Rebuilds the whole fixture with one receipt mutation applied, then reports the RPC outcome.
create or replace function pg_temp.p20_confirm_with(p_receipt jsonb)
returns text language plpgsql as $fn$
declare
  v_session_id uuid := gen_random_uuid();
  v_code text;
begin
  insert into public.kael_chat_sessions (
    id, customer_id, service_type, status, case_phase, diagnosis_scope, total_turns
  ) values (
    v_session_id,
    'b7400000-0000-4000-8000-000000000001',
    'plumbing'::public.service_type,
    'estimate_ready',
    'offer_review',
    (select value from p20_scope),
    2
  );

  insert into public.kael_chat_turns (
    session_id, turn_index, role, content_type, safe_metadata
  ) values (
    v_session_id, 1, 'kael', 'estimate',
    jsonb_build_object(
      'estimate', jsonb_build_object(
        'problem_summary', 'Vòi nước bồn rửa rò rỉ',
        'complexity', 'simple',
        'price_min', 250000,
        'price_max', 400000
      ),
      'estimate_card_v3', jsonb_build_object(
        'card', jsonb_build_object(
          'price_source', 'baseline_with_market',
          'kael_reasoning', jsonb_build_object(
            'baseline_used', 'plumbing.faucet_replace',
            'complexity_reasoning', 'Một điểm rò rỉ, không cần mở tường'
          ),
          'analysis_receipt', p_receipt
        )
      )
    )
  );

  select error_code into v_code
  from public.confirm_kael_chat_atomic(v_session_id, 'b7400000-0000-4000-8000-000000000001');

  return coalesce(v_code, '<null>');
end;
$fn$;

-- 1. The control: a complete receipt must not be refused for the receipt's sake. If this raises,
--    every rejection below is meaningless because the fixture itself was unusable.
do $receipt_control$
declare
  v_code text := pg_temp.p20_confirm_with((select value from p20_receipt));
begin
  if v_code = 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a complete analysis_receipt.v1 was refused as MISSING_REASONING_RECEIPT; the gate rejects valid receipts. authority: governance/RULES.md #3. next: worker_payment_ledger_verification.sql';
  end if;
end;
$receipt_control$;

-- 2. Every required field is required. Removing any one of them must refuse the confirmation,
--    because a partial receipt is a price nobody can audit after the fact.
do $receipt_drop_one$
declare
  v_path text[];
  v_paths text[][] := array[
    array['schema_version'],
    array['evidence'],
    array['market'],
    array['evidence', 'photo_count'],
    array['evidence', 'video_frame_count'],
    array['evidence', 'voice_transcript_count'],
    array['evidence', 'skipped']
  ];
  v_code text;
begin
  foreach v_path slice 1 in array v_paths loop
    v_code := pg_temp.p20_confirm_with((select value from p20_receipt) #- v_path);
    if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
      raise exception
        'dropping % from analysis_receipt.v1 returned % (expected MISSING_REASONING_RECEIPT). authority: governance/RULES.md #3 and #7',
        array_to_string(v_path, '.'), v_code;
    end if;
  end loop;
end;
$receipt_drop_one$;

-- 3. A receipt from a different schema version is not this schema. Accepting a bumped version
--    silently would let a future shape through without anyone validating it.
do $receipt_schema_version$
declare
  v_code text := pg_temp.p20_confirm_with(
    jsonb_set((select value from p20_receipt), '{schema_version}', '"analysis_receipt.v2"'::jsonb)
  );
begin
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'analysis_receipt.v2 was accepted by the v1 gate (returned %). authority: governance/RULES.md #3',
      v_code;
  end if;
end;
$receipt_schema_version$;

-- 4. Types are part of the contract. A count that arrives as a string is a receipt nobody parsed.
do $receipt_types$
declare
  v_code text;
begin
  v_code := pg_temp.p20_confirm_with(
    jsonb_set((select value from p20_receipt), '{evidence,photo_count}', '"2"'::jsonb)
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a string photo_count was accepted as a number (returned %). authority: governance/RULES.md #3', v_code;
  end if;

  v_code := pg_temp.p20_confirm_with(
    jsonb_set((select value from p20_receipt), '{evidence,skipped}', '"false"'::jsonb)
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a string skipped flag was accepted as a boolean (returned %). authority: governance/RULES.md #3', v_code;
  end if;
end;
$receipt_types$;

-- 5. analysis_status is a closed set; an unrecognised value means the evidence stage reported
--    something this gate was never taught to interpret.
do $receipt_analysis_status$
declare
  v_code text := pg_temp.p20_confirm_with(
    jsonb_set((select value from p20_receipt), '{evidence,analysis_status}', '"partially_analyzed"'::jsonb)
  );
begin
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'an unknown analysis_status was accepted (returned %). authority: governance/RULES.md #3', v_code;
  end if;
end;
$receipt_analysis_status$;

-- 6. The price card's own reasoning is required alongside the receipt; a receipt without the
--    baseline that produced the number explains nothing.
do $receipt_price_reasoning$
declare
  v_session_id uuid := gen_random_uuid();
  v_code text;
begin
  insert into public.kael_chat_sessions (
    id, customer_id, service_type, status, case_phase, diagnosis_scope, total_turns
  ) values (
    v_session_id, 'b7400000-0000-4000-8000-000000000001', 'plumbing'::public.service_type,
    'estimate_ready', 'offer_review', (select value from p20_scope), 2
  );

  insert into public.kael_chat_turns (
    session_id, turn_index, role, content_type, safe_metadata
  ) values (
    v_session_id, 1, 'kael', 'estimate',
    jsonb_build_object(
      'estimate', jsonb_build_object(
        'problem_summary', 'Vòi nước bồn rửa rò rỉ',
        'complexity', 'simple',
        'price_min', 250000,
        'price_max', 400000
      ),
      'estimate_card_v3', jsonb_build_object(
        'card', jsonb_build_object(
          'price_source', 'baseline_with_market',
          'analysis_receipt', (select value from p20_receipt)
        )
      )
    )
  );

  select error_code into v_code
  from public.confirm_kael_chat_atomic(v_session_id, 'b7400000-0000-4000-8000-000000000001');

  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a price card with no kael_reasoning was accepted (returned %). authority: governance/RULES.md #4',
      coalesce(v_code, '<null>');
  end if;
end;
$receipt_price_reasoning$;

-- 7. An unrecognised price_source means the number did not come from a path this gate knows.
do $receipt_price_source$
declare
  v_session_id uuid := gen_random_uuid();
  v_code text;
begin
  insert into public.kael_chat_sessions (
    id, customer_id, service_type, status, case_phase, diagnosis_scope, total_turns
  ) values (
    v_session_id, 'b7400000-0000-4000-8000-000000000001', 'plumbing'::public.service_type,
    'estimate_ready', 'offer_review', (select value from p20_scope), 2
  );

  insert into public.kael_chat_turns (
    session_id, turn_index, role, content_type, safe_metadata
  ) values (
    v_session_id, 1, 'kael', 'estimate',
    jsonb_build_object(
      'estimate', jsonb_build_object(
        'problem_summary', 'Vòi nước bồn rửa rò rỉ',
        'complexity', 'simple',
        'price_min', 250000,
        'price_max', 400000
      ),
      'estimate_card_v3', jsonb_build_object(
        'card', jsonb_build_object(
          'price_source', 'guessed_by_model',
          'kael_reasoning', jsonb_build_object(
            'baseline_used', 'plumbing.faucet_replace',
            'complexity_reasoning', 'Một điểm rò rỉ'
          ),
          'analysis_receipt', (select value from p20_receipt)
        )
      )
    )
  );

  select error_code into v_code
  from public.confirm_kael_chat_atomic(v_session_id, 'b7400000-0000-4000-8000-000000000001');

  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'an unrecognised price_source was accepted (returned %). authority: governance/RULES.md #4 and #8',
      coalesce(v_code, '<null>');
  end if;
end;
$receipt_price_source$;

select jsonb_build_object(
  'complete_receipt_accepted', true,
  'each_required_field_enforced', true,
  'schema_version_pinned', true,
  'field_types_enforced', true,
  'analysis_status_closed_set', true,
  'price_reasoning_required', true,
  'price_source_closed_set', true
) as kael_price_reasoning_receipt_verification;

rollback;
