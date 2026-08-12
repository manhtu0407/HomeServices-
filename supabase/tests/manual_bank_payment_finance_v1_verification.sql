-- Rollback-only structural verification for manual QR payment, direct-payment collateral, and finance controls.
begin;

do $verification$
declare
  v_table text;
  v_function regprocedure;
  v_definition text;
begin
  foreach v_table in array array[
    'job_payment_orders',
    'job_payment_reconciliation_events',
    'worker_direct_payment_collateral_reservations',
    'platform_bank_balance_snapshots'
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
      or pg_catalog.has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'select')
      or pg_catalog.has_table_privilege('anon', ('public.' || v_table)::regclass, 'insert')
      or pg_catalog.has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'insert')
      or not pg_catalog.has_table_privilege('service_role', ('public.' || v_table)::regclass, 'select') then
      raise exception 'payment table access is not service-owned for public.%', v_table;
    end if;
  end loop;

  foreach v_function in array array[
    'public.create_manual_bank_payment_order(uuid,uuid,integer,text,text,text,timestamp with time zone)'::regprocedure,
    'public.claim_manual_bank_payment(uuid,uuid,timestamp with time zone,text)'::regprocedure,
    'public.select_direct_worker_payment(uuid,uuid,text)'::regprocedure,
    'public.respond_to_direct_worker_payment(uuid,uuid,text,boolean)'::regprocedure,
    'public.decide_manual_bank_payment_reconciliation(uuid,uuid,text,integer,timestamp with time zone,text,text,text)'::regprocedure,
    'public.maintain_manual_bank_payment_holds(integer)'::regprocedure,
    'public.record_platform_bank_balance_snapshot(uuid,integer,timestamp with time zone)'::regprocedure,
    'public.admin_finance_summary(uuid,timestamp with time zone,timestamp with time zone)'::regprocedure,
    'private.schedule_payment_maintainer()'::regprocedure
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_proc
      where oid = v_function
        and prosecdef is true
        and proconfig = array['search_path=""']::text[]
    ) then
      raise exception 'finance RPC % is not a locked-down definer function', v_function;
    end if;

    if pg_catalog.has_function_privilege('anon', v_function, 'execute')
      or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
      or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'finance RPC % does not have service-only execute grants', v_function;
    end if;
  end loop;

  v_function := 'public.get_worker_payment_safety_balance(uuid)'::regprocedure;
  if not exists (
    select 1
    from pg_catalog.pg_proc
    where oid = v_function
      and prosecdef is false
      and proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'worker payment safety summary must remain locked-path security invoker';
  end if;
  if pg_catalog.has_function_privilege('anon', v_function, 'execute')
    or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
    or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
    raise exception 'worker payment safety summary is not service-only';
  end if;

  if pg_catalog.has_function_privilege(
    'service_role',
    'public.confirm_worker_cash_payment(uuid,uuid)'::regprocedure,
    'execute'
  ) then
    raise exception 'legacy unilateral cash confirmation is still executable';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'job_payment_orders_bank_reference_hash_uidx'
  ) then
    raise exception 'bank-reference reuse guard is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger as trigger_row
    join pg_catalog.pg_class as relation_row on relation_row.oid = trigger_row.tgrelid
    where trigger_row.tgname = 'job_payment_reconciliation_events_immutable'
      and relation_row.oid = 'public.job_payment_reconciliation_events'::regclass
      and not trigger_row.tgisinternal
  ) then
    raise exception 'payment reconciliation events are mutable';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.select_direct_worker_payment(uuid,uuid,text)'::regprocedure
  );
  if v_definition not like '%pg_advisory_xact_lock%'
    or v_definition not like '%v_has_existing_order%'
    or v_definition not like '%INSUFFICIENT_COLLATERAL%'
    or v_definition not like '%0.15%'
  then
    raise exception 'direct-payment selection lost its serialized 15 percent collateral guard';
  end if;
  if position('if v_collateral <= 0' in v_definition) = 0
    or position('delete from public.worker_payment_ledger' in v_definition) = 0
    or position('if v_collateral <= 0' in v_definition) > position('delete from public.worker_payment_ledger' in v_definition)
  then
    raise exception 'direct-payment selection can mutate the QR ledger before collateral validation';
  end if;

  if exists (
    select 1
    from public.job_payment_orders as payment_order
    join public.jobs as job on job.id = payment_order.job_id
    where payment_order.payment_method = 'platform_bank_manual'
      and payment_order.status = 'manual_qr_ready'
      and job.status = 'payment_pending'::public.job_status
      and job.payment_status = 'manual_qr_ready'
      and job.payment_provider = 'platform_bank_manual'
      and not exists (
        select 1
        from public.worker_payment_ledger as ledger
        where ledger.job_id = job.id
          and ledger.payment_provider = 'platform_bank_manual'
          and ledger.payment_state = 'pending'
      )
  ) then
    raise exception 'manual QR order is missing its pending worker ledger';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.respond_to_direct_worker_payment(uuid,uuid,text,boolean)'::regprocedure
  );
  if v_definition not like '%v_both_confirmed%'
    or v_definition not like '%direct_reconcile_required%'
    or v_definition not like '%direct_paid%'
  then
    raise exception 'direct-payment response no longer requires bilateral confirmation';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.decide_manual_bank_payment_reconciliation(uuid,uuid,text,integer,timestamp with time zone,text,text,text)'::regprocedure
  );
  if v_definition not like '%private.assert_finance_reconciler%'
    or v_definition not like '%BANK_REFERENCE_USED%'
    or v_definition not like '%payment_state = ''on_hold''%'
    or v_definition not like '%interval ''24 hours''%'
    or v_definition not like '%v_order_job_id%'
    or v_definition not like '%v_order.status <> ''direct_reconcile_required''%'
  then
    raise exception 'manual reconciliation lost finance authority, duplicate guard, or hold behavior';
  end if;

  v_definition := pg_catalog.pg_get_functiondef('public.maintain_manual_bank_payment_holds(integer)'::regprocedure);
  if v_definition not like '%v_candidate_order%'
    or v_definition not like '%for update skip locked%'
  then
    raise exception 'payment maintainer lost its non-blocking job-first timeout lock';
  end if;

  v_definition := pg_catalog.pg_get_functiondef('public.admin_finance_summary(uuid,timestamp with time zone,timestamp with time zone)'::regprocedure);
  if v_definition not like '%platform_incoming%'
    or v_definition not like '%direct_payment_total%'
    or v_definition not like '%unexplained_variance%'
    or v_definition not like '%v_actual_change is null then null%'
    or v_definition not like '%worker_balances%'
    or v_definition like '%v_commission_collected := v_commission_accrued%'
  then
    raise exception 'finance summary lost a required truthful metric';
  end if;
end;
$verification$;

select jsonb_build_object(
  'payment_tables_service_owned', true,
  'manual_and_direct_payment_rpcs_locked', true,
  'cash_confirmation_retired', true,
  'collateral_and_hold_guards_present', true,
  'finance_summary_truthful_when_snapshots_missing', true
) as manual_bank_payment_finance_v1_verification;

rollback;
