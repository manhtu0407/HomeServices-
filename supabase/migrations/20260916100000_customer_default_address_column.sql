-- Adds a real, backend-persisted default address for customers.
-- Today the mobile Address screen only writes a free-text address into
-- Supabase Auth's user_metadata (client-only), while the backend's own
-- "has address" signal (get_customer_profile_insights_aggregate) checks
-- customer_profiles.building_name/unit_number/floor/district — columns no
-- shipped UI flow has ever populated. This column, plus the address save
-- endpoint that writes it, closes that gap so the signal is real.

alter table customer_profiles add column default_address text;

-- Access note: no grant or policy change. authenticated is read-only on
-- customer_profiles (20260518032000 revoked its DML; the owner write policy from
-- the init schema was dropped in 20260513114845), so this column is written only
-- by mobile-api through service_role, and read back by the owner under the
-- existing "Users read own customer profile" select policy.

create or replace function public.get_customer_profile_insights_aggregate(
  p_customer_id uuid
)
returns table (
  member_since timestamptz,
  has_primary_address boolean,
  kael_interaction_count bigint,
  completed_service_count bigint,
  preferred_service_count bigint,
  active_service_days bigint,
  active_streak_days bigint,
  positive_review_rate_percent integer,
  fair_price_service_count bigint,
  price_savings_vnd bigint,
  total_spend_vnd bigint,
  reviewed_service_count bigint,
  protected_value_vnd bigint,
  protected_transaction_count bigint,
  total_transaction_count bigint,
  disputed_transaction_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with customer_jobs as (
    select
      j.id,
      j.status::text as status,
      j.service_type::text as service_type,
      j.created_at,
      j.completed_at,
      j.confirmed_at,
      j.paid_at,
      j.reviewed_at,
      coalesce(j.final_price, 0)::bigint as final_price,
      coalesce(j.kael_price_max, 0)::bigint as kael_price_max,
      (
        j.status::text in (
          'completed_by_worker',
          'confirmed_by_customer',
          'payment_pending',
          'paid',
          'reviewed'
        )
        or j.completed_at is not null
        or j.confirmed_at is not null
        or j.paid_at is not null
        or j.reviewed_at is not null
      ) as is_completed,
      (
        j.status::text in (
          'confirmed_by_customer',
          'payment_pending',
          'paid',
          'reviewed'
        )
        and coalesce(j.final_price, 0) > 0
      ) as is_transaction
    from public.jobs j
    where j.customer_id = p_customer_id
  ), classified_jobs as (
    select
      customer_jobs.*,
      (
        is_transaction
        and final_price > 0
        and kael_price_max > 0
        and final_price <= kael_price_max
      ) as is_fair_price,
      coalesce(reviewed_at, paid_at, completed_at, confirmed_at, created_at) as activity_at
    from customer_jobs
  ), activity_days as (
    select distinct (activity_at at time zone 'UTC')::date as activity_day
    from classified_jobs
    where is_completed and activity_at is not null
  ), ordered_activity_days as (
    select
      activity_day,
      row_number() over (order by activity_day desc) as position,
      max(activity_day) over () as newest_day
    from activity_days
  ), streak as (
    select count(*) filter (
      where activity_day = newest_day - ((position - 1)::integer)
    )::bigint as day_count
    from ordered_activity_days
  ), valid_customer_reviews as (
    select r.rating
    from public.reviews r
    where r.customer_id = p_customer_id
      and r.rating between 1 and 5
  )
  select
    coalesce(
      (select p.created_at from public.profiles p where p.id = p_customer_id),
      (select cp.created_at from public.customer_profiles cp where cp.id = p_customer_id),
      (select min(created_at) from classified_jobs)
    ),
    coalesce((
      select
        nullif(btrim(coalesce(cp.building_name, '')), '') is not null
        or nullif(btrim(coalesce(cp.unit_number, '')), '') is not null
        or nullif(btrim(coalesce(cp.floor, '')), '') is not null
        or nullif(btrim(coalesce(cp.district, '')), '') is not null
        or nullif(btrim(coalesce(cp.default_address, '')), '') is not null
      from public.customer_profiles cp
      where cp.id = p_customer_id
    ), false),
    (select count(*) from public.kael_chat_sessions ks where ks.customer_id = p_customer_id),
    (select count(*) from classified_jobs where is_completed),
    (
      select count(distinct service_type)
      from classified_jobs
      where is_completed
        and service_type in (
          'electrical',
          'plumbing',
          'cleaning',
          'hvac',
          'upholstery',
          'handyman'
        )
    ),
    (select count(*) from activity_days),
    coalesce((select day_count from streak), 0),
    coalesce((
      select round(
        count(*) filter (where rating >= 4)::numeric * 100 / nullif(count(*), 0)
      )::integer
      from valid_customer_reviews
    ), 0),
    (select count(*) from classified_jobs where is_fair_price),
    coalesce((
      select sum(greatest(0, kael_price_max - final_price))
      from classified_jobs
      where is_fair_price
    ), 0)::bigint,
    coalesce((
      select sum(final_price)
      from classified_jobs
      where is_transaction
    ), 0)::bigint,
    (
      select count(*)
      from classified_jobs
      where is_completed and (status = 'reviewed' or reviewed_at is not null)
    ),
    coalesce((
      select sum(final_price)
      from classified_jobs
      where is_fair_price
    ), 0)::bigint,
    (select count(*) from classified_jobs where is_fair_price),
    (select count(*) from classified_jobs where is_transaction),
    (
      select count(*)
      from classified_jobs cj
      where cj.is_transaction
        and exists (
          select 1
          from public.disputes d
          where d.job_id = cj.id
            and lower(btrim(d.status::text)) not in ('cancelled', 'withdrawn')
        )
    );
$$;

revoke execute on function public.get_customer_profile_insights_aggregate(uuid) from public;
revoke execute on function public.get_customer_profile_insights_aggregate(uuid) from anon;
revoke execute on function public.get_customer_profile_insights_aggregate(uuid) from authenticated;
grant execute on function public.get_customer_profile_insights_aggregate(uuid) to service_role;

-- Account deletion nulls customer_profiles column by column inside
-- prepare_customer_account_deletion, but that function cannot be redefined here: the
-- expand-only release audit refuses DELETE FROM in stored SQL and the function is full of
-- them. A trigger on the same state change carries the new column instead, inside the
-- deletion's own transaction, so a deleted customer's home address does not outlive the
-- erasure.
create or replace function private.scrub_customer_default_address_on_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.customer_profiles
  set default_address = null
  where id = new.id;

  return new;
end;
$function$;

revoke execute on function private.scrub_customer_default_address_on_deletion()
from public, anon, authenticated;

create trigger profiles_scrub_customer_default_address
  after update of account_state on public.profiles
  for each row
  when (new.account_state = 'deletion_processing' and old.account_state is distinct from new.account_state)
  execute function private.scrub_customer_default_address_on_deletion();
