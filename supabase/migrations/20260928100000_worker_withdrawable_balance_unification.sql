begin;

-- One owner for the worker's withdrawable balance. Before this migration six functions each
-- carried their own copy of the formula and they disagreed: the earnings screen ignored
-- direct-payment collateral, the withdrawal RPC ignored it too while its trigger did not, and
-- the admin overview added admin worker credits that no worker path could ever withdraw.
-- Every consumer below now reads the same components from private.worker_withdrawable_balance.
-- select_direct_worker_payment keeps its private copy: direct payment is retired and no role
-- can execute it (20260905100000).

create or replace function private.worker_withdrawable_balance(p_worker_id uuid)
returns table (
  ledger_available_vnd bigint,
  admin_credit_vnd bigint,
  bonus_available_vnd bigint,
  cash_commission_vnd bigint,
  collateral_reserved_vnd bigint,
  pending_withdrawals_vnd bigint,
  paid_withdrawals_vnd bigint,
  withdrawable_vnd bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_ledger bigint;
  v_admin_credit bigint;
  v_bonus bigint := 0;
  v_cash_commission bigint;
  v_collateral bigint;
  v_pending bigint;
  v_paid bigint;
begin
  if p_worker_id is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;

  select coalesce(sum(ledger.worker_net), 0)::bigint
  into v_ledger
  from public.worker_payment_ledger as ledger
  where ledger.worker_id = p_worker_id
    and ledger.payment_state = 'available'
    and ledger.settlement_state <> 'admin_rejected';

  select coalesce(sum(adjustment.worker_credit_vnd), 0)::bigint
  into v_admin_credit
  from public.admin_financial_adjustments as adjustment
  where adjustment.worker_id = p_worker_id
    and adjustment.adjustment_type = 'worker_credit'
    and adjustment.realization_status = 'completed';

  select coalesce(sum(
    cash_ledger.cash_commission_collected
    + least(cash_ledger.cash_commission_due, coalesce((
      select sum(reconciliation.amount)
      from public.worker_cash_commission_reconciliations as reconciliation
      where reconciliation.cash_commission_ledger_id = cash_ledger.id
    ), 0)::integer)
  ), 0)::bigint
  into v_cash_commission
  from public.worker_cash_commission_ledger as cash_ledger
  where cash_ledger.worker_id = p_worker_id;

  select coalesce(sum(reservation.collateral_amount) filter (where reservation.status = 'held'), 0)::bigint
  into v_collateral
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.worker_id = p_worker_id;

  select
    coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing')), 0)::bigint,
    coalesce(sum(request.amount_vnd) filter (where request.status = 'paid'), 0)::bigint
  into v_pending, v_paid
  from public.worker_withdrawal_requests as request
  where request.worker_id = p_worker_id;

  return query select
    v_ledger,
    v_admin_credit,
    v_bonus,
    v_cash_commission,
    v_collateral,
    v_pending,
    v_paid,
    greatest(0::bigint, v_ledger + v_admin_credit + v_bonus - v_cash_commission - v_collateral - v_pending - v_paid);
end;
$function$;

revoke all on function private.worker_withdrawable_balance(uuid) from public, anon, authenticated;
grant execute on function private.worker_withdrawable_balance(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.get_worker_payment_safety_balance(p_worker_id uuid)
 RETURNS TABLE(available_balance bigint, withdrawal_reserved_amount bigint, withdrawn_total bigint, collateral_reserved_amount bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if p_worker_id is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;

  return query
  select balance.withdrawable_vnd,
    balance.pending_withdrawals_vnd,
    balance.paid_withdrawals_vnd,
    balance.collateral_reserved_vnd
  from private.worker_withdrawable_balance(p_worker_id) as balance;
end;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_worker_withdrawal_payment_safety()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
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

  select balance.withdrawable_vnd
  into v_available_balance
  from private.worker_withdrawable_balance(new.worker_id) as balance;
  if new.amount_vnd::bigint > v_available_balance then
    raise exception 'INSUFFICIENT_PAYMENT_SAFE_BALANCE' using errcode = 'P0001';
  end if;
  new.available_balance_before_vnd := v_available_balance::integer;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_worker_withdrawal_request(p_worker_id uuid, p_amount_vnd integer, p_client_request_id uuid)
 RETURNS TABLE(ok boolean, error_code text, request_id uuid, status_out text, amount_vnd_out integer, available_balance_before_vnd_out integer, bank_key_out text, bank_name_out text, bank_account_masked_out text, requested_at_out timestamp with time zone, updated_at_out timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_worker public.worker_profiles%rowtype;
  v_method public.worker_payout_methods%rowtype;
  v_request public.worker_withdrawal_requests%rowtype;
  v_available_balance bigint := 0;
begin
  if p_worker_id is null or p_client_request_id is null
     or p_amount_vnd is null or p_amount_vnd <= 0 or p_amount_vnd > 1000000000
  then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select worker.*
  into v_worker
  from public.worker_profiles as worker
  join public.profiles as profile on profile.id = worker.id
  where worker.id = p_worker_id
    and profile.role = 'worker'::public.user_role
  for update;

  if not found then
    return query select false, 'WORKER_NOT_FOUND'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_worker.is_suspended or not v_worker.is_approved or v_worker.verification_status <> 'approved'::public.worker_verification_status then
    return query select false, 'WORKER_NOT_ELIGIBLE'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_worker_id::text, 0));

  select request.*
  into v_request
  from public.worker_withdrawal_requests as request
  where request.worker_id = p_worker_id
    and request.client_request_id = p_client_request_id
  for update;

  if found then
    if v_request.amount_vnd <> p_amount_vnd then
      return query select false, 'CLIENT_REQUEST_MISMATCH'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
      return;
    end if;
    return query select
      true,
      null::text,
      v_request.id,
      v_request.status,
      v_request.amount_vnd,
      v_request.available_balance_before_vnd,
      v_request.bank_key,
      v_request.bank_name,
      v_request.bank_account_masked,
      v_request.requested_at,
      v_request.updated_at;
    return;
  end if;

  select method.*
  into v_method
  from public.worker_payout_methods as method
  where method.worker_id = p_worker_id
    and method.is_default
  for update;

  if not found then
    return query select false, 'PAYOUT_METHOD_MISSING'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_method.status <> 'verified' then
    return query select false, 'PAYOUT_METHOD_NOT_VERIFIED'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select balance.withdrawable_vnd
  into v_available_balance
  from private.worker_withdrawable_balance(p_worker_id) as balance;
  if p_amount_vnd::bigint > v_available_balance then
    return query select false, 'INSUFFICIENT_BALANCE'::text, null::uuid, null::text, null::integer, v_available_balance::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  insert into public.worker_withdrawal_requests (
    worker_id,
    payout_method_id,
    client_request_id,
    amount_vnd,
    available_balance_before_vnd,
    bank_key,
    bank_name,
    account_holder_name,
    bank_account,
    bank_account_masked,
    status
  ) values (
    p_worker_id,
    v_method.id,
    p_client_request_id,
    p_amount_vnd,
    v_available_balance::integer,
    v_method.bank_key,
    v_method.bank_name,
    v_method.account_holder_name,
    v_method.bank_account,
    v_method.bank_account_masked,
    'pending'
  ) returning * into v_request;

  insert into public.kael_permission_audit (
    actor_id,
    actor_role,
    purpose,
    action,
    topic,
    decision,
    reason_code,
    safe_metadata
  ) values (
    p_worker_id,
    'worker',
    'worker_withdrawal_request',
    'create',
    'manual_payout',
    'allow',
    'withdrawal_requested',
    pg_catalog.jsonb_build_object(
      'withdrawal_request_id', v_request.id,
      'amount_vnd', v_request.amount_vnd,
      'payout_method_id', v_method.id,
      'bank_key', v_method.bank_key
    )
  );

  return query select
    true,
    null::text,
    v_request.id,
    v_request.status,
    v_request.amount_vnd,
    v_request.available_balance_before_vnd,
    v_request.bank_key,
    v_request.bank_name,
    v_request.bank_account_masked,
    v_request.requested_at,
    v_request.updated_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_worker_earnings_summary_v2(p_worker_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_platform_fee_rate numeric DEFAULT 0.10)
 RETURNS TABLE(worker_id uuid, total_jobs_paid bigint, gross_earnings bigint, platform_fee_total bigint, net_earnings bigint, available_balance bigint, withdrawal_reserved_amount bigint, withdrawn_total bigint, cash_commission_collected_total bigint, cash_commission_due_total bigint, pending_payment_count bigint, pending_payment_amount bigint, provisional_payment_count bigint, provisional_payment_amount bigint, on_hold_amount bigint, current_commission_level smallint, current_commission_rate_bps integer, withdrawal_eligible_at timestamp with time zone, recent_transactions jsonb, daily_earnings jsonb, from_date timestamp with time zone, to_date timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if p_worker_id is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'invalid earnings range' using errcode = '22023';
  end if;
  if p_platform_fee_rate is null or p_platform_fee_rate < 0 or p_platform_fee_rate > 1 then
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
      ledger.settlement_state,
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
      (ledger.settlement_state = 'admin_verified'
        or (job.status = 'paid'::public.job_status and job.payment_status in ('received', 'cash_confirmed', 'manual_verified', 'direct_paid'))
      ) as is_verified_credit,
      coalesce(job.paid_at, ledger.available_at, ledger.created_at) as recorded_at
    from public.worker_payment_ledger as ledger
    left join public.jobs as job on job.id = ledger.job_id
    where ledger.worker_id = p_worker_id
  ), all_cash_ledger as (
    select
      cash_ledger.id,
      cash_ledger.job_id,
      'cash_commission_debit'::text as entry_type,
      case when cash_ledger.cash_commission_due = reconciliations.amount then 'cash_collected'::text else 'cash_reconciliation_due'::text end as payment_state,
      'admin_verified'::text as settlement_state,
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
      true as is_verified_credit,
      cash_ledger.confirmed_at as recorded_at
    from public.worker_cash_commission_ledger as cash_ledger
    left join public.jobs as job on job.id = cash_ledger.job_id
    cross join lateral (
      select least(cash_ledger.cash_commission_due::bigint, coalesce(sum(reconciliation.amount), 0))::integer as amount
      from public.worker_cash_commission_reconciliations as reconciliation
      where reconciliation.cash_commission_ledger_id = cash_ledger.id
    ) as reconciliations
    where cash_ledger.worker_id = p_worker_id
  ), all_worker_transactions as (
    select * from all_worker_ledger
    union all
    select * from all_cash_ledger
  ), filtered_transactions as (
    select * from all_worker_transactions as transaction
    where (p_from is null or transaction.recorded_at >= p_from)
      and (p_to is null or transaction.recorded_at <= p_to)
  ), recognized_transactions as (
    select * from filtered_transactions as transaction
    where transaction.entry_type = 'cash_commission_debit'
      or (transaction.entry_type = 'worker_credit' and (transaction.payment_state = 'available' or (transaction.payment_state = 'on_hold' and transaction.is_verified_credit)))
  ), provisional_transactions as (
    select * from filtered_transactions as transaction
    where transaction.entry_type = 'worker_credit'
      and transaction.settlement_state = 'customer_claimed'
      and transaction.payment_state = 'pending'
  ), cash_commission_totals as (
    select coalesce(sum(cash_commission_collected), 0)::bigint as cash_commission_collected_total,
      coalesce(sum(cash_commission_due), 0)::bigint as cash_commission_due_total
    from all_cash_ledger
  ), withdrawal_totals as (
    select coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing')), 0)::bigint as withdrawal_reserved_amount,
      coalesce(sum(request.amount_vnd) filter (where request.status = 'paid'), 0)::bigint as withdrawn_total,
      min(request.eligible_at) filter (where request.status in ('pending', 'processing') and request.eligible_at > pg_catalog.statement_timestamp()) as withdrawal_eligible_at
    from public.worker_withdrawal_requests as request
    where request.worker_id = p_worker_id
  ), daily_recognized as (
    select (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date as paid_date,
      sum(transaction.gross_amount)::bigint as gross_earnings,
      sum(transaction.platform_fee)::bigint as platform_fee_total,
      sum(transaction.worker_net)::bigint as net_earnings,
      count(*)::bigint as paid_job_count
    from recognized_transactions as transaction
    where transaction.entry_type = 'worker_credit'
    group by (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date
  ), recent_transactions as (
    select * from filtered_transactions as transaction
    order by transaction.recorded_at desc, transaction.id desc
    limit 20
  )
  select
    p_worker_id,
    coalesce((select count(*) from recognized_transactions where entry_type = 'worker_credit'), 0)::bigint,
    coalesce((select sum(gross_amount) from recognized_transactions where entry_type = 'worker_credit'), 0)::bigint,
    coalesce((select sum(platform_fee) from recognized_transactions where entry_type = 'worker_credit'), 0)::bigint,
    coalesce((select sum(worker_net) from recognized_transactions where entry_type = 'worker_credit'), 0)::bigint,
    balance.withdrawable_vnd,
    withdrawal_totals.withdrawal_reserved_amount,
    withdrawal_totals.withdrawn_total,
    cash_commission_totals.cash_commission_collected_total,
    cash_commission_totals.cash_commission_due_total,
    coalesce((select count(*) from all_worker_ledger as ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger as ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select count(*) from provisional_transactions), 0)::bigint,
    coalesce((select sum(transaction.worker_net) from provisional_transactions as transaction), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger as ledger where ledger.payment_state = 'on_hold' and ledger.is_verified_credit), 0)::bigint,
    tier.commission_level,
    tier.commission_rate_bps,
    withdrawal_totals.withdrawal_eligible_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'job_id', transaction.job_id,
      'display_code', transaction.display_code,
      'entry_type', transaction.entry_type,
      'payment_state', transaction.payment_state,
      'settlement_state', transaction.settlement_state,
      'gross_amount', transaction.gross_amount,
      'platform_fee', transaction.platform_fee,
      'worker_net', transaction.worker_net,
      'commission_level', transaction.commission_level,
      'commission_rate_bps', transaction.commission_rate_bps,
      'cash_commission_collected', transaction.cash_commission_collected,
      'cash_commission_due', transaction.cash_commission_due,
      'recorded_at', transaction.recorded_at,
      'available_at', transaction.available_at
    ) order by transaction.recorded_at desc, transaction.id desc) from recent_transactions as transaction), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'date', daily.paid_date,
      'gross_earnings', daily.gross_earnings,
      'platform_fee_total', daily.platform_fee_total,
      'net_earnings', daily.net_earnings,
      'paid_job_count', daily.paid_job_count
    ) order by daily.paid_date desc) from (select * from daily_recognized order by paid_date desc limit 366) as daily), '[]'::jsonb),
    p_from,
    p_to
  from current_tier as tier
  cross join cash_commission_totals
  cross join withdrawal_totals
  cross join private.worker_withdrawable_balance(p_worker_id) as balance;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_finance_overview(p_actor_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_bucket text DEFAULT 'day'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_previous_from timestamptz;
  v_current jsonb;
  v_previous jsonb;
  v_series jsonb;
  v_payment_breakdown jsonb;
  v_service_breakdown jsonb;
  v_worker_hold bigint;
  v_worker_available bigint;
  v_payout_pending bigint;
  v_opening integer;
  v_closing integer;
  v_tax jsonb;
  v_bucket_interval interval;
  v_local_start timestamp;
  v_local_last timestamp;
begin
  perform private.assert_finance_reader(p_actor_id);

  if p_from is null or p_to is null or p_from >= p_to
    or p_to - p_from > interval '366 days'
    or p_bucket not in ('hour', 'day', 'month') then
    raise exception 'INVALID_FINANCE_RANGE' using errcode = '22023';
  end if;

  v_previous_from := p_from - (p_to - p_from);
  v_current := private.admin_finance_period_snapshot(p_from, p_to, null);
  v_previous := private.admin_finance_period_snapshot(v_previous_from, p_from, null);
  v_bucket_interval := case p_bucket
    when 'hour' then interval '1 hour'
    when 'day' then interval '1 day'
    else interval '1 month'
  end;
  v_local_start := pg_catalog.date_trunc(p_bucket, p_from at time zone 'Asia/Ho_Chi_Minh');
  v_local_last := pg_catalog.date_trunc(p_bucket, (p_to - interval '1 microsecond') at time zone 'Asia/Ho_Chi_Minh');

  with bucket_snapshots as (
    select
      greatest(p_from, bucket.local_from at time zone 'Asia/Ho_Chi_Minh') as bucket_from,
      least(p_to, (bucket.local_from + v_bucket_interval) at time zone 'Asia/Ho_Chi_Minh') as bucket_to,
      private.admin_finance_period_snapshot(
        greatest(p_from, bucket.local_from at time zone 'Asia/Ho_Chi_Minh'),
        least(p_to, (bucket.local_from + v_bucket_interval) at time zone 'Asia/Ho_Chi_Minh'),
        null
      ) as metrics
    from pg_catalog.generate_series(v_local_start, v_local_last, v_bucket_interval) as bucket(local_from)
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'bucket_start', snapshot.bucket_from,
    'bucket_end', snapshot.bucket_to,
    'gmv_vnd', (snapshot.metrics->>'gmv')::bigint,
    'commission_collected_vnd', (snapshot.metrics->>'commission_collected')::bigint,
    'paid_jobs', (snapshot.metrics->>'paid_job_count')::bigint,
    'data_quality', case when (snapshot.metrics->>'missing_paid_financial_rows')::bigint = 0 then 'available' else 'partial' end,
    'unavailable_reason', case when (snapshot.metrics->>'missing_paid_financial_rows')::bigint = 0 then null else 'PAID_FINANCIALS_PARTIAL' end
  ) order by snapshot.bucket_from), '[]'::jsonb)
  into v_series
  from bucket_snapshots as snapshot;

  with paid_jobs as (
    select
      coalesce(payment_order.payment_method, job.payment_provider, 'unknown') as payment_method,
      coalesce(job.gross_amount, job.payment_amount_received, job.final_price)::bigint as gross_amount,
      job.gross_amount is null or job.platform_fee is null or job.worker_net is null as is_partial
    from public.jobs as job
    left join public.job_payment_orders as payment_order on payment_order.job_id = job.id
    where private.is_real_finance_transaction(job)
      and job.paid_at >= p_from and job.paid_at < p_to
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'payment_method', grouped.payment_method,
    'gmv_vnd', grouped.gmv,
    'paid_jobs', grouped.paid_job_count,
    'share_percent', case when (v_current->>'gmv')::bigint = 0 then 0 else
      pg_catalog.round(grouped.gmv::numeric * 100 / (v_current->>'gmv')::numeric, 2) end,
    'data_quality', case when grouped.is_partial then 'partial' else 'available' end,
    'unavailable_reason', case when grouped.is_partial then 'PAID_FINANCIALS_PARTIAL' else null end
  ) order by grouped.payment_method), '[]'::jsonb)
  into v_payment_breakdown
  from (
    select payment_method, coalesce(sum(gross_amount), 0)::bigint as gmv,
      count(*)::bigint as paid_job_count, bool_or(is_partial) as is_partial
    from paid_jobs group by payment_method
  ) as grouped;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'service_type', grouped.service_type,
    'gmv_vnd', (grouped.metrics->>'gmv')::bigint,
    'commission_collected_vnd', (grouped.metrics->>'commission_collected')::bigint,
    'paid_jobs', (grouped.metrics->>'paid_job_count')::bigint,
    'data_quality', case when (grouped.metrics->>'missing_paid_financial_rows')::bigint = 0 then 'available' else 'partial' end,
    'unavailable_reason', case when (grouped.metrics->>'missing_paid_financial_rows')::bigint = 0 then null else 'PAID_FINANCIALS_PARTIAL' end
  ) order by grouped.service_type), '[]'::jsonb)
  into v_service_breakdown
  from (
    select job.service_type::text as service_type,
      private.admin_finance_period_snapshot(p_from, p_to, job.service_type) as metrics
    from public.jobs as job
    where private.is_real_finance_transaction(job)
      and job.paid_at >= p_from and job.paid_at < p_to
    group by job.service_type
  ) as grouped;

  select coalesce(sum(ledger.worker_net) filter (where ledger.payment_state = 'on_hold'), 0)::bigint
  into v_worker_hold
  from public.worker_payment_ledger as ledger where private.synthetic_job_cohort(ledger.job_id) is null and private.synthetic_profile_cohort(ledger.worker_id) is null;

  with worker_ids as (
    select worker_id from public.worker_payment_ledger
    union select worker_id from public.worker_cash_commission_ledger
    union select worker_id from public.worker_withdrawal_requests
    union select worker_id from public.worker_direct_payment_collateral_reservations
    union select worker_id from public.admin_financial_adjustments where worker_id is not null
  )
  select coalesce(sum(balance.withdrawable_vnd), 0)::bigint
  into v_worker_available
  from worker_ids as worker
  cross join lateral private.worker_withdrawable_balance(worker.worker_id) as balance
  where private.synthetic_profile_cohort(worker.worker_id) is null;

  select coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing')), 0)::bigint
  into v_payout_pending
  from public.worker_withdrawal_requests as request where request.synthetic_cohort_id is null and private.synthetic_profile_cohort(request.worker_id) is null;

  select snapshot.balance_vnd into v_opening
  from public.platform_bank_balance_snapshots as snapshot
  where snapshot.account_key = 'platform_secondary' and snapshot.observed_at <= p_from
  order by snapshot.observed_at desc limit 1;
  select snapshot.balance_vnd into v_closing
  from public.platform_bank_balance_snapshots as snapshot
  where snapshot.account_key = 'platform_secondary'
    and snapshot.observed_at > p_from and snapshot.observed_at <= p_to
  order by snapshot.observed_at desc limit 1;

  with applicable_rules as (
    select policy.id as policy_id, policy.version, policy.policy_key, rule.tax_code,
      rule.label, rule.calculation_basis, rule.rate_bps, rule.service_type,
      greatest(p_from, policy.effective_from::timestamp at time zone 'Asia/Ho_Chi_Minh') as rule_from,
      least(
        p_to,
        coalesce((policy.effective_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh', p_to)
      ) as rule_to
    from public.admin_finance_tax_policies as policy
    join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
    where policy.status in ('approved', 'retired')
      and policy.effective_from <= ((p_to - interval '1 microsecond') at time zone 'Asia/Ho_Chi_Minh')::date
      and coalesce(policy.effective_to, 'infinity'::date) >= (p_from at time zone 'Asia/Ho_Chi_Minh')::date
  ), calculated as (
    select applicable.*,
      private.admin_finance_period_snapshot(applicable.rule_from, applicable.rule_to, applicable.service_type) as metrics
    from applicable_rules as applicable
    where applicable.rule_from < applicable.rule_to
  ), estimates as (
    select calculated.*,
      case calculated.calculation_basis
        when 'gmv' then (calculated.metrics->>'gmv')::bigint
        when 'commission_collected' then (calculated.metrics->>'commission_collected')::bigint
        when 'commission_retained' then (calculated.metrics->>'commission_retained')::bigint
        when 'platform_commission' then (calculated.metrics->>'commission_retained')::bigint
        when 'worker_net' then (calculated.metrics->>'worker_net_paid')::bigint
        -- Bonus withholding applies to redeemed rewards (worker_bonus_redemptions, created in
        -- 20260928112000), never to job income: the basis is what was actually withheld against.
        when 'worker_bonus' then (
          select coalesce(sum(redemption.reward_vnd), 0)::bigint
          from public.worker_bonus_redemptions as redemption
          where redemption.tax_policy_id = calculated.policy_id
            and redemption.tax_withheld_vnd > 0
            and redemption.created_at >= calculated.rule_from
            and redemption.created_at < calculated.rule_to
        )
        else (calculated.metrics->>'worker_net_paid')::bigint
      end as basis_vnd
    from calculated
  )
  select case when count(*) = 0 then
    pg_catalog.jsonb_build_object('status', 'unconfigured', 'estimated_vnd', null, 'rules', '[]'::jsonb)
  else pg_catalog.jsonb_build_object(
    'status', 'estimated',
    'estimated_vnd', sum(pg_catalog.round(estimates.basis_vnd::numeric * estimates.rate_bps / 10000.0))::bigint,
    'rules', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'policy_id', estimates.policy_id,
      'policy_key', estimates.policy_key,
      'version', estimates.version,
      'tax_code', estimates.tax_code,
      'label', estimates.label,
      'calculation_basis', estimates.calculation_basis,
      'basis_vnd', estimates.basis_vnd,
      'rate_bps', estimates.rate_bps,
      'estimated_vnd', pg_catalog.round(estimates.basis_vnd::numeric * estimates.rate_bps / 10000.0)::bigint
    ) order by estimates.policy_key, estimates.version, estimates.tax_code)
  ) end
  into v_tax
  from estimates;

  return pg_catalog.jsonb_build_object(
    'range', pg_catalog.jsonb_build_object('from', p_from, 'to', p_to, 'timezone', 'Asia/Ho_Chi_Minh', 'bucket', p_bucket),
    'metrics', v_current,
    'previous_period', pg_catalog.jsonb_build_object('from', v_previous_from, 'to', p_from, 'metrics', v_previous),
    'comparison', pg_catalog.jsonb_build_object(
      'gmv_delta', (v_current->>'gmv')::bigint - (v_previous->>'gmv')::bigint,
      'gmv_percent', case when (v_previous->>'gmv')::bigint = 0 then null else
        pg_catalog.round((((v_current->>'gmv')::numeric - (v_previous->>'gmv')::numeric) * 100) / (v_previous->>'gmv')::numeric, 2) end,
      'paid_job_count_delta', (v_current->>'paid_job_count')::bigint - (v_previous->>'paid_job_count')::bigint,
      'commission_retained_delta', (v_current->>'commission_retained')::bigint - (v_previous->>'commission_retained')::bigint,
      'net_cash_flow_delta', (v_current->>'net_cash_flow')::bigint - (v_previous->>'net_cash_flow')::bigint
    ),
    'series', v_series,
    'payment_method_breakdown', v_payment_breakdown,
    'service_breakdown', v_service_breakdown,
    'current_worker_balances', pg_catalog.jsonb_build_object(
      'as_of', pg_catalog.statement_timestamp(),
      'on_hold', v_worker_hold,
      'available', v_worker_available,
      'payout_pending', v_payout_pending
    ),
    'bank_reconciliation', pg_catalog.jsonb_build_object(
      'opening_balance', v_opening,
      'closing_balance', v_closing,
      'expected_change', case when v_opening is null or v_closing is null then null else
        (v_current->>'platform_incoming')::bigint - (v_current->>'payout_outflow')::bigint - (v_current->>'refund_outflow')::bigint end,
      'actual_change', case when v_opening is null or v_closing is null then null else v_closing::bigint - v_opening::bigint end,
      'unexplained_variance', case when v_opening is null or v_closing is null then null else
        (v_closing::bigint - v_opening::bigint)
        - ((v_current->>'platform_incoming')::bigint - (v_current->>'payout_outflow')::bigint - (v_current->>'refund_outflow')::bigint) end
    ),
    'tax', v_tax,
    'data_quality', pg_catalog.jsonb_build_object(
      'paid_financials', case when (v_current->>'missing_paid_financial_rows')::bigint = 0 then 'complete' else 'partial' end,
      'bank_snapshots', case when v_opening is not null and v_closing is not null then 'complete' else 'missing' end,
      'kael_spend', case when (v_current->>'kael_spend_record_count')::bigint > 0 then 'recorded' else 'no_records' end,
      'tax_policy', v_tax->>'status',
      'adjustments', 'completed_only'
    )
  );
end;
$function$;

commit;
