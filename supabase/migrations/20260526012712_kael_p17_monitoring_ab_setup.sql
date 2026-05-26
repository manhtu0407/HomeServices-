-- P17 Kael Harness: staging monitoring dashboards + A/B test #6 setup.
--
-- This migration creates the data contract for D28 without changing customer
-- price behavior. It starts collection for 100 real/synthetic-approved staging
-- cases and exposes admin-only dashboard views over existing provider logs and
-- explicit A/B sample rows.

create table if not exists public.kael_ab_experiments (
  id uuid primary key default gen_random_uuid(),
  experiment_key text not null unique check (char_length(experiment_key) between 8 and 120),
  purpose text not null check (purpose = 'price_synthesis'),
  status text not null default 'running' check (status in ('draft', 'running', 'paused', 'completed', 'cancelled')),
  primary_provider public.api_provider not null,
  comparison_provider public.api_provider not null,
  fallback_provider public.api_provider,
  sample_target integer not null default 100 check (sample_target > 0),
  metric_thresholds jsonb not null default '{}'::jsonb check (jsonb_typeof(metric_thresholds) = 'object'),
  started_at timestamptz,
  ended_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kael_ab_experiments_provider_pair check (primary_provider <> comparison_provider)
);

create table if not exists public.kael_ab_price_synthesis_cases (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.kael_ab_experiments(id) on delete cascade,
  case_key text not null check (char_length(case_key) between 4 and 160),
  job_id uuid references public.jobs(id) on delete set null,
  request_id text,
  source text not null check (source in ('live_staging', 'p15_replay', 'manual_shadow', 'future_actual')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'excluded')),
  service_type public.service_type,
  problem_slug text,
  district_code text,
  perplexity_schema_valid boolean,
  anthropic_schema_valid boolean,
  perplexity_price_min integer check (perplexity_price_min is null or perplexity_price_min >= 0),
  perplexity_price_max integer check (perplexity_price_max is null or perplexity_price_max >= 0),
  anthropic_price_min integer check (anthropic_price_min is null or anthropic_price_min >= 0),
  anthropic_price_max integer check (anthropic_price_max is null or anthropic_price_max >= 0),
  actual_final_price integer check (actual_final_price is null or actual_final_price > 0),
  fallback_used boolean not null default false,
  exclusion_reason text,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kael_ab_price_synthesis_cases_unique_key unique (experiment_id, case_key),
  constraint kael_ab_price_synthesis_cases_perplexity_range check (
    perplexity_price_min is null
    or perplexity_price_max is null
    or perplexity_price_max >= perplexity_price_min
  ),
  constraint kael_ab_price_synthesis_cases_anthropic_range check (
    anthropic_price_min is null
    or anthropic_price_max is null
    or anthropic_price_max >= anthropic_price_min
  )
);

create index if not exists kael_ab_experiments_status_idx
  on public.kael_ab_experiments (status, started_at desc);

create index if not exists kael_ab_price_synthesis_cases_experiment_idx
  on public.kael_ab_price_synthesis_cases (experiment_id, status, created_at desc);

create index if not exists kael_ab_price_synthesis_cases_job_idx
  on public.kael_ab_price_synthesis_cases (job_id)
  where job_id is not null;

alter table public.kael_ab_experiments enable row level security;
alter table public.kael_ab_price_synthesis_cases enable row level security;

drop trigger if exists kael_ab_experiments_updated_at on public.kael_ab_experiments;
create trigger kael_ab_experiments_updated_at
  before update on public.kael_ab_experiments
  for each row execute function public.update_updated_at();

drop trigger if exists kael_ab_price_synthesis_cases_updated_at on public.kael_ab_price_synthesis_cases;
create trigger kael_ab_price_synthesis_cases_updated_at
  before update on public.kael_ab_price_synthesis_cases
  for each row execute function public.update_updated_at();

drop policy if exists "Admins read kael ab experiments" on public.kael_ab_experiments;
create policy "Admins read kael ab experiments"
  on public.kael_ab_experiments for select
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins read kael ab price synthesis cases" on public.kael_ab_price_synthesis_cases;
create policy "Admins read kael ab price synthesis cases"
  on public.kael_ab_price_synthesis_cases for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_ab_experiments from public;
revoke all on public.kael_ab_experiments from anon;
revoke all on public.kael_ab_experiments from authenticated;
revoke all on public.kael_ab_price_synthesis_cases from public;
revoke all on public.kael_ab_price_synthesis_cases from anon;
revoke all on public.kael_ab_price_synthesis_cases from authenticated;

grant select on public.kael_ab_experiments to authenticated;
grant select on public.kael_ab_price_synthesis_cases to authenticated;
grant all on public.kael_ab_experiments to service_role;
grant all on public.kael_ab_price_synthesis_cases to service_role;

insert into public.kael_ab_experiments (
  experiment_key,
  purpose,
  status,
  primary_provider,
  comparison_provider,
  fallback_provider,
  sample_target,
  metric_thresholds,
  started_at,
  safe_metadata
) values (
  'p17-price-synthesis-perplexity-vs-anthropic-2026-05-26',
  'price_synthesis',
  'running',
  'perplexity',
  'anthropic',
  'anthropic',
  100,
  jsonb_build_object(
    'schema_validation_rate_min', 0.95,
    'price_range_deviation_vs_anthropic_max', 0.25,
    'price_range_deviation_vs_actual_max', 0.30,
    'fallback_rate_max', 0.10,
    'reject_if_failed_metric_count_gte', 2
  ),
  now(),
  jsonb_build_object(
    'plan_decision', 'D28',
    'phase', 'P17',
    'collection_policy', 'Do not fabricate cases; collect 100 staging/live-approved samples.'
  )
) on conflict (experiment_key) do update set
  status = 'running',
  primary_provider = excluded.primary_provider,
  comparison_provider = excluded.comparison_provider,
  fallback_provider = excluded.fallback_provider,
  sample_target = excluded.sample_target,
  metric_thresholds = excluded.metric_thresholds,
  started_at = coalesce(public.kael_ab_experiments.started_at, excluded.started_at),
  safe_metadata = public.kael_ab_experiments.safe_metadata || excluded.safe_metadata,
  updated_at = now();

create or replace view public.kael_monitoring_provider_daily
with (security_invoker = true)
as
select
  date_trunc('day', created_at)::date as day,
  purpose,
  provider,
  count(*)::integer as call_count,
  count(*) filter (where success)::integer as success_count,
  count(*) filter (where not success)::integer as failure_count,
  count(*) filter (where fallback_used)::integer as fallback_count,
  coalesce(round(sum(cost_usd)::numeric, 6), 0)::numeric(12,6) as total_cost_usd,
  round(avg(latency_ms)::numeric, 2) as avg_latency_ms,
  percentile_cont(0.95) within group (order by latency_ms)
    filter (where latency_ms is not null) as p95_latency_ms
from public.api_logs
group by 1, 2, 3;

create or replace view public.kael_monitoring_ab_price_synthesis
with (security_invoker = true)
as
with metrics as (
  select
    e.id as experiment_id,
    e.experiment_key,
    e.status,
    e.purpose,
    e.primary_provider,
    e.comparison_provider,
    e.fallback_provider,
    e.sample_target,
    e.metric_thresholds,
    e.started_at,
    count(c.id)::integer as collected_cases,
    count(c.id) filter (where c.status = 'completed')::integer as completed_cases,
    round(
      (count(c.id) filter (where c.status = 'completed' and c.perplexity_schema_valid is true))::numeric
        / nullif(count(c.id) filter (where c.status = 'completed'), 0),
      4
    ) as schema_validation_rate,
    round(
      avg(abs(c.perplexity_price_max - c.anthropic_price_max)::numeric / nullif(c.anthropic_price_max, 0))
        filter (
          where c.status = 'completed'
            and c.perplexity_price_max is not null
            and c.anthropic_price_max is not null
        ),
      4
    ) as price_range_deviation_vs_anthropic,
    round(
      avg(abs(c.perplexity_price_max - c.actual_final_price)::numeric / nullif(c.actual_final_price, 0))
        filter (
          where c.status = 'completed'
            and c.perplexity_price_max is not null
            and c.actual_final_price is not null
        ),
      4
    ) as price_range_deviation_vs_actual,
    round(
      (count(c.id) filter (where c.status = 'completed' and c.fallback_used))::numeric
        / nullif(count(c.id) filter (where c.status = 'completed'), 0),
      4
    ) as fallback_rate
  from public.kael_ab_experiments e
  left join public.kael_ab_price_synthesis_cases c on c.experiment_id = e.id
  where e.purpose = 'price_synthesis'
  group by e.id
)
select
  *,
  (
    case when schema_validation_rate is not null and schema_validation_rate < 0.95 then 1 else 0 end
    + case when price_range_deviation_vs_anthropic is not null and price_range_deviation_vs_anthropic > 0.25 then 1 else 0 end
    + case when price_range_deviation_vs_actual is not null and price_range_deviation_vs_actual > 0.30 then 1 else 0 end
    + case when fallback_rate is not null and fallback_rate > 0.10 then 1 else 0 end
  )::integer as failed_metric_count,
  case
    when completed_cases < sample_target then 'collecting'
    when (
      case when schema_validation_rate is not null and schema_validation_rate < 0.95 then 1 else 0 end
      + case when price_range_deviation_vs_anthropic is not null and price_range_deviation_vs_anthropic > 0.25 then 1 else 0 end
      + case when price_range_deviation_vs_actual is not null and price_range_deviation_vs_actual > 0.30 then 1 else 0 end
      + case when fallback_rate is not null and fallback_rate > 0.10 then 1 else 0 end
    ) >= 2 then 'reject_perplexity'
    else 'keep_perplexity'
  end as threshold_decision
from metrics;

revoke all on public.kael_monitoring_provider_daily from public;
revoke all on public.kael_monitoring_provider_daily from anon;
revoke all on public.kael_monitoring_ab_price_synthesis from public;
revoke all on public.kael_monitoring_ab_price_synthesis from anon;
grant select on public.kael_monitoring_provider_daily to authenticated;
grant select on public.kael_monitoring_ab_price_synthesis to authenticated;
grant select on public.kael_monitoring_provider_daily to service_role;
grant select on public.kael_monitoring_ab_price_synthesis to service_role;

comment on table public.kael_ab_experiments is
  'P17/D28 Kael A/B experiments. Service role writes; admins read staging monitoring state.';
comment on table public.kael_ab_price_synthesis_cases is
  'P17/D28 case-level A/B sample rows for Perplexity vs Anthropic price_synthesis evaluation. No fabricated production data.';
comment on view public.kael_monitoring_provider_daily is
  'P17 admin monitoring view over api_logs provider cost, latency, success, and fallback metrics.';
comment on view public.kael_monitoring_ab_price_synthesis is
  'P17 admin monitoring view for the 100-case price_synthesis A/B test decision thresholds.';
