begin;

DO $$
begin
  if to_regclass('public.harness_evaluation_runs') is null then
    raise exception 'harness_evaluation_runs missing';
  end if;
  if to_regclass('public.harness_evaluation_samples') is null then
    raise exception 'harness_evaluation_samples missing';
  end if;
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('begin_harness_evaluation', 'append_harness_evaluation_sample', 'finish_harness_evaluation')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type = 'EXECUTE'
  ) then
    raise exception 'evaluation write RPC exposed beyond service_role';
  end if;
end;
$$;

insert into public.harness_releases (
  release_id, environment, git_sha, manifest_sha256, migration_inventory_sha256,
  database_types_sha256, prompt_bundle_sha256, policy_bundle_sha256, runtime_configuration_sha256,
  evaluation_suite_version, evaluation_suite_sha256, capability_registry_sha256,
  access_matrix_sha256, reliability_policy_sha256, promotion_policy_sha256, bundle_sha256,
  edge_function_digests, release_artifact, created_by
) values (
  'harness-0123456789ab-fedcba987654', 'local', repeat('a', 40), repeat('b', 64), repeat('c', 64),
  repeat('d', 64), repeat('e', 64), repeat('f', 64), repeat('0', 64), 'harness-eval.1.0.0',
  repeat('1', 64), repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('5', 64),
  repeat('6', 64), jsonb_build_object('mobile-api', repeat('7', 64)), '{}'::jsonb, 'sql-test'
) on conflict do nothing;

DO $$
begin
  begin
    perform public.begin_harness_evaluation(
      '00000000-0000-4000-8000-000000000200'::uuid,
      'harness-0123456789ab-fedcba987654',
      repeat('b', 40),
      'deterministic',
      'kael-deterministic-v1',
      'deterministic',
      '1.0.0',
      repeat('e', 64),
      repeat('f', 64),
      '{}'::jsonb
    );
    raise exception 'expected release/git SHA mismatch to be rejected';
  exception when sqlstate '22023' then
    if SQLERRM <> 'HARNESS_RELEASE_GIT_SHA_MISMATCH' then raise; end if;
  end;
end;
$$;

select public.begin_harness_evaluation(
  '00000000-0000-4000-8000-000000000201'::uuid,
  'harness-0123456789ab-fedcba987654',
  repeat('a', 40),
  'deterministic',
  'kael-deterministic-v1',
  'deterministic',
  '1.0.0',
  repeat('e', 64),
  repeat('f', 64),
  '{}'::jsonb
);

select public.append_harness_evaluation_sample(
  '00000000-0000-4000-8000-000000000202'::uuid,
  '00000000-0000-4000-8000-000000000201'::uuid,
  'fixture-1',
  'safety',
  1,
  true,
  null,
  null,
  null,
  true,
  false,
  false,
  false,
  5,
  0,
  null,
  '{}'::jsonb
);

DO $$
declare
  v_duplicate_id uuid;
begin
  select public.append_harness_evaluation_sample(
    '00000000-0000-4000-8000-000000000202'::uuid,
    '00000000-0000-4000-8000-000000000201'::uuid,
    'fixture-1',
    'safety',
    1,
    true,
    null,
    null,
    null,
    true,
    false,
    false,
    false,
    5,
    0,
    null,
    '{}'::jsonb
  ) into v_duplicate_id;
  if v_duplicate_id is not null then
    raise exception 'duplicate evaluation sample was reported as inserted';
  end if;

  begin
    perform public.finish_harness_evaluation(
      '00000000-0000-4000-8000-000000000201'::uuid,
      'running',
      1,
      '{}'::jsonb,
      '{}'::jsonb,
      repeat('a', 64),
      '{}'::jsonb
    );
    raise exception 'expected non-terminal evaluation status to be rejected';
  exception when sqlstate '22023' then
    if SQLERRM <> 'HARNESS_EVALUATION_TERMINAL_STATUS_REQUIRED' then raise; end if;
  end;

  begin
    perform public.finish_harness_evaluation(
      '00000000-0000-4000-8000-000000000201'::uuid,
      'passed',
      2,
      '{}'::jsonb,
      '{}'::jsonb,
      repeat('a', 64),
      '{}'::jsonb
    );
    raise exception 'expected mismatched evaluation sample count to be rejected';
  exception when sqlstate '22023' then
    if SQLERRM <> 'HARNESS_EVALUATION_SAMPLE_COUNT_MISMATCH' then raise; end if;
  end;
end;
$$;

select public.finish_harness_evaluation(
  '00000000-0000-4000-8000-000000000201'::uuid,
  'passed',
  1,
  '{"critical_safety_failures":0}'::jsonb,
  '{}'::jsonb,
  repeat('a', 64),
  '{}'::jsonb
);

DO $$
begin
  begin
    perform public.append_harness_evaluation_sample(
      '00000000-0000-4000-8000-000000000203'::uuid,
      '00000000-0000-4000-8000-000000000201'::uuid,
      'fixture-after-finish',
      'safety',
      1,
      true,
      null,
      null,
      null,
      true,
      false,
      false,
      false,
      5,
      0,
      null,
      '{}'::jsonb
    );
    raise exception 'expected evaluation append after finish to be rejected';
  exception when sqlstate '22023' then
    if SQLERRM <> 'HARNESS_EVALUATION_NOT_RUNNING' then raise; end if;
  end;
end;
$$;

DO $$
begin
  if not exists (
    select 1 from public.harness_evaluation_runs
    where evaluation_id = '00000000-0000-4000-8000-000000000201'::uuid
      and status = 'passed' and sample_count = 1
  ) then
    raise exception 'evaluation run did not finalize';
  end if;
  if not exists (
    select 1 from public.harness_evaluation_samples
    where evaluation_id = '00000000-0000-4000-8000-000000000201'::uuid
      and case_id = 'fixture-1'
  ) then
    raise exception 'evaluation sample missing';
  end if;
end;
$$;

rollback;
