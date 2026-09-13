begin;

alter table public.matching_operations
  add column if not exists retry_source text not null default 'customer_explicit'
    check (retry_source in ('customer_explicit','saved_worker_fallback'));
create unique index if not exists matching_saved_fallback_parent_uidx
  on public.matching_operations(retry_parent_operation_id) where retry_source='saved_worker_fallback';

create or replace function private.guard_matching_retry_source()
returns trigger language plpgsql security definer set search_path='' as $func$
begin
  if tg_op='UPDATE' and old.retry_request_id is not null and new.retry_source is distinct from old.retry_source then
    raise exception using errcode='23514',message='MATCHING_RETRY_SOURCE_IMMUTABLE';
  end if;
  if new.retry_source='saved_worker_fallback' and (new.retry_request_id is null or not exists(
    select 1 from public.job_matching_preferences preference
    where preference.job_id=new.job_id and preference.customer_id=new.retry_requested_by
      and preference.strategy='saved_worker_first' and preference.auto_general
      and preference.matching_operation_id=new.retry_parent_operation_id))
  then raise exception using errcode='23514',message='MATCHING_FALLBACK_CONSENT_REQUIRED'; end if;
  return new;
end;
$func$;
create or replace trigger matching_retry_source_guard before insert or update
  on public.matching_operations for each row execute function private.guard_matching_retry_source();

create or replace function private.guard_saved_worker_fallback_receipt()
returns trigger language plpgsql security definer set search_path='' as $func$
begin
  if new.matching_operation_id is null then return new; end if;
  if tg_op='UPDATE' and old.fallback_at is not null and
    row(new.fallback_at,new.fallback_reason) is distinct from row(old.fallback_at,old.fallback_reason)
  then raise exception using errcode='23514',message='MATCHING_FALLBACK_RECEIPT_IMMUTABLE'; end if;
  if new.fallback_at is not null and (new.strategy<>'saved_worker_first' or not new.auto_general
    or new.fallback_reason is null or not exists(
      select 1 from public.matching_operations continuation
      where continuation.job_id=new.job_id and continuation.retry_requested_by=new.customer_id
        and continuation.retry_parent_operation_id=new.matching_operation_id
        and continuation.retry_source='saved_worker_fallback'))
  then raise exception using errcode='23514',message='MATCHING_FALLBACK_RECEIPT_REQUIRED'; end if;
  return new;
end;
$func$;
create or replace trigger matching_fallback_receipt_guard before insert or update
  on public.job_matching_preferences for each row execute function private.guard_saved_worker_fallback_receipt();

create or replace function private.queue_job_matching_continuation(
  p_job_id uuid,p_customer_id uuid,p_client_request_id uuid,p_expected_matching_operation_id uuid,p_retry_source text
) returns jsonb language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_confirmation public.confirmation_operations%rowtype;
  v_existing public.matching_operations%rowtype;
  v_parent public.matching_operations%rowtype;
  v_operation uuid;
  v_now timestamptz;
begin
  if p_job_id is null or p_customer_id is null or p_client_request_id is null
    or p_expected_matching_operation_id is null or p_retry_source is null
    or p_retry_source not in ('customer_explicit','saved_worker_fallback') then
    raise exception using errcode='22023',message='MATCHING_RETRY_INPUT_INVALID';
  end if;
  select job.* into v_job from public.jobs job join public.profiles actor on actor.id=job.customer_id
    where job.id=p_job_id and job.customer_id=p_customer_id and actor.role='customer' for update of job;
  if not found then raise exception using errcode='42501',message='MATCHING_RETRY_NOT_OWNED'; end if;

  -- Replay precedes state checks so a lost response can be recovered even after Customer selection.
  select matching.* into v_existing from public.matching_operations matching where matching.retry_request_id=p_client_request_id;
  if found then
    if v_existing.job_id<>p_job_id or v_existing.retry_requested_by<>p_customer_id
      or v_existing.retry_parent_operation_id<>p_expected_matching_operation_id
      or v_existing.retry_source<>p_retry_source then
      raise exception using errcode='23505',message='MATCHING_RETRY_REQUEST_CONFLICT';
    end if;
    return private.matching_retry_receipt(v_existing.id);
  end if;
  if v_job.status<>'broadcasting' or v_job.worker_id is not null
    or v_job.quote_mode is null or v_job.quote_mode::text not in ('kael_auto_quote','rfq','inspection_only') then
    raise exception using errcode='55000',message='MATCHING_RETRY_NOT_READY';
  end if;
  select confirmation.* into v_confirmation from public.confirmation_operations confirmation
    where confirmation.job_id=v_job.id and confirmation.customer_id=p_customer_id for update;
  if not found or v_confirmation.quote_mode is distinct from v_job.quote_mode
    or v_confirmation.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id then
    raise exception using errcode='55000',message='MATCHING_RETRY_CONFIRMATION_UNAVAILABLE';
  end if;
  perform private.reconcile_job_matching_expiry(v_job.id);
  select matching.* into v_parent from public.matching_operations matching where matching.job_id=v_job.id
    order by matching.created_at desc,matching.id desc limit 1;
  if v_parent.id is distinct from p_expected_matching_operation_id
    or v_parent.confirmation_operation_id is distinct from v_confirmation.id
    or v_parent.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id then
    raise exception using errcode='55000',message='MATCHING_RETRY_PARENT_CHANGED';
  end if;
  if v_parent.state<>'no_reachable_worker' or exists(
    select 1 from public.workflow_outbox outbox left join public.matching_operations replacement
      on replacement.id=outbox.replacement_matching_operation_id
    where (outbox.operation_id=v_confirmation.id or replacement.job_id=v_job.id)
      and outbox.status in ('queued','processing','failed') and outbox.dead_lettered_at is null)
    or exists(select 1 from public.job_worker_candidates candidate where candidate.job_id=v_job.id
      and candidate.status='proposed' and candidate.expires_at>clock_timestamp())
    or exists(select 1 from public.job_broadcasts broadcast where broadcast.job_id=v_job.id
      and broadcast.status in ('pending','sent','accepted') and broadcast.expires_at>clock_timestamp())
  then raise exception using errcode='55000',message='MATCHING_RETRY_NOT_READY'; end if;
  if p_retry_source='saved_worker_fallback' and not exists(
    select 1 from public.job_matching_preferences preference where preference.job_id=v_job.id
      and preference.customer_id=p_customer_id and preference.strategy='saved_worker_first'
      and preference.auto_general and preference.matching_operation_id=v_parent.id
      and preference.fallback_at is null) then
    raise exception using errcode='55000',message='MATCHING_FALLBACK_CONSENT_REQUIRED';
  end if;
  if p_retry_source='customer_explicit' and exists(select 1 from public.job_matching_preferences preference where preference.job_id=v_job.id
    and preference.strategy<>'general' and preference.fallback_at is null) then
    raise exception using errcode='55000',message='MATCHING_PREFERENCE_PENDING';
  end if;
  perform private.reserve_fresh_matching_workers(v_job.id,v_confirmation.id);
  v_now := clock_timestamp();
  insert into public.matching_operations(confirmation_operation_id,job_id,state,synthetic_cohort_id,
    retry_request_id,retry_parent_operation_id,retry_requested_by,retry_source,created_at,updated_at)
    values(v_confirmation.id,v_job.id,'queued',v_job.synthetic_cohort_id,p_client_request_id,v_parent.id,
      p_customer_id,p_retry_source,v_now,v_now) returning id into v_operation;
  insert into public.workflow_outbox(operation_id,event_type,retry_matching_operation_id,safe_payload,next_attempt_at)
    values(v_confirmation.id,'matching_reconcile',v_operation,jsonb_build_object('job_id',v_job.id),v_now)
    on conflict(operation_id,event_type) do update set retry_matching_operation_id=excluded.retry_matching_operation_id,
      status='queued',attempt_count=0,lease_token=null,leased_by=null,lease_expires_at=null,
      last_error_code=null,dead_lettered_at=null,next_attempt_at=v_now,updated_at=v_now,
      safe_payload=excluded.safe_payload;
  update public.confirmation_operations set state='matching_queued',retry_after_ms=1000,
    last_error_code=null,updated_at=v_now where id=v_confirmation.id;
  return private.matching_retry_receipt(v_operation);
end;
$func$;

create or replace function public.request_job_matching_retry_atomic(
  p_job_id uuid,p_customer_id uuid,p_client_request_id uuid,p_expected_matching_operation_id uuid
) returns jsonb language sql security definer set search_path='' as $func$
  select private.queue_job_matching_continuation(p_job_id,p_customer_id,p_client_request_id,
    p_expected_matching_operation_id,'customer_explicit');
$func$;

create or replace function public.request_job_saved_worker_fallback_atomic(p_job_id uuid,p_expected_worker_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $func$
declare
  v_job public.jobs%rowtype;
  v_preference public.job_matching_preferences%rowtype;
  v_parent public.matching_operations%rowtype;
  v_delivery public.matching_recipient_deliveries%rowtype;
  v_broadcast public.job_broadcasts%rowtype;
  v_continuation uuid;
  v_now timestamptz;
  v_reason text;
  v_result jsonb;
begin
  if p_job_id is null or p_expected_worker_id is null then
    raise exception using errcode='22023',message='MATCHING_FALLBACK_INPUT_INVALID';
  end if;
  select job.* into v_job from public.jobs job join public.profiles actor on actor.id=job.customer_id
    where job.id=p_job_id and actor.role='customer' for update of job;
  if not found or v_job.quote_mode is null then
    return jsonb_build_object('claimed',false,'error_code','NOT_APPLICABLE');
  end if;
  select preference.* into v_preference from public.job_matching_preferences preference
    where preference.job_id=v_job.id and preference.customer_id=v_job.customer_id for update;
  if not found or v_preference.strategy<>'saved_worker_first' or not v_preference.auto_general
    or v_preference.preferred_worker_id is distinct from p_expected_worker_id
    or v_preference.matching_operation_id is null then
    return jsonb_build_object('claimed',false,'error_code','MATCHING_FALLBACK_CONSENT_REQUIRED');
  end if;

  select matching.id into v_continuation from public.matching_operations matching
    where matching.retry_parent_operation_id=v_preference.matching_operation_id
      and matching.retry_source='saved_worker_fallback' and matching.job_id=v_job.id;
  if found then
    return private.matching_retry_receipt(v_continuation) || jsonb_build_object(
      'claimed',true,'reason',v_preference.fallback_reason);
  end if;
  if v_preference.fallback_at is not null then
    return jsonb_build_object('claimed',false,'error_code','MATCHING_FALLBACK_REQUIRES_REVIEW');
  end if;
  if v_job.status<>'broadcasting' or v_job.worker_id is not null then
    return jsonb_build_object('claimed',false,'error_code','MATCHING_FALLBACK_NOT_READY');
  end if;
  select matching.* into v_parent from public.matching_operations matching
    where matching.id=v_preference.matching_operation_id and matching.job_id=v_job.id for update;
  if not found or v_parent.state not in ('broadcasting','no_reachable_worker')
    or exists(select 1 from public.matching_operations sibling where sibling.job_id=v_job.id and sibling.id<>v_parent.id)
    or exists(select 1 from public.workflow_outbox outbox where outbox.operation_id=v_parent.confirmation_operation_id
      and outbox.status in ('queued','processing','failed') and outbox.dead_lettered_at is null)
    or exists(select 1 from public.job_worker_candidates candidate where candidate.job_id=v_job.id
      and candidate.status='proposed')
  then return jsonb_build_object('claimed',false,'error_code','MATCHING_FALLBACK_NOT_READY'); end if;

  select delivery.* into v_delivery from public.matching_recipient_deliveries delivery
    where delivery.operation_id=v_parent.id and delivery.job_id=v_job.id and delivery.worker_id=p_expected_worker_id
      and delivery.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
    order by delivery.created_at desc,delivery.id desc limit 1 for update;
  if found then
    select broadcast.* into strict v_broadcast from public.job_broadcasts broadcast
      where broadcast.id=v_delivery.broadcast_id and broadcast.job_id=v_job.id
        and broadcast.worker_id=p_expected_worker_id for update;
  end if;
  v_now:=clock_timestamp();
  if v_broadcast.status='declined' then v_reason:='saved_worker_declined';
  elsif v_broadcast.expires_at<=v_now or v_delivery.expires_at<=v_now then v_reason:='saved_worker_expired';
  elsif not exists(select 1 from private.eligible_matching_worker_ids(v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district),v_job.quote_mode,v_job.diagnosis_scope,
      v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,v_now,v_job.id,v_parent.confirmation_operation_id) eligible
      where eligible.worker_id=p_expected_worker_id) then v_reason:='saved_worker_unavailable';
  else return jsonb_build_object('claimed',false,'error_code','ACTIVE_SAVED_WORKER'); end if;
  if v_broadcast.status='accepted' or exists(select 1 from public.job_broadcasts broadcast
    where broadcast.job_id=v_job.id and broadcast.worker_id<>p_expected_worker_id
      and broadcast.status in ('pending','sent','accepted') and broadcast.expires_at>v_now)
  then return jsonb_build_object('claimed',false,'error_code','MATCHING_FALLBACK_NOT_READY'); end if;

  -- Retirement and continuation commit together; a capacity refusal cannot consume standing consent.
  update public.job_broadcasts set status='expired',responded_at=coalesce(responded_at,v_now)
    where id=v_broadcast.id and status in ('pending','sent');
  update public.matching_recipient_deliveries set status='expired',updated_at=v_now
    where operation_id=v_parent.id and status in ('queued','delivered','seen');
  perform worker.id from public.worker_profiles worker where worker.id=p_expected_worker_id for update;
  update public.matching_capacity_reservations set status='released',released_at=v_now,updated_at=v_now
    where operation_id=v_parent.confirmation_operation_id and job_id=v_job.id
      and worker_id=p_expected_worker_id and status in ('held','offered');
  update public.matching_operations set state='no_reachable_worker',updated_at=v_now where id=v_parent.id;
  v_result:=private.queue_job_matching_continuation(v_job.id,v_job.customer_id,gen_random_uuid(),
    v_parent.id,'saved_worker_fallback');
  update public.job_matching_preferences set fallback_at=clock_timestamp(),fallback_reason=v_reason where job_id=v_job.id;
  return v_result || jsonb_build_object('claimed',true,'reason',v_reason);
exception when object_not_in_prerequisite_state then
  if sqlerrm='COVERAGE_UNAVAILABLE' then
    return jsonb_build_object('claimed',false,'error_code','COVERAGE_UNAVAILABLE');
  end if;
  raise;
end;
$func$;

create or replace function public.activate_worker_replacement_outbox_claim(p_outbox_id uuid, p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $func$
declare
  v_outbox public.workflow_outbox%rowtype;
  v_matching public.matching_operations%rowtype;
  v_job public.jobs%rowtype;
  v_worker_ids uuid[];
  v_targets jsonb;
  v_sent_at timestamptz := clock_timestamp();
  v_expires_at timestamptz;
begin
  -- All workflow mutations lock the job before the outbox; recheck the lease after both locks.
  select job.* into v_job from public.jobs as job
    join public.matching_operations as matching on matching.job_id = job.id
    join public.workflow_outbox as outbox on coalesce(outbox.replacement_matching_operation_id,outbox.retry_matching_operation_id) = matching.id
    where outbox.id = p_outbox_id and outbox.event_type = 'matching_reconcile'
      and (outbox.worker_cancellation_id is not null or outbox.retry_matching_operation_id is not null) for update of job;
  if not found then return jsonb_build_object('state', 'lease_lost'); end if;
  select outbox.* into v_outbox from public.workflow_outbox as outbox
    where outbox.id = p_outbox_id and outbox.event_type = 'matching_reconcile'
      and (outbox.worker_cancellation_id is not null or outbox.retry_matching_operation_id is not null) for update;
  v_sent_at := clock_timestamp();
  if v_outbox.id is null or v_outbox.status <> 'processing'
    or v_outbox.lease_token is distinct from p_lease_token
    or p_lease_token is null or v_outbox.lease_expires_at is null
    or v_outbox.lease_expires_at <= v_sent_at then
    return jsonb_build_object('state', 'lease_lost');
  end if;
  select matching.* into strict v_matching from public.matching_operations as matching
    where matching.id = coalesce(v_outbox.replacement_matching_operation_id,v_outbox.retry_matching_operation_id) and matching.job_id = v_job.id;
  if v_matching.state = 'stopped' or exists (select 1 from public.matching_operations as current_operation
    where current_operation.job_id = v_job.id and current_operation.id <> v_matching.id
      and current_operation.state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required')) then
    return jsonb_build_object('state', 'stopped');
  end if;
  if v_job.worker_id is not null then return jsonb_build_object('state', 'official_match'); end if;
  if v_job.status = 'worker_candidate_pending' then return jsonb_build_object('state', 'candidate_ready'); end if;
  if v_job.status <> 'broadcasting' then return jsonb_build_object('state', 'stopped'); end if;
  if v_matching.confirmation_operation_id is null or v_job.quote_mode is null then
    return jsonb_build_object('state', 'recovery_required', 'error_code', 'LEGACY_MATCHING_REQUIRES_REVIEW');
  end if;

  select jsonb_agg(jsonb_build_object('worker_id', delivery.worker_id, 'broadcast_id', delivery.broadcast_id,
    'delivery_id', delivery.id, 'operation_id', delivery.operation_id) order by delivery.worker_id), max(delivery.expires_at)
    into v_targets, v_expires_at from public.matching_recipient_deliveries as delivery
    join public.job_broadcasts as broadcast on broadcast.id = delivery.broadcast_id
    where delivery.operation_id = v_matching.id and delivery.status in ('queued', 'delivered', 'seen')
      and delivery.expires_at > v_sent_at and broadcast.status = 'sent';
  if v_targets is not null then
    return jsonb_build_object('state', 'broadcasting', 'matching_reason',
      case when v_outbox.retry_matching_operation_id is null then 'worker_cancellation'
        when v_matching.retry_source='saved_worker_fallback' then 'saved_worker_fallback' else 'customer_retry' end, 'job_id', v_job.id, 'customer_id', v_job.customer_id,
      'service_type', v_job.service_type, 'district', v_job.address_district,
      'expires_at', v_expires_at, 'targets', v_targets);
  end if;
  if exists (select 1 from public.job_broadcasts as broadcast where broadcast.job_id = v_job.id
    and broadcast.status = 'sent' and broadcast.expires_at > v_sent_at) then
    return jsonb_build_object('state', 'recovery_required', 'error_code', 'REPLACEMENT_OTHER_BATCH_ACTIVE');
  end if;

  begin
    v_worker_ids := private.reserve_fresh_matching_workers(v_job.id,v_matching.confirmation_operation_id);
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'COVERAGE_UNAVAILABLE' then raise; end if;
    return jsonb_build_object('state','no_reachable_worker');
  end;
  select min(capacity.held_at),min(capacity.expires_at) into v_sent_at,v_expires_at
    from public.matching_capacity_reservations capacity where capacity.operation_id=v_matching.confirmation_operation_id
      and capacity.worker_id=any(v_worker_ids) and capacity.status='held';
  select jsonb_agg(jsonb_build_object('worker_id', target.worker_id, 'broadcast_id', target.id,
    'delivery_id', target.delivery_id, 'operation_id', target.operation_id) order by target.worker_id) into v_targets
    from public.activate_job_broadcast_batch_durable_atomic_v2(v_job.id, v_worker_ids, v_matching.id,
      v_sent_at, v_expires_at) as target;
  if v_targets is null then raise exception using errcode = '55000', message = 'REPLACEMENT_ACTIVATION_FAILED'; end if;
  return jsonb_build_object('state', 'broadcasting', 'matching_reason',
      case when v_outbox.retry_matching_operation_id is null then 'worker_cancellation'
        when v_matching.retry_source='saved_worker_fallback' then 'saved_worker_fallback' else 'customer_retry' end, 'job_id', v_job.id, 'customer_id', v_job.customer_id,
    'service_type', v_job.service_type, 'district', v_job.address_district, 'expires_at', v_expires_at, 'targets', v_targets);
end;
$func$;

create or replace function private.matching_preference_receipt(p_job_id uuid)
returns jsonb language sql security definer set search_path='' stable as $func$
  select jsonb_build_object(
    'job_id',preference.job_id,'job_status',job.status,'request_id',preference.client_request_id,
    'operation_id',matching.id,'confirmation_operation_id',confirmation.id,'state',coalesce(fallback.state,matching.state),
    'mode',preference.strategy,'preferred_worker_id',preference.preferred_worker_id,
    'auto_general',preference.auto_general,'selected_at',preference.selected_at,
    'support_code',confirmation.support_code,
    'broadcast_sent',exists(select 1 from public.matching_recipient_deliveries delivery
      where delivery.operation_id=coalesce(fallback.id,matching.id) and delivery.status in ('queued','delivered','seen','accepted')))
  from public.job_matching_preferences preference
    join public.jobs job on job.id=preference.job_id
    join public.matching_operations matching on matching.id=preference.matching_operation_id
    join public.confirmation_operations confirmation on confirmation.id=matching.confirmation_operation_id
    left join public.matching_operations fallback on fallback.retry_parent_operation_id=matching.id
      and fallback.retry_source='saved_worker_fallback'
      and fallback.job_id=matching.job_id and fallback.confirmation_operation_id=confirmation.id
      and fallback.synthetic_cohort_id is not distinct from job.synthetic_cohort_id
  where preference.job_id=p_job_id;
$func$;

create or replace function public.claim_saved_worker_fallback_atomic(
  p_job_id uuid,
  p_reason text,
  p_expected_worker_id uuid default null
)
returns table (
  claimed boolean,
  error_code text,
  customer_id uuid,
  preferred_worker_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_preference public.job_matching_preferences%rowtype;
begin
  if p_job_id is null or p_reason not in ('saved_worker_declined', 'saved_worker_expired', 'saved_worker_unavailable') then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::uuid;
    return;
  end if;

  select *
    into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found then
    return query select false, 'NOT_FOUND'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_job.quote_mode is not null then
    return query select false, 'DURABLE_FALLBACK_REQUIRED'::text, v_job.customer_id, null::uuid;
    return;
  end if;
  if v_job.status is distinct from 'broadcasting'::public.job_status then
    return query select false, 'INVALID_STATUS'::text, v_job.customer_id, null::uuid;
    return;
  end if;

  select *
    into v_preference
  from public.job_matching_preferences as preference
  where preference.job_id = p_job_id
  for update;

  if not found then
    return query select false, 'NOT_APPLICABLE'::text, v_job.customer_id, null::uuid;
    return;
  end if;
  if v_preference.strategy is distinct from 'saved_worker_first'
     or v_preference.auto_general is not true
     or v_preference.fallback_at is not null
     or (p_expected_worker_id is not null and v_preference.preferred_worker_id is distinct from p_expected_worker_id) then
    return query select false, 'NOT_APPLICABLE'::text, v_job.customer_id, v_preference.preferred_worker_id;
    return;
  end if;
  if exists (
    select 1
    from public.job_worker_candidates as candidate
    where candidate.job_id = p_job_id
      and candidate.status = 'proposed'
      and (candidate.expires_at is null or candidate.expires_at > now())
  ) then
    return query select false, 'CANDIDATE_PENDING'::text, v_job.customer_id, v_preference.preferred_worker_id;
    return;
  end if;
  if exists (
    select 1
    from public.job_broadcasts as broadcast
    where broadcast.job_id = p_job_id
      and broadcast.status = 'sent'
      and (broadcast.expires_at is null or broadcast.expires_at > now())
  ) then
    return query select false, 'ACTIVE_BROADCAST'::text, v_job.customer_id, v_preference.preferred_worker_id;
    return;
  end if;

  update public.job_matching_preferences
  set fallback_at = now(),
      fallback_reason = p_reason
  where job_id = p_job_id;

  return query select true, null::text, v_job.customer_id, v_preference.preferred_worker_id;
end;
$$;

revoke execute on function private.queue_job_matching_continuation(uuid,uuid,uuid,uuid,text),
  private.guard_matching_retry_source(),private.guard_saved_worker_fallback_receipt()
  from public,anon,authenticated,service_role;
revoke execute on function public.request_job_saved_worker_fallback_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_job_saved_worker_fallback_atomic(uuid,uuid) to service_role;

commit;
