-- Corrective replacements for PostgreSQL lint ambiguities and the Plan earnings RPC contract.
-- Historical migrations remain immutable; this migration replaces their final routines in-place.

begin;

drop function if exists public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric);
drop function if exists public.get_worker_earnings_summary(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.create_worker_vietqr_payment_intent(p_job_id uuid, p_customer_id uuid, p_expected_gross_amount integer, p_payment_code text, p_transfer_content text, p_qr_image_url text, p_payment_updated_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(job_id uuid, job_status job_status, gross_amount integer, platform_fee integer, worker_net integer, commission_level smallint, commission_rate_bps integer, payment_code text, transfer_content text, qr_image_url text, payment_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public', 'pg_catalog'
AS $function$
declare
  v_job record;
  v_ledger record;
  v_tier record;
  v_worker record;
  v_now timestamptz := coalesce(p_payment_updated_at, now());
  v_platform_fee integer;
  v_worker_net integer;
begin
  if p_job_id is null
    or p_customer_id is null
    or p_expected_gross_amount is null
    or p_expected_gross_amount <= 0
    or p_payment_code !~ '^NS[A-Z0-9]{24}$'
    or nullif(btrim(p_transfer_content), '') is null
    or char_length(p_transfer_content) > 120
    or p_qr_image_url not like 'https://vietqr.app/img?%' then
    raise exception 'invalid VietQR payment intent input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtext(p_job_id::text));

  select
    job.id,
    job.customer_id,
    job.worker_id,
    job.status,
    job.final_price,
    job.payment_provider,
    job.payment_status,
    job.payment_code,
    job.payment_transfer_content,
    job.payment_qr_image_url,
    job.payment_updated_at,
    job.gross_amount,
    job.platform_fee,
    job.worker_net,
    job.worker_commission_level,
    job.worker_commission_rate_bps
  into v_job
  from public.jobs as job
  where job.id = p_job_id
    and job.customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'payment job not found' using errcode = 'P0001';
  end if;

  if v_job.status = 'payment_pending'::public.job_status then
    if v_job.payment_provider is distinct from 'sepay_vietqr'
      or v_job.payment_status is distinct from 'vietqr_ready' then
      raise exception 'payment intent is unavailable' using errcode = 'P0001';
    end if;

    select * into v_ledger
    from public.worker_payment_ledger as ledger
    where ledger.job_id = v_job.id
    for update;

    if not found then
      raise exception 'payment ledger is missing' using errcode = 'P0001';
    end if;

    return query select
      v_job.id,
      v_job.status,
      v_ledger.gross_amount,
      v_ledger.platform_fee,
      v_ledger.worker_net,
      v_ledger.commission_level,
      v_ledger.commission_rate_bps,
      v_job.payment_code,
      v_job.payment_transfer_content,
      v_job.payment_qr_image_url,
      v_job.payment_updated_at;
    return;
  end if;

  if v_job.status is distinct from 'confirmed_by_customer'::public.job_status
    or v_job.final_price is null
    or v_job.final_price <> p_expected_gross_amount then
    raise exception 'payment intent is unavailable' using errcode = 'P0001';
  end if;

  if v_job.worker_id is null then
    raise exception 'payment worker is missing' using errcode = 'P0001';
  end if;

  select id, total_jobs, rating into v_worker
  from public.worker_profiles
  where id = v_job.worker_id
    and is_approved is true
  for update;

  if not found then
    raise exception 'payment worker is not approved' using errcode = 'P0001';
  end if;

  select * into v_tier
  from private.resolve_worker_commission_tier(v_worker.id);
  if not found then
    raise exception 'worker commission tier is not configured' using errcode = 'P0001';
  end if;

  v_platform_fee := round(v_job.final_price::numeric * v_tier.commission_rate_bps / 10000.0);
  v_worker_net := v_job.final_price - v_platform_fee;
  if v_worker_net <= 0 then
    raise exception 'worker net must be positive' using errcode = 'P0001';
  end if;

  update public.jobs
  set
    gross_amount = v_job.final_price,
    platform_fee = v_platform_fee,
    worker_net = v_worker_net,
    worker_commission_level = v_tier.commission_level,
    worker_commission_rate_bps = v_tier.commission_rate_bps,
    payment_amount_received = null,
    payment_code = p_payment_code,
    payment_expires_at = null,
    payment_failure_reason = null,
    payment_provider = 'sepay_vietqr',
    payment_qr_image_url = p_qr_image_url,
    payment_received_at = null,
    payment_status = 'vietqr_ready',
    payment_transfer_content = p_transfer_content,
    payment_updated_at = v_now,
    sepay_reference_code = null,
    sepay_transaction_id = null,
    status = 'payment_pending'::public.job_status
  where id = v_job.id;

  insert into public.worker_payment_ledger (
    job_id,
    worker_id,
    payment_provider,
    payment_state,
    gross_amount,
    platform_fee,
    worker_net,
    commission_level,
    commission_rate_bps
  ) values (
    v_job.id,
    v_worker.id,
    'sepay_vietqr',
    'pending',
    v_job.final_price,
    v_platform_fee,
    v_worker_net,
    v_tier.commission_level,
    v_tier.commission_rate_bps
  );

  insert into public.job_events (
    job_id,
    actor_id,
    actor_role,
    event_type,
    from_status,
    to_status,
    safe_metadata
  ) values (
    v_job.id,
    p_customer_id,
    'customer'::public.user_role,
    'kael_decided_payment',
    'confirmed_by_customer'::public.job_status,
    'payment_pending'::public.job_status,
    jsonb_build_object(
      'payment_mode', 'sepay_vietqr',
      'commission_level', v_tier.commission_level
    )
  );

  return query select
    v_job.id,
    'payment_pending'::public.job_status,
    v_job.final_price,
    v_platform_fee,
    v_worker_net,
    v_tier.commission_level,
    v_tier.commission_rate_bps,
    p_payment_code,
    p_transfer_content,
    p_qr_image_url,
    v_now;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_sepay_vietqr_payment_webhook(p_payment_code text, p_transaction_id text, p_transfer_amount integer, p_reference_code text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, outcome text, job_id uuid, job_status job_status, payment_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public', 'pg_catalog'
AS $function$
declare
  v_existing_transaction record;
  v_job record;
  v_ledger record;
  v_now timestamptz := now();
  v_reference_code text := nullif(left(btrim(p_reference_code), 120), '');
begin
  if p_payment_code !~ '^NS[A-Z0-9]{24}$'
    or p_transaction_id !~ '^[0-9]{1,30}$'
    or p_transfer_amount is null
    or p_transfer_amount <= 0 then
    return query select true, 'ignored', null::uuid, null::public.job_status, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtext(p_transaction_id));

  select job.id, job.payment_code, job.status, job.payment_status
  into v_existing_transaction
  from public.jobs as job
  where job.sepay_transaction_id = p_transaction_id
  for update;

  if found then
    if v_existing_transaction.payment_code = p_payment_code then
      return query select true, 'duplicate', v_existing_transaction.id, v_existing_transaction.status, v_existing_transaction.payment_status;
    end if;
    return query select true, 'transaction_conflict', v_existing_transaction.id, v_existing_transaction.status, v_existing_transaction.payment_status;
    return;
  end if;

  select job.id, job.worker_id, job.status, job.payment_provider, job.payment_status, job.gross_amount, job.platform_fee, job.worker_net
  into v_job
  from public.jobs as job
  where job.payment_code = p_payment_code
  for update;

  if not found
    or v_job.payment_provider is distinct from 'sepay_vietqr'
    or v_job.payment_status is distinct from 'vietqr_ready'
    or v_job.status is distinct from 'payment_pending'::public.job_status
    or v_job.worker_id is null
    or v_job.gross_amount is null
    or v_job.gross_amount <= 0 then
    return query select true, 'ignored', null::uuid, null::public.job_status, null::text;
    return;
  end if;

  select * into v_ledger
  from public.worker_payment_ledger as ledger
  where ledger.job_id = v_job.id
  for update;

  if not found
    or v_ledger.worker_id is distinct from v_job.worker_id
    or v_ledger.payment_provider is distinct from 'sepay_vietqr'
    or v_ledger.payment_state is distinct from 'pending'
    or v_ledger.gross_amount is distinct from v_job.gross_amount
    or v_ledger.platform_fee is distinct from v_job.platform_fee
    or v_ledger.worker_net is distinct from v_job.worker_net then
    return query select true, 'ignored', null::uuid, null::public.job_status, null::text;
    return;
  end if;

  if v_job.gross_amount <> p_transfer_amount then
    update public.jobs
    set
      payment_amount_received = p_transfer_amount,
      payment_failure_reason = 'amount_mismatch',
      payment_received_at = v_now,
      payment_status = 'amount_mismatch',
      payment_updated_at = v_now,
      sepay_reference_code = v_reference_code,
      sepay_transaction_id = p_transaction_id
    where id = v_job.id;

    update public.worker_payment_ledger
    set payment_state = 'on_hold', updated_at = v_now
    where id = v_ledger.id;

    insert into public.job_events (
      job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
    ) values (
      v_job.id, null, null, 'payment_amount_mismatch',
      'payment_pending'::public.job_status, 'payment_pending'::public.job_status,
      jsonb_build_object('payment_mode', 'sepay_vietqr')
    );

    return query select true, 'amount_mismatch', v_job.id, 'payment_pending'::public.job_status, 'amount_mismatch';
    return;
  end if;

  update public.jobs
  set
    paid_at = coalesce(paid_at, v_now),
    payment_amount_received = p_transfer_amount,
    payment_failure_reason = null,
    payment_received_at = v_now,
    payment_status = 'received',
    payment_updated_at = v_now,
    sepay_reference_code = v_reference_code,
    sepay_transaction_id = p_transaction_id,
    status = 'paid'::public.job_status
  where id = v_job.id;

  update public.worker_payment_ledger
  set
    payment_state = 'available',
    available_at = coalesce(available_at, v_now),
    updated_at = v_now
  where id = v_ledger.id;

  insert into public.job_events (
    job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
  ) values (
    v_job.id, null, null, 'payment_confirmed',
    'payment_pending'::public.job_status, 'paid'::public.job_status,
    jsonb_build_object('payment_mode', 'sepay_vietqr')
  );

  return query select true, 'paid', v_job.id, 'paid'::public.job_status, 'received';
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_customer_refund_payment_method(p_customer_id uuid, p_bank_key text, p_account_holder_name text, p_bank_account text)
 RETURNS TABLE(id uuid, bank_key text, bank_name text, bank_account_masked text, status text, is_default boolean, verified_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
declare
  v_bank_key text := lower(btrim(p_bank_key));
  v_bank_name text;
  v_account_holder_name text := btrim(p_account_holder_name);
  v_bank_account text := btrim(p_bank_account);
  v_bank_account_masked text;
  v_payment_method public.customer_payment_methods%rowtype;
begin
  if p_customer_id is null then
    raise exception 'customer id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_customer_id
      and profile.role = 'customer'
  ) then
    raise exception 'refund account owner must be a customer' using errcode = '23514';
  end if;

  v_bank_name := case v_bank_key
    when 'vietcombank' then 'Vietcombank'
    when 'techcombank' then 'Techcombank'
    when 'bidv' then 'BIDV'
    when 'mbbank' then 'MBBank'
    when 'acb' then 'ACB'
    when 'vietinbank' then 'VietinBank'
    else null
  end;

  if v_bank_name is null
    or char_length(v_account_holder_name) not between 2 and 200
    or v_bank_account !~ '^[0-9A-Za-z]{6,50}$'
  then
    raise exception 'refund account input is invalid' using errcode = '22023';
  end if;

  v_bank_account_masked := '**** ' || right(v_bank_account, 4);
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));

  update public.customer_payment_methods as payment_method
  set
    bank_key = v_bank_key,
    bank_name = v_bank_name,
    account_holder_name = v_account_holder_name,
    bank_account = v_bank_account,
    bank_account_masked = v_bank_account_masked,
    status = case
      when payment_method.bank_key is distinct from v_bank_key
        or payment_method.account_holder_name is distinct from v_account_holder_name
        or payment_method.bank_account is distinct from v_bank_account
      then 'pending_verification'
      else payment_method.status
    end,
    verified_at = case
      when payment_method.bank_key is distinct from v_bank_key
        or payment_method.account_holder_name is distinct from v_account_holder_name
        or payment_method.bank_account is distinct from v_bank_account
      then null
      else payment_method.verified_at
    end,
    is_default = true
  where payment_method.customer_id = p_customer_id
    and payment_method.is_default
  returning * into v_payment_method;

  if not found then
    insert into public.customer_payment_methods (
      customer_id,
      bank_key,
      bank_name,
      account_holder_name,
      bank_account,
      bank_account_masked,
      status,
      is_default
    )
    values (
      p_customer_id,
      v_bank_key,
      v_bank_name,
      v_account_holder_name,
      v_bank_account,
      v_bank_account_masked,
      'pending_verification',
      true
    )
    returning * into v_payment_method;
  end if;

  return query
  select
    v_payment_method.id,
    v_payment_method.bank_key,
    v_payment_method.bank_name,
    v_payment_method.bank_account_masked,
    v_payment_method.status,
    v_payment_method.is_default,
    v_payment_method.verified_at,
    v_payment_method.updated_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_worker_cash_payment(p_job_id uuid, p_worker_id uuid)
 RETURNS TABLE(outcome text, job_id uuid, job_status job_status, payment_status text, gross_amount integer, platform_fee integer, worker_net integer, commission_level smallint, commission_rate_bps integer, cash_commission_collected integer, cash_commission_due integer, payment_received_at timestamp with time zone, payment_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public', 'pg_catalog'
AS $function$
declare
  v_job record;
  v_cash_ledger record;
  v_tier record;
  v_available_credits bigint;
  v_previous_cash_debits bigint;
  v_reconciled_cash_debits bigint;
  v_available_balance bigint;
  v_platform_fee integer;
  v_worker_net integer;
  v_cash_commission_collected integer;
  v_cash_commission_due integer;
  v_now timestamptz := now();
begin
  if p_job_id is null or p_worker_id is null then
    raise exception 'job and worker are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtext(p_job_id::text));

  select
    job.id,
    job.worker_id,
    job.status,
    job.final_price,
    job.payment_provider,
    job.payment_status,
    job.gross_amount,
    job.platform_fee,
    job.worker_net,
    job.worker_commission_level,
    job.worker_commission_rate_bps,
    job.payment_received_at,
    job.payment_updated_at
  into v_job
  from public.jobs job
  where job.id = p_job_id
    and job.worker_id = p_worker_id
  for update;

  if not found then
    raise exception 'cash payment job not found' using errcode = 'P0001';
  end if;

  if v_job.status = 'paid'::public.job_status
    and v_job.payment_provider = 'cash'
    and v_job.payment_status = 'cash_confirmed' then
    select * into v_cash_ledger
    from public.worker_cash_commission_ledger as cash_ledger
    where cash_ledger.job_id = v_job.id
      and cash_ledger.worker_id = p_worker_id
    for update;

    if not found then
      raise exception 'cash commission ledger is missing' using errcode = 'P0001';
    end if;

    return query select
      'already_confirmed'::text,
      v_job.id,
      'paid'::public.job_status,
      'cash_confirmed'::text,
      v_cash_ledger.gross_amount,
      v_cash_ledger.platform_fee,
      v_cash_ledger.worker_net,
      v_cash_ledger.commission_level,
      v_cash_ledger.commission_rate_bps,
      v_cash_ledger.cash_commission_collected,
      v_cash_ledger.cash_commission_due,
      v_job.payment_received_at,
      v_job.payment_updated_at;
    return;
  end if;

  if v_job.status is distinct from 'confirmed_by_customer'::public.job_status
    or v_job.final_price is null
    or v_job.final_price <= 0 then
    raise exception 'cash payment confirmation is unavailable' using errcode = 'P0001';
  end if;

  perform 1
  from public.worker_profiles as worker
  where worker.id = p_worker_id
    and worker.is_approved is true
  for update;
  if not found then
    raise exception 'cash payment worker is not approved' using errcode = 'P0001';
  end if;

  select * into v_tier
  from private.resolve_worker_commission_tier(p_worker_id);
  if not found then
    raise exception 'worker commission tier is not configured' using errcode = 'P0001';
  end if;

  v_platform_fee := round(v_job.final_price::numeric * v_tier.commission_rate_bps / 10000.0);
  v_worker_net := v_job.final_price - v_platform_fee;
  if v_worker_net <= 0 then
    raise exception 'worker net must be positive' using errcode = 'P0001';
  end if;

  select coalesce(sum(ledger.worker_net), 0)
  into v_available_credits
  from public.worker_payment_ledger ledger
  where ledger.worker_id = p_worker_id
    and ledger.payment_state = 'available';

  select coalesce(sum(cash_ledger.cash_commission_collected), 0)
  into v_previous_cash_debits
  from public.worker_cash_commission_ledger cash_ledger
  where cash_ledger.worker_id = p_worker_id;

  select coalesce(sum(reconciliation.amount), 0)
  into v_reconciled_cash_debits
  from public.worker_cash_commission_reconciliations reconciliation
  where reconciliation.worker_id = p_worker_id;

  v_available_balance := greatest(0, v_available_credits - v_previous_cash_debits - v_reconciled_cash_debits);
  v_cash_commission_collected := least(v_platform_fee, v_available_balance);
  v_cash_commission_due := v_platform_fee - v_cash_commission_collected;

  update public.jobs
  set
    gross_amount = v_job.final_price,
    platform_fee = v_platform_fee,
    worker_net = v_worker_net,
    worker_commission_level = v_tier.commission_level,
    worker_commission_rate_bps = v_tier.commission_rate_bps,
    paid_at = coalesce(paid_at, v_now),
    payment_amount_received = v_job.final_price,
    payment_code = null,
    payment_expires_at = null,
    payment_failure_reason = null,
    payment_provider = 'cash',
    payment_qr_image_url = null,
    payment_received_at = v_now,
    payment_status = 'cash_confirmed',
    payment_transfer_content = null,
    payment_updated_at = v_now,
    sepay_reference_code = null,
    sepay_transaction_id = null,
    status = 'paid'::public.job_status
  where id = v_job.id;

  insert into public.worker_cash_commission_ledger (
    job_id,
    worker_id,
    gross_amount,
    platform_fee,
    worker_net,
    commission_level,
    commission_rate_bps,
    cash_commission_collected,
    cash_commission_due,
    confirmed_at
  ) values (
    v_job.id,
    p_worker_id,
    v_job.final_price,
    v_platform_fee,
    v_worker_net,
    v_tier.commission_level,
    v_tier.commission_rate_bps,
    v_cash_commission_collected,
    v_cash_commission_due,
    v_now
  );

  insert into public.job_events (
    job_id,
    actor_id,
    actor_role,
    event_type,
    from_status,
    to_status,
    safe_metadata
  ) values (
    v_job.id,
    p_worker_id,
    'worker'::public.user_role,
    'worker_confirmed_cash_payment',
    'confirmed_by_customer'::public.job_status,
    'paid'::public.job_status,
    jsonb_build_object(
      'confirmation_kind', 'cash_payment_confirmed',
      'payment_mode', 'cash',
      'commission_level', v_tier.commission_level,
      'commission_state', case when v_cash_commission_due = 0 then 'collected' else 'reconciliation_due' end
    )
  );

  return query select
    'confirmed'::text,
    v_job.id,
    'paid'::public.job_status,
    'cash_confirmed'::text,
    v_job.final_price,
    v_platform_fee,
    v_worker_net,
    v_tier.commission_level,
    v_tier.commission_rate_bps,
    v_cash_commission_collected,
    v_cash_commission_due,
    v_now,
    v_now;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_and_approve_learning_candidate_atomic(p_candidate_id uuid, p_admin_id uuid, p_review_note text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, error_code text, candidate_id uuid, rule_id uuid, rule_version integer, status text, knowledge_ok boolean, knowledge_error_code text, knowledge_table text, record_key text, knowledge_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_provenance public.learning_candidate_provenance%rowtype;
  v_candidate public.learning_candidates%rowtype;
  v_approval record;
begin
  if p_candidate_id is null or p_admin_id is null then
    return query select false, 'INVALID_INPUT'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_admin_id and profile.role = 'admin'::public.user_role
  ) then
    return query select false, 'ADMIN_REQUIRED'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;

  select * into v_provenance
  from public.learning_candidate_provenance provenance
  where provenance.candidate_id = p_candidate_id
  for update;
  if not found then
    return query select false, 'PROVENANCE_REQUIRED'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.provenance_status in ('rejected', 'revoked') then
    return query select false, 'PROVENANCE_NOT_ACTIVE'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.consent_status not in ('aggregate_only', 'consented') then
    return query select false, 'CONSENT_REQUIRED'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.privacy_status <> 'redacted' then
    return query select false, 'PRIVACY_REVIEW_REQUIRED'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.dispute_status not in ('clear', 'resolved') then
    return query select false, 'UNRESOLVED_DISPUTE'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.quality_status <> 'verified' then
    return query select false, 'EVIDENCE_QUALITY_INSUFFICIENT'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  select candidate.* into v_candidate
  from public.learning_candidates candidate
  where candidate.id = p_candidate_id
  for update;
  if not found or v_candidate.evidence_count < 5 or v_candidate.confidence < 0.6 then
    return query select false, 'EVIDENCE_QUALITY_INSUFFICIENT'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if exists (
    select 1
    from public.learning_observation_receipts receipt
    join public.disputes dispute on dispute.job_id = receipt.job_id
    where receipt.candidate_id = p_candidate_id
      and dispute.status not in ('communicated', 'resolved')
  ) then
    return query select false, 'UNRESOLVED_DISPUTE'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.summary_origin = 'model_generated' and v_provenance.generated_summary_hash is null then
    return query select false, 'MODEL_SUMMARY_IDENTITY_REQUIRED'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;

  begin
    insert into public.learning_candidate_reviews (
      candidate_id, reviewer_id, decision, reason,
      source_hash, evidence_hash, summary_origin, generated_summary_hash,
      gate_snapshot, release_id, safe_metadata
    ) values (
      p_candidate_id, p_admin_id, 'approved',
      left(coalesce(nullif(trim(p_review_note), ''), 'administrator approved verified provenance'), 1000),
      v_provenance.source_hash, v_provenance.evidence_hash,
      v_provenance.summary_origin, v_provenance.generated_summary_hash,
      jsonb_build_object(
        'consent_status', v_provenance.consent_status,
        'privacy_status', v_provenance.privacy_status,
        'dispute_status', v_provenance.dispute_status,
        'quality_status', v_provenance.quality_status,
        'human_approval', true
      ),
      v_provenance.release_id,
      jsonb_build_object('automatic_promotion', false)
    );
    update public.learning_candidate_provenance as provenance
    set provenance_status = 'approved', updated_at = now()
    where provenance.candidate_id = p_candidate_id;

    select approval.* into v_approval
    from public.admin_approve_learning_candidate_atomic(
      p_candidate_id, p_admin_id, p_review_note
    ) approval;
    if not found then
      raise exception using errcode = 'P0001', message = 'APPROVAL_COMMIT_FAILED';
    end if;
    if v_approval.ok is not true then
      raise exception using errcode = 'P0001', message = coalesce(v_approval.error_code::text, 'APPROVAL_COMMIT_FAILED');
    end if;
  exception when others then
    return query select false, left(sqlerrm, 120), p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end;

  return query select
    v_approval.ok::boolean,
    v_approval.error_code::text,
    v_approval.candidate_id::uuid,
    v_approval.rule_id::uuid,
    v_approval.rule_version::integer,
    v_approval.status::text,
    v_approval.knowledge_ok::boolean,
    v_approval.knowledge_error_code::text,
    v_approval.knowledge_table::text,
    v_approval.record_key::text,
    v_approval.knowledge_version::integer;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_learning_rule_with_provenance(p_rule_id uuid, p_rule_version integer, p_admin_id uuid, p_reason text, p_release_id text)
 RETURNS TABLE(ok boolean, error_code text, rule_id uuid, rule_version integer, cascaded_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_count integer := 0;
begin
  if p_rule_id is null or p_rule_version is null or p_admin_id is null
     or nullif(trim(coalesce(p_reason, '')), '') is null then
    return query select false, 'INVALID_INPUT'::text, p_rule_id, p_rule_version, 0;
    return;
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_admin_id and profile.role = 'admin'::public.user_role
  ) then
    return query select false, 'ADMIN_REQUIRED'::text, p_rule_id, p_rule_version, 0;
    return;
  end if;
  if not exists (
    select 1 from public.learning_rule_versions version
    where version.rule_id = p_rule_id and version.version = p_rule_version
  ) then
    return query select false, 'RULE_VERSION_NOT_FOUND'::text, p_rule_id, p_rule_version, 0;
    return;
  end if;

  update public.learning_rule_dependencies as dependency
  set status = 'revoked', revoked_at = now()
  where dependency.rule_id = p_rule_id
    and dependency.rule_version = p_rule_version
    and dependency.status = 'active';
  get diagnostics v_count = row_count;

  update public.learning_rule_versions as rule_version
  set status = 'rolled_back'::public.learning_rule_status
  where rule_version.rule_id = p_rule_id and rule_version.version = p_rule_version;
  update public.learning_rules
  set status = case when active_version = p_rule_version
    then 'rolled_back'::public.learning_rule_status else status end
  where id = p_rule_id;

  insert into public.learning_rule_revocations (
    rule_id, rule_version, revoked_by, reason, release_id, cascaded_dependency_count
  ) values (
    p_rule_id, p_rule_version, p_admin_id, left(trim(p_reason), 500),
    left(coalesce(p_release_id, 'unreleased'), 160), v_count
  ) on conflict on constraint learning_rule_revocations_rule_id_rule_version_key do nothing;

  update public.learning_candidate_provenance provenance
  set provenance_status = 'revoked', consent_status = 'revoked', updated_at = now()
  where provenance.candidate_id in (
    select dependency.candidate_id from public.learning_rule_dependencies dependency
    where dependency.rule_id = p_rule_id and dependency.rule_version = p_rule_version
  );

  update public.service_knowledge_boxes box
  set is_active = false, updated_at = now()
  where box.safe_metadata->>'source_candidate_id' in (
    select dependency.candidate_id::text from public.learning_rule_dependencies dependency
    where dependency.rule_id = p_rule_id and dependency.rule_version = p_rule_version
  );
  update public.worker_safety_patterns pattern
  set is_enabled = false, updated_at = now()
  where pattern.safe_metadata->>'source_candidate_id' in (
    select dependency.candidate_id::text from public.learning_rule_dependencies dependency
    where dependency.rule_id = p_rule_id and dependency.rule_version = p_rule_version
  );

  return query select true, null::text, p_rule_id, p_rule_version, v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_harness_idempotency(p_environment text, p_release_id text, p_operation_id text, p_actor_id_hash text, p_key_hash text, p_request_hash text, p_ttl_seconds integer)
 RETURNS TABLE(state text, reservation_id uuid, response_hash text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
declare
  v_row public.harness_idempotency_keys%rowtype;
  v_reservation_id uuid;
begin
  if p_environment not in ('local', 'preview', 'staging', 'production')
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or (p_actor_id_hash is not null and p_actor_id_hash !~ '^[0-9a-f]{64}$') then
    return query select 'conflict'::text, null::uuid, null::text;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext(
    p_environment || '|' || p_operation_id || '|' || coalesce(p_actor_id_hash, 'system') || '|' || p_key_hash
  ));

  select * into v_row
  from public.harness_idempotency_keys key
  where key.environment = p_environment
    and key.operation_id = p_operation_id
    and key.actor_id_hash is not distinct from p_actor_id_hash
    and key.key_hash = p_key_hash
  for update;

  if found then
    if v_row.request_hash <> p_request_hash then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result, error_code
      ) values (p_environment, left(p_release_id, 160), left(p_operation_id, 160), 'idempotency', 'conflict', 'REQUEST_HASH_CONFLICT');
      return query select 'conflict'::text, null::uuid, null::text;
      return;
    end if;
    if v_row.status = 'completed' then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result
      ) values (p_environment, left(p_release_id, 160), left(p_operation_id, 160), 'idempotency', 'replayed');
      return query select 'completed'::text, v_row.reservation_id, v_row.response_hash;
      return;
    end if;
    if v_row.status = 'reconcile_required' then
      return query select 'reconcile_required'::text, v_row.reservation_id, null::text;
      return;
    end if;
    if v_row.status in ('reserved', 'executing') and v_row.expires_at > now() then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result
      ) values (p_environment, left(p_release_id, 160), left(p_operation_id, 160), 'idempotency', 'in_progress');
      return query select 'in_progress'::text, v_row.reservation_id, null::text;
      return;
    end if;
    if v_row.status = 'executing' then
      update public.harness_idempotency_keys as idempotency_key
      set status = 'reconcile_required', completed_at = now(),
          error_code = 'EXECUTION_OUTCOME_UNKNOWN'
      where idempotency_key.reservation_id = v_row.reservation_id;
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result, error_code
      ) values (p_environment, left(p_release_id, 160), left(p_operation_id, 160),
        'idempotency', 'reconcile_required', 'EXECUTION_OUTCOME_UNKNOWN');
      return query select 'reconcile_required'::text, v_row.reservation_id, null::text;
      return;
    end if;
    update public.harness_idempotency_keys as idempotency_key
    set status = 'reserved', release_id = left(p_release_id, 160),
        request_hash = p_request_hash, response_hash = null, error_code = null,
        reserved_at = now(), completed_at = null,
        expires_at = now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 300), 30))
    where idempotency_key.reservation_id = v_row.reservation_id;
    return query select 'reserved'::text, v_row.reservation_id, null::text;
    return;
  end if;

  insert into public.harness_idempotency_keys (
    environment, release_id, operation_id, actor_id_hash, key_hash,
    request_hash, expires_at
  ) values (
    p_environment, left(p_release_id, 160), left(p_operation_id, 160),
    p_actor_id_hash, p_key_hash, p_request_hash,
    now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 300), 30))
  ) returning harness_idempotency_keys.reservation_id into v_reservation_id;

  insert into public.harness_reliability_events (
    environment, release_id, operation_id, event_class, result
  ) values (p_environment, left(p_release_id, 160), left(p_operation_id, 160), 'idempotency', 'reserved');
  return query select 'reserved'::text, v_reservation_id, null::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_worker_earnings_summary(p_worker_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_platform_fee_rate numeric DEFAULT 0.10)
 RETURNS TABLE(worker_id uuid, total_jobs_paid bigint, gross_earnings bigint, platform_fee_total bigint, net_earnings bigint, available_balance bigint, cash_commission_collected_total bigint, cash_commission_due_total bigint, pending_payment_count bigint, pending_payment_amount bigint, on_hold_amount bigint, current_commission_level smallint, current_commission_rate_bps integer, recent_transactions jsonb, daily_earnings jsonb, from_date timestamp with time zone, to_date timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path = 'public', 'pg_catalog'
AS $function$
begin
  if p_worker_id is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'invalid earnings range' using errcode = '22023';
  end if;
  if p_platform_fee_rate is null
     or p_platform_fee_rate < 0
     or p_platform_fee_rate > 1 then
    raise exception 'invalid platform fee rate' using errcode = '22023';
  end if;

  return query
  with current_tier as (
    select commission_level, commission_rate_bps
    from private.resolve_worker_commission_tier(p_worker_id)
  ), all_worker_ledger as (
    select
      ledger.id,
      ledger.job_id,
      'worker_credit'::text as entry_type,
      ledger.payment_state,
      ledger.gross_amount,
      ledger.platform_fee,
      ledger.worker_net,
      ledger.commission_level,
      ledger.commission_rate_bps,
      0::integer as cash_commission_collected,
      0::integer as cash_commission_due,
      ledger.created_at,
      ledger.available_at,
      job.display_code,
      coalesce(ledger.available_at, ledger.created_at) as recorded_at
    from public.worker_payment_ledger ledger
    left join public.jobs job on job.id = ledger.job_id
    where ledger.worker_id = p_worker_id
  ), all_cash_ledger as (
    select
      cash_ledger.id,
      cash_ledger.job_id,
      'cash_commission_debit'::text as entry_type,
      case
        when cash_ledger.cash_commission_due = reconciliations.amount then 'cash_collected'::text
        else 'cash_reconciliation_due'::text
      end as payment_state,
      cash_ledger.gross_amount,
      cash_ledger.platform_fee,
      cash_ledger.worker_net,
      cash_ledger.commission_level,
      cash_ledger.commission_rate_bps,
      cash_ledger.cash_commission_collected + reconciliations.amount as cash_commission_collected,
      cash_ledger.cash_commission_due - reconciliations.amount as cash_commission_due,
      cash_ledger.created_at,
      cash_ledger.confirmed_at as available_at,
      job.display_code,
      cash_ledger.confirmed_at as recorded_at
    from public.worker_cash_commission_ledger cash_ledger
    left join public.jobs job on job.id = cash_ledger.job_id
    cross join lateral (
      select least(
        cash_ledger.cash_commission_due::bigint,
        coalesce(sum(reconciliation.amount), 0)
      )::integer as amount
      from public.worker_cash_commission_reconciliations reconciliation
      where reconciliation.cash_commission_ledger_id = cash_ledger.id
    ) reconciliations
    where cash_ledger.worker_id = p_worker_id
  ), all_worker_transactions as (
    select * from all_worker_ledger
    union all
    select * from all_cash_ledger
  ), filtered_transactions as (
    select *
    from all_worker_transactions transaction
    where (p_from is null or transaction.recorded_at >= p_from)
      and (p_to is null or transaction.recorded_at <= p_to)
  ), paid_transactions as (
    select *
    from filtered_transactions transaction
    where transaction.entry_type = 'cash_commission_debit'
      or (transaction.entry_type = 'worker_credit' and transaction.payment_state = 'available')
  ), available_credits as (
    select coalesce(sum(ledger.worker_net), 0)::bigint as amount
    from all_worker_ledger ledger
    where ledger.payment_state = 'available'
  ), cash_commission_totals as (
    select
      coalesce(sum(cash_commission_collected), 0)::bigint as cash_commission_collected_total,
      coalesce(sum(cash_commission_due), 0)::bigint as cash_commission_due_total
    from all_cash_ledger
  ), daily_paid as (
    select
      (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date as paid_date,
      sum(transaction.gross_amount)::bigint as gross_earnings,
      sum(transaction.platform_fee)::bigint as platform_fee_total,
      sum(transaction.worker_net)::bigint as net_earnings,
      count(*)::bigint as paid_job_count
    from paid_transactions transaction
    group by (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date
  ), recent_transactions as (
    select *
    from filtered_transactions transaction
    order by transaction.recorded_at desc, transaction.id desc
    limit 20
  )
  select
    p_worker_id,
    coalesce((select count(*) from paid_transactions), 0)::bigint,
    coalesce((select sum(gross_amount) from paid_transactions), 0)::bigint,
    coalesce((select sum(platform_fee) from paid_transactions), 0)::bigint,
    coalesce((select sum(worker_net) from paid_transactions), 0)::bigint,
    greatest(0::bigint, available_credits.amount - cash_commission_totals.cash_commission_collected_total),
    cash_commission_totals.cash_commission_collected_total,
    cash_commission_totals.cash_commission_due_total,
    coalesce((select count(*) from all_worker_ledger ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger ledger where ledger.payment_state = 'on_hold'), 0)::bigint,
    tier.commission_level,
    tier.commission_rate_bps,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'job_id', transaction.job_id,
          'display_code', transaction.display_code,
          'entry_type', transaction.entry_type,
          'payment_state', transaction.payment_state,
          'gross_amount', transaction.gross_amount,
          'platform_fee', transaction.platform_fee,
          'worker_net', transaction.worker_net,
          'commission_level', transaction.commission_level,
          'commission_rate_bps', transaction.commission_rate_bps,
          'cash_commission_collected', transaction.cash_commission_collected,
          'cash_commission_due', transaction.cash_commission_due,
          'recorded_at', transaction.recorded_at,
          'available_at', transaction.available_at
        ) order by transaction.recorded_at desc, transaction.id desc
      )
      from recent_transactions transaction
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', daily.paid_date,
          'gross_earnings', daily.gross_earnings,
          'platform_fee_total', daily.platform_fee_total,
          'net_earnings', daily.net_earnings,
          'paid_job_count', daily.paid_job_count
        ) order by daily.paid_date desc
      )
      from (
        select * from daily_paid order by paid_date desc limit 366
      ) daily
    ), '[]'::jsonb),
    p_from,
    p_to
  from current_tier tier
  cross join available_credits
  cross join cash_commission_totals;
end;
$function$;

revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) to service_role;

commit;
