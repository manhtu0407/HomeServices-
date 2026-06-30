-- worker_stats + customer_stats: per-actor aggregate tables + read views + daily recompute.
-- D1 core-derivable metrics only (completion / on-time / response-time / income / bookings /
-- spent / dispute-free). tier/points/badges/trust-score are deferred. NULL = insufficient data
-- (never fabricated). Designed to extend (add columns) without rework.
-- Worker net is persisted + frozen per job (OQ2): the recompute freezes it the first time a job
-- is seen paid; the future payment subsystem (P9) will write it at the 'paid' transition.

-- 1. Per-job worker net (OQ2 persist + freeze).
alter table public.jobs
  add column if not exists platform_fee integer,
  add column if not exists worker_net integer;
comment on column public.jobs.platform_fee is
  'Platform fee (VND) withheld from worker, frozen at payment = round(final_price * private.platform_fee_worker_rate()).';
comment on column public.jobs.worker_net is
  'Worker net payout (VND), frozen at payment = final_price - platform_fee.';

-- 2. Worker-side platform fee rate — single SQL source of truth.
create or replace function private.platform_fee_worker_rate()
returns numeric language sql immutable security invoker set search_path = ''
as $$ select 0.10::numeric $$;
comment on function private.platform_fee_worker_rate() is
  'Worker-side platform fee rate. MUST equal PLATFORM_FEE_WORKER in packages/shared/src/constants.ts (0.10).';

-- 3. worker_stats (rating/total_jobs stay on worker_profiles — referenced, not duplicated).
create table public.worker_stats (
  worker_id uuid primary key references public.worker_profiles(id) on delete cascade,
  completion_rate numeric,
  on_time_rate numeric,
  avg_response_time_min numeric,
  income_30d integer not null default 0,
  jobs_30d integer not null default 0,
  total_income integer not null default 0,
  cancel_rate numeric,
  last_recomputed_at timestamptz not null default now()
);
comment on table public.worker_stats is
  'Derived per-worker aggregates (D1 core). NULL rate = insufficient data, never fabricated.';
alter table public.worker_stats enable row level security;
create policy "Workers read own stats" on public.worker_stats
  for select to authenticated
  using ((select auth.uid()) = worker_id or private.is_admin());

-- 4. customer_stats.
create table public.customer_stats (
  customer_id uuid primary key references public.customer_profiles(id) on delete cascade,
  bookings_total integer not null default 0,
  bookings_30d integer not null default 0,
  total_spent integer not null default 0,
  dispute_free_rate numeric,
  last_recomputed_at timestamptz not null default now()
);
comment on table public.customer_stats is
  'Derived per-customer aggregates (D1 core). NULL dispute_free_rate = no completed jobs yet.';
alter table public.customer_stats enable row level security;
create policy "Customers read own stats" on public.customer_stats
  for select to authenticated
  using ((select auth.uid()) = customer_id or private.is_admin());

-- 5. Recompute: freeze worker_net for paid jobs, then rebuild both stats tables (set-based).
create or replace function private.recompute_all_actor_stats()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.jobs
  set platform_fee = round(final_price * private.platform_fee_worker_rate()),
      worker_net = final_price - round(final_price * private.platform_fee_worker_rate())
  where paid_at is not null and final_price is not null and worker_net is null;

  insert into public.worker_stats as ws (worker_id, completion_rate, on_time_rate,
    avg_response_time_min, income_30d, jobs_30d, total_income, cancel_rate, last_recomputed_at)
  select
    wp.id,
    case when count(*) filter (where j.matched_at is not null) > 0
      then round(count(*) filter (where j.status in
             ('completed_by_worker','confirmed_by_customer','payment_pending','paid','reviewed'))::numeric
           / count(*) filter (where j.matched_at is not null), 4) end,
    case when count(*) filter (where j.arrived_at is not null and j.scheduled_at is not null) > 0
      then round(count(*) filter (where j.arrived_at is not null and j.scheduled_at is not null
             and j.arrived_at <= j.scheduled_at)::numeric
           / count(*) filter (where j.arrived_at is not null and j.scheduled_at is not null), 4) end,
    round((avg(extract(epoch from (j.matched_at - j.broadcast_at)) / 60.0)
           filter (where j.matched_at is not null and j.broadcast_at is not null))::numeric, 1),
    coalesce(sum(j.worker_net) filter (where j.paid_at is not null
             and j.paid_at >= now() - interval '30 days'), 0),
    count(*) filter (where j.paid_at is not null and j.paid_at >= now() - interval '30 days'),
    coalesce(sum(j.worker_net) filter (where j.paid_at is not null), 0),
    case when count(*) filter (where j.matched_at is not null) > 0
      then round(count(*) filter (where j.status = 'cancelled' and j.matched_at is not null)::numeric
           / count(*) filter (where j.matched_at is not null), 4) end,
    now()
  from public.worker_profiles wp
  left join public.jobs j on j.worker_id = wp.id
  group by wp.id
  on conflict (worker_id) do update set
    completion_rate = excluded.completion_rate,
    on_time_rate = excluded.on_time_rate,
    avg_response_time_min = excluded.avg_response_time_min,
    income_30d = excluded.income_30d,
    jobs_30d = excluded.jobs_30d,
    total_income = excluded.total_income,
    cancel_rate = excluded.cancel_rate,
    last_recomputed_at = excluded.last_recomputed_at;

  insert into public.customer_stats as cs (customer_id, bookings_total, bookings_30d,
    total_spent, dispute_free_rate, last_recomputed_at)
  select
    cp.id,
    count(*) filter (where j.broadcast_at is not null),
    count(*) filter (where j.broadcast_at is not null and j.broadcast_at >= now() - interval '30 days'),
    coalesce(sum(j.final_price) filter (where j.paid_at is not null), 0),
    case when count(*) filter (where j.paid_at is not null) > 0
      then round(1 - (
        (select count(distinct d.job_id) from public.disputes d
           join public.jobs jj on jj.id = d.job_id where jj.customer_id = cp.id)::numeric
        / count(*) filter (where j.paid_at is not null)), 4) end,
    now()
  from public.customer_profiles cp
  left join public.jobs j on j.customer_id = cp.id
  group by cp.id
  on conflict (customer_id) do update set
    bookings_total = excluded.bookings_total,
    bookings_30d = excluded.bookings_30d,
    total_spent = excluded.total_spent,
    dispute_free_rate = excluded.dispute_free_rate,
    last_recomputed_at = excluded.last_recomputed_at;
end $$;
comment on function private.recompute_all_actor_stats() is
  'Daily (pg_cron) + on-demand rebuild of worker_stats/customer_stats from source; freezes jobs.worker_net for newly-paid jobs.';
grant execute on function private.recompute_all_actor_stats() to service_role;

-- 6. Read views ("see everything about X"). security_invoker → underlying RLS applies per actor.
create view public.worker_overview with (security_invoker = on) as
  select wp.id as worker_id, wp.legal_name, wp.rating, wp.total_jobs, wp.is_approved,
         wp.is_available, wp.verification_status, wp.service_types, wp.districts,
         ws.completion_rate, ws.on_time_rate, ws.avg_response_time_min,
         ws.income_30d, ws.jobs_30d, ws.total_income, ws.cancel_rate, ws.last_recomputed_at
  from public.worker_profiles wp
  left join public.worker_stats ws on ws.worker_id = wp.id;
comment on view public.worker_overview is
  'Profile + derived stats per worker (security_invoker; underlying RLS applies).';

create view public.customer_overview with (security_invoker = on) as
  select cp.id as customer_id, cp.building_name, cp.unit_number, cp.district, cp.created_at,
         cs.bookings_total, cs.bookings_30d, cs.total_spent, cs.dispute_free_rate, cs.last_recomputed_at
  from public.customer_profiles cp
  left join public.customer_stats cs on cs.customer_id = cp.id;
comment on view public.customer_overview is
  'Profile + derived stats per customer (security_invoker; underlying RLS applies).';

-- 7. Grants: RLS-gated reads for authenticated, none for anon; service_role for on-demand recompute.
grant select on public.worker_stats, public.customer_stats to authenticated;
grant select on public.worker_overview, public.customer_overview to authenticated;
grant select, insert, update, delete on public.worker_stats, public.customer_stats to service_role;

-- 8. Backfill once from existing data.
select private.recompute_all_actor_stats();

-- 9. Daily recompute (rolling-window metrics).
select cron.schedule('recompute-actor-stats-daily', '17 19 * * *',
  $$select private.recompute_all_actor_stats();$$);
