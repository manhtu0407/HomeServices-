create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cron-run-details-cleanup') then
    perform cron.unschedule('cron-run-details-cleanup');
  end if;
  if exists (select 1 from cron.job where jobname = 'harness-read-telemetry-retention') then
    perform cron.unschedule('harness-read-telemetry-retention');
  end if;
end $$;

-- pg_cron never trims its own history, and the per-minute maintainers alone add ~1,400 rows a day.
select cron.schedule(
  'cron-run-details-cleanup',
  '53 3 * * *',
  $$delete from cron.job_run_details where start_time < now() - interval '7 days'$$
);

-- The append-only triggers on harness_events and harness_privileged_operations stay in force for
-- every other caller. Only this owner-only function lifts them, inside one transaction that
-- re-enables them before commit, so a failure rolls the trigger state back with the rest.
-- Eligible runs are successful reads only: a run with any failed/blocked/denied event or a
-- non-completed status is evidence and is never pruned. The route list must stay a subset of the
-- read-only kinds in the capability registry (asserted by the retention pillar).
create or replace function private.prune_harness_read_telemetry(
  p_retain interval default interval '14 days',
  p_max_runs integer default 50000
)
returns table (
  runs_deleted bigint,
  events_deleted bigint,
  privileged_operations_deleted bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runs bigint;
  v_events bigint;
  v_privileged bigint;
begin
  if p_retain is null or p_retain < interval '7 days' then
    raise exception using errcode = '22023', message = 'HARNESS_RETENTION_WINDOW_TOO_SHORT';
  end if;
  if p_max_runs is null or p_max_runs < 1 then
    raise exception using errcode = '22023', message = 'HARNESS_RETENTION_BATCH_INVALID';
  end if;

  drop table if exists pg_temp.harness_prune_runs;
  create temporary table harness_prune_runs (run_id uuid primary key) on commit drop;

  insert into pg_temp.harness_prune_runs (run_id)
  select r.run_id
  from public.harness_runs r
  where r.route_kind = any (array[
      'notifications',
      'workers.earnings',
      'workers.jobs',
      'workers.performanceInsights',
      'workers.me',
      'workers.broadcasts',
      'workers.withdrawalRequests.list',
      'workers.payoutMethod.get',
      'jobs.get'
    ])
    and r.started_at < now() - p_retain
    and r.status = 'completed'
    and r.error_code is null
    and not exists (
      select 1 from public.harness_events e
      where e.run_id = r.run_id
        and (e.status in ('failed', 'blocked', 'cancelled') or e.error_code is not null)
    )
    and not exists (
      select 1 from public.harness_privileged_operations o
      where o.run_id = r.run_id
        and (o.result in ('failed', 'denied') or o.error_code is not null)
    )
  order by r.started_at
  limit p_max_runs;

  alter table public.harness_events disable trigger harness_events_append_only;
  alter table public.harness_privileged_operations disable trigger harness_privileged_append_only;

  delete from public.harness_events e
  using pg_temp.harness_prune_runs d
  where e.run_id = d.run_id;
  get diagnostics v_events = row_count;

  delete from public.harness_privileged_operations o
  using pg_temp.harness_prune_runs d
  where o.run_id = d.run_id;
  get diagnostics v_privileged = row_count;

  delete from public.harness_runs r
  using pg_temp.harness_prune_runs d
  where r.run_id = d.run_id;
  get diagnostics v_runs = row_count;

  alter table public.harness_events enable trigger harness_events_append_only;
  alter table public.harness_privileged_operations enable trigger harness_privileged_append_only;

  return query select v_runs, v_events, v_privileged;
end;
$$;

revoke all on function private.prune_harness_read_telemetry(interval, integer)
  from public, anon, authenticated, service_role;

select cron.schedule(
  'harness-read-telemetry-retention',
  '47 3 * * *',
  $$select private.prune_harness_read_telemetry()$$
);
