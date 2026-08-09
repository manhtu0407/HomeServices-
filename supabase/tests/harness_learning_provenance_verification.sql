begin;

DO $$
begin
  if to_regclass('public.learning_candidate_provenance') is null then
    raise exception 'learning_candidate_provenance missing';
  end if;
  if to_regclass('public.learning_rule_dependencies') is null then
    raise exception 'learning_rule_dependencies missing';
  end if;
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('queue_learning_candidate_manual_review', 'revoke_learning_rule_with_provenance')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type = 'EXECUTE'
  ) then
    raise exception 'learning provenance RPC exposed beyond service_role';
  end if;
end;
$$;

insert into public.learning_candidates (
  id, candidate_type, suggested_payload, confidence, evidence_count, status
) values (
  '00000000-0000-4000-8000-000000000301'::uuid,
  'analysis_rule',
  '{"candidate_type":"analysis_rule","scope":{"service_type":"electrical","problem_slug":"fixture","district_code":"q1"},"observed":{"sample_size":5,"scope_change_rate":0},"suggested":{"kind":"add_advisory","advisory_template_id":"fixture","rationale":"fixture"}}'::jsonb,
  0.9,
  5,
  'evidence_gate_passed'::public.learning_candidate_status
) on conflict do nothing;

select * from public.queue_learning_candidate_manual_review(
  '00000000-0000-4000-8000-000000000301'::uuid,
  repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
  'harness-test', '{}'::jsonb
);

DO $$
declare
  v_status text;
  v_auto record;
  v_provenance public.learning_candidate_provenance%rowtype;
  v_invalid record;
begin
  select status::text into v_status from public.learning_candidates
  where id = '00000000-0000-4000-8000-000000000301'::uuid;
  if v_status <> 'manual_review' then
    raise exception 'candidate was not queued for manual review: %', v_status;
  end if;
  select * into v_auto from public.auto_promote_learning_candidate_atomic(
    '00000000-0000-4000-8000-000000000301'::uuid
  );
  if v_auto.ok or v_auto.error_code <> 'MANUAL_REVIEW_REQUIRED' then
    raise exception 'automatic promotion was not disabled';
  end if;
  select * into v_provenance
  from public.learning_candidate_provenance
  where candidate_id = '00000000-0000-4000-8000-000000000301'::uuid;
  if not found or v_provenance.source_hash <> repeat('a', 64) then
    raise exception 'candidate provenance missing';
  end if;
  if v_provenance.consent_status <> 'admin_review_required'
     or v_provenance.privacy_status <> 'pending_review'
     or v_provenance.dispute_status <> 'pending_review' then
    raise exception 'unreviewed batch evidence was treated as reusable provenance';
  end if;

  select * into v_invalid from public.queue_learning_candidate_manual_review(
    '00000000-0000-4000-8000-000000000301'::uuid,
    repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
    'harness-test', '[]'::jsonb
  );
  if v_invalid.ok or v_invalid.error_code <> 'INVALID_PROVENANCE' then
    raise exception 'non-object provenance metadata was accepted';
  end if;
end;
$$;

insert into public.learning_candidates (
  id, candidate_type, suggested_payload, confidence, evidence_count, status
) values (
  '00000000-0000-4000-8000-000000000302'::uuid,
  'analysis_rule',
  '{"candidate_type":"analysis_rule","scope":{"service_type":"electrical","problem_slug":"fixture","district_code":"q1"},"observed":{"sample_size":5,"scope_change_rate":0},"suggested":{"kind":"add_advisory","advisory_template_id":"fixture","rationale":"fixture"}}'::jsonb,
  0.9,
  5,
  'auto_promoted'::public.learning_candidate_status
) on conflict do nothing;

DO $$
declare
  v_queue record;
  v_status text;
begin
  select * into v_queue from public.queue_learning_candidate_manual_review(
    '00000000-0000-4000-8000-000000000302'::uuid,
    repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
    'harness-test', '{}'::jsonb
  );
  if v_queue.ok
     or v_queue.error_code <> 'CANDIDATE_NOT_REVIEWABLE'
     or v_queue.status <> 'auto_promoted' then
    raise exception 'an approved candidate was accepted for manual review';
  end if;

  select status::text into v_status from public.learning_candidates
  where id = '00000000-0000-4000-8000-000000000302'::uuid;
  if v_status <> 'auto_promoted' then
    raise exception 'manual review rewound an approved candidate: %', v_status;
  end if;
  if exists (
    select 1 from public.learning_candidate_provenance
    where candidate_id = '00000000-0000-4000-8000-000000000302'::uuid
  ) then
    raise exception 'manual review wrote provenance for an approved candidate';
  end if;
  if exists (
    select 1 from public.kael_rule_lifecycle_log
    where candidate_id = '00000000-0000-4000-8000-000000000302'::uuid
  ) then
    raise exception 'manual review wrote lifecycle evidence for an approved candidate';
  end if;
end;
$$;

rollback;
