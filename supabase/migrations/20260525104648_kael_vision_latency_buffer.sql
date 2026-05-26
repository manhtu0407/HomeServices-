update public.ai_provider_routing
set
  latency_budget_ms = 4500,
  updated_at = now()
where purpose = 'vision_analysis'
  and latency_budget_ms > 4500;
