-- @pillar id: P389-backend-system-health-release-promotion-sql
-- @pillar invariant: Backend release promotion is service-role-only, verifies fresh monitor evidence and exact source identity, atomically fences the active release revision, and persists one immutable replay receipt.
-- @pillar authority: governance/critical.md #3 No False Completion | governance/protocols/backend-structure.md §25
-- @pillar target: supabase/migrations/20261014120000_backend_system_health_release.sql
-- @pillar layer: sql
-- @pillar siblings: P354-system-health-cloudflare-observer-d1,P388-mobile-client-contract-compatibility
-- @pillar mutation: Remove the role, source, freshness, CAS, replay, or append-only guard; its corresponding denial or replay assertion must fail.
begin;

do $$
declare
  v_release_id constant text := 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb';
  v_previous_release_id constant text := 'harness-cccccccccccc-dddddddddddd';
  sha constant text := repeat('a', 64);
  client_compatibility jsonb := jsonb_build_object('gitSha', repeat('b',40),
    'releaseId', 'harness-bbbbbbbbbbbb-eeeeeeeeeeee', 'contractEpoch', 2);
  packet jsonb;
  changed jsonb;
  result record;
  snapshot_at timestamptz := clock_timestamp();
  key text;
begin
  if has_function_privilege('anon', 'public.promote_backend_system_health_release_atomic(text,text,bigint,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.promote_backend_system_health_release_atomic(text,text,bigint,jsonb)', 'execute') then
    raise exception 'Backend promotion must deny app roles';
  end if;
  if has_table_privilege('anon', 'public.backend_system_health_release_evidence', 'select')
    or has_table_privilege('authenticated', 'public.backend_system_health_release_evidence', 'select')
    or not has_table_privilege('service_role', 'public.backend_system_health_release_evidence', 'select')
    or has_table_privilege('service_role', 'public.backend_system_health_release_evidence', 'insert')
    or has_table_privilege('service_role', 'public.backend_system_health_release_evidence', 'update')
    or has_table_privilege('service_role', 'public.backend_system_health_release_evidence', 'delete') then
    raise exception 'Backend release evidence table grants do not match the read-only service contract';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.backend_system_health_release_evidence'::regclass) then
    raise exception 'Backend release evidence table must have RLS enabled';
  end if;

  insert into public.harness_releases (
    release_id, environment, git_sha, manifest_sha256, migration_inventory_sha256,
    database_types_sha256, prompt_bundle_sha256, policy_bundle_sha256,
    runtime_configuration_sha256, evaluation_suite_version, evaluation_suite_sha256,
    capability_registry_sha256, access_matrix_sha256, reliability_policy_sha256,
    promotion_policy_sha256, bundle_sha256, edge_function_digests, release_artifact, created_by
  ) values (
    v_previous_release_id, 'production', repeat('c', 40), sha, sha, sha, sha, sha, sha, 'fixture', sha,
    sha, sha, sha, sha, sha, jsonb_build_object('mobile-api', sha, 'kael-matching-maintainer', sha),
    jsonb_build_object('releaseLane', 'verification'), 'rollback-only-sql-test'
  );
  insert into public.harness_releases (
    release_id, environment, git_sha, manifest_sha256, migration_inventory_sha256,
    database_types_sha256, prompt_bundle_sha256, policy_bundle_sha256,
    runtime_configuration_sha256, evaluation_suite_version, evaluation_suite_sha256,
    capability_registry_sha256, access_matrix_sha256, reliability_policy_sha256,
    promotion_policy_sha256, bundle_sha256, edge_function_digests, release_artifact, created_by
  ) values (
    v_release_id, 'production', repeat('a', 40), sha, sha, sha, sha, sha, sha, 'fixture', sha,
    sha, sha, sha, sha, sha, jsonb_build_object('mobile-api', sha, 'kael-matching-maintainer', sha),
    jsonb_build_object('releaseLane', 'backend-system-health', 'transactionCoverage',
      jsonb_build_object('manifestSha256', sha, 'entryCount', 65, 'boundAssertionsRequired', 445),
      'activeClientCompatibility', client_compatibility,
      'backendHostedBaseline', jsonb_build_object('environment', 'production',
        'projectRef', 'iwevizmsedyqozxlawwl', 'registered', true,
        'gitSha', repeat('c',40), 'releaseId', v_previous_release_id,
        'controlActiveReleaseId', v_previous_release_id, 'revision', 7,
        'clientCompatibility', client_compatibility),
      'systemHealthObserver', jsonb_build_object('profileId', 'cloudflare-admin-v1',
        'workerBundleSha256', sha, 'd1MigrationsSha256', sha,
        'edgeFunction', jsonb_build_object('sha256', sha, 'runtimeConfiguration', jsonb_build_object('sha256', sha)))), 'rollback-only-sql-test'
  );
  insert into public.stage1_release_controls(environment, active_release_id, revision)
    values ('production', v_previous_release_id, 7) on conflict (environment) do update
      set active_release_id=excluded.active_release_id, revision=excluded.revision;
  update public.stage1_release_controls set previous_active_release_id=null,
    candidate_release_id=null, candidate_cohort_id=null, candidate_packet_sha256=null,
    candidate_started_at=null where environment='production';

  insert into public.stage1_source_deployment_attestations (
    deployment_id, environment, release_id, function_name, edge_version,
    source_sha256, hosted_bundle_sha256, runtime_configuration_sha256,
    verify_jwt, import_map, entrypoint_path, import_map_path, proof_sha256
  ) values
    ('iwevizmsedyqozxlawwl_11111111-1111-4111-8111-111111111111_2000000000',
      'production', v_release_id, 'mobile-api', 2000000000, sha, sha, sha,
      false, false, 'supabase/functions/mobile-api/index.ts', null, repeat('b',64)),
    ('iwevizmsedyqozxlawwl_22222222-2222-4222-8222-222222222222_2000000000',
      'production', v_release_id, 'kael-matching-maintainer', 2000000000, sha, sha, sha,
      false, false, 'supabase/functions/kael-matching-maintainer/index.ts', null, repeat('c',64));
  delete from public.system_health_snapshots where environment='production';
  insert into public.system_health_snapshots(schema_version, environment, project_ref, release_id,
    scheduled_at, completed_at, expires_at, overall_status, checks, profile_id, required_check_ids, coverage_gaps)
  values(2, 'production', 'iwevizmsedyqozxlawwl', v_release_id, snapshot_at, snapshot_at,
    snapshot_at+interval '180 seconds', 'gray', '[{"check_id":"backend-core","status":"green"},{"check_id":"backend-storage-realtime-io","status":"gray"},{"check_id":"backend-scheduled-workers","status":"gray"},{"check_id":"kael-agentic","status":"gray"},{"check_id":"app-native-connectivity","status":"gray"},{"check_id":"observer-dispatcher","status":"green"}]', 'cloudflare-admin-v1', '["backend-core","backend-storage-realtime-io","backend-scheduled-workers","kael-agentic","app-native-connectivity","observer-dispatcher"]',
    '["app-crash","push-notifications"]');
  insert into public.system_health_observer_state(environment, observer_heartbeat_at, d1_status, last_snapshot_at)
  values('production', snapshot_at, 'green', snapshot_at) on conflict(environment) do update
    set observer_heartbeat_at=excluded.observer_heartbeat_at, d1_status='green', last_snapshot_at=excluded.last_snapshot_at;

  packet := jsonb_build_object(
    'schemaVersion','backend-system-health-promotion/v1', 'environment','production',
    'projectRef','iwevizmsedyqozxlawwl', 'releaseId',v_release_id, 'gitSha',repeat('a',40),
    'bundleSha256',sha, 'packetSha256',sha, 'previous',jsonb_build_object('releaseId',v_previous_release_id,'revision',7),
    'sourceProofs',jsonb_build_object(
      'mobile-api',jsonb_build_object('deploymentId','iwevizmsedyqozxlawwl_11111111-1111-4111-8111-111111111111_2000000000','proofSha256',repeat('b',64)),
      'kael-matching-maintainer',jsonb_build_object('deploymentId','iwevizmsedyqozxlawwl_22222222-2222-4222-8222-222222222222_2000000000','proofSha256',repeat('c',64)),
      'system-monitor',jsonb_build_object('releaseId',v_release_id,'gitSha',repeat('a',40),'profileId','cloudflare-admin-v1',
        'edgeFunctionId','123e4567-e89b-42d3-a456-426614174000','edgeVersion',42,'sourceSha256',sha,
        'runtimeConfigurationSha256',sha,'proofSha256',repeat('d',64))),
    'gates',jsonb_build_object('strictMapping',jsonb_build_object('entries',65,'mapped',65,'partial',0,'unverified',0,'manifestSha256',sha),
      'boundAssertions',jsonb_build_object('required',445,'passed',445,'failed',0),
      'qualityReceiptSha256',sha,'parityReceiptSha256',sha,'expandReceiptSha256',sha,'rollbackReceiptSha256',sha),
    'observer',jsonb_build_object('releaseId',v_release_id,'gitSha',repeat('a',40),'workerBundleSha256',sha,
      'd1MigrationsSha256',sha,'receiptSha256',sha,'completedAt',snapshot_at),
    'readonlyProbe',jsonb_build_object('releaseId',v_release_id,'gitSha',repeat('a',40),'receiptSha256',sha,
      'completedAt',snapshot_at,'inferenceRequests',0), 'generatedAt',snapshot_at);
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin
    perform public.promote_backend_system_health_release_atomic(v_release_id,v_previous_release_id,7,packet);
    raise exception 'Backend promotion accepted authenticated role';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.role','service_role',true);
  foreach key in array array['backend-storage-realtime-io','backend-scheduled-workers','kael-agentic'] loop
    update public.system_health_snapshots s set checks=(
      select jsonb_agg(case
        when x->>'check_id'=key or x->>'check_id'='app-native-connectivity' then jsonb_set(x,'{status}','"gray"'::jsonb)
        else jsonb_set(x,'{status}','"green"'::jsonb)
      end)
      from jsonb_array_elements(s.checks) x
    ) where s.environment='production';
    begin
      perform public.promote_backend_system_health_release_atomic(v_release_id,v_previous_release_id,7,packet);
      raise exception 'Backend promotion accepted gray required backend check %',key;
    exception when check_violation then
      if sqlerrm<>'BACKEND_RELEASE_MONITOR_EVIDENCE_INVALID' then raise; end if;
    end;
  end loop;
  update public.system_health_snapshots s set checks=(
    select jsonb_agg(case when x->>'check_id'='app-native-connectivity'
      then jsonb_set(x,'{status}','"gray"'::jsonb)
      else jsonb_set(x,'{status}','"green"'::jsonb) end)
    from jsonb_array_elements(s.checks) x
  ) where s.environment='production';
  foreach key in array array['partial','unverified'] loop
    changed := jsonb_set(packet,array['gates','strictMapping',key],'1');
    begin
      perform public.promote_backend_system_health_release_atomic(v_release_id,v_previous_release_id,7,changed);
      raise exception 'Backend promotion accepted incomplete strict mapping: %',key;
    exception when check_violation then null; end;
  end loop;
  foreach changed in array array[
    jsonb_set(packet,'{gates,boundAssertions,passed}','444'),
    jsonb_set(packet,'{readonlyProbe,inferenceRequests}','1'),
    jsonb_set(packet,'{observer,completedAt}',to_jsonb(snapshot_at-interval '181 seconds')),
    jsonb_set(packet,'{sourceProofs,mobile-api,proofSha256}',to_jsonb(repeat('d',64))),
    jsonb_set(packet,'{sourceProofs,system-monitor,sourceSha256}',to_jsonb(repeat('e',64))),
    packet||'{"raw_metadata":{"secret":"sentinel"}}'::jsonb
  ] loop
    begin
      perform public.promote_backend_system_health_release_atomic(v_release_id,v_previous_release_id,7,changed);
      raise exception 'Backend promotion accepted invalid evidence';
    exception when check_violation then null; end;
  end loop;
  begin
    perform public.promote_backend_system_health_release_atomic(v_release_id,v_previous_release_id,6,
      jsonb_set(packet,'{previous,revision}','6'));
    raise exception 'Backend promotion accepted stale revision';
  exception when serialization_failure then null; end;

  select * into result from public.promote_backend_system_health_release_atomic(v_release_id,v_previous_release_id,7,packet);
  if result.active_release_id<>v_release_id or result.previous_active_release_id<>v_previous_release_id or result.revision<>8 then raise exception 'Backend promotion CAS failed'; end if;
  select * into result from public.promote_backend_system_health_release_atomic(v_release_id,v_previous_release_id,7,packet);
  if result.revision<>8 or (select count(*) from public.backend_system_health_release_evidence e where e.release_id=v_release_id)<>1
    then raise exception 'Backend promotion replay created a duplicate effect'; end if;
  begin
    perform public.promote_backend_system_health_release_atomic(v_release_id,v_previous_release_id,7,
      jsonb_set(packet,'{packetSha256}',to_jsonb(repeat('e',64))));
    raise exception 'Backend promotion accepted altered replay';
  exception when serialization_failure then null; end;
  begin
    update public.backend_system_health_release_evidence e set packet_sha256=repeat('e',64) where e.release_id=v_release_id;
    raise exception 'Backend promotion evidence was mutable';
  exception when object_not_in_prerequisite_state then null; end;
end;
$$;

rollback;
