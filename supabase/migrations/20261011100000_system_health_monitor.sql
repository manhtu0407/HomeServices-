create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.system_health_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  schema_version smallint not null default 1 check (schema_version = 1),
  environment text not null check (environment in ('production', 'staging', 'local')),
  project_ref text,
  release_id text,
  scheduled_at timestamptz not null,
  completed_at timestamptz not null,
  expires_at timestamptz not null,
  overall_status text not null check (overall_status in ('green', 'yellow', 'red', 'gray')),
  checks jsonb not null check (jsonb_typeof(checks) = 'array' and octet_length(checks::text) <= 2048),
  created_at timestamptz not null default clock_timestamp(),
  unique (environment, scheduled_at),
  check (completed_at >= scheduled_at and expires_at > completed_at)
);

create index if not exists system_health_snapshots_latest_idx
  on public.system_health_snapshots (environment, completed_at desc);

create table if not exists public.system_health_incidents (
  incident_id uuid primary key default gen_random_uuid(),
  external_incident_id uuid,
  environment text not null check (environment in ('production', 'staging', 'local')),
  fingerprint text not null check (fingerprint ~ '^[a-z0-9._:-]{1,240}$'),
  component text not null check (component ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  detector text not null check (detector ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  severity text not null check (severity in ('yellow', 'red')),
  status text not null check (status in ('open', 'resolved')),
  opened_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 65536),
  check ((status = 'open' and resolved_at is null) or (status = 'resolved' and resolved_at is not null))
);

create unique index if not exists system_health_incidents_one_open_fingerprint_idx
  on public.system_health_incidents (environment, fingerprint) where status = 'open';
create unique index if not exists system_health_incidents_external_id_idx
  on public.system_health_incidents (external_incident_id) where external_incident_id is not null;
create index if not exists system_health_incidents_history_idx
  on public.system_health_incidents (environment, opened_at desc, incident_id desc);

alter table public.system_health_incidents add column if not exists release_id text
  check (release_id is null or release_id ~ '^[A-Za-z0-9._:+-]{1,100}$');
alter table public.system_health_incidents add column if not exists build_id text
  check (build_id is null or build_id ~ '^[A-Za-z0-9._:+-]{1,100}$');
alter table public.system_health_incidents add column if not exists platform text
  check (platform is null or platform in ('ios', 'android', 'edge', 'worker'));
alter table public.system_health_incidents add column if not exists route_kind text
  check (route_kind is null or route_kind ~ '^[A-Za-z0-9._:-]{1,80}$');
alter table public.system_health_incidents add column if not exists stage text
  check (stage is null or stage ~ '^[A-Za-z0-9._:-]{1,80}$');
alter table public.system_health_incidents add column if not exists trace_id text
  check (trace_id is null or trace_id ~ '^[A-Za-z0-9._:-]{1,100}$');
alter table public.system_health_incidents add column if not exists run_id text
  check (run_id is null or run_id ~ '^[A-Za-z0-9._:-]{1,100}$');
alter table public.system_health_incidents add column if not exists request_id text
  check (request_id is null or request_id ~ '^[A-Za-z0-9._:-]{1,100}$');
alter table public.system_health_incidents add column if not exists support_code text
  check (support_code is null or support_code ~ '^[A-Za-z0-9._:-]{1,40}$');

create index if not exists system_health_incidents_component_history_idx
  on public.system_health_incidents (environment, component, status, opened_at desc, incident_id desc);
create index if not exists system_health_incidents_release_build_idx
  on public.system_health_incidents (environment, release_id, build_id, opened_at desc);

create table if not exists public.system_health_incident_events (
  event_id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.system_health_incidents (incident_id) on delete cascade,
  event_kind text not null check (event_kind in ('opened', 'updated', 'resolved')),
  recorded_at timestamptz not null,
  status text not null check (status in ('open', 'resolved')),
  severity text not null check (severity in ('yellow', 'red')),
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object' and octet_length(metrics::text) <= 8192),
  unique (incident_id, event_kind, recorded_at)
);

create index if not exists system_health_incident_events_timeline_idx
  on public.system_health_incident_events (incident_id, recorded_at asc, event_id asc);

create table if not exists public.system_health_deliveries (
  delivery_id uuid primary key default gen_random_uuid(),
  incident_id uuid references public.system_health_incidents (incident_id) on delete set null,
  dedupe_key text not null unique check (dedupe_key ~ '^[a-zA-Z0-9._:-]{1,240}$'),
  delivery_kind text not null check (delivery_kind in ('observer_down', 'dispatcher_down', 'fallback_alert', 'recovery')),
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists system_health_deliveries_retry_idx
  on public.system_health_deliveries (next_attempt_at, created_at)
  where status = 'pending';

create table if not exists public.system_mobile_health_observations (
  environment text not null check (environment in ('production', 'staging', 'local')),
  session_hash text not null check (session_hash ~ '^[a-f0-9]{64}$'),
  platform text not null check (platform in ('ios', 'android')),
  release_id text check (release_id is null or release_id ~ '^[A-Za-z0-9._:+-]{1,100}$'),
  build_id text check (build_id is null or build_id ~ '^[A-Za-z0-9._:+-]{1,100}$'),
  last_observed_at timestamptz not null,
  api_status text not null check (api_status in ('green', 'yellow', 'red', 'gray')),
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 60000),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (environment, session_hash)
);

create index if not exists system_mobile_health_observations_recent_idx
  on public.system_mobile_health_observations (environment, last_observed_at desc, platform, release_id);

create table if not exists public.system_mobile_health_actor_rate_limits (
  environment text not null check (environment in ('production', 'staging', 'local')),
  actor_hash text not null check (actor_hash ~ '^[a-f0-9]{64}$'),
  last_accepted_at timestamptz not null,
  primary key (environment, actor_hash)
);

create index if not exists system_mobile_health_actor_rate_limits_expiry_idx
  on public.system_mobile_health_actor_rate_limits (last_accepted_at);

create table if not exists public.system_health_observer_state (
  environment text primary key check (environment in ('production', 'staging', 'local')),
  observer_heartbeat_at timestamptz,
  dispatcher_status text not null default 'gray' check (dispatcher_status in ('green', 'yellow', 'red', 'gray')),
  d1_status text not null default 'gray' check (d1_status in ('green', 'yellow', 'red', 'gray')),
  last_snapshot_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{1,64}$'),
  active_dispatcher_incident_id uuid,
  dispatcher_incident_opened_at timestamptz,
  dispatcher_incident_reason text check (dispatcher_incident_reason is null or dispatcher_incident_reason ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.system_health_deliveries add column if not exists lease_expires_at timestamptz;
alter table public.system_health_observer_state add column if not exists active_dispatcher_incident_id uuid;
alter table public.system_health_observer_state add column if not exists dispatcher_incident_opened_at timestamptz;
alter table public.system_health_observer_state add column if not exists dispatcher_incident_reason text
  check (dispatcher_incident_reason is null or dispatcher_incident_reason ~ '^[A-Z][A-Z0-9_]{0,63}$');

create table if not exists public.system_monitor_leases (
  environment text not null check (environment in ('production', 'staging', 'local')),
  scheduled_at timestamptz not null,
  owner_id uuid not null,
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (environment, scheduled_at)
);

create table if not exists public.system_health_refresh_limits (
  environment text primary key check (environment in ('production', 'staging', 'local')),
  last_requested_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.system_monitor_worker_config (
  job_name text primary key check (job_name ~ '^[a-z0-9][a-z0-9-]{1,99}$'),
  schedule_kind text not null check (schedule_kind in ('interval', 'daily')),
  expected_interval_seconds integer,
  daily_utc_hour smallint,
  daily_utc_minute smallint,
  grace_seconds integer not null check (grace_seconds between 30 and 86400),
  enabled boolean not null default true,
  config_version integer not null default 1 check (config_version > 0),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (schedule_kind = 'interval' and expected_interval_seconds between 60 and 86400 and daily_utc_hour is null and daily_utc_minute is null)
    or (schedule_kind = 'daily' and expected_interval_seconds is null and daily_utc_hour between 0 and 23 and daily_utc_minute between 0 and 59)
  )
);

insert into public.system_monitor_worker_config (
  job_name, schedule_kind, expected_interval_seconds, daily_utc_hour, daily_utc_minute, grace_seconds, enabled, config_version
) values
  ('kael-matching-maintainer', 'interval', 60, null, null, 180, true, 1),
  ('payment-maintainer', 'interval', 300, null, null, 600, true, 1),
  ('kael-learning-queue-stale-fallback', 'interval', 3600, null, null, 1800, true, 1),
  ('kael-learning-monitor', 'daily', null, 2, 0, 7200, true, 1),
  ('system-health-monitor', 'interval', 60, null, null, 180, true, 1)
on conflict (job_name) do nothing;

create table if not exists public.system_monitor_worker_heartbeats (
  job_name text not null references public.system_monitor_worker_config(job_name) on delete cascade,
  execution_id uuid not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  completion_status text not null check (completion_status in ('succeeded', 'failed')),
  reason_code text check (reason_code is null or reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  release_id text,
  observed_at timestamptz not null default clock_timestamp(),
  primary key (job_name, execution_id),
  check (finished_at >= started_at and finished_at <= clock_timestamp() + interval '30 seconds')
);

create index if not exists system_monitor_worker_heartbeats_latest_idx
  on public.system_monitor_worker_heartbeats (job_name, finished_at desc);

create table if not exists public.system_monitor_source_state (
  source_name text primary key check (source_name in ('sentry')),
  backoff_until timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures between 0 and 1000),
  last_status_code smallint check (last_status_code is null or last_status_code between 100 and 599),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.system_health_snapshots enable row level security;
alter table public.system_health_incidents enable row level security;
alter table public.system_health_incident_events enable row level security;
alter table public.system_health_deliveries enable row level security;
alter table public.system_mobile_health_observations enable row level security;
alter table public.system_mobile_health_actor_rate_limits enable row level security;
alter table public.system_health_observer_state enable row level security;
alter table public.system_monitor_leases enable row level security;
alter table public.system_health_refresh_limits enable row level security;
alter table public.system_monitor_worker_config enable row level security;
alter table public.system_monitor_worker_heartbeats enable row level security;
alter table public.system_monitor_source_state enable row level security;

revoke all on public.system_health_snapshots, public.system_health_incidents,
  public.system_health_incident_events,
  public.system_health_deliveries, public.system_mobile_health_observations,
  public.system_mobile_health_actor_rate_limits,
  public.system_health_observer_state, public.system_monitor_leases, public.system_health_refresh_limits,
  public.system_monitor_worker_config, public.system_monitor_worker_heartbeats,
  public.system_monitor_source_state from public, anon, authenticated;
grant select, insert, update, delete on public.system_health_snapshots,
  public.system_health_incidents, public.system_health_incident_events, public.system_health_deliveries,
  public.system_mobile_health_observations, public.system_mobile_health_actor_rate_limits,
  public.system_health_observer_state,
  public.system_monitor_leases, public.system_health_refresh_limits, public.system_monitor_worker_config,
  public.system_monitor_worker_heartbeats, public.system_monitor_source_state to service_role;

create or replace function public.claim_system_health_run(
  p_environment text,
  p_scheduled_at timestamptz,
  p_owner_id uuid,
  p_lease_seconds integer default 45
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean;
  v_bucket timestamptz := date_trunc('minute', p_scheduled_at);
begin
  if p_environment is null or p_environment not in ('production', 'staging', 'local')
    or p_owner_id is null
    or p_lease_seconds not between 1 and 45
    or p_scheduled_at > clock_timestamp() + interval '30 seconds' then
    raise exception using errcode = '22023', message = 'invalid system monitor lease';
  end if;

  insert into public.system_monitor_leases (environment, scheduled_at, owner_id, lease_expires_at)
  values (p_environment, v_bucket, p_owner_id, clock_timestamp() + make_interval(secs => p_lease_seconds))
  on conflict (environment, scheduled_at) do update
    set owner_id = excluded.owner_id,
        lease_expires_at = excluded.lease_expires_at
    where public.system_monitor_leases.lease_expires_at <= clock_timestamp()
       or public.system_monitor_leases.owner_id = excluded.owner_id
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.claim_system_health_manual_refresh(
  p_environment text,
  p_requested_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean;
begin
  if p_environment is null or p_environment not in ('production', 'staging', 'local')
    or p_requested_at is null
    or p_requested_at > clock_timestamp() + interval '30 seconds'
    or p_requested_at < clock_timestamp() - interval '30 seconds' then
    raise exception using errcode = '22023', message = 'invalid system health refresh request';
  end if;

  insert into public.system_health_refresh_limits (environment, last_requested_at, updated_at)
  values (p_environment, p_requested_at, clock_timestamp())
  on conflict (environment) do update
    set last_requested_at = excluded.last_requested_at,
        updated_at = clock_timestamp()
    where public.system_health_refresh_limits.last_requested_at <= excluded.last_requested_at - interval '60 seconds'
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.system_monitor_health_probe()
returns boolean
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  select true;
$$;

create or replace function public.record_system_monitor_worker_heartbeat(
  p_job_name text,
  p_execution_id uuid,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_completion_status text,
  p_reason_code text,
  p_release_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_job_name is null or p_execution_id is null or p_started_at is null or p_finished_at is null
    or p_completion_status not in ('succeeded', 'failed')
    or p_finished_at < p_started_at
    or p_finished_at > clock_timestamp() + interval '30 seconds'
    or p_reason_code is not null and p_reason_code !~ '^[A-Z][A-Z0-9_]{0,63}$'
    or not exists (
      select 1 from public.system_monitor_worker_config config
      where config.job_name = p_job_name and config.enabled
    ) then
    raise exception using errcode = '22023', message = 'invalid system monitor worker heartbeat';
  end if;

  insert into public.system_monitor_worker_heartbeats (
    job_name, execution_id, started_at, finished_at, completion_status, reason_code, release_id
  ) values (
    p_job_name, p_execution_id, p_started_at, p_finished_at,
    p_completion_status, p_reason_code, left(p_release_id, 100)
  )
  on conflict (job_name, execution_id) do update
    set started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        completion_status = excluded.completion_status,
        reason_code = excluded.reason_code,
        release_id = excluded.release_id,
        observed_at = clock_timestamp();
  return true;
end;
$$;

create or replace function public.get_system_monitor_kael_evidence(
  p_environment text,
  p_since timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_valid_runs integer;
  v_failed_runs integer;
  v_api_calls integer;
  v_api_failures integer;
  v_fallback_calls integer;
  v_recent_api_calls integer;
  v_open_circuits integer;
  v_learning_eligible integer;
  v_learning_oldest_due timestamptz;
begin
  if p_environment not in ('production', 'staging', 'local') or p_since > clock_timestamp()
    or p_since < clock_timestamp() - interval '1 hour' then
    raise exception using errcode = '22023', message = 'invalid Kael evidence window';
  end if;

  select count(*)::integer,
         count(*) filter (where run.status = 'failed')::integer
  into v_valid_runs, v_failed_runs
  from public.harness_runs run
  where run.environment = p_environment
    and run.started_at >= p_since
    and run.started_at <= clock_timestamp()
    and (run.route_kind ilike '%kael%' or coalesce(run.capability, '') ilike '%kael%')
    and run.status in ('completed', 'failed')
    and coalesce(run.error_code, '') !~* '^(POLICY|VALIDATION|AUTHZ|AUTHENTICATION|WAITING|OUT_OF_SCOPE|FORBIDDEN|RATE_LIMITED)(_|$)';

  select count(*)::integer,
         count(*) filter (where not log.success)::integer,
         count(*) filter (where log.fallback_used)::integer,
         count(*) filter (where log.created_at >= clock_timestamp() - interval '15 minutes')::integer
  into v_api_calls, v_api_failures, v_fallback_calls, v_recent_api_calls
  from public.api_logs log
  where log.created_at >= p_since
    and log.created_at <= clock_timestamp()
    and log.purpose is not null;

  select count(*)::integer into v_open_circuits
  from public.kael_provider_circuit circuit
  where circuit.open_until > clock_timestamp();

  select count(*)::integer, min(queue.run_after)
  into v_learning_eligible, v_learning_oldest_due
  from public.kael_learning_queue queue
  where queue.queue_state = 'pending' and queue.run_after <= clock_timestamp();

  return jsonb_build_object(
    'valid_execution_count', v_valid_runs,
    'failed_execution_count', v_failed_runs,
    'api_call_count', v_api_calls,
    'api_failure_count', v_api_failures,
    'fallback_count', v_fallback_calls,
    'api_call_count_15m', v_recent_api_calls,
    'open_circuit_count', v_open_circuits,
    'learning_eligible_count', v_learning_eligible,
    'learning_oldest_due_at', v_learning_oldest_due
  );
end;
$$;

create or replace function public.get_system_monitor_mobile_evidence(
  p_environment text,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_active_sessions integer;
  v_api_failures integer;
  v_platform_count integer;
  v_latest_release_id text;
  v_latest_build_id text;
  v_latest_platform text;
begin
  if p_environment not in ('production', 'staging', 'local')
    or p_now > clock_timestamp() + interval '30 seconds'
    or p_now < clock_timestamp() - interval '1 minute' then
    raise exception using errcode = '22023', message = 'invalid mobile evidence window';
  end if;

  select count(*)::integer,
         count(*) filter (where observation.api_status in ('yellow', 'red'))::integer,
         count(distinct observation.platform)::integer
  into v_active_sessions, v_api_failures, v_platform_count
  from public.system_mobile_health_observations observation
  where observation.environment = p_environment
    and observation.last_observed_at >= p_now - interval '180 seconds'
    and observation.last_observed_at <= p_now;

  select observation.release_id, observation.build_id, observation.platform
  into v_latest_release_id, v_latest_build_id, v_latest_platform
  from public.system_mobile_health_observations observation
  where observation.environment = p_environment
    and observation.last_observed_at >= p_now - interval '180 seconds'
    and observation.last_observed_at <= p_now
  order by observation.last_observed_at desc
  limit 1;

  return jsonb_build_object(
    'active_session_count', v_active_sessions,
    'api_failure_count', v_api_failures,
    'platform_count', v_platform_count,
    'latest_release_id', v_latest_release_id,
    'latest_build_id', v_latest_build_id,
    'latest_platform', v_latest_platform
  );
end;
$$;

create or replace function public.record_system_mobile_observation(
  p_environment text,
  p_session_hash text,
  p_actor_hash text,
  p_platform text,
  p_release_id text,
  p_build_id text,
  p_last_observed_at timestamptz,
  p_api_status text,
  p_reason_code text,
  p_duration_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_saved boolean;
  v_actor_rate_limited boolean;
  v_now timestamptz := clock_timestamp();
begin
  if p_environment is null or p_environment not in ('production', 'staging', 'local')
    or p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$'
    or p_actor_hash is null or p_actor_hash !~ '^[a-f0-9]{64}$'
    or p_platform is null or p_platform not in ('ios', 'android')
    or p_api_status is null or p_api_status not in ('green', 'yellow', 'red', 'gray')
    or p_reason_code is null or p_reason_code !~ '^[A-Z][A-Z0-9_]{0,63}$'
    or p_duration_ms is not null and p_duration_ms not between 0 and 60000
    or p_last_observed_at is null
    or p_last_observed_at > clock_timestamp() + interval '30 seconds'
    or p_last_observed_at < clock_timestamp() - interval '5 minutes' then
    raise exception using errcode = '22023', message = 'invalid mobile health observation';
  end if;

  if exists (
    select 1 from public.system_mobile_health_observations observation
    where observation.environment = p_environment
      and observation.session_hash = p_session_hash
      and observation.last_observed_at > p_last_observed_at - interval '60 seconds'
  ) then
    return false;
  end if;

  insert into public.system_mobile_health_actor_rate_limits as actor_limit (
    environment, actor_hash, last_accepted_at
  ) values (p_environment, p_actor_hash, v_now)
  on conflict (environment, actor_hash) do update
    set last_accepted_at = excluded.last_accepted_at
    where actor_limit.last_accepted_at <= excluded.last_accepted_at - interval '60 seconds'
  returning true into v_actor_rate_limited;

  if not coalesce(v_actor_rate_limited, false) then
    return false;
  end if;

  insert into public.system_mobile_health_observations (
    environment, session_hash, platform, release_id, build_id, last_observed_at,
    api_status, reason_code, duration_ms, updated_at
  ) values (
    p_environment, p_session_hash, p_platform, left(p_release_id, 100), left(p_build_id, 100),
    p_last_observed_at, p_api_status, p_reason_code, p_duration_ms, clock_timestamp()
  )
  on conflict (environment, session_hash) do update
    set platform = excluded.platform,
        release_id = excluded.release_id,
        build_id = excluded.build_id,
        last_observed_at = excluded.last_observed_at,
        api_status = excluded.api_status,
        reason_code = excluded.reason_code,
        duration_ms = excluded.duration_ms,
        updated_at = excluded.updated_at
    where public.system_mobile_health_observations.last_observed_at <= excluded.last_observed_at - interval '60 seconds'
  returning true into v_saved;

  return coalesce(v_saved, false);
end;
$$;

create or replace function public.record_system_health_snapshot(p_snapshot jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_environment text := p_snapshot->>'environment';
  v_scheduled_at timestamptz := (p_snapshot->>'scheduled_at')::timestamptz;
  v_completed_at timestamptz := (p_snapshot->>'completed_at')::timestamptz;
  v_overall_status text := p_snapshot->>'overall_status';
  v_expected_status text;
  v_snapshot_id uuid;
  v_incident_id uuid;
  v_existing_incident_id uuid;
  v_existing_severity text;
  v_existing_reason_code text;
  v_event_kind text;
  v_incident_release_id text;
  v_incident_build_id text;
  v_incident_platform text;
  v_check jsonb;
  v_checks jsonb := '[]'::jsonb;
  v_check_index integer := 0;
  v_fingerprint text;
  v_status text;
  v_rows integer;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' or octet_length(p_snapshot::text) > 2048
    or p_snapshot->>'schema_version' is distinct from '1'
    or v_environment is null or v_environment not in ('production', 'staging', 'local')
    or p_snapshot->>'overall_status' is null
    or v_scheduled_at is null or v_completed_at is null
    or v_scheduled_at > clock_timestamp() + interval '30 seconds'
    or v_completed_at < v_scheduled_at
    or v_completed_at > clock_timestamp() + interval '60 seconds'
    or (p_snapshot->>'expires_at')::timestamptz <= v_completed_at
    or jsonb_typeof(p_snapshot->'checks') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid system health snapshot';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_snapshot->'checks') as check_row
    where check_row->>'status' is null or check_row->>'status' not in ('green', 'yellow', 'red', 'gray')
      or check_row->>'reason_code' is null or check_row->>'reason_code' !~ '^[A-Z][A-Z0-9_]{0,63}$'
      or check_row->>'check_id' is null or check_row->>'check_id' !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
      or check_row->>'component' is null or check_row->>'component' !~ '^[a-z0-9][a-z0-9._-]{0,39}$'
      or jsonb_typeof(check_row->'metrics') <> 'object'
      or exists (
        select 1 from jsonb_each(case when jsonb_typeof(check_row->'metrics') = 'object' then check_row->'metrics' else '{}'::jsonb end) as metric
        where jsonb_typeof(metric.value) not in ('number', 'boolean', 'null')
      )
  ) then
    raise exception using errcode = '22023', message = 'invalid system health check';
  end if;

  if (select count(*) <> count(distinct check_row->>'check_id')
      from jsonb_array_elements(p_snapshot->'checks') as check_row) then
    raise exception using errcode = '22023', message = 'duplicate system health check id';
  end if;

  select case
    when count(*) = 0 then 'gray'
    when bool_or(check_row->>'status' = 'red') then 'red'
    when bool_or(check_row->>'status' = 'yellow') then 'yellow'
    when bool_or(check_row->>'status' = 'gray') then 'gray'
    else 'green'
  end
  into v_expected_status
  from jsonb_array_elements(p_snapshot->'checks') as check_row;

  if v_expected_status <> v_overall_status then
    raise exception using errcode = '22023', message = 'system health status does not match its checks';
  end if;

  insert into public.system_health_snapshots (
    schema_version, environment, project_ref, release_id, scheduled_at,
    completed_at, expires_at, overall_status, checks
  ) values (
    1, v_environment, p_snapshot->>'project_ref', p_snapshot->>'release_id',
    date_trunc('minute', v_scheduled_at), v_completed_at,
    (p_snapshot->>'expires_at')::timestamptz, v_overall_status, p_snapshot->'checks'
  )
  on conflict (environment, scheduled_at) do update
    set project_ref = excluded.project_ref,
        release_id = excluded.release_id,
        completed_at = excluded.completed_at,
        expires_at = excluded.expires_at,
        overall_status = excluded.overall_status,
        checks = excluded.checks
    where public.system_health_snapshots.completed_at < excluded.completed_at
  returning snapshot_id into v_snapshot_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;

  for v_check in select value from jsonb_array_elements(p_snapshot->'checks') loop
    v_status := v_check->>'status';
    v_fingerprint := lower(v_environment || ':' || (v_check->>'component') || ':' || (v_check->>'check_id'));
    v_incident_id := null;
    v_existing_incident_id := null;
    v_existing_severity := null;
    v_existing_reason_code := null;
    v_incident_release_id := p_snapshot->>'release_id';
    v_incident_build_id := null;
    v_incident_platform := null;
    if v_check->>'component' = 'app' then
      select observation.release_id, observation.build_id, observation.platform
      into v_incident_release_id, v_incident_build_id, v_incident_platform
      from public.system_mobile_health_observations observation
      where observation.environment = v_environment
        and observation.last_observed_at >= v_completed_at - interval '180 seconds'
        and observation.last_observed_at <= v_completed_at
      order by observation.last_observed_at desc
      limit 1;
    end if;

    if v_status in ('yellow', 'red') then
      select incident_id, severity, evidence->>'reason_code'
      into v_existing_incident_id, v_existing_severity, v_existing_reason_code
      from public.system_health_incidents
      where environment = v_environment and fingerprint = v_fingerprint and status = 'open'
      for update;
      insert into public.system_health_incidents (
        environment, fingerprint, component, detector, severity, status, opened_at,
        updated_at, last_seen_at, occurrence_count, evidence, release_id, build_id, platform
      ) values (
        v_environment, v_fingerprint, v_check->>'component', v_check->>'check_id',
        v_status, 'open', v_completed_at, v_completed_at, v_completed_at, 1,
        jsonb_build_object('reason_code', v_check->>'reason_code', 'observed_at', v_check->>'observed_at', 'metrics', v_check->'metrics'),
        v_incident_release_id, v_incident_build_id, v_incident_platform
      )
      on conflict (environment, fingerprint) where status = 'open' do update
        set severity = excluded.severity,
            updated_at = excluded.updated_at,
            last_seen_at = excluded.last_seen_at,
            occurrence_count = public.system_health_incidents.occurrence_count + 1,
            evidence = excluded.evidence,
            release_id = coalesce(excluded.release_id, public.system_health_incidents.release_id),
            build_id = coalesce(excluded.build_id, public.system_health_incidents.build_id),
            platform = coalesce(excluded.platform, public.system_health_incidents.platform)
      returning incident_id into v_incident_id;
      v_event_kind := case
        when v_existing_incident_id is null then 'opened'
        when v_existing_severity is distinct from v_status or v_existing_reason_code is distinct from (v_check->>'reason_code') then 'updated'
        else null
      end;
      if v_event_kind is not null then
        insert into public.system_health_incident_events (
          incident_id, event_kind, recorded_at, status, severity, reason_code, metrics
        ) values (
          v_incident_id, v_event_kind, v_completed_at, 'open', v_status,
          v_check->>'reason_code', v_check->'metrics'
        ) on conflict (incident_id, event_kind, recorded_at) do nothing;
      end if;
    elsif v_status = 'green' then
      update public.system_health_incidents
      set status = 'resolved', resolved_at = v_completed_at, updated_at = v_completed_at,
          last_seen_at = v_completed_at,
          evidence = jsonb_build_object('reason_code', v_check->>'reason_code', 'observed_at', v_check->>'observed_at', 'metrics', v_check->'metrics')
      where environment = v_environment and fingerprint = v_fingerprint and status = 'open'
      returning incident_id into v_incident_id;
      if v_incident_id is not null then
        insert into public.system_health_incident_events (
          incident_id, event_kind, recorded_at, status, severity, reason_code, metrics
        ) values (
          v_incident_id, 'resolved', v_completed_at, 'resolved',
          coalesce((select severity from public.system_health_incidents where incident_id = v_incident_id), 'yellow'),
          v_check->>'reason_code', v_check->'metrics'
        ) on conflict (incident_id, event_kind, recorded_at) do nothing;
      end if;
      if v_incident_id is null then
        select incident_id into v_incident_id
        from public.system_health_incidents
        where environment = v_environment and fingerprint = v_fingerprint
        order by opened_at desc limit 1;
      end if;
    else
      select incident_id into v_incident_id
      from public.system_health_incidents
      where environment = v_environment and fingerprint = v_fingerprint and status = 'open'
      order by opened_at desc limit 1;
    end if;

    v_checks := v_checks || jsonb_set(v_check, '{incident_id}', coalesce(to_jsonb(v_incident_id), 'null'::jsonb), true);
    v_check_index := v_check_index + 1;
  end loop;

  update public.system_health_snapshots
  set checks = v_checks
  where snapshot_id = v_snapshot_id;

  insert into public.system_health_observer_state (
    environment, last_snapshot_at, updated_at
  ) values (v_environment, v_completed_at, clock_timestamp())
  on conflict (environment) do update
    set last_snapshot_at = excluded.last_snapshot_at,
        updated_at = excluded.updated_at;

  return true;
end;
$$;

create or replace function public.record_system_monitor_external_incident(
  p_external_incident_id uuid,
  p_environment text,
  p_status text,
  p_opened_at timestamptz,
  p_reason_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_incident_id uuid;
  v_existing_status text;
  v_existing_reason text;
  v_existing_severity text;
  v_event_kind text;
  v_now timestamptz := clock_timestamp();
begin
  if p_external_incident_id is null
    or p_environment is null or p_environment not in ('production', 'staging', 'local')
    or p_status is null or p_status not in ('open', 'resolved')
    or p_opened_at is null or p_opened_at > v_now + interval '30 seconds' or p_opened_at < v_now - interval '30 days'
    or p_reason_code is null or p_reason_code !~ '^[A-Z][A-Z0-9_]{0,63}$' then
    raise exception using errcode = '22023', message = 'invalid external monitor incident';
  end if;

  select incident_id, status, evidence->>'reason_code', severity
  into v_incident_id, v_existing_status, v_existing_reason, v_existing_severity
  from public.system_health_incidents
  where external_incident_id = p_external_incident_id
  for update;

  if p_status = 'open' then
    if v_incident_id is null then
      insert into public.system_health_incidents (
        external_incident_id, environment, fingerprint, component, detector, severity, status,
        opened_at, updated_at, last_seen_at, occurrence_count, evidence, platform
      ) values (
        p_external_incident_id, p_environment,
        p_environment || ':observer:cloudflare:' || p_external_incident_id::text,
        'observer', 'cloudflare-observer', 'red', 'open', p_opened_at, v_now, v_now, 1,
        jsonb_build_object('reason_code', p_reason_code, 'source', 'cloudflare-observer'), 'worker'
      ) returning incident_id into v_incident_id;
      v_event_kind := 'opened';
    elsif v_existing_status <> 'open' then
      return false;
    else
      update public.system_health_incidents
      set updated_at = v_now,
          last_seen_at = v_now,
          occurrence_count = occurrence_count + 1,
          evidence = jsonb_build_object('reason_code', p_reason_code, 'source', 'cloudflare-observer')
      where incident_id = v_incident_id;
      if v_existing_reason is distinct from p_reason_code then v_event_kind := 'updated'; end if;
    end if;
    if v_event_kind is not null then
      insert into public.system_health_incident_events (
        incident_id, event_kind, recorded_at, status, severity, reason_code, metrics
      ) values (v_incident_id, v_event_kind, v_now, 'open', 'red', p_reason_code, '{}'::jsonb)
      on conflict (incident_id, event_kind, recorded_at) do nothing;
    end if;
    return true;
  end if;

  if v_incident_id is null or v_existing_status = 'resolved' then return true; end if;
  update public.system_health_incidents
  set status = 'resolved', resolved_at = v_now, updated_at = v_now, last_seen_at = v_now,
      evidence = jsonb_build_object('reason_code', p_reason_code, 'source', 'cloudflare-observer')
  where incident_id = v_incident_id;
  insert into public.system_health_incident_events (
    incident_id, event_kind, recorded_at, status, severity, reason_code, metrics
  ) values (v_incident_id, 'resolved', v_now, 'resolved', coalesce(v_existing_severity, 'red'), p_reason_code, '{}'::jsonb)
  on conflict (incident_id, event_kind, recorded_at) do nothing;
  return true;
end;
$$;

create or replace function public.record_system_monitor_observer_heartbeat(
  p_environment text,
  p_dispatcher_status text,
  p_d1_status text,
  p_error_code text,
  p_observed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.system_health_observer_state%rowtype;
  v_incident_id uuid;
  v_opened_at timestamptz;
  v_reason text;
  v_transition text := 'none';
begin
  if p_environment is null or p_environment not in ('production', 'staging', 'local')
    or p_dispatcher_status is null or p_dispatcher_status not in ('green', 'yellow', 'red', 'gray')
    or p_d1_status is null or p_d1_status not in ('green', 'yellow', 'red', 'gray')
    or p_error_code is not null and p_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$'
    or p_observed_at is null or p_observed_at > clock_timestamp() + interval '30 seconds'
    or p_observed_at < clock_timestamp() - interval '2 minutes' then
    raise exception using errcode = '22023', message = 'invalid observer heartbeat';
  end if;

  insert into public.system_health_observer_state (environment, updated_at)
  values (p_environment, p_observed_at)
  on conflict (environment) do nothing;

  select * into v_state
  from public.system_health_observer_state
  where environment = p_environment
  for update;

  v_incident_id := v_state.active_dispatcher_incident_id;
  v_opened_at := v_state.dispatcher_incident_opened_at;
  v_reason := v_state.dispatcher_incident_reason;
  if p_dispatcher_status = 'green' then
    if v_incident_id is not null then
      v_transition := 'resolved';
    end if;
    v_incident_id := null;
    v_opened_at := null;
    v_reason := null;
  elsif v_incident_id is null then
    v_incident_id := gen_random_uuid();
    v_opened_at := p_observed_at;
    v_reason := coalesce(p_error_code, 'DISPATCHER_UNAVAILABLE');
    v_transition := 'opened';
  else
    v_reason := coalesce(p_error_code, v_reason, 'DISPATCHER_UNAVAILABLE');
  end if;

  update public.system_health_observer_state
  set observer_heartbeat_at = p_observed_at,
      dispatcher_status = p_dispatcher_status,
      d1_status = p_d1_status,
      last_error_code = p_error_code,
      active_dispatcher_incident_id = v_incident_id,
      dispatcher_incident_opened_at = v_opened_at,
      dispatcher_incident_reason = v_reason,
      updated_at = p_observed_at
  where environment = p_environment;

  return jsonb_build_object(
    'transition', v_transition,
    'incident_id', coalesce(v_incident_id, case when v_transition = 'resolved' then v_state.active_dispatcher_incident_id end),
    'opened_at', coalesce(v_opened_at, case when v_transition = 'resolved' then v_state.dispatcher_incident_opened_at end),
    'reason_code', coalesce(v_reason, v_state.dispatcher_incident_reason, p_error_code, 'DISPATCHER_UNAVAILABLE')
  );
end;
$$;

create or replace function public.claim_system_health_delivery(
  p_dedupe_key text,
  p_delivery_kind text,
  p_now timestamptz,
  p_lease_seconds integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean;
begin
  if p_dedupe_key is null or p_dedupe_key !~ '^[a-zA-Z0-9._:-]{1,240}$'
    or p_delivery_kind is null or p_delivery_kind not in ('observer_down', 'dispatcher_down', 'fallback_alert', 'recovery')
    or p_now is null or p_now > clock_timestamp() + interval '30 seconds'
    or p_lease_seconds is null or p_lease_seconds not between 5 and 120 then
    raise exception using errcode = '22023', message = 'invalid monitor delivery claim';
  end if;

  insert into public.system_health_deliveries (dedupe_key, delivery_kind, status, created_at, updated_at)
  values (p_dedupe_key, p_delivery_kind, 'pending', p_now, p_now)
  on conflict (dedupe_key) do nothing;

  update public.system_health_deliveries
  set status = 'pending', attempt_count = attempt_count + 1,
      last_attempt_at = p_now, lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
      next_attempt_at = null, error_code = null, updated_at = p_now
  where dedupe_key = p_dedupe_key
    and status <> 'delivered'
    and (lease_expires_at is null or lease_expires_at <= p_now)
    and (next_attempt_at is null or next_attempt_at <= p_now)
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.complete_system_health_delivery(
  p_dedupe_key text,
  p_delivered boolean,
  p_retry_at timestamptz,
  p_error_code text,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_completed boolean;
begin
  if p_dedupe_key is null or p_dedupe_key !~ '^[a-zA-Z0-9._:-]{1,240}$'
    or p_delivered is null
    or p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,64}$'
    or p_now is null or p_now > clock_timestamp() + interval '30 seconds'
    or p_delivered and (p_retry_at is not null or p_error_code is not null)
    or not p_delivered and (p_retry_at is null or p_retry_at < p_now or p_retry_at > p_now + interval '1 day') then
    raise exception using errcode = '22023', message = 'invalid monitor delivery completion';
  end if;

  update public.system_health_deliveries
  set status = case when p_delivered then 'delivered' else 'failed' end,
      delivered_at = case when p_delivered then p_now else null end,
      next_attempt_at = case when p_delivered then null else p_retry_at end,
      error_code = case when p_delivered then null else p_error_code end,
      lease_expires_at = null,
      updated_at = p_now
  where dedupe_key = p_dedupe_key
    and last_attempt_at = p_now
    and lease_expires_at > clock_timestamp()
  returning true into v_completed;
  return coalesce(v_completed, false);
end;
$$;

create or replace function public.get_system_monitor_worker_evidence()
returns jsonb
language sql
security definer
set search_path = public, cron, pg_catalog, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'job_name', config.job_name,
    'schedule_kind', config.schedule_kind,
    'expected_interval_seconds', config.expected_interval_seconds,
    'daily_utc_hour', config.daily_utc_hour,
    'daily_utc_minute', config.daily_utc_minute,
    'grace_seconds', config.grace_seconds,
    'config_version', config.config_version,
    'enabled', config.enabled,
    'cron_enabled', job.active,
    'last_status', coalesce(heartbeat.completion_status, last_run.status),
    'last_started_at', coalesce(heartbeat.started_at, last_run.start_time),
    'last_finished_at', coalesce(heartbeat.finished_at, last_run.end_time),
    'last_reason_code', heartbeat.reason_code,
    'last_release_id', heartbeat.release_id
  ) order by config.job_name), '[]'::jsonb)
  from public.system_monitor_worker_config config
  left join cron.job job on job.jobname = config.job_name
  left join lateral (
    select item.started_at, item.finished_at, item.completion_status, item.reason_code, item.release_id
    from public.system_monitor_worker_heartbeats item
    where item.job_name = config.job_name
    order by item.finished_at desc
    limit 1
  ) heartbeat on config.job_name in ('kael-matching-maintainer', 'payment-maintainer', 'kael-learning-monitor')
  left join lateral (
    select run.status, run.start_time, run.end_time
    from cron.job_run_details run
    where run.jobid = job.jobid
    order by run.start_time desc
    limit 1
  ) last_run on true;
$$;

create or replace function private.prune_system_health_data(p_batch_limit integer default 2000)
returns table (snapshots_deleted integer, resolved_incidents_deleted integer, deliveries_deleted integer, mobile_observations_deleted integer, leases_deleted integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_batch_limit not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'invalid system health cleanup batch';
  end if;

  with doomed as (
    select snapshot_id from public.system_health_snapshots
    where scheduled_at < clock_timestamp() - interval '7 days'
    order by scheduled_at limit p_batch_limit
  ) delete from public.system_health_snapshots item using doomed where item.snapshot_id = doomed.snapshot_id;
  get diagnostics snapshots_deleted = row_count;

  with doomed as (
    select incident_id from public.system_health_incidents
    where status = 'resolved' and resolved_at < clock_timestamp() - interval '30 days'
    order by resolved_at limit p_batch_limit
  ) delete from public.system_health_incidents item using doomed where item.incident_id = doomed.incident_id;
  get diagnostics resolved_incidents_deleted = row_count;

  with doomed as (
    select delivery_id from public.system_health_deliveries
    where status <> 'pending' and created_at < clock_timestamp() - interval '30 days'
    order by created_at limit p_batch_limit
  ) delete from public.system_health_deliveries item using doomed where item.delivery_id = doomed.delivery_id;
  get diagnostics deliveries_deleted = row_count;

  with doomed as (
    select environment, session_hash from public.system_mobile_health_observations
    where last_observed_at < clock_timestamp() - interval '7 days'
    order by last_observed_at limit p_batch_limit
  ) delete from public.system_mobile_health_observations item using doomed
    where item.environment = doomed.environment and item.session_hash = doomed.session_hash;
  get diagnostics mobile_observations_deleted = row_count;

  with doomed as (
    select environment, actor_hash from public.system_mobile_health_actor_rate_limits
    where last_accepted_at < clock_timestamp() - interval '7 days'
    order by last_accepted_at limit p_batch_limit
  ) delete from public.system_mobile_health_actor_rate_limits item using doomed
    where item.environment = doomed.environment and item.actor_hash = doomed.actor_hash;

  with doomed as (
    select environment, scheduled_at from public.system_monitor_leases
    where lease_expires_at < clock_timestamp() - interval '1 day'
    order by scheduled_at limit p_batch_limit
  ) delete from public.system_monitor_leases item using doomed
    where item.environment = doomed.environment and item.scheduled_at = doomed.scheduled_at;
  get diagnostics leases_deleted = row_count;

  return next;
end;
$$;

revoke all on function public.claim_system_health_run(text, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_system_health_manual_refresh(text, timestamptz) from public, anon, authenticated;
revoke all on function public.system_monitor_health_probe() from public, anon, authenticated;
revoke all on function public.record_system_mobile_observation(text, text, text, text, text, text, timestamptz, text, text, integer) from public, anon, authenticated;
revoke all on function public.record_system_health_snapshot(jsonb) from public, anon, authenticated;
revoke all on function public.record_system_monitor_external_incident(uuid, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.record_system_monitor_observer_heartbeat(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_system_health_delivery(text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.complete_system_health_delivery(text, boolean, timestamptz, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_system_monitor_worker_evidence() from public, anon, authenticated;
revoke all on function public.record_system_monitor_worker_heartbeat(text, uuid, timestamptz, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.get_system_monitor_kael_evidence(text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_system_monitor_mobile_evidence(text, timestamptz) from public, anon, authenticated;
revoke all on function private.prune_system_health_data(integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_system_health_run(text, timestamptz, uuid, integer) to service_role;
grant execute on function public.claim_system_health_manual_refresh(text, timestamptz) to service_role;
grant execute on function public.system_monitor_health_probe() to service_role;
grant execute on function public.record_system_mobile_observation(text, text, text, text, text, text, timestamptz, text, text, integer) to service_role;
grant execute on function public.record_system_health_snapshot(jsonb) to service_role;
grant execute on function public.record_system_monitor_external_incident(uuid, text, text, timestamptz, text) to service_role;
grant execute on function public.record_system_monitor_observer_heartbeat(text, text, text, text, timestamptz) to service_role;
grant execute on function public.claim_system_health_delivery(text, text, timestamptz, integer) to service_role;
grant execute on function public.complete_system_health_delivery(text, boolean, timestamptz, text, timestamptz) to service_role;
grant execute on function public.get_system_monitor_worker_evidence() to service_role;
grant execute on function public.record_system_monitor_worker_heartbeat(text, uuid, timestamptz, timestamptz, text, text, text) to service_role;
grant execute on function public.get_system_monitor_kael_evidence(text, timestamptz) to service_role;
grant execute on function public.get_system_monitor_mobile_evidence(text, timestamptz) to service_role;
grant execute on function private.prune_system_health_data(integer) to postgres;

do $$
begin
  if to_regclass('cron.job') is null or to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'system-health-monitor') then
    perform cron.unschedule('system-health-monitor');
  end if;

  if exists (select 1 from cron.job where jobname = 'system-health-retention') then
    perform cron.unschedule('system-health-retention');
  end if;
end;
$$;

create or replace function private.schedule_system_health_monitor()
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regclass('cron.job') is null then
    return false;
  end if;

  if exists (select 1 from cron.job where jobname = 'system-health-monitor') then
    perform cron.unschedule('system-health-monitor');
  end if;

  perform cron.schedule(
    'system-health-monitor', '* * * * *',
    $cron$
      with monitor_config as (
        select
          max(decrypted_secret) filter (where name = 'project_url') as project_url,
          max(decrypted_secret) filter (where name = 'system_health_monitor_secret') as monitor_secret
        from vault.decrypted_secrets
      )
      select net.http_post(
        url := rtrim(project_url, '/') || '/functions/v1/system-monitor',
        headers := jsonb_build_object('content-type', 'application/json', 'x-system-monitor-secret', monitor_secret),
        body := jsonb_build_object('scheduled_at', date_trunc('minute', clock_timestamp()))
      )
      from monitor_config
      where nullif(project_url, '') is not null and nullif(monitor_secret, '') is not null;
    $cron$
  );

  if exists (select 1 from cron.job where jobname = 'system-health-retention') then
    perform cron.unschedule('system-health-retention');
  end if;
  perform cron.schedule('system-health-retention', '13 3 * * *', 'select * from private.prune_system_health_data(2000)');
  return true;
end;
$$;

revoke all on function private.schedule_system_health_monitor() from public, anon, authenticated, service_role;
grant execute on function private.schedule_system_health_monitor() to postgres;

select private.schedule_system_health_monitor();

comment on table public.system_health_snapshots is 'Minute health snapshots; retained for seven days and written only by system monitor service roles.';
comment on table public.system_health_incidents is 'Allowlisted, privacy-filtered system health incident lifecycle; resolved history retained for 30 days.';
comment on table public.system_health_incident_events is 'Append-only, allowlisted lifecycle transitions for system health incidents.';
comment on table public.system_health_deliveries is 'Supabase fallback alert delivery ledger for observer or dispatcher outages.';
comment on table public.system_mobile_health_observations is 'Hashed native-session health observations with no user identifiers; retained for seven days.';
comment on table public.system_mobile_health_actor_rate_limits is 'Per-environment hashed mobile actor write limiter; records expire after seven inactive days.';
comment on table public.system_health_observer_state is 'Latest external observer and dispatcher heartbeat by environment.';
comment on table public.system_health_refresh_limits is 'Owner-triggered refresh cooldowns, limited to one request per environment per minute.';
comment on table public.system_monitor_worker_heartbeats is 'Completion evidence emitted by Edge scheduled workers; records no business payload.';
comment on table public.system_monitor_source_state is 'Bounded source polling/backoff state for read-only health integrations.';

-- Rollback: unschedule system-health-monitor and system-health-retention; drop only the system_health_* and system_monitor_* objects created here.
