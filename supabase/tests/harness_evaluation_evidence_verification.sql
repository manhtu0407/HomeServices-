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
  database_types_sha256, prompt_bundle_sha256, policy_bundle_sha256,
  evaluation_suite_version, evaluation_suite_sha256, capability_registry_sha256,
  access_matrix_sha256, reliability_policy_sha256, promotion_policy_sha256, bundle_sha256,
  edge_function_digests, created_by
) values (
  'harness-0123456789ab-fedcba987654', 'local', repeat('a', 40), repeat('b', 64), repeat('c', 64),
  repeat('d', 64), repeat('e', 64), repeat('f', 64), 'harness-eval.1.0.0',
  repeat('1', 64), repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('5', 64),
  repeat('6', 64), jsonb_build_object('mobile-api', repeat('7', 64)), 'sql-test'
) on conflict do nothing;

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
