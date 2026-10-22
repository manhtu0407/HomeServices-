begin;

CREATE OR REPLACE FUNCTION public.decide_manual_bank_payment_reconciliation(p_payment_order_id uuid, p_actor_id uuid, p_decision text, p_amount_received integer DEFAULT NULL::integer, p_credited_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_bank_reference_hash text DEFAULT NULL::text, p_bank_reference_suffix text DEFAULT NULL::text, p_reason_code text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, error_code text, outcome text, job_id uuid, status job_status, payment_status text, hold_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.job_payment_orders%rowtype;
  v_order_job_id uuid;
  v_job public.jobs%rowtype;
  v_reservation public.worker_direct_payment_collateral_reservations%rowtype;
  v_ledger public.worker_payment_ledger%rowtype;
  v_ledger_reopened boolean := false;
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
    ) on conflict on constraint worker_cash_commission_ledger_job_id_key do nothing;
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
  if found
    and v_order.status = 'manual_reconcile_required'
    and v_ledger.payment_provider = 'platform_bank_manual'
    and v_ledger.payment_state = 'reversed'
    and v_ledger.settlement_state = 'admin_rejected'
  then
    update public.worker_payment_ledger
    set payment_state = 'pending', settlement_state = 'customer_claimed', available_at = null, updated_at = v_now
    where id = v_ledger.id
    returning * into v_ledger;
    v_ledger_reopened := true;
  end if;
  if v_ledger.id is null
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
    pg_catalog.jsonb_build_object('worker_credit_hold_hours', 24, 'ledger_reopened', v_ledger_reopened));
  return query select true, null::text, 'paid'::text, v_job.id, 'paid'::public.job_status, 'manual_verified'::text, v_hold_until;
end;
$function$;

revoke all on function public.decide_manual_bank_payment_reconciliation(
  uuid, uuid, text, integer, timestamptz, text, text, text
)
from public, anon, authenticated;
grant execute on function public.decide_manual_bank_payment_reconciliation(
  uuid, uuid, text, integer, timestamptz, text, text, text
)
to service_role;

commit;
