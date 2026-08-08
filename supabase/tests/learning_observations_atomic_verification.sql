begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a2100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'learning-observation-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a2100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'learning-observation-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set role = 'worker'
where id = 'a2100000-0000-4000-8000-000000000002';

insert into public.jobs (
  id,
  customer_id,
  worker_id,
  service_type,
  service_problem_id,
  description,
  address_district,
  status,
  kael_problem_identified,
  kael_complexity,
  kael_price_min,
  kael_price_max,
  final_price,
  reviewed_at
) values
  (
    'a2200000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    'plumbing',
    (select id from public.service_problems where slug = 'plumbing-general'),
    'Atomic price observation one',
    'q1',
    'reviewed',
    'plumbing-general',
    'small',
    200000,
    400000,
    500000,
    '2026-07-14T02:00:00Z'
  ),
  (
    'a2200000-0000-4000-8000-000000000002',
    'a2100000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    'plumbing',
    (select id from public.service_problems where slug = 'plumbing-general'),
    'Atomic price observation two',
    'q1',
    'reviewed',
    'plumbing-general',
    'small',
    200000,
    400000,
    520000,
    '2026-07-14T02:01:00Z'
  ),
  (
    'a2200000-0000-4000-8000-000000000003',
    'a2100000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    'plumbing',
    (select id from public.service_problems where slug = 'plumbing-general'),
    'Atomic case observation',
    'q3',
    'reviewed',
    'plumbing-general',
    'small',
    200000,
    400000,
    450000,
    '2026-07-14T02:02:00Z'
  ),
  (
    'a2200000-0000-4000-8000-000000000004',
    'a2100000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    'plumbing',
    (select id from public.service_problems where slug = 'plumbing-general'),
    'Atomic existing candidate without signal',
    'q4',
    'reviewed',
    'plumbing-general',
    'small',
    200000,
    400000,
    450000,
    '2026-07-14T02:03:00Z'
  ),
  (
    'a2200000-0000-4000-8000-000000000005',
    'a2100000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    'plumbing',
    (select id from public.service_problems where slug = 'plumbing-general'),
    'Atomic legacy tag scrub',
    'q5',
    'reviewed',
    'plumbing-general',
    'small',
    200000,
    400000,
    450000,
    '2026-07-14T02:04:00Z'
  );

insert into public.reviews (job_id, customer_id, worker_id, rating, tags) values
  (
    'a2200000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    4,
    array['phone:0900000000', 'Đúng giờ', 'Đúng giờ']
  ),
  (
    'a2200000-0000-4000-8000-000000000002',
    'a2100000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    5,
    array['Chuyên nghiệp']
  ),
  (
    'a2200000-0000-4000-8000-000000000003',
    'a2100000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    3,
    array['Giải thích rõ', 'free-form note']
  ),
  (
    'a2200000-0000-4000-8000-000000000004',
    'a2100000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    4,
    array['Sạch sẽ']
  ),
  (
    'a2200000-0000-4000-8000-000000000005',
    'a2100000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    4,
    array['Sạch sẽ']
  );

insert into public.learning_candidates (
  id,
  candidate_type,
  affected_service,
  affected_problem,
  affected_district,
  suggested_payload,
  evidence_count,
  confidence,
  status,
  audit_reason
) values (
  'a2300000-0000-4000-8000-000000000004',
  'analysis_rule',
  'plumbing',
  'plumbing-general',
  'q4',
  '{}'::jsonb,
  0,
  0,
  'created',
  'verification fixture without prior signal'
);

insert into public.learning_candidates (
  id,
  candidate_type,
  affected_service,
  affected_problem,
  affected_district,
  suggested_payload,
  evidence_count,
  confidence,
  status,
  audit_reason
) values (
  'a2300000-0000-4000-8000-000000000005',
  'analysis_rule',
  'plumbing',
  'plumbing-general',
  'q5',
  jsonb_build_object(
    'candidate_type', 'analysis_rule',
    'scope', jsonb_build_object(
      'service_type', 'plumbing',
      'problem_slug', 'plumbing-general',
      'district_code', 'q5'
    ),
    'observed', jsonb_build_object(
      'sample_size', 1,
      'scope_change_rate', 1,
      'avg_rating', 3,
      'common_tags', jsonb_build_array('phone:0900000000', 'Đúng giờ')
    ),
    'suggested', jsonb_build_object(
      'kind', 'raise_complexity_prior',
      'from', 'small',
      'to', 'medium',
      'rationale', 'legacy signal'
    )
  ),
  1,
  0.6,
  'created',
  'verification legacy tag fixture'
);

insert into public.jobs (
  id,
  customer_id,
  worker_id,
  service_type,
  service_problem_id,
  description,
  address_district,
  status,
  kael_problem_identified,
  kael_complexity,
  kael_price_min,
  kael_price_max,
  final_price,
  reviewed_at
) values (
  'a2200000-0000-4000-8000-000000000006',
  'a2100000-0000-4000-8000-000000000001',
  'a2100000-0000-4000-8000-000000000002',
  'plumbing',
  (select id from public.service_problems where slug = 'plumbing-general'),
  'Malformed legacy learning seed',
  'q6',
  'reviewed',
  'plumbing-general',
  'small',
  200000,
  400000,
  450000,
  '2026-07-14T02:05:00Z'
);

insert into public.reviews (job_id, customer_id, worker_id, rating, tags) values (
  'a2200000-0000-4000-8000-000000000006',
  'a2100000-0000-4000-8000-000000000001',
  'a2100000-0000-4000-8000-000000000002',
  4,
  array['Sạch sẽ']
);

insert into public.learning_candidates (
  id,
  candidate_type,
  affected_service,
  affected_problem,
  affected_district,
  suggested_payload,
  evidence_count,
  confidence,
  status,
  audit_reason
) values (
  'a2300000-0000-4000-8000-000000000006',
  'price_prior_update',
  'plumbing',
  'plumbing-general',
  'q6',
  '{"candidate_type":"price_prior_update","observed":{"median_final_price":"not-a-number"}}'::jsonb,
  1,
  0.6,
  'created',
  'verification malformed legacy fixture'
);

insert into public.scope_change_requests (
  job_id,
  worker_id,
  requested_description,
  reason,
  price_min,
  price_max
) values (
  'a2200000-0000-4000-8000-000000000003',
  'a2100000-0000-4000-8000-000000000002',
  'Additional pipe work was required',
  'hidden_damage',
  200000,
  300000
);

do $$
declare
  v_first record;
  v_retry record;
  v_second record;
  v_case record;
  v_case_retry record;
  v_existing_no_signal record;
  v_wrong_district record;
  v_legacy_tags record;
  v_malformed_legacy record;
  v_candidate_count integer;
  v_stored_tags text[];
  v_unique_index_blocked boolean := false;
begin
  select * into v_first
  from public.record_learning_observation_atomic(
    'a2200000-0000-4000-8000-000000000001',
    'price_prior_update',
    'plumbing',
    'plumbing-general',
    'q1',
    'small',
    200000,
    400000,
    500000,
    4,
    array['Đúng giờ'],
    false,
    '2026-07-14T02:00:00Z',
    null,
    null
  );

  if v_first.ok is not true
     or v_first.is_new is not true
     or v_first.evidence_count <> 1
     or v_first.idempotent is true then
    raise exception 'first price observation was not recorded';
  end if;

  select receipt.review_tags into v_stored_tags
  from public.learning_observation_receipts as receipt
  where receipt.job_id = 'a2200000-0000-4000-8000-000000000001'
    and receipt.candidate_type = 'price_prior_update';

  if v_stored_tags is distinct from array['Đúng giờ']::text[] then
    raise exception 'non-canonical or duplicate review tags crossed the learning boundary';
  end if;

  select * into v_retry
  from public.record_learning_observation_atomic(
    'a2200000-0000-4000-8000-000000000001',
    'price_prior_update',
    'plumbing',
    'plumbing-general',
    'q1',
    'small',
    200000,
    400000,
    500000,
    4,
    array['Đúng giờ'],
    false,
    '2026-07-14T02:00:00Z',
    null,
    null
  );

  if v_retry.ok is not true
     or v_retry.idempotent is not true
     or v_retry.candidate_id <> v_first.candidate_id
     or v_retry.evidence_count <> 1 then
    raise exception 'duplicate retry changed evidence_count';
  end if;

  select * into v_second
  from public.record_learning_observation_atomic(
    'a2200000-0000-4000-8000-000000000002',
    'price_prior_update',
    'plumbing',
    'plumbing-general',
    'q1',
    'small',
    200000,
    400000,
    520000,
    5,
    array['Chuyên nghiệp'],
    false,
    '2026-07-14T02:01:00Z',
    null,
    null
  );

  if v_second.ok is not true
     or v_second.candidate_id <> v_first.candidate_id
     or v_second.evidence_count <> 2 then
    raise exception 'same-scope price observations did not serialize';
  end if;

  select count(*) into v_candidate_count
  from public.learning_candidates
  where candidate_type = 'price_prior_update'
    and affected_service = 'plumbing'
    and affected_problem = 'plumbing-general'
    and affected_district = 'q1'
    and status in ('created', 'pending_evidence');

  if v_candidate_count <> 1 then
    raise exception 'duplicate pending candidate';
  end if;

  select * into v_case
  from public.record_learning_observation_atomic(
    'a2200000-0000-4000-8000-000000000003',
    'analysis_rule',
    'plumbing',
    'plumbing-general',
    'q3',
    'small',
    200000,
    400000,
    450000,
    3,
    array['Giải thích rõ'],
    true,
    '2026-07-14T02:02:00Z',
    null,
    null
  );

  select * into v_case_retry
  from public.record_learning_observation_atomic(
    'a2200000-0000-4000-8000-000000000003',
    'analysis_rule',
    'plumbing',
    'plumbing-general',
    'q3',
    'small',
    200000,
    400000,
    450000,
    3,
    array['Giải thích rõ'],
    true,
    '2026-07-14T02:02:00Z',
    null,
    null
  );

  if v_case.ok is not true
     or v_case.evidence_count <> 1
     or v_case_retry.idempotent is not true
     or v_case_retry.evidence_count <> 1 then
    raise exception 'case review retry was not idempotent';
  end if;

  select * into v_wrong_district
  from public.record_learning_observation_atomic(
    'a2200000-0000-4000-8000-000000000004',
    'price_prior_update',
    'plumbing',
    'plumbing-general',
    'q5',
    'small',
    200000,
    400000,
    450000,
    4,
    array['Sạch sẽ'],
    false,
    '2026-07-14T02:03:00Z',
    null,
    null
  );

  if v_wrong_district.ok is not false
     or v_wrong_district.error_code <> 'SOURCE_MISMATCH'
     or exists (
       select 1
       from public.learning_observation_receipts as receipt
       where receipt.job_id = 'a2200000-0000-4000-8000-000000000004'
         and receipt.candidate_type = 'price_prior_update'
     ) then
    raise exception 'wrong district crossed the reviewed-job source boundary';
  end if;

  select * into v_existing_no_signal
  from public.record_learning_observation_atomic(
    'a2200000-0000-4000-8000-000000000004',
    'analysis_rule',
    'plumbing',
    'plumbing-general',
    'q4',
    'small',
    200000,
    400000,
    450000,
    4,
    array['Sạch sẽ'],
    false,
    '2026-07-14T02:03:00Z',
    null,
    null
  );

  if v_existing_no_signal.ok is not true
     or v_existing_no_signal.evidence_count <> 1
     or (
       select candidate.suggested_payload#>>'{suggested,rationale}'
       from public.learning_candidates as candidate
       where candidate.id = 'a2300000-0000-4000-8000-000000000004'
     ) <> 'placeholder — no clear pattern yet' then
    raise exception 'existing no-signal candidate lost the legacy placeholder behavior';
  end if;

  select * into v_legacy_tags
  from public.record_learning_observation_atomic(
    'a2200000-0000-4000-8000-000000000005',
    'analysis_rule',
    'plumbing',
    'plumbing-general',
    'q5',
    'small',
    200000,
    400000,
    450000,
    4,
    array['Sạch sẽ'],
    false,
    '2026-07-14T02:04:00Z',
    null,
    null
  );

  if v_legacy_tags.ok is not true
     or (
       select candidate.suggested_payload#>'{observed,common_tags}'
       from public.learning_candidates as candidate
       where candidate.id = 'a2300000-0000-4000-8000-000000000005'
     ) ? 'phone:0900000000'
     or (
       select seed.aggregate_payload#>'{observed,common_tags}'
       from private.learning_observation_seeds as seed
       where seed.candidate_id = 'a2300000-0000-4000-8000-000000000005'
     ) ? 'phone:0900000000' then
    raise exception 'legacy free-form review tag crossed the learning boundary';
  end if;

  select * into v_malformed_legacy
  from public.record_learning_observation_atomic(
    'a2200000-0000-4000-8000-000000000006',
    'price_prior_update',
    'plumbing',
    'plumbing-general',
    'q6',
    'small',
    200000,
    400000,
    450000,
    4,
    array['Sạch sẽ'],
    false,
    '2026-07-14T02:05:00Z',
    null,
    null
  );

  if v_malformed_legacy.ok is not false
     or v_malformed_legacy.error_code <> 'LEGACY_PAYLOAD_INVALID'
     or exists (
       select 1
       from public.learning_observation_receipts as receipt
       where receipt.job_id = 'a2200000-0000-4000-8000-000000000006'
     ) then
    raise exception 'malformed legacy aggregate entered the observation ledger';
  end if;

  begin
    insert into public.learning_candidates (
      candidate_type,
      affected_service,
      affected_problem,
      affected_district,
      suggested_payload,
      status
    ) values (
      'price_prior_update',
      'plumbing',
      'plumbing-general',
      'q1',
      '{}'::jsonb,
      'created'
    );
  exception
    when unique_violation then
      v_unique_index_blocked := true;
  end;

  if v_unique_index_blocked is not true then
    raise exception 'partial unique index allowed duplicate pending candidate';
  end if;
end;
$$;

do $$
begin
  if pg_catalog.has_function_privilege(
    'anon',
    'public.record_learning_observation_atomic(uuid, text, public.service_type, text, text, public.complexity_level, numeric, numeric, numeric, integer, text[], boolean, timestamptz, numeric, numeric)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_learning_observation_atomic(uuid, text, public.service_type, text, text, public.complexity_level, numeric, numeric, numeric, integer, text[], boolean, timestamptz, numeric, numeric)',
    'execute'
  ) then
    raise exception 'non-service role can execute learning observation RPC';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as proc
    where proc.oid = 'public.record_learning_observation_atomic(uuid,text,public.service_type,text,text,public.complexity_level,numeric,numeric,numeric,integer,text[],boolean,timestamptz,numeric,numeric)'::pg_catalog.regprocedure
      and proc.prosecdef is true
      and proc.proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'learning observation definer RPC search path is not empty';
  end if;
end;
$$;

select jsonb_build_object(
  'price_retry_idempotent', true,
  'case_retry_idempotent', true,
  'existing_no_signal_preserved', true,
  'job_district_verified', true,
  'legacy_tags_scrubbed', true,
  'same_scope_serialized', true,
  'pending_scope_unique', true,
  'service_role_only', true
) as learning_observations_atomic_verification;

rollback;
