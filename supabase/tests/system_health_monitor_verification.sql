-- @pillar id: P352-system-health-monitor-sql
-- @pillar invariant: Monitor writes are service-only, mobile observations are limited across caller-chosen sessions for one hashed actor, manual refreshes are limited to once per minute, Cron guards its request until required secrets exist, rollback can stop the minute schedule without deleting evidence, Cloudflare snapshots require complete evidence, and retention only prunes monitor-owned rows.
-- @pillar authority: user-approved System Health Monitoring implementation plan | governance/RULES.md #8 (retain diagnostic failure evidence and never expose private data)
-- @pillar target: supabase/migrations/20261011100000_system_health_monitor.sql
-- @pillar layer: sql
-- @pillar siblings: P351-system-health-monitor-contract, P18-capability-registry-parity
-- @pillar mutation: Remove the Cron request secret guard, rollback-only schedule stop, lease conflict predicate, manual refresh cooldown, actor-level mobile observation limit, required-check gray normalization, or seven-day actor limiter cleanup; permit client table reads or resolve incidents on gray evidence; the assertions below raise.

begin;
set local statement_timeout = '60s';

do $$
declare
  v_bucket timestamptz := date_trunc('minute', clock_timestamp()) - interval '1 minute';
  v_owner uuid := 'e3520000-0000-4000-8000-000000000001';
  v_snapshot jsonb;
  v_snapshot_old jsonb;
  v_first boolean;
  v_second boolean;
  v_refresh_first boolean;
  v_refresh_second boolean;
  v_session_hash text := repeat('a', 64);
  v_other_session_hash text := repeat('c', 64);
  v_actor_hash text := repeat('b', 64);
  v_incident_id uuid;
  v_incident_count integer;
  v_occurrence_count integer;
  v_probe boolean;
  v_schedule_registered boolean;
  v_schedule_disabled boolean;
  v_schedule_command text;
  v_worker_evidence jsonb;
  v_kael_evidence jsonb;
  v_dispatcher_state jsonb;
  v_dispatcher_incident_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if to_regclass('cron.job') is null or to_regclass('vault.secrets') is null then
    raise exception 'P352: local Cron and Vault tables must exist for scheduler verification';
  end if;

  delete from vault.secrets where name = 'system_health_monitor_secret';
  if exists (select 1 from vault.decrypted_secrets where name = 'system_health_monitor_secret') then
    raise exception 'P352: monitor secret must be absent during scheduler verification';
  end if;

  v_schedule_registered := private.schedule_system_health_monitor();
  if v_schedule_registered is not true
    or not exists (
      select 1 from cron.job
      where jobname = 'system-health-monitor' and schedule = '* * * * *'
    ) then
    raise exception 'P352: minute monitoring must be scheduled while the monitor secret is absent';
  end if;
  select command into v_schedule_command
  from cron.job where jobname = 'system-health-monitor';
  if v_schedule_command is null
    or position(
      $guard$where nullif(project_url, '') is not null and nullif(monitor_secret, '') is not null$guard$
      in v_schedule_command
    ) = 0 then
    raise exception 'P352: the scheduled request must wait until its required secrets exist';
  end if;

  if has_table_privilege('anon', 'public.system_health_snapshots', 'select')
     or has_table_privilege('authenticated', 'public.system_health_incidents', 'select')
     or has_table_privilege('authenticated', 'public.system_health_incident_events', 'select')
     or has_table_privilege('anon', 'public.system_health_refresh_limits', 'select')
     or has_table_privilege('authenticated', 'public.system_health_refresh_limits', 'select')
     or has_table_privilege('anon', 'public.system_mobile_health_observations', 'insert')
     or has_table_privilege('authenticated', 'public.system_mobile_health_actor_rate_limits', 'select')
     or has_table_privilege('anon', 'public.system_mobile_health_actor_rate_limits', 'insert') then
    raise exception 'P352: client roles must not access monitor tables directly';
  end if;

  if has_function_privilege('anon', 'public.record_system_health_snapshot(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_system_health_run(text,timestamptz,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_system_health_manual_refresh(text,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_system_health_delivery(text,text,timestamptz,integer)', 'execute')
     or has_function_privilege('anon', 'public.disable_system_health_monitor()', 'execute')
     or has_function_privilege('authenticated', 'public.disable_system_health_monitor()', 'execute')
     or not has_function_privilege('service_role', 'public.disable_system_health_monitor()', 'execute')
     or has_function_privilege('service_role', 'private.prune_system_health_data(integer)', 'execute') then
    raise exception 'P352: monitor mutation/retention RPC grants are too broad';
  end if;

  v_refresh_first := public.claim_system_health_manual_refresh('local', clock_timestamp());
  v_refresh_second := public.claim_system_health_manual_refresh('local', clock_timestamp());
  if not v_refresh_first or v_refresh_second then
    raise exception 'P352: manual health refresh must be limited to one request per minute';
  end if;
  update public.system_health_refresh_limits
  set last_requested_at = clock_timestamp() - interval '60 seconds'
  where environment = 'local';
  if not public.claim_system_health_manual_refresh('local', clock_timestamp()) then
    raise exception 'P352: manual health refresh must become available after its cooldown';
  end if;

  v_first := public.claim_system_health_run('local', v_bucket, v_owner, 45);
  v_second := public.claim_system_health_run('local', v_bucket, 'e3520000-0000-4000-8000-000000000002', 45);
  if not v_first or v_second then
    raise exception 'P352: a live lease must allow one owner only';
  end if;

  v_dispatcher_state := public.record_system_monitor_observer_heartbeat('local', 'gray', 'gray', 'D1_UNAVAILABLE', v_now);
  v_dispatcher_incident_id := (v_dispatcher_state->>'incident_id')::uuid;
  if v_dispatcher_state->>'transition' <> 'opened' or v_dispatcher_incident_id is null then
    raise exception 'P352: the first dispatcher loss must atomically open one stable incident';
  end if;
  v_dispatcher_state := public.record_system_monitor_observer_heartbeat('local', 'gray', 'gray', 'D1_UNAVAILABLE', clock_timestamp());
  if v_dispatcher_state->>'transition' <> 'none' or (v_dispatcher_state->>'incident_id')::uuid <> v_dispatcher_incident_id then
    raise exception 'P352: repeated dispatcher loss must reuse its active incident';
  end if;
  v_dispatcher_state := public.record_system_monitor_observer_heartbeat('local', 'green', 'green', null, clock_timestamp());
  if v_dispatcher_state->>'transition' <> 'resolved' or (v_dispatcher_state->>'incident_id')::uuid <> v_dispatcher_incident_id then
    raise exception 'P352: dispatcher recovery must close the same incident';
  end if;

  update public.system_monitor_leases
  set lease_expires_at = clock_timestamp() - interval '1 second'
  where environment = 'local' and scheduled_at = v_bucket;
  if not public.claim_system_health_run('local', v_bucket, 'e3520000-0000-4000-8000-000000000002', 45) then
    raise exception 'P352: an expired lease must be claimable by a new owner';
  end if;

  begin
    perform public.claim_system_health_run('local', clock_timestamp() + interval '1 hour', v_owner, 45);
    raise exception 'P352: a future lease bucket must be rejected';
  exception when sqlstate '22023' then null;
  end;

  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'environment', 'local',
    'project_ref', null,
    'release_id', 'p352-test',
    'scheduled_at', v_bucket,
    'completed_at', clock_timestamp(),
    'expires_at', clock_timestamp() + interval '3 minutes',
    'overall_status', 'red',
    'checks', jsonb_build_array(jsonb_build_object(
      'check_id', 'edge-availability',
      'component', 'backend',
      'status', 'red',
      'reason_code', 'EDGE_UNAVAILABLE',
      'observed_at', clock_timestamp(),
      'evidence_window', null,
      'sample_count', 2,
      'metrics', jsonb_build_object('failure_count', 2),
      'incident_id', null
    ))
  );

  if not public.record_system_health_snapshot(v_snapshot) then
    raise exception 'P352: the first completed snapshot must be stored';
  end if;
  select incident_id, occurrence_count into v_incident_id, v_occurrence_count
  from public.system_health_incidents
  where environment = 'local' and fingerprint = 'local:backend:edge-availability' and status = 'open';
  if v_incident_id is null or v_occurrence_count <> 1 then
    raise exception 'P352: the first failing check must open one incident';
  end if;
  if (select checks->0->>'incident_id' from public.system_health_snapshots where environment = 'local' and scheduled_at = v_bucket) <> v_incident_id::text then
    raise exception 'P352: snapshots must link their checks to the active incident';
  end if;
  if (select count(*) from public.system_health_incident_events where incident_id = v_incident_id and event_kind = 'opened') <> 1 then
    raise exception 'P352: opening an incident must append one lifecycle event';
  end if;

  v_snapshot := jsonb_set(v_snapshot, '{completed_at}', to_jsonb(clock_timestamp() + interval '1 second'));
  v_snapshot := jsonb_set(v_snapshot, '{checks,0,observed_at}', to_jsonb(clock_timestamp() + interval '1 second'));
  if not public.record_system_health_snapshot(v_snapshot) then
    raise exception 'P352: a later completion in the same minute must update the snapshot';
  end if;
  select count(*), max(occurrence_count) into v_incident_count, v_occurrence_count
  from public.system_health_incidents
  where environment = 'local' and fingerprint = 'local:backend:edge-availability' and status = 'open';
  if v_incident_count <> 1 or v_occurrence_count <> 2 then
    raise exception 'P352: repeated failures must reuse one open incident and increment evidence count';
  end if;
  if (select count(*) from public.system_health_incident_events where incident_id = v_incident_id) <> 1 then
    raise exception 'P352: unchanged evidence must not append noisy lifecycle events';
  end if;

  v_snapshot_old := jsonb_set(v_snapshot, '{completed_at}', to_jsonb(clock_timestamp() - interval '10 seconds'));
  if public.record_system_health_snapshot(v_snapshot_old) then
    raise exception 'P352: a late completion must not overwrite a newer snapshot';
  end if;

  v_snapshot := jsonb_set(v_snapshot, '{overall_status}', '"gray"'::jsonb);
  v_snapshot := jsonb_set(v_snapshot, '{checks,0,status}', '"gray"'::jsonb);
  v_snapshot := jsonb_set(v_snapshot, '{checks,0,reason_code}', '"SOURCE_STALE"'::jsonb);
  v_snapshot := jsonb_set(v_snapshot, '{completed_at}', to_jsonb(clock_timestamp() + interval '2 seconds'));
  if not public.record_system_health_snapshot(v_snapshot) then
    raise exception 'P352: gray evidence must be recorded';
  end if;
  if not exists (select 1 from public.system_health_incidents where incident_id = v_incident_id and status = 'open') then
    raise exception 'P352: missing evidence must not falsely resolve an incident';
  end if;
  if (select checks->0->>'incident_id' from public.system_health_snapshots where environment = 'local' and scheduled_at = v_bucket) <> v_incident_id::text then
    raise exception 'P352: gray evidence must retain the active incident link';
  end if;

  v_snapshot := jsonb_set(v_snapshot, '{overall_status}', '"green"'::jsonb);
  v_snapshot := jsonb_set(v_snapshot, '{checks,0,status}', '"green"'::jsonb);
  v_snapshot := jsonb_set(v_snapshot, '{checks,0,reason_code}', '"EDGE_AVAILABLE"'::jsonb);
  v_snapshot := jsonb_set(v_snapshot, '{completed_at}', to_jsonb(clock_timestamp() + interval '3 seconds'));
  if not public.record_system_health_snapshot(v_snapshot) then
    raise exception 'P352: recovery evidence must be recorded';
  end if;
  if not exists (select 1 from public.system_health_incidents where incident_id = v_incident_id and status = 'resolved') then
    raise exception 'P352: green evidence must close the incident lifecycle';
  end if;
  if (select checks->0->>'incident_id' from public.system_health_snapshots where environment = 'local' and scheduled_at = v_bucket) <> v_incident_id::text then
    raise exception 'P352: recovery snapshots must retain the resolved incident link';
  end if;
  if (select count(*) from public.system_health_incident_events where incident_id = v_incident_id and event_kind = 'resolved') <> 1 then
    raise exception 'P352: recovery must append a lifecycle event';
  end if;

  v_snapshot := v_snapshot || jsonb_build_object(
    'schema_version', 2,
    'profile_id', 'cloudflare-admin-v1',
    'required_check_ids', jsonb_build_array('edge-availability', 'backend-database-availability'),
    'coverage_gaps', jsonb_build_array('app-crash', 'push-notifications')
  );
  v_snapshot := jsonb_set(v_snapshot, '{completed_at}', to_jsonb(clock_timestamp() + interval '4 seconds'));
  if not public.record_system_health_snapshot(v_snapshot) then
    raise exception 'P352: a profile v2 snapshot with missing required evidence must be accepted safely';
  end if;
  if not exists (
    select 1 from public.system_health_snapshots
    where environment = 'local' and scheduled_at = v_bucket and schema_version = 2
      and profile_id = 'cloudflare-admin-v1' and overall_status = 'gray'
      and checks @> '[{"check_id":"backend-database-availability","status":"gray","reason_code":"REQUIRED_CHECK_MISSING"}]'::jsonb
      and jsonb_array_length(coverage_gaps) = 2
  ) then
    raise exception 'P352: missing required evidence must be materialized as gray in profile v2';
  end if;

  v_first := public.record_system_mobile_observation(
    'local', v_session_hash, v_actor_hash, 'ios', 'p352-test', 'build-1', clock_timestamp(), 'green', 'API_REACHABLE', 42
  );
  v_second := public.record_system_mobile_observation(
    'local', v_other_session_hash, v_actor_hash, 'ios', 'p352-test', 'build-1', clock_timestamp(), 'green', 'API_REACHABLE', 41
  );
  if not v_first or v_second then
    raise exception 'P352: rotating a caller-chosen session must not bypass the actor-level mobile observation limit';
  end if;
  if (select count(*) from public.system_mobile_health_observations
      where environment = 'local' and session_hash in (v_session_hash, v_other_session_hash)) <> 1 then
    raise exception 'P352: a rejected actor-level observation must not create another session row';
  end if;

  update public.system_mobile_health_actor_rate_limits
  set last_accepted_at = clock_timestamp() - interval '8 days'
  where environment = 'local' and actor_hash = v_actor_hash;
  perform private.prune_system_health_data(5000);
  if exists (
    select 1 from public.system_mobile_health_actor_rate_limits
    where environment = 'local' and actor_hash = v_actor_hash
  ) then
    raise exception 'P352: inactive actor rate-limit rows must be pruned after seven days';
  end if;

  if not public.record_system_monitor_worker_heartbeat(
    'kael-matching-maintainer',
    'e3520000-0000-4000-8000-000000000003',
    clock_timestamp() - interval '2 seconds',
    clock_timestamp(),
    'failed',
    'TEST_WORKER_FAILURE',
    'p352-test'
  ) then
    raise exception 'P352: an Edge worker completion must persist';
  end if;
  v_worker_evidence := public.get_system_monitor_worker_evidence();
  if not exists (
    select 1 from jsonb_array_elements(v_worker_evidence) item
    where item->>'job_name' = 'kael-matching-maintainer'
      and item->>'last_status' = 'failed'
      and item->>'last_reason_code' = 'TEST_WORKER_FAILURE'
  ) then
    raise exception 'P352: worker evidence must report Edge completion, not only the pg_net enqueue result';
  end if;
  v_kael_evidence := public.get_system_monitor_kael_evidence('local', clock_timestamp() - interval '5 minutes');
  if jsonb_typeof(v_kael_evidence) <> 'object'
    or not (v_kael_evidence ? 'valid_execution_count')
    or not (v_kael_evidence ? 'open_circuit_count')
    or not (v_kael_evidence ? 'learning_eligible_count') then
    raise exception 'P352: Kael evidence must return bounded aggregate fields';
  end if;

  v_schedule_disabled := public.disable_system_health_monitor();
  if v_schedule_disabled is not true or exists (select 1 from cron.job where jobname = 'system-health-monitor') then
    raise exception 'P352: rollback must stop the minute collector without deleting monitoring data';
  end if;

  v_probe := public.system_monitor_health_probe();
  if not v_probe then raise exception 'P352: the read-only database probe must return success'; end if;
  if jsonb_array_length(public.get_system_monitor_worker_evidence()) <> 5 then
    raise exception 'P352: the versioned scheduled-worker inventory must include all five monitored jobs';
  end if;

  v_snapshot := jsonb_set(v_snapshot, '{checks}', v_snapshot->'checks' || jsonb_build_array(jsonb_build_object(
    'check_id', 'backend-database-availability',
    'component', 'backend',
    'status', 'green',
    'reason_code', 'DATABASE_AVAILABLE',
    'observed_at', clock_timestamp() + interval '5 seconds',
    'evidence_window', null,
    'sample_count', 1,
    'metrics', '{}'::jsonb,
    'incident_id', null
  )));
  v_snapshot := jsonb_set(v_snapshot, '{completed_at}', to_jsonb(clock_timestamp() + interval '5 seconds'));
  v_snapshot := jsonb_set(v_snapshot, '{overall_status}', '"red"'::jsonb);
  begin
    perform public.record_system_health_snapshot(v_snapshot);
    raise exception 'P352: a status that disagrees with its checks must be rejected';
  exception when sqlstate '22023' then null;
  end;
end $$;

rollback;
