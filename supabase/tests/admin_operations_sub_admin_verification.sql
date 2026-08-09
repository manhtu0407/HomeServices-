begin;

do $$
declare
  v_function regprocedure;
  v_definition text;
  v_table text;
begin
  foreach v_table in array array[
    'admin_operator_accounts',
    'admin_worker_application_reviews'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class
      where oid = ('public.' || v_table)::regclass
        and relrowsecurity is true
    ) then
      raise exception 'RLS is not enabled on public.%', v_table;
    end if;

    if pg_catalog.has_table_privilege('anon', ('public.' || v_table)::regclass, 'select')
       or pg_catalog.has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'select') then
      raise exception 'direct client read is granted on public.%', v_table;
    end if;
  end loop;

  foreach v_function in array array[
    'public.admin_set_sub_admin_access_atomic(uuid,uuid,text,text[],text)'::regprocedure,
    'public.admin_set_worker_access_atomic(uuid,uuid,text,text)'::regprocedure,
    'public.admin_operations_snapshot(uuid)'::regprocedure,
    'public.admin_review_worker_application_atomic(uuid,uuid,text,text)'::regprocedure
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_proc
      where oid = v_function
        and prosecdef is true
        and proconfig = array['search_path=""']::text[]
    ) then
      raise exception 'admin RPC % is not a locked-down definer function', v_function;
    end if;

    if pg_catalog.has_function_privilege('anon', v_function, 'execute')
       or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
       or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'admin RPC % does not have service-only execute grants', v_function;
    end if;
  end loop;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.admin_set_sub_admin_access_atomic(uuid,uuid,text,text[],text)'::regprocedure
  );
  if v_definition not like '%owner_profile.role = ''admin''%'
     or v_definition not like '%v_action = ''revoke''%'
     or v_definition not like '%reason_provided%' then
    raise exception 'Sub Admin access RPC has lost its owner/revoke audit controls';
  end if;

  v_definition := pg_catalog.pg_get_functiondef('public.handle_new_user()'::regprocedure);
  if v_definition like '%''admin''::public.user_role%' then
    raise exception 'new user trigger must not self-assign an admin role from metadata';
  end if;

  foreach v_table in array array[
    'admin_operator_accounts_status_idx',
    'admin_operator_accounts_granted_by_idx',
    'admin_operator_accounts_last_changed_by_idx',
    'admin_worker_application_reviews_decided_by_idx'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_indexes
      where schemaname = 'public'
        and indexname = v_table
    ) then
      raise exception 'Admin control-plane index % is missing', v_table;
    end if;
  end loop;
end;
$$;

select jsonb_build_object(
  'admin_operator_roles_are_server_owned', true,
  'admin_operations_are_service_only', true,
  'sub_admin_access_is_owner_only', true,
  'direct_client_access_is_denied', true
);

rollback;
