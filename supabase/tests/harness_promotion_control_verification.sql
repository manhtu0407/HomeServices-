begin;

DO $$
begin
  if to_regclass('public.harness_promotions') is null then raise exception 'harness_promotions missing'; end if;
  if to_regclass('public.harness_promotion_events') is null then raise exception 'harness_promotion_events missing'; end if;
  if to_regclass('public.harness_kill_switches') is null then raise exception 'harness_kill_switches missing'; end if;
  if to_regclass('public.harness_kill_switch_events') is null then raise exception 'harness_kill_switch_events missing'; end if;
  if to_regclass('public.harness_slo_observations') is null then raise exception 'harness_slo_observations missing'; end if;
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (
        'transition_harness_promotion', 'record_harness_slo_observation',
        'set_harness_kill_switch', 'read_harness_kill_switch'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated') and privilege_type = 'EXECUTE'
  ) then raise exception 'promotion RPC exposed beyond service_role'; end if;
end;
$$;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000399', 'authenticated', 'authenticated',
  'harness-promotion-admin@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
) on conflict (id) do nothing;

update public.profiles set role = 'admin'::public.user_role
where id = '00000000-0000-4000-8000-000000000399';

DO $$
declare
  v_release constant text := 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb';
  v_rollback constant text := 'harness-111111111111-222222222222';
  v_incompatible constant text := 'harness-333333333333-444444444444';
  v_admin constant uuid := '00000000-0000-4000-8000-000000000399';
  v_result record;
  v_observation uuid;
begin
  insert into public.harness_releases (
    release_id, environment, git_sha, manifest_sha256, migration_inventory_sha256,
    database_types_sha256, prompt_bundle_sha256, policy_bundle_sha256,
    evaluation_suite_version, evaluation_suite_sha256, capability_registry_sha256,
    access_matrix_sha256, reliability_policy_sha256, promotion_policy_sha256, bundle_sha256,
    edge_function_digests, created_by
  ) values
  (
    v_release, 'staging', repeat('a',40), repeat('b',64), repeat('c',64),
    repeat('d',64), repeat('e',64), repeat('f',64), 'harness-eval.1.0.0',
    repeat('1',64), repeat('2',64), repeat('3',64), repeat('4',64), repeat('5',64),
    repeat('6',64), jsonb_build_object('mobile-api', repeat('7',64)), 'sql-test'
  ),
  (
    v_rollback, 'staging', repeat('1',40), repeat('8',64), repeat('c',64),
    repeat('d',64), repeat('9',64), repeat('a',64), 'harness-eval.1.0.0',
    repeat('b',64), repeat('c',64), repeat('d',64), repeat('e',64), repeat('f',64),
    repeat('1',64), jsonb_build_object('mobile-api', repeat('2',64)), 'sql-test'
  ),
  (
    v_incompatible, 'staging', repeat('3',40), repeat('4',64), repeat('5',64),
    repeat('6',64), repeat('7',64), repeat('8',64), 'harness-eval.1.0.0',
    repeat('9',64), repeat('a',64), repeat('b',64), repeat('c',64), repeat('d',64),
    repeat('e',64), jsonb_build_object('mobile-api', repeat('f',64)), 'sql-test'
  ) on conflict do nothing;

  insert into public.harness_evaluation_runs (
    evaluation_id, release_id, git_sha, evidence_class, evaluator_id, evaluator_kind,
    evaluator_version, prompt_bundle_sha256, policy_bundle_sha256, status, sample_count
  ) values (
    '00000000-0000-4000-8000-000000000301'::uuid, v_release, repeat('a',40),
    'deterministic', 'kael-deterministic-v1', 'deterministic', '1.0.0',
    repeat('e',64), repeat('f',64), 'passed', 1
  ) on conflict do nothing;

  select * into v_result from public.transition_harness_promotion(
    v_release, 'staging', 'assembled', 'verified', repeat('2',64),
    '00000000-0000-4000-8000-000000000301'::uuid, null, null, null, null, '{}'::jsonb
  );
  if not v_result.ok or v_result.state <> 'verified' then raise exception 'system verified transition failed'; end if;

  select * into v_result from public.transition_harness_promotion(
    v_release, 'staging', 'verified', 'staging', repeat('3',64),
    null, null, null, null, null, '{}'::jsonb
  );
  if v_result.ok or v_result.error_code <> 'HUMAN_APPROVAL_REQUIRED' then
    raise exception 'remote promotion without approval was not denied';
  end if;

  select * into v_result from public.transition_harness_promotion(
    v_release, 'staging', 'verified', 'staging', repeat('3',64),
    null, null, 'approval-1', v_admin, null, '{}'::jsonb
  );
  if not v_result.ok then raise exception 'approved staging transition failed'; end if;

  select * into v_result from public.transition_harness_promotion(
    v_release, 'staging', 'staging', 'shadow', repeat('4',64),
    null, null, 'approval-2', v_admin, null, '{}'::jsonb
  );
  if not v_result.ok then raise exception 'shadow transition failed'; end if;

  select * into v_result from public.transition_harness_promotion(
    v_release, 'staging', 'shadow', 'canary', repeat('5',64),
    null, v_incompatible, 'approval-3', v_admin, null,
    '{"cohort":"internal","observation_window_minutes":30}'::jsonb
  );
  if v_result.ok or v_result.error_code <> 'ROLLBACK_RELEASE_INCOMPATIBLE' then
    raise exception 'incompatible rollback release was not denied';
  end if;

  select * into v_result from public.transition_harness_promotion(
    v_release, 'staging', 'shadow', 'canary', repeat('6',64),
    null, v_rollback, 'approval-4', v_admin, null,
    '{"cohort":"internal","observation_window_minutes":30}'::jsonb
  );
  if not v_result.ok or v_result.state <> 'canary' then raise exception 'canary transition failed'; end if;

  v_observation := public.record_harness_slo_observation(
    'mobile-api-availability', v_release, 'staging', now() - interval '10 minutes', now(), 1, '{}'::jsonb
  );
  perform public.record_harness_slo_observation(
    'kael-confirmation-integrity', v_release, 'staging', now() - interval '10 minutes', now(), 1, '{}'::jsonb
  );
  perform public.record_harness_slo_observation(
    'provider-cost-reconciliation', v_release, 'staging', now() - interval '10 minutes', now(), 1, '{}'::jsonb
  );
  perform public.record_harness_slo_observation(
    'promotion-drift-free', v_release, 'staging', now() - interval '10 minutes', now(), 1, '{}'::jsonb
  );
  if v_observation is null then raise exception 'SLO observation was not recorded'; end if;

  select * into v_result from public.transition_harness_promotion(
    v_release, 'staging', 'canary', 'production', repeat('7',64),
    null, v_rollback, 'approval-5', v_admin, null, '{}'::jsonb
  );
  if not v_result.ok or v_result.state <> 'production' then raise exception 'production transition failed'; end if;

  if not public.set_harness_kill_switch(
    'staging', 'global_ai', true, 'CANARY_ABORT', v_release, v_admin, '{"incident_id":"incident-1"}'::jsonb
  ) then raise exception 'kill switch update failed'; end if;
  select * into v_result from public.read_harness_kill_switch('staging', 'global_ai');
  if not v_result.enabled then raise exception 'kill switch did not become enabled'; end if;
  if not exists (
    select 1 from public.harness_kill_switch_events
    where environment = 'staging' and switch_id = 'global_ai'
      and not previous_enabled and enabled and actor_id = v_admin
  ) then raise exception 'kill switch transition was not audited'; end if;

  if not exists (
    select 1 from public.harness_promotion_events
    where release_id = v_release and evidence_sha256 is not null
  ) then raise exception 'promotion event lacks packet evidence hash'; end if;
end;
$$;

rollback;
