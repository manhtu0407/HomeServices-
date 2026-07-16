begin;

drop function if exists public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric);

create function public.get_worker_earnings_summary(
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
  pending_payment_count bigint,
  pending_payment_amount bigint,
  daily_earnings jsonb,
  from_date timestamptz,
  to_date timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
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
  with eligible_jobs as (
    select
      j.status::text as status,
      coalesce(j.final_price, 0)::bigint as final_price,
      j.gross_amount,
      j.platform_fee,
      j.worker_net,
      j.paid_at
    from public.jobs j
    where j.worker_id = p_worker_id
      and j.status::text in (
        'paid',
        'reviewed',
        'confirmed_by_customer',
        'payment_pending'
      )
      and (
        (
          j.paid_at is not null
          and (p_from is null or j.paid_at >= p_from)
          and (p_to is null or j.paid_at <= p_to)
        )
        or
        (
          j.paid_at is null
          and (p_from is null or j.created_at >= p_from)
          and (p_to is null or j.created_at <= p_to)
        )
      )
  ), paid_jobs as (
    select
      (paid_at at time zone 'Asia/Ho_Chi_Minh')::date as paid_date,
      coalesce(gross_amount, final_price)::bigint as paid_gross,
      coalesce(
        platform_fee,
        round(coalesce(gross_amount, final_price)::numeric * p_platform_fee_rate)
      )::bigint as paid_fee,
      worker_net
    from eligible_jobs
    where paid_at is not null
  ), daily_paid_jobs as (
    select
      paid_date,
      sum(paid_gross)::bigint as gross_earnings,
      sum(paid_fee)::bigint as platform_fee_total,
      sum(coalesce(worker_net, paid_gross - paid_fee))::bigint as net_earnings,
      count(*)::bigint as paid_job_count
    from paid_jobs
    group by paid_date
  ), bounded_daily_paid_jobs as (
    select *
    from daily_paid_jobs
    order by paid_date desc
    limit 366
  )
  select
    p_worker_id,
    (select count(*) from paid_jobs),
    coalesce((select sum(paid_gross) from paid_jobs), 0)::bigint,
    coalesce((select sum(paid_fee) from paid_jobs), 0)::bigint,
    coalesce((
      select sum(coalesce(worker_net, paid_gross - paid_fee))
      from paid_jobs
    ), 0)::bigint,
    (
      select count(*)
      from eligible_jobs
      where paid_at is null
        and status in ('confirmed_by_customer', 'payment_pending', 'reviewed')
    ),
    coalesce((
      select sum(final_price)
      from eligible_jobs
      where paid_at is null
        and status in ('confirmed_by_customer', 'payment_pending', 'reviewed')
    ), 0)::bigint,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', daily.paid_date,
          'gross_earnings', daily.gross_earnings,
          'platform_fee_total', daily.platform_fee_total,
          'net_earnings', daily.net_earnings,
          'paid_job_count', daily.paid_job_count
        )
        order by daily.paid_date desc
      )
      from bounded_daily_paid_jobs daily
    ), '[]'::jsonb),
    p_from,
    p_to;
end;
$$;

revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) from public;
revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) from anon;
revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) from authenticated;
grant execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) to service_role;

commit;
