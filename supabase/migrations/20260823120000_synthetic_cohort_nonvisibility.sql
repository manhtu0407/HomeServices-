begin;

-- Synthetic smoke is real Production traffic with a deliberately isolated
-- identity. Every service-role consumer must have a durable cohort marker;
-- RLS alone cannot protect these paths because Edge bypasses it.
alter table public.customer_favorite_workers
  add column if not exists synthetic_cohort_id text
    references public.synthetic_matching_cohorts(cohort_id) on delete cascade;
alter table public.kael_admin_queue
  add column if not exists synthetic_cohort_id text
    references public.synthetic_matching_cohorts(cohort_id) on delete cascade;
alter table public.disputes
  add column if not exists synthetic_cohort_id text
    references public.synthetic_matching_cohorts(cohort_id) on delete cascade;
alter table public.customer_payment_methods
  add column if not exists synthetic_cohort_id text
    references public.synthetic_matching_cohorts(cohort_id) on delete cascade;
alter table public.worker_payout_methods
  add column if not exists synthetic_cohort_id text
    references public.synthetic_matching_cohorts(cohort_id) on delete cascade;
alter table public.worker_withdrawal_requests
  add column if not exists synthetic_cohort_id text
    references public.synthetic_matching_cohorts(cohort_id) on delete cascade;
alter table public.api_logs
  add column if not exists synthetic_cohort_id text
    references public.synthetic_matching_cohorts(cohort_id) on delete cascade;
alter table public.kael_optimization_metrics
  add column if not exists synthetic_cohort_id text
    references public.synthetic_matching_cohorts(cohort_id) on delete cascade;
alter table public.kael_ab_price_synthesis_cases
  add column if not exists synthetic_cohort_id text
    references public.synthetic_matching_cohorts(cohort_id) on delete cascade;

create index if not exists customer_favorite_workers_real_customer_idx
  on public.customer_favorite_workers(customer_id, created_at desc)
  where synthetic_cohort_id is null;
create index if not exists kael_admin_queue_real_created_idx
  on public.kael_admin_queue(created_at desc)
  where synthetic_cohort_id is null;
create index if not exists disputes_real_updated_idx
  on public.disputes(updated_at desc)
  where synthetic_cohort_id is null;
create index if not exists worker_payout_methods_real_review_idx
  on public.worker_payout_methods(status, created_at)
  where synthetic_cohort_id is null;
create index if not exists worker_withdrawal_requests_real_queue_idx
  on public.worker_withdrawal_requests(status, requested_at)
  where synthetic_cohort_id is null;
create index if not exists api_logs_real_created_idx
  on public.api_logs(created_at desc)
  where synthetic_cohort_id is null;

create or replace function private.synthetic_profile_cohort(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select member.cohort_id
  from public.synthetic_matching_cohort_members as member
  where member.profile_id = p_profile_id
$function$;

create or replace function private.synthetic_job_cohort(p_job_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select job.synthetic_cohort_id
  from public.jobs as job
  where job.id = p_job_id
$function$;

revoke all on function private.synthetic_profile_cohort(uuid) from public, anon, authenticated;
revoke all on function private.synthetic_job_cohort(uuid) from public, anon, authenticated;
grant execute on function private.synthetic_profile_cohort(uuid) to service_role;
grant execute on function private.synthetic_job_cohort(uuid) to service_role;

create or replace function private.guard_customer_favorite_cohort()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer_cohort text;
  v_worker_cohort text;
begin
  v_customer_cohort := private.synthetic_profile_cohort(new.customer_id);
  v_worker_cohort := private.synthetic_profile_cohort(new.worker_id);
  if v_customer_cohort is distinct from v_worker_cohort then
    raise exception using errcode = '42501', message = 'SYNTHETIC_FAVORITE_CROSS_COHORT';
  end if;
  if new.synthetic_cohort_id is not null
    and new.synthetic_cohort_id is distinct from v_customer_cohort
  then
    raise exception using errcode = '42501', message = 'SYNTHETIC_COHORT_IDENTITY_REQUIRED';
  end if;
  new.synthetic_cohort_id := v_customer_cohort;
  return new;
end;
$function$;

create or replace function private.guard_admin_queue_cohort()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_cohort text;
  v_job_cohort text;
  v_expected text;
begin
  v_actor_cohort := private.synthetic_profile_cohort(new.actor_id);
  v_job_cohort := private.synthetic_job_cohort(new.job_id);
  if v_actor_cohort is not null and v_job_cohort is not null
    and v_actor_cohort is distinct from v_job_cohort
  then
    raise exception using errcode = '42501', message = 'SYNTHETIC_QUEUE_CROSS_COHORT';
  end if;
  v_expected := coalesce(v_job_cohort, v_actor_cohort);
  if new.synthetic_cohort_id is not null
    and new.synthetic_cohort_id is distinct from v_expected
  then
    raise exception using errcode = '42501', message = 'SYNTHETIC_COHORT_IDENTITY_REQUIRED';
  end if;
  new.synthetic_cohort_id := v_expected;
  return new;
end;
$function$;

create or replace function private.guard_dispute_cohort()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_expected text;
begin
  v_expected := private.synthetic_job_cohort(new.job_id);
  if v_expected is not null then
    raise exception using errcode = '42501', message = 'SYNTHETIC_DISPUTE_FORBIDDEN';
  end if;
  if new.synthetic_cohort_id is not null then
    raise exception using errcode = '42501', message = 'SYNTHETIC_COHORT_IDENTITY_REQUIRED';
  end if;
  return new;
end;
$function$;

create or replace function private.guard_real_traffic_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_cohort text;
begin
  if tg_table_name = 'customer_payment_methods' then
    v_cohort := private.synthetic_profile_cohort(new.customer_id);
    if new.synthetic_cohort_id is not null then v_cohort := coalesce(v_cohort, new.synthetic_cohort_id); end if;
  elsif tg_table_name in ('worker_payout_methods', 'worker_withdrawal_requests') then
    v_cohort := private.synthetic_profile_cohort(new.worker_id);
    if new.synthetic_cohort_id is not null then v_cohort := coalesce(v_cohort, new.synthetic_cohort_id); end if;
  elsif tg_table_name in (
    'worker_payment_ledger', 'worker_cash_commission_ledger',
    'worker_cash_commission_reconciliations'
  ) then
    v_cohort := private.synthetic_profile_cohort(new.worker_id);
  elsif tg_table_name in (
    'job_payment_orders', 'job_payment_reconciliation_events',
    'worker_direct_payment_collateral_reservations',
    'admin_financial_adjustments', 'reviews'
  ) then
    v_cohort := private.synthetic_job_cohort(new.job_id);
  else
    raise exception using errcode = '0A000', message = 'SYNTHETIC_FINANCE_GUARD_TABLE_UNSUPPORTED';
  end if;
  if v_cohort is not null then
    raise exception using errcode = '42501', message = 'SYNTHETIC_FINANCE_FORBIDDEN';
  end if;
  return new;
end;
$function$;

create or replace function private.guard_synthetic_job_release_boundary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.synthetic_cohort_id is null then return new; end if;
  if new.status not in (
    'draft'::public.job_status,
    'analyzing'::public.job_status,
    'estimate_ready'::public.job_status,
    'awaiting_customer_confirm'::public.job_status,
    'broadcasting'::public.job_status,
    'worker_candidate_pending'::public.job_status,
    'worker_matched'::public.job_status,
    'cancelled'::public.job_status
  ) or new.payment_status <> 'not_started'
    or new.payment_provider is not null
    or new.final_price is not null
    or new.gross_amount is not null
    or new.platform_fee is not null
    or new.worker_net is not null
    or new.completed_at is not null
    or new.confirmed_at is not null
    or new.paid_at is not null
  then
    raise exception using errcode = '42501', message = 'SYNTHETIC_RELEASE_BOUNDARY_EXCEEDED';
  end if;
  return new;
end;
$function$;

create or replace function private.guard_broadcast_synthetic_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job_cohort text;
  v_worker_cohort text;
begin
  select job.synthetic_cohort_id into v_job_cohort
  from public.jobs as job where job.id = new.job_id;
  select worker.synthetic_cohort_id into v_worker_cohort
  from public.worker_profiles as worker where worker.id = new.worker_id;
  if v_job_cohort is distinct from v_worker_cohort then
    return null;
  end if;
  if new.synthetic_cohort_id is not null
    and new.synthetic_cohort_id is distinct from v_job_cohort
  then
    return null;
  end if;
  new.synthetic_cohort_id := v_job_cohort;
  return new;
end;
$function$;

create or replace function private.guard_api_log_cohort()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job_cohort text;
  v_session_cohort text;
  v_expected text;
begin
  v_job_cohort := private.synthetic_job_cohort(new.job_id);
  if new.safe_metadata ? 'session_id' then
    select session.synthetic_cohort_id into v_session_cohort
    from public.kael_chat_sessions as session
    where session.id::text = new.safe_metadata ->> 'session_id';
  end if;
  if v_job_cohort is not null and v_session_cohort is not null
    and v_job_cohort is distinct from v_session_cohort
  then
    raise exception using errcode = '42501', message = 'SYNTHETIC_TELEMETRY_CROSS_COHORT';
  end if;
  v_expected := coalesce(v_job_cohort, v_session_cohort);
  if new.synthetic_cohort_id is not null
    and new.synthetic_cohort_id is distinct from v_expected
  then
    raise exception using errcode = '42501', message = 'SYNTHETIC_COHORT_IDENTITY_REQUIRED';
  end if;
  new.synthetic_cohort_id := v_expected;
  return new;
end;
$function$;

create or replace function private.guard_optimization_metric_cohort()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job_cohort text;
  v_request_min text;
  v_request_max text;
  v_expected text;
begin
  v_job_cohort := private.synthetic_job_cohort(new.job_id);
  select min(log.synthetic_cohort_id), max(log.synthetic_cohort_id)
    into v_request_min, v_request_max
  from public.api_logs as log
  where new.request_id is not null and log.request_id = new.request_id
    and log.synthetic_cohort_id is not null;
  if v_request_min is distinct from v_request_max then
    raise exception using errcode = '42501', message = 'SYNTHETIC_TELEMETRY_CROSS_COHORT';
  end if;
  if v_job_cohort is not null and v_request_min is not null
    and v_job_cohort is distinct from v_request_min
  then
    raise exception using errcode = '42501', message = 'SYNTHETIC_TELEMETRY_CROSS_COHORT';
  end if;
  v_expected := coalesce(v_job_cohort, v_request_min);
  if new.synthetic_cohort_id is not null
    and new.synthetic_cohort_id is distinct from v_expected
  then
    raise exception using errcode = '42501', message = 'SYNTHETIC_COHORT_IDENTITY_REQUIRED';
  end if;
  new.synthetic_cohort_id := v_expected;
  return new;
end;
$function$;

revoke all on function private.guard_customer_favorite_cohort(),
  private.guard_admin_queue_cohort(), private.guard_dispute_cohort(),
  private.guard_real_traffic_finance(), private.guard_synthetic_job_release_boundary(),
  private.guard_broadcast_synthetic_identity(), private.guard_api_log_cohort(),
  private.guard_optimization_metric_cohort()
  from public, anon, authenticated;
grant execute on function private.guard_customer_favorite_cohort(),
  private.guard_admin_queue_cohort(), private.guard_dispute_cohort(),
  private.guard_real_traffic_finance(), private.guard_synthetic_job_release_boundary(),
  private.guard_broadcast_synthetic_identity(), private.guard_api_log_cohort(),
  private.guard_optimization_metric_cohort()
  to service_role;

create or replace trigger customer_favorite_workers_synthetic_guard
before insert or update of customer_id, worker_id, synthetic_cohort_id
on public.customer_favorite_workers
for each row execute function private.guard_customer_favorite_cohort();

create or replace trigger kael_admin_queue_synthetic_guard
before insert or update of job_id, actor_id, synthetic_cohort_id
on public.kael_admin_queue
for each row execute function private.guard_admin_queue_cohort();

create or replace trigger disputes_synthetic_guard
before insert or update of job_id, synthetic_cohort_id on public.disputes
for each row execute function private.guard_dispute_cohort();

create or replace trigger customer_payment_methods_synthetic_guard
before insert or update of customer_id, synthetic_cohort_id on public.customer_payment_methods
for each row execute function private.guard_real_traffic_finance();
create or replace trigger worker_payout_methods_synthetic_guard
before insert or update of worker_id, synthetic_cohort_id on public.worker_payout_methods
for each row execute function private.guard_real_traffic_finance();
create or replace trigger worker_withdrawal_requests_synthetic_guard
before insert or update of worker_id, synthetic_cohort_id on public.worker_withdrawal_requests
for each row execute function private.guard_real_traffic_finance();
create or replace trigger worker_payment_ledger_synthetic_guard
before insert or update of job_id, worker_id on public.worker_payment_ledger
for each row execute function private.guard_real_traffic_finance();
create or replace trigger worker_cash_commission_ledger_synthetic_guard
before insert or update of job_id, worker_id on public.worker_cash_commission_ledger
for each row execute function private.guard_real_traffic_finance();
create or replace trigger worker_cash_commission_reconciliations_synthetic_guard
before insert or update of worker_id on public.worker_cash_commission_reconciliations
for each row execute function private.guard_real_traffic_finance();
create or replace trigger job_payment_orders_synthetic_guard
before insert or update of job_id, customer_id, worker_id on public.job_payment_orders
for each row execute function private.guard_real_traffic_finance();
create or replace trigger job_payment_reconciliation_events_synthetic_guard
before insert or update of job_id on public.job_payment_reconciliation_events
for each row execute function private.guard_real_traffic_finance();
create or replace trigger worker_direct_payment_collateral_synthetic_guard
before insert or update of job_id, worker_id on public.worker_direct_payment_collateral_reservations
for each row execute function private.guard_real_traffic_finance();
create or replace trigger reviews_synthetic_guard
before insert or update of job_id on public.reviews
for each row execute function private.guard_real_traffic_finance();
create or replace trigger admin_financial_adjustments_synthetic_guard
before insert or update of job_id, worker_id on public.admin_financial_adjustments
for each row execute function private.guard_real_traffic_finance();

create or replace trigger zz_jobs_synthetic_release_boundary
before insert or update on public.jobs
for each row execute function private.guard_synthetic_job_release_boundary();

create or replace trigger job_broadcasts_synthetic_identity_guard
before insert or update of job_id, worker_id, synthetic_cohort_id on public.job_broadcasts
for each row execute function private.guard_broadcast_synthetic_identity();

create or replace trigger api_logs_synthetic_guard
before insert or update of job_id, safe_metadata, synthetic_cohort_id on public.api_logs
for each row execute function private.guard_api_log_cohort();
create or replace trigger kael_optimization_metrics_synthetic_guard
before insert or update of job_id, request_id, synthetic_cohort_id on public.kael_optimization_metrics
for each row execute function private.guard_optimization_metric_cohort();
create or replace trigger kael_ab_price_synthesis_cases_synthetic_guard
before insert or update of job_id, request_id, synthetic_cohort_id on public.kael_ab_price_synthesis_cases
for each row execute function private.guard_optimization_metric_cohort();

-- Backfill is cohort-derived and intentionally fails if pre-existing data has
-- crossed the isolation boundary. Production must never silently normalize it.
update public.customer_favorite_workers as favorite
set synthetic_cohort_id = customer_member.cohort_id
from public.synthetic_matching_cohort_members as customer_member,
  public.synthetic_matching_cohort_members as worker_member
where customer_member.profile_id = favorite.customer_id
  and worker_member.profile_id = favorite.worker_id
  and customer_member.cohort_id = worker_member.cohort_id
  and favorite.synthetic_cohort_id is distinct from customer_member.cohort_id;

update public.kael_admin_queue as queue
set synthetic_cohort_id = coalesce(
  (select job.synthetic_cohort_id from public.jobs as job where job.id = queue.job_id),
  (select member.cohort_id from public.synthetic_matching_cohort_members as member
    where member.profile_id = queue.actor_id)
)
where coalesce(
  (select job.synthetic_cohort_id from public.jobs as job where job.id = queue.job_id),
  (select member.cohort_id from public.synthetic_matching_cohort_members as member
    where member.profile_id = queue.actor_id)
) is not null
and queue.synthetic_cohort_id is distinct from coalesce(
  (select job.synthetic_cohort_id from public.jobs as job where job.id = queue.job_id),
  (select member.cohort_id from public.synthetic_matching_cohort_members as member
    where member.profile_id = queue.actor_id)
);

update public.api_logs as log
set synthetic_cohort_id = coalesce(
  (select job.synthetic_cohort_id from public.jobs as job where job.id = log.job_id),
  (select session.synthetic_cohort_id from public.kael_chat_sessions as session
    where session.id::text = log.safe_metadata ->> 'session_id')
)
where coalesce(
  (select job.synthetic_cohort_id from public.jobs as job where job.id = log.job_id),
  (select session.synthetic_cohort_id from public.kael_chat_sessions as session
    where session.id::text = log.safe_metadata ->> 'session_id')
) is not null
and log.synthetic_cohort_id is distinct from coalesce(
  (select job.synthetic_cohort_id from public.jobs as job where job.id = log.job_id),
  (select session.synthetic_cohort_id from public.kael_chat_sessions as session
    where session.id::text = log.safe_metadata ->> 'session_id')
);

update public.kael_optimization_metrics as metric
set synthetic_cohort_id = job.synthetic_cohort_id
from public.jobs as job
where job.id = metric.job_id
  and job.synthetic_cohort_id is not null
  and metric.synthetic_cohort_id is distinct from job.synthetic_cohort_id;

update public.kael_optimization_metrics as metric
set synthetic_cohort_id = coalesce(
  (select job.synthetic_cohort_id from public.jobs as job where job.id = metric.job_id),
  source.synthetic_cohort_id
)
from (
  select request_id, min(synthetic_cohort_id) as synthetic_cohort_id
  from public.api_logs
  where request_id is not null and synthetic_cohort_id is not null
  group by request_id
) as source
where metric.request_id = source.request_id
  and metric.synthetic_cohort_id is distinct from coalesce(
    (select job.synthetic_cohort_id from public.jobs as job where job.id = metric.job_id),
    source.synthetic_cohort_id
  );

update public.kael_ab_price_synthesis_cases as sample
set synthetic_cohort_id = job.synthetic_cohort_id
from public.jobs as job
where job.id = sample.job_id
  and job.synthetic_cohort_id is not null
  and sample.synthetic_cohort_id is distinct from job.synthetic_cohort_id;

update public.kael_ab_price_synthesis_cases as sample
set synthetic_cohort_id = coalesce(
  (select job.synthetic_cohort_id from public.jobs as job where job.id = sample.job_id),
  source.synthetic_cohort_id
)
from (
  select request_id, min(synthetic_cohort_id) as synthetic_cohort_id
  from public.api_logs
  where request_id is not null and synthetic_cohort_id is not null
  group by request_id
) as source
where sample.request_id = source.request_id
  and sample.synthetic_cohort_id is distinct from coalesce(
    (select job.synthetic_cohort_id from public.jobs as job where job.id = sample.job_id),
    source.synthetic_cohort_id
  );

do $block$
begin
  if exists (
    select 1 from public.customer_favorite_workers as favorite
    join public.synthetic_matching_cohort_members as member
      on member.profile_id in (favorite.customer_id, favorite.worker_id)
    where favorite.synthetic_cohort_id is distinct from member.cohort_id
  ) then
    raise exception using errcode = '42501', message = 'SYNTHETIC_FAVORITE_BACKFILL_CONFLICT';
  end if;
  if exists (
    select 1 from public.customer_payment_methods as method
    join public.synthetic_matching_cohort_members as member on member.profile_id = method.customer_id
  ) or exists (
    select 1 from public.worker_payout_methods as method
    join public.synthetic_matching_cohort_members as member on member.profile_id = method.worker_id
  ) or exists (
    select 1 from public.worker_withdrawal_requests as request
    join public.synthetic_matching_cohort_members as member on member.profile_id = request.worker_id
  ) or exists (
    select 1 from public.worker_payment_ledger as ledger
    join public.synthetic_matching_cohort_members as member on member.profile_id = ledger.worker_id
  ) then
    raise exception using errcode = '42501', message = 'SYNTHETIC_FINANCE_BACKFILL_CONFLICT';
  end if;
end;
$block$;

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
    delete from public.worker_stats where worker_id = new.profile_id;
  else
    delete from public.customer_stats where customer_id = new.profile_id;
  end if;
  return new;
end;
$function$;

revoke all on function private.propagate_synthetic_member_scope()
  from public, anon, authenticated;
grant execute on function private.propagate_synthetic_member_scope() to service_role;
create or replace trigger synthetic_matching_members_scope_propagation
after insert or update of cohort_id, member_role
on public.synthetic_matching_cohort_members
for each row execute function private.propagate_synthetic_member_scope();

create or replace function private.recompute_all_actor_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.worker_stats as stats
  using public.synthetic_matching_cohort_members as member
  where stats.worker_id = member.profile_id and member.member_role = 'worker'::public.user_role;
  delete from public.customer_stats as stats
  using public.synthetic_matching_cohort_members as member
  where stats.customer_id = member.profile_id and member.member_role = 'customer'::public.user_role;

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
    where member.profile_id = cp.id and member.member_role = 'customer'::public.user_role
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

comment on function private.recompute_all_actor_stats() is
  'Rebuilds real-marketplace actor metrics only; synthetic smoke identities and jobs are excluded and removed.';

create or replace view public.worker_overview with (security_invoker = on) as
  select wp.id as worker_id, wp.legal_name, wp.rating, wp.total_jobs, wp.is_approved,
         wp.is_available, wp.verification_status, wp.service_types, wp.districts,
         ws.completion_rate, ws.on_time_rate, ws.avg_response_time_min,
         ws.income_30d, ws.jobs_30d, ws.total_income, ws.cancel_rate, ws.last_recomputed_at
  from public.worker_profiles as wp
  left join public.worker_stats as ws on ws.worker_id = wp.id
  where wp.synthetic_cohort_id is null;

create or replace view public.customer_overview with (security_invoker = on) as
  select cp.id as customer_id, cp.building_name, cp.unit_number, cp.district, cp.created_at,
         cs.bookings_total, cs.bookings_30d, cs.total_spent, cs.dispute_free_rate, cs.last_recomputed_at
  from public.customer_profiles as cp
  left join public.customer_stats as cs on cs.customer_id = cp.id
  where not exists (
    select 1 from public.synthetic_matching_cohort_members as member
    where member.profile_id = cp.id and member.member_role = 'customer'::public.user_role
  );

create or replace view public.kael_estimate_accuracy as
with per_job as (
  select
    job.id as job_id,
    job.service_type,
    job.kael_complexity as complexity,
    date_trunc('month', job.completed_at)::date as month,
    job.kael_price_min,
    job.kael_price_max,
    job.final_price,
    case
      when job.final_price < job.kael_price_min then 'under'
      when job.final_price > job.kael_price_max then 'over'
      else 'in_band'
    end as direction,
    case
      when job.final_price < job.kael_price_min
        then (job.kael_price_min - job.final_price)::numeric / greatest(job.kael_price_min, 1)
      when job.final_price > job.kael_price_max
        then (job.final_price - job.kael_price_max)::numeric / greatest(job.kael_price_max, 1)
      else 0::numeric
    end as miss_ratio
  from public.jobs as job
  where job.synthetic_cohort_id is null
    and job.status in ('completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed')
    and job.completed_at is not null
    and job.final_price is not null
    and job.final_price > 0
    and job.kael_price_min is not null
    and job.kael_price_max is not null
    and job.kael_price_min > 0
    and job.kael_price_max >= job.kael_price_min
    and job.kael_complexity is not null
)
select
  service_type,
  complexity,
  month,
  count(*)::bigint as job_count,
  count(*) filter (where direction = 'in_band')::bigint as in_band_count,
  round(count(*) filter (where direction = 'in_band')::numeric / nullif(count(*), 0), 4) as in_band_rate,
  count(*) filter (where direction = 'under')::bigint as under_count,
  count(*) filter (where direction = 'over')::bigint as over_count,
  percentile_cont(0.5) within group (order by miss_ratio) as median_miss_ratio,
  percentile_cont(0.9) within group (order by miss_ratio) as p90_miss_ratio
from per_job
group by service_type, complexity, month;

create or replace view public.kael_cost_daily_summary
with (security_invoker = true)
as
select
  date_trunc('day', created_at)::date as day,
  purpose,
  provider,
  count(*)::integer as call_count,
  count(*) filter (where success)::integer as success_count,
  count(*) filter (where not success)::integer as failure_count,
  count(*) filter (where fallback_used)::integer as fallback_count,
  coalesce(round(sum(cost_usd)::numeric, 6), 0)::numeric(12,6) as total_cost_usd,
  round(avg(cost_usd)::numeric, 6) as avg_cost_per_call_usd,
  round(avg(latency_ms)::numeric, 2) as avg_latency_ms,
  percentile_cont(0.95) within group (order by latency_ms)
    filter (where latency_ms is not null) as p95_latency_ms,
  round(avg(input_tokens)::numeric, 2) as avg_input_tokens,
  round(avg(output_tokens)::numeric, 2) as avg_output_tokens,
  round((count(*) filter (where not success))::numeric / nullif(count(*), 0), 4) as failure_rate
from public.api_logs
where synthetic_cohort_id is null
group by 1, 2, 3;

create or replace view public.kael_cost_projection_daily
with (security_invoker = true)
as
with daily as (
  select
    date_trunc('day', created_at)::date as day,
    count(distinct job_id) filter (where job_id is not null)::integer as observed_jobs,
    count(*)::integer as observed_calls,
    coalesce(sum(cost_usd), 0)::numeric as observed_cost_usd
  from public.api_logs
  where synthetic_cohort_id is null
  group by 1
)
select
  day,
  observed_jobs,
  observed_calls,
  round(observed_cost_usd, 6)::numeric(12,6) as observed_cost_usd,
  round((observed_cost_usd / nullif(observed_jobs, 0))::numeric, 6) as cost_per_job_usd,
  round(((observed_cost_usd / nullif(observed_jobs, 0)) * 1000)::numeric, 2) as projected_1000_jobs_usd,
  round(((observed_cost_usd / nullif(observed_jobs, 0)) * 10000)::numeric, 2) as projected_10000_jobs_usd
from daily;

create or replace view public.kael_monitoring_provider_daily
with (security_invoker = true)
as
select
  date_trunc('day', created_at)::date as day,
  purpose,
  provider,
  count(*)::integer as call_count,
  count(*) filter (where success)::integer as success_count,
  count(*) filter (where not success)::integer as failure_count,
  count(*) filter (where fallback_used)::integer as fallback_count,
  coalesce(round(sum(cost_usd)::numeric, 6), 0)::numeric(12,6) as total_cost_usd,
  round(avg(latency_ms)::numeric, 2) as avg_latency_ms,
  percentile_cont(0.95) within group (order by latency_ms)
    filter (where latency_ms is not null) as p95_latency_ms
from public.api_logs
where synthetic_cohort_id is null
group by 1, 2, 3;

alter policy "Admins read api logs" on public.api_logs
  to authenticated using (private.is_admin() and synthetic_cohort_id is null);
alter policy "Admins read kael optimization metrics" on public.kael_optimization_metrics
  to authenticated using (private.is_admin() and synthetic_cohort_id is null);

create or replace function public.admin_operations_snapshot(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.user_role;
  v_snapshot jsonb;
begin
  select role into v_role from public.profiles where id = p_actor_id;
  if v_role <> 'admin'::public.user_role
     and not (
       v_role = 'admin_operator'::public.user_role
       and exists (
         select 1 from public.admin_operator_accounts
         where user_id = p_actor_id and status = 'active'
           and 'operations.read' = any(capabilities)
       )
     ) then
    raise exception 'admin operations access is required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', pg_catalog.clock_timestamp(),
    'attention', (
      with attention_rows as (
        select 'worker_applications'::text as key, 'workers'::text as target_section,
          10 as sort_order, count(*)::integer as count
        from public.kael_admin_queue
        where synthetic_cohort_id is null
          and queue_type = 'worker_application_review'
          and status in ('open', 'acknowledged')
        union all
        select 'payment_attention', 'transactions', 20, count(*)::integer
        from public.jobs
        where synthetic_cohort_id is null and payment_status = 'amount_mismatch'
        union all
        select 'open_disputes', 'transactions', 30, count(*)::integer
        from public.disputes
        where synthetic_cohort_id is null and status <> 'resolved'
        union all
        select 'other_admin_queue', 'operations', 40, count(*)::integer
        from public.kael_admin_queue
        where synthetic_cohort_id is null
          and queue_type <> 'worker_application_review'
          and status in ('open', 'acknowledged')
      )
      select coalesce(
        jsonb_agg(jsonb_build_object('key', key, 'target_section', target_section, 'count', count)
          order by sort_order) filter (where count > 0),
        '[]'::jsonb
      ) from attention_rows
    ),
    'flow', (
      select coalesce(
        jsonb_agg(jsonb_build_object('status', status, 'count', count) order by status),
        '[]'::jsonb
      )
      from (
        select status::text as status, count(*)::integer as count
        from public.jobs
        where synthetic_cohort_id is null
          and status not in ('paid'::public.job_status, 'reviewed'::public.job_status, 'cancelled'::public.job_status)
        group by status
      ) as active_flow
    ),
    'quality', (
      with quality_rows as (
        select 'workers_suspended'::text as key, 10 as sort_order, count(*)::integer as count
        from public.worker_profiles
        where synthetic_cohort_id is null and is_suspended is true
        union all
        select 'workers_in_verification', 20, count(*)::integer
        from public.worker_profiles
        where synthetic_cohort_id is null
          and verification_status in (
            'submitted'::public.worker_verification_status,
            'under_review'::public.worker_verification_status
          )
      )
      select coalesce(
        jsonb_agg(jsonb_build_object('key', key, 'count', count) order by sort_order),
        '[]'::jsonb
      ) from quality_rows
    ),
    'audit_events', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', id, 'actor_id', actor_id, 'actor_name', actor_name,
          'actor_role', actor_role, 'action', action, 'topic', topic,
          'decision', decision, 'occurred_at', created_at
        ) order by created_at desc),
        '[]'::jsonb
      )
      from (
        select audit.id, audit.actor_id, profile.full_name as actor_name,
          audit.actor_role, audit.action, audit.topic, audit.decision, audit.created_at
        from public.kael_permission_audit as audit
        left join public.profiles as profile on profile.id = audit.actor_id
        where not exists (
          select 1 from public.synthetic_matching_cohort_members as member
          where member.profile_id = audit.actor_id
        )
        order by audit.created_at desc
        limit 20
      ) as recent_audit
    )
  ) into v_snapshot;
  return v_snapshot;
end;
$function$;

revoke execute on function public.admin_operations_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_operations_snapshot(uuid) to service_role;

create or replace function public.cleanup_synthetic_matching_cohort(p_cohort_id text)
returns table(deleted_jobs integer, deleted_sessions integer, cleared_workers integer)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $function$
declare
  v_jobs integer;
  v_sessions integer;
  v_workers integer;
begin
  if p_cohort_id !~ '^synthetic-[a-z0-9-]{8,100}$' then
    raise exception using errcode = '22023', message = 'SYNTHETIC_COHORT_REQUIRED';
  end if;
  -- Scenario rows are disposable, but the actor marker is permanent. Removing
  -- membership here would briefly reclassify an approved test worker as real.
  delete from public.customer_favorite_workers where synthetic_cohort_id = p_cohort_id;
  delete from public.kael_admin_queue where synthetic_cohort_id = p_cohort_id;
  delete from public.disputes where synthetic_cohort_id = p_cohort_id;
  delete from public.customer_payment_methods where synthetic_cohort_id = p_cohort_id;
  delete from public.worker_payout_methods where synthetic_cohort_id = p_cohort_id;
  delete from public.worker_withdrawal_requests where synthetic_cohort_id = p_cohort_id;
  delete from public.api_logs where synthetic_cohort_id = p_cohort_id;
  delete from public.kael_optimization_metrics where synthetic_cohort_id = p_cohort_id;
  delete from public.kael_ab_price_synthesis_cases where synthetic_cohort_id = p_cohort_id;
  delete from public.kael_chat_sessions where synthetic_cohort_id = p_cohort_id;
  get diagnostics v_sessions = row_count;
  delete from public.jobs where synthetic_cohort_id = p_cohort_id;
  get diagnostics v_jobs = row_count;
  update public.worker_profiles
  set matching_push_proven_at = null,
    matching_foreground_active_until = null,
    updated_at = now()
  where synthetic_cohort_id = p_cohort_id;
  get diagnostics v_workers = row_count;
  return query select v_jobs, v_sessions, v_workers;
end;
$function$;

revoke execute on function public.cleanup_synthetic_matching_cohort(text)
  from public, anon, authenticated;
grant execute on function public.cleanup_synthetic_matching_cohort(text) to service_role;
comment on function public.cleanup_synthetic_matching_cohort(text) is
  'Deletes only exact cohort scenario rows and heartbeats; dedicated Customer and Worker actor classification is permanent.';

-- The reserved example.test domain is already required by the binding RPC.
-- Backfill those dedicated identities before the first hosted smoke so an
-- approved test Worker cannot enter real matching during rollout bootstrap.
insert into public.synthetic_matching_cohorts(cohort_id)
values ('synthetic-dedicated-actors')
on conflict do nothing;

insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
select 'synthetic-dedicated-actors', profile.id, profile.role
from public.profiles as profile
join auth.users as identity on identity.id = profile.id
where profile.role in ('customer'::public.user_role, 'worker'::public.user_role)
  and lower(identity.email) like '%@example.test'
on conflict (profile_id) do nothing;

update public.worker_profiles as worker
set synthetic_cohort_id = member.cohort_id,
  matching_push_proven_at = null,
  matching_foreground_active_until = null,
  updated_at = now()
from public.synthetic_matching_cohort_members as member
where member.profile_id = worker.id
  and member.member_role = 'worker'::public.user_role
  and worker.synthetic_cohort_id is distinct from member.cohort_id;

create or replace function public.verify_synthetic_matching_cohort_isolation(
  p_cohort_id text
) returns table(
  cohort_id text,
  member_count integer,
  customer_member_count integer,
  worker_member_count integer,
  job_count integer,
  session_count integer,
  broadcast_count integer,
  favorite_count integer,
  admin_queue_count integer,
  financial_record_count integer,
  real_surface_leak_count integer,
  analytics_leak_count integer
)
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $function$
declare
  v_member_count integer;
  v_customer_count integer;
  v_worker_count integer;
  v_job_count integer;
  v_session_count integer;
  v_broadcast_count integer;
  v_favorite_count integer;
  v_queue_count integer;
  v_financial_count integer;
  v_real_leaks integer;
  v_analytics_leaks integer;
begin
  if p_cohort_id is null or p_cohort_id !~ '^synthetic-[a-z0-9-]{8,100}$' then
    raise exception using errcode = '22023', message = 'SYNTHETIC_COHORT_REQUIRED';
  end if;
  if not exists (
    select 1 from public.synthetic_matching_cohorts as cohort
    where cohort.cohort_id = p_cohort_id
  ) then
    raise exception using errcode = 'P0002', message = 'SYNTHETIC_COHORT_NOT_FOUND';
  end if;

  select count(*)::integer,
    count(*) filter (where member_role = 'customer'::public.user_role)::integer,
    count(*) filter (where member_role = 'worker'::public.user_role)::integer
  into v_member_count, v_customer_count, v_worker_count
  from public.synthetic_matching_cohort_members
  where synthetic_matching_cohort_members.cohort_id = p_cohort_id;
  select count(*)::integer into v_job_count from public.jobs
    where synthetic_cohort_id = p_cohort_id;
  select count(*)::integer into v_session_count from public.kael_chat_sessions
    where synthetic_cohort_id = p_cohort_id;
  select count(*)::integer into v_broadcast_count from public.job_broadcasts
    where synthetic_cohort_id = p_cohort_id;
  select count(*)::integer into v_favorite_count from public.customer_favorite_workers
    where synthetic_cohort_id = p_cohort_id;
  select count(*)::integer into v_queue_count from public.kael_admin_queue
    where synthetic_cohort_id = p_cohort_id;

  select (
    (select count(*) from public.customer_payment_methods as method
      join public.synthetic_matching_cohort_members as member on member.profile_id = method.customer_id
      where member.cohort_id = p_cohort_id)
    + (select count(*) from public.worker_payout_methods as method
      join public.synthetic_matching_cohort_members as member on member.profile_id = method.worker_id
      where member.cohort_id = p_cohort_id)
    + (select count(*) from public.worker_withdrawal_requests as request
      join public.synthetic_matching_cohort_members as member on member.profile_id = request.worker_id
      where member.cohort_id = p_cohort_id)
    + (select count(*) from public.worker_payment_ledger as ledger
      join public.synthetic_matching_cohort_members as member on member.profile_id = ledger.worker_id
      where member.cohort_id = p_cohort_id)
    + (select count(*) from public.worker_cash_commission_ledger as ledger
      join public.synthetic_matching_cohort_members as member on member.profile_id = ledger.worker_id
      where member.cohort_id = p_cohort_id)
    + (select count(*) from public.worker_cash_commission_reconciliations as reconciliation
      join public.synthetic_matching_cohort_members as member on member.profile_id = reconciliation.worker_id
      where member.cohort_id = p_cohort_id)
    + (select count(*) from public.job_payment_orders as payment
      join public.jobs as job on job.id = payment.job_id where job.synthetic_cohort_id = p_cohort_id)
    + (select count(*) from public.worker_direct_payment_collateral_reservations as reservation
      join public.jobs as job on job.id = reservation.job_id where job.synthetic_cohort_id = p_cohort_id)
    + (select count(*) from public.admin_financial_adjustments as adjustment
      join public.jobs as job on job.id = adjustment.job_id where job.synthetic_cohort_id = p_cohort_id)
  )::integer into v_financial_count;

  select (
    (select count(*) from public.jobs as job
      join public.synthetic_matching_cohort_members as member on member.profile_id = job.customer_id
      where member.cohort_id = p_cohort_id and job.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.kael_chat_sessions as session
      join public.synthetic_matching_cohort_members as member on member.profile_id = session.customer_id
      where member.cohort_id = p_cohort_id and session.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.worker_profiles as worker
      join public.synthetic_matching_cohort_members as member on member.profile_id = worker.id
      where member.cohort_id = p_cohort_id and worker.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.job_broadcasts as broadcast
      join public.jobs as job on job.id = broadcast.job_id
      where job.synthetic_cohort_id = p_cohort_id and broadcast.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.job_worker_candidates as candidate
      join public.jobs as job on job.id = candidate.job_id
      where job.synthetic_cohort_id = p_cohort_id and candidate.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.confirmation_operations as operation
      join public.jobs as job on job.id = operation.job_id
      where job.synthetic_cohort_id = p_cohort_id and operation.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.matching_operations as operation
      join public.jobs as job on job.id = operation.job_id
      where job.synthetic_cohort_id = p_cohort_id and operation.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.matching_recipient_deliveries as delivery
      join public.jobs as job on job.id = delivery.job_id
      where job.synthetic_cohort_id = p_cohort_id and delivery.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.worker_matching_proposals as proposal
      join public.jobs as job on job.id = proposal.job_id
      where job.synthetic_cohort_id = p_cohort_id and proposal.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.customer_favorite_workers as favorite
      join public.synthetic_matching_cohort_members as customer_member
        on customer_member.profile_id = favorite.customer_id
      left join public.synthetic_matching_cohort_members as worker_member
        on worker_member.profile_id = favorite.worker_id
      where customer_member.cohort_id = p_cohort_id
        and (favorite.synthetic_cohort_id is distinct from p_cohort_id
          or worker_member.cohort_id is distinct from p_cohort_id))
    + (select count(*) from public.kael_admin_queue as queue
      where (exists (select 1 from public.synthetic_matching_cohort_members as member
          where member.profile_id = queue.actor_id and member.cohort_id = p_cohort_id)
        or exists (select 1 from public.jobs as job
          where job.id = queue.job_id and job.synthetic_cohort_id = p_cohort_id))
        and queue.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.disputes as dispute
      join public.jobs as job on job.id = dispute.job_id
      where job.synthetic_cohort_id = p_cohort_id)
  )::integer into v_real_leaks;

  select (
    (select count(*) from public.api_logs as log
      where (exists (select 1 from public.jobs as job
          where job.id = log.job_id and job.synthetic_cohort_id = p_cohort_id)
        or exists (select 1 from public.kael_chat_sessions as session
          where session.id::text = log.safe_metadata ->> 'session_id'
            and session.synthetic_cohort_id = p_cohort_id))
        and log.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.kael_optimization_metrics as metric
      where (exists (select 1 from public.jobs as job
          where job.id = metric.job_id and job.synthetic_cohort_id = p_cohort_id)
        or exists (select 1 from public.api_logs as log
          where log.request_id = metric.request_id and log.synthetic_cohort_id = p_cohort_id))
        and metric.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.kael_ab_price_synthesis_cases as sample
      where (exists (select 1 from public.jobs as job
          where job.id = sample.job_id and job.synthetic_cohort_id = p_cohort_id)
        or exists (select 1 from public.api_logs as log
          where log.request_id = sample.request_id and log.synthetic_cohort_id = p_cohort_id))
        and sample.synthetic_cohort_id is distinct from p_cohort_id)
    + (select count(*) from public.worker_stats as stats
      join public.synthetic_matching_cohort_members as member on member.profile_id = stats.worker_id
      where member.cohort_id = p_cohort_id)
    + (select count(*) from public.customer_stats as stats
      join public.synthetic_matching_cohort_members as member on member.profile_id = stats.customer_id
      where member.cohort_id = p_cohort_id)
    + case when position('synthetic_cohort_id is null' in lower(
        pg_get_viewdef('public.kael_estimate_accuracy'::regclass, true))) = 0 then 1 else 0 end
    + case when position('synthetic_cohort_id is null' in lower(
        pg_get_viewdef('public.kael_cost_daily_summary'::regclass, true))) = 0 then 1 else 0 end
    + case when position('synthetic_cohort_id is null' in lower(
        pg_get_viewdef('public.kael_cost_projection_daily'::regclass, true))) = 0 then 1 else 0 end
    + case when position('synthetic_cohort_id is null' in lower(
        pg_get_viewdef('public.kael_monitoring_provider_daily'::regclass, true))) = 0 then 1 else 0 end
  )::integer into v_analytics_leaks;

  return query select p_cohort_id, v_member_count, v_customer_count, v_worker_count,
    v_job_count, v_session_count, v_broadcast_count, v_favorite_count, v_queue_count,
    v_financial_count, v_real_leaks, v_analytics_leaks;
end;
$function$;

revoke execute on function public.verify_synthetic_matching_cohort_isolation(text)
  from public, anon, authenticated;
grant execute on function public.verify_synthetic_matching_cohort_isolation(text)
  to service_role;
comment on function public.verify_synthetic_matching_cohort_isolation(text) is
  'Returns aggregate-only Production smoke isolation evidence; no profile or workflow identifiers are exposed.';

create or replace function public.verify_synthetic_matching_cohort_cleanup(
  p_cohort_id text
) returns table(
  member_count integer,
  worker_member_count integer,
  worker_marker_count integer,
  active_delivery_signal_count integer,
  scenario_record_count integer
)
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $function$
begin
  if p_cohort_id is null or p_cohort_id !~ '^synthetic-[a-z0-9-]{8,100}$' then
    raise exception using errcode = '22023', message = 'SYNTHETIC_COHORT_REQUIRED';
  end if;
  return query
  select
    (select count(*)::integer
      from public.synthetic_matching_cohort_members member
      where member.cohort_id = p_cohort_id),
    (select count(*)::integer
      from public.synthetic_matching_cohort_members member
      where member.cohort_id = p_cohort_id
        and member.member_role = 'worker'::public.user_role),
    (select count(*)::integer
      from public.worker_profiles worker
      where worker.synthetic_cohort_id = p_cohort_id),
    (select count(*)::integer
      from public.worker_profiles worker
      where worker.synthetic_cohort_id = p_cohort_id
        and (worker.matching_push_proven_at is not null
          or worker.matching_foreground_active_until is not null)),
    (
      (select count(*) from public.jobs where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.kael_chat_sessions where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.job_broadcasts where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.job_worker_candidates where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.confirmation_operations where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.matching_operations where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.matching_recipient_deliveries where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.worker_matching_proposals where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.customer_favorite_workers where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.kael_admin_queue where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.disputes where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.customer_payment_methods where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.worker_payout_methods where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.worker_withdrawal_requests where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.api_logs where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.kael_optimization_metrics where synthetic_cohort_id = p_cohort_id)
      + (select count(*) from public.kael_ab_price_synthesis_cases where synthetic_cohort_id = p_cohort_id)
    )::integer;
end;
$function$;

revoke execute on function public.verify_synthetic_matching_cohort_cleanup(text)
  from public, anon, authenticated;
grant execute on function public.verify_synthetic_matching_cohort_cleanup(text)
  to service_role;
comment on function public.verify_synthetic_matching_cohort_cleanup(text) is
  'Proves exact-cohort scenario rows and delivery signals are gone while permanent actor classification remains.';

select private.recompute_all_actor_stats();

commit;
