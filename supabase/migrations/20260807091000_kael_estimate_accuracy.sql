-- §50 K1.3: measured Kael estimate accuracy against final job price.

create or replace view public.kael_estimate_accuracy as
with per_job as (
  select
    j.id as job_id,
    j.service_type,
    j.kael_complexity as complexity,
    date_trunc('month', j.completed_at)::date as month,
    j.kael_price_min,
    j.kael_price_max,
    j.final_price,
    case
      when j.final_price < j.kael_price_min then 'under'
      when j.final_price > j.kael_price_max then 'over'
      else 'in_band'
    end as direction,
    case
      when j.final_price < j.kael_price_min
        then (j.kael_price_min - j.final_price)::numeric / greatest(j.kael_price_min, 1)
      when j.final_price > j.kael_price_max
        then (j.final_price - j.kael_price_max)::numeric / greatest(j.kael_price_max, 1)
      else 0::numeric
    end as miss_ratio
  from public.jobs j
  where j.status in ('completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed')
    and j.completed_at is not null
    and j.final_price is not null
    and j.final_price > 0
    and j.kael_price_min is not null
    and j.kael_price_max is not null
    and j.kael_price_min > 0
    and j.kael_price_max >= j.kael_price_min
    and j.kael_complexity is not null
)
select
  service_type,
  complexity,
  month,
  count(*)::bigint as job_count,
  count(*) filter (where direction = 'in_band')::bigint as in_band_count,
  round(
    count(*) filter (where direction = 'in_band')::numeric / nullif(count(*), 0),
    4
  ) as in_band_rate,
  count(*) filter (where direction = 'under')::bigint as under_count,
  count(*) filter (where direction = 'over')::bigint as over_count,
  percentile_cont(0.5) within group (order by miss_ratio) as median_miss_ratio,
  percentile_cont(0.9) within group (order by miss_ratio) as p90_miss_ratio
from per_job
group by service_type, complexity, month;

revoke all on public.kael_estimate_accuracy from public;
revoke all on public.kael_estimate_accuracy from anon;
revoke all on public.kael_estimate_accuracy from authenticated;
grant select on public.kael_estimate_accuracy to service_role;

comment on view public.kael_estimate_accuracy is
  'Admin-only monthly Kael estimate accuracy by service and complexity. under means final price was below Kael minimum; over means final price exceeded Kael maximum.';
