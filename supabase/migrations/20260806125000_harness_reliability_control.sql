begin;

alter table public.kael_ai_spend_log
  add column if not exists reservation_status text not null default 'settled'
    check (reservation_status in ('reserved', 'settled', 'released', 'expired')),
  add column if not exists reservation_expires_at timestamptz;

create index if not exists kael_ai_spend_reservation_expiry_idx
  on public.kael_ai_spend_log(reservation_expires_at)
  where reservation_status = 'reserved';

create table if not exists public.harness_idempotency_keys (
  reservation_id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('local', 'preview', 'staging', 'production')),
  release_id text not null,
  operation_id text not null,
  actor_id_hash text,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_hash text check (response_hash is null or response_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'reserved' check (status in ('reserved', 'executing', 'completed', 'failed', 'expired', 'reconcile_required')),
  error_code text,
  reserved_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  constraint harness_idempotency_actor_hash check (actor_id_hash is null or actor_id_hash ~ '^[0-9a-f]{64}$')
);

create unique index harness_idempotency_actor_key_idx
  on public.harness_idempotency_keys (
    environment, operation_id, coalesce(actor_id_hash, 'system'), key_hash
  );

create table if not exists public.harness_dependency_circuits (
  dependency text not null,
  environment text not null check (environment in ('local', 'preview', 'staging', 'production')),
  state text not null default 'closed' check (state in ('closed', 'open', 'half_open')),
  failure_count integer not null default 0 check (failure_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  half_open_probes integer not null default 0 check (half_open_probes >= 0),
  window_started_at timestamptz not null default now(),
  opened_at timestamptz,
  open_until timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now(),
  primary key (dependency, environment)
);

create table if not exists public.harness_dependency_probes (
  probe_token uuid primary key default gen_random_uuid(),
  dependency text not null,
  environment text not null check (environment in ('local', 'preview', 'staging', 'production')),
  leased_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  success boolean,
  error_code text,
  foreign key (dependency, environment)
    references public.harness_dependency_circuits(dependency, environment)
    on delete cascade
);

create table if not exists public.harness_reliability_events (
  event_id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('local', 'preview', 'staging', 'production')),
  release_id text not null,
  operation_id text,
  dependency text,
  event_class text not null,
  result text not null check (result in ('reserved', 'executing', 'replayed', 'in_progress', 'conflict', 'completed', 'failed', 'expired', 'reconcile_required', 'circuit_opened', 'circuit_half_open', 'circuit_closed', 'probe_leased', 'degraded')),
  error_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint harness_reliability_metadata_bound check (octet_length(safe_metadata::text) <= 8192)
);

create index if not exists harness_idempotency_expiry_idx
  on public.harness_idempotency_keys(expires_at) where status in ('reserved', 'executing');
create index if not exists harness_dependency_probe_active_idx
  on public.harness_dependency_probes(dependency, environment, expires_at)
  where completed_at is null;
create index if not exists harness_reliability_events_dependency_idx
  on public.harness_reliability_events(dependency, occurred_at desc);

alter table public.harness_idempotency_keys enable row level security;
alter table public.harness_dependency_circuits enable row level security;
alter table public.harness_dependency_probes enable row level security;
alter table public.harness_reliability_events enable row level security;

create policy harness_idempotency_admin_read on public.harness_idempotency_keys
  for select to authenticated using (private.is_admin());
create policy harness_circuits_admin_read on public.harness_dependency_circuits
  for select to authenticated using (private.is_admin());
create policy harness_dependency_probes_admin_read on public.harness_dependency_probes
  for select to authenticated using (private.is_admin());
create policy harness_reliability_events_admin_read on public.harness_reliability_events
  for select to authenticated using (private.is_admin());

grant select on public.harness_idempotency_keys to authenticated;
grant select on public.harness_dependency_circuits to authenticated;
grant select on public.harness_dependency_probes to authenticated;
grant select on public.harness_reliability_events to authenticated;

drop trigger if exists harness_reliability_events_append_only on public.harness_reliability_events;
create trigger harness_reliability_events_append_only
before update or delete on public.harness_reliability_events
for each row execute function public.reject_harness_append_only_mutation();

create or replace function public.expire_harness_reliability_reservations()
returns table (idempotency_expired integer, spend_expired integer, probes_expired integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idempotency integer := 0;
  v_spend integer := 0;
  v_probes integer := 0;
begin
  update public.harness_idempotency_keys
  set status = 'expired', completed_at = now(), error_code = 'RESERVATION_EXPIRED'
  where status = 'reserved' and expires_at <= now();
  get diagnostics v_idempotency = row_count;

  with reconciled as (
    update public.harness_idempotency_keys
    set status = 'reconcile_required', completed_at = now(),
        error_code = 'EXECUTION_OUTCOME_UNKNOWN'
    where status = 'executing' and expires_at <= now()
    returning environment, release_id, operation_id
  )
  insert into public.harness_reliability_events (
    environment, release_id, operation_id, event_class, result, error_code
  )
  select environment, release_id, operation_id, 'idempotency',
         'reconcile_required', 'EXECUTION_OUTCOME_UNKNOWN'
  from reconciled;

  update public.kael_ai_spend_log
  set reservation_status = 'expired', cost_usd = 0
  where reservation_status = 'reserved'
    and reservation_expires_at is not null
    and reservation_expires_at <= now();
  get diagnostics v_spend = row_count;

  update public.harness_dependency_probes
  set completed_at = now(), success = false, error_code = 'PROBE_EXPIRED'
  where completed_at is null and expires_at <= now();
  get diagnostics v_probes = row_count;

  return query select v_idempotency, v_spend, v_probes;
end;
$$;

create or replace function public.reserve_kael_ai_spend(
  p_actor_id uuid,
  p_estimated_usd numeric,
  p_purpose text,
  p_global_daily_cap numeric,
  p_user_daily_cap numeric,
  p_user_monthly_cap numeric
)
returns table (allowed boolean, blocked_scope text, reservation_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_global numeric := 0;
  v_user_day numeric := 0;
  v_user_month numeric := 0;
  v_est numeric := greatest(coalesce(p_estimated_usd, 0), 0);
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('kael_ai_spend_reserve'));
  perform public.expire_harness_reliability_reservations();

  select coalesce(sum(cost_usd), 0) into v_global
  from public.kael_ai_spend_log
  where created_at >= now() - interval '1 day'
    and reservation_status in ('reserved', 'settled');

  if p_actor_id is not null then
    select coalesce(sum(cost_usd), 0) into v_user_day
    from public.kael_ai_spend_log
    where actor_id = p_actor_id
      and created_at >= now() - interval '1 day'
      and reservation_status in ('reserved', 'settled');

    select coalesce(sum(cost_usd), 0) into v_user_month
    from public.kael_ai_spend_log
    where actor_id = p_actor_id
      and created_at >= now() - interval '30 days'
      and reservation_status in ('reserved', 'settled');
  end if;

  if p_global_daily_cap is not null and v_global + v_est > p_global_daily_cap then
    return query select false, 'global_daily'::text, null::bigint;
    return;
  end if;
  if p_actor_id is not null and p_user_daily_cap is not null and v_user_day + v_est > p_user_daily_cap then
    return query select false, 'user_daily'::text, null::bigint;
    return;
  end if;
  if p_actor_id is not null and p_user_monthly_cap is not null and v_user_month + v_est > p_user_monthly_cap then
    return query select false, 'user_monthly'::text, null::bigint;
    return;
  end if;

  insert into public.kael_ai_spend_log (
    actor_id, purpose, cost_usd, reservation_status, reservation_expires_at
  ) values (
    p_actor_id, coalesce(nullif(p_purpose, ''), 'reserved'), v_est,
    'reserved', now() + interval '5 minutes'
  ) returning id into v_id;

  return query select true, null::text, v_id;
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
returns table (allowed boolean, blocked_scope text, reservation_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select * into v_row from public.reserve_kael_ai_spend(
    p_actor_id, p_estimated_usd, p_purpose,
    p_global_daily_cap, p_user_daily_cap, p_user_monthly_cap
  );
  if v_row.allowed and v_row.reservation_id is not null then
    update public.kael_ai_spend_log
    set harness_run_id = p_harness_run_id,
        harness_trace_id = p_harness_trace_id,
        harness_release_id = nullif(left(coalesce(p_harness_release_id, ''), 160), ''),
        provider_attempt_id = p_provider_attempt_id
    where id = v_row.reservation_id;
  end if;
  return query select v_row.allowed::boolean, v_row.blocked_scope::text, v_row.reservation_id::bigint;
end;
$$;

create or replace function public.finalize_kael_ai_spend(
  p_reservation_id bigint,
  p_actual_usd numeric,
  p_purpose text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reservation_id is null then return; end if;
  update public.kael_ai_spend_log
  set cost_usd = greatest(coalesce(p_actual_usd, 0), 0),
      purpose = coalesce(nullif(p_purpose, ''), purpose),
      reservation_status = case when coalesce(p_actual_usd, 0) > 0 then 'settled' else 'released' end,
      reservation_expires_at = null
  where id = p_reservation_id and reservation_status = 'reserved';
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
  perform public.finalize_kael_ai_spend(p_reservation_id, p_actual_usd, p_purpose);
  update public.kael_ai_spend_log
  set harness_run_id = coalesce(p_harness_run_id, harness_run_id),
      harness_trace_id = coalesce(p_harness_trace_id, harness_trace_id),
      harness_release_id = coalesce(nullif(left(coalesce(p_harness_release_id, ''), 160), ''), harness_release_id),
      provider_attempt_id = coalesce(p_provider_attempt_id, provider_attempt_id)
  where id = p_reservation_id;
end;
$$;

create or replace function public.reserve_harness_idempotency(
  p_environment text,
  p_release_id text,
  p_operation_id text,
  p_actor_id_hash text,
  p_key_hash text,
  p_request_hash text,
  p_ttl_seconds integer
)
returns table (state text, reservation_id uuid, response_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.harness_idempotency_keys%rowtype;
  v_reservation_id uuid;
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_release_id text := nullif(trim(coalesce(p_release_id, '')), '');
  v_operation_id text := nullif(trim(coalesce(p_operation_id, '')), '');
  v_actor_id_hash text := nullif(trim(coalesce(p_actor_id_hash, '')), '');
begin
  if p_environment is null
     or v_environment = ''
     or v_environment not in ('local', 'preview', 'staging', 'production')
     or v_release_id is null or char_length(v_release_id) > 160
     or v_operation_id is null or char_length(v_operation_id) > 160
     or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or (v_actor_id_hash is not null and v_actor_id_hash !~ '^[0-9a-f]{64}$') then
    return query select 'conflict'::text, null::uuid, null::text;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext(
    v_environment || '|' || v_operation_id || '|' || coalesce(v_actor_id_hash, 'system') || '|' || p_key_hash
  ));

  select * into v_row
  from public.harness_idempotency_keys key
  where key.environment = v_environment
    and key.operation_id = v_operation_id
    and key.actor_id_hash is not distinct from v_actor_id_hash
    and key.key_hash = p_key_hash
  for update;

  if found then
    if v_row.request_hash <> p_request_hash then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result, error_code
      ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'conflict', 'REQUEST_HASH_CONFLICT');
      return query select 'conflict'::text, null::uuid, null::text;
      return;
    end if;
    if v_row.status = 'completed' then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result
      ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'replayed');
      return query select 'completed'::text, v_row.reservation_id, v_row.response_hash;
      return;
    end if;
    if v_row.status = 'reconcile_required' then
      return query select 'reconcile_required'::text, v_row.reservation_id, null::text;
      return;
    end if;
    if v_row.status in ('reserved', 'executing') and v_row.expires_at > now() then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result
      ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'in_progress');
      return query select 'in_progress'::text, v_row.reservation_id, null::text;
      return;
    end if;
    if v_row.status = 'executing' then
      update public.harness_idempotency_keys
      set status = 'reconcile_required', completed_at = now(),
          error_code = 'EXECUTION_OUTCOME_UNKNOWN'
      where reservation_id = v_row.reservation_id;
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result, error_code
      ) values (v_environment, v_release_id, v_operation_id,
        'idempotency', 'reconcile_required', 'EXECUTION_OUTCOME_UNKNOWN');
      return query select 'reconcile_required'::text, v_row.reservation_id, null::text;
      return;
    end if;
    update public.harness_idempotency_keys
    set status = 'reserved', release_id = v_release_id,
        request_hash = p_request_hash, response_hash = null, error_code = null,
        reserved_at = now(), completed_at = null,
        expires_at = now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 300), 30))
    where reservation_id = v_row.reservation_id;
    return query select 'reserved'::text, v_row.reservation_id, null::text;
    return;
  end if;

  insert into public.harness_idempotency_keys (
    environment, release_id, operation_id, actor_id_hash, key_hash,
    request_hash, expires_at
  ) values (
    v_environment, v_release_id, v_operation_id,
    v_actor_id_hash, p_key_hash, p_request_hash,
    now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 300), 30))
  ) returning harness_idempotency_keys.reservation_id into v_reservation_id;

  insert into public.harness_reliability_events (
    environment, release_id, operation_id, event_class, result
  ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'reserved');
  return query select 'reserved'::text, v_reservation_id, null::text;
end;
$$;

create or replace function public.start_harness_idempotency_execution(
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.harness_idempotency_keys%rowtype;
begin
  update public.harness_idempotency_keys
  set status = 'executing'
  where reservation_id = p_reservation_id and status = 'reserved'
  returning * into v_row;
  if found then
    insert into public.harness_reliability_events (
      environment, release_id, operation_id, event_class, result
    ) values (v_row.environment, v_row.release_id, v_row.operation_id,
      'idempotency', 'executing');
  end if;
  return found;
end;
$$;

create or replace function public.mark_harness_idempotency_reconcile_required(
  p_reservation_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.harness_idempotency_keys%rowtype;
begin
  update public.harness_idempotency_keys
  set status = 'reconcile_required', completed_at = now(),
      error_code = coalesce(
        nullif(left(coalesce(p_error_code, ''), 120), ''),
        'EXECUTION_OUTCOME_UNKNOWN'
      )
  where reservation_id = p_reservation_id and status = 'executing'
  returning * into v_row;
  if found then
    insert into public.harness_reliability_events (
      environment, release_id, operation_id, event_class, result, error_code
    ) values (v_row.environment, v_row.release_id, v_row.operation_id,
      'idempotency', 'reconcile_required', v_row.error_code);
  end if;
  return found;
end;
$$;

create or replace function public.complete_harness_idempotency(
  p_reservation_id uuid,
  p_response_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.harness_idempotency_keys%rowtype;
begin
  if p_response_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  update public.harness_idempotency_keys
  set status = 'completed', response_hash = p_response_hash,
      completed_at = now(), error_code = null
  where reservation_id = p_reservation_id and status = 'executing'
  returning * into v_row;
  if found then
    insert into public.harness_reliability_events (
      environment, release_id, operation_id, event_class, result
    ) values (v_row.environment, v_row.release_id, v_row.operation_id, 'idempotency', 'completed');
  end if;
  return found;
end;
$$;

create or replace function public.fail_harness_idempotency(
  p_reservation_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.harness_idempotency_keys%rowtype;
begin
  update public.harness_idempotency_keys
  set status = 'failed', completed_at = now(),
      error_code = nullif(left(coalesce(p_error_code, ''), 120), '')
  where reservation_id = p_reservation_id and status = 'reserved'
  returning * into v_row;
  if found then
    insert into public.harness_reliability_events (
      environment, release_id, operation_id, event_class, result, error_code
    ) values (v_row.environment, v_row.release_id, v_row.operation_id, 'idempotency', 'failed', v_row.error_code);
  end if;
  return found;
end;
$$;

create or replace function public.acquire_harness_dependency_permit(
  p_dependency text,
  p_environment text,
  p_half_open_probes integer,
  p_probe_ttl_seconds integer
)
returns table (allowed boolean, state text, retry_after_ms integer, probe_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.harness_dependency_circuits%rowtype;
  v_active integer := 0;
  v_token uuid;
  v_dependency text := nullif(trim(coalesce(p_dependency, '')), '');
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_half_open_probes integer := greatest(coalesce(p_half_open_probes, 1), 1);
  v_probe_ttl_seconds integer := greatest(coalesce(p_probe_ttl_seconds, 30), 5);
begin
  if v_environment not in ('local', 'preview', 'staging', 'production')
     or v_dependency is null or char_length(v_dependency) > 120 then
    return query select false, 'open'::text, 30000, null::uuid;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext(v_dependency || '|' || v_environment));
  insert into public.harness_dependency_circuits (dependency, environment)
  values (v_dependency, v_environment)
  on conflict (dependency, environment) do nothing;
  select * into v_row from public.harness_dependency_circuits
  where dependency = v_dependency and environment = v_environment for update;

  if v_row.state = 'open' and coalesce(v_row.open_until, now()) > now() then
    return query select false, 'open'::text,
      greatest(0, (extract(epoch from (v_row.open_until - now())) * 1000)::integer), null::uuid;
    return;
  end if;
  if v_row.state = 'open' then
    update public.harness_dependency_circuits
    set state = 'half_open', half_open_probes = 0, updated_at = now()
    where dependency = v_dependency and environment = v_environment;
    v_row.state := 'half_open';
  end if;
  if v_row.state = 'closed' then
    return query select true, 'closed'::text, 0, null::uuid;
    return;
  end if;

  update public.harness_dependency_probes
  set completed_at = now(), success = false, error_code = 'PROBE_EXPIRED'
  where dependency = v_dependency and environment = v_environment
    and completed_at is null and expires_at <= now();
  select count(*)::integer into v_active
  from public.harness_dependency_probes probe
  where probe.dependency = v_dependency and probe.environment = v_environment
    and probe.completed_at is null and probe.expires_at > now();
  if v_active >= v_half_open_probes then
    return query select false, 'half_open'::text, 1000, null::uuid;
    return;
  end if;

  insert into public.harness_dependency_probes (
    dependency, environment, expires_at
  ) values (
    v_dependency, v_environment,
    now() + make_interval(secs => v_probe_ttl_seconds)
  ) returning harness_dependency_probes.probe_token into v_token;
  update public.harness_dependency_circuits
  set half_open_probes = half_open_probes + 1, updated_at = now()
  where dependency = v_dependency and environment = v_environment;
  return query select true, 'half_open'::text, 0, v_token;
end;
$$;

create or replace function public.record_harness_dependency_result(
  p_dependency text,
  p_environment text,
  p_release_id text,
  p_success boolean,
  p_error_code text,
  p_threshold integer,
  p_window_ms integer,
  p_open_ms integer,
  p_half_open_probes integer,
  p_probe_token uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.harness_dependency_circuits%rowtype;
  v_now timestamptz := now();
  v_state text;
  v_successful_probes integer := 0;
  v_dependency text := nullif(trim(coalesce(p_dependency, '')), '');
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_release_id text := nullif(trim(coalesce(p_release_id, '')), '');
  v_success boolean := coalesce(p_success, false);
  v_threshold integer := greatest(coalesce(p_threshold, 1), 1);
  v_window_ms integer := greatest(coalesce(p_window_ms, 1000), 1000);
  v_open_ms integer := greatest(coalesce(p_open_ms, 1000), 1000);
  v_half_open_probes integer := greatest(coalesce(p_half_open_probes, 1), 1);
begin
  if v_release_id is null then v_release_id := 'unreleased'; end if;
  if v_environment not in ('local', 'preview', 'staging', 'production')
     or v_dependency is null or char_length(v_dependency) > 120
     or char_length(v_release_id) > 160 then
    return 'open';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_dependency || '|' || v_environment));
  insert into public.harness_dependency_circuits (dependency, environment)
  values (v_dependency, v_environment)
  on conflict (dependency, environment) do nothing;
  select * into v_row from public.harness_dependency_circuits
  where dependency = v_dependency and environment = v_environment for update;

  if p_probe_token is not null then
    update public.harness_dependency_probes
    set completed_at = v_now, success = v_success,
        error_code = nullif(left(coalesce(p_error_code, ''), 120), '')
    where probe_token = p_probe_token
      and dependency = v_dependency and environment = v_environment
      and completed_at is null;
    if not found then v_success := false; p_error_code := 'PROBE_TOKEN_INVALID'; end if;
  end if;

  if v_now - v_row.window_started_at > make_interval(secs => v_window_ms / 1000.0) then
    v_row.failure_count := 0;
    v_row.success_count := 0;
    v_row.window_started_at := v_now;
  end if;

  if v_success then
    if v_row.state = 'half_open' then
      select count(*)::integer into v_successful_probes
      from public.harness_dependency_probes probe
      where probe.dependency = v_dependency and probe.environment = v_environment
        and probe.completed_at is not null and probe.success is true
        and probe.leased_at >= coalesce(v_row.opened_at, v_row.window_started_at);
    end if;
    v_state := case
      when v_row.state = 'half_open' and v_successful_probes < v_half_open_probes then 'half_open'
      else 'closed'
    end;
    update public.harness_dependency_circuits
    set state = v_state, success_count = v_row.success_count + 1,
        failure_count = case when v_state = 'closed' then 0 else v_row.failure_count end,
        half_open_probes = case when v_state = 'closed' then 0 else v_row.half_open_probes end,
        open_until = case when v_state = 'closed' then null else open_until end,
        last_error_code = null, updated_at = v_now,
        window_started_at = v_row.window_started_at
    where dependency = v_dependency and environment = v_environment;
  else
    v_state := case
      when v_row.state = 'half_open' or v_row.failure_count + 1 >= v_threshold then 'open'
      else v_row.state
    end;
    update public.harness_dependency_circuits
    set state = v_state, failure_count = v_row.failure_count + 1,
        half_open_probes = 0,
        opened_at = case when v_state = 'open' then v_now else opened_at end,
        open_until = case when v_state = 'open' then v_now + make_interval(secs => v_open_ms / 1000.0) else open_until end,
        last_error_code = nullif(left(coalesce(p_error_code, ''), 120), ''),
        updated_at = v_now, window_started_at = v_row.window_started_at
    where dependency = v_dependency and environment = v_environment;
  end if;

  insert into public.harness_reliability_events (
    environment, release_id, dependency, event_class, result, error_code,
    safe_metadata
  ) values (
    v_environment, v_release_id, v_dependency,
    'circuit',
    case when v_state = 'open' then 'circuit_opened'
      when v_state = 'half_open' then 'circuit_half_open'
      else 'circuit_closed' end,
    nullif(left(coalesce(p_error_code, ''), 120), ''),
    jsonb_build_object('probe_token_present', p_probe_token is not null)
  );
  return v_state;
end;
$$;

revoke all on function public.expire_harness_reliability_reservations() from public, anon, authenticated;
revoke all on function public.reserve_kael_ai_spend(uuid,numeric,text,numeric,numeric,numeric) from public, anon, authenticated;
revoke all on function public.reserve_kael_ai_spend(uuid,numeric,text,numeric,numeric,numeric,uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.finalize_kael_ai_spend(bigint,numeric,text) from public, anon, authenticated;
revoke all on function public.finalize_kael_ai_spend(bigint,numeric,text,uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.reserve_harness_idempotency(text,text,text,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.start_harness_idempotency_execution(uuid) from public, anon, authenticated;
revoke all on function public.mark_harness_idempotency_reconcile_required(uuid,text) from public, anon, authenticated;
revoke all on function public.complete_harness_idempotency(uuid,text) from public, anon, authenticated;
revoke all on function public.fail_harness_idempotency(uuid,text) from public, anon, authenticated;
revoke all on function public.acquire_harness_dependency_permit(text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.record_harness_dependency_result(text,text,text,boolean,text,integer,integer,integer,integer,uuid) from public, anon, authenticated;

grant execute on function public.expire_harness_reliability_reservations() to service_role;
grant execute on function public.reserve_kael_ai_spend(uuid,numeric,text,numeric,numeric,numeric) to service_role;
grant execute on function public.reserve_kael_ai_spend(uuid,numeric,text,numeric,numeric,numeric,uuid,uuid,text,uuid) to service_role;
grant execute on function public.finalize_kael_ai_spend(bigint,numeric,text) to service_role;
grant execute on function public.finalize_kael_ai_spend(bigint,numeric,text,uuid,uuid,text,uuid) to service_role;
grant execute on function public.reserve_harness_idempotency(text,text,text,text,text,text,integer) to service_role;
grant execute on function public.start_harness_idempotency_execution(uuid) to service_role;
grant execute on function public.mark_harness_idempotency_reconcile_required(uuid,text) to service_role;
grant execute on function public.complete_harness_idempotency(uuid,text) to service_role;
grant execute on function public.fail_harness_idempotency(uuid,text) to service_role;
grant execute on function public.acquire_harness_dependency_permit(text,text,integer,integer) to service_role;
grant execute on function public.record_harness_dependency_result(text,text,text,boolean,text,integer,integer,integer,integer,uuid) to service_role;

comment on function public.reserve_kael_ai_spend(uuid,numeric,text,numeric,numeric,numeric) is
  'Atomically reserves the full provider retry envelope and expires abandoned reservations after five minutes.';
comment on function public.acquire_harness_dependency_permit(text,text,integer,integer) is
  'Returns a fail-closed dependency permit and leases bounded half-open probes.';

commit;
