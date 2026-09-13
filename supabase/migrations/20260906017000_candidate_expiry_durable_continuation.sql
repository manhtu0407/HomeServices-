begin;

create or replace function private.reconcile_closed_candidate_matching(p_job_id uuid,p_candidate_id uuid)
returns void language plpgsql security definer set search_path='' as $func$
declare
  v_job public.jobs%rowtype;
  v_candidate public.job_worker_candidates%rowtype;
  v_parent public.matching_operations%rowtype;
  v_confirmation public.confirmation_operations%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_event text;
begin
  select job.* into strict v_job from public.jobs job where job.id=p_job_id for update;
  select candidate.* into strict v_candidate from public.job_worker_candidates candidate
    where candidate.id=p_candidate_id and candidate.job_id=v_job.id;
  if v_candidate.status not in ('expired','withdrawn') or v_job.status<>'broadcasting' or v_job.worker_id is not null then
    raise exception using errcode='55000',message='CANDIDATE_RECOVERY_NOT_READY';
  end if;
  select matching.* into v_parent from public.matching_operations matching
    join public.matching_recipient_deliveries delivery on delivery.operation_id=matching.id
    where delivery.broadcast_id=v_candidate.broadcast_id and delivery.job_id=v_job.id
      and matching.job_id=v_job.id for update of matching;
  select confirmation.* into v_confirmation from public.confirmation_operations confirmation
    where confirmation.job_id=v_job.id and confirmation.customer_id=v_job.customer_id for update;
  v_now:=clock_timestamp();
  v_event:=case when v_candidate.status='expired' then 'worker_candidate_expired' else 'worker_candidate_became_ineligible' end;
  insert into public.job_events(job_id,event_type,from_status,to_status,safe_metadata)
    values(v_job.id,v_event,'worker_candidate_pending','broadcasting',
      jsonb_build_object('candidate_id',v_candidate.id,'worker_id',v_candidate.worker_id));

  -- Another recipient's durable offer survives one candidate's expiry.
  if v_parent.id is not null and exists(
    select 1 from public.matching_recipient_deliveries delivery
      join public.job_broadcasts broadcast on broadcast.id=delivery.broadcast_id
      join public.matching_capacity_reservations capacity on capacity.job_id=delivery.job_id
        and capacity.worker_id=delivery.worker_id and capacity.operation_id=v_parent.confirmation_operation_id
    where delivery.operation_id=v_parent.id and delivery.job_id=v_job.id
      and delivery.broadcast_id<>v_candidate.broadcast_id and delivery.status in ('queued','delivered','seen')
      and delivery.expires_at>v_now and broadcast.status='sent' and broadcast.expires_at>v_now
      and capacity.status in ('held','offered') and capacity.expires_at>v_now) then
    update public.matching_operations set state='broadcasting',updated_at=v_now where id=v_parent.id;
    update public.confirmation_operations set state='broadcasting',last_error_code=null,retry_after_ms=null,
      updated_at=v_now where id=v_parent.confirmation_operation_id;
    return;
  end if;
  update public.workflow_outbox outbox set status='completed',lease_token=null,leased_by=null,
    lease_expires_at=null,last_error_code=null,updated_at=v_now
    where outbox.event_type in ('matching_requested','matching_reconcile')
      and (outbox.operation_id=v_confirmation.id
        or coalesce(outbox.retry_matching_operation_id,outbox.replacement_matching_operation_id)=v_parent.id)
      and outbox.status in ('queued','processing','failed');
  update public.job_broadcasts set status='expired',responded_at=coalesce(responded_at,v_now)
    where job_id=v_job.id and status in ('pending','sent','accepted');
  update public.matching_recipient_deliveries set status='expired',updated_at=v_now
    where job_id=v_job.id and status in ('queued','delivered','seen','accepted');
  update public.matching_capacity_reservations set status='released',released_at=v_now,updated_at=v_now
    where job_id=v_job.id and status in ('held','offered');
  if v_parent.id is null or v_confirmation.id is null or v_job.quote_mode is null
    or v_parent.confirmation_operation_id is distinct from v_confirmation.id
    or v_parent.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or v_confirmation.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id then
    if v_parent.id is null then
      insert into public.matching_operations(job_id,state,synthetic_cohort_id)
        values(v_job.id,'recovery_required',v_job.synthetic_cohort_id);
    else
      update public.matching_operations set state='recovery_required',updated_at=v_now where id=v_parent.id;
    end if;
    update public.confirmation_operations set state='recovery_required',
      last_error_code='LEGACY_MATCHING_REQUIRES_REVIEW',retry_after_ms=null,updated_at=v_now where id=v_confirmation.id;
    return;
  end if;
  update public.matching_operations set state='no_reachable_worker',updated_at=v_now where id=v_parent.id;
  update public.confirmation_operations set state='no_reachable_worker',retry_after_ms=null,
    last_error_code=null,updated_at=v_now where id=v_confirmation.id;
  -- Expiry closes this round; a fresh Customer retry remains an explicit command.
  insert into public.job_events(job_id,event_type,from_status,to_status,safe_metadata)
    values(v_job.id,'no_worker_found','broadcasting','broadcasting',
      jsonb_build_object('reason_code','MATCHING_LEASES_EXHAUSTED','operation_id',v_parent.id));
end;
$func$;
revoke all on function private.reconcile_closed_candidate_matching(uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.expire_worker_candidate_atomic(p_job_id uuid, p_candidate_id uuid, p_customer_id uuid)
 RETURNS TABLE(ok boolean, error_code text, job_status job_status, candidate_id uuid, worker_id uuid, already_applied boolean)
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.jobs%rowtype;
  v_candidate public.job_worker_candidates%rowtype;
  v_now timestamptz;
begin
  select job.* into v_job from public.jobs as job where job.id = p_job_id for update;
  if v_job.id is null or p_customer_id is null or v_job.customer_id is distinct from p_customer_id
    or not exists (select 1 from public.profiles where id = p_customer_id and role = 'customer') then
    return query select false, 'NOT_FOUND', null::public.job_status, null::uuid, null::uuid, false;
    return;
  end if;
  select candidate.* into v_candidate from public.job_worker_candidates as candidate
    where candidate.id = p_candidate_id and candidate.job_id = p_job_id for update;
  if v_candidate.id is null then
    return query select false, 'NOT_FOUND', v_job.status, null::uuid, null::uuid, false;
    return;
  end if;
  if v_candidate.status = 'expired' then
    return query select true, null::text, v_job.status, v_candidate.id, v_candidate.worker_id, true;
    return;
  end if;
  if v_candidate.status <> 'proposed' or v_job.status <> 'worker_candidate_pending'
    or v_job.worker_id is not null then
    return query select false, 'INVALID_STATUS', v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;
  perform worker.id from public.worker_profiles as worker where worker.id = v_candidate.worker_id for update;
  v_now := clock_timestamp();
  -- Reads may discover expiry, but can never stand in for a Customer decision.
  if v_candidate.expires_at is null or v_candidate.expires_at > v_now then
    return query select false, 'NOT_EXPIRED', v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  update public.job_worker_candidates set status = 'expired', updated_at = v_now
    where id = v_candidate.id;
  update public.worker_matching_proposals as proposal set status = 'expired', updated_at = v_now
    where proposal.candidate_id = v_candidate.id and proposal.status = 'proposed';
  update public.job_broadcasts set status = 'expired', responded_at = v_now
    where id = v_candidate.broadcast_id and status in ('pending', 'sent', 'accepted');
  update public.matching_recipient_deliveries set status = 'expired', updated_at = v_now
    where broadcast_id = v_candidate.broadcast_id and status in ('queued', 'delivered', 'seen', 'accepted');
  update public.matching_capacity_reservations as capacity
    set status = 'released', released_at = v_now, updated_at = v_now
    where capacity.job_id = p_job_id and capacity.worker_id = v_candidate.worker_id
      and capacity.status in ('held', 'offered');
  update public.jobs set status = 'broadcasting', broadcast_at = null where id = p_job_id;
  perform private.reconcile_closed_candidate_matching(p_job_id,v_candidate.id);
  return query select true, null::text, 'broadcasting'::public.job_status,
    v_candidate.id, v_candidate.worker_id, false;
end;
$function$;

revoke all on function public.expire_worker_candidate_atomic(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.expire_worker_candidate_atomic(uuid,uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION private.reconcile_job_matching_expiry(p_job_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.jobs%rowtype;
  v_matching public.matching_operations%rowtype;
  v_candidate record;
  v_result record;
  v_now timestamptz;
  v_changed boolean := false;
begin
  select job.* into v_job from public.jobs job where job.id=p_job_id for update;
  if v_job.id is null or v_job.worker_id is not null
    or v_job.status not in ('broadcasting','worker_candidate_pending')
    or v_job.quote_mode is null then return false; end if;
  select matching.* into v_matching from public.matching_operations matching
    where matching.job_id=p_job_id and matching.state in ('broadcasting','candidate_ready')
      and matching.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
    order by matching.created_at desc, matching.id desc limit 1;
  if v_matching.id is null then return false; end if;

  for v_candidate in
    select candidate.id from public.job_worker_candidates candidate
      join public.matching_recipient_deliveries delivery on delivery.broadcast_id=candidate.broadcast_id
    where candidate.job_id=p_job_id and candidate.status='proposed'
      and candidate.expires_at <= clock_timestamp() and delivery.operation_id=v_matching.id
      and candidate.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
  loop
    select * into v_result from public.expire_worker_candidate_atomic(p_job_id,v_candidate.id,v_job.customer_id);
    if v_result.ok and not v_result.already_applied then
      v_changed := true;

    end if;
  end loop;
  select job.* into v_job from public.jobs job where job.id=p_job_id;
  if v_job.status <> 'broadcasting' or v_job.worker_id is not null then return v_changed; end if;
  if not exists(select 1 from public.matching_operations matching where matching.id=v_matching.id
    and matching.state in ('broadcasting','candidate_ready')) then return v_changed; end if;
  v_now := clock_timestamp();

  -- An in-flight dispatch or unexpired reservation still owns the right to make progress.
  if exists (select 1 from public.workflow_outbox outbox
      where (outbox.operation_id=v_matching.confirmation_operation_id
          or outbox.replacement_matching_operation_id=v_matching.id)
        and outbox.status in ('queued','processing','failed') and outbox.dead_lettered_at is null)
    or exists (select 1 from public.job_worker_candidates candidate where candidate.job_id=p_job_id
      and candidate.status='proposed')
    or exists (select 1 from public.matching_recipient_deliveries delivery
      where delivery.operation_id=v_matching.id and delivery.status in ('queued','delivered','seen','accepted')
        and delivery.expires_at > v_now)
    or exists (select 1 from public.matching_capacity_reservations capacity
      where capacity.job_id=p_job_id and capacity.operation_id=v_matching.confirmation_operation_id
        and capacity.status in ('held','offered') and capacity.expires_at > v_now)
    or not exists (select 1 from public.matching_recipient_deliveries delivery where delivery.operation_id=v_matching.id)
  then return v_changed; end if;

  update public.matching_recipient_deliveries set status='expired',updated_at=v_now
    where operation_id=v_matching.id and status in ('queued','delivered','seen','accepted') and expires_at <= v_now;
  update public.job_broadcasts broadcast set status='expired',responded_at=v_now
    where broadcast.job_id=p_job_id and broadcast.status in ('pending','sent','accepted')
      and broadcast.expires_at <= v_now and exists (
        select 1 from public.matching_recipient_deliveries delivery
        where delivery.broadcast_id=broadcast.id and delivery.operation_id=v_matching.id);
  update public.matching_capacity_reservations set status='released',released_at=v_now,updated_at=v_now
    where job_id=p_job_id and operation_id=v_matching.confirmation_operation_id
      and status in ('held','offered') and expires_at <= v_now;
  update public.matching_operations set state='no_reachable_worker',updated_at=v_now where id=v_matching.id;
  update public.confirmation_operations set state='no_reachable_worker',retry_after_ms=null,
    last_error_code=null,updated_at=v_now where id=v_matching.confirmation_operation_id
      and state in ('broadcasting','candidate_ready');
  insert into public.job_events(job_id,event_type,from_status,to_status,safe_metadata)
  values (p_job_id,'no_worker_found','broadcasting','broadcasting',
    jsonb_build_object('reason_code','MATCHING_LEASES_EXHAUSTED','operation_id',v_matching.id));
  return true;
end;
$function$;

commit;
