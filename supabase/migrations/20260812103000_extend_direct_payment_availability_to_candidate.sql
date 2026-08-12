begin;

create or replace function public.get_direct_worker_payment_availability(
  p_job_id uuid,
  p_customer_id uuid
)
returns table (
  direct_payment_available boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_worker_id uuid;
  v_available_credits bigint;
  v_cash_commission_collected bigint;
  v_reserved_or_paid bigint;
  v_active_collateral bigint;
  v_available_balance bigint;
  v_collateral integer;
begin
  if p_job_id is null or p_customer_id is null then
    return query select false;
    return;
  end if;

  select job.* into v_job
  from public.jobs as job
  where job.id = p_job_id;

  if not found or v_job.customer_id is distinct from p_customer_id
    or v_job.final_price is null or v_job.final_price <= 0 then
    return query select false;
    return;
  end if;

  if v_job.status = 'payment_pending'::public.job_status then
    if not exists (
      select 1
      from public.job_payment_orders as payment_order
      where payment_order.job_id = v_job.id
        and payment_order.payment_method = 'platform_bank_manual'
        and payment_order.status = 'manual_qr_ready'
    ) then
      return query select false;
      return;
    end if;
    v_worker_id := v_job.worker_id;
  elsif v_job.status = 'worker_candidate_pending'::public.job_status then
    select candidate.worker_id into v_worker_id
    from public.job_worker_candidates as candidate
    where candidate.job_id = v_job.id
      and candidate.status = 'proposed'
    order by candidate.proposed_at desc
    limit 1;
  elsif v_job.status = 'confirmed_by_customer'::public.job_status then
    v_worker_id := v_job.worker_id;
  else
    return query select false;
    return;
  end if;

  if v_worker_id is null then
    return query select false;
    return;
  end if;

  select coalesce(sum(ledger.worker_net) filter (where ledger.payment_state = 'available'), 0)::bigint
  into v_available_credits
  from public.worker_payment_ledger as ledger
  where ledger.worker_id = v_worker_id;

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
  where cash_ledger.worker_id = v_worker_id;

  select coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing', 'paid')), 0)::bigint
  into v_reserved_or_paid
  from public.worker_withdrawal_requests as request
  where request.worker_id = v_worker_id;

  select coalesce(sum(reservation.collateral_amount) filter (where reservation.status = 'held'), 0)::bigint
  into v_active_collateral
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.worker_id = v_worker_id;

  v_collateral := round(v_job.final_price::numeric * 0.15);
  v_available_balance := greatest(
    0::bigint,
    v_available_credits - v_cash_commission_collected - v_reserved_or_paid - v_active_collateral
  );

  return query select v_collateral > 0 and v_job.final_price - v_collateral > 0 and v_available_balance >= v_collateral;
end;
$function$;

revoke all on function public.get_direct_worker_payment_availability(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_direct_worker_payment_availability(uuid, uuid)
  to service_role;

commit;
