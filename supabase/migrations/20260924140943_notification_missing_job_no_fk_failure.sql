begin;

CREATE OR REPLACE FUNCTION public.insert_notification_atomic(p_user_id uuid, p_job_id uuid, p_event_type text, p_title text, p_body text, p_safe_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(notification_id uuid, created_at_ts timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_candidate_id uuid;
begin
  if p_event_type in ('worker_matched','customer_confirmed_worker') then
    select candidate.id into v_candidate_id from public.jobs job
      join public.job_worker_candidates candidate on candidate.job_id=job.id and candidate.worker_id=job.worker_id
      where job.id=p_job_id and candidate.status='customer_confirmed'
        and ((p_event_type='worker_matched' and p_user_id=job.customer_id)
          or (p_event_type='customer_confirmed_worker' and p_user_id=job.worker_id))
        and (not coalesce(p_safe_metadata ? 'candidate_id',false)
          or candidate.id::text=p_safe_metadata->>'candidate_id')
      order by candidate.customer_decided_at desc,candidate.id limit 1 for update of job;
    if not found then raise exception using errcode='22023',message='OFFICIAL_MATCH_NOTIFICATION_NOT_AUTHORIZED'; end if;
    select notice.id,notice.created_at into notification_id,created_at_ts from public.notifications notice
      where notice.job_id=p_job_id and notice.user_id=p_user_id and notice.event_type=p_event_type
        and notice.safe_metadata->>'candidate_id'=v_candidate_id::text
      order by notice.created_at,notice.id limit 1;
    if found then return next; return; end if;
    p_safe_metadata:=coalesce(p_safe_metadata,'{}'::jsonb)||jsonb_build_object('candidate_id',v_candidate_id);
  end if;
  if p_event_type = 'customer_cancelled_after_accept' then
    -- Cancellation and retry use the same job lock, so both return the committed inbox receipt.
    perform 1 from public.jobs as job
      where job.id=p_job_id and job.status='cancelled' and job.worker_id=p_user_id
        and exists(select 1 from public.customer_cancellation_records as cancellation
          where cancellation.job_id=job.id and cancellation.customer_id=job.customer_id
            and cancellation.worker_id=p_user_id and cancellation.status in ('requested','reviewed')
            and cancellation.sub_case in ('after_worker_accept','scheduled_job'))
      for update of job;
    if not found then
      raise exception using errcode='22023', message='CANCELLATION_NOTIFICATION_NOT_AUTHORIZED';
    end if;
    select notice.id, notice.created_at into notification_id, created_at_ts
      from public.notifications as notice
      where notice.job_id=p_job_id and notice.user_id=p_user_id and notice.event_type=p_event_type
      order by notice.created_at, notice.id limit 1;
    if found then return next; return; end if;
  elsif p_event_type='customer_rejected_worker' then
    perform 1 from public.jobs job join public.job_worker_candidates candidate on candidate.job_id=job.id
      where job.id=p_job_id and candidate.worker_id=p_user_id and candidate.status='customer_declined'
        and candidate.id::text=p_safe_metadata->>'candidate_id' for update of job;
    if not found then
      raise exception using errcode='22023',message='CANDIDATE_NOTIFICATION_NOT_AUTHORIZED';
    end if;
    select notice.id,notice.created_at into notification_id,created_at_ts from public.notifications notice
      where notice.job_id=p_job_id and notice.user_id=p_user_id and notice.event_type=p_event_type
        and notice.safe_metadata->>'candidate_id'=p_safe_metadata->>'candidate_id'
      order by notice.created_at,notice.id limit 1;
    if found then return next; return; end if;
  end if;
  if p_job_id is not null then
    -- A job deleted while its notification was in flight (synthetic cleanup, account deletion) has
    -- no inbox left, so return no receipt instead of a foreign-key failure. The key-share lock keeps
    -- a surviving job from being deleted before this insert commits.
    perform 1 from public.jobs as job where job.id = p_job_id for key share;
    if not found then return; end if;
  end if;
  insert into public.notifications(user_id,job_id,event_type,title,body,safe_metadata)
    values(p_user_id,p_job_id,left(p_event_type,120),left(p_title,160),left(p_body,500),
      coalesce(p_safe_metadata,'{}'::jsonb))
    returning id,created_at into notification_id,created_at_ts;
  return next;
end;
$function$;

commit;
