-- Rollback-only verification for the Stage 1 SQL volatility contract.

begin;

do $verification$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.get_worker_earnings_summary(uuid,timestamptz,timestamptz,numeric)'::regprocedure
  ) into strict v_definition;

  if position('pg_catalog.clock_timestamp()' in v_definition) > 0 then
    raise exception 'worker earnings summary still calls clock_timestamp';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'get_worker_earnings_summary'
      and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
        'p_worker_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_platform_fee_rate numeric'
      and procedure.provolatile = 's'
  ) then
    raise exception 'worker earnings summary is not STABLE';
  end if;
end
$verification$;

rollback;
