-- The schema linter resolves relations statically and cannot see a temporary table that the
-- function creates at run time, so the run ids are held in an array instead. Behavior is
-- unchanged: same eligibility rules, same trigger handling, same result columns.
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
  v_run_ids uuid[];
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

  select coalesce(array_agg(expired.run_id), '{}'::uuid[])
  into v_run_ids
  from (
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
    limit p_max_runs
  ) expired;

  alter table public.harness_events disable trigger harness_events_append_only;
  alter table public.harness_privileged_operations disable trigger harness_privileged_append_only;

  delete from public.harness_events e
  where e.run_id = any (v_run_ids);
  get diagnostics v_events = row_count;

  delete from public.harness_privileged_operations o
  where o.run_id = any (v_run_ids);
  get diagnostics v_privileged = row_count;

  delete from public.harness_runs r
  where r.run_id = any (v_run_ids);
  get diagnostics v_runs = row_count;

  alter table public.harness_events enable trigger harness_events_append_only;
  alter table public.harness_privileged_operations enable trigger harness_privileged_append_only;

  return query select v_runs, v_events, v_privileged;
end;
$$;

revoke all on function private.prune_harness_read_telemetry(interval, integer)
  from public, anon, authenticated, service_role;
