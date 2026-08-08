begin;

DO $$
begin
  if to_regclass('public.harness_runs') is null then
    raise exception 'harness_runs missing';
  end if;
  if to_regclass('public.harness_events') is null then
    raise exception 'harness_events missing';
  end if;
  if to_regclass('public.harness_privileged_operations') is null then
    raise exception 'harness_privileged_operations missing';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'harness_runs' and c.relrowsecurity
  ) then
    raise exception 'harness_runs RLS disabled';
  end if;
  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (
        'begin_harness_run',
        'append_harness_event',
        'finish_harness_run',
        'record_harness_privileged_operation'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type = 'EXECUTE'
  ) then
    raise exception 'harness trace RPC exposed beyond service_role';
  end if;
end;
$$;

select public.begin_harness_run(
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  null,
  repeat('a', 64),
  'customer',
  'jobs.get',
  'mobile.route.jobs.get',
  'local',
  'harness-test',
  null,
  '{"fixture":true}'::jsonb
);

select public.append_harness_event(
  '00000000-0000-4000-8000-000000000103'::uuid,
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  null,
  '00000000-0000-4000-8000-000000000105'::uuid,
  '00000000-0000-4000-8000-000000000106'::uuid,
  'authorization.resolved',
  'authorization',
  'succeeded',
  1,
  null,
  null,
  null,
  0,
  1,
  'harness-test',
  'local',
  null,
  '{"risk":"read"}'::jsonb
);

select public.record_harness_privileged_operation(
  '00000000-0000-4000-8000-000000000104'::uuid,
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  repeat('a', 64),
  'customer',
  'mobile.route.jobs.get',
  'mobile.route.jobs.get',
  'workflow_service',
  'job',
  repeat('b', 64),
  'succeeded',
  'harness-test',
  'local',
  null,
  '{}'::jsonb
);

select public.finish_harness_run(
  '00000000-0000-4000-8000-000000000101'::uuid,
  'completed',
  2,
  null,
  '{}'::jsonb
);

DO $$
begin
  if not exists (
    select 1 from public.harness_run_timeline
    where run_id = '00000000-0000-4000-8000-000000000101'::uuid
      and event_class = 'authorization.resolved'
      and run_status = 'completed'
      and turn_id = '00000000-0000-4000-8000-000000000105'::uuid
      and tool_call_id = '00000000-0000-4000-8000-000000000106'::uuid
  ) then
    raise exception 'run timeline does not reconstruct the fixture';
  end if;
end;
$$;

rollback;
