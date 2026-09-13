begin;

create or replace function public.settle_confirmation_matching_outbox_claim(
  p_outbox_id uuid, p_lease_token uuid, p_operation_id uuid,
  p_state text, p_error_code text default null
) returns text language plpgsql security definer set search_path = '' as $func$
declare
  v_outbox public.workflow_outbox%rowtype;
  v_job public.jobs%rowtype;
  v_matching public.matching_operations%rowtype;
  v_state text := p_state;
  v_error text := p_error_code;
  v_delay_seconds integer;
  v_outcome text;
  v_now timestamptz;
  v_obsolete boolean;
begin
  if p_outbox_id is null or p_lease_token is null or p_operation_id is null
    or p_state is null or p_state not in ('broadcasting', 'no_reachable_worker', 'recovery_required')
    or (p_state = 'recovery_required' and (
      p_error_code is null or p_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$'))
    or (p_state <> 'recovery_required' and p_error_code is not null) then
    raise exception using errcode = '22023', message = 'CONFIRMATION_OUTBOX_SETTLE_INVALID';
  end if;

  -- Customer decisions lock the job first; the dispatcher must use the same order.
  select job.* into v_job from public.jobs as job
    join public.confirmation_operations as operation on operation.job_id = job.id
    where operation.id = p_operation_id for update of job;
  if not found then return 'lease_lost'; end if;
  select outbox.* into v_outbox from public.workflow_outbox as outbox
    where outbox.id = p_outbox_id and outbox.operation_id = p_operation_id
      and outbox.event_type = 'matching_requested' for update;
  v_now := clock_timestamp();
  if v_outbox.id is null or v_outbox.status <> 'processing'
    or v_outbox.lease_token is distinct from p_lease_token
    or v_outbox.lease_expires_at is null or v_outbox.lease_expires_at <= v_now then
    return 'lease_lost';
  end if;

  select matching.* into v_matching from public.matching_operations as matching
    where matching.confirmation_operation_id = p_operation_id
      and not exists (select 1 from public.workflow_outbox as replacement
        where replacement.replacement_matching_operation_id = matching.id)
    order by matching.created_at, matching.id limit 1;
  v_obsolete := v_matching.state = 'stopped' or exists (
    select 1 from public.matching_operations as successor
    where successor.confirmation_operation_id = p_operation_id
      and successor.id is distinct from v_matching.id
  );
  if v_obsolete then
    -- Retiring an old delivery receipt cannot change a replacement operation.
    update public.workflow_outbox set status = 'completed', lease_token = null,
      leased_by = null, lease_expires_at = null, last_error_code = null, updated_at = v_now
      where id = v_outbox.id;
    return 'completed';
  end if;

  if v_job.status = 'cancelled' then v_state := 'stopped';
  elsif v_job.worker_id is not null then v_state := 'official_match';
  elsif v_job.status = 'worker_candidate_pending' then v_state := 'candidate_ready';
  elsif v_job.status <> 'broadcasting' or v_matching.id is null then
    v_state := 'recovery_required';
    v_error := 'MATCHING_STATE_REQUIRES_REVIEW';
  end if;
  if v_state <> 'recovery_required' then v_error := null; end if;
  v_delay_seconds := least(300, power(2, least(v_outbox.attempt_count, 8))::integer);
  v_outcome := case when v_state <> 'recovery_required' then 'completed'
    when v_outbox.attempt_count >= 8 or v_error = 'MATCHING_STATE_REQUIRES_REVIEW' then 'dead_letter'
    else 'retry_scheduled' end;

  update public.confirmation_operations set state = v_state,
    last_error_code = v_error,
    retry_after_ms = case when v_outcome = 'retry_scheduled'
      then least(30000, v_delay_seconds * 1000) else null end,
    updated_at = v_now where id = p_operation_id;
  update public.matching_operations set state = v_state, updated_at = v_now
    where id = v_matching.id;
  update public.workflow_outbox set
    status = case when v_outcome = 'completed' then 'completed' else 'failed' end,
    lease_token = null, leased_by = null, lease_expires_at = null,
    last_error_code = v_error,
    next_attempt_at = case when v_outcome = 'retry_scheduled'
      then v_now + make_interval(secs => v_delay_seconds) else next_attempt_at end,
    dead_lettered_at = case when v_outcome = 'dead_letter' then v_now else null end,
    updated_at = v_now where id = v_outbox.id;
  return v_outcome;
end;
$func$;

revoke execute on function public.settle_confirmation_matching_outbox_claim(uuid,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.settle_confirmation_matching_outbox_claim(uuid,uuid,uuid,text,text)
  to service_role;

commit;
