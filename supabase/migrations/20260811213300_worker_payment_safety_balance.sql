create or replace function public.get_worker_payment_safety_balance(
  p_worker_id uuid
)
returns table (
  available_balance bigint,
  withdrawal_reserved_amount bigint,
  withdrawn_total bigint,
  collateral_reserved_amount bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_available_credits bigint;
  v_cash_commission_collected bigint;
  v_withdrawal_reserved bigint;
  v_withdrawn bigint;
  v_collateral_reserved bigint;
begin
  if p_worker_id is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;

  select coalesce(sum(ledger.worker_net) filter (where ledger.payment_state = 'available'), 0)::bigint
  into v_available_credits
  from public.worker_payment_ledger as ledger
  where ledger.worker_id = p_worker_id;

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
  where cash_ledger.worker_id = p_worker_id;

  select
    coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing')), 0)::bigint,
    coalesce(sum(request.amount_vnd) filter (where request.status = 'paid'), 0)::bigint
  into v_withdrawal_reserved, v_withdrawn
  from public.worker_withdrawal_requests as request
  where request.worker_id = p_worker_id;

  select coalesce(sum(reservation.collateral_amount) filter (where reservation.status = 'held'), 0)::bigint
  into v_collateral_reserved
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.worker_id = p_worker_id;

  return query select
    greatest(0::bigint, v_available_credits - v_cash_commission_collected - v_withdrawal_reserved - v_withdrawn - v_collateral_reserved),
    v_withdrawal_reserved,
    v_withdrawn,
    v_collateral_reserved;
end;
$function$;

revoke all on function public.get_worker_payment_safety_balance(uuid)
  from public, anon, authenticated;
grant execute on function public.get_worker_payment_safety_balance(uuid)
  to service_role;
