begin;

do $$
declare
  v_function constant regprocedure :=
    'public.admin_review_worker_application_atomic(uuid,uuid,text,text)'::regprocedure;
  v_table text;
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc
    where oid = v_function
      and prosecdef is true
      and proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'worker application review RPC is not a locked-down definer function';
  end if;

  if pg_catalog.has_function_privilege('anon', v_function, 'execute')
     or pg_catalog.has_function_privilege('authenticated', v_function, 'execute') then
    raise exception 'non-service role can execute worker application review RPC';
  end if;

  if not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
    raise exception 'service_role cannot execute worker application review RPC';
  end if;

  foreach v_table in array array[
    'profiles',
    'worker_profiles',
    'kael_admin_queue',
    'kael_permission_audit',
    'jobs'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class
      where oid = ('public.' || v_table)::regclass
        and relrowsecurity is true
    ) then
      raise exception 'RLS is not enabled on public.%', v_table;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'kael_admin_queue_worker_application_status_idx'
  ) then
    raise exception 'worker application queue index is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'jobs_admin_payment_activity_idx'
  ) then
    raise exception 'admin transaction activity index is missing';
  end if;
end;
$$;

select jsonb_build_object(
  'atomic_worker_application_review', true,
  'service_role_only_rpc', true,
  'admin_data_tables_rls_enabled', true,
  'admin_activity_indexes_present', true
);

rollback;
