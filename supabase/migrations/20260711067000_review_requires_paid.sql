-- Reviews are a post-payment action. Keep the atomic write authoritative even if
-- another privileged server caller bypasses the Edge transition precheck.
create or replace function public.submit_review_atomic(
  p_job_id uuid,
  p_customer_id uuid,
  p_rating int,
  p_tags text[],
  p_comment text
) returns table (
  ok boolean,
  error_code text,
  review_id uuid,
  job_status public.job_status,
  reviewed_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_job record;
  v_existing_review_id uuid;
  v_review_id uuid;
  v_now timestamptz := now();
begin
  if p_rating < 1 or p_rating > 5 then
    return query select false, 'INVALID_RATING'::text,
      null::uuid, null::public.job_status, null::timestamptz;
    return;
  end if;

  select id, customer_id, worker_id, status
    into v_job
    from public.jobs
    where id = p_job_id;

  if not found or v_job.customer_id <> p_customer_id then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::public.job_status, null::timestamptz;
    return;
  end if;

  if v_job.worker_id is null then
    return query select false, 'INVALID_STATUS'::text,
      null::uuid, null::public.job_status, null::timestamptz;
    return;
  end if;

  select id into v_existing_review_id
    from public.reviews
    where job_id = p_job_id
    limit 1;

  if found then
    return query select false, 'ALREADY_REVIEWED'::text,
      v_existing_review_id, v_job.status, null::timestamptz;
    return;
  end if;

  if v_job.status <> 'paid'::public.job_status then
    return query select false, 'INVALID_STATUS'::text,
      null::uuid, v_job.status, null::timestamptz;
    return;
  end if;

  update public.jobs
    set status = 'reviewed'::public.job_status,
        reviewed_at = v_now
    where id = p_job_id
      and status = 'paid'::public.job_status;

  if not found then
    return query select false, 'STATUS_CHANGED'::text,
      null::uuid, null::public.job_status, null::timestamptz;
    return;
  end if;

  begin
    insert into public.reviews (
      job_id, customer_id, worker_id, rating, tags, comment
    ) values (
      p_job_id,
      p_customer_id,
      v_job.worker_id,
      p_rating,
      coalesce(p_tags, '{}'::text[]),
      nullif(p_comment, '')
    )
    returning id into v_review_id;
  exception
    when unique_violation then
      select id into v_existing_review_id
        from public.reviews
        where job_id = p_job_id
        limit 1;

      return query select false, 'ALREADY_REVIEWED'::text,
        v_existing_review_id, 'reviewed'::public.job_status, v_now;
      return;
  end;

  return query select
    true,
    null::text,
    v_review_id,
    'reviewed'::public.job_status,
    v_now;
end;
$func$;

revoke execute on function public.submit_review_atomic(uuid, uuid, int, text[], text) from public;
revoke execute on function public.submit_review_atomic(uuid, uuid, int, text[], text) from anon;
revoke execute on function public.submit_review_atomic(uuid, uuid, int, text[], text) from authenticated;
grant execute on function public.submit_review_atomic(uuid, uuid, int, text[], text) to service_role;

comment on function public.submit_review_atomic(uuid, uuid, int, text[], text) is
  'Atomic paid-job review submission. Service-role only.';
