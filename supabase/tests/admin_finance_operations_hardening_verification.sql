begin;

do $verification$
declare
  v_function regprocedure;
  v_definition text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.admin_finance_mutation_receipts'::regclass and relrowsecurity
  ) then
    raise exception 'finance mutation receipts must have RLS enabled';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.admin_finance_mutation_receipts', 'select')
    or pg_catalog.has_table_privilege('authenticated', 'public.admin_finance_mutation_receipts', 'select')
    or not pg_catalog.has_table_privilege('service_role', 'public.admin_finance_mutation_receipts', 'select') then
    raise exception 'finance mutation receipts are not service-owned';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_payment_orders'
      and column_name = 'assigned_to'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'worker_withdrawal_requests'
      and column_name = 'transfer_reference_hash'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'platform_bank_balance_snapshots'
      and column_name = 'client_request_id'
  ) then
    raise exception 'finance assignment, masked reference, or idempotency columns are missing';
  end if;

  foreach v_function in array array[
    'public.record_platform_bank_balance_snapshot_idempotent(uuid,integer,timestamp with time zone,uuid)'::regprocedure,
    'public.admin_finance_transaction_detail(uuid,uuid)'::regprocedure,
    'public.admin_create_finance_tax_policy_draft(uuid,jsonb)'::regprocedure,
    'public.admin_update_finance_tax_policy_draft(uuid,uuid,jsonb)'::regprocedure,
    'public.admin_claim_payment_reconciliation_atomic(uuid,uuid,integer,uuid,text)'::regprocedure,
    'public.admin_release_payment_reconciliation_atomic(uuid,uuid,integer,uuid,text)'::regprocedure,
    'public.admin_decide_payment_reconciliation_v2(uuid,uuid,integer,uuid,text,integer,text,text,timestamp with time zone,text)'::regprocedure,
    'public.admin_review_worker_payout_method_v2(uuid,uuid,integer,uuid,text,text)'::regprocedure,
    'public.admin_claim_worker_withdrawal_v2(uuid,uuid,integer,uuid,text)'::regprocedure,
    'public.admin_release_worker_withdrawal_v2(uuid,uuid,integer,uuid,text)'::regprocedure,
    'public.admin_resolve_worker_withdrawal_v2(uuid,uuid,integer,uuid,text,text,text,boolean,text)'::regprocedure
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc
      where oid = v_function and prosecdef and proconfig = array['search_path=""']::text[]
    ) then
      raise exception 'finance RPC % is not a locked-path definer', v_function;
    end if;

    if pg_catalog.has_function_privilege('anon', v_function, 'execute')
      or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
      or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'finance RPC % is not service-only', v_function;
    end if;
  end loop;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.admin_resolve_worker_withdrawal_v2(uuid,uuid,integer,uuid,text,text,text,boolean,text)'::regprocedure
  );
  if v_definition not like '%p_external_transfer_confirmed is not true%'
    or v_definition not like '%v_request.processing_by <> p_actor_id%'
    or v_definition not like '%transfer_reference_hash%'
    or v_definition like '%set transfer_reference = p_transfer_reference%'
  then
    raise exception 'manual payout confirmation, claimant ownership, or masked reference contract drifted';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.admin_decide_payment_reconciliation_v2(uuid,uuid,integer,uuid,text,integer,text,text,timestamp with time zone,text)'::regprocedure
  );
  if v_definition not like '%v_order.assigned_to <> p_actor_id%'
    or v_definition not like '%VERSION_CONFLICT%'
    or v_definition not like '%payment_reconciliation_decision%'
  then
    raise exception 'reconciliation ownership, version, or idempotency contract drifted';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.admin_create_finance_tax_policy_draft(uuid,jsonb)'::regprocedure
  );
  if v_definition not like '%jsonb_array_length(p_policy->''rules'') not between 1 and 20%'
    or v_definition not like '%jsonb_array_elements(p_policy->''rules'')%'
  then
    raise exception 'multi-rule tax draft contract drifted';
  end if;
end;
$verification$;

rollback;
