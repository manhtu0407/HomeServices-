begin;

do $$
declare
  v_mismatch_count integer;
  v_rejected_unknown boolean := false;
begin
  with expected (
    purpose,
    primary_provider,
    primary_model,
    fallback_provider,
    fallback_model,
    cost_ceiling_usd,
    latency_budget_ms,
    user_visible,
    daily_provider_cap_usd
  ) as (values
    ('intent_classification', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5', 0.001::numeric, 2500, true, 30::numeric),
    ('vision_analysis', 'anthropic', 'claude-sonnet-5', null, null, 0.015::numeric, 4500, true, 30::numeric),
    ('clarification', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-haiku-4-5-20251001', 0.003::numeric, 2000, true, 30::numeric),
    ('problem_synthesis', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5', 0.005::numeric, 3000, true, 30::numeric),
    ('market_lookup', 'perplexity', 'sonar', null, null, 0.002::numeric, 4000, true, 30::numeric),
    ('price_synthesis', 'anthropic', 'claude-sonnet-5', null, null, 0.010::numeric, 3000, true, 30::numeric),
    ('advisory_generation', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-haiku-4-5-20251001', 0.004::numeric, 2000, true, 30::numeric),
    ('worker_brief', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5', 0.006::numeric, 3000, false, 30::numeric),
    ('scope_change', 'anthropic', 'claude-sonnet-5', null, null, 0.010::numeric, 4000, true, 30::numeric),
    ('job_incident', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5', 0.004::numeric, 5000, true, 30::numeric),
    ('post_job_learning', 'deepseek', 'deepseek-v4-pro', 'anthropic', 'claude-sonnet-5', 0.012::numeric, 15000, false, 30::numeric),
    ('educational_response', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-haiku-4-5-20251001', 0.003::numeric, 2000, true, 30::numeric),
    ('worker_assist', 'deepseek', 'deepseek-v4-flash', 'anthropic', 'claude-sonnet-5', 0.004::numeric, 5000, true, 30::numeric),
    ('normal_chat_vision', 'anthropic', 'claude-sonnet-5-5', 'anthropic', 'claude-sonnet-5', 0.025::numeric, 15000, false, 30::numeric),
    ('normal_chat_response', 'deepseek', 'deepseek-v4-pro', 'deepseek', 'deepseek-v4-flash', 0.010::numeric, 12000, true, 30::numeric),
    ('normal_chat_memory', 'deepseek', 'deepseek-v4-flash', null, null, 0.005::numeric, 8000, false, 30::numeric),
    ('normal_chat_search', 'perplexity', 'pplx-fast-search', null, null, 0.001::numeric, 8000, false, 30::numeric),
    ('normal_chat_suggestions', 'deepseek', 'deepseek-v4-flash', null, null, 0.005::numeric, 8000, false, 30::numeric)
  )
  select count(*)::integer
    into v_mismatch_count
    from expected
    left join public.ai_provider_routing as route using (purpose)
    where route.purpose is null
      or route.primary_provider::text is distinct from expected.primary_provider
      or route.primary_model is distinct from expected.primary_model
      or route.fallback_provider::text is distinct from expected.fallback_provider
      or route.fallback_model is distinct from expected.fallback_model
      or route.cost_ceiling_usd is distinct from expected.cost_ceiling_usd
      or route.latency_budget_ms is distinct from expected.latency_budget_ms
      or route.user_visible is distinct from expected.user_visible
      or route.daily_provider_cap_usd is distinct from expected.daily_provider_cap_usd;

  if v_mismatch_count <> 0 then
    raise exception 'durable provider routing catalog differs from runtime config';
  end if;

  if (select count(*) from public.ai_provider_routing) <> 18 then
    raise exception 'provider routing catalog must contain exactly 18 purposes';
  end if;

  begin
    insert into public.ai_provider_routing (
      purpose,
      primary_provider,
      primary_model,
      cost_ceiling_usd,
      latency_budget_ms
    ) values ('unsupported_purpose', 'deepseek', 'model', 0.001, 1000);
  exception
    when check_violation then
      v_rejected_unknown := true;
  end;

  if not v_rejected_unknown then
    raise exception 'provider routing purpose constraint accepted an unsupported purpose';
  end if;
end
$$;

select jsonb_build_object(
  'provider_purposes', (select count(*) from public.ai_provider_routing),
  'market_fallback_removed', (
    select fallback_provider is null and fallback_model is null
    from public.ai_provider_routing
    where purpose = 'market_lookup'
  ),
  'new_purposes_present', (
    select count(*) = 2
    from public.ai_provider_routing
    where purpose in ('job_incident', 'worker_assist')
  ),
  'normal_chat_purposes_present', (
    select count(*) = 5
    from public.ai_provider_routing
    where purpose in (
      'normal_chat_vision',
      'normal_chat_response',
      'normal_chat_memory',
      'normal_chat_search',
      'normal_chat_suggestions'
    )
  )
) as verification;

rollback;
