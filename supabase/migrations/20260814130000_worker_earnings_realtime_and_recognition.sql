begin;

do $publication$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'worker_payment_ledger'
  ) then
    alter publication supabase_realtime add table public.worker_payment_ledger;
  end if;
end;
$publication$;

create or replace function public.get_worker_earnings_summary(
  p_worker_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_platform_fee_rate numeric default 0.10
)
returns table (
  worker_id uuid,
  total_jobs_paid bigint,
  gross_earnings bigint,
  platform_fee_total bigint,
  net_earnings bigint,
  available_balance bigint,
  cash_commission_collected_total bigint,
  cash_commission_due_total bigint,
  pending_payment_count bigint,
  pending_payment_amount bigint,
  on_hold_amount bigint,
  current_commission_level smallint,
  current_commission_rate_bps integer,
  recent_transactions jsonb,
  daily_earnings jsonb,
  from_date timestamptz,
  to_date timestamptz
)
language plpgsql
stable
set search_path = 'public', 'pg_catalog'
as $function$
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
      (
        job.status = 'paid'::public.job_status
        and job.payment_status in ('received', 'cash_confirmed', 'manual_verified', 'direct_paid')
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
      true as is_verified_credit,
      cash_ledger.confirmed_at as recorded_at
    from public.worker_cash_commission_ledger as cash_ledger
    left join public.jobs as job on job.id = cash_ledger.job_id
    cross join lateral (
      select least(
        cash_ledger.cash_commission_due::bigint,
        coalesce(sum(reconciliation.amount), 0)
      )::integer as amount
      from public.worker_cash_commission_reconciliations as reconciliation
      where reconciliation.cash_commission_ledger_id = cash_ledger.id
    ) as reconciliations
    where cash_ledger.worker_id = p_worker_id
  ), all_worker_transactions as (
    select * from all_worker_ledger
    union all
    select * from all_cash_ledger
  ), filtered_transactions as (
    select *
    from all_worker_transactions as transaction
    where (p_from is null or transaction.recorded_at >= p_from)
      and (p_to is null or transaction.recorded_at <= p_to)
  ), recognized_transactions as (
    select *
    from filtered_transactions as transaction
    where transaction.entry_type = 'cash_commission_debit'
      or (
        transaction.entry_type = 'worker_credit'
        and (
          transaction.payment_state = 'available'
          or (transaction.payment_state = 'on_hold' and transaction.is_verified_credit)
        )
      )
  ), available_credits as (
    select coalesce(sum(ledger.worker_net), 0)::bigint as amount
    from all_worker_ledger as ledger
    where ledger.payment_state = 'available'
  ), cash_commission_totals as (
    select
      coalesce(sum(cash_commission_collected), 0)::bigint as cash_commission_collected_total,
      coalesce(sum(cash_commission_due), 0)::bigint as cash_commission_due_total
    from all_cash_ledger
  ), daily_recognized as (
    select
      (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date as paid_date,
      sum(transaction.gross_amount)::bigint as gross_earnings,
      sum(transaction.platform_fee)::bigint as platform_fee_total,
      sum(transaction.worker_net)::bigint as net_earnings,
      count(*)::bigint as paid_job_count
    from recognized_transactions as transaction
    group by (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date
  ), recent_transactions as (
    select *
    from filtered_transactions as transaction
    order by transaction.recorded_at desc, transaction.id desc
    limit 20
  )
  select
    p_worker_id,
    coalesce((select count(*) from recognized_transactions), 0)::bigint,
    coalesce((select sum(gross_amount) from recognized_transactions), 0)::bigint,
    coalesce((select sum(platform_fee) from recognized_transactions), 0)::bigint,
    coalesce((select sum(worker_net) from recognized_transactions), 0)::bigint,
    greatest(0::bigint, available_credits.amount - cash_commission_totals.cash_commission_collected_total),
    cash_commission_totals.cash_commission_collected_total,
    cash_commission_totals.cash_commission_due_total,
    coalesce((select count(*) from all_worker_ledger as ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger as ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((
      select sum(ledger.worker_net)
      from all_worker_ledger as ledger
      where ledger.payment_state = 'on_hold'
        and ledger.is_verified_credit
    ), 0)::bigint,
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
      from recent_transactions as transaction
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
        select * from daily_recognized order by paid_date desc limit 366
      ) as daily
    ), '[]'::jsonb),
    p_from,
    p_to
  from current_tier as tier
  cross join available_credits
  cross join cash_commission_totals;
end;
$function$;

revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) to service_role;

commit;
