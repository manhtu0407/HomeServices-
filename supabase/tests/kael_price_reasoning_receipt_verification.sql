-- =============================================================================
-- Kael price reasoning receipt verification
--
-- @pillar id: P20-price-receipt-gate
-- @pillar invariant: a Kael quote cannot become a job unless both receipts are well formed and
--   bound to it; dropping any required field, unbinding the receipt id, or restating a total that
--   disagrees with the estimate all yield MISSING_REASONING_RECEIPT
-- @pillar authority: governance/RULES.md #3 (AI output is validated before it reaches a user) |
--   governance/RULES.md #7 (money-impacting state needs a validated server decision) |
--   governance/RULES.md #8 (no silent degradation) | docs/test-debt-ledger.md section 1
-- @pillar target: supabase/migrations/20260814120000_fail_closed_kael_receipt_identity.sql
-- @pillar layer: sql
-- @pillar siblings: P12-workflow-transition-composition, P14-kael-chat-cost-cap, P10-per-actor-rls
-- @pillar mutation: drop the coalesce around the receipt_id or schema_version comparison in
--   20260814120000 -- `null <> 'x'` is null, the or chain stops firing, and the drop-one case for
--   that field reports the confirmation as accepted. Deleting any other conjunct turns its own
--   drop-one case red the same way
--
-- Rollback-only proof against a real Postgres. The gate exists; nothing executed it, so a later
-- migration could have relaxed it and every JS gate would still have been green.
--
-- The confirmation takes two receipts and they are not interchangeable. `analysis_receipt.v1`
-- records what evidence the analysis actually had. `price_reasoning_receipt.v1` records how the
-- number was built, and is bound to the confirmation by id so a receipt cannot be lifted from one
-- quote onto another. Both are checked here, along with the arithmetic that ties the receipt's
-- totals back to the estimate the customer was shown.
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

-- A session that is quote-ready in every respect except the receipts under test, so any refusal
-- below is attributable to a receipt and not to the surrounding preconditions.
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

create temporary table p20_analysis on commit drop as
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

-- Totals match the estimate below (250000..400000), the single priced component is the service
-- package and carries exactly those amounts, and every other component is explicitly unpriced.
-- That is the shape `reconciliation: package_total` requires.
create temporary table p20_reasoning on commit drop as
select '{
  "schema_version": "price_reasoning_receipt.v1",
  "receipt_id": "p20-receipt-0001",
  "problem": {
    "confirmed_facts": ["Vòi nước bồn rửa rò rỉ tại thân vòi"],
    "possible_causes": ["Ron cao su mòn", "Ren nối lỏng"],
    "unknowns": []
  },
  "scope": {
    "included": ["Thay vòi nước bồn rửa"],
    "conditional": [],
    "excluded": ["Xử lý đường ống âm tường"]
  },
  "costs": {
    "currency": "VND",
    "reconciliation": "package_total",
    "total_min": 250000,
    "total_max": 400000,
    "components": [
      {
        "kind": "service_package",
        "status": "priced",
        "explanation": "Trọn gói thay vòi nước bồn rửa",
        "amount_min": 250000,
        "amount_max": 400000
      },
      {
        "kind": "labor",
        "status": "included_unitemized",
        "explanation": "Công thợ đã nằm trong giá trọn gói",
        "amount_min": null,
        "amount_max": null
      },
      {
        "kind": "replacement_parts",
        "status": "conditional_unpriced",
        "explanation": "Chỉ phát sinh nếu ren nối phải thay",
        "amount_min": null,
        "amount_max": null
      }
    ]
  },
  "scenarios": {
    "low": {"total": 250000},
    "high": {"total": 400000}
  },
  "fairness": {
    "price_source": "baseline_with_market",
    "confidence": "medium",
    "cap_statement": "Giá cuối không vượt mức tối đa trừ khi khách duyệt thay đổi phạm vi"
  }
}'::jsonb as value;

-- Rebuilds the whole fixture with the given receipts and receipt id, then reports the RPC outcome.
-- `p_price_source` is a parameter because one conjunct compares the card's price_source against the
-- one recorded inside the reasoning receipt, and that pair has to be settable independently.
create or replace function pg_temp.p20_confirm(
  p_analysis jsonb,
  p_reasoning jsonb,
  p_receipt_id text,
  p_price_source text default 'baseline_with_market',
  p_price_min bigint default 250000,
  p_price_max bigint default 400000
)
returns text language plpgsql as $fn$
declare
  v_session_id uuid := gen_random_uuid();
  v_code text;
begin
  insert into public.kael_chat_sessions (
    id, customer_id, service_type, status, case_phase, diagnosis_scope, total_turns, safe_metadata
  ) values (
    v_session_id,
    'b7400000-0000-4000-8000-000000000001',
    'plumbing'::public.service_type,
    'estimate_ready',
    'offer_review',
    (select value from p20_scope),
    2,
    jsonb_build_object('address_district', 'q7', 'problem_chips', jsonb_build_array('faucet_broken'))
  );

  insert into public.kael_chat_turns (
    session_id, turn_index, role, content_type, safe_metadata
  ) values (
    v_session_id, 1, 'kael', 'estimate',
    jsonb_build_object(
      'estimate', jsonb_build_object(
        'problem_summary', 'Vòi nước bồn rửa rò rỉ',
        'problem_category', 'faucet_broken',
        'complexity', 'medium',
        'price_min', p_price_min,
        'price_max', p_price_max
      ),
      'estimate_card_v3', jsonb_build_object(
        -- Not jsonb_strip_nulls: it recurses, and the unpriced components below carry deliberate
        -- JSON nulls that the gate reads.
        'card', jsonb_build_object(
          'price_source', p_price_source,
          'kael_reasoning', jsonb_build_object(
            'baseline_used', 'plumbing.faucet_replace',
            'complexity_reasoning', 'Một điểm rò rỉ, không cần mở tường'
          ),
          'analysis_receipt', p_analysis,
          'price_reasoning_receipt', p_reasoning
        )
      )
    )
  );

  select error_code into v_code
  from public.confirm_kael_chat_atomic(
    v_session_id, 'b7400000-0000-4000-8000-000000000001', p_receipt_id
  );

  return coalesce(v_code, '<null>');
end;
$fn$;

create or replace function pg_temp.p20_ok()
returns text language sql as $fn$
  select pg_temp.p20_confirm(
    (select value from p20_analysis),
    (select value from p20_reasoning),
    'p20-receipt-0001'
  );
$fn$;

-- 1. The control: a complete pair of receipts must not be refused for a receipt's sake. If this
--    raises, every rejection below is meaningless because the fixture itself was unusable.
do $receipt_control$
declare
  v_code text := pg_temp.p20_ok();
begin
  if v_code = 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a complete receipt pair was refused as MISSING_REASONING_RECEIPT; the gate rejects valid receipts. authority: governance/RULES.md #3. next: worker_payment_ledger_verification.sql';
  end if;
end;
$receipt_control$;

-- 2. Every required analysis_receipt field is required. Removing any one of them must refuse the
--    confirmation, because a partial receipt is a price nobody can audit after the fact.
do $analysis_drop_one$
declare
  v_path text;
  v_paths text[] := array[
    'schema_version',
    'evidence',
    'market',
    'evidence.photo_count',
    'evidence.video_frame_count',
    'evidence.voice_transcript_count',
    'evidence.skipped'
  ];
  v_code text;
begin
  foreach v_path in array v_paths loop
    v_code := pg_temp.p20_confirm(
      (select value from p20_analysis) #- string_to_array(v_path, '.'),
      (select value from p20_reasoning),
      'p20-receipt-0001'
    );
    if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
      raise exception
        'dropping % from analysis_receipt.v1 returned % (expected MISSING_REASONING_RECEIPT). authority: governance/RULES.md #3',
        v_path, v_code;
    end if;
  end loop;
end;
$analysis_drop_one$;

-- 3. The same for price_reasoning_receipt.v1, which is the record of how the number was built.
do $reasoning_drop_one$
declare
  v_path text;
  v_paths text[] := array[
    'schema_version',
    'receipt_id',
    'problem',
    'scope',
    'costs',
    'scenarios',
    'fairness',
    'problem.confirmed_facts',
    'problem.possible_causes',
    'problem.unknowns',
    'scope.included',
    'scope.conditional',
    'scope.excluded',
    'costs.currency',
    'costs.reconciliation',
    'costs.total_min',
    'costs.total_max',
    'costs.components',
    'scenarios.low',
    'scenarios.high',
    'fairness.price_source',
    'fairness.confidence',
    'fairness.cap_statement'
  ];
  v_code text;
begin
  foreach v_path in array v_paths loop
    v_code := pg_temp.p20_confirm(
      (select value from p20_analysis),
      (select value from p20_reasoning) #- string_to_array(v_path, '.'),
      'p20-receipt-0001'
    );
    if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
      raise exception
        'dropping % from price_reasoning_receipt.v1 returned % (expected MISSING_REASONING_RECEIPT). authority: governance/RULES.md #3 and #7',
        v_path, v_code;
    end if;
  end loop;
end;
$reasoning_drop_one$;

-- 4. A receipt from a different schema version is not this schema. Accepting a bumped version
--    silently would let a future shape through without anyone validating it.
do $receipt_schema_version$
declare
  v_code text;
begin
  v_code := pg_temp.p20_confirm(
    jsonb_set((select value from p20_analysis), '{schema_version}', '"analysis_receipt.v2"'::jsonb),
    (select value from p20_reasoning),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'analysis_receipt.v2 was accepted by the v1 gate (returned %). authority: governance/RULES.md #3', v_code;
  end if;

  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    jsonb_set((select value from p20_reasoning), '{schema_version}', '"price_reasoning_receipt.v2"'::jsonb),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'price_reasoning_receipt.v2 was accepted by the v1 gate (returned %). authority: governance/RULES.md #3', v_code;
  end if;
end;
$receipt_schema_version$;

-- 5. Types are part of the contract. A count that arrives as a string is a receipt nobody parsed.
do $receipt_types$
declare
  v_code text;
begin
  v_code := pg_temp.p20_confirm(
    jsonb_set((select value from p20_analysis), '{evidence,photo_count}', '"2"'::jsonb),
    (select value from p20_reasoning),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a string photo_count was accepted as a number (returned %). authority: governance/RULES.md #3', v_code;
  end if;

  v_code := pg_temp.p20_confirm(
    jsonb_set((select value from p20_analysis), '{evidence,skipped}', '"false"'::jsonb),
    (select value from p20_reasoning),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a string skipped flag was accepted as a boolean (returned %). authority: governance/RULES.md #3', v_code;
  end if;

  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    jsonb_set((select value from p20_reasoning), '{costs,total_min}', '"250000"'::jsonb),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a string total_min was accepted as a number (returned %). authority: governance/RULES.md #3', v_code;
  end if;
end;
$receipt_types$;

-- 6. analysis_status is a closed set; an unrecognised value means the evidence stage reported
--    something this gate was never taught to interpret. So are reconciliation and confidence.
do $receipt_closed_sets$
declare
  v_code text;
begin
  v_code := pg_temp.p20_confirm(
    jsonb_set((select value from p20_analysis), '{evidence,analysis_status}', '"partially_analyzed"'::jsonb),
    (select value from p20_reasoning),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'an unknown analysis_status was accepted (returned %). authority: governance/RULES.md #3', v_code;
  end if;

  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    jsonb_set((select value from p20_reasoning), '{costs,reconciliation}', '"best_effort"'::jsonb),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'an unknown reconciliation mode was accepted (returned %). authority: governance/RULES.md #3', v_code;
  end if;

  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    jsonb_set((select value from p20_reasoning), '{fairness,confidence}', '"very_high"'::jsonb),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'an unknown fairness confidence was accepted (returned %). authority: governance/RULES.md #3', v_code;
  end if;
end;
$receipt_closed_sets$;

-- 7. The receipt is bound to this confirmation by id. Without that, a receipt built for a cheap
--    quote could be presented against an expensive one and the audit trail would still look whole.
do $receipt_binding$
declare
  v_code text;
begin
  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    (select value from p20_reasoning),
    'p20-receipt-0002'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a receipt whose receipt_id does not match the confirmed id was accepted (returned %). authority: governance/RULES.md #7',
      v_code;
  end if;

  -- A short id is not an id. Eight characters is the declared floor.
  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    jsonb_set((select value from p20_reasoning), '{receipt_id}', '"p20"'::jsonb),
    'p20'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a receipt id below the length floor was accepted (returned %). authority: governance/RULES.md #7', v_code;
  end if;
end;
$receipt_binding$;

-- 8. The receipt's arithmetic must reconcile with the estimate the customer was shown. This is the
--    difference between a receipt and a decoration: a total that disagrees with the quote means one
--    of the two numbers is not the price, and nobody downstream can tell which.
do $receipt_arithmetic$
declare
  v_code text;
begin
  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    jsonb_set((select value from p20_reasoning), '{costs,total_max}', '900000'::jsonb),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a receipt total that disagrees with the estimate was accepted (returned %). authority: governance/RULES.md #4 and #8',
      v_code;
  end if;

  -- Scenario bounds restate the same two numbers. Letting them drift lets the summary say one
  -- thing while the breakdown says another.
  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    jsonb_set((select value from p20_reasoning), '{scenarios,high,total}', '750000'::jsonb),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a high scenario that disagrees with total_max was accepted (returned %). authority: governance/RULES.md #8', v_code;
  end if;

  -- Under package_total the single priced component *is* the total. A component that does not add
  -- up is a breakdown that was never checked against the number it is supposed to explain.
  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    jsonb_set((select value from p20_reasoning), '{costs,components,0,amount_max}', '380000'::jsonb),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a priced component that does not reconcile with the total was accepted (returned %). authority: governance/RULES.md #8',
      v_code;
  end if;

  -- An unpriced component carrying an amount is the same defect seen from the other side.
  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    jsonb_set((select value from p20_reasoning), '{costs,components,1,amount_min}', '50000'::jsonb),
    'p20-receipt-0001'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'an unpriced component carrying an amount was accepted (returned %). authority: governance/RULES.md #8', v_code;
  end if;
end;
$receipt_arithmetic$;

-- 9. An empty list is not a list. A receipt with no confirmed facts, no candidate causes or nothing
--    in scope explains nothing, whatever its shape.
do $receipt_non_empty$
declare
  v_path text;
  v_paths text[] := array[
    'problem.confirmed_facts',
    'problem.possible_causes',
    'scope.included',
    'costs.components'
  ];
  v_code text;
begin
  foreach v_path in array v_paths loop
    v_code := pg_temp.p20_confirm(
      (select value from p20_analysis),
      jsonb_set((select value from p20_reasoning), string_to_array(v_path, '.'), '[]'::jsonb),
      'p20-receipt-0001'
    );
    if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
      raise exception
        'an empty % was accepted (returned %). authority: governance/RULES.md #3',
        v_path, v_code;
    end if;
  end loop;
end;
$receipt_non_empty$;

-- 10. The price card's own reasoning is required alongside the receipts; a receipt without the
--     baseline that produced the number explains nothing. An unrecognised price_source means the
--     number did not come from a path this gate knows, and the receipt must agree with the card.
do $receipt_price_source$
declare
  v_code text;
begin
  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    (select value from p20_reasoning),
    'p20-receipt-0001',
    'guessed_by_model'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'an unrecognised price_source was accepted (returned %). authority: governance/RULES.md #4 and #8', v_code;
  end if;

  -- A recognised source on the card that the receipt contradicts is the drift this pair exists to
  -- catch: two records of the same decision that no longer agree.
  v_code := pg_temp.p20_confirm(
    (select value from p20_analysis),
    (select value from p20_reasoning),
    'p20-receipt-0001',
    'baseline_only'
  );
  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'a receipt price_source disagreeing with the card was accepted (returned %). authority: governance/RULES.md #8', v_code;
  end if;
end;
$receipt_price_source$;

-- 11. The legacy two-argument entry point is still granted to service_role. It forwards a null
--     receipt id, so it must not become a way around the binding the three-argument form enforces.
do $receipt_legacy_overload$
declare
  v_session_id uuid := gen_random_uuid();
  v_code text;
begin
  insert into public.kael_chat_sessions (
    id, customer_id, service_type, status, case_phase, diagnosis_scope, total_turns, safe_metadata
  ) values (
    v_session_id, 'b7400000-0000-4000-8000-000000000001', 'plumbing'::public.service_type,
    'estimate_ready', 'offer_review', (select value from p20_scope), 2,
    jsonb_build_object('address_district', 'q7', 'problem_chips', jsonb_build_array('faucet_broken'))
  );

  insert into public.kael_chat_turns (
    session_id, turn_index, role, content_type, safe_metadata
  ) values (
    v_session_id, 1, 'kael', 'estimate',
    jsonb_build_object(
      'estimate', jsonb_build_object(
        'problem_summary', 'Vòi nước bồn rửa rò rỉ',
        'problem_category', 'faucet_broken',
        'complexity', 'medium',
        'price_min', 250000,
        'price_max', 400000
      ),
      'estimate_card_v3', jsonb_build_object(
        'card', jsonb_build_object(
          'price_source', 'baseline_with_market',
          'kael_reasoning', jsonb_build_object(
            'baseline_used', 'plumbing.faucet_replace',
            'complexity_reasoning', 'Một điểm rò rỉ'
          ),
          'analysis_receipt', (select value from p20_analysis),
          'price_reasoning_receipt', (select value from p20_reasoning)
        )
      )
    )
  );

  select error_code into v_code
  from public.confirm_kael_chat_atomic(v_session_id, 'b7400000-0000-4000-8000-000000000001');

  if v_code is distinct from 'MISSING_REASONING_RECEIPT' then
    raise exception
      'the two-argument confirm overload accepted a confirmation with no bound receipt id (returned %). authority: governance/RULES.md #7',
      coalesce(v_code, '<null>');
  end if;
end;
$receipt_legacy_overload$;

select jsonb_build_object(
  'complete_receipt_pair_accepted', true,
  'analysis_receipt_fields_enforced', true,
  'price_reasoning_receipt_fields_enforced', true,
  'schema_versions_pinned', true,
  'field_types_enforced', true,
  'closed_sets_enforced', true,
  'receipt_binding_enforced', true,
  'receipt_arithmetic_reconciled', true,
  'empty_lists_refused', true,
  'price_source_agreement_enforced', true,
  'legacy_overload_cannot_bypass', true
) as kael_price_reasoning_receipt_verification;

rollback;
