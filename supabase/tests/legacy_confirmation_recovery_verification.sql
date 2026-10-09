-- Rollback-only recovery proof. Receipt fixtures match the canonical P20 gate.
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
    "price_source": "perplexity_validated",
    "confidence": "medium",
    "cap_statement": "Giá cuối không vượt mức tối đa trừ khi khách duyệt thay đổi phạm vi",
    "quorum_met": true,
    "market_source_count": 3,
    "high_trust_source_count": 2
  }
}'::jsonb as value;


create temporary table recovery_fixture(session_id uuid,job_id uuid,problem_id uuid) on commit drop;
do $fixture$
declare
  v_problem uuid;
  v_session uuid:=gen_random_uuid();
  v_result record;
  v_card jsonb;
  v_baseline public.price_baseline_versions%rowtype;
  v_policy public.service_intake_policies%rowtype;
begin
  select baseline.* into strict v_baseline from public.price_baseline_versions baseline
    join public.service_problems problem on problem.id=baseline.service_problem_id
    where problem.service_type='plumbing' and problem.is_active
      and public.price_evidence_has_quorum(baseline.price_evidence)
    order by problem.slug limit 1;
  v_problem:=v_baseline.service_problem_id;
  select * into strict v_policy from public.service_intake_policies
    where service_problem_id=v_problem order by version desc limit 1;
  update public.service_intake_policies set status='retired'
    where service_problem_id=v_problem and status='active';
  insert into public.service_intake_policies
    select (jsonb_populate_record(null::public.service_intake_policies,to_jsonb(v_policy)||
      jsonb_build_object('id',gen_random_uuid(),'version',v_policy.version+1,'status','active',
        'quote_mode','kael_auto_quote','tier_a_fields',
        '["service_type","problem_slug","address_district","address_label","scheduled_at","description_min"]'::jsonb,
        'evidence_requirements','{"minimum_source_count":2,"minimum_high_trust_source_count":2,"requires_active_baseline":false,"allow_live_market_evidence":true}'::jsonb))).*;
  update public.price_baseline_versions set status='retired'
    where service_problem_id=v_problem and district_code='q7' and complexity='medium' and status='active';
  insert into public.price_baseline_versions
    select (jsonb_populate_record(null::public.price_baseline_versions,to_jsonb(v_baseline)||
      jsonb_build_object('id',gen_random_uuid(),'version',1+coalesce((select max(version)
        from public.price_baseline_versions where service_problem_id=v_problem and district_code='q7' and complexity='medium'),0),
        'status','active','district_code','q7','complexity','medium','price_min',250000,'price_max',400000,
        'reason','Rollback-only recovery verification fixture'))).*;
  v_card:=jsonb_build_object('card',jsonb_build_object('price_source','perplexity_validated',
    'kael_reasoning',jsonb_build_object('baseline_used','plumbing.fixture','complexity_reasoning','Một điểm rò rỉ'),
    'analysis_receipt',(select value from p20_analysis),
    'price_reasoning_receipt',(select value from p20_reasoning)));
  insert into public.kael_chat_sessions(id,customer_id,service_type,status,case_phase,diagnosis_scope,
    scheduled_at,total_turns,safe_metadata)
  values(v_session,'b7400000-0000-4000-8000-000000000001','plumbing','estimate_ready','offer_review',
    (select value from p20_scope),now()+interval '1 day',2,
    '{"address_district":"q7","address_label":"Fixture building","problem_chips":["faucet_broken"]}');
  insert into public.kael_chat_turns(session_id,turn_index,role,content_type,safe_metadata)
  values(v_session,1,'kael','estimate',jsonb_build_object('service_problem_id',v_problem,
    'estimate_card_v3',v_card,'estimate',jsonb_build_object('problem_summary','Vòi nước rò rỉ',
      'problem_category','faucet_broken','complexity','medium','price_min',250000,'price_max',400000)));
  select * into strict v_result from public.confirm_kael_chat_atomic(
    v_session,'b7400000-0000-4000-8000-000000000001','p20-receipt-0001');
  if not v_result.ok then raise exception 'Fixture confirmation refused: %',v_result.error_code; end if;
  update public.jobs set status='broadcasting' where id=v_result.job_id;
  insert into public.job_events(job_id,event_type) values(v_result.job_id,'no_worker_found');
  update public.price_baseline_versions set status='retired'
    where service_problem_id=v_problem and district_code='q7' and complexity='medium' and status='active';
  insert into recovery_fixture values(v_session,v_result.job_id,v_problem);
end;
$fixture$;

grant select on recovery_fixture to service_role,authenticated;
savepoint recovery_base;
set local role service_role;
do $replay$
declare v_fixture record; v_first jsonb; v_second jsonb;
begin
  select * into strict v_fixture from recovery_fixture;
  v_first:=public.recover_legacy_kael_confirmation_atomic(v_fixture.session_id,
    'b7400000-0000-4000-8000-000000000001',v_fixture.job_id,'p20-receipt-0001');
  v_second:=public.recover_legacy_kael_confirmation_atomic(v_fixture.session_id,
    'b7400000-0000-4000-8000-000000000001',v_fixture.job_id,'p20-receipt-0001');
  if v_first is distinct from v_second or v_first->>'job_id'<>v_fixture.job_id::text
    or v_first->>'state'<>'no_reachable_worker'
    or (select count(*) from public.jobs where customer_id='b7400000-0000-4000-8000-000000000001')<>1
    or (select count(*) from public.confirmation_operations where job_id=v_fixture.job_id)<>1
    or (select count(*) from public.matching_operations where job_id=v_fixture.job_id)<>1
    or exists(select 1 from public.job_broadcasts where job_id=v_fixture.job_id)
    or exists(select 1 from public.workflow_outbox where operation_id=(v_first->>'operation_id')::uuid
      and status<>'completed')
  then raise exception 'Recovery duplicated job, changed identity, or sent matching without consent'; end if;
end;
$replay$;
rollback to recovery_base;

do $insufficient_live_evidence$
declare
  v_fixture record;
  v_metadata jsonb;
  v_card jsonb;
begin
  select * into strict v_fixture from recovery_fixture;
  select safe_metadata into strict v_metadata from public.kael_chat_turns
    where session_id=v_fixture.session_id and role='kael' and content_type='estimate';
  v_card:=v_metadata->'estimate_card_v3';
  v_card:=jsonb_set(v_card,'{card,analysis_receipt,market,accepted_source_count}','1'::jsonb);
  v_card:=jsonb_set(v_card,'{card,analysis_receipt,market,high_trust_source_count}','1'::jsonb);
  v_card:=jsonb_set(v_card,'{card,analysis_receipt,market,quorum_met}','false'::jsonb);
  v_card:=jsonb_set(v_card,'{card,price_reasoning_receipt,fairness,market_source_count}','1'::jsonb);
  v_card:=jsonb_set(v_card,'{card,price_reasoning_receipt,fairness,high_trust_source_count}','1'::jsonb);
  v_card:=jsonb_set(v_card,'{card,price_reasoning_receipt,fairness,quorum_met}','false'::jsonb);
  update public.kael_chat_turns set safe_metadata=jsonb_set(v_metadata,'{estimate_card_v3}',v_card)
    where session_id=v_fixture.session_id and role='kael' and content_type='estimate';
  update public.jobs set kael_estimate_card_v3=v_card where id=v_fixture.job_id;
  begin
    perform public.recover_legacy_kael_confirmation_atomic(v_fixture.session_id,
      'b7400000-0000-4000-8000-000000000001',v_fixture.job_id,'p20-receipt-0001');
    raise exception 'Recovery accepted live-market evidence below the current policy quorum';
  exception when check_violation then
    if sqlerrm<>'KAEL_PRICE_EVIDENCE_REQUIRED' then raise; end if;
  end;
  if exists(select 1 from public.confirmation_operations where job_id=v_fixture.job_id)
    or (select quote_mode from public.jobs where id=v_fixture.job_id) is not null then
    raise exception 'Insufficient live-market evidence left partial recovery state';
  end if;
end;
$insufficient_live_evidence$;
rollback to recovery_base;

do $ownership$
declare v_fixture record;
begin
  select * into strict v_fixture from recovery_fixture;
  begin
    perform public.recover_legacy_kael_confirmation_atomic(v_fixture.session_id,
      gen_random_uuid(),v_fixture.job_id,'p20-receipt-0001');
    raise exception 'Cross-customer recovery accepted';
  exception when insufficient_privilege then null; end;
end;
$ownership$;

do $receipt_binding$
declare v_fixture record;
begin
  select * into strict v_fixture from recovery_fixture;
  begin
    perform public.recover_legacy_kael_confirmation_atomic(v_fixture.session_id,
      'b7400000-0000-4000-8000-000000000001',v_fixture.job_id,'wrong-receipt-id');
    raise exception 'Unbound receipt accepted';
  exception when check_violation then
    if sqlerrm<>'MISSING_REASONING_RECEIPT' then raise; end if;
  end;
  if exists(select 1 from public.confirmation_operations where job_id=v_fixture.job_id)
    or (select quote_mode from public.jobs where id=v_fixture.job_id) is not null then
    raise exception 'Rejected recovery left partial writes';
  end if;
end;
$receipt_binding$;

update public.jobs set kael_price_max=410000 where id=(select job_id from recovery_fixture);
do $changed_offer$
declare v_fixture record;
begin
  select * into strict v_fixture from recovery_fixture;
  begin
    perform public.recover_legacy_kael_confirmation_atomic(v_fixture.session_id,
      'b7400000-0000-4000-8000-000000000001',v_fixture.job_id,'p20-receipt-0001');
    raise exception 'Changed offer silently adopted';
  exception when check_violation then
    if sqlerrm<>'LEGACY_OFFER_CHANGED' then raise; end if;
  end;
end;
$changed_offer$;
rollback to recovery_base;

do $rfq_fixture$
declare v_policy public.service_intake_policies%rowtype;
begin
  select * into strict v_policy from public.service_intake_policies
    where service_problem_id=(select problem_id from recovery_fixture) and status='active';
  update public.service_intake_policies set status='retired' where id=v_policy.id;
  insert into public.service_intake_policies
    select (jsonb_populate_record(null::public.service_intake_policies,to_jsonb(v_policy)||
      jsonb_build_object('id',gen_random_uuid(),'version',v_policy.version+1,'quote_mode','rfq'))).*;
end;
$rfq_fixture$;
do $changed_policy$
declare v_fixture record;
begin
  select * into strict v_fixture from recovery_fixture;
  begin
    perform public.recover_legacy_kael_confirmation_atomic(v_fixture.session_id,
      'b7400000-0000-4000-8000-000000000001',v_fixture.job_id,'p20-receipt-0001');
    raise exception 'RFQ bypassed explicit reconfirmation';
  exception when check_violation then
    if sqlerrm<>'CONFIRMATION_KIND_MISMATCH' then raise; end if;
  end;
end;
$changed_policy$;
rollback to recovery_base;

update public.price_baseline_versions set status='retired'
  where service_problem_id=(select problem_id from recovery_fixture) and status='active';
do $missing_price$
declare v_fixture record;
  v_policy public.service_intake_policies%rowtype;
  v_baseline public.price_baseline_versions%rowtype;
begin
  select * into strict v_fixture from recovery_fixture;
  select * into strict v_baseline from public.price_baseline_versions
    where service_problem_id=v_fixture.problem_id and district_code='q7' and complexity='medium'
      and price_min=250000 and price_max=400000
    order by version desc limit 1;
  insert into public.price_baseline_versions
    select (jsonb_populate_record(null::public.price_baseline_versions,to_jsonb(v_baseline)||
      jsonb_build_object('id',gen_random_uuid(),'version',1+coalesce((select max(version)
        from public.price_baseline_versions where service_problem_id=v_fixture.problem_id
          and district_code='q7' and complexity='medium'),0),'status','active'))).*;
  select * into strict v_policy from public.service_intake_policies
    where service_problem_id=v_fixture.problem_id and status='active' order by version desc limit 1;
  update public.service_intake_policies set status='retired' where id=v_policy.id;
  insert into public.service_intake_policies
    select (jsonb_populate_record(null::public.service_intake_policies,to_jsonb(v_policy)||
      jsonb_build_object('id',gen_random_uuid(),'version',v_policy.version+1,'status','active',
        'evidence_requirements',
        '{"minimum_source_count":2,"minimum_high_trust_source_count":2,"requires_active_baseline":true}'::jsonb))).*;
  update public.price_baseline_versions set status='retired'
    where service_problem_id=v_fixture.problem_id and district_code='q7' and complexity='medium'
      and status='active';
  begin
    perform public.recover_legacy_kael_confirmation_atomic(v_fixture.session_id,
      'b7400000-0000-4000-8000-000000000001',v_fixture.job_id,'p20-receipt-0001');
    raise exception 'Recovery bypassed missing current price evidence';
  exception when check_violation then
    if sqlerrm<>'KAEL_PRICE_EVIDENCE_REQUIRED' then raise; end if;
  end;
  if exists(select 1 from public.confirmation_operations where job_id=v_fixture.job_id) then
    raise exception 'Missing-price refusal left an operation';
  end if;
end;
$missing_price$;
rollback to recovery_base;

update public.jobs set status='cancelled' where id=(select job_id from recovery_fixture);
do $stopped_job$
declare v_fixture record;
begin
  select * into strict v_fixture from recovery_fixture;
  begin
    perform public.recover_legacy_kael_confirmation_atomic(v_fixture.session_id,
      'b7400000-0000-4000-8000-000000000001',v_fixture.job_id,'p20-receipt-0001');
    raise exception 'Recovery resurrected a cancelled job';
  exception when check_violation then
    if sqlerrm<>'LEGACY_RECOVERY_NOT_READY' then raise; end if;
  end;
end;
$stopped_job$;
rollback to recovery_base;

set local role authenticated;
do $privileges$
declare v_fixture record;
begin
  select * into strict v_fixture from recovery_fixture;
  begin
    perform public.recover_legacy_kael_confirmation_atomic(v_fixture.session_id,
      'b7400000-0000-4000-8000-000000000001',v_fixture.job_id,'p20-receipt-0001');
    raise exception 'Direct authenticated database mutation accepted';
  exception when insufficient_privilege then null; end;
end;
$privileges$;
rollback to recovery_base;

create function pg_temp.reject_recovery_receipt() returns trigger language plpgsql as $func$
begin
  raise exception 'RECEIPT_TEST_FAILURE';
end;
$func$;
create trigger recovery_receipt_failure before insert on public.confirmation_operation_receipts
  for each row execute function pg_temp.reject_recovery_receipt();
do $atomic_rollback$
declare v_fixture record;
begin
  select * into strict v_fixture from recovery_fixture;
  begin
    perform public.recover_legacy_kael_confirmation_atomic(v_fixture.session_id,
      'b7400000-0000-4000-8000-000000000001',v_fixture.job_id,'p20-receipt-0001');
    raise exception 'Receipt failure was not reached';
  exception when raise_exception then
    if sqlerrm<>'RECEIPT_TEST_FAILURE' then raise; end if;
  end;
  if (select quote_mode from public.jobs where id=v_fixture.job_id) is not null
    or exists(select 1 from public.confirmation_operations where job_id=v_fixture.job_id)
    or exists(select 1 from public.matching_operations where job_id=v_fixture.job_id)
    or exists(select 1 from public.job_events where job_id=v_fixture.job_id and event_type='legacy_confirmation_recovered')
  then raise exception 'Receipt failure left partially adopted job state'; end if;
end;
$atomic_rollback$;
rollback;
