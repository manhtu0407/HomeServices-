begin;

do $$
declare
  v_function regprocedure;
  v_table text;
  v_definition text;
begin
  foreach v_table in array array[
    'worker_payout_methods',
    'worker_withdrawal_requests'
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
       or pg_catalog.has_table_privilege('anon', ('public.' || v_table)::regclass, 'insert')
       or pg_catalog.has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'select')
       or pg_catalog.has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'insert')
       or pg_catalog.has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'update') then
      raise exception 'direct client access is granted on public.%', v_table;
    end if;

    if not pg_catalog.has_table_privilege('service_role', ('public.' || v_table)::regclass, 'select')
       or not pg_catalog.has_table_privilege('service_role', ('public.' || v_table)::regclass, 'insert')
       or not pg_catalog.has_table_privilege('service_role', ('public.' || v_table)::regclass, 'update') then
      raise exception 'service role does not retain required access on public.%', v_table;
    end if;
  end loop;

  foreach v_function in array array[
    'public.upsert_worker_payout_method(uuid,text,text,text)'::regprocedure,
    'public.create_worker_withdrawal_request(uuid,integer,uuid)'::regprocedure,
    'public.admin_review_worker_payout_method_atomic(uuid,uuid,text,text)'::regprocedure,
    'public.admin_claim_worker_withdrawal_atomic(uuid,uuid)'::regprocedure,
    'public.admin_resolve_worker_withdrawal_atomic(uuid,uuid,text,text,text)'::regprocedure
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_proc
      where oid = v_function
        and prosecdef is true
        and proconfig = array['search_path=""']::text[]
    ) then
      raise exception 'payout RPC % is not a locked-down definer function', v_function;
    end if;

    if pg_catalog.has_function_privilege('anon', v_function, 'execute')
       or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
       or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'payout RPC % does not have service-only execute grants', v_function;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    join pg_catalog.pg_class as table_row on table_row.oid = trigger_row.tgrelid
    where table_row.oid = 'public.worker_withdrawal_requests'::regclass
      and trigger_row.tgname = 'worker_withdrawal_requests_snapshot_immutable'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'worker withdrawal financial snapshot trigger is missing';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.create_worker_withdrawal_request(uuid,integer,uuid)'::regprocedure
  );
  if v_definition not like '%pg_advisory_xact_lock%'
     or v_definition not like '%private.worker_withdrawable_balance(p_worker_id)%'
     or v_definition not like '%PAYOUT_METHOD_NOT_VERIFIED%' then
    raise exception 'worker withdrawal creation no longer reserves balance or requires a verified payout method';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'private.worker_withdrawable_balance(uuid)'::regprocedure
  );
  if v_definition not like '%request.status in (''pending'', ''processing'')%'
     or v_definition not like '%request.status = ''paid''%' then
    raise exception 'the withdrawable balance no longer reserves pending and paid withdrawals';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.upsert_worker_payout_method(uuid,text,text,text)'::regprocedure
  );
  if v_definition not like '%payout_method.bank_key is distinct from v_bank_key%'
     or v_definition not like '%payout_method.account_holder_name is distinct from v_holder_name%'
     or v_definition not like '%payout_method.bank_account is distinct from v_bank_account%'
     or v_definition not like '%''allow'',%''worker_payout_method_submitted''%'
  then
    raise exception 'worker payout method update must qualify stored account fields';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.create_worker_withdrawal_request(uuid,integer,uuid)'::regprocedure
  );
  if v_definition not like '%''allow'',%''withdrawal_requested''%' then
    raise exception 'worker withdrawal creation must record an allowed audit decision';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.admin_resolve_worker_withdrawal_atomic(uuid,uuid,text,text,text)'::regprocedure
  );
  if v_definition not like '%payouts.process%'
     or v_definition not like '%v_request.status <> ''processing''%'
     or v_definition not like '%WITHDRAWAL_ASSIGNED_TO_OTHER%'
     or v_definition not like '%v_transfer_reference !~%'
  then
    raise exception 'withdrawal resolution lost payout processing capability or ownership controls';
  end if;
end;
$$;

select jsonb_build_object(
  'worker_payout_tables_service_only', true,
  'withdrawal_snapshot_immutable', true,
  'manual_payout_rpc_controls', true,
  'payout_processing_capability', true
);

rollback;
