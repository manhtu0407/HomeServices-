begin;

alter table public.job_payment_orders
  add column if not exists assigned_to uuid references public.profiles(id) on delete restrict,
  add column if not exists assigned_at timestamptz,
  add column if not exists version integer not null default 1 check (version > 0);

alter table public.worker_payout_methods
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists last_client_request_id uuid;

alter table public.worker_withdrawal_requests
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists last_client_request_id uuid,
  add column if not exists transfer_reference_hash text
    check (transfer_reference_hash is null or transfer_reference_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists transfer_reference_suffix text
    check (transfer_reference_suffix is null or transfer_reference_suffix ~ '^[A-Za-z0-9._/-]{2,16}$');

alter table public.platform_bank_balance_snapshots
  add column if not exists client_request_id uuid;

create unique index if not exists platform_bank_balance_snapshots_actor_request_uidx
  on public.platform_bank_balance_snapshots (entered_by, client_request_id)
  where client_request_id is not null;

create index if not exists job_payment_orders_admin_assignment_idx
  on public.job_payment_orders (assigned_to, status, updated_at asc, id asc);

create index if not exists job_payment_orders_admin_queue_keyset_idx
  on public.job_payment_orders (status, response_deadline asc nulls last, updated_at asc, id asc);

create index if not exists worker_payout_methods_admin_keyset_idx
  on public.worker_payout_methods (status, created_at asc, id asc);

create index if not exists worker_withdrawal_requests_admin_keyset_idx
  on public.worker_withdrawal_requests (status, requested_at asc, id asc);

create table if not exists public.admin_finance_mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  client_request_id uuid not null,
  operation text not null check (operation in (
    'payment_reconciliation_claim',
    'payment_reconciliation_release',
    'payment_reconciliation_decision',
    'payout_method_decision',
    'withdrawal_claim',
    'withdrawal_release',
    'withdrawal_resolve'
  )),
  subject_id uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (actor_id, client_request_id)
);

alter table public.admin_finance_mutation_receipts enable row level security;
revoke all on table public.admin_finance_mutation_receipts from public, anon, authenticated;
grant all on table public.admin_finance_mutation_receipts to service_role;

alter table public.worker_withdrawal_requests
  drop constraint if exists worker_withdrawal_requests_lifecycle_check;

alter table public.worker_withdrawal_requests
  add constraint worker_withdrawal_requests_lifecycle_check
  check (
    (status = 'pending'
      and processing_at is null and processing_by is null
      and processed_at is null and processed_by is null
      and transfer_reference is null and transfer_reference_hash is null
      and transfer_reference_suffix is null and resolution_reason is null)
    or (status = 'processing'
      and processing_at is not null and processing_by is not null
      and processed_at is null and processed_by is null
      and transfer_reference is null and transfer_reference_hash is null
      and transfer_reference_suffix is null and resolution_reason is null)
    or (status = 'paid'
      and processing_at is not null and processing_by is not null
      and processed_at is not null and processed_by is not null
      and (
        transfer_reference ~ '^[A-Za-z0-9._/-]{3,128}$'
        or (
          transfer_reference is null
          and transfer_reference_hash ~ '^[0-9a-f]{64}$'
          and transfer_reference_suffix ~ '^[A-Za-z0-9._/-]{2,16}$'
        )
      )
      and resolution_reason is null)
    or (status in ('rejected', 'failed')
      and processing_at is not null and processing_by is not null
      and processed_at is not null and processed_by is not null
      and transfer_reference is null and transfer_reference_hash is null
      and transfer_reference_suffix is null
      and char_length(btrim(resolution_reason)) between 3 and 500)
  );

create or replace function private.assert_payout_processor(p_actor_id uuid)
returns public.user_role
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.user_role;
begin
  select profile.role into v_role
  from public.profiles as profile
  where profile.id = p_actor_id;

  if v_role <> 'admin'::public.user_role
     and not exists (
       select 1
       from public.admin_operator_accounts as operator_account
       where operator_account.user_id = p_actor_id
         and operator_account.status = 'active'
         and 'payouts.process' = any(operator_account.capabilities)
     )
  then
    raise exception using errcode = '42501', message = 'PAYOUT_PROCESS_REQUIRED';
  end if;
  return v_role;
end;
$function$;

create or replace function public.record_platform_bank_balance_snapshot_idempotent(
  p_actor_id uuid,
  p_balance_vnd integer,
  p_observed_at timestamptz,
  p_client_request_id uuid
)
returns table (snapshot_id uuid, balance_vnd integer, observed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot public.platform_bank_balance_snapshots%rowtype;
begin
  perform private.assert_finance_reconciler(p_actor_id);
  if p_balance_vnd is null or p_balance_vnd < 0 or p_observed_at is null or p_client_request_id is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  select snapshot.* into v_snapshot
  from public.platform_bank_balance_snapshots as snapshot
  where snapshot.entered_by = p_actor_id and snapshot.client_request_id = p_client_request_id;
  if found then
    if v_snapshot.balance_vnd <> p_balance_vnd or v_snapshot.observed_at <> p_observed_at then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return query select v_snapshot.id, v_snapshot.balance_vnd, v_snapshot.observed_at;
    return;
  end if;
  insert into public.platform_bank_balance_snapshots (
    account_key, balance_vnd, observed_at, entered_by, client_request_id
  ) values (
    'platform_secondary', p_balance_vnd, p_observed_at, p_actor_id, p_client_request_id
  )
  returning * into v_snapshot;
  return query select v_snapshot.id, v_snapshot.balance_vnd, v_snapshot.observed_at;
end;
$function$;

create or replace function public.admin_finance_transaction_detail(
  p_actor_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_transaction jsonb;
  v_timeline jsonb;
begin
  perform private.assert_finance_reader(p_actor_id);
  select pg_catalog.jsonb_build_object(
    'job_id', job.id,
    'display_code', job.display_code,
    'customer_ref', 'C-' || upper(substr(md5(job.customer_id::text), 1, 8)),
    'worker_ref', case when job.worker_id is null then null else 'W-' || upper(substr(md5(job.worker_id::text), 1, 8)) end,
    'service_type', job.service_type::text,
    'payment_method', coalesce(payment_order.payment_method, job.payment_provider, 'unknown'),
    'status', job.status::text,
    'gross_amount_vnd', coalesce(job.gross_amount, job.payment_amount_received, job.final_price),
    'platform_fee_vnd', job.platform_fee,
    'worker_net_vnd', job.worker_net,
    'refund_amount_vnd', coalesce(adjustment.refund_amount_vnd, 0),
    'commission_reversal_vnd', coalesce(adjustment.commission_reversal_vnd, 0),
    'worker_credit_vnd', coalesce(adjustment.worker_credit_vnd, 0),
    'paid_at', job.paid_at
  ) into v_transaction
  from public.jobs as job
  left join public.job_payment_orders as payment_order on payment_order.job_id = job.id
  left join lateral (
    select
      sum(entry.gross_refund_vnd)::bigint as refund_amount_vnd,
      sum(entry.commission_reversal_vnd)::bigint as commission_reversal_vnd,
      sum(entry.worker_credit_vnd)::bigint as worker_credit_vnd
    from public.admin_financial_adjustments as entry
    where entry.job_id = job.id and entry.realization_status = 'completed'
  ) as adjustment on true
  where job.id = p_job_id and job.status in ('paid'::public.job_status, 'reviewed'::public.job_status);

  if v_transaction is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_type', event.event_type,
    'occurred_at', event.created_at,
    'actor_ref', case when event.actor_id is null then null else 'A-' || upper(substr(md5(event.actor_id::text), 1, 8)) end
  ) order by event.created_at asc), '[]'::jsonb)
  into v_timeline
  from public.job_payment_reconciliation_events as event
  where event.job_id = p_job_id;

  return jsonb_build_object('transaction', v_transaction, 'timeline', v_timeline, 'pii', 'masked');
end;
$function$;

create or replace function public.admin_create_finance_tax_policy_draft(
  p_actor_id uuid,
  p_policy jsonb
)
returns table (
  id uuid, version integer, name text, tax_type text, subject text, basis text,
  rate_bps integer, status text, effective_from date, effective_to date,
  source_reference text, approved_at timestamptz, approved_by uuid,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rules jsonb;
  v_subject text;
  v_tax_type text;
  v_policy_key text;
  v_version integer;
  v_result jsonb;
  v_source_reference text := btrim(coalesce(p_policy->>'source_reference', ''));
begin
  perform private.assert_finance_tax_manager(p_actor_id);
  if jsonb_typeof(p_policy->'rules') <> 'array' or jsonb_array_length(p_policy->'rules') not between 1 and 20
     or char_length(v_source_reference) not between 3 and 500 then
    raise exception 'INVALID_TAX_POLICY_INPUT' using errcode = '22023';
  end if;
  v_subject := p_policy->'rules'->0->>'subject';
  v_tax_type := lower(btrim(p_policy->'rules'->0->>'tax_type'));
  if v_subject not in ('platform', 'worker') or v_tax_type !~ '^[a-z0-9_]{2,40}$'
     or exists (
       select 1 from jsonb_array_elements(p_policy->'rules') as item
       where item->>'subject' is distinct from v_subject
     ) then
    raise exception 'INVALID_TAX_POLICY_RULES' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object(
    'tax_code', lower(btrim(item->>'tax_type')),
    'label', p_policy->>'name',
    'calculation_basis', item->>'basis',
    'rate_bps', (item->>'rate_bps')::integer,
    'service_type', null
  )) into v_rules from jsonb_array_elements(p_policy->'rules') as item;
  v_policy_key := regexp_replace(v_tax_type, '[^a-z0-9]+', '_', 'g');
  select coalesce(max(policy.version), 0) + 1 into v_version
  from public.admin_finance_tax_policies as policy where policy.policy_key = v_policy_key;
  v_result := public.admin_save_finance_tax_policy_draft(
    p_actor_id, null, v_policy_key, v_version, p_policy->>'name', v_subject,
    (p_policy->>'effective_from')::date, nullif(p_policy->>'effective_to', '')::date, v_rules
  );
  update public.admin_finance_tax_policies as policy set source_reference = v_source_reference
  where policy.id = (v_result->>'policy_id')::uuid;
  return query select policy.id, policy.version, policy.name, rule.tax_code, policy.subject_type,
    rule.calculation_basis, rule.rate_bps, policy.status, policy.effective_from,
    policy.effective_to, policy.source_reference, policy.approved_at, policy.approved_by,
    policy.created_at, policy.updated_at
  from public.admin_finance_tax_policies as policy
  join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
  where policy.id = (v_result->>'policy_id')::uuid
  order by rule.created_at asc, rule.id asc;
end;
$function$;

create or replace function public.admin_update_finance_tax_policy_draft(
  p_actor_id uuid,
  p_policy_id uuid,
  p_policy jsonb
)
returns table (
  id uuid, version integer, name text, tax_type text, subject text, basis text,
  rate_bps integer, status text, effective_from date, effective_to date,
  source_reference text, approved_at timestamptz, approved_by uuid,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.admin_finance_tax_policies%rowtype;
  v_rules jsonb;
  v_subject text;
  v_source_reference text := btrim(coalesce(p_policy->>'source_reference', ''));
begin
  perform private.assert_finance_tax_manager(p_actor_id);
  if jsonb_typeof(p_policy->'rules') <> 'array' or jsonb_array_length(p_policy->'rules') not between 1 and 20
     or char_length(v_source_reference) not between 3 and 500 then
    raise exception 'INVALID_TAX_POLICY_INPUT' using errcode = '22023';
  end if;
  v_subject := p_policy->'rules'->0->>'subject';
  if v_subject not in ('platform', 'worker') or exists (
    select 1 from jsonb_array_elements(p_policy->'rules') as item
    where item->>'subject' is distinct from v_subject
  ) then raise exception 'INVALID_TAX_POLICY_RULES' using errcode = '22023'; end if;
  select policy.* into strict v_existing from public.admin_finance_tax_policies as policy where policy.id = p_policy_id;
  select jsonb_agg(jsonb_build_object(
    'tax_code', lower(btrim(item->>'tax_type')), 'label', p_policy->>'name',
    'calculation_basis', item->>'basis', 'rate_bps', (item->>'rate_bps')::integer,
    'service_type', null
  )) into v_rules from jsonb_array_elements(p_policy->'rules') as item;
  perform public.admin_save_finance_tax_policy_draft(
    p_actor_id, p_policy_id, v_existing.policy_key, v_existing.version,
    p_policy->>'name', v_subject, (p_policy->>'effective_from')::date,
    nullif(p_policy->>'effective_to', '')::date, v_rules
  );
  update public.admin_finance_tax_policies as policy set source_reference = v_source_reference where policy.id = p_policy_id;
  return query select policy.id, policy.version, policy.name, rule.tax_code, policy.subject_type,
    rule.calculation_basis, rule.rate_bps, policy.status, policy.effective_from,
    policy.effective_to, policy.source_reference, policy.approved_at, policy.approved_by,
    policy.created_at, policy.updated_at
  from public.admin_finance_tax_policies as policy
  join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
  where policy.id = p_policy_id order by rule.created_at asc, rule.id asc;
end;
$function$;

revoke all on function private.assert_payout_processor(uuid) from public, anon, authenticated;
grant execute on function private.assert_payout_processor(uuid) to service_role;
revoke all on function public.record_platform_bank_balance_snapshot_idempotent(uuid, integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.admin_finance_transaction_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_platform_bank_balance_snapshot_idempotent(uuid, integer, timestamptz, uuid) to service_role;
grant execute on function public.admin_finance_transaction_detail(uuid, uuid) to service_role;

create or replace function public.admin_claim_payment_reconciliation_atomic(
  p_actor_id uuid,
  p_payment_order_id uuid,
  p_expected_version integer,
  p_client_request_id uuid,
  p_takeover_reason text default null
)
returns table (
  ok boolean,
  error_code text,
  payment_order_id uuid,
  assigned_to_out uuid,
  assigned_at_out timestamptz,
  version_out integer,
  generated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.job_payment_orders%rowtype;
  v_role public.user_role;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_prior jsonb;
  v_prior_operation text;
  v_response jsonb;
  v_takeover boolean := false;
begin
  perform private.assert_finance_reconciler(p_actor_id);
  select receipt.response, receipt.operation into v_prior, v_prior_operation
  from public.admin_finance_mutation_receipts as receipt
  where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior_operation <> 'payment_reconciliation_claim' or v_prior->>'payment_order_id' <> p_payment_order_id::text then
      return query select false, 'IDEMPOTENCY_CONFLICT', p_payment_order_id, null::uuid, null::timestamptz, null::integer, v_now;
      return;
    end if;
    return query select true, null::text, p_payment_order_id,
      (v_prior->>'assigned_to')::uuid, (v_prior->>'assigned_at')::timestamptz,
      (v_prior->>'version')::integer, (v_prior->>'generated_at')::timestamptz;
    return;
  end if;

  select profile.role into v_role from public.profiles as profile where profile.id = p_actor_id;
  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.id = p_payment_order_id
  for update;
  if not found then
    return query select false, 'PAYMENT_ORDER_NOT_FOUND', p_payment_order_id, null::uuid, null::timestamptz, null::integer, v_now;
    return;
  end if;
  if v_order.assigned_to = p_actor_id then
    v_response := pg_catalog.jsonb_build_object(
      'payment_order_id', v_order.id,
      'assigned_to', v_order.assigned_to,
      'assigned_at', v_order.assigned_at,
      'version', v_order.version,
      'generated_at', v_now
    );
    insert into public.admin_finance_mutation_receipts (actor_id, client_request_id, operation, subject_id, response)
    values (p_actor_id, p_client_request_id, 'payment_reconciliation_claim', v_order.id, v_response);
    return query select true, null::text, v_order.id, v_order.assigned_to, v_order.assigned_at, v_order.version, v_now;
    return;
  end if;
  if v_order.version <> p_expected_version then
    return query select false, 'VERSION_CONFLICT', v_order.id, v_order.assigned_to, v_order.assigned_at, v_order.version, v_now;
    return;
  end if;
  if v_order.assigned_to is not null and v_order.assigned_to <> p_actor_id then
    v_takeover := true;
    if v_role <> 'admin'::public.user_role then
      return query select false, 'ALREADY_ASSIGNED', v_order.id, v_order.assigned_to, v_order.assigned_at, v_order.version, v_now;
      return;
    end if;
    if char_length(btrim(coalesce(p_takeover_reason, ''))) < 3 then
      return query select false, 'TAKEOVER_REASON_REQUIRED', v_order.id, v_order.assigned_to, v_order.assigned_at, v_order.version, v_now;
      return;
    end if;
  end if;

  update public.job_payment_orders
  set assigned_to = p_actor_id,
      assigned_at = case when v_takeover then v_now else coalesce(assigned_at, v_now) end,
      version = version + 1
  where id = v_order.id
  returning * into v_order;

  v_response := pg_catalog.jsonb_build_object(
    'payment_order_id', v_order.id,
    'assigned_to', v_order.assigned_to,
    'assigned_at', v_order.assigned_at,
    'version', v_order.version,
    'generated_at', v_now
  );
  insert into public.admin_finance_mutation_receipts (actor_id, client_request_id, operation, subject_id, response)
  values (p_actor_id, p_client_request_id, 'payment_reconciliation_claim', v_order.id, v_response);

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id, v_role::text, 'admin_payment_reconciliation', 'claim', 'payment_reconciliation',
    'allow', 'payment_reconciliation_claimed',
    pg_catalog.jsonb_build_object('payment_order_id', v_order.id, 'takeover', v_takeover)
  );

  return query select true, null::text, v_order.id, v_order.assigned_to, v_order.assigned_at, v_order.version, v_now;
end;
$function$;

create or replace function public.admin_review_worker_payout_method_v2(
  p_actor_id uuid,
  p_payout_method_id uuid,
  p_expected_version integer,
  p_client_request_id uuid,
  p_decision text,
  p_reason text default null
)
returns table (
  ok boolean,
  error_code text,
  payout_method_id uuid,
  status_out text,
  reviewed_at_out timestamptz,
  version_out integer,
  generated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_method public.worker_payout_methods%rowtype;
  v_source jsonb;
  v_prior jsonb;
  v_prior_operation text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform private.assert_payout_processor(p_actor_id);
  select receipt.response, receipt.operation into v_prior, v_prior_operation
  from public.admin_finance_mutation_receipts as receipt
  where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior_operation <> 'payout_method_decision' or v_prior->>'payout_method_id' <> p_payout_method_id::text then
      return query select false, 'IDEMPOTENCY_CONFLICT', p_payout_method_id, null::text, null::timestamptz, null::integer, v_now;
      return;
    end if;
    return query select true, null::text, p_payout_method_id, v_prior->>'status',
      (v_prior->>'reviewed_at')::timestamptz, (v_prior->>'version')::integer,
      (v_prior->>'generated_at')::timestamptz;
    return;
  end if;
  select method.* into v_method from public.worker_payout_methods as method where method.id = p_payout_method_id for update;
  if not found then
    return query select false, 'PAYOUT_METHOD_NOT_FOUND', p_payout_method_id, null::text, null::timestamptz, null::integer, v_now;
    return;
  end if;
  if v_method.version <> p_expected_version then
    return query select false, 'VERSION_CONFLICT', v_method.id, v_method.status, v_method.reviewed_at, v_method.version, v_now;
    return;
  end if;
  select to_jsonb(receipt) into v_source
  from public.admin_review_worker_payout_method_atomic(
    p_actor_id, p_payout_method_id, p_decision, p_reason
  ) as receipt;
  if coalesce((v_source->>'ok')::boolean, false) is not true then
    return query select false, coalesce(v_source->>'error_code', 'PAYOUT_METHOD_REVIEW_FAILED'),
      v_method.id, v_method.status, v_method.reviewed_at, v_method.version, v_now;
    return;
  end if;
  update public.worker_payout_methods
  set version = version + 1, last_client_request_id = p_client_request_id
  where id = v_method.id returning * into v_method;
  insert into public.admin_finance_mutation_receipts (actor_id, client_request_id, operation, subject_id, response)
  values (
    p_actor_id, p_client_request_id, 'payout_method_decision', v_method.id,
    jsonb_build_object('payout_method_id', v_method.id, 'status', v_method.status,
      'reviewed_at', v_method.reviewed_at, 'version', v_method.version, 'generated_at', v_now)
  );
  return query select true, null::text, v_method.id, v_method.status, v_method.reviewed_at, v_method.version, v_now;
end;
$function$;

create or replace function public.admin_release_payment_reconciliation_atomic(
  p_actor_id uuid,
  p_payment_order_id uuid,
  p_expected_version integer,
  p_client_request_id uuid,
  p_reason text
)
returns table (
  ok boolean,
  error_code text,
  payment_order_id uuid,
  assigned_to_out uuid,
  assigned_at_out timestamptz,
  version_out integer,
  generated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.job_payment_orders%rowtype;
  v_role public.user_role;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_prior jsonb;
  v_prior_operation text;
  v_response jsonb;
begin
  perform private.assert_finance_reconciler(p_actor_id);
  select receipt.response, receipt.operation into v_prior, v_prior_operation
  from public.admin_finance_mutation_receipts as receipt
  where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior_operation <> 'payment_reconciliation_release' or v_prior->>'payment_order_id' <> p_payment_order_id::text then
      return query select false, 'IDEMPOTENCY_CONFLICT', p_payment_order_id, null::uuid, null::timestamptz, null::integer, v_now;
      return;
    end if;
    return query select true, null::text, p_payment_order_id, null::uuid, null::timestamptz,
      (v_prior->>'version')::integer, (v_prior->>'generated_at')::timestamptz;
    return;
  end if;
  select profile.role into v_role from public.profiles as profile where profile.id = p_actor_id;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    return query select false, 'REASON_REQUIRED', p_payment_order_id, null::uuid, null::timestamptz, null::integer, v_now;
    return;
  end if;
  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.id = p_payment_order_id
  for update;
  if not found then
    return query select false, 'PAYMENT_ORDER_NOT_FOUND', p_payment_order_id, null::uuid, null::timestamptz, null::integer, v_now;
    return;
  end if;
  if v_order.version <> p_expected_version then
    return query select false, 'VERSION_CONFLICT', v_order.id, v_order.assigned_to, v_order.assigned_at, v_order.version, v_now;
    return;
  end if;
  if v_order.assigned_to is null then
    return query select false, 'RECONCILIATION_NOT_CLAIMED', v_order.id, null::uuid, null::timestamptz, v_order.version, v_now;
    return;
  end if;
  if v_order.assigned_to <> p_actor_id and v_role <> 'admin'::public.user_role then
    return query select false, 'ASSIGNED_TO_OTHER', v_order.id, v_order.assigned_to, v_order.assigned_at, v_order.version, v_now;
    return;
  end if;
  update public.job_payment_orders
  set assigned_to = null, assigned_at = null, version = version + 1
  where id = v_order.id
  returning * into v_order;
  v_response := pg_catalog.jsonb_build_object(
    'payment_order_id', v_order.id, 'assigned_to', null, 'assigned_at', null,
    'version', v_order.version, 'generated_at', v_now
  );
  insert into public.admin_finance_mutation_receipts (actor_id, client_request_id, operation, subject_id, response)
  values (p_actor_id, p_client_request_id, 'payment_reconciliation_release', v_order.id, v_response)
  on conflict (actor_id, client_request_id) do nothing;
  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id, v_role::text, 'admin_payment_reconciliation', 'release', 'payment_reconciliation',
    'allow', 'payment_reconciliation_released',
    pg_catalog.jsonb_build_object('payment_order_id', v_order.id, 'reason_provided', true)
  );
  return query select true, null::text, v_order.id, null::uuid, null::timestamptz, v_order.version, v_now;
end;
$function$;

create or replace function public.admin_claim_worker_withdrawal_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_client_request_id uuid,
  p_takeover_reason text default null
)
returns table (
  ok boolean,
  error_code text,
  request_id uuid,
  status_out text,
  processing_by_out uuid,
  processing_at_out timestamptz,
  version_out integer,
  generated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.worker_withdrawal_requests%rowtype;
  v_role public.user_role := private.assert_payout_processor(p_actor_id);
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_prior jsonb;
  v_prior_operation text;
  v_response jsonb;
begin
  select receipt.response, receipt.operation into v_prior, v_prior_operation
  from public.admin_finance_mutation_receipts as receipt
  where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior_operation <> 'withdrawal_claim' or v_prior->>'request_id' <> p_request_id::text then
      return query select false, 'IDEMPOTENCY_CONFLICT', p_request_id, null::text, null::uuid, null::timestamptz, null::integer, v_now;
      return;
    end if;
    return query select true, null::text, p_request_id, v_prior->>'status',
      (v_prior->>'processing_by')::uuid, (v_prior->>'processing_at')::timestamptz,
      (v_prior->>'version')::integer, (v_prior->>'generated_at')::timestamptz;
    return;
  end if;
  select request.* into v_request
  from public.worker_withdrawal_requests as request
  where request.id = p_request_id
  for update;
  if not found then
    return query select false, 'WITHDRAWAL_NOT_FOUND', p_request_id, null::text, null::uuid, null::timestamptz, null::integer, v_now;
    return;
  end if;
  if v_request.status = 'processing' and v_request.processing_by = p_actor_id then
    v_response := pg_catalog.jsonb_build_object(
      'request_id', v_request.id, 'status', v_request.status, 'processing_by', v_request.processing_by,
      'processing_at', v_request.processing_at, 'version', v_request.version, 'generated_at', v_now
    );
    insert into public.admin_finance_mutation_receipts (actor_id, client_request_id, operation, subject_id, response)
    values (p_actor_id, p_client_request_id, 'withdrawal_claim', v_request.id, v_response);
    return query select true, null::text, v_request.id, v_request.status, v_request.processing_by, v_request.processing_at, v_request.version, v_now;
    return;
  end if;
  if v_request.version <> p_expected_version then
    return query select false, 'VERSION_CONFLICT', v_request.id, v_request.status, v_request.processing_by, v_request.processing_at, v_request.version, v_now;
    return;
  end if;
  if v_request.status = 'processing' and v_request.processing_by <> p_actor_id then
    if v_role <> 'admin'::public.user_role then
      return query select false, 'WITHDRAWAL_ALREADY_PROCESSING', v_request.id, v_request.status, v_request.processing_by, v_request.processing_at, v_request.version, v_now;
      return;
    end if;
    if char_length(btrim(coalesce(p_takeover_reason, ''))) < 3 then
      return query select false, 'TAKEOVER_REASON_REQUIRED', v_request.id, v_request.status, v_request.processing_by, v_request.processing_at, v_request.version, v_now;
      return;
    end if;
  elsif v_request.status <> 'pending' then
    return query select false, 'WITHDRAWAL_ALREADY_RESOLVED', v_request.id, v_request.status, v_request.processing_by, v_request.processing_at, v_request.version, v_now;
    return;
  end if;
  update public.worker_withdrawal_requests
  set status = 'processing', processing_at = v_now, processing_by = p_actor_id,
      version = version + 1, last_client_request_id = p_client_request_id
  where id = v_request.id
  returning * into v_request;
  v_response := pg_catalog.jsonb_build_object(
    'request_id', v_request.id, 'status', v_request.status, 'processing_by', v_request.processing_by,
    'processing_at', v_request.processing_at, 'version', v_request.version, 'generated_at', v_now
  );
  insert into public.admin_finance_mutation_receipts (actor_id, client_request_id, operation, subject_id, response)
  values (p_actor_id, p_client_request_id, 'withdrawal_claim', v_request.id, v_response)
  on conflict (actor_id, client_request_id) do nothing;
  return query select true, null::text, v_request.id, v_request.status, v_request.processing_by, v_request.processing_at, v_request.version, v_now;
end;
$function$;

create or replace function public.admin_decide_payment_reconciliation_v2(
  p_actor_id uuid,
  p_payment_order_id uuid,
  p_expected_version integer,
  p_client_request_id uuid,
  p_decision text,
  p_amount_received integer default null,
  p_bank_reference_hash text default null,
  p_bank_reference_suffix text default null,
  p_credited_at timestamptz default null,
  p_reason_code text default null
)
returns table (
  ok boolean,
  error_code text,
  outcome text,
  job_id uuid,
  status text,
  payment_status text,
  hold_until timestamptz,
  event_id_out uuid,
  version_out integer,
  generated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.job_payment_orders%rowtype;
  v_source jsonb;
  v_prior jsonb;
  v_prior_operation text;
  v_response jsonb;
  v_event_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform private.assert_finance_reconciler(p_actor_id);
  select receipt.response, receipt.operation into v_prior, v_prior_operation
  from public.admin_finance_mutation_receipts as receipt
  where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior_operation <> 'payment_reconciliation_decision' or v_prior->>'payment_order_id' <> p_payment_order_id::text then
      return query select false, 'IDEMPOTENCY_CONFLICT', null::text, null::uuid, null::text, null::text, null::timestamptz, null::uuid, null::integer, v_now;
      return;
    end if;
    return query select true, null::text, v_prior->>'outcome', (v_prior->>'job_id')::uuid,
      v_prior->>'status', v_prior->>'payment_status', (v_prior->>'hold_until')::timestamptz,
      (v_prior->>'event_id')::uuid, (v_prior->>'version')::integer,
      (v_prior->>'generated_at')::timestamptz;
    return;
  end if;

  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.id = p_payment_order_id
  for update;
  if not found then
    return query select false, 'PAYMENT_ORDER_NOT_FOUND', null::text, null::uuid, null::text, null::text, null::timestamptz, null::uuid, null::integer, v_now;
    return;
  end if;
  if v_order.version <> p_expected_version then
    return query select false, 'VERSION_CONFLICT', null::text, v_order.job_id, null::text, null::text, null::timestamptz, null::uuid, v_order.version, v_now;
    return;
  end if;
  if v_order.assigned_to is null then
    return query select false, 'RECONCILIATION_NOT_CLAIMED', null::text, v_order.job_id, null::text, null::text, null::timestamptz, null::uuid, v_order.version, v_now;
    return;
  end if;
  if v_order.assigned_to <> p_actor_id then
    return query select false, 'ASSIGNED_TO_OTHER', null::text, v_order.job_id, null::text, null::text, null::timestamptz, null::uuid, v_order.version, v_now;
    return;
  end if;

  if p_decision in ('cash_confirm', 'cash_reject') then
    select to_jsonb(receipt) into v_source
    from public.decide_cash_payment_reconciliation(
      p_payment_order_id,
      p_actor_id,
      case when p_decision = 'cash_confirm' then 'confirm' else 'reject' end,
      p_reason_code
    ) as receipt;
  else
    select to_jsonb(receipt) into v_source
    from public.decide_manual_bank_payment_reconciliation_idempotent(
      p_payment_order_id,
      p_actor_id,
      p_decision,
      p_amount_received,
      p_credited_at,
      p_bank_reference_hash,
      p_bank_reference_suffix,
      p_reason_code
    ) as receipt;
  end if;

  if coalesce((v_source->>'ok')::boolean, false) is not true then
    return query select false, coalesce(v_source->>'error_code', 'RECONCILIATION_FAILED'),
      null::text, v_order.job_id, null::text, null::text, null::timestamptz, null::uuid, v_order.version, v_now;
    return;
  end if;

  update public.job_payment_orders
  set version = version + 1
  where id = v_order.id
  returning * into v_order;
  select event.id into v_event_id
  from public.job_payment_reconciliation_events as event
  where event.payment_order_id = v_order.id
  order by event.created_at desc, event.id desc
  limit 1;
  if v_event_id is null then
    v_event_id := gen_random_uuid();
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'payment_order_id', v_order.id,
    'outcome', v_source->>'outcome',
    'job_id', v_source->>'job_id',
    'status', v_source->>'status',
    'payment_status', v_source->>'payment_status',
    'hold_until', v_source->>'hold_until',
    'event_id', v_event_id,
    'version', v_order.version,
    'generated_at', v_now
  );
  insert into public.admin_finance_mutation_receipts (actor_id, client_request_id, operation, subject_id, response)
  values (p_actor_id, p_client_request_id, 'payment_reconciliation_decision', v_order.id, v_response);

  return query select true, null::text, v_source->>'outcome', (v_source->>'job_id')::uuid,
    v_source->>'status', v_source->>'payment_status', (v_source->>'hold_until')::timestamptz,
    v_event_id, v_order.version, v_now;
end;
$function$;

create or replace function public.admin_release_worker_withdrawal_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_client_request_id uuid,
  p_reason text
)
returns table (
  ok boolean,
  error_code text,
  request_id uuid,
  status_out text,
  version_out integer,
  generated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.worker_withdrawal_requests%rowtype;
  v_role public.user_role := private.assert_payout_processor(p_actor_id);
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_prior jsonb;
  v_prior_operation text;
begin
  select receipt.response, receipt.operation into v_prior, v_prior_operation
  from public.admin_finance_mutation_receipts as receipt
  where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior_operation <> 'withdrawal_release' or v_prior->>'request_id' <> p_request_id::text then
      return query select false, 'IDEMPOTENCY_CONFLICT', p_request_id, null::text, null::integer, v_now;
      return;
    end if;
    return query select true, null::text, p_request_id, v_prior->>'status',
      (v_prior->>'version')::integer, (v_prior->>'generated_at')::timestamptz;
    return;
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    return query select false, 'REASON_REQUIRED', p_request_id, null::text, null::integer, v_now;
    return;
  end if;
  select request.* into v_request from public.worker_withdrawal_requests as request where request.id = p_request_id for update;
  if not found then
    return query select false, 'WITHDRAWAL_NOT_FOUND', p_request_id, null::text, null::integer, v_now;
    return;
  end if;
  if v_request.version <> p_expected_version then
    return query select false, 'VERSION_CONFLICT', v_request.id, v_request.status, v_request.version, v_now;
    return;
  end if;
  if v_request.status <> 'processing' then
    return query select false, 'WITHDRAWAL_NOT_PROCESSING', v_request.id, v_request.status, v_request.version, v_now;
    return;
  end if;
  if v_request.processing_by <> p_actor_id and v_role <> 'admin'::public.user_role then
    return query select false, 'WITHDRAWAL_ASSIGNED_TO_OTHER', v_request.id, v_request.status, v_request.version, v_now;
    return;
  end if;
  update public.worker_withdrawal_requests
  set status = 'pending', processing_at = null, processing_by = null,
      version = version + 1, last_client_request_id = p_client_request_id
  where id = v_request.id
  returning * into v_request;
  insert into public.admin_finance_mutation_receipts (actor_id, client_request_id, operation, subject_id, response)
  values (
    p_actor_id, p_client_request_id, 'withdrawal_release', v_request.id,
    pg_catalog.jsonb_build_object('request_id', v_request.id, 'status', v_request.status, 'version', v_request.version, 'generated_at', v_now)
  ) on conflict (actor_id, client_request_id) do nothing;
  return query select true, null::text, v_request.id, v_request.status, v_request.version, v_now;
end;
$function$;

create or replace function public.admin_resolve_worker_withdrawal_v2(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_client_request_id uuid,
  p_decision text,
  p_transfer_reference_hash text default null,
  p_transfer_reference_suffix text default null,
  p_external_transfer_confirmed boolean default false,
  p_reason text default null
)
returns table (
  ok boolean,
  error_code text,
  request_id uuid,
  status_out text,
  processed_at_out timestamptz,
  version_out integer,
  event_id_out uuid,
  generated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.worker_withdrawal_requests%rowtype;
  v_role public.user_role := private.assert_payout_processor(p_actor_id);
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_event_id uuid := gen_random_uuid();
  v_prior jsonb;
  v_prior_operation text;
begin
  select receipt.response, receipt.operation into v_prior, v_prior_operation
  from public.admin_finance_mutation_receipts as receipt
  where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior_operation <> 'withdrawal_resolve' or v_prior->>'request_id' <> p_request_id::text then
      return query select false, 'IDEMPOTENCY_CONFLICT', p_request_id, null::text, null::timestamptz, null::integer, null::uuid, v_now;
      return;
    end if;
    return query select true, null::text, p_request_id, v_prior->>'status',
      (v_prior->>'processed_at')::timestamptz, (v_prior->>'version')::integer,
      (v_prior->>'event_id')::uuid, (v_prior->>'generated_at')::timestamptz;
    return;
  end if;
  if v_decision not in ('paid', 'rejected', 'failed')
     or (v_decision = 'paid' and (
       p_external_transfer_confirmed is not true
       or p_transfer_reference_hash !~ '^[0-9a-f]{64}$'
       or p_transfer_reference_suffix !~ '^[A-Za-z0-9._/-]{2,16}$'
     ))
     or (v_decision in ('rejected', 'failed') and char_length(v_reason) not between 3 and 500)
  then
    return query select false, 'INVALID_INPUT', p_request_id, null::text, null::timestamptz, null::integer, null::uuid, v_now;
    return;
  end if;
  select request.* into v_request from public.worker_withdrawal_requests as request where request.id = p_request_id for update;
  if not found then
    return query select false, 'WITHDRAWAL_NOT_FOUND', p_request_id, null::text, null::timestamptz, null::integer, null::uuid, v_now;
    return;
  end if;
  if v_request.version <> p_expected_version then
    return query select false, 'VERSION_CONFLICT', v_request.id, v_request.status, v_request.processed_at, v_request.version, null::uuid, v_now;
    return;
  end if;
  if v_request.status <> 'processing' then
    return query select false, 'WITHDRAWAL_NOT_PROCESSING', v_request.id, v_request.status, v_request.processed_at, v_request.version, null::uuid, v_now;
    return;
  end if;
  if v_request.processing_by <> p_actor_id then
    return query select false, 'WITHDRAWAL_ASSIGNED_TO_OTHER', v_request.id, v_request.status, null::timestamptz, v_request.version, null::uuid, v_now;
    return;
  end if;
  update public.worker_withdrawal_requests
  set status = v_decision, processed_at = v_now, processed_by = p_actor_id,
      transfer_reference = null,
      transfer_reference_hash = case when v_decision = 'paid' then p_transfer_reference_hash else null end,
      transfer_reference_suffix = case when v_decision = 'paid' then p_transfer_reference_suffix else null end,
      resolution_reason = case when v_decision in ('rejected', 'failed') then v_reason else null end,
      version = version + 1, last_client_request_id = p_client_request_id
  where id = v_request.id
  returning * into v_request;
  insert into public.admin_finance_mutation_receipts (id, actor_id, client_request_id, operation, subject_id, response)
  values (
    v_event_id, p_actor_id, p_client_request_id, 'withdrawal_resolve', v_request.id,
    pg_catalog.jsonb_build_object(
      'request_id', v_request.id, 'status', v_request.status, 'processed_at', v_request.processed_at,
      'version', v_request.version, 'event_id', v_event_id, 'generated_at', v_now
    )
  );
  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id, v_role::text, 'admin_worker_withdrawal', 'record_external_result', 'manual_payout',
    case when v_decision = 'paid' then 'allow' when v_decision = 'rejected' then 'deny' else 'escalate' end,
    'withdrawal_' || v_decision,
    pg_catalog.jsonb_build_object(
      'withdrawal_request_id', v_request.id, 'amount_vnd', v_request.amount_vnd,
      'external_transfer_confirmed', p_external_transfer_confirmed,
      'reference_suffix', p_transfer_reference_suffix
    )
  );
  return query select true, null::text, v_request.id, v_request.status, v_request.processed_at, v_request.version, v_event_id, v_now;
end;
$function$;

revoke all on function public.admin_claim_payment_reconciliation_atomic(uuid, uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_review_worker_payout_method_v2(uuid, uuid, integer, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_release_payment_reconciliation_atomic(uuid, uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_decide_payment_reconciliation_v2(uuid, uuid, integer, uuid, text, integer, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_claim_worker_withdrawal_v2(uuid, uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_release_worker_withdrawal_v2(uuid, uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_resolve_worker_withdrawal_v2(uuid, uuid, integer, uuid, text, text, text, boolean, text) from public, anon, authenticated;

grant execute on function public.admin_claim_payment_reconciliation_atomic(uuid, uuid, integer, uuid, text) to service_role;
grant execute on function public.admin_review_worker_payout_method_v2(uuid, uuid, integer, uuid, text, text) to service_role;
grant execute on function public.admin_release_payment_reconciliation_atomic(uuid, uuid, integer, uuid, text) to service_role;
grant execute on function public.admin_decide_payment_reconciliation_v2(uuid, uuid, integer, uuid, text, integer, text, text, timestamptz, text) to service_role;
grant execute on function public.admin_claim_worker_withdrawal_v2(uuid, uuid, integer, uuid, text) to service_role;
grant execute on function public.admin_release_worker_withdrawal_v2(uuid, uuid, integer, uuid, text) to service_role;
grant execute on function public.admin_resolve_worker_withdrawal_v2(uuid, uuid, integer, uuid, text, text, text, boolean, text) to service_role;

commit;
