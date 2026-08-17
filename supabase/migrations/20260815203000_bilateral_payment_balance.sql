begin;

create or replace function private.resolve_job_commission_terms(
  p_job_id uuid,
  p_worker_id uuid
)
returns table (
  commission_level smallint,
  commission_rate_bps integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_level integer;
  v_rate integer;
begin
  select job.* into v_job
  from public.jobs as job
  where job.id = p_job_id
    and job.worker_id = p_worker_id;

  if not found then
    return;
  end if;

  if v_job.worker_commission_level is not null
    or v_job.worker_commission_rate_bps is not null
  then
    if v_job.worker_commission_level is null
      or v_job.worker_commission_rate_bps is null
      or v_job.worker_commission_level < 1
      or v_job.worker_commission_rate_bps not between 0 and 1500
    then
      raise exception 'INVALID_FROZEN_COMMISSION_TERMS' using errcode = 'P0001';
    end if;
    return query select
      v_job.worker_commission_level::smallint,
      v_job.worker_commission_rate_bps;
    return;
  end if;

  select
    (scope.kael_review #>> '{stakeholder_balance,commission_level}')::integer,
    (scope.kael_review #>> '{stakeholder_balance,commission_rate_bps}')::integer
  into v_level, v_rate
  from public.scope_change_requests as scope
  where scope.job_id = p_job_id
    and scope.status = 'approved_by_customer'::public.scope_change_status
    and scope.kael_computed_min = v_job.final_price
    and scope.kael_computed_max = v_job.final_price
    and scope.kael_review #>> '{stakeholder_balance,customer_total}' = v_job.final_price::text
    and scope.kael_review #>> '{stakeholder_balance,commission_level}' ~ '^[1-9][0-9]*$'
    and scope.kael_review #>> '{stakeholder_balance,commission_rate_bps}' ~ '^[0-9]+$'
  order by scope.customer_decision_at desc nulls last, scope.created_at desc
  limit 1;

  if found and v_level >= 1 and v_rate between 0 and 1500 then
    return query select v_level::smallint, v_rate;
    return;
  end if;

  select
    (candidate.original_scope_price_quote ->> 'commission_level')::integer,
    (candidate.original_scope_price_quote ->> 'commission_rate_bps')::integer
  into v_level, v_rate
  from public.job_worker_candidates as candidate
  where candidate.job_id = p_job_id
    and candidate.worker_id = p_worker_id
    and candidate.status = 'customer_confirmed'
    and private.is_valid_original_scope_price_quote(
      candidate.original_scope_price_quote,
      candidate.job_id,
      candidate.worker_id,
      candidate.broadcast_id,
      candidate.expires_at,
      true
    )
  order by candidate.customer_decided_at desc nulls last, candidate.proposed_at desc
  limit 1;

  if found and v_level >= 1 and v_rate between 0 and 1500 then
    return query select v_level::smallint, v_rate;
    return;
  end if;

  return query
  select tier.commission_level::smallint, tier.commission_rate_bps
  from private.resolve_worker_commission_tier(p_worker_id) as tier;
end;
$function$;

revoke all on function private.resolve_job_commission_terms(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.resolve_job_commission_terms(uuid, uuid)
  to service_role;

create or replace function private.freeze_approved_scope_commission_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_commission_level integer;
  v_commission_rate_bps integer;
  v_customer_total integer;
  v_platform_fee integer;
  v_worker_net integer;
begin
  if new.status = 'approved_by_customer'::public.scope_change_status
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or old.kael_review is distinct from new.kael_review
    )
  then
    v_commission_level := (
      new.kael_review #>> '{stakeholder_balance,commission_level}'
    )::integer;
    v_commission_rate_bps := (
      new.kael_review #>> '{stakeholder_balance,commission_rate_bps}'
    )::integer;
    v_customer_total := (
      new.kael_review #>> '{stakeholder_balance,customer_total}'
    )::integer;
    v_platform_fee := (
      new.kael_review #>> '{stakeholder_balance,platform_fee}'
    )::integer;
    v_worker_net := (
      new.kael_review #>> '{stakeholder_balance,worker_net}'
    )::integer;

    if v_commission_level < 1
      or v_commission_rate_bps not between 0 and 1500
      or v_customer_total <= 0
      or v_platform_fee <> round(
        v_customer_total::numeric * v_commission_rate_bps / 10000.0
      )
      or v_worker_net <> v_customer_total - v_platform_fee
    then
      raise exception 'INVALID_APPROVED_SCOPE_BALANCE' using errcode = '23514';
    end if;

    update public.jobs as job
    set
      worker_commission_level = v_commission_level,
      worker_commission_rate_bps = v_commission_rate_bps
    where job.id = new.job_id
      and job.final_price = v_customer_total
      and job.worker_id is not null;

    if not found then
      raise exception 'APPROVED_SCOPE_JOB_BALANCE_MISSING' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists freeze_approved_scope_commission_terms
  on public.scope_change_requests;
create constraint trigger freeze_approved_scope_commission_terms
after insert or update on public.scope_change_requests
deferrable initially deferred
for each row execute function private.freeze_approved_scope_commission_terms();

revoke all on function private.freeze_approved_scope_commission_terms()
  from public, anon, authenticated;

create or replace function public.create_manual_bank_payment_order(
  p_job_id uuid,
  p_customer_id uuid,
  p_expected_gross_amount integer,
  p_payment_code text,
  p_transfer_content text,
  p_qr_image_url text,
  p_payment_updated_at timestamptz default now()
)
returns table (
  job_id uuid,
  status public.job_status,
  payment_status text,
  gross_amount integer,
  payment_code text,
  payment_transfer_content text,
  payment_qr_image_url text,
  payment_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_order public.job_payment_orders%rowtype;
  v_tier record;
  v_platform_fee integer;
  v_worker_net integer;
  v_now timestamptz := coalesce(p_payment_updated_at, pg_catalog.clock_timestamp());
begin
  if p_job_id is null
    or p_customer_id is null
    or p_expected_gross_amount is null
    or p_expected_gross_amount <= 0
    or p_payment_code !~ '^NS[A-Z0-9]{24}$'
    or p_transfer_content is distinct from p_payment_code
    or p_qr_image_url !~ '^https://vietqr\.app/img\?'
  then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select job.* into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found or v_job.customer_id is distinct from p_customer_id then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_job.status = 'payment_pending'::public.job_status then
    select payment_order.* into v_order
    from public.job_payment_orders as payment_order
    where payment_order.job_id = p_job_id
    for update;

    if found
      and v_order.payment_method = 'platform_bank_manual'
      and v_order.status in (
        'manual_qr_ready',
        'manual_customer_claimed',
        'manual_reconcile_required'
      )
    then
      return query select
        v_job.id,
        v_job.status,
        v_order.status,
        v_order.gross_amount,
        v_order.payment_code,
        v_order.transfer_content,
        v_order.qr_image_url,
        v_order.updated_at;
      return;
    end if;

    raise exception 'PAYMENT_METHOD_LOCKED' using errcode = 'P0001';
  end if;

  if v_job.status is distinct from 'confirmed_by_customer'::public.job_status
    or v_job.final_price is null
    or v_job.final_price <= 0
    or v_job.final_price <> p_expected_gross_amount
    or v_job.worker_id is null
  then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.worker_profiles as worker
    where worker.id = v_job.worker_id
      and worker.is_approved is true
      and worker.is_suspended is false
  ) then
    raise exception 'WORKER_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  select * into v_tier
  from private.resolve_job_commission_terms(v_job.id, v_job.worker_id);
  if not found then
    raise exception 'WORKER_TIER_MISSING' using errcode = 'P0001';
  end if;

  v_platform_fee := round(
    v_job.final_price::numeric * v_tier.commission_rate_bps / 10000.0
  );
  v_worker_net := v_job.final_price - v_platform_fee;
  if v_worker_net <= 0 then
    raise exception 'INVALID_WORKER_NET' using errcode = 'P0001';
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
    payment_provider = 'platform_bank_manual',
    payment_qr_image_url = p_qr_image_url,
    payment_received_at = null,
    payment_status = 'manual_qr_ready',
    payment_transfer_content = p_transfer_content,
    payment_updated_at = v_now,
    sepay_reference_code = null,
    sepay_transaction_id = null,
    status = 'payment_pending'::public.job_status
  where id = v_job.id;

  insert into public.job_payment_orders (
    job_id, customer_id, worker_id, payment_method, status, gross_amount,
    platform_fee, worker_net, payment_code, transfer_content, qr_image_url
  ) values (
    v_job.id, p_customer_id, v_job.worker_id, 'platform_bank_manual',
    'manual_qr_ready', v_job.final_price, v_platform_fee, v_worker_net,
    p_payment_code, p_transfer_content, p_qr_image_url
  ) returning * into v_order;

  insert into public.worker_payment_ledger (
    job_id, worker_id, payment_provider, payment_state, gross_amount,
    platform_fee, worker_net, commission_level, commission_rate_bps
  ) values (
    v_job.id, v_job.worker_id, 'platform_bank_manual', 'pending',
    v_job.final_price, v_platform_fee, v_worker_net,
    v_tier.commission_level, v_tier.commission_rate_bps
  );

  insert into public.job_events (
    job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
  ) values (
    v_job.id, p_customer_id, 'customer'::public.user_role,
    'customer_started_payment', 'confirmed_by_customer'::public.job_status,
    'payment_pending'::public.job_status,
    pg_catalog.jsonb_build_object('payment_mode', 'platform_bank_manual')
  );

  insert into public.job_payment_reconciliation_events (
    payment_order_id, job_id, actor_id, event_type, safe_metadata
  ) values (
    v_order.id, v_job.id, p_customer_id, 'manual_order_created',
    pg_catalog.jsonb_build_object('payment_mode', 'platform_bank_manual')
  );

  return query select
    v_job.id,
    'payment_pending'::public.job_status,
    'manual_qr_ready'::text,
    v_job.final_price,
    p_payment_code,
    p_transfer_content,
    p_qr_image_url,
    v_now;
end;
$function$;

revoke all on function public.create_manual_bank_payment_order(
  uuid, uuid, integer, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_manual_bank_payment_order(
  uuid, uuid, integer, text, text, text, timestamptz
) to service_role;

create or replace function public.create_worker_vietqr_payment_intent(
  p_job_id uuid,
  p_customer_id uuid,
  p_expected_gross_amount integer,
  p_payment_code text,
  p_transfer_content text,
  p_qr_image_url text,
  p_payment_updated_at timestamptz default now()
)
returns table (
  job_id uuid,
  job_status public.job_status,
  gross_amount integer,
  platform_fee integer,
  worker_net integer,
  commission_level smallint,
  commission_rate_bps integer,
  payment_code text,
  transfer_content text,
  qr_image_url text,
  payment_updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $function$
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
    or p_qr_image_url not like 'https://vietqr.app/img?%'
  then
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
      or v_job.payment_status is distinct from 'vietqr_ready'
    then
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
    or v_job.final_price <> p_expected_gross_amount
  then
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
  from private.resolve_job_commission_terms(v_job.id, v_worker.id);
  if not found then
    raise exception 'worker commission tier is not configured' using errcode = 'P0001';
  end if;

  v_platform_fee := round(
    v_job.final_price::numeric * v_tier.commission_rate_bps / 10000.0
  );
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

revoke all on function public.create_worker_vietqr_payment_intent(
  uuid, uuid, integer, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_worker_vietqr_payment_intent(
  uuid, uuid, integer, text, text, text, timestamptz
) to service_role;

create or replace function public.confirm_worker_cash_payment(
  p_job_id uuid,
  p_worker_id uuid
)
returns table (
  outcome text,
  job_id uuid,
  job_status public.job_status,
  payment_status text,
  gross_amount integer,
  platform_fee integer,
  worker_net integer,
  commission_level smallint,
  commission_rate_bps integer,
  cash_commission_collected integer,
  cash_commission_due integer,
  payment_received_at timestamptz,
  payment_updated_at timestamptz
)
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $function$
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
  from public.jobs as job
  where job.id = p_job_id
    and job.worker_id = p_worker_id
  for update;

  if not found then
    raise exception 'cash payment job not found' using errcode = 'P0001';
  end if;

  if v_job.status = 'paid'::public.job_status
    and v_job.payment_provider = 'cash'
    and v_job.payment_status = 'cash_confirmed'
  then
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
    or v_job.final_price <= 0
  then
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
  from private.resolve_job_commission_terms(v_job.id, p_worker_id);
  if not found then
    raise exception 'worker commission tier is not configured' using errcode = 'P0001';
  end if;

  v_platform_fee := round(
    v_job.final_price::numeric * v_tier.commission_rate_bps / 10000.0
  );
  v_worker_net := v_job.final_price - v_platform_fee;
  if v_worker_net <= 0 then
    raise exception 'worker net must be positive' using errcode = 'P0001';
  end if;

  select coalesce(sum(ledger.worker_net), 0)
  into v_available_credits
  from public.worker_payment_ledger as ledger
  where ledger.worker_id = p_worker_id
    and ledger.payment_state = 'available';

  select coalesce(sum(cash_ledger.cash_commission_collected), 0)
  into v_previous_cash_debits
  from public.worker_cash_commission_ledger as cash_ledger
  where cash_ledger.worker_id = p_worker_id;

  select coalesce(sum(reconciliation.amount), 0)
  into v_reconciled_cash_debits
  from public.worker_cash_commission_reconciliations as reconciliation
  where reconciliation.worker_id = p_worker_id;

  v_available_balance := greatest(
    0,
    v_available_credits - v_previous_cash_debits - v_reconciled_cash_debits
  );
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
      'commission_state', case
        when v_cash_commission_due = 0 then 'collected'
        else 'reconciliation_due'
      end
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

revoke all on function public.confirm_worker_cash_payment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_worker_cash_payment(uuid, uuid)
  to service_role;

comment on function private.resolve_job_commission_terms(uuid, uuid) is
  'Resolves the commission rate accepted for one job, falling back to current policy only for legacy jobs without bilateral terms.';

commit;
