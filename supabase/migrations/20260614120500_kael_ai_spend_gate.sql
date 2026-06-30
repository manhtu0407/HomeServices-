-- S4 / F1 + F4 (Plan.md §38 security hardening — 2026-06-14): durable, DB-backed
-- AI-spend gate (global + per-user daily/monthly).
--
-- WHY: the per-actor cost caps lived in an in-memory Map (kael/rate-limit.ts
-- `costCounters`) — per-isolate, reset on cold start — and `dailyProviderCapUsd`
-- was declared but never consumed (audit F1). On Supabase Edge (ephemeral,
-- horizontally-scaled isolates with no shared memory) those caps gate nothing at
-- system scale. This ledger + RPCs let the Edge read spend BEFORE each provider
-- call and record actual cost AFTER, so the caps survive across isolates.
--
-- Behavior is enforcement-only; service_role (Edge) reads/writes via the two
-- SECURITY DEFINER RPCs. Direct clients are denied (Edge-only table).

create table if not exists public.kael_ai_spend_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  purpose text not null,
  cost_usd numeric(12, 6) not null check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists kael_ai_spend_log_created_idx
  on public.kael_ai_spend_log (created_at desc);
create index if not exists kael_ai_spend_log_actor_created_idx
  on public.kael_ai_spend_log (actor_id, created_at desc);

alter table public.kael_ai_spend_log enable row level security;
revoke all on public.kael_ai_spend_log from public;
revoke all on public.kael_ai_spend_log from anon;
revoke all on public.kael_ai_spend_log from authenticated;

drop policy if exists "deny all direct client access kael_ai_spend_log"
  on public.kael_ai_spend_log;
create policy "deny all direct client access kael_ai_spend_log"
  on public.kael_ai_spend_log
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.kael_ai_spend_log is
  'Edge-only AI provider spend ledger (F1). Durable counter backing global + per-user daily/monthly AI-spend caps. Written/read only by the service-role Edge function via check_kael_ai_spend()/record_kael_ai_spend(). Never expose to clients.';

-- Read current spend vs caps. Global window = rolling 24h; per-user = 24h + 30d.
-- Returns allowed=false with the first cap that (current + estimate) would exceed.
create or replace function public.check_kael_ai_spend(
  p_actor_id uuid,
  p_estimated_usd numeric,
  p_global_daily_cap numeric,
  p_user_daily_cap numeric,
  p_user_monthly_cap numeric
)
returns table (
  allowed boolean,
  blocked_scope text,
  global_today_usd numeric,
  user_today_usd numeric,
  user_month_usd numeric
)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_global numeric;
  v_user_day numeric := 0;
  v_user_month numeric := 0;
  v_est numeric := greatest(coalesce(p_estimated_usd, 0), 0);
begin
  select coalesce(sum(cost_usd), 0) into v_global
  from public.kael_ai_spend_log
  where created_at >= now() - interval '1 day';

  if p_actor_id is not null then
    select coalesce(sum(cost_usd), 0) into v_user_day
    from public.kael_ai_spend_log
    where actor_id = p_actor_id and created_at >= now() - interval '1 day';

    select coalesce(sum(cost_usd), 0) into v_user_month
    from public.kael_ai_spend_log
    where actor_id = p_actor_id and created_at >= now() - interval '30 days';
  end if;

  if p_global_daily_cap is not null and v_global + v_est > p_global_daily_cap then
    return query select false, 'global_daily'::text, v_global, v_user_day, v_user_month;
    return;
  end if;
  if p_actor_id is not null and p_user_daily_cap is not null
     and v_user_day + v_est > p_user_daily_cap then
    return query select false, 'user_daily'::text, v_global, v_user_day, v_user_month;
    return;
  end if;
  if p_actor_id is not null and p_user_monthly_cap is not null
     and v_user_month + v_est > p_user_monthly_cap then
    return query select false, 'user_monthly'::text, v_global, v_user_day, v_user_month;
    return;
  end if;

  return query select true, null::text, v_global, v_user_day, v_user_month;
end;
$$;

create or replace function public.record_kael_ai_spend(
  p_actor_id uuid,
  p_purpose text,
  p_cost_usd numeric
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
begin
  if coalesce(p_cost_usd, 0) <= 0 then
    return;
  end if;
  insert into public.kael_ai_spend_log (actor_id, purpose, cost_usd)
  values (p_actor_id, coalesce(nullif(p_purpose, ''), 'unknown'), p_cost_usd);
end;
$$;

revoke all on function public.check_kael_ai_spend(uuid, numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.check_kael_ai_spend(uuid, numeric, numeric, numeric, numeric) to service_role;
revoke all on function public.record_kael_ai_spend(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.record_kael_ai_spend(uuid, text, numeric) to service_role;

-- Keep the ledger small; caps only need 30d of history.
select cron.schedule(
  'kael-ai-spend-log-cleanup',
  '23 4 * * *',
  $$delete from public.kael_ai_spend_log where created_at < now() - interval '35 days'$$
);
