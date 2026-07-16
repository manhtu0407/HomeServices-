-- Batch-result pollers need a durable lease because provider reads and learning
-- promotion happen outside the database transaction that selects due work.

create table private.kael_ai_batch_result_claims (
  batch_id uuid primary key
    references public.kael_ai_batches(id) on delete cascade,
  claim_token uuid not null,
  claimed_at timestamptz not null
);

create index kael_ai_batch_result_claims_claimed_at_idx
  on private.kael_ai_batch_result_claims (claimed_at, batch_id);

revoke all on table private.kael_ai_batch_result_claims from public;
revoke all on table private.kael_ai_batch_result_claims from anon;
revoke all on table private.kael_ai_batch_result_claims from authenticated;
revoke all on table private.kael_ai_batch_result_claims from service_role;

create or replace function public.claim_kael_ai_batch_results(
  p_limit integer,
  p_now timestamptz,
  p_force_poll boolean,
  p_lease_seconds integer,
  p_claim_token uuid
) returns table (
  id uuid,
  provider_batch_id text,
  status text,
  next_poll_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if p_limit is null
     or p_limit < 1
     or p_limit > 50
     or p_now is null
     or p_force_poll is null
     or p_lease_seconds is null
     or p_lease_seconds < 60
     or p_lease_seconds > 3600
     or p_claim_token is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_BATCH_CLAIM_INPUT';
  end if;

  return query
  with eligible as (
    select batch.id
    from public.kael_ai_batches as batch
    left join private.kael_ai_batch_result_claims as claim
      on claim.batch_id = batch.id
    where batch.status in ('submitted', 'in_progress', 'ended')
      and batch.provider_batch_id is not null
      and (p_force_poll or batch.next_poll_at <= p_now)
      and (
        claim.batch_id is null
        or claim.claimed_at <= p_now - make_interval(secs => p_lease_seconds)
      )
    order by batch.created_at asc, batch.id asc
    for update of batch skip locked
    limit p_limit
  ), claimed as (
    insert into private.kael_ai_batch_result_claims as existing (
      batch_id,
      claim_token,
      claimed_at
    )
    select eligible.id, p_claim_token, p_now
    from eligible
    on conflict (batch_id) do update
      set claim_token = excluded.claim_token,
          claimed_at = excluded.claimed_at
      where existing.claimed_at <= p_now - make_interval(secs => p_lease_seconds)
    returning batch_id
  )
  select
    batch.id,
    batch.provider_batch_id,
    batch.status,
    batch.next_poll_at,
    batch.created_at
  from claimed
  join public.kael_ai_batches as batch on batch.id = claimed.batch_id
  order by batch.created_at asc, batch.id asc;
end;
$func$;

create or replace function public.release_kael_ai_batch_results_claims(
  p_claim_token uuid,
  p_retry_at timestamptz,
  p_error_code text
) returns void
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if p_claim_token is null
     or p_retry_at is null
     or nullif(trim(coalesce(p_error_code, '')), '') is null
     or char_length(p_error_code) > 80 then
    raise exception using
      errcode = '22023',
      message = 'INVALID_BATCH_CLAIM_RELEASE';
  end if;

  update public.kael_ai_batches as batch
  set next_poll_at = p_retry_at,
      error_code = p_error_code
  from private.kael_ai_batch_result_claims as claim
  where claim.batch_id = batch.id
    and claim.claim_token = p_claim_token
    and batch.status in ('submitted', 'in_progress', 'ended');

  delete from private.kael_ai_batch_result_claims as claim
  where claim.claim_token = p_claim_token;
end;
$func$;

create or replace function public.renew_kael_ai_batch_results_claim(
  p_batch_id uuid,
  p_claim_token uuid,
  p_claimed_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if p_batch_id is null or p_claim_token is null or p_claimed_at is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_BATCH_CLAIM_RENEWAL';
  end if;

  update private.kael_ai_batch_result_claims as claim
  set claimed_at = p_claimed_at
  where claim.batch_id = p_batch_id
    and claim.claim_token = p_claim_token
    and exists (
      select 1
      from public.kael_ai_batches as batch
      where batch.id = claim.batch_id
        and batch.status = 'ended'
    );

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'BATCH_CLAIM_LOST';
  end if;
end;
$func$;

create or replace function public.record_kael_ai_batch_poll(
  p_batch_id uuid,
  p_claim_token uuid,
  p_status text,
  p_processing_count integer,
  p_succeeded_count integer,
  p_errored_count integer,
  p_canceled_count integer,
  p_expired_count integer,
  p_results_url text,
  p_ended_at timestamptz,
  p_expires_at timestamptz,
  p_next_poll_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if p_batch_id is null
     or p_claim_token is null
     or p_status is null
     or p_status not in ('in_progress', 'ended')
     or p_processing_count is null or p_processing_count < 0
     or p_succeeded_count is null or p_succeeded_count < 0
     or p_errored_count is null or p_errored_count < 0
     or p_canceled_count is null or p_canceled_count < 0
     or p_expired_count is null or p_expired_count < 0
     or p_next_poll_at is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_BATCH_POLL_RESULT';
  end if;

  perform 1
  from public.kael_ai_batches as batch
  where batch.id = p_batch_id
    and batch.status in ('submitted', 'in_progress', 'ended')
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'BATCH_NOT_READY';
  end if;

  perform 1
  from private.kael_ai_batch_result_claims as claim
  where claim.batch_id = p_batch_id
    and claim.claim_token = p_claim_token
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'BATCH_CLAIM_LOST';
  end if;

  update private.kael_ai_batch_result_claims as claim
  set claimed_at = clock_timestamp()
  where claim.batch_id = p_batch_id
    and claim.claim_token = p_claim_token;

  update public.kael_ai_batches as batch
  set status = p_status,
      processing_count = p_processing_count,
      succeeded_count = p_succeeded_count,
      errored_count = p_errored_count,
      canceled_count = p_canceled_count,
      expired_count = p_expired_count,
      results_url = p_results_url,
      ended_at = p_ended_at,
      expires_at = p_expires_at,
      next_poll_at = p_next_poll_at,
      error_code = null
  where batch.id = p_batch_id;
end;
$func$;

create or replace function public.commit_kael_ai_batch_item_result(
  p_batch_id uuid,
  p_item_id uuid,
  p_queue_id uuid,
  p_claim_token uuid,
  p_item_status text,
  p_response_payload jsonb,
  p_error_payload jsonb,
  p_queue_state text,
  p_queue_error_code text,
  p_processed_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_item public.kael_ai_batch_items%rowtype;
  v_queue public.kael_learning_queue%rowtype;
begin
  if p_batch_id is null
     or p_item_id is null
     or p_claim_token is null
     or p_item_status is null
     or p_item_status not in ('succeeded', 'errored', 'canceled', 'expired')
     or p_response_payload is null
     or jsonb_typeof(p_response_payload) <> 'object'
     or p_error_payload is null
     or jsonb_typeof(p_error_payload) <> 'object'
     or p_processed_at is null
     or char_length(coalesce(p_queue_error_code, '')) > 100
     or (
       p_queue_id is null
       and (p_queue_state is not null or p_queue_error_code is not null)
     )
     or (
       p_queue_id is not null
       and (
         p_queue_state is null
         or p_queue_state not in ('processed', 'manual_review', 'rejected', 'failed')
       )
     ) then
    raise exception using
      errcode = '22023',
      message = 'INVALID_BATCH_ITEM_RESULT';
  end if;

  perform 1
  from private.kael_ai_batch_result_claims as claim
  where claim.batch_id = p_batch_id
    and claim.claim_token = p_claim_token
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'BATCH_CLAIM_LOST';
  end if;

  if not exists (
    select 1
    from public.kael_ai_batches as batch
    where batch.id = p_batch_id
      and batch.status = 'ended'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'BATCH_NOT_READY';
  end if;

  select item.*
  into v_item
  from public.kael_ai_batch_items as item
  where item.id = p_item_id
    and item.batch_id = p_batch_id
  for update of item;

  if not found or v_item.queue_id is distinct from p_queue_id then
    raise exception using
      errcode = 'P0001',
      message = 'BATCH_ITEM_MISMATCH';
  end if;

  if p_queue_id is not null then
    select queue.*
    into v_queue
    from public.kael_learning_queue as queue
    where queue.id = p_queue_id
      and queue.batch_id = p_batch_id
    for update of queue;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'LEARNING_QUEUE_MISMATCH';
    end if;
  end if;

  if v_item.status <> 'pending' then
    if v_item.status = p_item_status
       and v_item.response_payload is not distinct from p_response_payload
       and v_item.error_payload is not distinct from p_error_payload
       and v_item.processed_at is not distinct from p_processed_at
       and (
         p_queue_id is null
         or (
           v_queue.queue_state = p_queue_state
           and v_queue.error_code is not distinct from p_queue_error_code
           and v_queue.processed_at is not distinct from p_processed_at
         )
       ) then
      return;
    end if;
    raise exception using
      errcode = 'P0001',
      message = 'BATCH_ITEM_ALREADY_COMMITTED';
  end if;

  update public.kael_ai_batch_items as item
  set status = p_item_status,
      response_payload = p_response_payload,
      error_payload = p_error_payload,
      processed_at = p_processed_at
  where item.id = p_item_id;

  if p_queue_id is not null then
    update public.kael_learning_queue as queue
    set queue_state = p_queue_state,
        error_code = p_queue_error_code,
        processed_at = p_processed_at
    where queue.id = p_queue_id;
  end if;
end;
$func$;

create or replace function public.complete_kael_ai_batch_results_claim(
  p_batch_id uuid,
  p_claim_token uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_request_count integer;
  v_item_count integer;
begin
  if p_batch_id is null or p_claim_token is null then
    raise exception using
      errcode = '22023',
      message = 'INVALID_BATCH_CLAIM_COMPLETION';
  end if;

  select batch.request_count
  into v_request_count
  from public.kael_ai_batches as batch
  where batch.id = p_batch_id
    and batch.status = 'ended'
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'BATCH_NOT_READY';
  end if;

  perform 1
  from private.kael_ai_batch_result_claims as claim
  where claim.batch_id = p_batch_id
    and claim.claim_token = p_claim_token
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'BATCH_CLAIM_LOST';
  end if;

  select count(*)::integer
  into v_item_count
  from public.kael_ai_batch_items as item
  where item.batch_id = p_batch_id;

  if v_item_count <> v_request_count
     or exists (
       select 1
       from public.kael_ai_batch_items as item
       where item.batch_id = p_batch_id
         and item.status = 'pending'
     )
     or exists (
       select 1
       from public.kael_ai_batch_items as item
       join public.kael_learning_queue as queue on queue.id = item.queue_id
       where item.batch_id = p_batch_id
         and queue.queue_state not in (
           'processed', 'manual_review', 'rejected', 'failed', 'realtime_fallback'
         )
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'BATCH_ITEMS_INCOMPLETE';
  end if;

  update public.kael_ai_batches as batch
  set status = 'results_processed',
      next_poll_at = null,
      error_code = null
  where batch.id = p_batch_id;

  delete from private.kael_ai_batch_result_claims as claim
  where claim.batch_id = p_batch_id
    and claim.claim_token = p_claim_token;
end;
$func$;

revoke execute on function public.claim_kael_ai_batch_results(
  integer, timestamptz, boolean, integer, uuid
) from public;
revoke execute on function public.claim_kael_ai_batch_results(
  integer, timestamptz, boolean, integer, uuid
) from anon;
revoke execute on function public.claim_kael_ai_batch_results(
  integer, timestamptz, boolean, integer, uuid
) from authenticated;
grant execute on function public.claim_kael_ai_batch_results(
  integer, timestamptz, boolean, integer, uuid
) to service_role;

revoke execute on function public.release_kael_ai_batch_results_claims(
  uuid, timestamptz, text
) from public;
revoke execute on function public.release_kael_ai_batch_results_claims(
  uuid, timestamptz, text
) from anon;
revoke execute on function public.release_kael_ai_batch_results_claims(
  uuid, timestamptz, text
) from authenticated;
grant execute on function public.release_kael_ai_batch_results_claims(
  uuid, timestamptz, text
) to service_role;

revoke execute on function public.renew_kael_ai_batch_results_claim(
  uuid, uuid, timestamptz
) from public;
revoke execute on function public.renew_kael_ai_batch_results_claim(
  uuid, uuid, timestamptz
) from anon;
revoke execute on function public.renew_kael_ai_batch_results_claim(
  uuid, uuid, timestamptz
) from authenticated;
grant execute on function public.renew_kael_ai_batch_results_claim(
  uuid, uuid, timestamptz
) to service_role;

revoke execute on function public.record_kael_ai_batch_poll(
  uuid, uuid, text, integer, integer, integer, integer, integer,
  text, timestamptz, timestamptz, timestamptz
) from public;
revoke execute on function public.record_kael_ai_batch_poll(
  uuid, uuid, text, integer, integer, integer, integer, integer,
  text, timestamptz, timestamptz, timestamptz
) from anon;
revoke execute on function public.record_kael_ai_batch_poll(
  uuid, uuid, text, integer, integer, integer, integer, integer,
  text, timestamptz, timestamptz, timestamptz
) from authenticated;
grant execute on function public.record_kael_ai_batch_poll(
  uuid, uuid, text, integer, integer, integer, integer, integer,
  text, timestamptz, timestamptz, timestamptz
) to service_role;

revoke execute on function public.commit_kael_ai_batch_item_result(
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, timestamptz
) from public;
revoke execute on function public.commit_kael_ai_batch_item_result(
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, timestamptz
) from anon;
revoke execute on function public.commit_kael_ai_batch_item_result(
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, timestamptz
) from authenticated;
grant execute on function public.commit_kael_ai_batch_item_result(
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, timestamptz
) to service_role;

revoke execute on function public.complete_kael_ai_batch_results_claim(
  uuid, uuid
) from public;
revoke execute on function public.complete_kael_ai_batch_results_claim(
  uuid, uuid
) from anon;
revoke execute on function public.complete_kael_ai_batch_results_claim(
  uuid, uuid
) from authenticated;
grant execute on function public.complete_kael_ai_batch_results_claim(
  uuid, uuid
) to service_role;

comment on table private.kael_ai_batch_result_claims is
  'Short-lived service-owned leases that serialize provider batch-result processing.';
comment on function public.claim_kael_ai_batch_results(
  integer, timestamptz, boolean, integer, uuid
) is 'Atomically claims due Kael provider batches with stale-lease recovery.';
comment on function public.record_kael_ai_batch_poll(
  uuid, uuid, text, integer, integer, integer, integer, integer,
  text, timestamptz, timestamptz, timestamptz
) is 'Persists provider poll state only while the caller owns the batch-result lease.';
comment on function public.commit_kael_ai_batch_item_result(
  uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, timestamptz
) is 'Atomically persists one owned provider result and its learning queue state.';
comment on function public.complete_kael_ai_batch_results_claim(uuid, uuid) is
  'Finalizes a fully persisted batch only for its current result-processing lease.';

-- Rollback: drop the six RPCs, the claim index, and the private claim table.
