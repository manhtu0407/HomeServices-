begin;

-- The function's RETURNS TABLE column `payment_status` is a PL/pgSQL variable.
-- Qualifying the selected job columns prevents PostgreSQL from treating it as
-- ambiguous during a Worker cash confirmation.
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
set search_path = public, pg_catalog
as $function$
declare
  v_job record;
  v_cash_ledger record;
  v_tier record;
  v_worker record;
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
    from public.worker_cash_commission_ledger
    where job_id = v_job.id
      and worker_id = p_worker_id
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

  select id into v_worker
  from public.worker_profiles
  where id = p_worker_id
    and is_approved is true
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

revoke all on function public.confirm_worker_cash_payment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_worker_cash_payment(uuid, uuid)
  to service_role;

commit;
