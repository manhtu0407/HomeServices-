-- Keep the durable provider catalog aligned with the runtime routing contract.
-- The catalog remains an auditable admin surface even though Edge executes the
-- statically reviewed routing map.

alter table public.ai_provider_routing
  drop constraint if exists ai_provider_routing_purpose_check;

alter table public.ai_provider_routing
  add constraint ai_provider_routing_purpose_check check (purpose in (
    'intent_classification',
    'vision_analysis',
    'clarification',
    'problem_synthesis',
    'market_lookup',
    'price_synthesis',
    'advisory_generation',
    'worker_brief',
    'scope_change',
    'job_incident',
    'post_job_learning',
    'educational_response',
    'worker_assist'
  ));

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
  ('intent_classification', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5', 0.001, 2500, true, 30),
  ('vision_analysis', 'anthropic', 'claude-sonnet-5', null, null, 0.015, 4500, true, 30),
  ('clarification', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-haiku-4-5-20251001', 0.003, 2000, true, 30),
  ('problem_synthesis', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5', 0.005, 3000, true, 30),
  ('market_lookup', 'perplexity', 'sonar', null, null, 0.002, 4000, true, 30),
  ('price_synthesis', 'anthropic', 'claude-sonnet-5', null, null, 0.010, 3000, true, 30),
  ('advisory_generation', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-haiku-4-5-20251001', 0.004, 2000, true, 30),
  ('worker_brief', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5', 0.006, 3000, false, 30),
  ('scope_change', 'anthropic', 'claude-sonnet-5', null, null, 0.010, 4000, true, 30),
  ('job_incident', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5', 0.004, 5000, true, 30),
  ('post_job_learning', 'deepseek', 'deepseek-v4-pro', 'anthropic', 'claude-sonnet-5', 0.012, 15000, false, 30),
  ('educational_response', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-haiku-4-5-20251001', 0.003, 2000, true, 30),
  ('worker_assist', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5', 0.004, 5000, true, 30)
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
