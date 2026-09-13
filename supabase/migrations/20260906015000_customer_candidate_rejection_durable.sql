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
  insert into public.notifications(user_id,job_id,event_type,title,body,safe_metadata)
    values(p_user_id,p_job_id,left(p_event_type,120),left(p_title,160),left(p_body,500),
      coalesce(p_safe_metadata,'{}'::jsonb))
    returning id,created_at into notification_id,created_at_ts;
  return next;
end;
$func$;

create or replace function public.reject_worker_candidate_atomic(
  p_job_id uuid, p_candidate_id uuid, p_customer_id uuid
) returns table(ok boolean, error_code text, job_status public.job_status,
  candidate_id uuid, worker_id uuid, already_applied boolean)
language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_candidate public.job_worker_candidates%rowtype;
  v_parent public.matching_operations%rowtype;
  v_confirmation public.confirmation_operations%rowtype;
  v_preference public.job_matching_preferences%rowtype;
  v_now timestamptz;
  v_expired boolean;
begin
  select job.* into v_job from public.jobs job where job.id=p_job_id for update;
  if not found or p_customer_id is null or v_job.customer_id is distinct from p_customer_id
    or not exists(select 1 from public.profiles actor where actor.id=p_customer_id and actor.role='customer') then
    return query select false,'NOT_FOUND'::text,null::public.job_status,null::uuid,null::uuid,false;
    return;
  end if;
  select candidate.* into v_candidate from public.job_worker_candidates candidate
    where candidate.id=p_candidate_id and candidate.job_id=v_job.id for update;
  if not found then
    return query select false,'NOT_FOUND'::text,v_job.status,null::uuid,null::uuid,false;
    return;
  end if;
  -- A replay acknowledges only its original decision and never retires a newer candidate.
  if v_candidate.status in ('customer_declined','expired') then
    return query select true,null::text,v_job.status,v_candidate.id,v_candidate.worker_id,true;
    return;
  end if;
  if v_candidate.status<>'proposed' or v_job.status<>'worker_candidate_pending' or v_job.worker_id is not null then
    return query select false,'INVALID_STATUS'::text,v_job.status,v_candidate.id,v_candidate.worker_id,false;
    return;
  end if;
  v_now:=clock_timestamp();
  v_expired:=v_candidate.expires_at is not null and v_candidate.expires_at<=v_now;
  update public.job_worker_candidates set
    status=case when v_expired then 'expired' else 'customer_declined' end,
    customer_decided_at=case when v_expired then customer_decided_at else v_now end,updated_at=v_now
    where id=v_candidate.id;
  update public.jobs set status='broadcasting',worker_id=null,matched_at=null,broadcast_at=null where id=v_job.id;
  update public.worker_matching_proposals proposal set
    status=case when v_expired then 'expired' else 'customer_declined' end,updated_at=v_now
    where proposal.candidate_id=v_candidate.id and proposal.status='proposed';
  update public.job_broadcasts set status='expired',responded_at=coalesce(responded_at,v_now)
    where job_id=v_job.id and status in ('pending','sent','accepted');
  update public.matching_recipient_deliveries set status='expired',updated_at=v_now
    where job_id=v_job.id and status in ('queued','delivered','seen','accepted');
  update public.matching_capacity_reservations set status='released',released_at=v_now,updated_at=v_now
    where job_id=v_job.id and status in ('held','offered');

  select matching.* into v_parent from public.matching_operations matching where matching.job_id=v_job.id
    order by matching.created_at desc,matching.id desc limit 1 for update;
  select confirmation.* into v_confirmation from public.confirmation_operations confirmation
    where confirmation.job_id=v_job.id and confirmation.customer_id=p_customer_id for update;
  -- Fence dispatchers before replacing their receipt; a late settlement must lose its lease.
  update public.workflow_outbox outbox set status='completed',lease_token=null,leased_by=null,
    lease_expires_at=null,last_error_code=null,updated_at=v_now
    where outbox.event_type in ('matching_requested','matching_reconcile')
      and (outbox.operation_id=v_confirmation.id or exists(
        select 1 from public.matching_operations matching where matching.job_id=v_job.id
          and matching.id=coalesce(outbox.retry_matching_operation_id,outbox.replacement_matching_operation_id)))
      and outbox.status in ('queued','processing','failed');
  update public.matching_operations set state='stopped',updated_at=v_now
    where job_id=v_job.id and state in ('queued','broadcasting','candidate_ready','recovery_required');

  if v_parent.id is not null and v_confirmation.id is not null
    and v_parent.confirmation_operation_id=v_confirmation.id
    and v_confirmation.quote_mode is not distinct from v_job.quote_mode
    and v_parent.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
    and v_confirmation.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id then
    update public.matching_operations set state='no_reachable_worker',updated_at=v_now where id=v_parent.id;
    update public.confirmation_operations set state='no_reachable_worker',last_error_code=null,
      retry_after_ms=null,updated_at=v_now where id=v_confirmation.id;
    select preference.* into v_preference from public.job_matching_preferences preference where preference.job_id=v_job.id;
    begin
      if v_preference.job_id is null or v_preference.strategy='general' or v_preference.fallback_at is not null then
        perform private.queue_job_matching_continuation(v_job.id,p_customer_id,v_candidate.id,
          v_parent.id,'customer_explicit');
      elsif v_preference.strategy='saved_worker_first' and v_preference.auto_general then
        perform private.queue_job_matching_continuation(v_job.id,p_customer_id,v_candidate.id,
          v_parent.id,'saved_worker_fallback');
        update public.job_matching_preferences set fallback_at=clock_timestamp(),
          fallback_reason=case when v_expired then 'saved_worker_expired' else 'saved_worker_unavailable' end
          where job_id=v_job.id;
      end if;
    exception when object_not_in_prerequisite_state then
      -- Lack of supply cannot undo the Customer's rejection; the existing retry route remains available.
      if sqlerrm<>'COVERAGE_UNAVAILABLE' then raise; end if;
    end;
  else
    -- Legacy jobs keep their decision without fabricating a missing Customer confirmation.
    if v_parent.id is null then
      insert into public.matching_operations(job_id,state,synthetic_cohort_id)
        values(v_job.id,'recovery_required',v_job.synthetic_cohort_id);
    else
      update public.matching_operations set state='recovery_required',updated_at=v_now where id=v_parent.id;
    end if;
    update public.confirmation_operations set state='recovery_required',
      last_error_code='LEGACY_MATCHING_REQUIRES_REVIEW',retry_after_ms=null,updated_at=v_now where id=v_confirmation.id;
  end if;

  insert into public.job_events(job_id,event_type,from_status,to_status,safe_metadata)
    values(v_job.id,case when v_expired then 'worker_candidate_expired' else 'customer_rejected_worker' end,
      'worker_candidate_pending','broadcasting',jsonb_build_object('candidate_id',v_candidate.id,
        'worker_id',v_candidate.worker_id,'customer_id',p_customer_id));
  if not v_expired then
    perform public.insert_notification_atomic(v_candidate.worker_id,v_job.id,'customer_rejected_worker',
      'Khách đã chọn tìm thợ khác','Đề xuất của bạn đã được đóng.',jsonb_build_object('candidate_id',v_candidate.id));
  end if;
  return query select true,null::text,'broadcasting'::public.job_status,v_candidate.id,v_candidate.worker_id,false;
end;
$func$;

revoke all on function public.reject_worker_candidate_atomic(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reject_worker_candidate_atomic(uuid,uuid,uuid) to service_role;

commit;
