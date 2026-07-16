create or replace function public.get_worker_earnings_summary(
  p_worker_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_platform_fee_rate numeric default 0.10
)
returns table (
  worker_id uuid,
  total_jobs_paid bigint,
  gross_earnings bigint,
  platform_fee_total bigint,
  net_earnings bigint,
  pending_payment_count bigint,
  pending_payment_amount bigint,
  from_date timestamptz,
  to_date timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_worker_id is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'invalid earnings range' using errcode = '22023';
  end if;
  if p_platform_fee_rate is null
     or p_platform_fee_rate < 0
     or p_platform_fee_rate > 1 then
    raise exception 'invalid platform fee rate' using errcode = '22023';
  end if;

  return query
  with eligible_jobs as (
    select
      j.status::text as status,
      coalesce(j.final_price, 0)::bigint as final_price,
      j.gross_amount,
      j.platform_fee,
      j.worker_net,
      j.paid_at
    from public.jobs j
    where j.worker_id = p_worker_id
      and j.status::text in (
        'paid',
        'reviewed',
        'confirmed_by_customer',
        'payment_pending'
      )
      and (
        (
          j.paid_at is not null
          and (p_from is null or j.paid_at >= p_from)
          and (p_to is null or j.paid_at <= p_to)
        )
        or
        (
          j.paid_at is null
          and (p_from is null or j.created_at >= p_from)
          and (p_to is null or j.created_at <= p_to)
        )
      )
  ), paid_jobs as (
    select
      coalesce(gross_amount, final_price)::bigint as paid_gross,
      coalesce(
        platform_fee,
        round(coalesce(gross_amount, final_price)::numeric * p_platform_fee_rate)
      )::bigint as paid_fee,
      worker_net
    from eligible_jobs
    where paid_at is not null
  )
  select
    p_worker_id,
    (select count(*) from paid_jobs),
    coalesce((select sum(paid_gross) from paid_jobs), 0)::bigint,
    coalesce((select sum(paid_fee) from paid_jobs), 0)::bigint,
    coalesce((
      select sum(coalesce(worker_net, paid_gross - paid_fee))
      from paid_jobs
    ), 0)::bigint,
    (
      select count(*)
      from eligible_jobs
      where paid_at is null
        and status in ('confirmed_by_customer', 'payment_pending', 'reviewed')
    ),
    coalesce((
      select sum(final_price)
      from eligible_jobs
      where paid_at is null
        and status in ('confirmed_by_customer', 'payment_pending', 'reviewed')
    ), 0)::bigint,
    p_from,
    p_to;
end;
$$;

revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) from public;
revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) from anon;
revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) from authenticated;
grant execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) to service_role;

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

create or replace function public.get_worker_performance_insights_aggregate(
  p_worker_id uuid
)
returns table (
  profile_exists boolean,
  is_approved boolean,
  is_available boolean,
  is_suspended boolean,
  profile_rating numeric,
  profile_total_jobs bigint,
  verification_status text,
  total_broadcast_count bigint,
  responded_broadcast_count bigint,
  accepted_broadcast_count bigint,
  average_response_minutes integer,
  completed_job_count bigint,
  scheduled_arrival_job_count bigint,
  on_time_job_count bigint,
  paid_job_count bigint,
  reconciled_earnings_vnd bigint,
  review_count bigint,
  average_review_rating numeric,
  work_response_review_count bigint,
  work_response_score integer,
  resolved_incident_case_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with delivered_broadcasts as (
    select
      jb.status::text as status,
      jb.broadcast_at,
      jb.sent_at,
      jb.responded_at
    from public.job_broadcasts jb
    where jb.worker_id = p_worker_id
      and (
        jb.status::text in (
          'sent',
          'accepted',
          'declined',
          'expired',
          'cancelled',
          'reassigned'
        )
        or jb.sent_at is not null
        or jb.broadcast_at is not null
      )
  ), responded_broadcasts as (
    select *
    from delivered_broadcasts
    where status in ('accepted', 'declined')
      and responded_at is not null
  ), response_durations as (
    select extract(epoch from (responded_at - coalesce(sent_at, broadcast_at))) / 60 as minutes
    from responded_broadcasts
    where coalesce(sent_at, broadcast_at) is not null
      and responded_at >= coalesce(sent_at, broadcast_at)
  ), worker_jobs as (
    select
      j.status::text as status,
      j.scheduled_at,
      j.arrived_at,
      j.completed_at,
      j.paid_at,
      j.reviewed_at,
      coalesce(j.final_price, 0)::bigint as final_price
    from public.jobs j
    where j.worker_id = p_worker_id
  ), classified_jobs as (
    select
      worker_jobs.*,
      (
        status in (
          'completed_by_worker',
          'confirmed_by_customer',
          'payment_pending',
          'paid',
          'reviewed'
        )
        or completed_at is not null
        or paid_at is not null
        or reviewed_at is not null
      ) as is_completed,
      (scheduled_at is not null and arrived_at is not null) as has_scheduled_arrival,
      (
        scheduled_at is not null
        and arrived_at is not null
        and arrived_at <= scheduled_at + interval '5 minutes'
      ) as is_on_time,
      (
        (status in ('paid', 'reviewed') or paid_at is not null)
        and final_price > 0
      ) as is_paid
    from worker_jobs
  ), worker_reviews as (
    select r.rating, r.tags
    from public.reviews r
    where r.worker_id = p_worker_id
  ), scored_reviews as (
    select greatest(
      0,
      least(
        100,
        round((wr.rating::numeric / 5) * 80)::integer
        + case when exists (
          select 1
          from unnest(coalesce(wr.tags, '{}'::text[])) tag
          where lower(btrim(tag)) = any(array[
            'chuyên nghiệp',
            'professional',
            'giải thích rõ ràng',
            'explained clearly',
            'phản hồi nhanh',
            'responsive',
            'trao đổi rõ ràng',
            'clear communication'
          ]::text[])
        ) then 20 else 0 end
        - case when exists (
          select 1
          from unnest(coalesce(wr.tags, '{}'::text[])) tag
          where lower(btrim(tag)) = any(array[
            'phản hồi chậm',
            'slow response',
            'khó trao đổi',
            'unclear communication'
          ]::text[])
        ) then 20 else 0 end
      )
    )::integer as score
    from worker_reviews wr
    where wr.rating between 1 and 5
  )
  select
    exists(select 1 from public.worker_profiles wp where wp.id = p_worker_id),
    coalesce((select wp.is_approved from public.worker_profiles wp where wp.id = p_worker_id), false),
    coalesce((select wp.is_available from public.worker_profiles wp where wp.id = p_worker_id), false),
    coalesce((select wp.is_suspended from public.worker_profiles wp where wp.id = p_worker_id), false),
    coalesce((select wp.rating from public.worker_profiles wp where wp.id = p_worker_id), 0),
    coalesce((select wp.total_jobs from public.worker_profiles wp where wp.id = p_worker_id), 0)::bigint,
    (select wp.verification_status::text from public.worker_profiles wp where wp.id = p_worker_id),
    (select count(*) from delivered_broadcasts),
    (select count(*) from responded_broadcasts),
    (select count(*) from delivered_broadcasts where status = 'accepted'),
    (select round(avg(minutes))::integer from response_durations),
    (select count(*) from classified_jobs where is_completed),
    (select count(*) from classified_jobs where has_scheduled_arrival),
    (select count(*) from classified_jobs where is_on_time),
    (select count(*) from classified_jobs where is_paid),
    coalesce((select sum(final_price) from classified_jobs where is_paid), 0)::bigint,
    (select count(*) from worker_reviews),
    (select round(avg(rating)::numeric, 1) from worker_reviews where rating between 1 and 5),
    (select count(*) from scored_reviews),
    (select round(avg(score))::integer from scored_reviews),
    (
      select count(*)
      from public.scope_change_requests scr
      where scr.worker_id = p_worker_id
        and scr.status::text in ('approved_by_customer', 'rejected_by_customer')
        and scr.kael_review is not null
    );
$$;

revoke execute on function public.get_worker_performance_insights_aggregate(uuid) from public;
revoke execute on function public.get_worker_performance_insights_aggregate(uuid) from anon;
revoke execute on function public.get_worker_performance_insights_aggregate(uuid) from authenticated;
grant execute on function public.get_worker_performance_insights_aggregate(uuid) to service_role;
