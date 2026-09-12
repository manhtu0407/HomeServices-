-- P69: rollback-only proof that an isolated synthetic job can traverse public
-- fulfillment and terminal simulation without touching real financial records.

begin;

insert into public.harness_releases(
  release_id, environment, git_sha, manifest_sha256,
  migration_inventory_sha256, database_types_sha256, prompt_bundle_sha256,
  policy_bundle_sha256, runtime_configuration_sha256,
  evaluation_suite_version, evaluation_suite_sha256,
  capability_registry_sha256, access_matrix_sha256,
  reliability_policy_sha256, promotion_policy_sha256, bundle_sha256,
  edge_function_digests, release_artifact, created_by
) values (
  'harness-d69000000000-d69000000000', 'staging', repeat('a', 40), repeat('b', 64),
  repeat('c', 64), repeat('d', 64), repeat('e', 64), repeat('f', 64),
  repeat('1', 64), 'p69', repeat('2', 64), repeat('3', 64), repeat('4', 64),
  repeat('5', 64), repeat('6', 64), repeat('7', 64), '{}'::jsonb, '{}'::jsonb,
  'synthetic-terminal-sql'
);

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'd6910000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'p69-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    'd6910000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'p69-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

update public.profiles set role = 'worker'::public.user_role
where id = 'd6910000-0000-4000-8000-000000000002';

insert into public.customer_profiles(id, district)
values ('d6910000-0000-4000-8000-000000000001', 'q7')
on conflict (id) do update set district = excluded.district;

insert into public.worker_profiles(
  id, service_types, selected_service_types, active_service_types,
  years_experience, districts, is_approved, is_available, is_suspended,
  legal_name, date_of_birth, verification_status
) values (
  'd6910000-0000-4000-8000-000000000002',
  array['electrical']::public.service_type[],
  array['electrical']::public.service_type[],
  array['electrical']::public.service_type[],
  5, array['q7'], true, true, false, 'P69 Worker', '1990-01-01', 'approved'
);

set local role service_role;

select * from public.bind_synthetic_matching_cohort(
  'synthetic-d690-terminal-proof',
  array['d6910000-0000-4000-8000-000000000001']::uuid[],
  array['d6910000-0000-4000-8000-000000000002']::uuid[]
);

reset role;

insert into public.kael_chat_sessions(
  id, customer_id, service_type, status, safe_metadata
) values (
  'd6930000-0000-4000-8000-000000000001',
  'd6910000-0000-4000-8000-000000000001',
  'electrical', 'active', '{"source":"p69_sql"}'::jsonb
);

insert into public.jobs(
  id, customer_id, service_type, service_problem_id, description,
  address_building, address_unit, address_floor, address_district, status,
  quote_mode, kael_price_min, kael_price_max, kael_estimate_card_v3
) values (
  'd6920000-0000-4000-8000-000000000001',
  'd6910000-0000-4000-8000-000000000001',
  'electrical',
  (select id from public.service_problems where slug = 'electrical-general'),
  'P69 isolated terminal fixture', 'Private Building', '1201', '12', 'q7',
  'broadcasting', 'kael_auto_quote', 150000, 250000,
  jsonb_build_object(
    'card', jsonb_build_object(
      'price_source', 'baseline_with_market',
      'price_reasoning_receipt', jsonb_build_object(
        'schema_version', 'price_reasoning_receipt.v1',
        'receipt_id', 'price_reasoning:d6950000-0000-4000-8000-000000000001',
        'costs', jsonb_build_object('total_min', 150000, 'total_max', 250000),
        'scenarios', jsonb_build_object(
          'low', jsonb_build_object('total', 150000),
          'high', jsonb_build_object('total', 250000)
        ),
        'fairness', jsonb_build_object(
          'price_source', 'baseline_with_market', 'confidence', 'medium',
          'baseline_evidence', null, 'market_source_count', 3,
          'high_trust_source_count', 2, 'quorum_met', true,
          'cap_statement', 'Verified range only.'
        )
      )
    )
  )
);

insert into public.confirmation_operations(
  id, idempotency_key, session_id, customer_id, job_id, quote_mode,
  confirmation_kind, state, support_code, synthetic_cohort_id
) values (
  'd6970000-0000-4000-8000-000000000001',
  'kael-confirm:d6930000-0000-4000-8000-000000000001:d6910000-0000-4000-8000-000000000001',
  'd6930000-0000-4000-8000-000000000001',
  'd6910000-0000-4000-8000-000000000001',
  'd6920000-0000-4000-8000-000000000001',
  'kael_auto_quote', 'priced_offer', 'candidate_ready', 'D690C0DE',
  'synthetic-d690-terminal-proof'
);

insert into public.matching_operations(
  id, confirmation_operation_id, job_id, state, synthetic_cohort_id
) values (
  'd6980000-0000-4000-8000-000000000001',
  'd6970000-0000-4000-8000-000000000001',
  'd6920000-0000-4000-8000-000000000001',
  'candidate_ready', 'synthetic-d690-terminal-proof'
);

insert into public.workflow_outbox(operation_id, event_type, status, safe_payload)
values (
  'd6970000-0000-4000-8000-000000000001', 'matching_requested', 'processing',
  '{"job_id":"d6920000-0000-4000-8000-000000000001"}'::jsonb
);

set local role service_role;

do $official_match$
declare
  v_broadcast record;
  v_quote_id uuid;
  v_candidate record;
  v_confirmed record;
begin
  select * into v_broadcast
  from public.activate_job_broadcast_batch_atomic(
    'd6920000-0000-4000-8000-000000000001',
    array['d6910000-0000-4000-8000-000000000002']::uuid[],
    'd6960000-0000-4000-8000-000000000001', now(), now() + interval '10 minutes'
  );
  select (original_scope_price_quote ->> 'quote_id')::uuid into v_quote_id
  from public.job_broadcasts where id = v_broadcast.id;
  select * into v_candidate from public.accept_broadcast_atomic(
    'd6920000-0000-4000-8000-000000000001',
    'd6910000-0000-4000-8000-000000000002', v_quote_id
  );
  select * into v_confirmed from public.confirm_worker_candidate_atomic(
    'd6920000-0000-4000-8000-000000000001', v_candidate.candidate_id,
    'd6910000-0000-4000-8000-000000000001'
  );
  if v_confirmed.ok is not true or v_confirmed.job_status <> 'worker_matched'
    or (select final_price from public.jobs
      where id = 'd6920000-0000-4000-8000-000000000001') <> 200000
  then
    raise exception 'P69 fixture did not reach verified official match';
  end if;
end;
$official_match$;

insert into public.job_media_assets(
  job_id, owner_id, service_type, stage, bucket_id, object_path,
  mime_type, file_size_bytes, safe_metadata
) values (
  'd6920000-0000-4000-8000-000000000001',
  'd6910000-0000-4000-8000-000000000002',
  'electrical', 'after', 'job-media',
  'd6920000-0000-4000-8000-000000000001/after/p69.png',
  'image/png', 68, '{"synthetic_fixture":true}'::jsonb
);

do $public_fulfillment$
declare
  v_from public.job_status := 'worker_matched'::public.job_status;
  v_to public.job_status;
begin
  foreach v_to in array array[
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status,
    'completed_by_worker'::public.job_status
  ] loop
    update public.jobs as job
    set status = v_to,
      arrived_at = case when v_to = 'arrived' then now() else job.arrived_at end,
      completed_at = case when v_to = 'completed_by_worker' then now() else job.completed_at end,
      completion_notes = case when v_to = 'completed_by_worker'
        then 'P69 completion evidence' else job.completion_notes end,
      completion_photo_urls = case when v_to = 'completed_by_worker'
        then array['supabase://job-media/d6920000-0000-4000-8000-000000000001/after/p69.png']
        else job.completion_photo_urls end
    where job.id = 'd6920000-0000-4000-8000-000000000001'
      and job.status = v_from;
    if not found then raise exception 'P69 public fulfillment transition failed: % -> %', v_from, v_to; end if;
    insert into public.job_events(
      job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
    ) values (
      'd6920000-0000-4000-8000-000000000001',
      'd6910000-0000-4000-8000-000000000002', 'worker',
      'worker_status_update', v_from, v_to, '{"source":"public_edge_equivalent"}'::jsonb
    );
    v_from := v_to;
  end loop;
end;
$public_fulfillment$;

do $unauthorized_boundary$
begin
  begin
    update public.jobs set status = 'confirmed_by_customer'
    where id = 'd6920000-0000-4000-8000-000000000001';
    raise exception 'synthetic terminal state was reachable without scoped RPC';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('authenticated',
      'public.complete_synthetic_transaction_proof(uuid,uuid,text,text,text,text,smallint,text,uuid)',
      'execute')
    or has_function_privilege('anon',
      'public.complete_synthetic_transaction_proof(uuid,uuid,text,text,text,text,smallint,text,uuid)',
      'execute')
  then
    raise exception 'synthetic terminal RPC is exposed outside service_role';
  end if;
end;
$unauthorized_boundary$;

do $terminal_proof$
declare
  v_proof record;
  v_retry record;
begin
  select * into v_proof from public.complete_synthetic_transaction_proof(
    'd6920000-0000-4000-8000-000000000001',
    'd6910000-0000-4000-8000-000000000001',
    'harness-d69000000000-d69000000000', 'staging',
    'synthetic-d690-terminal-proof', 'sql:d690', 1::smallint, 'auto_quote',
    'd6990000-0000-4000-8000-000000000001'
  );
  select * into v_retry from public.complete_synthetic_transaction_proof(
    'd6920000-0000-4000-8000-000000000001',
    'd6910000-0000-4000-8000-000000000001',
    'harness-d69000000000-d69000000000', 'staging',
    'synthetic-d690-terminal-proof', 'sql:d690', 1::smallint, 'auto_quote',
    'd6990000-0000-4000-8000-000000000001'
  );
  if v_proof.job_status <> 'reviewed' or v_proof.payment_status <> 'received'
    or v_proof.fulfillment_passed is not true or v_proof.completion_passed is not true
    or v_proof.payment_passed is not true or v_proof.review_passed is not true
    or v_proof.already_applied is true or v_retry.already_applied is not true
    or v_retry.proof_id <> v_proof.proof_id
  then
    raise exception 'P69 terminal receipt or idempotent retry failed';
  end if;
  if (select count(*) from public.stage1_synthetic_transaction_proofs
      where release_id = 'harness-d69000000000-d69000000000'
        and run_id = 'sql:d690') <> 1
    or exists (select 1 from public.job_payment_orders
      where job_id = 'd6920000-0000-4000-8000-000000000001')
    or exists (select 1 from public.worker_payment_ledger
      where job_id = 'd6920000-0000-4000-8000-000000000001')
    or exists (select 1 from public.reviews
      where job_id = 'd6920000-0000-4000-8000-000000000001')
    or exists (select 1 from public.jobs
      where id = 'd6920000-0000-4000-8000-000000000001'
        and (status <> 'reviewed' or payment_provider <> 'staging_simulator'
          or payment_status <> 'received' or payment_amount_received <> final_price
          or gross_amount is not null or platform_fee is not null or worker_net is not null))
  then
    raise exception 'P69 synthetic terminal path leaked into real finance or missed terminal state';
  end if;
end;
$terminal_proof$;

reset role;

do $promotion_gate$
begin
  begin
    insert into public.stage1_synthetic_smoke_receipts(
      release_id, environment, cohort_id, run_id, sequence,
      auto_quote_passed, rfq_or_inspection_passed, recovery_passed,
      release_identity_match, terminal_reconcile_passed,
      synthetic_leak_count, duplicate_job_count, duplicate_broadcast_count,
      safe_error_code_ratio, confirm_acceptance_ms, worker_offer_visible_ms,
      support_trace_count, receipt_generated_at, receipt_sha256
    ) values (
      'harness-d69000000000-d69000000000', 'staging',
      'synthetic-d690-terminal-proof', 'sql:d690', 1,
      true, true, true, true, true, 0, 0, 0, 1, 100, 200, 3, now(), repeat('8', 64)
    );
    raise exception 'promotion smoke accepted only one terminal scenario';
  exception when check_violation then null;
  end;

  insert into public.stage1_synthetic_transaction_proofs(
    request_id, release_id, environment, cohort_id, run_id, sequence,
    scenario_kind, job_fingerprint_sha256, terminal_state_sha256,
    reached_status, fulfillment_passed, completion_passed,
    payment_passed, review_passed, generated_at
  ) values (
    'd6990000-0000-4000-8000-000000000002',
    'harness-d69000000000-d69000000000', 'staging',
    'synthetic-d690-terminal-proof', 'sql:d690', 1, 'rfq_or_inspection',
    repeat('9', 64), repeat('a', 64), 'reviewed', true, true, true, true, now()
  );

  insert into public.stage1_synthetic_smoke_receipts(
    release_id, environment, cohort_id, run_id, sequence,
    auto_quote_passed, rfq_or_inspection_passed, recovery_passed,
    release_identity_match, terminal_reconcile_passed,
    synthetic_leak_count, duplicate_job_count, duplicate_broadcast_count,
    safe_error_code_ratio, confirm_acceptance_ms, worker_offer_visible_ms,
    support_trace_count, receipt_generated_at, receipt_sha256
  ) values (
    'harness-d69000000000-d69000000000', 'staging',
    'synthetic-d690-terminal-proof', 'sql:d690', 1,
    true, true, true, true, true, 0, 0, 0, 1, 100, 200, 3, now(), repeat('8', 64)
  );
end;
$promotion_gate$;

select jsonb_build_object(
  'public_fulfillment', true,
  'private_media', true,
  'isolated_paid_review', true,
  'real_finance_rows', 0,
  'idempotent_terminal_receipt', true,
  'two_scenario_promotion_gate', true
) as synthetic_terminal_transaction_proof;

rollback;
