-- C-1 (Notes.md, 2026-06-13): DB-backed daily provider spend cap.
--
-- The in-memory cost caps in kael/rate-limit.ts (monthlyCostCapUsd /
-- dailyCostCapUsd / DAILY_PROVIDER_CAP_USD) never fired: checkKaelActorRateLimit
-- has no live caller, and per-isolate counters do not survive Edge worker churn.
-- So there was no global $ ceiling on AI spend on an abuse / marketing-spike day.
--
-- This adds a tiny per-day counter plus two atomic RPCs the Edge calls:
--   record_kael_provider_spend(cost)  -> upsert-increment today's total
--   get_kael_provider_spend_today()   -> cheap read for the pre-call gate
-- Enforcement on the Edge is gated by KAEL_PROVIDER_COST_CAP_ENABLED and fails
-- open, so this migration is safe to apply before the Edge flag is turned on.
-- A daily cron prunes counters older than 90 days.

create table if not exists public.kael_provider_spend_daily (
  spend_date     date primary key default current_date,
  total_cost_usd numeric not null default 0,
  call_count     int not null default 0,
  updated_at     timestamptz not null default now()
);

alter table public.kael_provider_spend_daily enable row level security;
revoke all on public.kael_provider_spend_daily from public;
revoke all on public.kael_provider_spend_daily from authenticated;
revoke all on public.kael_provider_spend_daily from anon;

-- Atomic accumulate: one row per UTC date, incremented under the row lock that
-- `on conflict do update` takes. Returns the new running total. Negative / null
-- costs are clamped to 0 so a bad caller can never decrement the ledger.
create or replace function public.record_kael_provider_spend(p_cost_usd numeric)
returns numeric
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_total numeric;
  v_add numeric := greatest(coalesce(p_cost_usd, 0), 0);
begin
  insert into public.kael_provider_spend_daily (spend_date, total_cost_usd, call_count, updated_at)
  values (current_date, v_add, 1, now())
  on conflict (spend_date) do update
    set total_cost_usd = public.kael_provider_spend_daily.total_cost_usd + v_add,
        call_count = public.kael_provider_spend_daily.call_count + 1,
        updated_at = now()
  returning total_cost_usd into v_total;
  return v_total;
end;
$$;

-- Cheap read for the pre-call budget gate. Returns 0 when there is no row yet.
create or replace function public.get_kael_provider_spend_today()
returns numeric
language sql
security definer
set search_path to 'public', 'pg_catalog'
as $$
  select coalesce(
    (select total_cost_usd from public.kael_provider_spend_daily where spend_date = current_date),
    0
  );
$$;

revoke all on function public.record_kael_provider_spend(numeric) from public;
revoke all on function public.record_kael_provider_spend(numeric) from anon;
revoke all on function public.record_kael_provider_spend(numeric) from authenticated;
grant execute on function public.record_kael_provider_spend(numeric) to service_role;

revoke all on function public.get_kael_provider_spend_today() from public;
revoke all on function public.get_kael_provider_spend_today() from anon;
revoke all on function public.get_kael_provider_spend_today() from authenticated;
grant execute on function public.get_kael_provider_spend_today() to service_role;

create extension if not exists pg_cron;

-- Idempotent re-apply: drop any prior job of this name before (re)scheduling, so
-- rollback/reapply or fresh-env init never errors or duplicates the cron job.
-- Unschedule by job name (text overload) guarded by EXISTS, so there is no
-- column/loop-variable ambiguity and no error when the job is absent.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'kael-provider-spend-cleanup') then
    perform cron.unschedule('kael-provider-spend-cleanup');
  end if;
end $$;

select cron.schedule(
  'kael-provider-spend-cleanup',
  '23 3 * * *',
  $$delete from public.kael_provider_spend_daily where spend_date < current_date - interval '90 days'$$
);
