begin;

create or replace function private.reconcile_exhausted_confirmation_outbox(p_limit integer)
returns integer language plpgsql security definer set search_path = '' as $func$
declare
  v_target record;
  v_outbox public.workflow_outbox%rowtype;
  v_token uuid;
  v_outcome text;
  v_reconciled integer := 0;
  v_now timestamptz;
begin
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode = '22023', message = 'CONFIRMATION_OUTBOX_RECONCILE_INVALID';
  end if;
  for v_target in
    select outbox.id from public.jobs as job
      join public.confirmation_operations as operation on operation.job_id = job.id
      join public.workflow_outbox as outbox on outbox.operation_id = operation.id
    where outbox.event_type = 'matching_requested' and outbox.attempt_count >= 8
      and outbox.dead_lettered_at is null and (
        (outbox.status = 'processing' and coalesce(outbox.lease_expires_at, '-infinity'::timestamptz) <= clock_timestamp())
        or (outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= clock_timestamp()))
    order by job.id limit p_limit for update of job skip locked
  loop
    select outbox.* into v_outbox from public.workflow_outbox as outbox
      where outbox.id = v_target.id for update skip locked;
    v_now := clock_timestamp();
    if v_outbox.id is null or v_outbox.attempt_count < 8 or v_outbox.dead_lettered_at is not null
      or not (
        (v_outbox.status = 'processing' and coalesce(v_outbox.lease_expires_at, '-infinity'::timestamptz) <= v_now)
        or (v_outbox.status in ('queued', 'failed') and v_outbox.next_attempt_at <= v_now))
    then continue; end if;

    -- Fence the crashed dispatcher and settle under the same transaction; matching is never executed again.
    v_token := gen_random_uuid();
    update public.workflow_outbox set status = 'processing', lease_token = v_token,
      leased_by = 'matching-exhausted-lease-reconciler', lease_expires_at = v_now + interval '15 seconds'
      where id = v_outbox.id;
    v_outcome := public.settle_confirmation_matching_outbox_claim(
      v_outbox.id, v_token, v_outbox.operation_id, 'recovery_required', 'MATCHING_RETRY_EXHAUSTED');
    if v_outcome not in ('completed', 'dead_letter') then
      raise exception using errcode = '55000', message = 'CONFIRMATION_OUTBOX_RECONCILE_LOST';
    end if;
    v_reconciled := v_reconciled + 1;
  end loop;
  return v_reconciled;
end;
$func$;

revoke execute on function private.reconcile_exhausted_confirmation_outbox(integer) from public, anon, authenticated;
grant execute on function private.reconcile_exhausted_confirmation_outbox(integer) to service_role;

CREATE OR REPLACE FUNCTION public.claim_confirmation_matching_outbox_batch(p_dispatcher_id text, p_limit integer DEFAULT 20, p_lease_seconds integer DEFAULT 45)
 RETURNS TABLE(outbox_id uuid, lease_token uuid, operation_id uuid, customer_id uuid, session_id uuid, job_id uuid, diagnosis_scope jsonb, preferred_worker_id uuid, attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_dispatcher_id is null or length(p_dispatcher_id) not between 8 and 160
    or p_dispatcher_id !~ '^[A-Za-z0-9_.:-]+$'
    or p_limit is null or p_limit not between 1 and 50
    or p_lease_seconds is null or p_lease_seconds not between 15 and 120
  then
    raise exception using errcode = '22023', message = 'CONFIRMATION_OUTBOX_CLAIM_INVALID';
  end if;

  perform private.reconcile_exhausted_confirmation_outbox(p_limit);

  return query
  with claimable as (
    select outbox.id
    from public.workflow_outbox outbox
    where outbox.event_type = 'matching_requested'
      and outbox.dead_lettered_at is null
      and outbox.attempt_count < 8
      and (
        (outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= clock_timestamp())
        or (
          outbox.status = 'processing' and
          coalesce(outbox.lease_expires_at, '-infinity'::timestamptz) <= clock_timestamp()
        )
      )
    order by outbox.next_attempt_at, outbox.created_at, outbox.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.workflow_outbox outbox
    set status = 'processing',
      attempt_count = outbox.attempt_count + 1,
      lease_token = gen_random_uuid(),
      leased_by = p_dispatcher_id,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      last_error_code = null,
      updated_at = clock_timestamp()
    from claimable
    where outbox.id = claimable.id
    returning outbox.id, outbox.lease_token, outbox.operation_id, outbox.attempt_count
  )
  select claimed.id, claimed.lease_token, operation.id, operation.customer_id,
    operation.session_id, operation.job_id, session.diagnosis_scope,
    session.preferred_worker_id, claimed.attempt_count
  from claimed
  join public.confirmation_operations operation on operation.id = claimed.operation_id
  join public.kael_chat_sessions session on session.id = operation.session_id
  where operation.job_id is not null;
end;
$function$;

revoke execute on function public.claim_confirmation_matching_outbox_batch(text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.claim_confirmation_matching_outbox_batch(text,integer,integer)
  to service_role;

commit;
