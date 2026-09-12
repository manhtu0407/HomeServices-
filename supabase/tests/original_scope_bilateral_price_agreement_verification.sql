-- Rollback-only proof for the exact original-scope price agreement. Run only
-- on local or staging because it creates temporary auth and workflow fixtures.
begin;

set constraints guard_bilateral_final_price_lock immediate;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a1510000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'price-owner@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a1510000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'price-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set role = 'worker'
where id = 'a1510000-0000-4000-8000-000000000002';

insert into public.customer_profiles (id, district)
values ('a1510000-0000-4000-8000-000000000001', 'q7')
on conflict (id) do update
set district = excluded.district;

insert into public.worker_profiles (
  id, service_types, selected_service_types, years_experience, districts,
  is_approved, is_available, legal_name, date_of_birth, verification_status
) values (
  'a1510000-0000-4000-8000-000000000002',
  array['electrical']::public.service_type[],
  array['electrical']::public.service_type[],
  5, array['q7'], true, true, 'Price Worker', '1990-01-01', 'approved'
);

set local role service_role;

select * from public.bind_synthetic_matching_cohort(
  'synthetic-a151-price-agreement',
  array['a1510000-0000-4000-8000-000000000001']::uuid[],
  array['a1510000-0000-4000-8000-000000000002']::uuid[]
);

reset role;

insert into public.kael_chat_sessions(
  id, customer_id, service_type, status, safe_metadata
) values (
  'a1530000-0000-4000-8000-000000000001',
  'a1510000-0000-4000-8000-000000000001',
  'electrical', 'active', '{"source":"bilateral_price_sql"}'::jsonb
);

insert into public.jobs (
  id, customer_id, service_type, service_problem_id, description,
  address_building, address_unit, address_floor, address_district, status,
  quote_mode, kael_price_min, kael_price_max, kael_estimate_card_v3
) values (
  'a1520000-0000-4000-8000-000000000001',
  'a1510000-0000-4000-8000-000000000001',
  'electrical',
  (select id from public.service_problems where slug = 'electrical-general'),
  'Verified original scope fixture', 'Private Building', '1201', '12', 'q7',
  'broadcasting', 'kael_auto_quote', 150000, 250000,
  jsonb_build_object(
    'card', jsonb_build_object(
      'price_source', 'baseline_with_market',
      'price_reasoning_receipt', jsonb_build_object(
        'schema_version', 'price_reasoning_receipt.v1',
        'receipt_id', 'price_reasoning:a1550000-0000-4000-8000-000000000001',
        'costs', jsonb_build_object(
          'total_min', 150000,
          'total_max', 250000
        ),
        'scenarios', jsonb_build_object(
          'low', jsonb_build_object('total', 150000),
          'high', jsonb_build_object('total', 250000)
        ),
        'fairness', jsonb_build_object(
          'price_source', 'baseline_with_market',
          'confidence', 'medium',
          'baseline_evidence', null,
          'market_source_count', 3,
          'high_trust_source_count', 2,
          'quorum_met', true,
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
  'a1570000-0000-4000-8000-000000000001',
  'kael-confirm:a1530000-0000-4000-8000-000000000001:a1510000-0000-4000-8000-000000000001',
  'a1530000-0000-4000-8000-000000000001',
  'a1510000-0000-4000-8000-000000000001',
  'a1520000-0000-4000-8000-000000000001',
  'kael_auto_quote', 'priced_offer', 'candidate_ready', 'A151C0DE',
  'synthetic-a151-price-agreement'
);

insert into public.matching_operations(
  id, confirmation_operation_id, job_id, state, synthetic_cohort_id
) values (
  'a1580000-0000-4000-8000-000000000001',
  'a1570000-0000-4000-8000-000000000001',
  'a1520000-0000-4000-8000-000000000001',
  'candidate_ready', 'synthetic-a151-price-agreement'
);

-- A current candidate requires a reachable Worker and a lease for this operation.
select * from public.record_worker_matching_heartbeat('a1510000-0000-4000-8000-000000000002', now());
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
values ('a1570000-0000-4000-8000-000000000001', 'a1520000-0000-4000-8000-000000000001',
  'a1510000-0000-4000-8000-000000000002', 'electrical', 'q7', 'held', now(),
  now() + interval '5 minutes', 'synthetic-a151-price-agreement');

insert into public.workflow_outbox(
  operation_id, event_type, status, safe_payload
) values (
  'a1570000-0000-4000-8000-000000000001',
  'matching_requested', 'processing',
  '{"job_id":"a1520000-0000-4000-8000-000000000001"}'::jsonb
);

set local role service_role;

do $verification$
declare
  v_broadcast record;
  v_accept record;
  v_accept_retry record;
  v_confirm record;
  v_confirm_retry record;
  v_quote jsonb;
  v_quote_id uuid;
  v_candidate_quote jsonb;
  v_tier record;
begin
  if (select synthetic_cohort_id from public.jobs
      where id = 'a1520000-0000-4000-8000-000000000001')
      <> 'synthetic-a151-price-agreement'
  then
    raise exception 'verified price fixture did not inherit its synthetic cohort';
  end if;

  select * into v_broadcast
  from public.activate_job_broadcast_batch_durable_atomic_v2(
    'a1520000-0000-4000-8000-000000000001',
    array['a1510000-0000-4000-8000-000000000002']::uuid[],
    'a1560000-0000-4000-8000-000000000001',
    now(),
    now() + interval '5 minutes'
  );

  select original_scope_price_quote into v_quote
  from public.job_broadcasts
  where id = v_broadcast.id;

  v_quote_id := (v_quote ->> 'quote_id')::uuid;
  select * into v_tier
  from public.get_worker_current_commission_tier(
    'a1510000-0000-4000-8000-000000000002'
  );

  if v_quote is null or v_quote_id is null
    or v_quote ->> 'schema_version' <> 'original_scope_price_quote.v1'
    or (v_quote ->> 'customer_total')::integer <> 200000
    or (v_quote ->> 'reference_price_min')::integer <> 150000
    or (v_quote ->> 'reference_price_max')::integer <> 250000
    or (v_quote ->> 'platform_fee')::integer
      <> round(200000::numeric * v_tier.commission_rate_bps / 10000.0)
    or (v_quote ->> 'worker_net')::integer
      <> 200000 - round(200000::numeric * v_tier.commission_rate_bps / 10000.0)
    or v_quote ->> 'worker_confirmed_at' is not null
  then
    raise exception 'broadcast did not freeze the evidence-backed exact quote';
  end if;

  select * into v_accept
  from public.accept_broadcast_atomic(
    'a1520000-0000-4000-8000-000000000001',
    'a1510000-0000-4000-8000-000000000002',
    v_quote_id
  );

  if v_accept.ok is not true
    or v_accept.job_status <> 'worker_candidate_pending'
    or v_accept.candidate_id is null
  then
    raise exception 'worker exact-price confirmation failed: %', row_to_json(v_accept);
  end if;

  select original_scope_price_quote into v_candidate_quote
  from public.job_worker_candidates
  where id = v_accept.candidate_id;

  if nullif(v_candidate_quote ->> 'worker_confirmed_at', '') is null
    or (v_candidate_quote ->> 'quote_id')::uuid <> v_quote_id
    or exists (
      select 1 from public.jobs
      where id = 'a1520000-0000-4000-8000-000000000001'
        and (worker_id is not null or final_price is not null)
    )
  then
    raise exception 'worker confirmation did not stay candidate-only';
  end if;

  select * into v_accept_retry
  from public.accept_broadcast_atomic(
    'a1520000-0000-4000-8000-000000000001',
    'a1510000-0000-4000-8000-000000000002',
    v_quote_id
  );

  if v_accept_retry.ok is not true
    or v_accept_retry.already_applied is not true
    or v_accept_retry.candidate_id <> v_accept.candidate_id
  then
    raise exception 'worker price-confirm retry was not idempotent';
  end if;

  select * into v_confirm
  from public.confirm_worker_candidate_atomic(
    'a1520000-0000-4000-8000-000000000001',
    v_accept.candidate_id,
    'a1510000-0000-4000-8000-000000000001'
  );

  if v_confirm.ok is not true
    or v_confirm.job_status <> 'worker_matched'
    or v_confirm.already_applied is true
    or exists (
      select 1 from public.jobs
      where id = 'a1520000-0000-4000-8000-000000000001'
        and (
          worker_id <> 'a1510000-0000-4000-8000-000000000002'
          or final_price <> 200000
        )
    )
  then
    raise exception 'customer did not atomically confirm worker and exact price';
  end if;

  if (select state from public.confirmation_operations
      where id = 'a1570000-0000-4000-8000-000000000001') <> 'official_match'
    or (select state from public.matching_operations
      where id = 'a1580000-0000-4000-8000-000000000001') <> 'official_match'
    or (select status from public.workflow_outbox
      where operation_id = 'a1570000-0000-4000-8000-000000000001'
        and event_type = 'matching_requested') <> 'completed'
  then
    raise exception 'official match did not atomically project its durable terminal receipt';
  end if;

  begin
    update public.jobs
    set gross_amount = 200000
    where id = 'a1520000-0000-4000-8000-000000000001';
    raise exception 'synthetic official match entered a money field';
  exception when insufficient_privilege then null;
  end;

  select * into v_confirm_retry
  from public.confirm_worker_candidate_atomic(
    'a1520000-0000-4000-8000-000000000001',
    v_accept.candidate_id,
    'a1510000-0000-4000-8000-000000000001'
  );

  if v_confirm_retry.ok is not true
    or v_confirm_retry.already_applied is not true
    or (
      select final_price from public.jobs
      where id = 'a1520000-0000-4000-8000-000000000001'
    ) <> 200000
  then
    raise exception 'customer price-confirm retry was not idempotent';
  end if;
end;
$verification$;

reset role;

select jsonb_build_object(
  'server_frozen_quote', true,
  'worker_confirmation', true,
  'customer_confirmation', true,
  'final_price_atomic', true,
  'terminal_receipt_atomic', true,
  'retry_idempotent', true,
  'estimate_range_preserved', true
) as original_scope_bilateral_price_agreement_verification;

rollback;
