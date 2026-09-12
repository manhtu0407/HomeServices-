begin;

create or replace function public.activate_confirmation_matching_outbox_claim(
  p_outbox_id uuid, p_lease_token uuid, p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_outbox public.workflow_outbox%rowtype;
  v_confirmation public.confirmation_operations%rowtype;
  v_matching public.matching_operations%rowtype;
  v_preference public.job_matching_preferences%rowtype;
  v_preferred uuid;
  v_workers uuid[];
  v_targets jsonb;
  v_now timestamptz;
  v_expires_at timestamptz;
begin
  -- Share Customer's job-first lock order and fence stale dispatchers before any workflow write.
  select job.* into v_job from public.jobs job
    join public.confirmation_operations confirmation on confirmation.job_id=job.id
    join public.workflow_outbox outbox on outbox.operation_id=confirmation.id
    where outbox.id=p_outbox_id and confirmation.id=p_operation_id
      and outbox.event_type='matching_requested' for update of job;
  if not found then return jsonb_build_object('state','lease_lost'); end if;
  select outbox.* into v_outbox from public.workflow_outbox outbox
    where outbox.id=p_outbox_id and outbox.operation_id=p_operation_id for update;
  v_now := clock_timestamp();
  if p_lease_token is null or v_outbox.status<>'processing'
    or v_outbox.lease_token is distinct from p_lease_token
    or v_outbox.lease_expires_at is null or v_outbox.lease_expires_at<=v_now
    or v_outbox.dead_lettered_at is not null then
    return jsonb_build_object('state','lease_lost');
  end if;
  select confirmation.* into strict v_confirmation from public.confirmation_operations confirmation
    where confirmation.id=p_operation_id for update;
  select matching.* into v_matching from public.matching_operations matching
    where matching.confirmation_operation_id=p_operation_id
    order by matching.created_at,matching.id limit 1 for update;
  if v_matching.id is null or v_matching.job_id is distinct from v_job.id
    or v_confirmation.customer_id is distinct from v_job.customer_id
    or v_confirmation.quote_mode is distinct from v_job.quote_mode or v_job.quote_mode is null
    or v_confirmation.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or v_matching.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or not exists(select 1 from public.profiles actor where actor.id=v_job.customer_id and actor.role='customer')
  then return jsonb_build_object('state','recovery_required','error_code','MATCHING_CONFIRMATION_INVALID'); end if;
  if v_matching.state='stopped' or exists(select 1 from public.matching_operations successor
    where successor.job_id=v_job.id and successor.id<>v_matching.id)
  then return jsonb_build_object('state','stopped'); end if;
  if v_job.status='cancelled' then return jsonb_build_object('state','stopped'); end if;
  if v_job.worker_id is not null then return jsonb_build_object('state','official_match'); end if;
  if v_job.status='worker_candidate_pending' then return jsonb_build_object('state','candidate_ready'); end if;
  if v_job.status not in ('awaiting_customer_confirm','broadcasting')
    or v_job.quote_mode::text not in ('kael_auto_quote','rfq','inspection_only')
  then return jsonb_build_object('state','recovery_required','error_code','MATCHING_STATE_REQUIRES_REVIEW'); end if;

  select preference.* into v_preference from public.job_matching_preferences preference
    where preference.job_id=v_job.id for update;
  if v_preference.job_id is null then
    select session.preferred_worker_id into v_preferred from public.kael_chat_sessions session
      where session.id=v_confirmation.session_id and session.customer_id=v_job.customer_id;
    -- A saved target is not consent to expand. Missing favorite authority stays recoverable.
    if v_preferred is not null and not exists(select 1 from public.customer_favorite_workers favorite
      where favorite.customer_id=v_job.customer_id and favorite.worker_id=v_preferred)
    then return jsonb_build_object('state','recovery_required','error_code','MATCHING_PREFERENCE_REQUIRES_REVIEW'); end if;
    insert into public.job_matching_preferences(job_id,customer_id,strategy,preferred_worker_id,auto_general,selected_at)
      values(v_job.id,v_job.customer_id,case when v_preferred is null then 'general' else 'saved_worker_first' end,
        v_preferred,false,v_now) returning * into v_preference;
  end if;
  if v_preference.customer_id is distinct from v_job.customer_id or v_preference.strategy='pending' then
    return jsonb_build_object('state','recovery_required','error_code','MATCHING_PREFERENCE_PENDING');
  end if;
  if v_preference.strategy='saved_worker_first' then
    if v_preference.fallback_at is not null then
      -- The old fallback marker is not proof that a durable expansion command was committed.
      return jsonb_build_object('state','recovery_required','error_code','MATCHING_PREFERENCE_REQUIRES_REVIEW');
    end if;
    v_preferred := v_preference.preferred_worker_id;
    if not exists(select 1 from public.customer_favorite_workers favorite
      where favorite.customer_id=v_job.customer_id and favorite.worker_id=v_preferred)
    then return jsonb_build_object('state','recovery_required','error_code','MATCHING_PREFERENCE_REQUIRES_REVIEW'); end if;
  end if;

  select jsonb_agg(jsonb_build_object('worker_id',delivery.worker_id,'broadcast_id',delivery.broadcast_id,
    'delivery_id',delivery.id,'operation_id',delivery.operation_id) order by delivery.worker_id),max(delivery.expires_at)
    into v_targets,v_expires_at from public.matching_recipient_deliveries delivery
    join public.job_broadcasts broadcast on broadcast.id=delivery.broadcast_id and broadcast.job_id=v_job.id
      and broadcast.worker_id=delivery.worker_id
    where delivery.operation_id=v_matching.id and delivery.job_id=v_job.id
      and delivery.status in ('queued','delivered','seen') and delivery.expires_at>v_now
      and delivery.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id and broadcast.status='sent';
  if v_targets is not null then
    if v_preferred is not null and exists(select 1 from public.matching_recipient_deliveries delivery
      where delivery.operation_id=v_matching.id and delivery.worker_id<>v_preferred)
    then return jsonb_build_object('state','recovery_required','error_code','MATCHING_PREFERENCE_REQUIRES_REVIEW'); end if;
  else
    if exists(select 1 from public.matching_recipient_deliveries delivery where delivery.operation_id=v_matching.id) then
      return jsonb_build_object('state','no_reachable_worker');
    end if;
    if exists(select 1 from public.job_broadcasts broadcast where broadcast.job_id=v_job.id
      and broadcast.status in ('pending','sent','accepted') and broadcast.expires_at>v_now)
    then return jsonb_build_object('state','recovery_required','error_code','MATCHING_OTHER_BATCH_ACTIVE'); end if;

    -- Capacity was reserved at Customer confirmation; dispatch cannot silently choose a new pool.
    perform worker.id from public.worker_profiles worker join public.matching_capacity_reservations capacity
      on capacity.worker_id=worker.id where capacity.operation_id=p_operation_id and capacity.job_id=v_job.id
      and capacity.status in ('held','offered') order by worker.id for update of worker;
    perform capacity.id from public.matching_capacity_reservations capacity where capacity.operation_id=p_operation_id
      and capacity.job_id=v_job.id and capacity.status in ('held','offered') order by capacity.worker_id for update;
    v_now := clock_timestamp();
    if v_outbox.lease_expires_at<=v_now then
      raise exception using errcode='55000',message='CONFIRMATION_ACTIVATION_LEASE_LOST';
    end if;
    select coalesce(array_agg(capacity.worker_id order by capacity.worker_id),array[]::uuid[]) into v_workers
      from public.matching_capacity_reservations capacity
      join private.eligible_matching_worker_ids(v_job.service_type,public.normalize_hcmc_district_code(v_job.address_district),
        v_job.quote_mode,v_job.diagnosis_scope,v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,v_now,
        v_job.id,p_operation_id) eligible on eligible.worker_id=capacity.worker_id
      where capacity.operation_id=p_operation_id and capacity.job_id=v_job.id
        and capacity.status in ('held','offered') and capacity.expires_at>v_now
        and capacity.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
        and (v_preferred is null or capacity.worker_id=v_preferred);
    update public.jobs set status='broadcasting',confirmed_search_at=coalesce(confirmed_search_at,v_now)
      where id=v_job.id and status='awaiting_customer_confirm';
    if cardinality(v_workers)=0 then return jsonb_build_object('state','no_reachable_worker'); end if;
    if cardinality(v_workers)>5 then raise exception using errcode='55000',message='MATCHING_CAPACITY_INVALID'; end if;
    v_expires_at := v_now+interval '5 minutes';
    select jsonb_agg(jsonb_build_object('worker_id',target.worker_id,'broadcast_id',target.id,
      'delivery_id',target.delivery_id,'operation_id',target.operation_id) order by target.worker_id) into v_targets
      from public.activate_job_broadcast_batch_durable_atomic_v2(v_job.id,v_workers,v_matching.id,v_now,v_expires_at) target;
    if v_targets is null then raise exception using errcode='55000',message='CONFIRMATION_ACTIVATION_FAILED'; end if;
  end if;
  if v_outbox.lease_expires_at<=clock_timestamp() then
    raise exception using errcode='55000',message='CONFIRMATION_ACTIVATION_LEASE_LOST';
  end if;
  return jsonb_build_object('state','broadcasting','job_id',v_job.id,'confirmation_operation_id',p_operation_id,
    'matching_operation_id',v_matching.id,'service_type',v_job.service_type,'district',v_job.address_district,
    'problem_summary',coalesce(v_job.kael_problem_identified,'Yêu cầu cần thợ kiểm tra'),
    'expires_at',v_expires_at,'targets',v_targets);
end;
$func$;

revoke execute on function public.activate_confirmation_matching_outbox_claim(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.activate_confirmation_matching_outbox_claim(uuid,uuid,uuid) to service_role;

commit;
