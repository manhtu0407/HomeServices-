begin;

create table if not exists public.harness_runs (
  run_id uuid primary key,
  trace_id uuid not null,
  parent_run_id uuid references public.harness_runs(run_id),
  actor_id_hash text,
  actor_role text,
  route_kind text not null,
  capability text,
  environment text not null check (environment in ('local', 'preview', 'staging', 'production')),
  release_id text not null,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled', 'suspended')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  constraint harness_runs_actor_hash_shape check (
    actor_id_hash is null or actor_id_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint harness_runs_metadata_bound check (
    octet_length(safe_metadata::text) <= 8192
  )
);

create index if not exists harness_runs_trace_idx
  on public.harness_runs(trace_id, started_at desc);
create index if not exists harness_runs_release_idx
  on public.harness_runs(release_id, started_at desc);
create index if not exists harness_runs_job_idx
  on public.harness_runs(job_id, started_at desc)
  where job_id is not null;

create table if not exists public.harness_events (
  event_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.harness_runs(run_id) on delete cascade,
  trace_id uuid not null,
  parent_event_id uuid references public.harness_events(event_id),
  turn_id uuid,
  tool_call_id uuid,
  event_class text not null,
  stage text,
  status text not null check (status in ('started', 'succeeded', 'failed', 'blocked', 'cancelled', 'observed')),
  attempt_number integer not null default 1 check (attempt_number > 0),
  tool_id text,
  provider text,
  model text,
  cost_usd numeric(14, 8) check (cost_usd is null or cost_usd >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  release_id text not null,
  environment text not null check (environment in ('local', 'preview', 'staging', 'production')),
  error_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint harness_events_metadata_bound check (
    octet_length(safe_metadata::text) <= 8192
  )
);

create index if not exists harness_events_run_idx
  on public.harness_events(run_id, occurred_at, event_id);
create index if not exists harness_events_tool_call_idx
  on public.harness_events(tool_call_id, occurred_at)
  where tool_call_id is not null;
create index if not exists harness_events_release_idx
  on public.harness_events(release_id, occurred_at desc);
create index if not exists harness_events_provider_idx
  on public.harness_events(provider, occurred_at desc)
  where provider is not null;

create table if not exists public.harness_privileged_operations (
  operation_event_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.harness_runs(run_id) on delete cascade,
  trace_id uuid not null,
  actor_id_hash text,
  actor_role text,
  operation_id text not null,
  capability text not null,
  reason text not null,
  resource_type text not null,
  resource_id_hash text,
  result text not null check (result in ('allowed', 'succeeded', 'failed', 'denied')),
  release_id text not null,
  environment text not null check (environment in ('local', 'preview', 'staging', 'production')),
  error_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint harness_privileged_actor_hash_shape check (
    actor_id_hash is null or actor_id_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint harness_privileged_resource_hash_shape check (
    resource_id_hash is null or resource_id_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint harness_privileged_metadata_bound check (
    octet_length(safe_metadata::text) <= 8192
  )
);

create index if not exists harness_privileged_run_idx
  on public.harness_privileged_operations(run_id, occurred_at);
create index if not exists harness_privileged_operation_idx
  on public.harness_privileged_operations(operation_id, occurred_at desc);

alter table public.harness_runs enable row level security;
alter table public.harness_events enable row level security;
alter table public.harness_privileged_operations enable row level security;

create policy harness_runs_admin_read
  on public.harness_runs
  for select
  to authenticated
  using (private.is_admin());

create policy harness_events_admin_read
  on public.harness_events
  for select
  to authenticated
  using (private.is_admin());

create policy harness_privileged_admin_read
  on public.harness_privileged_operations
  for select
  to authenticated
  using (private.is_admin());

grant select on public.harness_runs to authenticated;
grant select on public.harness_events to authenticated;
grant select on public.harness_privileged_operations to authenticated;

create or replace function public.reject_harness_append_only_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'HARNESS_APPEND_ONLY';
end;
$$;

revoke all on function public.reject_harness_append_only_mutation() from public, anon, authenticated;
grant execute on function public.reject_harness_append_only_mutation() to service_role;

drop trigger if exists harness_releases_append_only on public.harness_releases;
create trigger harness_releases_append_only
before update or delete on public.harness_releases
for each row execute function public.reject_harness_append_only_mutation();

drop trigger if exists harness_release_events_append_only on public.harness_release_events;
create trigger harness_release_events_append_only
before update or delete on public.harness_release_events
for each row execute function public.reject_harness_append_only_mutation();

drop trigger if exists harness_events_append_only on public.harness_events;
create trigger harness_events_append_only
before update or delete on public.harness_events
for each row execute function public.reject_harness_append_only_mutation();

drop trigger if exists harness_privileged_append_only on public.harness_privileged_operations;
create trigger harness_privileged_append_only
before update or delete on public.harness_privileged_operations
for each row execute function public.reject_harness_append_only_mutation();

create or replace function public.begin_harness_run(
  p_run_id uuid,
  p_trace_id uuid,
  p_parent_run_id uuid,
  p_actor_id_hash text,
  p_actor_role text,
  p_route_kind text,
  p_capability text,
  p_environment text,
  p_release_id text,
  p_job_id uuid,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_environment not in ('local', 'preview', 'staging', 'production') then
    raise exception using errcode = '22023', message = 'HARNESS_ENVIRONMENT_INVALID';
  end if;
  if p_actor_id_hash is not null and p_actor_id_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'HARNESS_ACTOR_HASH_INVALID';
  end if;

  insert into public.harness_runs (
    run_id,
    trace_id,
    parent_run_id,
    actor_id_hash,
    actor_role,
    route_kind,
    capability,
    environment,
    release_id,
    job_id,
    safe_metadata
  ) values (
    p_run_id,
    p_trace_id,
    p_parent_run_id,
    p_actor_id_hash,
    p_actor_role,
    left(p_route_kind, 160),
    left(p_capability, 220),
    p_environment,
    left(p_release_id, 160),
    p_job_id,
    coalesce(p_safe_metadata, '{}'::jsonb)
  )
  on conflict (run_id) do nothing;

  return found;
end;
$$;

create or replace function public.append_harness_event(
  p_event_id uuid,
  p_run_id uuid,
  p_trace_id uuid,
  p_parent_event_id uuid,
  p_turn_id uuid,
  p_tool_call_id uuid,
  p_event_class text,
  p_stage text,
  p_status text,
  p_attempt_number integer,
  p_tool_id text,
  p_provider text,
  p_model text,
  p_cost_usd numeric,
  p_latency_ms integer,
  p_release_id text,
  p_environment text,
  p_error_code text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid := coalesce(p_event_id, gen_random_uuid());
begin
  insert into public.harness_events (
    event_id,
    run_id,
    trace_id,
    parent_event_id,
    turn_id,
    tool_call_id,
    event_class,
    stage,
    status,
    attempt_number,
    tool_id,
    provider,
    model,
    cost_usd,
    latency_ms,
    release_id,
    environment,
    error_code,
    safe_metadata
  ) values (
    v_event_id,
    p_run_id,
    p_trace_id,
    p_parent_event_id,
    p_turn_id,
    p_tool_call_id,
    left(p_event_class, 120),
    nullif(left(coalesce(p_stage, ''), 120), ''),
    p_status,
    greatest(coalesce(p_attempt_number, 1), 1),
    nullif(left(coalesce(p_tool_id, ''), 160), ''),
    nullif(left(coalesce(p_provider, ''), 80), ''),
    nullif(left(coalesce(p_model, ''), 160), ''),
    greatest(coalesce(p_cost_usd, 0), 0),
    greatest(coalesce(p_latency_ms, 0), 0),
    left(p_release_id, 160),
    p_environment,
    nullif(left(coalesce(p_error_code, ''), 120), ''),
    coalesce(p_safe_metadata, '{}'::jsonb)
  )
  on conflict (event_id) do nothing;
  return v_event_id;
end;
$$;

create or replace function public.finish_harness_run(
  p_run_id uuid,
  p_status text,
  p_duration_ms integer,
  p_error_code text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.harness_runs
  set status = p_status,
      finished_at = now(),
      duration_ms = greatest(coalesce(p_duration_ms, 0), 0),
      error_code = nullif(left(coalesce(p_error_code, ''), 120), ''),
      safe_metadata = safe_metadata || coalesce(p_safe_metadata, '{}'::jsonb)
  where run_id = p_run_id
    and status = 'running';
  return found;
end;
$$;

create or replace function public.record_harness_privileged_operation(
  p_operation_event_id uuid,
  p_run_id uuid,
  p_trace_id uuid,
  p_actor_id_hash text,
  p_actor_role text,
  p_operation_id text,
  p_capability text,
  p_reason text,
  p_resource_type text,
  p_resource_id_hash text,
  p_result text,
  p_release_id text,
  p_environment text,
  p_error_code text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_operation_event_id, gen_random_uuid());
begin
  insert into public.harness_privileged_operations (
    operation_event_id,
    run_id,
    trace_id,
    actor_id_hash,
    actor_role,
    operation_id,
    capability,
    reason,
    resource_type,
    resource_id_hash,
    result,
    release_id,
    environment,
    error_code,
    safe_metadata
  ) values (
    v_id,
    p_run_id,
    p_trace_id,
    p_actor_id_hash,
    p_actor_role,
    left(p_operation_id, 160),
    left(p_capability, 220),
    left(p_reason, 200),
    left(p_resource_type, 80),
    p_resource_id_hash,
    p_result,
    left(p_release_id, 160),
    p_environment,
    nullif(left(coalesce(p_error_code, ''), 120), ''),
    coalesce(p_safe_metadata, '{}'::jsonb)
  )
  on conflict (operation_event_id) do nothing;
  return v_id;
end;
$$;

revoke all on function public.begin_harness_run(uuid, uuid, uuid, text, text, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.append_harness_event(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, integer, text, text, text, numeric, integer, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.finish_harness_run(uuid, text, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_harness_privileged_operation(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.begin_harness_run(uuid, uuid, uuid, text, text, text, text, text, text, uuid, jsonb) to service_role;
grant execute on function public.append_harness_event(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, integer, text, text, text, numeric, integer, text, text, text, jsonb) to service_role;
grant execute on function public.finish_harness_run(uuid, text, integer, text, jsonb) to service_role;
grant execute on function public.record_harness_privileged_operation(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, jsonb) to service_role;

create or replace view public.harness_run_timeline
with (security_invoker = true)
as
select
  r.run_id,
  r.trace_id,
  r.release_id,
  r.environment,
  r.route_kind,
  r.capability,
  r.actor_role,
  r.job_id,
  r.status as run_status,
  r.started_at,
  r.finished_at,
  e.event_id,
  e.parent_event_id,
  e.turn_id,
  e.tool_call_id,
  e.event_class,
  e.stage,
  e.status as event_status,
  e.attempt_number,
  e.tool_id,
  e.provider,
  e.model,
  e.cost_usd,
  e.latency_ms,
  e.error_code,
  e.safe_metadata,
  e.occurred_at
from public.harness_runs r
left join public.harness_events e on e.run_id = r.run_id;

grant select on public.harness_run_timeline to authenticated;

comment on table public.harness_runs is 'Release-bound request runs with hashed actor identity and safe metadata only.';
comment on table public.harness_events is 'Append-only causal events for authentication, authorization, tools, providers, RPCs, budgets, and terminal state.';
comment on table public.harness_privileged_operations is 'Append-only evidence for service-role operations preserving actor, capability, resource class, trace, release, and environment.';

DO $$
begin
  if to_regclass('public.kael_ai_spend_log') is not null then
    alter table public.kael_ai_spend_log add column if not exists harness_run_id uuid;
    alter table public.kael_ai_spend_log add column if not exists harness_trace_id uuid;
    alter table public.kael_ai_spend_log add column if not exists harness_release_id text;
    alter table public.kael_ai_spend_log add column if not exists provider_attempt_id uuid;
    create index if not exists kael_ai_spend_harness_run_idx
      on public.kael_ai_spend_log(harness_run_id, created_at desc)
      where harness_run_id is not null;
  end if;
end;
$$;


create or replace function public.reserve_kael_ai_spend(
  p_actor_id uuid,
  p_estimated_usd numeric,
  p_purpose text,
  p_global_daily_cap numeric,
  p_user_daily_cap numeric,
  p_user_monthly_cap numeric,
  p_harness_run_id uuid,
  p_harness_trace_id uuid,
  p_harness_release_id text,
  p_provider_attempt_id uuid
)
returns table (
  allowed boolean,
  blocked_scope text,
  reservation_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select * into v_row
  from public.reserve_kael_ai_spend(
    p_actor_id,
    p_estimated_usd,
    p_purpose,
    p_global_daily_cap,
    p_user_daily_cap,
    p_user_monthly_cap
  );

  if v_row.allowed and v_row.reservation_id is not null then
    update public.kael_ai_spend_log
    set harness_run_id = p_harness_run_id,
        harness_trace_id = p_harness_trace_id,
        harness_release_id = nullif(left(coalesce(p_harness_release_id, ''), 160), ''),
        provider_attempt_id = p_provider_attempt_id
    where id = v_row.reservation_id;
  end if;

  return query select
    v_row.allowed::boolean,
    v_row.blocked_scope::text,
    v_row.reservation_id::bigint;
end;
$$;

create or replace function public.finalize_kael_ai_spend(
  p_reservation_id bigint,
  p_actual_usd numeric,
  p_purpose text,
  p_harness_run_id uuid,
  p_harness_trace_id uuid,
  p_harness_release_id text,
  p_provider_attempt_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.finalize_kael_ai_spend(
    p_reservation_id,
    p_actual_usd,
    p_purpose
  );
  update public.kael_ai_spend_log
  set harness_run_id = coalesce(p_harness_run_id, harness_run_id),
      harness_trace_id = coalesce(p_harness_trace_id, harness_trace_id),
      harness_release_id = coalesce(
        nullif(left(coalesce(p_harness_release_id, ''), 160), ''),
        harness_release_id
      ),
      provider_attempt_id = coalesce(p_provider_attempt_id, provider_attempt_id)
  where id = p_reservation_id;
end;
$$;

create or replace function public.record_kael_ai_spend(
  p_actor_id uuid,
  p_purpose text,
  p_cost_usd numeric,
  p_harness_run_id uuid,
  p_harness_trace_id uuid,
  p_harness_release_id text,
  p_provider_attempt_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_cost_usd, 0) <= 0 then
    return;
  end if;
  insert into public.kael_ai_spend_log (
    actor_id,
    purpose,
    cost_usd,
    harness_run_id,
    harness_trace_id,
    harness_release_id,
    provider_attempt_id
  ) values (
    p_actor_id,
    coalesce(nullif(p_purpose, ''), 'unknown'),
    p_cost_usd,
    p_harness_run_id,
    p_harness_trace_id,
    nullif(left(coalesce(p_harness_release_id, ''), 160), ''),
    p_provider_attempt_id
  );
end;
$$;

revoke all on function public.reserve_kael_ai_spend(uuid, numeric, text, numeric, numeric, numeric, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.finalize_kael_ai_spend(bigint, numeric, text, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.record_kael_ai_spend(uuid, text, numeric, uuid, uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.reserve_kael_ai_spend(uuid, numeric, text, numeric, numeric, numeric, uuid, uuid, text, uuid) to service_role;
grant execute on function public.finalize_kael_ai_spend(bigint, numeric, text, uuid, uuid, text, uuid) to service_role;
grant execute on function public.record_kael_ai_spend(uuid, text, numeric, uuid, uuid, text, uuid) to service_role;

commit;
