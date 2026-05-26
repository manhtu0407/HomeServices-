-- =============================================================================
-- Q3 Kael market lookup cache.
--
-- Why:
-- - Plan.md Section 24 Q3 requires a 24h reusable market lookup cache before the later
--   source-trust work in Section 25 can rely on durable market-source infrastructure.
-- - The cache is inert unless KAEL_OPT_MARKET_CACHE_ENABLED is enabled in Edge.
-- - Writes/invalidation stay behind the Edge service role; admins get read-only
--   visibility through RLS.
-- =============================================================================

create table if not exists public.kael_market_cache (
  id uuid primary key default gen_random_uuid(),
  district_code text not null check (char_length(district_code) between 1 and 80),
  service_type public.service_type not null,
  problem_slug text not null check (char_length(problem_slug) between 1 and 120),
  complexity public.complexity_level not null,
  market_range_min integer not null check (market_range_min > 0),
  market_range_max integer not null check (market_range_max >= market_range_min),
  confidence numeric(6,4) not null check (confidence between 0 and 1),
  sources_summary text,
  perplexity_raw jsonb not null default '{}'::jsonb check (jsonb_typeof(perplexity_raw) = 'object'),
  hit_count integer not null default 0 check (hit_count >= 0),
  expires_at timestamptz not null,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kael_market_cache_lookup_unique
    unique (district_code, service_type, problem_slug, complexity)
);

create index if not exists kael_market_cache_lookup_active_idx
  on public.kael_market_cache (
    district_code,
    service_type,
    problem_slug,
    complexity,
    expires_at
  )
  where invalidated_at is null;

create index if not exists kael_market_cache_expires_idx
  on public.kael_market_cache (expires_at);

alter table public.kael_market_cache enable row level security;

drop trigger if exists kael_market_cache_updated_at on public.kael_market_cache;
create trigger kael_market_cache_updated_at
  before update on public.kael_market_cache
  for each row execute function public.update_updated_at();

drop policy if exists "Admins read kael market cache" on public.kael_market_cache;
create policy "Admins read kael market cache"
  on public.kael_market_cache for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_market_cache from public;
revoke all on public.kael_market_cache from anon;
revoke all on public.kael_market_cache from authenticated;

grant select on public.kael_market_cache to authenticated;
grant all on public.kael_market_cache to service_role;

create or replace function public.increment_kael_market_cache_hit(
  p_cache_id uuid
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.kael_market_cache
  set hit_count = hit_count + 1,
      updated_at = now()
  where id = p_cache_id
    and invalidated_at is null;
$$;

revoke all on function public.increment_kael_market_cache_hit(uuid) from public;
revoke all on function public.increment_kael_market_cache_hit(uuid) from anon;
revoke all on function public.increment_kael_market_cache_hit(uuid) from authenticated;
grant execute on function public.increment_kael_market_cache_hit(uuid) to service_role;

create extension if not exists pg_cron;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'kael-cleanup-market-cache';
  end if;
end $$;

select cron.schedule(
  'kael-cleanup-market-cache',
  '31 18 * * *',
  $$delete from public.kael_market_cache
    where expires_at < now() - interval '7 days'
       or invalidated_at < now() - interval '7 days';$$
);

comment on table public.kael_market_cache is
  'Plan.md Section 24 Q3 24h Perplexity market lookup cache. Service-role writes/invalidation; admins read.';
comment on function public.increment_kael_market_cache_hit(uuid) is
  'Best-effort service-role counter for Plan.md Section 24 Q3 market cache hit telemetry.';
