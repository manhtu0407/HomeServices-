begin;

-- Staging applied the original settlement migration before the earnings RPC
-- received a versioned name. Clone only the already-verified V2 return shape;
-- Production and clean databases create the versioned RPC in the original
-- migration and therefore take the no-op path here.
do $migration$
declare
  v_definition text;
  v_result text;
begin
  if to_regprocedure(
    'public.get_worker_earnings_summary_v2(uuid,timestamptz,timestamptz,numeric)'
  ) is not null then
    return;
  end if;

  select
    pg_catalog.pg_get_functiondef(procedure.oid),
    pg_catalog.pg_get_function_result(procedure.oid)
  into v_definition, v_result
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'get_worker_earnings_summary'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
      'p_worker_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_platform_fee_rate numeric';

  if v_definition is null
    or position('withdrawal_reserved_amount bigint' in v_result) = 0
    or position('provisional_payment_count bigint' in v_result) = 0
    or position('withdrawal_eligible_at timestamp with time zone' in v_result) = 0
  then
    raise exception 'SETTLEMENT_V2_RPC_SOURCE_UNAVAILABLE';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    'FUNCTION public.get_worker_earnings_summary(',
    'FUNCTION public.get_worker_earnings_summary_v2('
  );
  execute v_definition;
end;
$migration$;

revoke execute on function public.get_worker_earnings_summary_v2(uuid, timestamptz, timestamptz, numeric)
  from public, anon, authenticated;
grant execute on function public.get_worker_earnings_summary_v2(uuid, timestamptz, timestamptz, numeric)
  to service_role;

commit;
