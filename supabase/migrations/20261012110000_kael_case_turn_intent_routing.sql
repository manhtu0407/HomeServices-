-- Add the bounded DeepSeek purpose that classifies what a customer wants on each Kael Work turn,
-- so a question or a request for a worker quote is answered instead of re-running price research.
begin;

alter table public.ai_provider_routing
  drop constraint if exists ai_provider_routing_purpose_check;

alter table public.ai_provider_routing
  add constraint ai_provider_routing_purpose_check check (purpose in (
    'intent_classification', 'vision_analysis', 'clarification', 'problem_synthesis',
    'market_lookup', 'price_synthesis', 'advisory_generation', 'worker_brief',
    'scope_change', 'job_incident', 'post_job_learning', 'educational_response',
    'worker_assist', 'normal_chat_vision', 'normal_chat_response', 'normal_chat_memory',
    'normal_chat_search', 'normal_chat_suggestions', 'case_turn_intent'
  ));

insert into public.ai_provider_routing (
  purpose, primary_provider, primary_model, fallback_provider, fallback_model,
  cost_ceiling_usd, latency_budget_ms, user_visible, daily_provider_cap_usd
) values (
  'case_turn_intent', 'deepseek', 'deepseek-v4-flash', null, null,
  0.002, 6000, false, 30
)
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

commit;
