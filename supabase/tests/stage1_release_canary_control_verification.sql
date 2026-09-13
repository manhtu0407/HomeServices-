begin;

DO $$
begin
  if to_regclass('public.stage1_release_controls') is null then
    raise exception 'stage1_release_controls missing';
  end if;
  if to_regclass('public.stage1_synthetic_smoke_receipts') is null then
    raise exception 'stage1_synthetic_smoke_receipts missing';
  end if;
  if to_regclass('public.stage1_release_control_events') is null then
    raise exception 'stage1_release_control_events missing';
  end if;
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (
        'configure_stage1_release_canary', 'resolve_stage1_release_lane',
        'record_stage1_synthetic_smoke', 'promote_stage1_release_atomic',
        'record_stage1_attested_synthetic_smoke', 'promote_stage1_release_attested_atomic',
        'abort_stage1_release_canary', 'reconcile_stale_stage1_release_canary',
        'rollback_stage1_active_release_atomic'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type = 'EXECUTE'
  ) then
    raise exception 'Stage-1 release control RPC exposed beyond service_role';
  end if;
end;
$$;

DO $$
declare
  v_release constant text := 'harness-555555555555-666666666666';
  v_cohort constant text := 'synthetic-stage1-555555555555-666666666666-sql';
  v_packet constant text := repeat('7', 64);
  v_control record;
  v_promoted record;
  v_receipt uuid;
  v_sequence smallint;
  v_rolled_back record;
  v_generated_at constant text := '2026-08-23T00:00:00.000Z';
  v_sha text;
  v_mobile_deployment constant text := 'xyylanuyflrjzbjzhqfl_10000000-0000-4000-8000-000000000057_7';
  v_maintainer_deployment constant text := 'xyylanuyflrjzbjzhqfl_10000000-0000-4000-8000-000000000058_8';
  v_mobile_source_proof constant text := repeat('f', 64);
  v_maintainer_source_proof constant text := repeat('0', 64);
begin
  insert into public.harness_releases (
    release_id, environment, git_sha, manifest_sha256, migration_inventory_sha256,
    database_types_sha256, prompt_bundle_sha256, policy_bundle_sha256,
    runtime_configuration_sha256, evaluation_suite_version, evaluation_suite_sha256,
    capability_registry_sha256, access_matrix_sha256, reliability_policy_sha256,
    promotion_policy_sha256, bundle_sha256, edge_function_digests,
    release_artifact, created_by
  ) values (
    v_release, 'staging', repeat('5', 40), repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64), repeat('5', 64), repeat('6', 64),
    'harness-eval.1.0.0', repeat('7', 64), repeat('8', 64), repeat('9', 64),
    repeat('a', 64), repeat('b', 64), repeat('c', 64),
    jsonb_build_object(
      'mobile-api', repeat('d', 64),
      'kael-matching-maintainer', repeat('1', 64)
    ),
    jsonb_build_object(
      'edgeRuntimeConfigurations', jsonb_build_object(
        'mobile-api', jsonb_build_object(
          'sha256', repeat('e', 64),
          'verifyJwt', false,
          'importMap', true
        ),
        'kael-matching-maintainer', jsonb_build_object(
          'sha256', repeat('2', 64),
          'verifyJwt', false,
          'importMap', true
        )
      )
    ),
    'sql-test'
  ) on conflict do nothing;

  -- Isolate the deterministic revision assertions from any hosted canary that
  -- already exists. The outer transaction restores the real control row.
  insert into public.stage1_release_controls(environment)
  values ('staging')
  on conflict (environment) do nothing;

  update public.stage1_release_controls
  set active_release_id = null,
      previous_active_release_id = null,
      candidate_release_id = null,
      candidate_cohort_id = null,
      candidate_packet_sha256 = null,
      candidate_started_at = null,
      revision = 0,
      updated_at = now()
  where environment = 'staging';

  select * into v_control from public.configure_stage1_release_canary(
    'staging', v_release, v_cohort, null, v_packet
  );
  if v_control.revision <> 1 or v_control.candidate_release_id <> v_release then
    raise exception 'Stage-1 canary was not configured';
  end if;

  select * into v_control from public.configure_stage1_release_canary(
    'staging', v_release, v_cohort, null, v_packet
  );
  if v_control.revision <> 1 then
    raise exception 'Stage-1 canary retry was not idempotent';
  end if;

  perform public.attest_stage1_source_deployment(
    'staging', v_release, 'mobile-api', v_mobile_deployment, 7,
    repeat('d', 64), repeat('a', 64), repeat('e', 64),
    false, true, 'index.ts', 'deno.json', v_mobile_source_proof
  );
  perform public.attest_stage1_source_deployment(
    'staging', v_release, 'kael-matching-maintainer', v_maintainer_deployment, 8,
    repeat('1', 64), repeat('b', 64), repeat('2', 64),
    false, true, 'index.ts', 'deno.json', v_maintainer_source_proof
  );

  if has_function_privilege(
      'authenticated',
      'public.attest_stage1_source_deployment(text,text,text,text,integer,text,text,text,boolean,boolean,text,text,text)',
      'EXECUTE'
    ) or has_function_privilege(
      'authenticated',
      'public.resolve_stage1_release_lane_attested(text,text,uuid,text)',
      'EXECUTE'
    ) or not has_function_privilege(
      'service_role',
      'public.attest_stage1_source_deployment(text,text,text,text,integer,text,text,text,boolean,boolean,text,text,text)',
      'EXECUTE'
    ) or not has_function_privilege(
      'service_role',
      'public.resolve_stage1_release_lane_attested(text,text,uuid,text)',
      'EXECUTE'
    ) or has_table_privilege(
      'service_role', 'public.stage1_source_deployment_attestations', 'INSERT'
    ) or has_table_privilege(
      'service_role', 'public.stage1_source_deployment_attestations', 'UPDATE'
    ) or has_table_privilege(
      'service_role', 'public.stage1_source_deployment_attestations', 'DELETE'
    )
  then raise exception 'source attestation is not function-only and service-role-only'; end if;

  begin
    update public.stage1_source_deployment_attestations
    set source_sha256 = repeat('0', 64)
    where deployment_id = v_mobile_deployment;
    raise exception 'source attestation accepted an update';
  exception when object_not_in_prerequisite_state then
    null;
  end;
  begin
    delete from public.stage1_source_deployment_attestations
    where deployment_id = v_mobile_deployment;
    raise exception 'source attestation accepted a delete';
  exception when object_not_in_prerequisite_state then
    null;
  end;
  begin
    perform public.attest_stage1_source_deployment(
      'staging', v_release, 'mobile-api',
      'xyylanuyflrjzbjzhqfl_10000000-0000-4000-8000-000000000059_9', 9,
      repeat('0', 64), repeat('a', 64), repeat('e', 64),
      false, true, 'index.ts', 'deno.json', repeat('9', 64)
    );
    raise exception 'source attestation accepted bytes outside the immutable release';
  exception when check_violation then
    null;
  end;
  if public.resolve_stage1_release_lane_attested(
      'staging', v_release, '10000000-0000-4000-8000-000000000055',
      'xyylanuyflrjzbjzhqfl_10000000-0000-4000-8000-000000000059_9'
    ) <> 'previous'
  then raise exception 'unattested deployment entered the candidate lane'; end if;

  if has_function_privilege(
    'service_role',
    'public.record_stage1_synthetic_smoke(text,text,text,text,smallint,boolean,boolean,boolean,boolean,boolean,integer,integer,integer,numeric,integer,integer,integer,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.promote_stage1_release_atomic(text,text,text,bigint,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.resolve_stage1_release_lane(text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'unattested Stage-1 release RPC remains executable';
  end if;

  begin
    perform public.record_stage1_attested_synthetic_smoke(
      v_release, 'staging', v_cohort, 'sql-bad', 1::smallint,
      true, true, true, true, true,
      1, 0, 0, 1::numeric, 100, 200, 1, v_generated_at, repeat('e', 64),
      v_mobile_deployment, v_mobile_source_proof,
      v_maintainer_deployment, v_maintainer_source_proof
    );
    raise exception 'leaking synthetic smoke was accepted';
  exception when check_violation then
    null;
  end;

  begin
    perform public.record_stage1_attested_synthetic_smoke(
      v_release, 'staging', v_cohort, 'sql-tampered', 1::smallint,
      true, true, true, true, true,
      0, 0, 0, 1::numeric, 100, 200, 1, v_generated_at, repeat('e', 64),
      v_mobile_deployment, v_mobile_source_proof,
      v_maintainer_deployment, v_maintainer_source_proof
    );
    raise exception 'tampered synthetic smoke checksum was accepted';
  exception when check_violation then
    null;
  end;

  for v_sequence in 1..3 loop
    -- Control-plane fixtures only; P69 exercises terminal execution separately from these rows.
    insert into public.stage1_synthetic_transaction_proofs(
      request_id, release_id, environment, cohort_id, run_id, sequence, scenario_kind,
      job_fingerprint_sha256, terminal_state_sha256, reached_status,
      fulfillment_passed, completion_passed, payment_passed, review_passed, generated_at
    )
    select gen_random_uuid(), v_release, 'staging', v_cohort, 'sql-run', v_sequence, scenario,
      encode(extensions.digest(v_release || ':' || v_sequence || ':' || scenario, 'sha256'), 'hex'),
      encode(extensions.digest(v_release || ':terminal:' || v_sequence || ':' || scenario, 'sha256'), 'hex'),
      'reviewed'::public.job_status, true, true, true, true, v_generated_at::timestamptz
    from unnest(array['auto_quote', 'rfq_or_inspection']) as scenario;
    v_sha := encode(extensions.digest(convert_to(concat_ws(E'\n',
      '1.0.0', v_release, 'staging', v_cohort, 'sql-run',
      v_sequence::text, 'true', 'true', 'true', 'true', 'true',
      '0', '0', '0', '1', '100', '200', '1', v_generated_at
    ), 'UTF8'), 'sha256'), 'hex');
    v_receipt := public.record_stage1_attested_synthetic_smoke(
      v_release, 'staging', v_cohort, 'sql-run', v_sequence::smallint,
      true, true, true, true, true,
      0, 0, 0, 1::numeric, 100, 200, 1, v_generated_at, v_sha,
      v_mobile_deployment, v_mobile_source_proof,
      v_maintainer_deployment, v_maintainer_source_proof
    );
    if v_receipt is null then raise exception 'smoke receipt missing'; end if;
  end loop;

  select * into v_promoted from public.promote_stage1_release_attested_atomic(
    'staging', v_release, v_cohort, v_control.revision, v_packet,
    v_mobile_deployment, v_mobile_source_proof,
    v_maintainer_deployment, v_maintainer_source_proof
  );
  if v_promoted.active_release_id <> v_release or v_promoted.revision <> 2 then
    raise exception 'Stage-1 release was not promoted atomically';
  end if;
  if public.resolve_stage1_release_lane_attested(
    'staging', v_release, '10000000-0000-4000-8000-000000000055',
    v_mobile_deployment
  ) <> 'active' then
    raise exception 'active release did not resolve to active lane';
  end if;
  if not exists (
    select 1 from public.stage1_release_control_events event
    where event.release_id = v_release and event.event_type = 'promoted'
  ) then
    raise exception 'promotion event was not recorded';
  end if;

  select * into v_rolled_back from public.rollback_stage1_active_release_atomic(
    'staging', v_release, null, v_promoted.revision, repeat('f', 64)
  );
  if v_rolled_back.active_release_id is not null or v_rolled_back.revision <> 3 then
    raise exception 'ambiguous promotion was not rolled back atomically';
  end if;
  select * into v_rolled_back from public.rollback_stage1_active_release_atomic(
    'staging', v_release, null, v_promoted.revision, repeat('f', 64)
  );
  if v_rolled_back.active_release_id is not null or v_rolled_back.revision <> 3 then
    raise exception 'active-release rollback retry was not idempotent';
  end if;
  if not exists (
    select 1 from public.stage1_release_control_events event
    where event.release_id = v_release and event.event_type = 'rolled_back'
  ) then
    raise exception 'active-release rollback event was not recorded';
  end if;

  select * into v_control from public.configure_stage1_release_canary(
    'staging', v_release, v_cohort, null, v_packet
  );
  update public.stage1_release_controls
    set candidate_started_at = now() - interval '3 hours'
    where environment = 'staging';
  if not public.reconcile_stale_stage1_release_canary(
    'staging', v_release, v_control.revision, repeat('d', 64)
  ) then
    raise exception 'stale candidate was not reconciled';
  end if;
  if exists (select 1 from public.stage1_release_controls
      where environment = 'staging' and candidate_release_id is not null)
    or not exists (select 1 from public.stage1_release_control_events
      where release_id = v_release and event_type = 'aborted'
        and safe_metadata ->> 'reason' = 'stale_candidate_timeout')
  then
    raise exception 'stale candidate reconciliation evidence is incomplete';
  end if;

  begin
    update public.stage1_synthetic_smoke_receipts
    set run_id = 'tampered'
    where release_id = v_release and sequence = 1;
    raise exception 'append-only smoke receipt accepted an update';
  exception when object_not_in_prerequisite_state then
    null;
  end;
end;
$$;

rollback;
