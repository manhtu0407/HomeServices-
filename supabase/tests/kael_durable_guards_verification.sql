-- Rollback-only runtime verification for the durable guard migration.
-- Run only after the migration exists on a local or staging database.

begin;

delete from public.kael_provider_circuit
where key like 'verify_durable_guard:%' or key = 'verify_deepseek';
delete from public.kael_rate_counter
where key in ('verify_rate_minute', 'verify_rate_hour');

do $$
declare
  v_open boolean;
begin
  perform public.record_circuit_failure(
    'provider', 'verify_deepseek', 'rate_limit', '2026-07-10T00:00:00Z'
  );
  perform public.record_circuit_failure(
    'provider', 'verify_deepseek', 'rate_limit', '2026-07-10T00:00:10Z'
  );
  select is_open into v_open
  from public.record_circuit_failure(
    'provider', 'verify_deepseek', 'rate_limit', '2026-07-10T00:00:20Z'
  );
  if not v_open then
    raise exception 'provider rate-limit circuit did not open at threshold 3';
  end if;

  select public.is_circuit_open(
    'purpose_provider',
    'verify_durable_guard:verify_deepseek',
    '2026-07-10T00:00:30Z'
  ) into v_open;
  if not v_open then
    raise exception 'provider-global circuit was not visible cross-purpose';
  end if;

  perform public.record_circuit_success(
    'purpose_provider',
    'verify_durable_guard:verify_deepseek'
  );
  select public.is_circuit_open(
    'purpose_provider',
    'verify_durable_guard:verify_deepseek',
    '2026-07-10T00:00:30Z'
  ) into v_open;
  if not v_open then
    raise exception 'purpose success erased the provider-global circuit';
  end if;

  perform public.record_circuit_success('provider', 'verify_deepseek');
  select public.is_circuit_open(
    'purpose_provider',
    'verify_durable_guard:verify_deepseek',
    '2026-07-10T00:00:30Z'
  ) into v_open;
  if v_open then
    raise exception 'provider success did not reset the provider-global circuit';
  end if;
end;
$$;

do $$
declare
  v_config jsonb := '{
    "buckets": [
      {"name":"minute","max_tokens":5,"refill_rate":5,"refill_interval_ms":60000},
      {"name":"hour","max_tokens":20,"refill_rate":20,"refill_interval_ms":3600000}
    ]
  }'::jsonb;
  v_row record;
  v_hour_tokens int;
begin
  for i in 1..5 loop
    select * into v_row from public.rate_take(
      'kael_chat',
      'verify_rate_minute',
      1,
      v_config,
      '2026-07-10T01:00:00Z'
    );
    if not v_row.allowed then
      raise exception 'rate_take blocked request % before the minute limit', i;
    end if;
  end loop;

  select * into v_row from public.rate_take(
    'kael_chat',
    'verify_rate_minute',
    1,
    v_config,
    '2026-07-10T01:00:00Z'
  );
  if v_row.allowed or v_row.reason <> 'minute' then
    raise exception 'rate_take did not block the sixth minute request';
  end if;

  select tokens into v_hour_tokens
  from public.kael_rate_counter
  where scope = 'kael_chat:hour' and key = 'verify_rate_minute';
  if v_hour_tokens <> 15 then
    raise exception 'blocked minute request partially consumed hour tokens';
  end if;
end;
$$;

do $$
begin
  if pg_catalog.has_table_privilege(
    'authenticated',
    'public.kael_provider_circuit',
    'select'
  ) then
    raise exception 'authenticated can read kael_provider_circuit';
  end if;
  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.rate_take(text,text,integer,jsonb,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'authenticated can execute rate_take';
  end if;
  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.rate_take(text,text,integer,jsonb,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'service_role cannot execute rate_take';
  end if;
end;
$$;

select jsonb_build_object(
  'migration_compiles', true,
  'circuit_thresholds', true,
  'provider_global_cross_purpose', true,
  'rate_minute_limit', true,
  'rate_no_partial_consume', true,
  'direct_client_access_denied', true
) as kael_durable_guards_verification;

rollback;
