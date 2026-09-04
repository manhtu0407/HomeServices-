begin;

create or replace function private.propagate_synthetic_member_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.kael_admin_queue
  set synthetic_cohort_id = new.cohort_id
  where actor_id = new.profile_id
    and synthetic_cohort_id is distinct from new.cohort_id;

  if new.member_role = 'worker'::public.user_role then
    update public.customer_favorite_workers as favorite
    set synthetic_cohort_id = new.cohort_id
    where favorite.worker_id = new.profile_id
      and exists (
        select 1
        from public.synthetic_matching_cohort_members as customer_member
        where customer_member.profile_id = favorite.customer_id
          and customer_member.member_role = 'customer'::public.user_role
          and customer_member.cohort_id = new.cohort_id
      );
  end if;

  delete from public.worker_stats where worker_id = new.profile_id;
  delete from public.customer_stats where customer_id = new.profile_id;
  return new;
end;
$function$;

create or replace function private.recompute_all_actor_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.worker_stats as stats
  using public.synthetic_matching_cohort_members as member
  where stats.worker_id = member.profile_id;
  delete from public.customer_stats as stats
  using public.synthetic_matching_cohort_members as member
  where stats.customer_id = member.profile_id;

  update public.jobs
  set platform_fee = round(final_price * private.platform_fee_worker_rate()),
      worker_net = final_price - round(final_price * private.platform_fee_worker_rate())
  where paid_at is not null and final_price is not null and worker_net is null
    and synthetic_cohort_id is null;

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
  from public.worker_profiles as wp
  left join public.jobs as j on j.worker_id = wp.id and j.synthetic_cohort_id is null
  where wp.synthetic_cohort_id is null
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
        (select count(distinct d.job_id) from public.disputes as d
           join public.jobs as jj on jj.id = d.job_id
           where jj.customer_id = cp.id and jj.synthetic_cohort_id is null)::numeric
        / count(*) filter (where j.paid_at is not null)), 4) end,
    now()
  from public.customer_profiles as cp
  left join public.jobs as j on j.customer_id = cp.id and j.synthetic_cohort_id is null
  where not exists (
    select 1 from public.synthetic_matching_cohort_members as member
    where member.profile_id = cp.id
  )
  group by cp.id
  on conflict (customer_id) do update set
    bookings_total = excluded.bookings_total,
    bookings_30d = excluded.bookings_30d,
    total_spent = excluded.total_spent,
    dispute_free_rate = excluded.dispute_free_rate,
    last_recomputed_at = excluded.last_recomputed_at;
end;
$function$;

create or replace view public.customer_overview with (security_invoker = on) as
  select cp.id as customer_id, cp.building_name, cp.unit_number, cp.district, cp.created_at,
         cs.bookings_total, cs.bookings_30d, cs.total_spent, cs.dispute_free_rate, cs.last_recomputed_at
  from public.customer_profiles as cp
  left join public.customer_stats as cs on cs.customer_id = cp.id
  where not exists (
    select 1 from public.synthetic_matching_cohort_members as member
    where member.profile_id = cp.id
  );

select private.recompute_all_actor_stats();

comment on function private.recompute_all_actor_stats() is
  'Rebuilds real-marketplace actor metrics only; every synthetic member is excluded from both role aggregates.';

commit;
