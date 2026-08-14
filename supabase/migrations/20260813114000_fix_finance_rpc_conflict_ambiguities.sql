begin;

do $migration$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.respond_to_direct_worker_payment(uuid,uuid,text,boolean)'::pg_catalog.regprocedure
  ) into v_definition;
  if pg_catalog.strpos(v_definition, 'on conflict (job_id) do nothing') = 0 then
    raise exception 'respond_to_direct_worker_payment conflict target was not found';
  end if;
  execute pg_catalog.replace(
    v_definition,
    'on conflict (job_id) do nothing',
    'on conflict on constraint worker_cash_commission_ledger_job_id_key do nothing'
  );

  select pg_catalog.pg_get_functiondef(
    'public.decide_manual_bank_payment_reconciliation(uuid,uuid,text,integer,timestamp with time zone,text,text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  if pg_catalog.strpos(v_definition, 'on conflict (job_id) do nothing') = 0 then
    raise exception 'decide_manual_bank_payment_reconciliation conflict target was not found';
  end if;
  execute pg_catalog.replace(
    v_definition,
    'on conflict (job_id) do nothing',
    'on conflict on constraint worker_cash_commission_ledger_job_id_key do nothing'
  );

  select pg_catalog.pg_get_functiondef(
    'public.record_platform_bank_balance_snapshot(uuid,integer,timestamp with time zone)'::pg_catalog.regprocedure
  ) into v_definition;
  if pg_catalog.strpos(v_definition, 'on conflict (account_key, observed_at) do update') = 0 then
    raise exception 'record_platform_bank_balance_snapshot conflict target was not found';
  end if;
  execute pg_catalog.replace(
    v_definition,
    'on conflict (account_key, observed_at) do update',
    'on conflict on constraint platform_bank_balance_snapshots_account_key_observed_at_key do update'
  );
end;
$migration$;

alter function private.assert_finance_reconciler(uuid) stable;

commit;
