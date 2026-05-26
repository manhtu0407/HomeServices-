-- P3 Kael Harness: purpose-based provider routing overrides.

create table if not exists public.ai_provider_routing (
  purpose text primary key check (purpose in (
    'intent_classification',
    'vision_analysis',
    'clarification',
    'problem_synthesis',
    'market_lookup',
    'price_synthesis',
    'advisory_generation',
    'worker_brief',
    'scope_change',
    'post_job_learning',
    'educational_response'
  )),
  primary_provider public.api_provider not null,
  primary_model text not null check (char_length(primary_model) between 1 and 120),
  fallback_provider public.api_provider,
  fallback_model text check (fallback_model is null or char_length(fallback_model) between 1 and 120),
  cost_ceiling_usd numeric(10,6) not null check (cost_ceiling_usd > 0),
  latency_budget_ms integer not null check (latency_budget_ms > 0),
  user_visible boolean not null default true,
  daily_provider_cap_usd numeric(10,2) not null default 30 check (daily_provider_cap_usd > 0),
  is_enabled boolean not null default true,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_provider_routing_fallback_pair check (
    (fallback_provider is null and fallback_model is null)
    or (fallback_provider is not null and fallback_model is not null)
  )
);

alter table public.ai_provider_routing enable row level security;

drop trigger if exists ai_provider_routing_updated_at on public.ai_provider_routing;
create trigger ai_provider_routing_updated_at
  before update on public.ai_provider_routing
  for each row execute function public.update_updated_at();

drop policy if exists "Admins read ai provider routing" on public.ai_provider_routing;
create policy "Admins read ai provider routing"
  on public.ai_provider_routing for select
  to authenticated
  using (private.is_admin());

revoke all on public.ai_provider_routing from public;
revoke all on public.ai_provider_routing from anon;
revoke all on public.ai_provider_routing from authenticated;
revoke insert, update, delete on public.ai_provider_routing from authenticated;
grant select on public.ai_provider_routing to authenticated;
grant all on public.ai_provider_routing to service_role;

insert into public.ai_provider_routing (
  purpose,
  primary_provider,
  primary_model,
  fallback_provider,
  fallback_model,
  cost_ceiling_usd,
  latency_budget_ms,
  user_visible,
  daily_provider_cap_usd
) values
  ('intent_classification', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-4-6', 0.001, 1000, true, 30),
  ('vision_analysis', 'anthropic', 'claude-sonnet-4-6', null, null, 0.015, 5000, true, 30),
  ('clarification', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-4-6', 0.003, 2000, true, 30),
  ('problem_synthesis', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-4-6', 0.005, 3000, true, 30),
  ('market_lookup', 'perplexity', 'sonar', 'anthropic', 'claude-sonnet-4-6', 0.002, 4000, true, 30),
  ('price_synthesis', 'perplexity', 'sonar', 'anthropic', 'claude-sonnet-4-6', 0.010, 3000, true, 30),
  ('advisory_generation', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-4-6', 0.004, 2000, true, 30),
  ('worker_brief', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-4-6', 0.006, 3000, false, 30),
  ('scope_change', 'anthropic', 'claude-sonnet-4-6', null, null, 0.010, 4000, true, 30),
  ('post_job_learning', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-4-6', 0.012, 15000, false, 30),
  ('educational_response', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-4-6', 0.003, 2000, true, 30)
on conflict (purpose) do update set
  primary_provider = excluded.primary_provider,
  primary_model = excluded.primary_model,
  fallback_provider = excluded.fallback_provider,
  fallback_model = excluded.fallback_model,
  cost_ceiling_usd = excluded.cost_ceiling_usd,
  latency_budget_ms = excluded.latency_budget_ms,
  user_visible = excluded.user_visible,
  daily_provider_cap_usd = excluded.daily_provider_cap_usd,
  updated_at = now();

comment on table public.ai_provider_routing is
  'Kael P3 purpose-based AI provider routing overrides. Edge/service role owns writes; admins may read current config.';
