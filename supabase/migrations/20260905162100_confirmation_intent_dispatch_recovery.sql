begin;

create or replace function public.claim_confirmation_matching_outbox_batch(
  p_dispatcher_id text,
  p_limit integer default 20,
  p_lease_seconds integer default 45
) returns table(
  outbox_id uuid,
  lease_token uuid,
  operation_id uuid,
  customer_id uuid,
  session_id uuid,
  job_id uuid,
  diagnosis_scope jsonb,
  preferred_worker_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $func$
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
      and not exists (
        select 1 from public.confirmation_operations operation
        join public.job_matching_preferences preference on preference.job_id=operation.job_id
        where operation.id=outbox.operation_id and preference.strategy='pending'
      )
      and (
        (outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= pg_catalog.clock_timestamp())
        or (
          outbox.status = 'processing' and
          coalesce(outbox.lease_expires_at, '-infinity'::timestamptz) <= pg_catalog.clock_timestamp()
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
      lease_expires_at = pg_catalog.clock_timestamp() + make_interval(secs => p_lease_seconds),
      last_error_code = null,
      updated_at = pg_catalog.clock_timestamp()
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
$func$;

commit;
