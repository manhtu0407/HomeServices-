begin;

do $$
declare
  v_candidate_id constant uuid := 'a4100000-0000-4000-8000-000000000001';
  v_invalid_candidate_id constant uuid := 'a4100000-0000-4000-8000-000000000002';
  v_result record;
  v_status text;
begin
  insert into public.learning_candidates (
    id,
    candidate_type,
    affected_service,
    affected_problem,
    affected_district,
    suggested_payload,
    confidence,
    evidence_count,
    status
  ) values (
    v_candidate_id,
    'price_prior_update',
    'hvac',
    'air-conditioner-not-cooling',
    'q7',
    '{
      "candidate_type":"price_prior_update",
      "scope":{
        "service_type":"hvac",
        "problem_slug":"air-conditioner-not-cooling",
        "district_code":"q7",
        "complexity":"medium"
      },
      "observed":{"sample_size":5},
      "suggested":{
        "new_min":350000,
        "new_max":650000,
        "direction":"underestimate"
      },
      "window":{"from_ts":"2026-07-01T00:00:00Z","to_ts":"2026-07-14T00:00:00Z"}
    }'::jsonb,
    0.8,
    5,
    'pending_evidence'
  );

  select * into v_result
  from public.auto_promote_learning_candidate_atomic(v_candidate_id);

  if v_result.ok is not false
     or v_result.error_code <> 'MANUAL_REVIEW_REQUIRED'
     or v_result.rule_id is not null
     or v_result.rule_version is not null
     or v_result.status <> 'manual_review' then
    raise exception 'automatic promotion was not held for manual review';
  end if;

  select status::text into v_status
  from public.learning_candidates
  where id = v_candidate_id;
  if v_status <> 'manual_review' then
    raise exception 'automatic promotion did not persist manual_review status';
  end if;

  select * into v_result
  from public.auto_promote_learning_candidate_atomic(v_candidate_id);
  if v_result.ok is not false
     or v_result.error_code <> 'MANUAL_REVIEW_REQUIRED'
     or v_result.status <> 'manual_review' then
    raise exception 'manual-review retry was not deterministic';
  end if;

  insert into public.learning_candidates (
    id,
    candidate_type,
    affected_service,
    affected_problem,
    affected_district,
    suggested_payload,
    confidence,
    evidence_count,
    status
  ) values (
    v_invalid_candidate_id,
    'analysis_rule',
    'handyman',
    'minor-installation',
    'q1',
    '{
      "candidate_type":"analysis_rule",
      "scope":{
        "service_type":"handyman",
        "problem_slug":"minor-installation",
        "district_code":"q1"
      },
      "observed":{"sample_size":5},
      "suggested":{"kind":"auto_book_worker"}
    }'::jsonb,
    0.9,
    5,
    'pending_evidence'
  );

  select * into v_result
  from public.auto_promote_learning_candidate_atomic(v_invalid_candidate_id);
  if v_result.ok is not false
     or v_result.error_code <> 'MANUAL_REVIEW_REQUIRED'
     or v_result.status <> 'manual_review' then
    raise exception 'unsafe analysis autonomy was not held for manual review';
  end if;

  if exists (
    select 1
    from public.learning_rule_versions
    where change_reason like 'auto_promote_learning_candidate_atomic:%'
  ) then
    raise exception 'automatic promotion wrote a learning rule version';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.auto_promote_learning_candidate_atomic(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated retained execute on auto-promotion RPC';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as proc
    where proc.oid = 'public.auto_promote_learning_candidate_atomic(uuid)'::pg_catalog.regprocedure
      and proc.prosecdef is true
      and proc.proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'auto-promotion definer RPC search path is not empty';
  end if;
end $$;

select jsonb_build_object(
  'automatic_promotion_disabled', true,
  'manual_review_required', true,
  'retry_deterministic', true,
  'no_rule_version_written', true,
  'service_role_only', true
) as learning_autopromotion_atomic_verification;

rollback;
