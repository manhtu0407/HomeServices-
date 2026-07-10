-- Durable Kael provider circuits and generic chat rate counters.
-- Both stores are Edge-only. RPC failure is handled fail-open by the caller.

create table public.kael_provider_circuit (
  scope text not null check (scope in ('purpose_provider', 'provider')),
  key text not null check (char_length(key) between 1 and 200),
  kind text not null check (kind in ('credit', 'rate_limit', 'server', 'timeout', 'schema')),
  window_started_at timestamptz not null,
  failure_count int not null default 0 check (failure_count >= 0),
  open_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, key, kind)
);

create index kael_provider_circuit_open_idx
  on public.kael_provider_circuit (open_until)
  where open_until is not null;

create table public.kael_rate_counter (
  scope text not null check (char_length(scope) between 1 and 96),
  key text not null check (char_length(key) between 1 and 200),
  window_started_at timestamptz not null,
  tokens int not null check (tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key)
);

create index kael_rate_counter_updated_idx
  on public.kael_rate_counter (updated_at);

alter table public.kael_provider_circuit enable row level security;
alter table public.kael_rate_counter enable row level security;

revoke all on public.kael_provider_circuit from public, anon, authenticated;
revoke all on public.kael_rate_counter from public, anon, authenticated;
grant select, insert, update, delete on public.kael_provider_circuit to service_role;
grant select, insert, update, delete on public.kael_rate_counter to service_role;

create policy "deny all direct client access kael_provider_circuit"
  on public.kael_provider_circuit
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny all direct client access kael_rate_counter"
  on public.kael_rate_counter
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.kael_provider_circuit is
  'Edge-only durable provider circuit state. Direct client access is denied.';
comment on table public.kael_rate_counter is
  'Edge-only durable token-bucket state. Direct client access is denied.';

create or replace function public.record_circuit_failure(
  p_scope text,
  p_key text,
  p_kind text,
  p_now timestamptz default clock_timestamp()
)
returns table (is_open boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_threshold int;
  v_window interval;
  v_open_for interval;
  v_window_started timestamptz;
  v_failure_count int;
  v_open_until timestamptz;
begin
  if p_scope not in ('purpose_provider', 'provider')
     or coalesce(char_length(p_key), 0) not between 1 and 200
     or (p_scope = 'purpose_provider' and pg_catalog.strpos(p_key, ':') = 0) then
    raise exception 'invalid circuit scope or key' using errcode = '22023';
  end if;

  case p_kind
    when 'credit' then
      v_threshold := 1;
      v_window := interval '1 minute';
      v_open_for := interval '60 minutes';
    when 'rate_limit' then
      v_threshold := 3;
      v_window := interval '1 minute';
      v_open_for := interval '5 minutes';
    when 'server' then
      v_threshold := 5;
      v_window := interval '5 minutes';
      v_open_for := interval '5 minutes';
    when 'timeout' then
      v_threshold := 5;
      v_window := interval '5 minutes';
      v_open_for := interval '5 minutes';
    when 'schema' then
      v_threshold := 3;
      v_window := interval '10 minutes';
      v_open_for := interval '10 minutes';
    else
      raise exception 'invalid circuit failure kind' using errcode = '22023';
  end case;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kael_provider_circuit:' || p_scope || ':' || p_key,
      0
    )
  );

  select c.window_started_at, c.failure_count, c.open_until
    into v_window_started, v_failure_count, v_open_until
  from public.kael_provider_circuit as c
  where c.scope = p_scope and c.key = p_key and c.kind = p_kind
  for update;

  if not found or v_now - v_window_started > v_window then
    v_window_started := v_now;
    v_failure_count := 1;
    if coalesce(v_open_until, v_now) <= v_now then
      v_open_until := null;
    end if;
  else
    v_failure_count := v_failure_count + 1;
  end if;

  if v_failure_count >= v_threshold then
    v_open_until := greatest(
      coalesce(v_open_until, v_now),
      v_now + v_open_for
    );
  end if;

  insert into public.kael_provider_circuit (
    scope,
    key,
    kind,
    window_started_at,
    failure_count,
    open_until,
    updated_at
  ) values (
    p_scope,
    p_key,
    p_kind,
    v_window_started,
    v_failure_count,
    v_open_until,
    v_now
  )
  on conflict (scope, key, kind) do update
    set window_started_at = excluded.window_started_at,
        failure_count = excluded.failure_count,
        open_until = excluded.open_until,
        updated_at = excluded.updated_at;

  return query select coalesce(v_open_until > v_now, false);
end;
$$;

create or replace function public.is_circuit_open(
  p_scope text,
  p_key text,
  p_now timestamptz default clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
begin
  if p_scope not in ('purpose_provider', 'provider')
     or coalesce(char_length(p_key), 0) not between 1 and 200
     or (p_scope = 'purpose_provider' and pg_catalog.strpos(p_key, ':') = 0) then
    raise exception 'invalid circuit scope or key' using errcode = '22023';
  end if;

  return exists (
    select 1
    from public.kael_provider_circuit as c
    where c.open_until > v_now
      and (
        (c.scope = p_scope and c.key = p_key)
        or (
          p_scope = 'purpose_provider'
          and c.scope = 'provider'
          and c.key = pg_catalog.split_part(p_key, ':', 2)
        )
      )
  );
end;
$$;

create or replace function public.record_circuit_success(
  p_scope text,
  p_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_scope not in ('purpose_provider', 'provider')
     or coalesce(char_length(p_key), 0) not between 1 and 200
     or (p_scope = 'purpose_provider' and pg_catalog.strpos(p_key, ':') = 0) then
    raise exception 'invalid circuit scope or key' using errcode = '22023';
  end if;

  if p_scope = 'purpose_provider' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'kael_provider_circuit:provider:' || pg_catalog.split_part(p_key, ':', 2),
        0
      )
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kael_provider_circuit:' || p_scope || ':' || p_key, 0)
  );

  delete from public.kael_provider_circuit as c
  where (c.scope = p_scope and c.key = p_key)
     or (
       p_scope = 'purpose_provider'
       and c.scope = 'provider'
       and c.key = pg_catalog.split_part(p_key, ':', 2)
     );
end;
$$;

create or replace function public.rate_take(
  p_scope text,
  p_key text,
  p_cost int,
  p_config jsonb,
  p_now timestamptz default clock_timestamp()
)
returns table (allowed boolean, retry_after_ms int, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_buckets jsonb := p_config -> 'buckets';
  v_bucket jsonb;
  v_state jsonb;
  v_states jsonb := '[]'::jsonb;
  v_name text;
  v_bucket_scope text;
  v_max_tokens int;
  v_refill_rate int;
  v_refill_interval_ms int;
  v_tokens int;
  v_started_at timestamptz;
  v_effective_tokens int;
  v_effective_started_at timestamptz;
  v_elapsed_ms bigint;
  v_refills bigint;
  v_retry_after_ms int := 0;
  v_blocked_reason text;
begin
  if coalesce(char_length(p_scope), 0) not between 1 and 64
     or p_scope !~ '^[a-z0-9_]+$'
     or coalesce(char_length(p_key), 0) not between 1 and 200
     or coalesce(p_cost, 0) <= 0
     or v_buckets is null
     or pg_catalog.jsonb_typeof(v_buckets) <> 'array' then
    raise exception 'invalid rate_take arguments' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(v_buckets) not between 1 and 4 then
    raise exception 'invalid rate_take bucket count' using errcode = '22023';
  end if;
  if (
    select count(distinct bucket ->> 'name')
    from pg_catalog.jsonb_array_elements(v_buckets) as configured(bucket)
  ) <> pg_catalog.jsonb_array_length(v_buckets) then
    raise exception 'duplicate rate bucket name' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kael_rate_counter:' || p_scope || ':' || p_key, 0)
  );

  for v_bucket in
    select value from pg_catalog.jsonb_array_elements(v_buckets)
  loop
    v_name := v_bucket ->> 'name';
    v_max_tokens := (v_bucket ->> 'max_tokens')::int;
    v_refill_rate := (v_bucket ->> 'refill_rate')::int;
    v_refill_interval_ms := (v_bucket ->> 'refill_interval_ms')::int;

    if coalesce(char_length(v_name), 0) not between 1 and 24
       or v_name !~ '^[a-z0-9_]+$'
       or v_max_tokens not between 1 and 10000
       or v_refill_rate not between 1 and v_max_tokens
       or v_refill_interval_ms not between 1000 and 604800000
       or p_cost > v_max_tokens then
      raise exception 'invalid rate bucket config' using errcode = '22023';
    end if;

    v_bucket_scope := p_scope || ':' || v_name;
    select c.tokens, c.window_started_at
      into v_tokens, v_started_at
    from public.kael_rate_counter as c
    where c.scope = v_bucket_scope and c.key = p_key
    for update;

    if not found then
      v_effective_tokens := v_max_tokens;
      v_effective_started_at := v_now;
    else
      v_elapsed_ms := greatest(
        pg_catalog.floor(
          pg_catalog.date_part('epoch', v_now - v_started_at) * 1000
        )::bigint,
        0
      );
      v_refills := v_elapsed_ms / v_refill_interval_ms;
      if v_refills > 0 then
        v_effective_tokens := least(
          v_max_tokens::bigint,
          v_tokens::bigint + v_refills * v_refill_rate
        )::int;
        v_effective_started_at := v_now;
      else
        v_effective_tokens := v_tokens;
        v_effective_started_at := v_started_at;
      end if;
    end if;

    if v_effective_tokens < p_cost and v_blocked_reason is null then
      v_blocked_reason := v_name;
      v_retry_after_ms := least(
        pg_catalog.ceil(
          (p_cost - v_effective_tokens)::numeric / v_refill_rate
        ) * v_refill_interval_ms,
        2147483647
      )::int;
    end if;

    v_states := v_states || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'scope', v_bucket_scope,
        'window_started_at', v_effective_started_at,
        'tokens', v_effective_tokens - p_cost
      )
    );
  end loop;

  if v_blocked_reason is not null then
    return query select false, v_retry_after_ms, v_blocked_reason;
    return;
  end if;

  for v_state in
    select value from pg_catalog.jsonb_array_elements(v_states)
  loop
    insert into public.kael_rate_counter (
      scope,
      key,
      window_started_at,
      tokens,
      updated_at
    ) values (
      v_state ->> 'scope',
      p_key,
      (v_state ->> 'window_started_at')::timestamptz,
      (v_state ->> 'tokens')::int,
      v_now
    )
    on conflict (scope, key) do update
      set window_started_at = excluded.window_started_at,
          tokens = excluded.tokens,
          updated_at = excluded.updated_at;
  end loop;

  return query select true, 0, null::text;
end;
$$;

revoke all on function public.record_circuit_failure(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_circuit_failure(text, text, text, timestamptz)
  to service_role;
revoke all on function public.is_circuit_open(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.is_circuit_open(text, text, timestamptz)
  to service_role;
revoke all on function public.record_circuit_success(text, text)
  from public, anon, authenticated;
grant execute on function public.record_circuit_success(text, text)
  to service_role;
revoke all on function public.rate_take(text, text, int, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.rate_take(text, text, int, jsonb, timestamptz)
  to service_role;
