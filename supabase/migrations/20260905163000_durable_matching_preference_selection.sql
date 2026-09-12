begin;

alter table public.job_matching_preferences
  add column if not exists matching_operation_id uuid references public.matching_operations(id);
create unique index if not exists job_matching_preferences_request_identity_idx
  on public.job_matching_preferences(client_request_id) where matching_operation_id is not null;

create or replace function private.guard_matching_preference_receipt()
returns trigger language plpgsql security definer set search_path='' as $func$
begin
  if tg_op='UPDATE' and old.matching_operation_id is not null and
    row(new.job_id,new.customer_id,new.strategy,new.preferred_worker_id,new.auto_general,
      new.client_request_id,new.selected_at,new.matching_operation_id) is distinct from
    row(old.job_id,old.customer_id,old.strategy,old.preferred_worker_id,old.auto_general,
      old.client_request_id,old.selected_at,old.matching_operation_id)
  then raise exception using errcode='23514',message='MATCHING_PREFERENCE_RECEIPT_IMMUTABLE'; end if;
  if new.matching_operation_id is not null and (
    new.client_request_id is null or new.selected_at is null or new.strategy='pending' or not exists(
      select 1 from public.matching_operations matching
      join public.confirmation_operations confirmation on confirmation.id=matching.confirmation_operation_id
      join public.jobs job on job.id=matching.job_id
      where matching.id=new.matching_operation_id and matching.job_id=new.job_id
        and job.customer_id=new.customer_id and confirmation.customer_id=new.customer_id
        and confirmation.job_id=job.id
        and matching.synthetic_cohort_id is not distinct from job.synthetic_cohort_id
        and confirmation.synthetic_cohort_id is not distinct from job.synthetic_cohort_id))
  then raise exception using errcode='23514',message='MATCHING_PREFERENCE_RECEIPT_INVALID'; end if;
  return new;
end;
$func$;
create or replace trigger matching_preference_receipt_guard before insert or update
  on public.job_matching_preferences for each row execute function private.guard_matching_preference_receipt();

create or replace function private.matching_preference_receipt(p_job_id uuid)
returns jsonb language sql security definer set search_path='' stable as $func$
  select jsonb_build_object(
    'job_id',preference.job_id,'job_status',job.status,'request_id',preference.client_request_id,
    'operation_id',matching.id,'confirmation_operation_id',confirmation.id,'state',matching.state,
    'mode',preference.strategy,'preferred_worker_id',preference.preferred_worker_id,
    'auto_general',preference.auto_general,'selected_at',preference.selected_at,
    'support_code',confirmation.support_code,
    'broadcast_sent',exists(select 1 from public.matching_recipient_deliveries delivery
      where delivery.operation_id=matching.id and delivery.status in ('queued','delivered','seen','accepted')))
  from public.job_matching_preferences preference
    join public.jobs job on job.id=preference.job_id
    join public.matching_operations matching on matching.id=preference.matching_operation_id
    join public.confirmation_operations confirmation on confirmation.id=matching.confirmation_operation_id
  where preference.job_id=p_job_id;
$func$;

create or replace function public.get_job_matching_preference_receipt(
  p_job_id uuid,p_customer_id uuid,p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $func$
begin
  if p_job_id is null or p_customer_id is null or p_client_request_id is null then
    raise exception using errcode='22023',message='MATCHING_PREFERENCE_INPUT_INVALID';
  end if;
  if not exists(select 1 from public.job_matching_preferences preference
    join public.jobs job on job.id=preference.job_id join public.profiles actor on actor.id=job.customer_id
    where job.id=p_job_id and job.customer_id=p_customer_id and actor.role='customer'
      and preference.customer_id=p_customer_id and preference.client_request_id=p_client_request_id
      and preference.matching_operation_id is not null)
  then raise exception using errcode='42501',message='MATCHING_PREFERENCE_NOT_OWNED'; end if;
  return private.matching_preference_receipt(p_job_id);
end;
$func$;

create or replace function public.request_job_matching_preference_atomic(
  p_job_id uuid,p_customer_id uuid,p_strategy text,p_preferred_worker_id uuid,
  p_auto_general boolean,p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $func$
declare
  v_job public.jobs%rowtype;
  v_preference public.job_matching_preferences%rowtype;
  v_confirmation public.confirmation_operations%rowtype;
  v_matching public.matching_operations%rowtype;
  v_outbox public.workflow_outbox%rowtype;
  v_worker record;
  v_capacity public.matching_capacity_reservations%rowtype;
  v_worker_ids uuid[]:=array[]::uuid[];
  v_required integer;
  v_now timestamptz;
begin
  if p_job_id is null or p_customer_id is null or p_client_request_id is null
    or p_strategy is null or p_strategy not in ('general','saved_worker_first') or p_auto_general is null
    or (p_strategy='saved_worker_first' and p_preferred_worker_id is null)
    or (p_strategy='general' and p_preferred_worker_id is not null)
  then raise exception using errcode='22023',message='MATCHING_PREFERENCE_INPUT_INVALID'; end if;
  select job.* into v_job from public.jobs job join public.profiles actor on actor.id=job.customer_id
    where job.id=p_job_id and job.customer_id=p_customer_id and actor.role='customer' for update of job;
  if not found then raise exception using errcode='42501',message='MATCHING_PREFERENCE_NOT_OWNED'; end if;

  -- Replay precedes workflow checks so the same receipt survives delivery, matching and completion.
  select preference.* into v_preference from public.job_matching_preferences preference
    where preference.job_id=p_job_id;
  if v_preference.matching_operation_id is not null then
    if v_preference.client_request_id is distinct from p_client_request_id
      or v_preference.strategy is distinct from p_strategy
      or v_preference.preferred_worker_id is distinct from p_preferred_worker_id
      or v_preference.auto_general is distinct from p_auto_general then
      raise exception using errcode='23505',message='MATCHING_PREFERENCE_REQUEST_CONFLICT';
    end if;
    return private.matching_preference_receipt(p_job_id);
  end if;
  if exists(select 1 from public.job_matching_preferences preference
    where preference.matching_operation_id is not null and preference.client_request_id=p_client_request_id)
  then raise exception using errcode='23505',message='MATCHING_PREFERENCE_REQUEST_CONFLICT'; end if;
  if v_preference.job_id is null or v_preference.strategy<>'pending'
    or v_job.status not in ('awaiting_customer_confirm','broadcasting') or v_job.worker_id is not null
    or v_job.quote_mode is null or v_job.quote_mode='blocked'
  then raise exception using errcode='55000',message='MATCHING_PREFERENCE_NOT_READY'; end if;

  -- Job -> outbox -> confirmation -> matching is shared with activation and settlement.
  select outbox.* into v_outbox from public.workflow_outbox outbox
    join public.confirmation_operations confirmation on confirmation.id=outbox.operation_id
    where confirmation.job_id=p_job_id and confirmation.customer_id=p_customer_id
      and outbox.event_type='matching_requested' for update of outbox;
  if not found then raise exception using errcode='55000',message='MATCHING_PREFERENCE_CONFIRMATION_UNAVAILABLE'; end if;
  select confirmation.* into strict v_confirmation from public.confirmation_operations confirmation
    where confirmation.id=v_outbox.operation_id for update;
  select matching.* into v_matching from public.matching_operations matching
    where matching.confirmation_operation_id=v_confirmation.id and matching.job_id=p_job_id
      and matching.retry_request_id is null
    order by matching.created_at,matching.id limit 1 for update;
  if not found or v_matching.state not in ('queued','recovery_required')
    or v_confirmation.state not in ('matching_queued','recovery_required')
    or v_confirmation.quote_mode is distinct from v_job.quote_mode
    or v_matching.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or v_confirmation.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or exists(select 1 from public.matching_recipient_deliveries where job_id=p_job_id)
    or exists(select 1 from public.job_worker_candidates where job_id=p_job_id)
  then raise exception using errcode='55000',message='MATCHING_PREFERENCE_NOT_READY'; end if;
  select preference.* into strict v_preference from public.job_matching_preferences preference
    where preference.job_id=p_job_id for update;
  if v_preference.strategy<>'pending' then
    raise exception using errcode='23505',message='MATCHING_PREFERENCE_REQUEST_CONFLICT';
  end if;
  if p_strategy='saved_worker_first' and not exists(
    select 1 from public.customer_favorite_workers favorite join public.worker_profiles worker on worker.id=favorite.worker_id
    where favorite.customer_id=p_customer_id and favorite.worker_id=p_preferred_worker_id
      and favorite.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
      and worker.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id)
  then raise exception using errcode='55000',message='MATCHING_PREFERENCE_FAVORITE_UNAVAILABLE'; end if;

  v_required:=case when v_job.synthetic_cohort_id is null then 3 else 1 end;
  for v_worker in
    select worker.id from public.worker_profiles worker join private.eligible_matching_worker_ids(
      v_job.service_type,public.normalize_hcmc_district_code(v_job.address_district),
      v_job.quote_mode,v_job.diagnosis_scope,v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,
      clock_timestamp(),v_job.id,v_confirmation.id) eligible on eligible.worker_id=worker.id
    order by case when worker.id=p_preferred_worker_id then 0 else 1 end,worker.id
    limit 50 for update of worker skip locked
  loop
    select capacity.* into v_capacity from public.matching_capacity_reservations capacity
      where capacity.worker_id=v_worker.id and capacity.status in ('held','offered') for update skip locked;
    if found then
      if v_capacity.expires_at>clock_timestamp() then continue; end if;
      update public.matching_capacity_reservations set status='expired',released_at=clock_timestamp(),
        updated_at=clock_timestamp() where id=v_capacity.id;
    elsif exists(select 1 from public.matching_capacity_reservations capacity
      where capacity.worker_id=v_worker.id and capacity.status in ('held','offered')) then continue;
    end if;
    if not exists(select 1 from private.eligible_matching_worker_ids(
      v_job.service_type,public.normalize_hcmc_district_code(v_job.address_district),
      v_job.quote_mode,v_job.diagnosis_scope,v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,
      clock_timestamp(),v_job.id,v_confirmation.id) eligible where eligible.worker_id=v_worker.id) then continue; end if;
    v_worker_ids:=array_append(v_worker_ids,v_worker.id);
    exit when cardinality(v_worker_ids)=5;
  end loop;
  if cardinality(v_worker_ids)<v_required then
    raise exception using errcode='55000',message='COVERAGE_UNAVAILABLE';
  end if;
  if p_strategy='saved_worker_first' and not p_preferred_worker_id=any(v_worker_ids) then
    raise exception using errcode='55000',message='MATCHING_PREFERENCE_FAVORITE_UNAVAILABLE';
  end if;
  v_now:=clock_timestamp();
  insert into public.matching_capacity_reservations(operation_id,job_id,worker_id,service_type,district_code,
    status,held_at,expires_at,synthetic_cohort_id)
    select v_confirmation.id,v_job.id,worker_id,v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district),'held',v_now,v_now+interval '5 minutes',v_job.synthetic_cohort_id
    from unnest(v_worker_ids) selected(worker_id)
    on conflict(operation_id,worker_id) do update set status='held',held_at=excluded.held_at,
      expires_at=excluded.expires_at,released_at=null,updated_at=v_now;

  update public.job_matching_preferences set strategy=p_strategy,preferred_worker_id=p_preferred_worker_id,
    auto_general=p_auto_general,client_request_id=p_client_request_id,selected_at=v_now,matching_operation_id=v_matching.id
    where job_id=p_job_id;
  update public.matching_operations set state='queued',updated_at=v_now where id=v_matching.id;
  update public.confirmation_operations set state='matching_queued',last_error_code=null,retry_after_ms=1000,updated_at=v_now
    where id=v_confirmation.id;
  update public.workflow_outbox set status='queued',attempt_count=0,lease_token=null,leased_by=null,
    lease_expires_at=null,last_error_code=null,dead_lettered_at=null,next_attempt_at=v_now,updated_at=v_now
    where id=v_outbox.id;
  return private.matching_preference_receipt(p_job_id);
end;
$func$;

revoke execute on function private.guard_matching_preference_receipt(),private.matching_preference_receipt(uuid)
  from public,anon,authenticated,service_role;
revoke execute on function public.request_job_matching_preference_atomic(uuid,uuid,text,uuid,boolean,uuid),
  public.get_job_matching_preference_receipt(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_job_matching_preference_atomic(uuid,uuid,text,uuid,boolean,uuid),
  public.get_job_matching_preference_receipt(uuid,uuid,uuid) to service_role;

commit;
