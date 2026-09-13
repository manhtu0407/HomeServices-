begin;

alter table public.workflow_outbox
  alter column operation_id drop not null,
  add column if not exists replacement_matching_operation_id uuid references public.matching_operations(id) on delete cascade,
  add column if not exists worker_cancellation_id uuid references public.worker_cancellation_requests(id) on delete cascade;

create unique index if not exists workflow_outbox_worker_cancellation_uidx
  on public.workflow_outbox(worker_cancellation_id) where worker_cancellation_id is not null;
create unique index if not exists workflow_outbox_replacement_matching_uidx
  on public.workflow_outbox(replacement_matching_operation_id) where replacement_matching_operation_id is not null;

do $guard$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'workflow_outbox_replacement_identity_check'
    and conrelid = 'public.workflow_outbox'::regclass) then
    alter table public.workflow_outbox add constraint workflow_outbox_replacement_identity_check check (
      (operation_id is not null and worker_cancellation_id is null and replacement_matching_operation_id is null)
      or (operation_id is null and event_type = 'matching_reconcile'
        and worker_cancellation_id is not null and replacement_matching_operation_id is not null)
    );
  end if;
end;
$guard$;

create or replace function private.guard_replacement_outbox_identity()
returns trigger language plpgsql security definer set search_path = '' as $func$
begin
  if not exists (select 1 from public.worker_cancellation_requests as cancellation
    join public.matching_operations as matching on matching.id = new.replacement_matching_operation_id
    join public.jobs as job on job.id = cancellation.job_id and job.id = matching.job_id
    left join public.confirmation_operations as confirmation on confirmation.id = matching.confirmation_operation_id
    where cancellation.id = new.worker_cancellation_id and cancellation.status = 'approved'
      and matching.synthetic_cohort_id is not distinct from job.synthetic_cohort_id
      and (matching.confirmation_operation_id is null or confirmation.job_id = job.id)) then
    raise exception using errcode = '23514', message = 'REPLACEMENT_OUTBOX_IDENTITY_INVALID';
  end if;
  return new;
end;
$func$;
create or replace trigger workflow_outbox_replacement_identity_guard
  before insert or update of worker_cancellation_id, replacement_matching_operation_id on public.workflow_outbox
  for each row when (new.worker_cancellation_id is not null)
  execute function private.guard_replacement_outbox_identity();

create or replace function private.enqueue_worker_cancellation_replacement(p_cancellation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $func$
declare
  v_cancel public.worker_cancellation_requests%rowtype;
  v_job public.jobs%rowtype;
  v_confirmation_id uuid;
  v_matching_id uuid;
  v_outbox_id uuid;
begin
  select cancellation.* into strict v_cancel from public.worker_cancellation_requests as cancellation
    where cancellation.id = p_cancellation_id and cancellation.status = 'approved';
  select job.* into strict v_job from public.jobs as job where job.id = v_cancel.job_id for update;
  -- Match the cancellation command's job-before-request lock order on recovery.
  select cancellation.* into strict v_cancel from public.worker_cancellation_requests as cancellation
    where cancellation.id = p_cancellation_id and cancellation.status = 'approved' for update;
  select outbox.id into v_outbox_id from public.workflow_outbox as outbox
    where outbox.worker_cancellation_id = v_cancel.id;
  if found then return v_outbox_id; end if;
  if v_job.worker_id = v_cancel.worker_id then
    raise exception using errcode = '55000', message = 'CANCELLATION_ASSIGNMENT_NOT_RELEASED';
  end if;
  if v_job.worker_id is not null or v_job.status <> 'broadcasting' then return null; end if;

  select operation.id into v_confirmation_id from public.confirmation_operations as operation
    where operation.job_id = v_job.id for update;
  update public.jobs set apartment_access_state = '{}'::jsonb where id = v_job.id;
  update public.job_broadcasts set status = 'reassigned', responded_at = now()
    where job_id = v_job.id and status in ('pending', 'sent', 'accepted');
  update public.matching_capacity_reservations as capacity
    set status = 'released', released_at = now(), updated_at = now()
    where capacity.job_id = v_job.id and capacity.status in ('held', 'offered');
  update public.matching_operations as matching set state = 'stopped', updated_at = now()
    where matching.job_id = v_job.id and matching.state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required');
  update public.matching_recipient_deliveries as delivery set status = 'expired', updated_at = now()
    where delivery.job_id = v_job.id and delivery.status in ('queued', 'delivered', 'seen');
  update public.job_worker_candidates as candidate set status = 'expired', updated_at = now()
    where candidate.job_id = v_job.id and candidate.status = 'proposed';
  update public.worker_matching_proposals as proposal set status = 'expired', updated_at = now()
    where proposal.job_id = v_job.id and proposal.status = 'proposed';
  update public.confirmation_operations set state = 'matching_queued', last_error_code = null,
    retry_after_ms = null, updated_at = now() where id = v_confirmation_id;
  insert into public.matching_operations(confirmation_operation_id, job_id, state, synthetic_cohort_id)
    values (v_confirmation_id, v_job.id, 'queued', v_job.synthetic_cohort_id) returning id into v_matching_id;
  insert into public.workflow_outbox(event_type, replacement_matching_operation_id, worker_cancellation_id, safe_payload)
    values ('matching_reconcile', v_matching_id, v_cancel.id, jsonb_build_object('job_id', v_job.id))
    returning id into v_outbox_id;
  return v_outbox_id;
end;
$func$;

create or replace function private.queue_approved_worker_cancellation()
returns trigger language plpgsql security definer set search_path = '' as $func$
begin
  if exists (select 1 from public.worker_cancellation_requests where id = new.id and status = 'approved') then
    perform private.enqueue_worker_cancellation_replacement(new.id);
  end if;
  return new;
end;
$func$;

do $guard$
begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgname = 'worker_cancellation_durable_replacement'
    and tgrelid = 'public.worker_cancellation_requests'::regclass and not tgisinternal) then
    create constraint trigger worker_cancellation_durable_replacement
      after insert or update on public.worker_cancellation_requests
      deferrable initially deferred for each row when (new.status = 'approved')
      execute function private.queue_approved_worker_cancellation();
  end if;
end;
$guard$;

create or replace function public.recover_worker_cancellation_replacement(p_cancellation_id uuid, p_worker_id uuid)
returns table(job_status public.job_status, replacement_state text, broadcast_sent boolean)
language plpgsql security definer set search_path = '' as $func$
declare
  v_cancel public.worker_cancellation_requests%rowtype;
  v_outbox_id uuid;
begin
  select cancellation.* into v_cancel from public.worker_cancellation_requests as cancellation
    where cancellation.id = p_cancellation_id and cancellation.worker_id = p_worker_id
      and cancellation.status = 'approved';
  if not found then raise exception using errcode = '42501', message = 'CANCELLATION_NOT_OWNED'; end if;
  v_outbox_id := private.enqueue_worker_cancellation_replacement(v_cancel.id);
  return query select job.status, coalesce(matching.state, 'stopped'),
    exists (select 1 from public.matching_recipient_deliveries as delivery
      where delivery.operation_id = matching.id and delivery.status in ('queued', 'delivered', 'seen', 'accepted'))
    from public.jobs as job
    left join public.workflow_outbox as outbox on outbox.id = v_outbox_id
    left join public.matching_operations as matching on matching.id = outbox.replacement_matching_operation_id
    where job.id = v_cancel.job_id;
end;
$func$;

create or replace function public.claim_worker_replacement_outbox_batch(
  p_dispatcher_id text, p_limit integer default 20, p_lease_seconds integer default 45
) returns table(outbox_id uuid, lease_token uuid)
language plpgsql security definer set search_path = '' as $func$
begin
  if p_dispatcher_id is null or p_dispatcher_id !~ '^[A-Za-z0-9_.:-]{8,160}$'
    or p_limit is null or p_limit not between 1 and 50
    or p_lease_seconds is null or p_lease_seconds not between 15 and 120 then
    raise exception using errcode = '22023', message = 'REPLACEMENT_OUTBOX_CLAIM_INVALID';
  end if;
  return query with claimable as (
    select outbox.id from public.workflow_outbox as outbox
    where outbox.event_type = 'matching_reconcile' and outbox.worker_cancellation_id is not null
      and outbox.dead_lettered_at is null and outbox.attempt_count < 8
      and ((outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= now())
        or (outbox.status = 'processing' and coalesce(outbox.lease_expires_at, '-infinity'::timestamptz) <= now()))
    order by outbox.next_attempt_at, outbox.created_at, outbox.id for update skip locked limit p_limit
  ) update public.workflow_outbox as outbox set status = 'processing',
    attempt_count = outbox.attempt_count + 1, lease_token = gen_random_uuid(), leased_by = p_dispatcher_id,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
    from claimable where outbox.id = claimable.id returning outbox.id, outbox.lease_token;
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
  select outbox.* into v_outbox from public.workflow_outbox as outbox where outbox.id = p_outbox_id
    and outbox.event_type = 'matching_reconcile' and outbox.worker_cancellation_id is not null
    and outbox.status = 'processing' and outbox.lease_token = p_lease_token
    and outbox.lease_expires_at > clock_timestamp() for update;
  if not found then return jsonb_build_object('state', 'lease_lost'); end if;
  select matching.* into strict v_matching from public.matching_operations as matching
    where matching.id = v_outbox.replacement_matching_operation_id;
  select job.* into strict v_job from public.jobs as job where job.id = v_matching.job_id for update;
  select matching.* into strict v_matching from public.matching_operations as matching
    where matching.id = v_outbox.replacement_matching_operation_id;
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
    return jsonb_build_object('state', 'broadcasting', 'job_id', v_job.id, 'customer_id', v_job.customer_id,
      'service_type', v_job.service_type, 'district', v_job.address_district,
      'expires_at', v_expires_at, 'targets', v_targets);
  end if;
  if exists (select 1 from public.job_broadcasts as broadcast where broadcast.job_id = v_job.id
    and broadcast.status = 'sent' and broadcast.expires_at > v_sent_at) then
    return jsonb_build_object('state', 'recovery_required', 'error_code', 'REPLACEMENT_OTHER_BATCH_ACTIVE');
  end if;

  update public.matching_capacity_reservations as capacity set status = 'expired',
    released_at = v_sent_at, updated_at = v_sent_at
    where capacity.job_id = v_job.id and capacity.status in ('held', 'offered') and capacity.expires_at <= v_sent_at;
  select coalesce(array_agg(selected.worker_id order by selected.worker_id), array[]::uuid[])
    into v_worker_ids from (
      select worker.id as worker_id from public.worker_profiles as worker
      join private.eligible_matching_worker_ids(v_job.service_type,
        public.normalize_hcmc_district_code(v_job.address_district), v_job.quote_mode,
        v_job.diagnosis_scope, v_job.intake_scope_snapshot, v_job.synthetic_cohort_id,
        v_sent_at, v_job.id, v_matching.confirmation_operation_id) as eligible on eligible.worker_id = worker.id
      where not exists (select 1 from public.worker_cancellation_requests as cancelled
        where cancelled.job_id = v_job.id and cancelled.worker_id = worker.id and cancelled.status = 'approved')
        and not exists (select 1 from public.job_broadcasts as prior
          where prior.job_id = v_job.id and prior.worker_id = worker.id)
        and not exists (select 1 from public.matching_capacity_reservations as capacity
          where capacity.worker_id = worker.id and capacity.job_id <> v_job.id and capacity.status in ('held', 'offered'))
      order by worker.id for update of worker skip locked limit 5
    ) as selected;
  if cardinality(v_worker_ids) = 0 then return jsonb_build_object('state', 'no_reachable_worker'); end if;
  v_expires_at := v_sent_at + interval '5 minutes';
  insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
    district_code, held_at, expires_at, synthetic_cohort_id)
    select v_matching.confirmation_operation_id, v_job.id, worker_id, v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district), v_sent_at, v_expires_at, v_job.synthetic_cohort_id
    from unnest(v_worker_ids) as selected(worker_id)
    on conflict (operation_id, worker_id) do update set status = 'held', held_at = excluded.held_at,
      released_at = null, expires_at = excluded.expires_at, updated_at = v_sent_at;
  select jsonb_agg(jsonb_build_object('worker_id', target.worker_id, 'broadcast_id', target.id,
    'delivery_id', target.delivery_id, 'operation_id', target.operation_id) order by target.worker_id) into v_targets
    from public.activate_job_broadcast_batch_durable_atomic_v2(v_job.id, v_worker_ids, v_outbox.id,
      v_sent_at, v_expires_at) as target;
  if v_targets is null then raise exception using errcode = '55000', message = 'REPLACEMENT_ACTIVATION_FAILED'; end if;
  return jsonb_build_object('state', 'broadcasting', 'job_id', v_job.id, 'customer_id', v_job.customer_id,
    'service_type', v_job.service_type, 'district', v_job.address_district, 'expires_at', v_expires_at, 'targets', v_targets);
end;
$func$;

create or replace function public.settle_worker_replacement_outbox_claim(
  p_outbox_id uuid, p_lease_token uuid, p_state text, p_error_code text default null
) returns text language plpgsql security definer set search_path = '' as $func$
declare
  v_outbox public.workflow_outbox%rowtype;
  v_matching public.matching_operations%rowtype;
  v_job public.jobs%rowtype;
  v_state text := p_state;
  v_outcome text;
begin
  if p_state is null or p_state not in ('broadcasting', 'candidate_ready', 'official_match', 'no_reachable_worker', 'recovery_required', 'stopped')
    or (p_state = 'recovery_required' and (p_error_code is null or p_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$')) then
    raise exception using errcode = '22023', message = 'REPLACEMENT_OUTBOX_SETTLE_INVALID';
  end if;
  select outbox.* into v_outbox from public.workflow_outbox as outbox where outbox.id = p_outbox_id
    and outbox.event_type = 'matching_reconcile' and outbox.worker_cancellation_id is not null
    and outbox.status = 'processing' and outbox.lease_token = p_lease_token and outbox.lease_expires_at > now() for update;
  if not found then return 'lease_lost'; end if;
  select matching.* into strict v_matching from public.matching_operations as matching
    where matching.id = v_outbox.replacement_matching_operation_id;
  select job.* into strict v_job from public.jobs as job where job.id = v_matching.job_id for update;
  select matching.* into strict v_matching from public.matching_operations as matching
    where matching.id = v_outbox.replacement_matching_operation_id;
  if v_matching.state = 'stopped' or exists (select 1 from public.matching_operations as current_operation
    where current_operation.job_id = v_job.id and current_operation.id <> v_matching.id
      and current_operation.state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required')) then
    -- A delayed worker cancellation cannot overwrite the next replacement's receipt or capacity.
    update public.workflow_outbox set status = 'completed', lease_token = null, leased_by = null,
      lease_expires_at = null, last_error_code = null, updated_at = now() where id = v_outbox.id;
    return 'completed';
  end if;
  if v_job.worker_id is not null then v_state := 'official_match';
  elsif v_job.status = 'worker_candidate_pending' then v_state := 'candidate_ready';
  elsif v_job.status <> 'broadcasting' then v_state := 'stopped'; end if;
  v_outcome := case when v_state <> 'recovery_required' then 'completed'
    when v_outbox.attempt_count >= 8 or p_error_code = 'LEGACY_MATCHING_REQUIRES_REVIEW' then 'dead_letter'
    else 'retry_scheduled' end;
  update public.matching_operations set state = v_state, updated_at = now() where id = v_matching.id;
  update public.confirmation_operations set state = v_state, updated_at = now(),
    last_error_code = case when v_state = 'recovery_required' then p_error_code else null end,
    retry_after_ms = case when v_outcome = 'retry_scheduled' then least(30000, power(2, v_outbox.attempt_count)::integer * 1000) else null end
    where id = v_matching.confirmation_operation_id;
  if v_state in ('no_reachable_worker', 'stopped') then
    update public.matching_capacity_reservations set status = 'released', released_at = now(), updated_at = now()
      where job_id = v_job.id and status in ('held', 'offered');
  end if;
  update public.workflow_outbox set status = case when v_outcome = 'completed' then 'completed' else 'failed' end,
    lease_token = null, leased_by = null, lease_expires_at = null,
    next_attempt_at = now() + make_interval(secs => least(300, power(2, v_outbox.attempt_count)::integer)),
    dead_lettered_at = case when v_outcome = 'dead_letter' then now() else null end,
    last_error_code = case when v_state = 'recovery_required' then p_error_code else null end, updated_at = now()
    where id = v_outbox.id;
  return v_outcome;
end;
$func$;

create or replace function private.require_live_replacement_capacity(p_job_id uuid, p_worker_id uuid, p_broadcast_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_matching public.matching_operations%rowtype;
begin
  select job.* into strict v_job from public.jobs as job where job.id = p_job_id for update;
  select matching.* into v_matching from public.matching_operations as matching
    join public.workflow_outbox as outbox on outbox.replacement_matching_operation_id = matching.id
    where matching.job_id = p_job_id and matching.state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required');
  if not found then return; end if;
  perform worker.id from public.worker_profiles as worker where worker.id = p_worker_id for update;
  if v_matching.confirmation_operation_id is null or not exists (
    select 1 from private.eligible_matching_worker_ids(v_job.service_type,
      public.normalize_hcmc_district_code(v_job.address_district), v_job.quote_mode,
      v_job.diagnosis_scope, v_job.intake_scope_snapshot, v_job.synthetic_cohort_id,
      clock_timestamp(), v_job.id, v_matching.confirmation_operation_id) as eligible
      where eligible.worker_id = p_worker_id
  ) or not exists (
    select 1 from public.matching_recipient_deliveries as delivery
    where delivery.operation_id = v_matching.id and delivery.worker_id = p_worker_id
      and delivery.job_id = v_job.id and delivery.expires_at > clock_timestamp()
      and delivery.status in ('queued', 'delivered', 'seen', 'accepted')
      and (p_broadcast_id is null or delivery.broadcast_id = p_broadcast_id)
      and delivery.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
  ) then raise exception using errcode = '55000', message = 'MATCHING_REPLACEMENT_CAPACITY_UNAVAILABLE'; end if;
  perform capacity.id from public.matching_capacity_reservations as capacity
    where capacity.operation_id = v_matching.confirmation_operation_id and capacity.job_id = v_job.id
      and capacity.worker_id = p_worker_id and capacity.status in ('held', 'offered')
      and capacity.expires_at > clock_timestamp()
      and capacity.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id for update;
  if not found then raise exception using errcode = '55000', message = 'MATCHING_REPLACEMENT_CAPACITY_UNAVAILABLE'; end if;
end;
$func$;

create or replace function private.guard_replacement_candidate_capacity()
returns trigger language plpgsql security definer set search_path = '' as $func$
begin
  perform private.require_live_replacement_capacity(new.job_id, new.worker_id, new.broadcast_id);
  return new;
end;
$func$;

create or replace function private.guard_replacement_assignment_capacity()
returns trigger language plpgsql security definer set search_path = '' as $func$
begin
  perform private.require_live_replacement_capacity(new.id, new.worker_id);
  return new;
end;
$func$;

create or replace trigger job_candidates_replacement_capacity_guard
  before insert on public.job_worker_candidates for each row when (new.status = 'proposed')
  execute function private.guard_replacement_candidate_capacity();
create or replace trigger jobs_replacement_capacity_guard
  before update of worker_id on public.jobs for each row
  when (old.worker_id is distinct from new.worker_id and new.worker_id is not null)
  execute function private.guard_replacement_assignment_capacity();

create or replace function private.kick_confirmation_matching_dispatcher()
returns trigger language plpgsql security definer set search_path = '' as $func$
declare
  v_project_url text;
  v_maintainer_secret text;
begin
  if not (new.event_type = 'matching_requested' or (new.event_type = 'matching_reconcile' and new.worker_cancellation_id is not null))
    or to_regclass('vault.decrypted_secrets') is null then return new; end if;
  select max(secret.decrypted_secret) filter (where secret.name = 'project_url'),
    max(secret.decrypted_secret) filter (where secret.name = 'kael_matching_maintainer_secret')
    into v_project_url, v_maintainer_secret from vault.decrypted_secrets as secret;
  if nullif(btrim(v_project_url), '') is null or nullif(btrim(v_maintainer_secret), '') is null then return new; end if;
  perform net.http_post(url := rtrim(v_project_url, '/') || '/functions/v1/kael-matching-maintainer',
    headers := jsonb_build_object('content-type', 'application/json', 'x-kael-matching-maintainer-secret', v_maintainer_secret),
    body := jsonb_build_object('source', 'confirmation_outbox'));
  return new;
exception when others then
  -- The outbox still commits when the fast wake-up fails; the existing cron reclaims it.
  return new;
end;
$func$;

create or replace trigger workflow_outbox_kick_confirmation_dispatcher
  after insert on public.workflow_outbox for each row
  when (new.event_type = 'matching_requested' or (new.event_type = 'matching_reconcile' and new.worker_cancellation_id is not null))
  execute function private.kick_confirmation_matching_dispatcher();

create or replace function public.get_confirmation_matching_outbox_health()
returns table(queued_count bigint, processing_count bigint, retry_count bigint, dead_letter_count bigint, oldest_ready_age_seconds integer)
language sql security definer set search_path = '' stable as $func$
  select count(*) filter (where outbox.status = 'queued' and outbox.dead_lettered_at is null),
    count(*) filter (where outbox.status = 'processing' and outbox.dead_lettered_at is null),
    count(*) filter (where outbox.status = 'failed' and outbox.dead_lettered_at is null),
    count(*) filter (where outbox.dead_lettered_at is not null),
    coalesce(max(extract(epoch from now() - outbox.next_attempt_at)) filter (
      where outbox.dead_lettered_at is null and outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= now()), 0)::integer
  from public.workflow_outbox as outbox where outbox.event_type = 'matching_requested'
    or (outbox.event_type = 'matching_reconcile' and outbox.worker_cancellation_id is not null);
$func$;

revoke execute on function private.enqueue_worker_cancellation_replacement(uuid),
  private.guard_replacement_outbox_identity(),
  private.queue_approved_worker_cancellation(),
  private.require_live_replacement_capacity(uuid,uuid,uuid),
  private.guard_replacement_candidate_capacity(),
  private.guard_replacement_assignment_capacity(),
  public.recover_worker_cancellation_replacement(uuid,uuid),
  public.claim_worker_replacement_outbox_batch(text,integer,integer),
  public.activate_worker_replacement_outbox_claim(uuid,uuid),
  public.settle_worker_replacement_outbox_claim(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.recover_worker_cancellation_replacement(uuid,uuid),
  public.claim_worker_replacement_outbox_batch(text,integer,integer),
  public.activate_worker_replacement_outbox_claim(uuid,uuid),
  public.settle_worker_replacement_outbox_claim(uuid,uuid,text,text) to service_role;

commit;
