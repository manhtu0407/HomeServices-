begin;

alter table public.matching_operations
  add column if not exists retry_request_id uuid,
  add column if not exists retry_parent_operation_id uuid references public.matching_operations(id),
  add column if not exists retry_requested_by uuid references public.customer_profiles(id);
create unique index if not exists matching_operations_retry_request_uidx
  on public.matching_operations(retry_request_id) where retry_request_id is not null;
alter table public.workflow_outbox
  add column if not exists retry_matching_operation_id uuid references public.matching_operations(id);
create unique index if not exists workflow_outbox_retry_matching_uidx
  on public.workflow_outbox(retry_matching_operation_id) where retry_matching_operation_id is not null;

do $constraints$
begin
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.matching_operations'::regclass
    and conname='matching_operations_retry_identity_check') then
    alter table public.matching_operations add constraint matching_operations_retry_identity_check check (
      (retry_request_id is null and retry_parent_operation_id is null and retry_requested_by is null)
      or (retry_request_id is not null and retry_parent_operation_id is not null and retry_requested_by is not null
        and confirmation_operation_id is not null and retry_parent_operation_id<>id));
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.workflow_outbox'::regclass
    and conname='workflow_outbox_retry_identity_check') then
    alter table public.workflow_outbox add constraint workflow_outbox_retry_identity_check check (
      retry_matching_operation_id is null or (operation_id is not null and event_type='matching_reconcile'
        and worker_cancellation_id is null and replacement_matching_operation_id is null));
  end if;
end;
$constraints$;

create or replace function private.guard_matching_retry_identity()
returns trigger language plpgsql security definer set search_path = '' as $func$
begin
  if tg_op='UPDATE' and old.retry_request_id is not null and
    row(new.id,new.job_id,new.confirmation_operation_id,new.synthetic_cohort_id,new.retry_request_id,
      new.retry_parent_operation_id,new.retry_requested_by) is distinct from
    row(old.id,old.job_id,old.confirmation_operation_id,old.synthetic_cohort_id,old.retry_request_id,
      old.retry_parent_operation_id,old.retry_requested_by)
  then raise exception using errcode='23514',message='MATCHING_RETRY_IDENTITY_IMMUTABLE'; end if;
  if new.retry_request_id is not null and not exists(
    select 1 from public.matching_operations parent
      join public.jobs job on job.id=parent.job_id
      join public.confirmation_operations confirmation on confirmation.id=parent.confirmation_operation_id
    where parent.id=new.retry_parent_operation_id and job.id=new.job_id
      and confirmation.id=new.confirmation_operation_id and confirmation.job_id=job.id
      and job.customer_id=new.retry_requested_by and confirmation.customer_id=new.retry_requested_by
      and parent.synthetic_cohort_id is not distinct from new.synthetic_cohort_id
      and job.synthetic_cohort_id is not distinct from new.synthetic_cohort_id
      and confirmation.synthetic_cohort_id is not distinct from new.synthetic_cohort_id)
  then raise exception using errcode='23514',message='MATCHING_RETRY_IDENTITY_INVALID'; end if;
  return new;
end;
$func$;
create or replace trigger matching_retry_identity_guard before insert or update of
  id,job_id,confirmation_operation_id,synthetic_cohort_id,retry_request_id,retry_parent_operation_id,retry_requested_by
  on public.matching_operations for each row execute function private.guard_matching_retry_identity();

create or replace function private.guard_matching_retry_outbox_identity()
returns trigger language plpgsql security definer set search_path = '' as $func$
begin
  if tg_op='UPDATE' and old.retry_matching_operation_id is not null and new.retry_matching_operation_id is null
  then raise exception using errcode='23514',message='MATCHING_RETRY_OUTBOX_IDENTITY_REQUIRED'; end if;
  if new.retry_matching_operation_id is not null and not exists(
    select 1 from public.matching_operations matching
      join public.confirmation_operations confirmation on confirmation.id=matching.confirmation_operation_id
      join public.jobs job on job.id=confirmation.job_id
    where matching.id=new.retry_matching_operation_id and matching.retry_request_id is not null
      and matching.confirmation_operation_id=new.operation_id and matching.job_id=job.id
      and matching.retry_requested_by=confirmation.customer_id and confirmation.customer_id=job.customer_id
      and matching.synthetic_cohort_id is not distinct from job.synthetic_cohort_id
      and confirmation.synthetic_cohort_id is not distinct from job.synthetic_cohort_id)
  then raise exception using errcode='23514',message='MATCHING_RETRY_OUTBOX_IDENTITY_INVALID'; end if;
  return new;
end;
$func$;
create or replace trigger matching_retry_outbox_identity_guard before insert or update of
  operation_id,event_type,retry_matching_operation_id,replacement_matching_operation_id,worker_cancellation_id
  on public.workflow_outbox for each row execute function private.guard_matching_retry_outbox_identity();

create or replace function private.matching_retry_receipt(p_operation_id uuid)
returns jsonb language sql security definer set search_path = '' stable as $func$
  select jsonb_build_object(
    'operation_id',matching.id,'confirmation_operation_id',matching.confirmation_operation_id,
    'job_id',matching.job_id,'request_id',matching.retry_request_id,
    'parent_operation_id',matching.retry_parent_operation_id,'state',matching.state,
    'support_code',confirmation.support_code,'created_at',matching.created_at,'updated_at',matching.updated_at,
    'broadcast_sent',exists(select 1 from public.matching_recipient_deliveries delivery
      where delivery.operation_id=matching.id and delivery.status in ('queued','delivered','seen','accepted')))
  from public.matching_operations matching join public.confirmation_operations confirmation
    on confirmation.id=matching.confirmation_operation_id
  where matching.id=p_operation_id and matching.retry_request_id is not null;
$func$;

create or replace function public.get_job_matching_retry_operation(
  p_job_id uuid,p_customer_id uuid,p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $func$
declare v_operation uuid;
begin
  if p_job_id is null or p_customer_id is null or p_client_request_id is null then
    raise exception using errcode='22023',message='MATCHING_RETRY_INPUT_INVALID';
  end if;
  select matching.id into v_operation from public.matching_operations matching
    join public.jobs job on job.id=matching.job_id join public.profiles actor on actor.id=job.customer_id
    where matching.job_id=p_job_id and job.customer_id=p_customer_id and actor.role='customer'
      and matching.retry_requested_by=p_customer_id and matching.retry_request_id=p_client_request_id;
  if not found then raise exception using errcode='42501',message='MATCHING_RETRY_NOT_OWNED'; end if;
  return private.matching_retry_receipt(v_operation);
end;
$func$;

create or replace function public.request_job_matching_retry_atomic(
  p_job_id uuid,p_customer_id uuid,p_client_request_id uuid,p_expected_matching_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_confirmation public.confirmation_operations%rowtype;
  v_existing public.matching_operations%rowtype;
  v_parent public.matching_operations%rowtype;
  v_worker record;
  v_capacity public.matching_capacity_reservations%rowtype;
  v_worker_ids uuid[] := array[]::uuid[];
  v_required integer;
  v_operation uuid;
  v_now timestamptz;
begin
  if p_job_id is null or p_customer_id is null or p_client_request_id is null
    or p_expected_matching_operation_id is null then
    raise exception using errcode='22023',message='MATCHING_RETRY_INPUT_INVALID';
  end if;
  select job.* into v_job from public.jobs job join public.profiles actor on actor.id=job.customer_id
    where job.id=p_job_id and job.customer_id=p_customer_id and actor.role='customer' for update of job;
  if not found then raise exception using errcode='42501',message='MATCHING_RETRY_NOT_OWNED'; end if;

  -- Replay precedes state checks so a lost response can be recovered even after Customer selection.
  select matching.* into v_existing from public.matching_operations matching where matching.retry_request_id=p_client_request_id;
  if found then
    if v_existing.job_id<>p_job_id or v_existing.retry_requested_by<>p_customer_id
      or v_existing.retry_parent_operation_id<>p_expected_matching_operation_id then
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
  if exists(select 1 from public.job_matching_preferences preference where preference.job_id=v_job.id
    and preference.strategy<>'general' and preference.fallback_at is null) then
    raise exception using errcode='55000',message='MATCHING_PREFERENCE_PENDING';
  end if;
  v_now := clock_timestamp();
  v_required := case when v_job.synthetic_cohort_id is null then 3 else 1 end;
  for v_worker in
    select worker.id from public.worker_profiles worker
      join private.eligible_matching_worker_ids(v_job.service_type,
        public.normalize_hcmc_district_code(v_job.address_district),v_job.quote_mode,v_job.diagnosis_scope,
        v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,v_now,v_job.id,v_confirmation.id) eligible
        on eligible.worker_id=worker.id
    where not exists(select 1 from public.job_broadcasts prior where prior.job_id=v_job.id and prior.worker_id=worker.id)
    order by worker.id limit 50 for update of worker skip locked
  loop
    -- Expired unique-index holders can be reclaimed only if their capacity row is not busy.
    select capacity.* into v_capacity from public.matching_capacity_reservations capacity
      where capacity.worker_id=v_worker.id and capacity.status in ('held','offered') for update skip locked;
    if found then
      if v_capacity.expires_at>clock_timestamp() then continue; end if;
      update public.matching_capacity_reservations set status='expired',released_at=clock_timestamp(),
        updated_at=clock_timestamp() where id=v_capacity.id;
    elsif exists(select 1 from public.matching_capacity_reservations capacity
      where capacity.worker_id=v_worker.id and capacity.status in ('held','offered')) then continue;
    end if;
    if not exists(select 1 from private.eligible_matching_worker_ids(v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district),v_job.quote_mode,v_job.diagnosis_scope,
      v_job.intake_scope_snapshot,v_job.synthetic_cohort_id,clock_timestamp(),v_job.id,v_confirmation.id) eligible
      where eligible.worker_id=v_worker.id) then continue; end if;
    v_worker_ids := array_append(v_worker_ids,v_worker.id);
    exit when cardinality(v_worker_ids)=5;
  end loop;
  if cardinality(v_worker_ids)<v_required then
    raise exception using errcode='55000',message='COVERAGE_UNAVAILABLE';
  end if;
  v_now := clock_timestamp();
  insert into public.matching_operations(confirmation_operation_id,job_id,state,synthetic_cohort_id,
    retry_request_id,retry_parent_operation_id,retry_requested_by,created_at,updated_at)
    values(v_confirmation.id,v_job.id,'queued',v_job.synthetic_cohort_id,p_client_request_id,v_parent.id,
      p_customer_id,v_now,v_now) returning id into v_operation;
  insert into public.matching_capacity_reservations(operation_id,job_id,worker_id,service_type,district_code,
    status,held_at,expires_at,synthetic_cohort_id)
    select v_confirmation.id,v_job.id,worker_id,v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district),'held',v_now,v_now+interval '5 minutes',v_job.synthetic_cohort_id
    from unnest(v_worker_ids) selected(worker_id)
    on conflict(operation_id,worker_id) do update set status='held',held_at=excluded.held_at,
      expires_at=excluded.expires_at,released_at=null,updated_at=v_now;
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

revoke execute on function private.guard_matching_retry_identity(),private.guard_matching_retry_outbox_identity(),
  private.matching_retry_receipt(uuid) from public,anon,authenticated,service_role;
revoke execute on function public.request_job_matching_retry_atomic(uuid,uuid,uuid,uuid),
  public.get_job_matching_retry_operation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_job_matching_retry_atomic(uuid,uuid,uuid,uuid),
  public.get_job_matching_retry_operation(uuid,uuid,uuid) to service_role;

commit;
