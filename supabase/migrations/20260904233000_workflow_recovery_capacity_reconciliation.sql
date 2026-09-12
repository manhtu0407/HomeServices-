-- Workflow recovery is observational by default: detection never changes a job state.
-- Capacity reconciliation only closes expired or no-longer-applicable matching leases.

begin;

create table if not exists public.workflow_recovery_cases (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  detected_state text not null check (char_length(detected_state) between 3 and 64),
  severity text not null check (severity in ('medium', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'action_required', 'resolved')),
  first_detected_at timestamptz not null,
  last_detected_at timestamptz not null,
  last_activity_at timestamptz not null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolution_note text check (
    resolution_note is null or char_length(pg_catalog.btrim(resolution_note)) between 3 and 500
  ),
  version integer not null default 1 check (version > 0),
  safe_metadata jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null and resolved_by is null)
  )
);

create unique index if not exists workflow_recovery_cases_one_active_job_idx
  on public.workflow_recovery_cases(job_id)
  where status in ('open', 'acknowledged', 'action_required');

create index if not exists workflow_recovery_cases_status_activity_idx
  on public.workflow_recovery_cases(status, severity, last_activity_at, id);

create table if not exists public.workflow_recovery_action_audit (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid not null references public.workflow_recovery_cases(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null check (action in (
    'acknowledge', 'mark_contact_required', 'reconcile_capacity',
    'resolve_verified', 'system_recovered'
  )),
  reason text not null check (char_length(pg_catalog.btrim(reason)) between 3 and 500),
  idempotency_key uuid not null,
  case_version integer not null check (case_version > 0),
  affected_reservation_count integer not null default 0
    check (affected_reservation_count >= 0),
  observed_job_state text not null check (char_length(observed_job_state) between 3 and 64),
  safe_metadata jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_id, idempotency_key)
);

create index if not exists workflow_recovery_action_audit_case_idx
  on public.workflow_recovery_action_audit(recovery_case_id, created_at, id);

alter table public.workflow_recovery_cases enable row level security;
alter table public.workflow_recovery_action_audit enable row level security;

revoke all on public.workflow_recovery_cases from public, anon, authenticated;
revoke all on public.workflow_recovery_action_audit from public, anon, authenticated;
grant select, insert, update on public.workflow_recovery_cases to service_role;
grant select, insert on public.workflow_recovery_action_audit to service_role;

do $trigger_guard$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'workflow_recovery_cases_updated_at'
      and tgrelid = 'public.workflow_recovery_cases'::regclass
      and not tgisinternal
  ) then
    create trigger workflow_recovery_cases_updated_at
    before update on public.workflow_recovery_cases
    for each row execute function public.update_updated_at();
  end if;
end;
$trigger_guard$;

create or replace function private.workflow_recovery_reason_for_job(
  p_job_id uuid,
  p_observed_at timestamptz
) returns table (
  reason_code text,
  detected_state text,
  last_activity_at timestamptz,
  severity text
)
language sql
stable
security invoker
set search_path = ''
as $func$
  with job_snapshot as (
    select
      job.id,
      job.status::text as job_state,
      job.updated_at,
      matching.state as matching_state,
      matching.updated_at as matching_updated_at
    from public.jobs as job
    left join lateral (
      select operation.state, operation.updated_at
      from public.matching_operations as operation
      where operation.job_id = job.id
      order by operation.updated_at desc, operation.id desc
      limit 1
    ) as matching on true
    where job.id = p_job_id
      and job.synthetic_cohort_id is null
  ), classified as (
    select
      case
        when matching_state = 'recovery_required'
          and matching_updated_at <= p_observed_at - interval '15 minutes'
          then 'MATCHING_RECOVERY_STUCK'
        when job_state = 'broadcasting'
          and updated_at <= p_observed_at - interval '15 minutes'
          then 'BROADCASTING_STUCK'
        when job_state = 'worker_candidate_pending'
          and updated_at <= p_observed_at - interval '10 minutes'
          then 'CANDIDATE_DECISION_STUCK'
        when job_state = 'worker_on_way'
          and updated_at <= p_observed_at - interval '4 hours'
          then 'WORKER_ON_WAY_STUCK'
        when job_state = 'arrived'
          and updated_at <= p_observed_at - interval '4 hours'
          then 'ARRIVAL_STUCK'
        when job_state = 'inspecting'
          and updated_at <= p_observed_at - interval '6 hours'
          then 'INSPECTION_STUCK'
        when job_state = 'repairing'
          and updated_at <= p_observed_at - interval '12 hours'
          then 'WORK_STUCK'
        when job_state = 'scope_change_pending'
          and updated_at <= p_observed_at - interval '24 hours'
          then 'SCOPE_CHANGE_STUCK'
        when job_state = 'completed_by_worker'
          and updated_at <= p_observed_at - interval '24 hours'
          then 'COMPLETION_CONFIRMATION_STUCK'
        when job_state = 'confirmed_by_customer'
          and updated_at <= p_observed_at - interval '72 hours'
          then 'PAYMENT_SETUP_STUCK'
        when job_state = 'payment_pending'
          and updated_at <= p_observed_at - interval '7 days'
          then 'PAYMENT_RECONCILIATION_STUCK'
        else null
      end as reason_code,
      case
        when matching_state = 'recovery_required'
          and matching_updated_at <= p_observed_at - interval '15 minutes'
          then 'matching_recovery_required'
        else job_state
      end as detected_state,
      case
        when matching_state = 'recovery_required'
          and matching_updated_at <= p_observed_at - interval '15 minutes'
          then matching_updated_at
        else updated_at
      end as last_activity_at
    from job_snapshot
  )
  select
    classified.reason_code,
    classified.detected_state,
    classified.last_activity_at,
    case
      when classified.reason_code in (
        'MATCHING_RECOVERY_STUCK', 'BROADCASTING_STUCK',
        'CANDIDATE_DECISION_STUCK', 'ARRIVAL_STUCK'
      ) then 'high'
      else 'medium'
    end as severity
  from classified
  where classified.reason_code is not null;
$func$;

revoke execute on function private.workflow_recovery_reason_for_job(uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function private.workflow_recovery_reason_for_job(uuid,timestamptz)
  to service_role;

create or replace function public.reconcile_matching_capacity_reservations(
  p_job_id uuid default null,
  p_observed_at timestamptz default pg_catalog.clock_timestamp()
) returns table (
  expired_count integer,
  released_count integer
)
language plpgsql
security invoker
set search_path = ''
as $func$
declare
  v_expired_count integer := 0;
  v_released_count integer := 0;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_observed_at is null or p_observed_at > pg_catalog.clock_timestamp() + interval '1 minute' then
    raise exception using errcode = '22023', message = 'OBSERVED_AT_INVALID';
  end if;

  update public.matching_capacity_reservations as capacity
  set status = 'expired',
    released_at = p_observed_at,
    updated_at = p_observed_at
  where capacity.status in ('held', 'offered')
    and capacity.expires_at <= p_observed_at
    and (p_job_id is null or capacity.job_id = p_job_id);
  get diagnostics v_expired_count = row_count;

  update public.matching_capacity_reservations as capacity
  set status = 'released',
    released_at = p_observed_at,
    updated_at = p_observed_at
  where capacity.status in ('held', 'offered')
    and (p_job_id is null or capacity.job_id = p_job_id)
    and exists (
      select 1
      from public.jobs as job
      where job.id = capacity.job_id
        and job.status not in (
          'broadcasting'::public.job_status,
          'worker_candidate_pending'::public.job_status
        )
    );
  get diagnostics v_released_count = row_count;

  return query select v_expired_count, v_released_count;
end;
$func$;

revoke execute on function public.reconcile_matching_capacity_reservations(uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.reconcile_matching_capacity_reservations(uuid,timestamptz)
  to service_role;

create or replace function private.release_matching_capacity_after_job_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if new.status is distinct from old.status
    and new.status not in (
      'broadcasting'::public.job_status,
      'worker_candidate_pending'::public.job_status
    )
  then
    update public.matching_capacity_reservations as capacity
    set status = 'released',
      released_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where capacity.job_id = new.id
      and capacity.status in ('held', 'offered');
  end if;
  return new;
end;
$func$;

do $trigger_guard$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'jobs_release_matching_capacity_after_state'
      and tgrelid = 'public.jobs'::regclass
      and not tgisinternal
  ) then
    create trigger jobs_release_matching_capacity_after_state
    after update of status on public.jobs
    for each row execute function private.release_matching_capacity_after_job_state();
  end if;
end;
$trigger_guard$;

create or replace function public.detect_workflow_recovery_cases(
  p_observed_at timestamptz default pg_catalog.clock_timestamp()
) returns table (
  detected_count integer,
  resolved_count integer,
  expired_reservation_count integer,
  released_reservation_count integer
)
language plpgsql
security invoker
set search_path = ''
as $func$
declare
  v_detected_count integer := 0;
  v_resolved_count integer := 0;
  v_expired_count integer := 0;
  v_released_count integer := 0;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_observed_at is null or p_observed_at > pg_catalog.clock_timestamp() + interval '1 minute' then
    raise exception using errcode = '22023', message = 'OBSERVED_AT_INVALID';
  end if;

  select reconciled.expired_count, reconciled.released_count
  into v_expired_count, v_released_count
  from public.reconcile_matching_capacity_reservations(null, p_observed_at) as reconciled;

  with stuck as (
    select job.id as job_id, reason.*
    from public.jobs as job
    cross join lateral private.workflow_recovery_reason_for_job(job.id, p_observed_at) as reason
  ), upserted as (
    insert into public.workflow_recovery_cases as recovery (
      job_id, reason_code, detected_state, severity, status,
      first_detected_at, last_detected_at, last_activity_at, safe_metadata
    )
    select
      stuck.job_id,
      stuck.reason_code,
      stuck.detected_state,
      stuck.severity,
      'open',
      p_observed_at,
      p_observed_at,
      stuck.last_activity_at,
      pg_catalog.jsonb_build_object('detector', 'workflow_recovery_v1')
    from stuck
    on conflict (job_id) where status in ('open', 'acknowledged', 'action_required')
    do update set
      reason_code = excluded.reason_code,
      detected_state = excluded.detected_state,
      severity = excluded.severity,
      last_detected_at = excluded.last_detected_at,
      last_activity_at = excluded.last_activity_at,
      version = recovery.version + 1,
      safe_metadata = recovery.safe_metadata || excluded.safe_metadata
    returning id
  )
  select pg_catalog.count(*)::integer into v_detected_count from upserted;

  with recovered as (
    update public.workflow_recovery_cases as recovery
    set status = 'resolved',
      resolved_at = p_observed_at,
      resolved_by = null,
      resolution_note = 'system_recovered_without_job_mutation',
      version = recovery.version + 1
    where recovery.status in ('open', 'acknowledged', 'action_required')
      and not exists (
        select 1
        from private.workflow_recovery_reason_for_job(recovery.job_id, p_observed_at)
      )
    returning recovery.*
  ), audited as (
    insert into public.workflow_recovery_action_audit (
      recovery_case_id, job_id, actor_id, action, reason, idempotency_key,
      case_version, affected_reservation_count, observed_job_state, safe_metadata
    )
    select
      recovered.id,
      recovered.job_id,
      null,
      'system_recovered',
      'workflow advanced without administrative state mutation',
      recovered.id,
      recovered.version,
      0,
      recovered.detected_state,
      pg_catalog.jsonb_build_object('detector', 'workflow_recovery_v1')
    from recovered
    on conflict (actor_id, idempotency_key) do nothing
    returning id
  )
  select pg_catalog.count(*)::integer into v_resolved_count from audited;

  return query select v_detected_count, v_resolved_count, v_expired_count, v_released_count;
end;
$func$;

revoke execute on function public.detect_workflow_recovery_cases(timestamptz)
  from public, anon, authenticated;
grant execute on function public.detect_workflow_recovery_cases(timestamptz)
  to service_role;

create or replace function public.admin_apply_workflow_recovery_action_atomic(
  p_recovery_case_id uuid,
  p_actor_id uuid,
  p_action text,
  p_reason text,
  p_idempotency_key uuid,
  p_expected_version integer
) returns table (
  ok boolean,
  error_code text,
  recovery_case_id uuid,
  job_id uuid,
  status text,
  version integer,
  affected_reservation_count integer,
  already_applied boolean,
  applied_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $func$
declare
  v_case public.workflow_recovery_cases%rowtype;
  v_existing public.workflow_recovery_action_audit%rowtype;
  v_actor_role public.user_role;
  v_action text := lower(pg_catalog.btrim(coalesce(p_action, '')));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_affected integer := 0;
  v_expired integer := 0;
  v_released integer := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_recovery_case_id is null or p_actor_id is null or p_idempotency_key is null
    or p_expected_version is null or p_expected_version < 1
    or v_action not in (
      'acknowledge', 'mark_contact_required', 'reconcile_capacity', 'resolve_verified'
    )
    or char_length(v_reason) not between 3 and 500
  then
    return query select false, 'INPUT_INVALID', p_recovery_case_id, null::uuid,
      null::text, null::integer, 0, false, null::timestamptz;
    return;
  end if;

  select audit.* into v_existing
  from public.workflow_recovery_action_audit as audit
  where audit.actor_id = p_actor_id
    and audit.idempotency_key = p_idempotency_key;
  if found then
    select recovery.* into v_case
    from public.workflow_recovery_cases as recovery
    where recovery.id = v_existing.recovery_case_id;
    return query select true, null::text, v_case.id, v_case.job_id, v_case.status,
      v_case.version, v_existing.affected_reservation_count, true, v_existing.created_at;
    return;
  end if;

  select profile.role into v_actor_role
  from public.profiles as profile
  where profile.id = p_actor_id;
  if v_actor_role <> 'admin'::public.user_role
    and not (
      v_actor_role = 'admin_operator'::public.user_role
      and exists (
        select 1
        from public.admin_operator_accounts as operator_account
        where operator_account.user_id = p_actor_id
          and operator_account.status = 'active'
          and 'operations.read' = any(operator_account.capabilities)
          and 'operations.triage' = any(operator_account.capabilities)
      )
    )
  then
    return query select false, 'OPERATIONS_TRIAGE_REQUIRED', p_recovery_case_id,
      null::uuid, null::text, null::integer, 0, false, null::timestamptz;
    return;
  end if;

  select recovery.* into v_case
  from public.workflow_recovery_cases as recovery
  where recovery.id = p_recovery_case_id
  for update;
  if not found then
    return query select false, 'NOT_FOUND', p_recovery_case_id, null::uuid,
      null::text, null::integer, 0, false, null::timestamptz;
    return;
  end if;
  if v_case.version <> p_expected_version then
    return query select false, 'VERSION_CONFLICT', v_case.id, v_case.job_id,
      v_case.status, v_case.version, 0, false, null::timestamptz;
    return;
  end if;
  if v_case.status = 'resolved' then
    return query select false, 'CASE_ALREADY_RESOLVED', v_case.id, v_case.job_id,
      v_case.status, v_case.version, 0, false, null::timestamptz;
    return;
  end if;

  if v_action = 'resolve_verified' then
    perform 1
    from private.workflow_recovery_reason_for_job(v_case.job_id, v_now) as reason;
    if found then
      return query select false, 'CASE_STILL_STUCK', v_case.id, v_case.job_id,
        v_case.status, v_case.version, 0, false, null::timestamptz;
      return;
    end if;
  elsif v_action = 'reconcile_capacity' then
    select reconciled.expired_count, reconciled.released_count
    into v_expired, v_released
    from public.reconcile_matching_capacity_reservations(v_case.job_id, v_now) as reconciled;
    v_affected := coalesce(v_expired, 0) + coalesce(v_released, 0);
  end if;

  update public.workflow_recovery_cases as recovery
  set status = case v_action
      when 'mark_contact_required' then 'action_required'
      when 'resolve_verified' then 'resolved'
      else 'acknowledged'
    end,
    resolved_at = case when v_action = 'resolve_verified' then v_now else null end,
    resolved_by = case when v_action = 'resolve_verified' then p_actor_id else null end,
    resolution_note = case when v_action = 'resolve_verified' then v_reason else null end,
    version = recovery.version + 1
  where recovery.id = v_case.id
  returning recovery.* into v_case;

  insert into public.workflow_recovery_action_audit (
    recovery_case_id, job_id, actor_id, action, reason, idempotency_key,
    case_version, affected_reservation_count, observed_job_state, safe_metadata
  ) values (
    v_case.id, v_case.job_id, p_actor_id, v_action, v_reason, p_idempotency_key,
    v_case.version, v_affected, v_case.detected_state,
    pg_catalog.jsonb_build_object(
      'expired_reservations', coalesce(v_expired, 0),
      'released_reservations', coalesce(v_released, 0)
    )
  ) returning created_at into v_now;

  return query select true, null::text, v_case.id, v_case.job_id, v_case.status,
    v_case.version, v_affected, false, v_now;
end;
$func$;

revoke execute on function public.admin_apply_workflow_recovery_action_atomic(
  uuid,uuid,text,text,uuid,integer
) from public, anon, authenticated;
grant execute on function public.admin_apply_workflow_recovery_action_atomic(
  uuid,uuid,text,text,uuid,integer
) to service_role;

comment on table public.workflow_recovery_cases is
  'PII-free observations of workflows that exceeded state-specific recovery thresholds; detection never changes job state.';
comment on table public.workflow_recovery_action_audit is
  'Append-only receipts for bounded workflow recovery actions; job status changes are intentionally excluded.';
comment on function public.reconcile_matching_capacity_reservations(uuid,timestamptz) is
  'Releases only expired or no-longer-applicable capacity leases without changing a job.';

commit;
