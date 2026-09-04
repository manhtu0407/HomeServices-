begin;

do $migration$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_get_functiondef(
    'public.get_worker_earnings_summary_v2(uuid,timestamptz,timestamptz,numeric)'::regprocedure
  ) into strict v_definition;

  v_rewritten := replace(
    v_definition,
    'pg_catalog.clock_timestamp()',
    'pg_catalog.statement_timestamp()'
  );

  if v_rewritten <> v_definition then
    execute v_rewritten;
  end if;
end
$migration$;

comment on function public.get_worker_earnings_summary_v2(
  uuid, timestamptz, timestamptz, numeric
) is 'Returns one transaction-snapshot earnings summary. STABLE requires statement_timestamp rather than clock_timestamp.';

commit;
