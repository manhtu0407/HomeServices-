alter table public.system_health_snapshots
  drop constraint if exists system_health_snapshots_schema_version_check;

alter table public.system_health_snapshots
  add constraint system_health_snapshots_schema_version_check check (schema_version in (1, 2));

alter table public.system_health_snapshots add column if not exists profile_id text;
alter table public.system_health_snapshots add column if not exists required_check_ids jsonb;
alter table public.system_health_snapshots add column if not exists coverage_gaps jsonb;

alter table public.system_health_snapshots
  add constraint system_health_snapshots_profile_contract_check check (
    (schema_version = 1 and profile_id is null and required_check_ids is null and coverage_gaps is null)
    or (
      schema_version = 2
      and profile_id = 'cloudflare-admin-v1'
      and jsonb_typeof(required_check_ids) = 'array'
      and jsonb_array_length(required_check_ids) between 1 and 32
      and jsonb_typeof(coverage_gaps) = 'array'
      and jsonb_array_length(coverage_gaps) <= 16
      and octet_length(required_check_ids::text) <= 4096
      and octet_length(coverage_gaps::text) <= 4096
    )
  );

alter function public.record_system_health_snapshot(jsonb) rename to record_system_health_snapshot_v1_internal;
revoke all on function public.record_system_health_snapshot_v1_internal(jsonb) from public, anon, authenticated, service_role;

create function public.record_system_health_snapshot(p_snapshot jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version text := p_snapshot->>'schema_version';
  v_environment text := p_snapshot->>'environment';
  v_scheduled_at timestamptz := (p_snapshot->>'scheduled_at')::timestamptz;
  v_completed_at timestamptz := (p_snapshot->>'completed_at')::timestamptz;
  v_profile_id text := p_snapshot->>'profile_id';
  v_required jsonb := p_snapshot->'required_check_ids';
  v_gaps jsonb := p_snapshot->'coverage_gaps';
  v_checks jsonb := p_snapshot->'checks';
  v_projected jsonb;
  v_missing text;
  v_saved boolean;
  v_expected_status text;
  v_had_missing_required boolean := false;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object'
    or v_version not in ('1', '2') then
    raise exception using errcode = '22023', message = 'invalid system health snapshot version';
  end if;

  if v_version = '1' then
    return public.record_system_health_snapshot_v1_internal(p_snapshot);
  end if;

  if octet_length(p_snapshot::text) > 16384
    or v_environment not in ('production', 'staging', 'local')
    or v_profile_id <> 'cloudflare-admin-v1'
    or jsonb_typeof(v_required) is distinct from 'array'
    or jsonb_array_length(v_required) not between 1 and 32
    or jsonb_typeof(v_gaps) is distinct from 'array'
    or jsonb_array_length(v_gaps) > 16
    or jsonb_typeof(v_checks) is distinct from 'array'
    or (p_snapshot->>'expires_at')::timestamptz <= v_completed_at
    or (p_snapshot->>'expires_at')::timestamptz > v_completed_at + interval '180 seconds'
    or v_scheduled_at > clock_timestamp() + interval '30 seconds'
    or v_completed_at < v_scheduled_at
    or v_completed_at > clock_timestamp() + interval '60 seconds' then
    raise exception using errcode = '22023', message = 'invalid cloudflare admin system health snapshot';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_required) as required_id
    where jsonb_typeof(required_id) <> 'string' or required_id #>> '{}' !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
  ) or (select count(*) <> count(distinct required_id #>> '{}') from jsonb_array_elements(v_required) as required_id) then
    raise exception using errcode = '22023', message = 'invalid required system health check ids';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_gaps) as gap
    where jsonb_typeof(gap) <> 'string'
      or gap #>> '{}' not in ('app-crash', 'push-notifications')
  ) or (select count(*) <> count(distinct gap #>> '{}') from jsonb_array_elements(v_gaps) as gap) then
    raise exception using errcode = '22023', message = 'invalid deferred coverage gaps';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_checks) as check_row
    where check_row->>'check_id' is null or check_row->>'check_id' !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
  ) or (select count(*) <> count(distinct check_row->>'check_id') from jsonb_array_elements(v_checks) as check_row) then
    raise exception using errcode = '22023', message = 'invalid or duplicate system health checks';
  end if;

  for v_missing in
    select required_id #>> '{}'
    from jsonb_array_elements(v_required) as required_id
    where not exists (
      select 1 from jsonb_array_elements(v_checks) as check_row
      where check_row->>'check_id' = required_id #>> '{}'
    )
  loop
    v_had_missing_required := true;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check_id', v_missing,
      'component', 'system',
      'status', 'gray',
      'reason_code', 'REQUIRED_CHECK_MISSING',
      'observed_at', null,
      'evidence_window', null,
      'sample_count', null,
      'metrics', '{}'::jsonb,
      'incident_id', null
    ));
  end loop;

  if jsonb_array_length(v_checks) > 32 then
    raise exception using errcode = '22023', message = 'system health snapshot has too many checks after required evidence normalization';
  end if;

  select case
    when count(*) = 0 then 'gray'
    when bool_or(check_row->>'status' = 'red') then 'red'
    when bool_or(check_row->>'status' = 'yellow') then 'yellow'
    when bool_or(check_row->>'status' = 'gray') then 'gray'
    else 'green'
  end into v_expected_status
  from jsonb_array_elements(v_checks) as check_row;
  if not v_had_missing_required and v_expected_status is distinct from p_snapshot->>'overall_status' then
    raise exception using errcode = '22023', message = 'system health status does not match required checks';
  end if;

  v_projected := p_snapshot
    || jsonb_build_object('schema_version', 1, 'checks', v_checks, 'overall_status', v_expected_status);
  v_saved := public.record_system_health_snapshot_v1_internal(v_projected);
  if not v_saved then return false; end if;

  update public.system_health_snapshots
  set schema_version = 2,
      profile_id = v_profile_id,
      required_check_ids = v_required,
      coverage_gaps = v_gaps
  where environment = v_environment and scheduled_at = date_trunc('minute', v_scheduled_at);
  return found;
end;
$$;

revoke all on function public.record_system_health_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.record_system_health_snapshot(jsonb) to service_role;

with deferred_incidents as (
  update public.system_health_incidents
  set status = 'resolved',
      resolved_at = clock_timestamp(),
      updated_at = clock_timestamp(),
      last_seen_at = clock_timestamp(),
      evidence = jsonb_build_object(
        'reason_code', 'SOURCE_DEFERRED_BY_PROFILE',
        'observed_at', clock_timestamp(),
        'metrics', coalesce(evidence->'metrics', '{}'::jsonb)
      )
  where status = 'open'
    and (
      detector in ('app-native-sentry', 'app-sentry-coverage')
      or evidence->>'reason_code' in ('SENTRY_NOT_CONFIGURED', 'SENTRY_SOURCE_UNAVAILABLE')
    )
  returning incident_id, severity, resolved_at, evidence->'metrics' as metrics
)
insert into public.system_health_incident_events (
  incident_id, event_kind, recorded_at, status, severity, reason_code, metrics
)
select incident_id, 'resolved', resolved_at, 'resolved', severity, 'SOURCE_DEFERRED_BY_PROFILE', coalesce(metrics, '{}'::jsonb)
from deferred_incidents
on conflict (incident_id, event_kind, recorded_at) do nothing;
