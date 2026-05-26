-- =============================================================================
-- Q1 Kael cost optimization baseline telemetry.
--
-- Why:
-- - Plan.md §24 Q1 requires a cost dashboard, persisted quality baseline, and
--   per-call optimization metrics before any optimization is enabled.
-- - This migration is telemetry-only. It does not change provider routing,
--   prompts, model selection, prices, matching, or customer-visible workflow.
-- =============================================================================

create table if not exists public.kael_quality_baseline (
  id uuid primary key default gen_random_uuid(),
  baseline_key text not null unique check (char_length(baseline_key) between 8 and 180),
  source text not null check (source in ('staging_live_50', 'p15_replay', 'manual', 'production_shadow')),
  sample_size integer not null check (sample_size > 0),
  job_count integer not null default 0 check (job_count >= 0),
  api_log_count integer not null default 0 check (api_log_count >= 0),
  schema_validation_rate numeric(6,4) check (schema_validation_rate is null or schema_validation_rate between 0 and 1),
  vietnamese_tone_score numeric(6,4) check (vietnamese_tone_score is null or vietnamese_tone_score between 0 and 1),
  avg_review_rating numeric(3,2) check (avg_review_rating is null or avg_review_rating between 0 and 5),
  advisory_accuracy_score numeric(6,4) check (advisory_accuracy_score is null or advisory_accuracy_score between 0 and 1),
  provider_breakdown jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_breakdown) = 'object'),
  purpose_breakdown jsonb not null default '{}'::jsonb check (jsonb_typeof(purpose_breakdown) = 'object'),
  cost_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(cost_summary) = 'object'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  sample_started_at timestamptz,
  sample_ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kael_optimization_metrics (
  id uuid primary key default gen_random_uuid(),
  request_id text,
  job_id uuid references public.jobs(id) on delete set null,
  purpose text not null check (char_length(purpose) between 2 and 80),
  provider public.api_provider not null,
  model text,
  option_flags jsonb not null default '{}'::jsonb check (jsonb_typeof(option_flags) = 'object'),
  enabled_options text[] not null default '{}'::text[],
  cost_before_estimate numeric(12,6) check (cost_before_estimate is null or cost_before_estimate >= 0),
  cost_actual numeric(12,6) check (cost_actual is null or cost_actual >= 0),
  cost_delta_estimate numeric(12,6) generated always as (
    coalesce(cost_before_estimate, 0) - coalesce(cost_actual, 0)
  ) stored,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  quality_pass boolean,
  quality_signal text,
  metric_source text not null default 'edge_api_log'
    check (metric_source in ('edge_api_log', 'q1_baseline_script', 'manual')),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists kael_quality_baseline_created_idx
  on public.kael_quality_baseline (created_at desc);

create index if not exists kael_optimization_metrics_request_idx
  on public.kael_optimization_metrics (request_id)
  where request_id is not null;

create index if not exists kael_optimization_metrics_job_idx
  on public.kael_optimization_metrics (job_id)
  where job_id is not null;

create index if not exists kael_optimization_metrics_purpose_provider_idx
  on public.kael_optimization_metrics (purpose, provider, created_at desc);

alter table public.kael_quality_baseline enable row level security;
alter table public.kael_optimization_metrics enable row level security;

drop trigger if exists kael_quality_baseline_updated_at on public.kael_quality_baseline;
create trigger kael_quality_baseline_updated_at
  before update on public.kael_quality_baseline
  for each row execute function public.update_updated_at();

drop policy if exists "Admins read kael quality baseline" on public.kael_quality_baseline;
create policy "Admins read kael quality baseline"
  on public.kael_quality_baseline for select
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins read kael optimization metrics" on public.kael_optimization_metrics;
create policy "Admins read kael optimization metrics"
  on public.kael_optimization_metrics for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_quality_baseline from public;
revoke all on public.kael_quality_baseline from anon;
revoke all on public.kael_quality_baseline from authenticated;
revoke all on public.kael_optimization_metrics from public;
revoke all on public.kael_optimization_metrics from anon;
revoke all on public.kael_optimization_metrics from authenticated;

grant select on public.kael_quality_baseline to authenticated;
grant select on public.kael_optimization_metrics to authenticated;
grant all on public.kael_quality_baseline to service_role;
grant all on public.kael_optimization_metrics to service_role;

create or replace view public.kael_cost_daily_summary
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
  round(avg(cost_usd)::numeric, 6) as avg_cost_per_call_usd,
  round(avg(latency_ms)::numeric, 2) as avg_latency_ms,
  percentile_cont(0.95) within group (order by latency_ms)
    filter (where latency_ms is not null) as p95_latency_ms,
  round(avg(input_tokens)::numeric, 2) as avg_input_tokens,
  round(avg(output_tokens)::numeric, 2) as avg_output_tokens,
  round((count(*) filter (where not success))::numeric / nullif(count(*), 0), 4) as failure_rate
from public.api_logs
group by 1, 2, 3;

create or replace view public.kael_cost_projection_daily
with (security_invoker = true)
as
with daily as (
  select
    date_trunc('day', created_at)::date as day,
    count(distinct job_id) filter (where job_id is not null)::integer as observed_jobs,
    count(*)::integer as observed_calls,
    coalesce(sum(cost_usd), 0)::numeric as observed_cost_usd
  from public.api_logs
  group by 1
)
select
  day,
  observed_jobs,
  observed_calls,
  round(observed_cost_usd, 6)::numeric(12,6) as observed_cost_usd,
  round((observed_cost_usd / nullif(observed_jobs, 0))::numeric, 6) as cost_per_job_usd,
  round(((observed_cost_usd / nullif(observed_jobs, 0)) * 1000)::numeric, 2) as projected_1000_jobs_usd,
  round(((observed_cost_usd / nullif(observed_jobs, 0)) * 10000)::numeric, 2) as projected_10000_jobs_usd
from daily;

revoke all on public.kael_cost_daily_summary from public;
revoke all on public.kael_cost_daily_summary from anon;
revoke all on public.kael_cost_projection_daily from public;
revoke all on public.kael_cost_projection_daily from anon;
grant select on public.kael_cost_daily_summary to authenticated;
grant select on public.kael_cost_projection_daily to authenticated;
grant select on public.kael_cost_daily_summary to service_role;
grant select on public.kael_cost_projection_daily to service_role;

comment on table public.kael_quality_baseline is
  'Plan.md §24 Q1 persisted pre-optimization quality and cost baseline. Service role writes; admins read.';
comment on table public.kael_optimization_metrics is
  'Plan.md §24 Q1 append-only per-provider-call optimization telemetry. Flags default false until later Q phases.';
comment on view public.kael_cost_daily_summary is
  'Plan.md §24 Q1 daily provider/purpose cost, latency, failure, and token summary over api_logs.';
comment on view public.kael_cost_projection_daily is
  'Plan.md §24 Q1 simple per-job cost projection for 1K and 10K monthly scale planning.';
