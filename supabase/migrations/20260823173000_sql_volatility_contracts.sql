begin;

alter function private.is_valid_original_scope_price_quote(
  jsonb, uuid, uuid, uuid, timestamptz, boolean
) stable;

comment on function private.is_valid_original_scope_price_quote(
  jsonb, uuid, uuid, uuid, timestamptz, boolean
) is 'Validates bilateral price quotes. STABLE is required because PostgreSQL timestamp text parsing is not immutable across session settings.';

do $migration$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_get_functiondef(
    'public.get_worker_earnings_summary(uuid,timestamptz,timestamptz,numeric)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    'pg_catalog.clock_timestamp()',
    'pg_catalog.statement_timestamp()'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'WORKER_EARNINGS_TIMESTAMP_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;
end
$migration$;

commit;
