begin;

do $verification$
declare
  v_security_definer boolean;
begin
  select p.prosecdef
    into v_security_definer
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_customer_profile_insights_aggregate'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_customer_id uuid';

  if v_security_definer is distinct from false then
    raise exception 'customer profile aggregate must remain security invoker';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.get_customer_profile_insights_aggregate(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated customer runtime cannot execute profile aggregate';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.get_customer_profile_insights_aggregate(uuid)',
    'EXECUTE'
  ) then
    raise exception 'anonymous role can execute customer profile aggregate';
  end if;
end;
$verification$;

select jsonb_build_object(
  'authenticated_execute', true,
  'anonymous_blocked', true,
  'security_invoker', true
) as customer_read_endpoint_parity_verification;

rollback;
