begin;

-- Existing Staging databases may still have the Admin wrapper calling the
-- legacy earnings RPC name. Rewrite only that exact dependency after proving
-- the wrapper shape; clean and Production databases already use V2.
do $migration$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_admin_worker_finance_snapshot(uuid,uuid,timestamptz,timestamptz,numeric)'::pg_catalog.regprocedure
  ) into v_definition;

  if position('public.get_worker_earnings_summary_v2(' in v_definition) > 0 then
    return;
  end if;
  if v_definition is null
    or position('private.assert_finance_reader(p_actor_id)' in v_definition) = 0
    or position('public.get_worker_earnings_summary(' in v_definition) = 0
  then
    raise exception 'SETTLEMENT_V2_ADMIN_WRAPPER_SOURCE_UNAVAILABLE';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    'public.get_worker_earnings_summary(',
    'public.get_worker_earnings_summary_v2('
  );
  execute v_definition;
end;
$migration$;

revoke execute on function public.get_admin_worker_finance_snapshot(uuid, uuid, timestamptz, timestamptz, numeric)
  from public, anon, authenticated;
grant execute on function public.get_admin_worker_finance_snapshot(uuid, uuid, timestamptz, timestamptz, numeric)
  to service_role;

commit;
