begin;

create or replace function public.insert_notification_atomic(
  p_user_id uuid, p_job_id uuid, p_event_type text, p_title text, p_body text,
  p_safe_metadata jsonb default '{}'::jsonb
) returns table(notification_id uuid, created_at_ts timestamptz)
language plpgsql security invoker set search_path = '' as $func$
begin
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
  end if;
  insert into public.notifications(user_id,job_id,event_type,title,body,safe_metadata)
    values(p_user_id,p_job_id,left(p_event_type,120),left(p_title,160),left(p_body,500),
      coalesce(p_safe_metadata,'{}'::jsonb))
    returning id,created_at into notification_id,created_at_ts;
  return next;
end;
$func$;
revoke all on function public.insert_notification_atomic(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.insert_notification_atomic(uuid,uuid,text,text,text,jsonb) to service_role;

create or replace function private.notify_worker_customer_cancellation()
returns trigger language plpgsql security definer set search_path = '' as $func$
begin
  if new.status <> 'requested' or new.worker_id is null
    or new.sub_case not in ('after_worker_accept','scheduled_job') then return new; end if;
  perform public.insert_notification_atomic(new.worker_id,new.job_id,'customer_cancelled_after_accept',
    'Khách đã hủy yêu cầu',
    case when new.sub_case='scheduled_job'
      then 'Khách đã hủy lịch sắp tới. Bạn không cần tiếp tục công việc này.'
      else 'Khách đã hủy yêu cầu. Bạn không cần tiếp tục công việc này.' end,
    jsonb_build_object('cancellation_id',new.id,'sub_case',new.sub_case,'phase0_no_monetary_penalty',true));
  return new;
end;
$func$;
revoke all on function private.notify_worker_customer_cancellation() from public,anon,authenticated;

do $trigger_guard$
begin
  if not exists(select 1 from pg_catalog.pg_trigger
    where tgrelid='public.customer_cancellation_records'::regclass
      and tgname='customer_cancellation_notify_worker' and not tgisinternal) then
    create trigger customer_cancellation_notify_worker after insert on public.customer_cancellation_records
      for each row execute function private.notify_worker_customer_cancellation();
  end if;
end;
$trigger_guard$;
commit;
