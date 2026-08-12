begin;

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

  if v_job.status = 'payment_pending'::public.job_status then
    delete from public.worker_payment_ledger as ledger
    where ledger.job_id = v_job.id
      and ledger.payment_provider = 'platform_bank_manual'
      and ledger.payment_state = 'pending';
    if not found then
      return query select false, 'PAYMENT_METHOD_LOCKED'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz;
      return;
    end if;
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
)
select
  job.id,
  job.worker_id,
  'platform_bank_manual',
  'pending',
  job.gross_amount,
  job.platform_fee,
  job.worker_net,
  job.worker_commission_level,
  job.worker_commission_rate_bps
from public.job_payment_orders as payment_order
join public.jobs as job on job.id = payment_order.job_id
where payment_order.payment_method = 'platform_bank_manual'
  and payment_order.status = 'manual_qr_ready'
  and job.status = 'payment_pending'::public.job_status
  and job.payment_status = 'manual_qr_ready'
  and job.payment_provider = 'platform_bank_manual'
  and job.worker_id is not null
  and job.gross_amount is not null
  and job.gross_amount > 0
  and job.platform_fee is not null
  and job.platform_fee >= 0
  and job.worker_net is not null
  and job.worker_net > 0
  and job.gross_amount = job.platform_fee + job.worker_net
  and job.worker_commission_level is not null
  and job.worker_commission_level >= 1
  and job.worker_commission_rate_bps between 0 and 1500
on conflict (job_id) do nothing;

commit;
