begin;

do $verification$
declare
  v_table text;
  v_function regprocedure;
  v_definition text;
begin
  foreach v_table in array array[
    'admin_financial_adjustments',
    'admin_finance_tax_policies',
    'admin_finance_tax_rules'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class
      where oid = ('public.' || v_table)::regclass and relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', v_table;
    end if;

    if pg_catalog.has_table_privilege('anon', ('public.' || v_table)::regclass, 'select')
      or pg_catalog.has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'select')
      or pg_catalog.has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'insert')
      or not pg_catalog.has_table_privilege('service_role', ('public.' || v_table)::regclass, 'select')
      or not pg_catalog.has_table_privilege('service_role', ('public.' || v_table)::regclass, 'insert') then
      raise exception 'finance table access is not service-owned for public.%', v_table;
    end if;
  end loop;

  foreach v_function in array array[
    'public.admin_finance_overview(uuid,timestamp with time zone,timestamp with time zone,text)'::regprocedure,
    'public.admin_finance_transactions_page(uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid,text,public.service_type,text)'::regprocedure,
    'public.admin_finance_export_rows(uuid,timestamp with time zone,timestamp with time zone,integer,text,public.service_type,text)'::regprocedure,
    'public.admin_create_finance_tax_policy_draft(uuid,jsonb)'::regprocedure,
    'public.admin_update_finance_tax_policy_draft(uuid,uuid,jsonb)'::regprocedure,
    'public.admin_transition_finance_tax_policy(uuid,uuid,text,text)'::regprocedure,
    'public.admin_approve_finance_tax_policy(uuid,uuid,text)'::regprocedure,
    'public.admin_retire_finance_tax_policy(uuid,uuid,text)'::regprocedure,
    'public.admin_finance_tax_policies(uuid)'::regprocedure,
    'public.admin_list_finance_tax_policies(uuid)'::regprocedure
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

  if not exists (
    select 1 from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid = 'public.admin_financial_adjustments'::regclass
      and trigger_row.tgname = 'admin_financial_adjustments_immutable'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'financial adjustment immutability trigger is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_finance_tax_policies'
      and column_name = 'source_reference'
  ) then
    raise exception 'tax policy source_reference is missing';
  end if;

  if exists (
    select 1 from public.admin_operator_accounts as account
    where account.status = 'active' and not ('finance.read' = any(account.capabilities))
  ) then
    raise exception 'active operator finance.read backfill is incomplete';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.admin_set_sub_admin_access_atomic(uuid,uuid,text,text[],text)'::regprocedure
  );
  if v_definition not like '%finance.read%'
    or v_definition not like '%finance.tax.manage%'
    or v_definition not like '%cardinality(v_capabilities) > 11%'
    or v_definition not like '%array_append(v_capabilities, ''finance.read'')%'
    or v_definition like '%array_append(v_capabilities, ''finance.reconcile'')%'
    or v_definition like '%array_append(v_capabilities, ''payouts.process'')%' then
    raise exception 'admin capability baseline or private finance capabilities drifted';
  end if;

  if (
    select provolatile from pg_catalog.pg_proc
    where oid = 'public.admin_finance_export_rows(uuid,timestamp with time zone,timestamp with time zone,integer,text,public.service_type,text)'::regprocedure
  ) <> 'v' then
    raise exception 'finance export must remain volatile because it writes audit';
  end if;

  if to_regprocedure('public.admin_finance_summary(uuid,timestamp with time zone,timestamp with time zone)') is null then
    raise exception 'legacy admin_finance_summary was removed';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'private.admin_finance_period_snapshot(timestamp with time zone,timestamp with time zone,public.service_type)'::regprocedure
  );
  if v_definition like '%from public.disputes%'
    or v_definition not like '%adjustment.realization_status = ''completed''%' then
    raise exception 'refund metrics can count dispute decisions without completed adjustments';
  end if;
end;
$verification$;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'finance-owner@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'finance-operator@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'finance-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'finance-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'finance-outsider@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles set role = 'admin' where id = 'f1000000-0000-4000-8000-000000000001';
update public.profiles set role = 'admin_operator' where id = 'f1000000-0000-4000-8000-000000000002';
update public.profiles set role = 'worker' where id = 'f1000000-0000-4000-8000-000000000004';

insert into public.admin_operator_accounts (
  user_id, baseline_role, capabilities, status, granted_by, last_changed_by
) values (
  'f1000000-0000-4000-8000-000000000002',
  'customer',
  '{}',
  'active',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001'
);

do $capability$
declare
  v_result record;
begin
  select * into strict v_result
  from public.admin_set_sub_admin_access_atomic(
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000002',
    'update',
    '{}',
    null
  );

  if not v_result.ok
    or v_result.capabilities_out <> array['finance.read']::text[]
    or 'finance.reconcile' = any(v_result.capabilities_out)
    or 'payouts.process' = any(v_result.capabilities_out) then
    raise exception 'finance.read was not auto-unioned as the sole baseline capability';
  end if;
end;
$capability$;

insert into public.customer_profiles (id, building_name, unit_number, district)
values ('f1000000-0000-4000-8000-000000000003', 'Finance QA', 'A-01', 'q7');

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'f1000000-0000-4000-8000-000000000004',
  array['plumbing']::public.service_type[], array['q7'], true, true, 5, 3,
  'approved', false, 'Finance Verification Worker', '1990-01-01'
);

-- A fixed historical window keeps these aggregates independent of relative-time seed jobs.
insert into public.jobs (
  id, customer_id, worker_id, service_type, description, status,
  final_price, gross_amount, platform_fee, worker_net, payment_provider,
  payment_status, payment_amount_received, payment_received_at, paid_at,
  created_at, display_code
) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000004', 'plumbing', 'Finance platform fixture one', 'paid', 100000, 100000, 10000, 90000, 'platform_bank_manual', 'manual_verified', 100000, '2001-08-13T01:00:00Z', '2001-08-13T01:00:00Z', '2001-08-13T00:00:00Z', 'FIN-0001'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000004', 'plumbing', 'Finance direct fixture', 'paid', 200000, 200000, 20000, 180000, 'direct_worker', 'direct_paid', 200000, '2001-08-13T02:00:00Z', '2001-08-13T02:00:00Z', '2001-08-13T00:00:00Z', 'FIN-0002'),
  ('f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000004', 'plumbing', 'Finance platform fixture two', 'paid', 300000, 300000, 30000, 270000, 'sepay_vietqr', 'received', 300000, '2001-08-13T03:00:00Z', '2001-08-13T03:00:00Z', '2001-08-13T00:00:00Z', 'FIN-0003');

insert into public.job_payment_orders (
  id, job_id, customer_id, worker_id, payment_method, status,
  gross_amount, platform_fee, worker_net, payment_code, transfer_content,
  qr_image_url, amount_received, credited_at
) values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000004', 'platform_bank_manual', 'manual_verified', 100000, 10000, 90000, 'NSAAAAAAAAAAAAAAAAAAAAAAAA', 'NSAAAAAAAAAAAAAAAAAAAAAAAA', 'https://example.test/qr.png', 100000, '2001-08-13T01:00:00Z'),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000004', 'direct_worker', 'direct_paid', 200000, 20000, 180000, null, null, null, 200000, '2001-08-13T02:00:00Z');

insert into public.worker_payment_ledger (
  job_id, worker_id, payment_provider, payment_state, gross_amount,
  platform_fee, worker_net, commission_level, commission_rate_bps, available_at
) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000004', 'platform_bank_manual', 'available', 100000, 10000, 90000, 1, 1000, '2001-08-13T01:00:00Z'),
  ('f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000004', 'sepay_vietqr', 'available', 300000, 30000, 270000, 1, 1000, '2001-08-13T03:00:00Z');

insert into public.admin_financial_adjustments (
  source_key, adjustment_type, job_id, worker_id, gross_refund_vnd,
  commission_reversal_vnd, cash_outflow_vnd, reason_code, recorded_by, realized_at
) values (
  'finance-refund-1', 'refund', 'f2000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000004', 50000, 5000, 50000,
  'CUSTOMER_REFUND', 'f1000000-0000-4000-8000-000000000001', '2001-08-13T04:00:00Z'
);

insert into public.admin_financial_adjustments (
  source_key, adjustment_type, job_id, worker_id, worker_credit_vnd,
  reason_code, recorded_by, realized_at
) values (
  'finance-worker-credit-1', 'worker_credit', 'f2000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000004', 7000,
  'WORKER_CREDIT', 'f1000000-0000-4000-8000-000000000001', '2001-08-13T05:00:00Z'
);

insert into public.platform_bank_balance_snapshots (
  account_key, balance_vnd, observed_at, entered_by
) values
  ('platform_secondary', 1000000, '2001-08-12T17:00:00Z', 'f1000000-0000-4000-8000-000000000001'),
  ('platform_secondary', 1350000, '2001-08-13T16:00:00Z', 'f1000000-0000-4000-8000-000000000001');

do $behavior$
declare
  v_overview jsonb;
  v_page jsonb;
  v_export jsonb;
  v_rejected boolean;
begin
  begin
    perform public.admin_finance_overview(
      'f1000000-0000-4000-8000-000000000005',
      '2001-08-12T17:00:00Z', '2001-08-13T17:00:00Z', 'hour'
    );
  exception when sqlstate 'P0001' then
    v_rejected := true;
  end;
  if v_rejected is not true then
    raise exception 'actor without finance.read accessed overview';
  end if;

  v_overview := public.admin_finance_overview(
    'f1000000-0000-4000-8000-000000000002',
    '2001-08-12T17:00:00Z', '2001-08-13T17:00:00Z', 'hour'
  );
  if (v_overview#>>'{metrics,gmv}')::bigint <> 600000
    or (v_overview#>>'{metrics,paid_job_count}')::bigint <> 3
    or (v_overview#>>'{metrics,average_order_value}')::bigint <> 200000
    or (v_overview#>>'{metrics,commission_accrued}')::bigint <> 60000
    or (v_overview#>>'{metrics,commission_collected}')::bigint <> 40000
    or (v_overview#>>'{metrics,commission_retained}')::bigint <> 35000
    or (v_overview#>>'{metrics,commission_receivable}')::bigint <> 15000
    or (v_overview#>>'{metrics,platform_incoming}')::bigint <> 400000
    or (v_overview#>>'{metrics,refund_outflow}')::bigint <> 50000
    or (v_overview#>>'{metrics,net_cash_flow}')::bigint <> 350000
    or v_overview#>>'{tax,status}' <> 'unconfigured' then
    raise exception 'finance overview totals or unconfigured tax state are incorrect: %', v_overview;
  end if;

  v_page := public.admin_finance_transactions_page(
    'f1000000-0000-4000-8000-000000000002',
    '2001-08-12T17:00:00Z', '2001-08-13T17:00:00Z',
    3, null, null, null, null, 'paid'
  );
  if pg_catalog.jsonb_array_length(v_page->'rows') <> 3
    or (v_page->>'has_more')::boolean
    or v_page->'next_cursor' <> 'null'::jsonb then
    raise exception 'exact final transaction page reported more rows: %', v_page;
  end if;

  v_page := public.admin_finance_transactions_page(
    'f1000000-0000-4000-8000-000000000002',
    '2001-08-12T17:00:00Z', '2001-08-13T17:00:00Z',
    2, null, null, null, null, 'paid'
  );
  if pg_catalog.jsonb_array_length(v_page->'rows') <> 2
    or not (v_page->>'has_more')::boolean
    or v_page->'next_cursor' = 'null'::jsonb then
    raise exception 'transaction page lookahead is incorrect: %', v_page;
  end if;

  v_export := public.admin_finance_export_rows(
    'f1000000-0000-4000-8000-000000000002',
    '2001-08-12T17:00:00Z', '2001-08-13T17:00:00Z',
    50001, 'direct_worker', 'plumbing', 'paid'
  );
  if (v_export->>'row_count')::integer <> 1
    or v_export#>>'{rows,0,payment_method}' <> 'direct_worker'
    or v_export::text ~ '(phone|bank_account|full_name)' then
    raise exception 'finance export filter, sentinel, or masking contract failed: %', v_export;
  end if;
end;
$behavior$;

do $adjustment_guards$
declare
  v_rejected boolean;
begin
  begin
    update public.admin_financial_adjustments
    set gross_refund_vnd = 40000, cash_outflow_vnd = 40000
    where source_key = 'finance-refund-1';
  exception when sqlstate 'P0001' then
    v_rejected := true;
  end;
  if v_rejected is not true then
    raise exception 'realized financial adjustment was mutable';
  end if;

  v_rejected := false;
  begin
    insert into public.admin_financial_adjustments (
      source_key, adjustment_type, job_id, gross_refund_vnd,
      cash_outflow_vnd, reason_code, recorded_by, realized_at
    ) values (
      'finance-over-refund', 'refund', 'f2000000-0000-4000-8000-000000000001',
      60000, 60000, 'OVER_REFUND', 'f1000000-0000-4000-8000-000000000001', '2001-08-13T06:00:00Z'
    );
  exception when check_violation then
    v_rejected := true;
  end;
  if v_rejected is not true then
    raise exception 'cumulative refund exceeded the paid job snapshot';
  end if;
end;
$adjustment_guards$;

do $tax_policy$
declare
  v_policy record;
  v_approved record;
  v_list_row record;
  v_list jsonb;
  v_overview jsonb;
  v_rejected boolean;
begin
  select * into strict v_policy
  from public.admin_set_sub_admin_access_atomic(
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000002',
    'update', array['finance.tax.manage'], null
  );
  if not ('finance.read' = any(v_policy.capabilities_out))
    or not ('finance.tax.manage' = any(v_policy.capabilities_out))
    or 'finance.reconcile' = any(v_policy.capabilities_out)
    or 'payouts.process' = any(v_policy.capabilities_out) then
    raise exception 'tax management grant changed private finance capabilities';
  end if;

  select * into strict v_policy
  from public.admin_create_finance_tax_policy_draft(
    'f1000000-0000-4000-8000-000000000002',
    '{"name":"Platform commission tax estimate","tax_type":"vat","subject":"platform","basis":"platform_commission","rate_bps":500,"effective_from":"2001-01-01","source_reference":"accountant-file-1"}'::jsonb
  );
  if v_policy.status <> 'draft' or v_policy.source_reference <> 'accountant-file-1'
    or v_policy.effective_to is not null or v_policy.created_at is null or v_policy.updated_at is null then
    raise exception 'tax draft wrapper omitted full policy fields: %', row_to_json(v_policy);
  end if;

  begin
    update public.admin_finance_tax_policies
    set status = 'approved',
        approved_by = 'f1000000-0000-4000-8000-000000000001',
        approved_at = now(),
        approval_evidence_ref = 'direct-update'
    where id = v_policy.id;
  exception when sqlstate 'P0001' then
    v_rejected := true;
  end;
  if v_rejected is not true then
    raise exception 'tax policy approval bypassed the owner RPC boundary';
  end if;

  v_rejected := false;
  begin
    perform public.admin_approve_finance_tax_policy(
      'f1000000-0000-4000-8000-000000000002', v_policy.id, 'accountant-approved-1'
    );
  exception when sqlstate 'P0001' then
    v_rejected := true;
  end;
  if v_rejected is not true then
    raise exception 'admin operator approved a tax policy';
  end if;

  select * into strict v_approved
  from public.admin_approve_finance_tax_policy(
    'f1000000-0000-4000-8000-000000000001', v_policy.id, 'accountant-approved-1'
  );
  if v_approved.status <> 'approved'
    or v_approved.approved_by <> 'f1000000-0000-4000-8000-000000000001'::uuid
    or v_approved.approved_at is null then
    raise exception 'owner approval wrapper returned an incomplete policy: %', row_to_json(v_approved);
  end if;

  v_list := public.admin_finance_tax_policies('f1000000-0000-4000-8000-000000000002');
  if v_list->>'active_policy_id' <> v_policy.id::text
    or pg_catalog.jsonb_array_length(v_list->'tax_policies') <> 1
    or v_list#>>'{tax_policies,0,approved_at}' is null then
    raise exception 'tax policy list omitted active id or full fields: %', v_list;
  end if;

  select * into strict v_list_row
  from public.admin_list_finance_tax_policies('f1000000-0000-4000-8000-000000000002');
  if v_list_row.active_policy_id <> v_policy.id
    or v_list_row.effective_to is not null
    or v_list_row.approved_at is null
    or v_list_row.created_at is null
    or v_list_row.updated_at is null then
    raise exception 'list wrapper omitted active id or full policy fields: %', row_to_json(v_list_row);
  end if;

  v_overview := public.admin_finance_overview(
    'f1000000-0000-4000-8000-000000000002',
    '2001-08-12T17:00:00Z', '2001-08-13T17:00:00Z', 'hour'
  );
  if v_overview#>>'{tax,status}' <> 'estimated'
    or (v_overview#>>'{tax,estimated_vnd}')::bigint <> 1750 then
    raise exception 'approved tax policy did not produce the expected estimate: %', v_overview->'tax';
  end if;

  v_rejected := false;
  begin
    update public.admin_finance_tax_rules set rate_bps = 600 where policy_id = v_policy.id;
  exception when sqlstate 'P0001' then
    v_rejected := true;
  end;
  if v_rejected is not true then
    raise exception 'approved tax rules remained mutable';
  end if;

  perform public.admin_retire_finance_tax_policy(
    'f1000000-0000-4000-8000-000000000001', v_policy.id, 'Superseded by accountant review'
  );
  if (select status from public.admin_finance_tax_policies where id = v_policy.id) <> 'retired' then
    raise exception 'owner retire wrapper did not retire the policy';
  end if;
end;
$tax_policy$;

select pg_catalog.jsonb_build_object(
  'finance_tables_service_owned', true,
  'capability_baseline_verified', true,
  'overview_and_pagination_verified', true,
  'adjustment_invariants_verified', true,
  'tax_lifecycle_verified', true
) as admin_finance_overview_v1_verification;

rollback;
