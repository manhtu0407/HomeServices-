begin;

alter table public.jobs
  drop constraint if exists jobs_payment_status_check;

alter table public.jobs
  add constraint jobs_payment_status_check
  check (
    payment_status in (
      'not_started',
      'code_requested',
      'vietqr_ready',
      'pending',
      'received',
      'cash_confirmed',
      'amount_mismatch',
      'expired',
      'failed',
      'reconciled',
      'manual_qr_ready',
      'manual_customer_claimed',
      'manual_reconcile_required',
      'manual_verified',
      'direct_awaiting_confirmation',
      'direct_reconcile_required',
      'direct_paid'
    )
  );

alter table public.worker_payment_ledger
  drop constraint if exists worker_payment_ledger_payment_provider_check;

alter table public.worker_payment_ledger
  add constraint worker_payment_ledger_payment_provider_check
  check (payment_provider in ('sepay_vietqr', 'platform_bank_manual'));

create table if not exists public.job_payment_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  payment_method text not null check (payment_method in ('platform_bank_manual', 'direct_worker')),
  status text not null check (status in (
    'manual_qr_ready',
    'manual_customer_claimed',
    'manual_reconcile_required',
    'manual_verified',
    'manual_cancelled',
    'direct_awaiting_customer_confirmation',
    'direct_awaiting_worker_confirmation',
    'direct_reconcile_required',
    'direct_paid'
  )),
  gross_amount integer not null check (gross_amount > 0),
  platform_fee integer not null default 0 check (platform_fee >= 0),
  worker_net integer not null default 0 check (worker_net >= 0),
  payment_code text unique check (payment_code is null or payment_code ~ '^NS[A-Z0-9]{24}$'),
  transfer_content text check (transfer_content is null or transfer_content ~ '^NS[A-Z0-9]{24}$'),
  qr_image_url text,
  client_request_id text check (client_request_id is null or client_request_id ~ '^[A-Za-z0-9._:-]{1,120}$'),
  customer_transfer_claimed_at timestamptz,
  customer_transferred_at timestamptz,
  sending_bank_code text check (sending_bank_code is null or sending_bank_code ~ '^[A-Z0-9_-]{2,32}$'),
  customer_confirmed_at timestamptz,
  worker_confirmed_at timestamptz,
  response_deadline timestamptz,
  amount_received integer check (amount_received is null or amount_received > 0),
  bank_reference_hash text check (bank_reference_hash is null or bank_reference_hash ~ '^[0-9a-f]{64}$'),
  bank_reference_suffix text check (bank_reference_suffix is null or bank_reference_suffix ~ '^[A-Za-z0-9._/-]{2,16}$'),
  credited_at timestamptz,
  verified_by uuid references public.profiles(id) on delete restrict,
  verified_at timestamptz,
  hold_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (gross_amount = platform_fee + worker_net),
  check (
    (payment_method = 'platform_bank_manual' and payment_code is not null and transfer_content = payment_code and qr_image_url is not null)
    or payment_method = 'direct_worker'
  )
);

create unique index if not exists job_payment_orders_bank_reference_hash_uidx
  on public.job_payment_orders (bank_reference_hash)
  where bank_reference_hash is not null;

create index if not exists job_payment_orders_status_updated_idx
  on public.job_payment_orders (status, updated_at desc);

create index if not exists job_payment_orders_worker_status_idx
  on public.job_payment_orders (worker_id, status, updated_at desc);

create table if not exists public.job_payment_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null references public.job_payment_orders(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in (
    'manual_order_created',
    'customer_transfer_claimed',
    'manual_reconcile_required',
    'manual_payment_verified',
    'direct_payment_selected',
    'direct_payment_customer_confirmed',
    'direct_payment_worker_confirmed',
    'direct_payment_disputed',
    'direct_payment_timeout',
    'direct_payment_admin_paid',
    'direct_collateral_released',
    'worker_credit_released'
  )),
  reason_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists job_payment_reconciliation_events_order_created_idx
  on public.job_payment_reconciliation_events (payment_order_id, created_at desc);

create index if not exists job_payment_reconciliation_events_job_created_idx
  on public.job_payment_reconciliation_events (job_id, created_at desc);

create table if not exists public.worker_direct_payment_collateral_reservations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete restrict,
  payment_order_id uuid not null unique references public.job_payment_orders(id) on delete restrict,
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  collateral_amount integer not null check (collateral_amount > 0),
  status text not null check (status in ('held', 'collected', 'released')),
  held_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worker_direct_payment_collateral_worker_status_idx
  on public.worker_direct_payment_collateral_reservations (worker_id, status, held_at desc);

create table if not exists public.platform_bank_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_key text not null check (account_key = 'platform_secondary'),
  balance_vnd integer not null check (balance_vnd >= 0),
  observed_at timestamptz not null,
  entered_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (account_key, observed_at)
);

create index if not exists platform_bank_balance_snapshots_key_observed_idx
  on public.platform_bank_balance_snapshots (account_key, observed_at desc);

alter table public.job_payment_orders enable row level security;
alter table public.job_payment_reconciliation_events enable row level security;
alter table public.worker_direct_payment_collateral_reservations enable row level security;
alter table public.platform_bank_balance_snapshots enable row level security;

revoke all on table public.job_payment_orders from public, anon, authenticated;
revoke all on table public.job_payment_reconciliation_events from public, anon, authenticated;
revoke all on table public.worker_direct_payment_collateral_reservations from public, anon, authenticated;
revoke all on table public.platform_bank_balance_snapshots from public, anon, authenticated;
grant all on table public.job_payment_orders to service_role;
grant all on table public.job_payment_reconciliation_events to service_role;
grant all on table public.worker_direct_payment_collateral_reservations to service_role;
grant all on table public.platform_bank_balance_snapshots to service_role;

create or replace function private.payment_finance_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

drop trigger if exists job_payment_orders_touch_updated_at on public.job_payment_orders;
create trigger job_payment_orders_touch_updated_at
before update on public.job_payment_orders
for each row execute function private.payment_finance_touch_updated_at();

drop trigger if exists worker_direct_payment_collateral_touch_updated_at on public.worker_direct_payment_collateral_reservations;
create trigger worker_direct_payment_collateral_touch_updated_at
before update on public.worker_direct_payment_collateral_reservations
for each row execute function private.payment_finance_touch_updated_at();

create or replace function private.prevent_payment_reconciliation_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'payment reconciliation events are immutable';
end;
$function$;

drop trigger if exists job_payment_reconciliation_events_immutable on public.job_payment_reconciliation_events;
create trigger job_payment_reconciliation_events_immutable
before update or delete on public.job_payment_reconciliation_events
for each row execute function private.prevent_payment_reconciliation_event_mutation();

create or replace function private.assert_finance_reconciler(p_actor_id uuid)
returns void
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

  if v_role = 'admin'::public.user_role then
    return;
  end if;

  if v_role = 'admin_operator'::public.user_role and exists (
    select 1
    from public.admin_operator_accounts as operator_account
    where operator_account.user_id = p_actor_id
      and operator_account.status = 'active'
      and 'finance.reconcile' = any(operator_account.capabilities)
  ) then
    return;
  end if;

  raise exception 'FINANCE_RECONCILE_REQUIRED' using errcode = 'P0001';
end;
$function$;

revoke all on function private.assert_finance_reconciler(uuid) from public, anon, authenticated;
grant execute on function private.assert_finance_reconciler(uuid) to service_role;

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
      and v_order.status in ('manual_qr_ready', 'manual_customer_claimed', 'manual_reconcile_required')
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
  from private.resolve_worker_commission_tier(v_job.worker_id);
  if not found then
    raise exception 'WORKER_TIER_MISSING' using errcode = 'P0001';
  end if;

  v_platform_fee := round(v_job.final_price::numeric * v_tier.commission_rate_bps / 10000.0);
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
    v_job.id, p_customer_id, v_job.worker_id, 'platform_bank_manual', 'manual_qr_ready',
    v_job.final_price, v_platform_fee, v_worker_net, p_payment_code, p_transfer_content, p_qr_image_url
  ) returning * into v_order;

  insert into public.worker_payment_ledger (
    job_id, worker_id, payment_provider, payment_state, gross_amount,
    platform_fee, worker_net, commission_level, commission_rate_bps
  ) values (
    v_job.id, v_job.worker_id, 'platform_bank_manual', 'pending', v_job.final_price,
    v_platform_fee, v_worker_net, v_tier.commission_level, v_tier.commission_rate_bps
  );

  insert into public.job_events (
    job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
  ) values (
    v_job.id, p_customer_id, 'customer'::public.user_role, 'customer_started_payment',
    'confirmed_by_customer'::public.job_status, 'payment_pending'::public.job_status,
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

revoke all on function public.create_manual_bank_payment_order(uuid, uuid, integer, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_manual_bank_payment_order(uuid, uuid, integer, text, text, text, timestamptz)
  to service_role;

create or replace function public.claim_manual_bank_payment(
  p_job_id uuid,
  p_customer_id uuid,
  p_transferred_at timestamptz,
  p_sending_bank text default null
)
returns table (
  job_id uuid,
  status public.job_status,
  payment_status text,
  transfer_claimed_at timestamptz,
  notification_required boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_order public.job_payment_orders%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_sending_bank text := nullif(upper(pg_catalog.btrim(p_sending_bank)), '');
begin
  if p_job_id is null
    or p_customer_id is null
    or p_transferred_at is null
    or p_transferred_at > v_now + interval '5 minutes'
    or p_transferred_at < v_now - interval '90 days'
    or (v_sending_bank is not null and v_sending_bank !~ '^[A-Z0-9_-]{2,32}$')
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

  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.job_id = p_job_id
  for update;

  if not found
    or v_order.payment_method is distinct from 'platform_bank_manual'
    or v_job.payment_provider is distinct from 'platform_bank_manual'
    or v_job.status is distinct from 'payment_pending'::public.job_status
  then
    raise exception 'PAYMENT_METHOD_LOCKED' using errcode = 'P0001';
  end if;

  if v_order.status = 'manual_customer_claimed' then
    return query select v_job.id, v_job.status, v_order.status, v_order.customer_transfer_claimed_at, false;
    return;
  end if;

  if v_order.status is distinct from 'manual_qr_ready' then
    raise exception 'PAYMENT_METHOD_LOCKED' using errcode = 'P0001';
  end if;

  update public.job_payment_orders
  set
    status = 'manual_customer_claimed',
    customer_transfer_claimed_at = v_now,
    customer_transferred_at = p_transferred_at,
    sending_bank_code = v_sending_bank
  where id = v_order.id
  returning * into v_order;

  update public.jobs
  set payment_status = 'manual_customer_claimed', payment_updated_at = v_now
  where id = v_job.id;

  insert into public.job_events (
    job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
  ) values (
    v_job.id, p_customer_id, 'customer'::public.user_role, 'customer_claimed_bank_transfer',
    'payment_pending'::public.job_status, 'payment_pending'::public.job_status,
    pg_catalog.jsonb_build_object('payment_mode', 'platform_bank_manual', 'sending_bank_provided', v_sending_bank is not null)
  );

  insert into public.job_payment_reconciliation_events (
    payment_order_id, job_id, actor_id, event_type, safe_metadata
  ) values (
    v_order.id, v_job.id, p_customer_id, 'customer_transfer_claimed',
    pg_catalog.jsonb_build_object('sending_bank_provided', v_sending_bank is not null)
  );

  return query select v_job.id, 'payment_pending'::public.job_status, 'manual_customer_claimed'::text, v_now, true;
end;
$function$;

revoke all on function public.claim_manual_bank_payment(uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.claim_manual_bank_payment(uuid, uuid, timestamptz, text)
  to service_role;

create or replace function public.select_direct_worker_payment(
  p_job_id uuid,
  p_customer_id uuid,
  p_client_request_id text
)
returns table (
  ok boolean,
  error_code text,
  job_id uuid,
  status public.job_status,
  direct_status text,
  collateral_amount integer,
  response_deadline timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_order public.job_payment_orders%rowtype;
  v_reservation public.worker_direct_payment_collateral_reservations%rowtype;
  v_available_credits bigint;
  v_cash_commission_collected bigint;
  v_reserved_or_paid bigint;
  v_active_collateral bigint;
  v_available_balance bigint;
  v_collateral integer;
  v_has_existing_order boolean := false;
  v_worker_net integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_deadline timestamptz := v_now + interval '24 hours';
begin
  if p_job_id is null
    or p_customer_id is null
    or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
  then
    return query select false, 'INVALID_INPUT'::text, p_job_id, null::public.job_status, null::text, null::integer, null::timestamptz;
    return;
  end if;

  select job.* into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found or v_job.customer_id is distinct from p_customer_id then
    return query select false, 'JOB_NOT_FOUND'::text, p_job_id, null::public.job_status, null::text, null::integer, null::timestamptz;
    return;
  end if;
  if v_job.worker_id is null or v_job.final_price is null or v_job.final_price <= 0 then
    return query select false, 'INVALID_STATUS'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_job.worker_id::text, 0));

  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.job_id = v_job.id
  for update;
  v_has_existing_order := found;

  if v_has_existing_order and v_order.payment_method = 'direct_worker' then
    select reservation.* into v_reservation
    from public.worker_direct_payment_collateral_reservations as reservation
    where reservation.job_id = v_job.id
    for update;
    return query select
      true,
      null::text,
      v_job.id,
      v_job.status,
      case v_order.status
        when 'direct_awaiting_customer_confirmation' then 'awaiting_customer_confirmation'
        when 'direct_awaiting_worker_confirmation' then 'awaiting_worker_confirmation'
        when 'direct_reconcile_required' then 'reconcile_required'
        when 'direct_paid' then 'paid'
        else null
      end,
      v_reservation.collateral_amount,
      v_order.response_deadline;
    return;
  end if;

  if v_job.status = 'payment_pending'::public.job_status then
    if not v_has_existing_order or v_order.payment_method <> 'platform_bank_manual' or v_order.status <> 'manual_qr_ready' then
      return query select false, 'PAYMENT_ALREADY_CLAIMED'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz;
      return;
    end if;

    delete from public.worker_payment_ledger as ledger
    where ledger.job_id = v_job.id
      and ledger.payment_provider = 'platform_bank_manual'
      and ledger.payment_state = 'pending';
    if not found then
      return query select false, 'PAYMENT_METHOD_LOCKED'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz;
      return;
    end if;
  elsif v_job.status is distinct from 'confirmed_by_customer'::public.job_status then
    return query select false, 'INVALID_STATUS'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz;
    return;
  end if;

  select coalesce(sum(ledger.worker_net) filter (where ledger.payment_state = 'available'), 0)::bigint
  into v_available_credits
  from public.worker_payment_ledger as ledger
  where ledger.worker_id = v_job.worker_id;

  select coalesce(sum(
    cash_ledger.cash_commission_collected
    + least(
      cash_ledger.cash_commission_due,
      coalesce((
        select sum(reconciliation.amount)
        from public.worker_cash_commission_reconciliations as reconciliation
        where reconciliation.cash_commission_ledger_id = cash_ledger.id
      ), 0)::integer
    )
  ), 0)::bigint
  into v_cash_commission_collected
  from public.worker_cash_commission_ledger as cash_ledger
  where cash_ledger.worker_id = v_job.worker_id;

  select coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing', 'paid')), 0)::bigint
  into v_reserved_or_paid
  from public.worker_withdrawal_requests as request
  where request.worker_id = v_job.worker_id;

  select coalesce(sum(reservation.collateral_amount) filter (where reservation.status = 'held'), 0)::bigint
  into v_active_collateral
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.worker_id = v_job.worker_id;

  v_collateral := round(v_job.final_price::numeric * 0.15);
  v_worker_net := v_job.final_price - v_collateral;
  v_available_balance := greatest(0::bigint, v_available_credits - v_cash_commission_collected - v_reserved_or_paid - v_active_collateral);
  if v_collateral <= 0 or v_worker_net <= 0 or v_available_balance < v_collateral then
    return query select false, 'INSUFFICIENT_COLLATERAL'::text, v_job.id, v_job.status, null::text, v_collateral, null::timestamptz;
    return;
  end if;

  if v_has_existing_order then
    update public.job_payment_orders
    set
      payment_method = 'direct_worker',
      status = 'direct_awaiting_customer_confirmation',
      platform_fee = v_collateral,
      worker_net = v_worker_net,
      payment_code = null,
      transfer_content = null,
      qr_image_url = null,
      client_request_id = p_client_request_id,
      response_deadline = v_deadline,
      customer_transfer_claimed_at = null,
      customer_transferred_at = null,
      sending_bank_code = null
    where id = v_order.id
    returning * into v_order;
  else
    insert into public.job_payment_orders (
      job_id, customer_id, worker_id, payment_method, status, gross_amount,
      platform_fee, worker_net, client_request_id, response_deadline
    ) values (
      v_job.id, p_customer_id, v_job.worker_id, 'direct_worker',
      'direct_awaiting_customer_confirmation', v_job.final_price,
      v_collateral, v_worker_net, p_client_request_id, v_deadline
    ) returning * into v_order;
  end if;

  insert into public.worker_direct_payment_collateral_reservations (
    job_id, payment_order_id, worker_id, collateral_amount, status
  ) values (
    v_job.id, v_order.id, v_job.worker_id, v_collateral, 'held'
  ) returning * into v_reservation;

  update public.jobs
  set
    gross_amount = v_job.final_price,
    platform_fee = v_collateral,
    worker_net = v_worker_net,
    worker_commission_level = 1,
    worker_commission_rate_bps = 1500,
    payment_amount_received = null,
    payment_code = null,
    payment_expires_at = null,
    payment_failure_reason = null,
    payment_provider = 'direct_worker',
    payment_qr_image_url = null,
    payment_received_at = null,
    payment_status = 'direct_awaiting_confirmation',
    payment_transfer_content = null,
    payment_updated_at = v_now,
    sepay_reference_code = null,
    sepay_transaction_id = null,
    status = 'payment_pending'::public.job_status
  where id = v_job.id;

  insert into public.job_events (
    job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
  ) values (
    v_job.id,
    p_customer_id,
    'customer'::public.user_role,
    'customer_selected_direct_payment',
    v_job.status,
    'payment_pending'::public.job_status,
    pg_catalog.jsonb_build_object('payment_mode', 'direct_worker', 'collateral_rate_bps', 1500)
  );

  insert into public.job_payment_reconciliation_events (
    payment_order_id, job_id, actor_id, event_type, safe_metadata
  ) values (
    v_order.id, v_job.id, p_customer_id, 'direct_payment_selected',
    pg_catalog.jsonb_build_object('collateral_rate_bps', 1500)
  );

  return query select
    true,
    null::text,
    v_job.id,
    'payment_pending'::public.job_status,
    'awaiting_customer_confirmation'::text,
    v_reservation.collateral_amount,
    v_deadline;
end;
$function$;

revoke all on function public.select_direct_worker_payment(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.select_direct_worker_payment(uuid, uuid, text)
  to service_role;

create or replace function public.respond_to_direct_worker_payment(
  p_job_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_received boolean
)
returns table (
  ok boolean,
  error_code text,
  job_id uuid,
  status public.job_status,
  direct_status text,
  collateral_amount integer,
  response_deadline timestamptz,
  notification_required boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_order public.job_payment_orders%rowtype;
  v_reservation public.worker_direct_payment_collateral_reservations%rowtype;
  v_profile_role public.user_role;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_both_confirmed boolean := false;
begin
  if p_job_id is null
    or p_actor_id is null
    or p_actor_role not in ('customer', 'worker')
    or p_received is null
  then
    return query select false, 'INVALID_INPUT'::text, p_job_id, null::public.job_status, null::text, null::integer, null::timestamptz, false;
    return;
  end if;

  select profile.role into v_profile_role
  from public.profiles as profile
  where profile.id = p_actor_id;
  if v_profile_role::text is distinct from p_actor_role then
    return query select false, 'AUTH_FORBIDDEN'::text, p_job_id, null::public.job_status, null::text, null::integer, null::timestamptz, false;
    return;
  end if;

  select job.* into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;
  if not found then
    return query select false, 'JOB_NOT_FOUND'::text, p_job_id, null::public.job_status, null::text, null::integer, null::timestamptz, false;
    return;
  end if;
  if (p_actor_role = 'customer' and v_job.customer_id is distinct from p_actor_id)
    or (p_actor_role = 'worker' and v_job.worker_id is distinct from p_actor_id)
  then
    return query select false, 'AUTH_FORBIDDEN'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz, false;
    return;
  end if;

  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.job_id = v_job.id
  for update;
  select reservation.* into v_reservation
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.job_id = v_job.id
  for update;
  if not found or v_order.payment_method <> 'direct_worker' or v_reservation.status not in ('held', 'collected') then
    return query select false, 'DIRECT_PAYMENT_NOT_FOUND'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz, false;
    return;
  end if;

  if v_order.status = 'direct_paid' then
    return query select true, null::text, v_job.id, 'paid'::public.job_status, 'paid'::text, v_reservation.collateral_amount, v_order.response_deadline, false;
    return;
  end if;
  if v_order.status = 'direct_reconcile_required' then
    return query select true, null::text, v_job.id, 'payment_pending'::public.job_status, 'reconcile_required'::text, v_reservation.collateral_amount, v_order.response_deadline, false;
    return;
  end if;

  if not p_received then
    update public.job_payment_orders
    set status = 'direct_reconcile_required'
    where id = v_order.id
    returning * into v_order;

    update public.jobs
    set payment_status = 'direct_reconcile_required', payment_failure_reason = 'direct_payment_disputed', payment_updated_at = v_now
    where id = v_job.id;

    insert into public.job_events (
      job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
    ) values (
      v_job.id, p_actor_id, p_actor_role::public.user_role, 'direct_payment_disputed',
      'payment_pending'::public.job_status, 'payment_pending'::public.job_status,
      pg_catalog.jsonb_build_object('payment_mode', 'direct_worker')
    );
    insert into public.job_payment_reconciliation_events (
      payment_order_id, job_id, actor_id, event_type, reason_code
    ) values (
      v_order.id, v_job.id, p_actor_id, 'direct_payment_disputed', 'party_disagreed'
    );

    return query select true, null::text, v_job.id, 'payment_pending'::public.job_status, 'reconcile_required'::text, v_reservation.collateral_amount, v_order.response_deadline, true;
    return;
  end if;

  if p_actor_role = 'customer' then
    update public.job_payment_orders
    set customer_confirmed_at = coalesce(customer_confirmed_at, v_now)
    where id = v_order.id
    returning * into v_order;
  else
    update public.job_payment_orders
    set worker_confirmed_at = coalesce(worker_confirmed_at, v_now)
    where id = v_order.id
    returning * into v_order;
  end if;

  v_both_confirmed := v_order.customer_confirmed_at is not null and v_order.worker_confirmed_at is not null;
  if v_both_confirmed and exists (
    select 1 from public.disputes as dispute
    where dispute.job_id = v_job.id and dispute.status <> 'resolved'
  ) then
    update public.job_payment_orders set status = 'direct_reconcile_required' where id = v_order.id returning * into v_order;
    update public.jobs set payment_status = 'direct_reconcile_required', payment_failure_reason = 'unresolved_dispute', payment_updated_at = v_now where id = v_job.id;
    insert into public.job_payment_reconciliation_events (
      payment_order_id, job_id, actor_id, event_type, reason_code
    ) values (
      v_order.id, v_job.id, p_actor_id, 'direct_payment_disputed', 'unresolved_dispute'
    );
    return query select true, null::text, v_job.id, 'payment_pending'::public.job_status, 'reconcile_required'::text, v_reservation.collateral_amount, v_order.response_deadline, true;
    return;
  end if;

  if v_both_confirmed then
    update public.job_payment_orders
    set status = 'direct_paid', amount_received = v_job.final_price, credited_at = v_now, verified_at = v_now
    where id = v_order.id
    returning * into v_order;
    update public.worker_direct_payment_collateral_reservations
    set status = 'collected', resolved_at = v_now, resolved_by = p_actor_id
    where id = v_reservation.id
    returning * into v_reservation;
    insert into public.worker_cash_commission_ledger (
      job_id, worker_id, gross_amount, platform_fee, worker_net,
      commission_level, commission_rate_bps, cash_commission_collected, cash_commission_due, confirmed_at
    ) values (
      v_job.id, v_job.worker_id, v_job.final_price, v_reservation.collateral_amount,
      v_job.final_price - v_reservation.collateral_amount, 1, 1500,
      v_reservation.collateral_amount, 0, v_now
    ) on conflict (job_id) do nothing;
    update public.jobs
    set
      paid_at = coalesce(paid_at, v_now),
      payment_amount_received = v_job.final_price,
      payment_failure_reason = null,
      payment_received_at = v_now,
      payment_status = 'direct_paid',
      payment_updated_at = v_now,
      status = 'paid'::public.job_status
    where id = v_job.id;
    insert into public.job_events (
      job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
    ) values (
      v_job.id, p_actor_id, p_actor_role::public.user_role, 'payment_confirmed',
      'payment_pending'::public.job_status, 'paid'::public.job_status,
      pg_catalog.jsonb_build_object('payment_mode', 'direct_worker', 'confirmation_mode', 'two_party')
    );
    insert into public.job_payment_reconciliation_events (
      payment_order_id, job_id, actor_id, event_type, safe_metadata
    ) values (
      v_order.id, v_job.id, p_actor_id,
      case when p_actor_role = 'customer' then 'direct_payment_customer_confirmed' else 'direct_payment_worker_confirmed' end,
      pg_catalog.jsonb_build_object('payment_confirmed', true)
    );
    return query select true, null::text, v_job.id, 'paid'::public.job_status, 'paid'::text, v_reservation.collateral_amount, v_order.response_deadline, false;
    return;
  end if;

  update public.job_payment_orders
  set status = case when p_actor_role = 'customer' then 'direct_awaiting_worker_confirmation' else 'direct_awaiting_customer_confirmation' end
  where id = v_order.id
  returning * into v_order;
  update public.jobs
  set payment_status = 'direct_awaiting_confirmation', payment_updated_at = v_now
  where id = v_job.id;
  insert into public.job_payment_reconciliation_events (
    payment_order_id, job_id, actor_id, event_type
  ) values (
    v_order.id, v_job.id, p_actor_id,
    case when p_actor_role = 'customer' then 'direct_payment_customer_confirmed' else 'direct_payment_worker_confirmed' end
  );

  return query select
    true,
    null::text,
    v_job.id,
    'payment_pending'::public.job_status,
    case when p_actor_role = 'customer' then 'awaiting_worker_confirmation' else 'awaiting_customer_confirmation' end,
    v_reservation.collateral_amount,
    v_order.response_deadline,
    false;
end;
$function$;

revoke all on function public.respond_to_direct_worker_payment(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.respond_to_direct_worker_payment(uuid, uuid, text, boolean)
  to service_role;

create or replace function public.decide_manual_bank_payment_reconciliation(
  p_payment_order_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_amount_received integer default null,
  p_credited_at timestamptz default null,
  p_bank_reference_hash text default null,
  p_bank_reference_suffix text default null,
  p_reason_code text default null
)
returns table (
  ok boolean,
  error_code text,
  outcome text,
  job_id uuid,
  status public.job_status,
  payment_status text,
  hold_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.job_payment_orders%rowtype;
  v_order_job_id uuid;
  v_job public.jobs%rowtype;
  v_reservation public.worker_direct_payment_collateral_reservations%rowtype;
  v_ledger public.worker_payment_ledger%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_hold_until timestamptz := v_now + interval '24 hours';
  v_decision text := lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_reason_code text := nullif(left(pg_catalog.btrim(p_reason_code), 80), '');
begin
  perform private.assert_finance_reconciler(p_actor_id);
  if p_payment_order_id is null or v_decision not in ('confirm', 'reconcile_required', 'direct_paid', 'direct_release') then
    return query select false, 'INVALID_INPUT'::text, null::text, null::uuid, null::public.job_status, null::text, null::timestamptz;
    return;
  end if;

  select payment_order.job_id into v_order_job_id
  from public.job_payment_orders as payment_order
  where payment_order.id = p_payment_order_id;
  if not found then
    return query select false, 'PAYMENT_ORDER_NOT_FOUND'::text, null::text, null::uuid, null::public.job_status, null::text, null::timestamptz;
    return;
  end if;
  select job.* into v_job
  from public.jobs as job
  where job.id = v_order_job_id
  for update;
  if not found then
    return query select false, 'PAYMENT_ORDER_NOT_FOUND'::text, null::text, null::uuid, null::public.job_status, null::text, null::timestamptz;
    return;
  end if;
  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.id = p_payment_order_id
  for update;
  if not found or v_order.job_id is distinct from v_job.id then
    return query select false, 'PAYMENT_ORDER_NOT_FOUND'::text, null::text, null::uuid, null::public.job_status, null::text, null::timestamptz;
    return;
  end if;

  if v_order.payment_method = 'direct_worker' then
    select reservation.* into v_reservation
    from public.worker_direct_payment_collateral_reservations as reservation
    where reservation.payment_order_id = v_order.id
    for update;
    if not found then
      return query select false, 'COLLATERAL_NOT_FOUND'::text, null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz;
      return;
    end if;
    if v_decision = 'direct_release' then
      if v_order.status <> 'direct_reconcile_required'
        or v_reservation.status <> 'held'
        or v_job.status <> 'payment_pending'::public.job_status
      then
        return query select false, 'INVALID_STATUS'::text, null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz;
        return;
      end if;
      update public.worker_direct_payment_collateral_reservations
      set status = 'released', resolved_at = v_now, resolved_by = p_actor_id
      where id = v_reservation.id
      returning * into v_reservation;
      update public.job_payment_orders set status = 'direct_reconcile_required', verified_by = p_actor_id, verified_at = v_now where id = v_order.id returning * into v_order;
      insert into public.job_payment_reconciliation_events (payment_order_id, job_id, actor_id, event_type, reason_code)
      values (v_order.id, v_job.id, p_actor_id, 'direct_collateral_released', coalesce(v_reason_code, 'admin_release'));
      return query select true, null::text, 'direct_reconcile_required'::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz;
      return;
    end if;
    if v_decision <> 'direct_paid'
      or v_order.status <> 'direct_reconcile_required'
      or v_reservation.status <> 'held'
      or v_job.status <> 'payment_pending'::public.job_status
    then
      return query select false, 'INVALID_STATUS'::text, null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz;
      return;
    end if;
    update public.worker_direct_payment_collateral_reservations
    set status = 'collected', resolved_at = v_now, resolved_by = p_actor_id
    where id = v_reservation.id
    returning * into v_reservation;
    insert into public.worker_cash_commission_ledger (
      job_id, worker_id, gross_amount, platform_fee, worker_net,
      commission_level, commission_rate_bps, cash_commission_collected, cash_commission_due, confirmed_at
    ) values (
      v_job.id, v_job.worker_id, v_job.final_price, v_reservation.collateral_amount,
      v_job.final_price - v_reservation.collateral_amount, 1, 1500,
      v_reservation.collateral_amount, 0, v_now
    ) on conflict (job_id) do nothing;
    update public.job_payment_orders
    set status = 'direct_paid', amount_received = v_job.final_price, credited_at = v_now, verified_by = p_actor_id, verified_at = v_now
    where id = v_order.id
    returning * into v_order;
    update public.jobs
    set paid_at = coalesce(paid_at, v_now), payment_amount_received = v_job.final_price,
      payment_failure_reason = null, payment_received_at = v_now, payment_status = 'direct_paid',
      payment_updated_at = v_now, status = 'paid'::public.job_status
    where id = v_job.id;
    insert into public.job_events (job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata)
    values (v_job.id, p_actor_id, 'admin'::public.user_role, 'payment_confirmed',
      'payment_pending'::public.job_status, 'paid'::public.job_status,
      pg_catalog.jsonb_build_object('payment_mode', 'direct_worker', 'confirmation_mode', 'admin_reconciliation'));
    insert into public.job_payment_reconciliation_events (payment_order_id, job_id, actor_id, event_type, reason_code)
    values (v_order.id, v_job.id, p_actor_id, 'direct_payment_admin_paid', coalesce(v_reason_code, 'admin_reconciled'));
    return query select true, null::text, 'paid'::text, v_job.id, 'paid'::public.job_status, 'direct_paid'::text, null::timestamptz;
    return;
  end if;

  if v_order.payment_method <> 'platform_bank_manual'
    or v_order.status not in ('manual_customer_claimed', 'manual_reconcile_required')
  then
    return query select false, 'INVALID_STATUS'::text, null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz;
    return;
  end if;

  if v_decision in ('confirm', 'reconcile_required') then
    if p_amount_received is null
      or p_amount_received <= 0
      or p_credited_at is null
      or p_credited_at > v_now + interval '5 minutes'
      or p_bank_reference_hash !~ '^[0-9a-f]{64}$'
      or p_bank_reference_suffix !~ '^[A-Za-z0-9._/-]{2,16}$'
    then
      return query select false, 'INVALID_INPUT'::text, null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz;
      return;
    end if;
    if exists (
      select 1 from public.job_payment_orders as duplicate_reference
      where duplicate_reference.bank_reference_hash = p_bank_reference_hash
        and duplicate_reference.id <> v_order.id
    ) then
      return query select false, 'BANK_REFERENCE_USED'::text, null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz;
      return;
    end if;
  end if;

  if v_decision = 'reconcile_required' or p_amount_received is distinct from v_order.gross_amount then
    update public.job_payment_orders
    set
      status = 'manual_reconcile_required',
      amount_received = p_amount_received,
      credited_at = p_credited_at,
      bank_reference_hash = p_bank_reference_hash,
      bank_reference_suffix = p_bank_reference_suffix,
      verified_by = p_actor_id,
      verified_at = v_now
    where id = v_order.id
    returning * into v_order;
    update public.jobs
    set payment_amount_received = p_amount_received,
      payment_failure_reason = coalesce(v_reason_code, 'reconcile_required'),
      payment_received_at = p_credited_at,
      payment_status = 'manual_reconcile_required',
      payment_updated_at = v_now
    where id = v_job.id;
    insert into public.job_events (job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata)
    values (v_job.id, p_actor_id, 'admin'::public.user_role, 'payment_reconcile_required',
      'payment_pending'::public.job_status, 'payment_pending'::public.job_status,
      pg_catalog.jsonb_build_object('payment_mode', 'platform_bank_manual'));
    insert into public.job_payment_reconciliation_events (payment_order_id, job_id, actor_id, event_type, reason_code)
    values (v_order.id, v_job.id, p_actor_id, 'manual_reconcile_required', coalesce(v_reason_code, 'amount_or_reference_mismatch'));
    return query select true, null::text, 'reconcile_required'::text, v_job.id, 'payment_pending'::public.job_status, 'manual_reconcile_required'::text, null::timestamptz;
    return;
  end if;

  select ledger.* into v_ledger
  from public.worker_payment_ledger as ledger
  where ledger.job_id = v_job.id
  for update;
  if not found
    or v_ledger.payment_provider <> 'platform_bank_manual'
    or v_ledger.payment_state <> 'pending'
  then
    return query select false, 'WORKER_LEDGER_INVALID'::text, null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz;
    return;
  end if;

  update public.job_payment_orders
  set
    status = 'manual_verified',
    amount_received = p_amount_received,
    credited_at = p_credited_at,
    bank_reference_hash = p_bank_reference_hash,
    bank_reference_suffix = p_bank_reference_suffix,
    verified_by = p_actor_id,
    verified_at = v_now,
    hold_until = v_hold_until
  where id = v_order.id
  returning * into v_order;
  update public.worker_payment_ledger
  set payment_state = 'on_hold', available_at = v_hold_until, updated_at = v_now
  where id = v_ledger.id;
  update public.jobs
  set
    paid_at = coalesce(paid_at, v_now),
    payment_amount_received = p_amount_received,
    payment_failure_reason = null,
    payment_received_at = p_credited_at,
    payment_status = 'manual_verified',
    payment_updated_at = v_now,
    status = 'paid'::public.job_status
  where id = v_job.id;
  insert into public.job_events (job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata)
  values (v_job.id, p_actor_id, 'admin'::public.user_role, 'payment_confirmed',
    'payment_pending'::public.job_status, 'paid'::public.job_status,
    pg_catalog.jsonb_build_object('payment_mode', 'platform_bank_manual', 'worker_credit_hold_hours', 24));
  insert into public.job_payment_reconciliation_events (payment_order_id, job_id, actor_id, event_type, safe_metadata)
  values (v_order.id, v_job.id, p_actor_id, 'manual_payment_verified',
    pg_catalog.jsonb_build_object('worker_credit_hold_hours', 24));
  return query select true, null::text, 'paid'::text, v_job.id, 'paid'::public.job_status, 'manual_verified'::text, v_hold_until;
end;
$function$;

revoke all on function public.decide_manual_bank_payment_reconciliation(uuid, uuid, text, integer, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.decide_manual_bank_payment_reconciliation(uuid, uuid, text, integer, timestamptz, text, text, text)
  to service_role;

create or replace function public.maintain_manual_bank_payment_holds(
  p_limit integer default 100
)
returns table (
  released_count integer,
  direct_reconcile_count integer,
  direct_reconcile_job_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ledger record;
  v_candidate_order record;
  v_order public.job_payment_orders%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  released_count := 0;
  direct_reconcile_count := 0;
  direct_reconcile_job_ids := '{}'::uuid[];
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'INVALID_LIMIT' using errcode = '22023';
  end if;

  for v_ledger in
    select ledger.id, ledger.job_id
    from public.worker_payment_ledger as ledger
    where ledger.payment_provider = 'platform_bank_manual'
      and ledger.payment_state = 'on_hold'
      and ledger.available_at is not null
      and ledger.available_at <= v_now
      and not exists (
        select 1 from public.disputes as dispute
        where dispute.job_id = ledger.job_id and dispute.status <> 'resolved'
      )
    order by ledger.available_at asc
    limit p_limit
    for update skip locked
  loop
    update public.worker_payment_ledger
    set payment_state = 'available', updated_at = v_now
    where id = v_ledger.id;
    insert into public.job_payment_reconciliation_events (payment_order_id, job_id, event_type)
    select payment_order.id, payment_order.job_id, 'worker_credit_released'
    from public.job_payment_orders as payment_order
    where payment_order.job_id = v_ledger.job_id;
    released_count := released_count + 1;
  end loop;

  for v_candidate_order in
    select payment_order.id, payment_order.job_id
    from public.job_payment_orders as payment_order
    where payment_order.payment_method = 'direct_worker'
      and payment_order.status in ('direct_awaiting_customer_confirmation', 'direct_awaiting_worker_confirmation')
      and payment_order.response_deadline is not null
      and payment_order.response_deadline <= v_now
    order by payment_order.response_deadline asc
    limit p_limit
  loop
    perform 1
    from public.jobs as job
    where job.id = v_candidate_order.job_id
      and job.status = 'payment_pending'::public.job_status
    for update skip locked;
    if not found then
      continue;
    end if;
    select payment_order.* into v_order
    from public.job_payment_orders as payment_order
    where payment_order.id = v_candidate_order.id
      and payment_order.payment_method = 'direct_worker'
      and payment_order.status in ('direct_awaiting_customer_confirmation', 'direct_awaiting_worker_confirmation')
      and payment_order.response_deadline is not null
      and payment_order.response_deadline <= v_now
    for update skip locked;
    if not found then
      continue;
    end if;
    update public.job_payment_orders
    set status = 'direct_reconcile_required'
    where id = v_order.id;
    update public.jobs
    set payment_status = 'direct_reconcile_required', payment_failure_reason = 'direct_confirmation_timeout', payment_updated_at = v_now
    where id = v_order.job_id
      and status = 'payment_pending'::public.job_status;
    insert into public.job_events (job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata)
    values (v_order.job_id, null, null, 'direct_payment_timeout',
      'payment_pending'::public.job_status, 'payment_pending'::public.job_status,
      pg_catalog.jsonb_build_object('payment_mode', 'direct_worker'));
    insert into public.job_payment_reconciliation_events (payment_order_id, job_id, event_type, reason_code)
    values (v_order.id, v_order.job_id, 'direct_payment_timeout', 'party_response_timeout');
    direct_reconcile_count := direct_reconcile_count + 1;
    direct_reconcile_job_ids := array_append(direct_reconcile_job_ids, v_order.job_id);
  end loop;

  return next;
end;
$function$;

revoke all on function public.maintain_manual_bank_payment_holds(integer)
  from public, anon, authenticated;
grant execute on function public.maintain_manual_bank_payment_holds(integer)
  to service_role;

create or replace function private.enforce_worker_withdrawal_payment_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_available_credits bigint;
  v_cash_commission_collected bigint;
  v_reserved_or_paid bigint;
  v_active_collateral bigint;
  v_available_balance bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.worker_id::text, 0));

  if exists (
    select 1
    from public.disputes as dispute
    join public.jobs as job on job.id = dispute.job_id
    where job.worker_id = new.worker_id
      and dispute.status <> 'resolved'
  ) then
    raise exception 'UNRESOLVED_DISPUTE' using errcode = 'P0001';
  end if;

  select coalesce(sum(ledger.worker_net) filter (where ledger.payment_state = 'available'), 0)::bigint
  into v_available_credits
  from public.worker_payment_ledger as ledger
  where ledger.worker_id = new.worker_id;
  select coalesce(sum(
    cash_ledger.cash_commission_collected
    + least(cash_ledger.cash_commission_due, coalesce((
      select sum(reconciliation.amount)
      from public.worker_cash_commission_reconciliations as reconciliation
      where reconciliation.cash_commission_ledger_id = cash_ledger.id
    ), 0)::integer)
  ), 0)::bigint
  into v_cash_commission_collected
  from public.worker_cash_commission_ledger as cash_ledger
  where cash_ledger.worker_id = new.worker_id;
  select coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing', 'paid')), 0)::bigint
  into v_reserved_or_paid
  from public.worker_withdrawal_requests as request
  where request.worker_id = new.worker_id;
  select coalesce(sum(reservation.collateral_amount) filter (where reservation.status = 'held'), 0)::bigint
  into v_active_collateral
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.worker_id = new.worker_id;

  v_available_balance := greatest(0::bigint, v_available_credits - v_cash_commission_collected - v_reserved_or_paid - v_active_collateral);
  if new.amount_vnd::bigint > v_available_balance then
    raise exception 'INSUFFICIENT_PAYMENT_SAFE_BALANCE' using errcode = 'P0001';
  end if;
  new.available_balance_before_vnd := v_available_balance::integer;
  return new;
end;
$function$;

drop trigger if exists worker_withdrawal_payment_safety on public.worker_withdrawal_requests;
create trigger worker_withdrawal_payment_safety
before insert on public.worker_withdrawal_requests
for each row execute function private.enforce_worker_withdrawal_payment_safety();

create or replace function public.record_platform_bank_balance_snapshot(
  p_actor_id uuid,
  p_balance_vnd integer,
  p_observed_at timestamptz
)
returns table (
  snapshot_id uuid,
  balance_vnd integer,
  observed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_snapshot public.platform_bank_balance_snapshots%rowtype;
begin
  perform private.assert_finance_reconciler(p_actor_id);
  if p_balance_vnd is null or p_balance_vnd < 0 or p_observed_at is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  insert into public.platform_bank_balance_snapshots (
    account_key, balance_vnd, observed_at, entered_by
  ) values ('platform_secondary', p_balance_vnd, p_observed_at, p_actor_id)
  on conflict (account_key, observed_at) do update
    set balance_vnd = excluded.balance_vnd,
        entered_by = excluded.entered_by
  returning * into v_snapshot;
  return query select v_snapshot.id, v_snapshot.balance_vnd, v_snapshot.observed_at;
end;
$function$;

revoke all on function public.record_platform_bank_balance_snapshot(uuid, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_platform_bank_balance_snapshot(uuid, integer, timestamptz)
  to service_role;

create or replace function public.admin_finance_summary(
  p_actor_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_opening integer;
  v_closing integer;
  v_platform_incoming bigint;
  v_payout_outflow bigint;
  v_commission_accrued bigint;
  v_bank_commission_collected bigint;
  v_cash_commission_collected bigint;
  v_commission_collected bigint;
  v_commission_receivable bigint;
  v_worker_hold bigint;
  v_worker_available bigint;
  v_payout_pending bigint;
  v_direct_total bigint;
  v_expected_change bigint;
  v_actual_change bigint;
begin
  perform private.assert_finance_reconciler(p_actor_id);
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'INVALID_RANGE' using errcode = '22023';
  end if;

  select snapshot.balance_vnd into v_opening
  from public.platform_bank_balance_snapshots as snapshot
  where snapshot.account_key = 'platform_secondary'
    and snapshot.observed_at <= p_from
  order by snapshot.observed_at desc
  limit 1;
  select snapshot.balance_vnd into v_closing
  from public.platform_bank_balance_snapshots as snapshot
  where snapshot.account_key = 'platform_secondary'
    and snapshot.observed_at > p_from
    and snapshot.observed_at <= p_to
  order by snapshot.observed_at desc
  limit 1;

  select coalesce(sum(job.payment_amount_received), 0)::bigint into v_platform_incoming
  from public.jobs as job
  where job.payment_provider in ('platform_bank_manual', 'sepay_vietqr')
    and job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
    and job.payment_received_at >= p_from
    and job.payment_received_at < p_to;
  select coalesce(sum(request.amount_vnd), 0)::bigint into v_payout_outflow
  from public.worker_withdrawal_requests as request
  where request.status = 'paid'
    and request.processed_at >= p_from
    and request.processed_at < p_to;
  select coalesce(sum(job.platform_fee), 0)::bigint into v_commission_accrued
  from public.jobs as job
  where job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
    and job.paid_at >= p_from
    and job.paid_at < p_to;
  select coalesce(sum(job.platform_fee), 0)::bigint into v_bank_commission_collected
  from public.jobs as job
  where job.payment_provider in ('platform_bank_manual', 'sepay_vietqr')
    and job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
    and job.paid_at >= p_from
    and job.paid_at < p_to;
  select coalesce(sum(cash_ledger.cash_commission_collected + least(cash_ledger.cash_commission_due, coalesce((
    select sum(reconciliation.amount)
    from public.worker_cash_commission_reconciliations as reconciliation
    where reconciliation.cash_commission_ledger_id = cash_ledger.id
  ), 0)::integer)), 0)::bigint into v_cash_commission_collected
  from public.worker_cash_commission_ledger as cash_ledger
  where cash_ledger.confirmed_at >= p_from
    and cash_ledger.confirmed_at < p_to;
  v_commission_collected := greatest(0::bigint, v_bank_commission_collected + v_cash_commission_collected);
  v_commission_receivable := greatest(0::bigint, v_commission_accrued - v_commission_collected);
  select coalesce(sum(ledger.worker_net) filter (where ledger.payment_state = 'on_hold'), 0)::bigint
  into v_worker_hold
  from public.worker_payment_ledger as ledger;
  with worker_ids as (
    select worker_id from public.worker_payment_ledger
    union
    select worker_id from public.worker_cash_commission_ledger
    union
    select worker_id from public.worker_withdrawal_requests
    union
    select worker_id from public.worker_direct_payment_collateral_reservations
  ), worker_balances as (
    select
      worker.worker_id,
      coalesce((
        select sum(ledger.worker_net)
        from public.worker_payment_ledger as ledger
        where ledger.worker_id = worker.worker_id
          and ledger.payment_state = 'available'
      ), 0)::bigint as available_credits,
      coalesce((
        select sum(cash_ledger.cash_commission_collected + least(cash_ledger.cash_commission_due, coalesce((
          select sum(reconciliation.amount)
          from public.worker_cash_commission_reconciliations as reconciliation
          where reconciliation.cash_commission_ledger_id = cash_ledger.id
        ), 0)::integer))
        from public.worker_cash_commission_ledger as cash_ledger
        where cash_ledger.worker_id = worker.worker_id
      ), 0)::bigint as collected_commission,
      coalesce((
        select sum(request.amount_vnd)
        from public.worker_withdrawal_requests as request
        where request.worker_id = worker.worker_id
          and request.status in ('pending', 'processing', 'paid')
      ), 0)::bigint as reserved_or_paid_payout,
      coalesce((
        select sum(reservation.collateral_amount)
        from public.worker_direct_payment_collateral_reservations as reservation
        where reservation.worker_id = worker.worker_id
          and reservation.status = 'held'
      ), 0)::bigint as held_collateral
    from worker_ids as worker
  )
  select coalesce(sum(greatest(
    0::bigint,
    available_credits - collected_commission - reserved_or_paid_payout - held_collateral
  )), 0)::bigint
  into v_worker_available
  from worker_balances;
  select coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing')), 0)::bigint
  into v_payout_pending
  from public.worker_withdrawal_requests as request;
  select coalesce(sum(coalesce(job.payment_amount_received, job.gross_amount, job.final_price)), 0)::bigint into v_direct_total
  from public.jobs as job
  where job.payment_provider in ('direct_worker', 'cash')
    and job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
    and job.paid_at >= p_from
    and job.paid_at < p_to;

  v_expected_change := v_platform_incoming - v_payout_outflow;
  v_actual_change := case when v_opening is not null and v_closing is not null then v_closing::bigint - v_opening::bigint else null end;

  return pg_catalog.jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'platform_incoming', v_platform_incoming,
    'payout_outflow', v_payout_outflow,
    'commission_accrued', v_commission_accrued,
    'commission_collected', v_commission_collected,
    'commission_receivable', v_commission_receivable,
    'worker_hold', v_worker_hold,
    'worker_available', v_worker_available,
    'payout_pending', v_payout_pending,
    'direct_payment_total', v_direct_total,
    'opening_balance', v_opening,
    'closing_balance', v_closing,
    'expected_bank_change', case when v_actual_change is null then null else v_expected_change end,
    'actual_bank_change', v_actual_change,
    'unexplained_variance', case when v_actual_change is null then null else v_actual_change - v_expected_change end
  );
end;
$function$;

revoke all on function public.admin_finance_summary(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_finance_summary(uuid, timestamptz, timestamptz)
  to service_role;

commit;
