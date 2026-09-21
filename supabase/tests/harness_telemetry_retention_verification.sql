-- @pillar id: P202-harness-telemetry-retention-sql
-- @pillar invariant: The retention pass removes only successful, expired read-route runs together with their events and privileged operations; failed, denied, non-completed, write-route and recent runs survive, and the append-only triggers are enabled again whether the pass succeeds or aborts.
-- @pillar authority: governance/RULES.md #8 (no silent loss of failure evidence) | supabase/migrations/20260806122000_harness_trace_lineage.sql (append-only harness evidence)
-- @pillar target: supabase/migrations/20260921153130_harness_telemetry_retention.sql
-- @pillar layer: sql
-- @pillar siblings: P203-harness-retention-read-only-allowlist, P18-capability-registry-parity
-- @pillar mutation: Drop the privileged-operation `denied` guard from private.prune_harness_read_telemetry; the denied-read fixture is deleted and P202 raises.

begin;
set local statement_timeout = '60s';

do $$
declare
  v_cmd text;
begin
  select command into v_cmd from cron.job where jobname = 'cron-run-details-cleanup';
  if v_cmd is null
     or position('cron.job_run_details' in v_cmd) = 0
     or position('7 days' in v_cmd) = 0 then
    raise exception 'P202: cron-run-details-cleanup must delete cron.job_run_details older than 7 days, got %', coalesce(v_cmd, '<missing>');
  end if;

  select command into v_cmd from cron.job where jobname = 'harness-read-telemetry-retention';
  if v_cmd is null or position('private.prune_harness_read_telemetry' in v_cmd) = 0 then
    raise exception 'P202: harness-read-telemetry-retention must call private.prune_harness_read_telemetry, got %', coalesce(v_cmd, '<missing>');
  end if;

  if has_function_privilege('anon', 'private.prune_harness_read_telemetry(interval,integer)', 'execute')
     or has_function_privilege('authenticated', 'private.prune_harness_read_telemetry(interval,integer)', 'execute')
     or has_function_privilege('service_role', 'private.prune_harness_read_telemetry(interval,integer)', 'execute') then
    raise exception 'P202: the retention function must not be executable by anon, authenticated or service_role';
  end if;
end $$;

create temp table p202_fixture_ids (label text primary key, run_id uuid not null) on commit drop;
insert into p202_fixture_ids(label, run_id) values
  ('expired_clean_read',      'e2010000-0000-4000-8000-00000000000a'),
  ('expired_failed_event',    'e2010000-0000-4000-8000-00000000000b'),
  ('expired_failed_run',      'e2010000-0000-4000-8000-00000000000c'),
  ('expired_write_route',     'e2010000-0000-4000-8000-00000000000d'),
  ('recent_clean_read',       'e2010000-0000-4000-8000-00000000000e'),
  ('expired_denied_read',     'e2010000-0000-4000-8000-00000000000f');

insert into public.harness_runs (run_id, trace_id, route_kind, environment, release_id, status, started_at, finished_at, error_code)
select f.run_id, f.run_id,
  case f.label when 'expired_write_route' then 'workers.activityMinute'
               when 'expired_denied_read' then 'jobs.get'
               else 'workers.me' end,
  'local', 'p202-fixture',
  case f.label when 'expired_failed_run' then 'failed' else 'completed' end,
  case f.label when 'recent_clean_read' then now() - interval '2 days' else now() - interval '30 days' end,
  now(),
  case f.label when 'expired_failed_run' then 'P202_FIXTURE_ERROR' else null end
from p202_fixture_ids f;

insert into public.harness_events (run_id, trace_id, event_class, stage, status, release_id, environment)
select f.run_id, f.run_id, 'request.started', 'p202', 'started', 'p202-fixture', 'local' from p202_fixture_ids f
union all
select f.run_id, f.run_id, 'request.completed', 'p202',
  case f.label when 'expired_failed_event' then 'failed' else 'succeeded' end,
  'p202-fixture', 'local'
from p202_fixture_ids f;

insert into public.harness_privileged_operations (run_id, trace_id, operation_id, capability, reason, resource_type, result, release_id, environment)
select f.run_id, f.run_id, 'p202.op', 'mobile.route.p202', 'fixture', 'system',
  case f.label when 'expired_denied_read' then 'denied' else 'allowed' end,
  'p202-fixture', 'local'
from p202_fixture_ids f;

do $$
declare
  v_pass record;
  v_label text;
  v_survivors text[] := array['expired_failed_event', 'expired_failed_run', 'expired_write_route', 'recent_clean_read', 'expired_denied_read'];
begin
  select * into v_pass from private.prune_harness_read_telemetry();

  if v_pass.runs_deleted < 1 or v_pass.events_deleted < 2 or v_pass.privileged_operations_deleted < 1 then
    raise exception 'P202: the pass must report the expired clean read it removed, got runs=% events=% privileged=%',
      v_pass.runs_deleted, v_pass.events_deleted, v_pass.privileged_operations_deleted;
  end if;

  if exists (select 1 from public.harness_runs r join p202_fixture_ids f using (run_id) where f.label = 'expired_clean_read')
     or exists (select 1 from public.harness_events e join p202_fixture_ids f using (run_id) where f.label = 'expired_clean_read')
     or exists (select 1 from public.harness_privileged_operations o join p202_fixture_ids f using (run_id) where f.label = 'expired_clean_read') then
    raise exception 'P202: an expired, successful read run and its children must be pruned together';
  end if;

  foreach v_label in array v_survivors loop
    if not exists (select 1 from public.harness_runs r join p202_fixture_ids f using (run_id) where f.label = v_label)
       or (select count(*) from public.harness_events e join p202_fixture_ids f using (run_id) where f.label = v_label) <> 2
       or (select count(*) from public.harness_privileged_operations o join p202_fixture_ids f using (run_id) where f.label = v_label) <> 1 then
      raise exception 'P202: fixture "%" is evidence or recent and must survive with its 2 events and 1 privileged operation', v_label;
    end if;
  end loop;

  if (select count(*) from pg_trigger
      where tgname in ('harness_events_append_only', 'harness_privileged_append_only') and tgenabled = 'O') <> 2 then
    raise exception 'P202: both append-only triggers must be enabled again after a successful pass';
  end if;
end $$;

do $$
begin
  begin
    delete from public.harness_events
    where run_id = (select run_id from p202_fixture_ids where label = 'expired_failed_event');
    raise exception 'P202: a direct delete of harness_events must still be refused after a pass';
  exception when sqlstate '55000' then null;
  end;

  begin
    perform 1 from private.prune_harness_read_telemetry(interval '1 day');
    raise exception 'P202: a retention window under 7 days must be refused';
  exception when sqlstate '22023' then null;
  end;
end $$;

do $$
declare
  v_parent uuid;
begin
  insert into public.harness_runs (run_id, trace_id, route_kind, environment, release_id, status, started_at, finished_at)
  values ('e2010000-0000-4000-8000-0000000000a1', 'e2010000-0000-4000-8000-0000000000a1', 'workers.me', 'local', 'p202-fixture', 'completed', now() - interval '31 days', now()),
         ('e2010000-0000-4000-8000-0000000000a2', 'e2010000-0000-4000-8000-0000000000a2', 'workers.activityMinute', 'local', 'p202-fixture', 'completed', now() - interval '31 days', now());
  insert into public.harness_events (run_id, trace_id, event_class, status, release_id, environment)
  values ('e2010000-0000-4000-8000-0000000000a1', 'e2010000-0000-4000-8000-0000000000a1', 'request.started', 'started', 'p202-fixture', 'local')
  returning event_id into v_parent;
  insert into public.harness_events (run_id, trace_id, parent_event_id, event_class, status, release_id, environment)
  values ('e2010000-0000-4000-8000-0000000000a2', 'e2010000-0000-4000-8000-0000000000a2', v_parent, 'request.completed', 'succeeded', 'p202-fixture', 'local');

  begin
    perform 1 from private.prune_harness_read_telemetry();
    raise exception 'P202: pruning an event that a surviving event still references must abort the pass';
  exception when foreign_key_violation then null;
  end;

  if (select count(*) from pg_trigger
      where tgname in ('harness_events_append_only', 'harness_privileged_append_only') and tgenabled = 'O') <> 2 then
    raise exception 'P202: an aborted pass must leave both append-only triggers enabled';
  end if;
  if not exists (select 1 from public.harness_runs where run_id = 'e2010000-0000-4000-8000-0000000000a1') then
    raise exception 'P202: an aborted pass must not delete anything';
  end if;
end $$;

rollback;
