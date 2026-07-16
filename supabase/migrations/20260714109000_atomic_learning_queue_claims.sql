-- Serialize Kael learning-queue workers with a recoverable service-only lease.

begin;

alter table public.kael_learning_queue
  add column if not exists claim_id uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists finalized_claim_id uuid;

alter table public.kael_learning_queue
  drop constraint if exists kael_learning_queue_queue_state_check;
alter table public.kael_learning_queue
  add constraint kael_learning_queue_queue_state_check
  check (queue_state in (
    'pending',
    'processing',
    'batched',
    'processed',
    'manual_review',
    'rejected',
    'failed',
    'realtime_fallback'
  ));

alter table public.kael_learning_queue
  drop constraint if exists kael_learning_queue_claim_state_check;
alter table public.kael_learning_queue
  add constraint kael_learning_queue_claim_state_check
  check (
    (queue_state = 'processing' and claim_id is not null and claimed_at is not null)
    or (queue_state <> 'processing' and claim_id is null and claimed_at is null)
  );

create index if not exists kael_learning_queue_claim_due_idx
  on public.kael_learning_queue (queue_state, claimed_at, run_after, created_at);

create or replace function public.claim_kael_learning_queue_atomic(
  p_claim_id uuid,
  p_limit integer default 50,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns setof public.kael_learning_queue
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_claim_id is null or p_now is null or p_limit not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'INVALID_LEARNING_QUEUE_CLAIM';
  end if;

  return query
  with claimable as materialized (
    select queue_row.id
    from public.kael_learning_queue as queue_row
    where (
      queue_row.queue_state = 'pending'
      and queue_row.run_after <= p_now
    ) or (
      queue_row.queue_state = 'processing'
      and queue_row.claimed_at < p_now - interval '15 minutes'
    )
    order by queue_row.created_at, queue_row.id
    for update skip locked
    limit p_limit
  )
  update public.kael_learning_queue as queue_row
    set queue_state = 'processing',
        claim_id = p_claim_id,
        claimed_at = p_now,
        finalized_claim_id = null,
        attempts = queue_row.attempts + 1,
        error_code = case
          when queue_row.queue_state = 'processing' then 'STALE_LEASE_RECLAIMED'
          else queue_row.error_code
        end,
        updated_at = p_now
    from claimable
    where queue_row.id = claimable.id
    returning queue_row.*;
end;
$function$;

create or replace function public.complete_kael_learning_queue_realtime_atomic(
  p_claim_id uuid,
  p_queue_ids uuid[],
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns table (
  completed_queue_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expected integer;
  v_seen integer := 0;
  v_lifecycle_exists boolean;
  v_queue public.kael_learning_queue%rowtype;
begin
  v_expected := pg_catalog.cardinality(p_queue_ids);
  if p_claim_id is null
    or p_now is null
    or v_expected is null
    or v_expected not between 1 and 100
    or exists (
      select 1
      from pg_catalog.unnest(p_queue_ids) as requested(queue_id)
      where requested.queue_id is null
      group by requested.queue_id
      having pg_catalog.count(*) > 0
    )
    or exists (
      select 1
      from pg_catalog.unnest(p_queue_ids) as requested(queue_id)
      group by requested.queue_id
      having pg_catalog.count(*) > 1
    )
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_LEARNING_QUEUE_COMPLETION';
  end if;

  for v_queue in
    select queue_row.*
    from public.kael_learning_queue as queue_row
    where queue_row.id = any(p_queue_ids)
    order by queue_row.id
    for update
  loop
    v_seen := v_seen + 1;

    if v_queue.queue_state = 'realtime_fallback'
      and v_queue.claim_id is null
      and v_queue.claimed_at is null
      and v_queue.finalized_claim_id = p_claim_id
    then
      if not exists (
        select 1
        from public.kael_rule_lifecycle_log as lifecycle
        where lifecycle.skill_id = v_queue.skill_id
          and lifecycle.job_id is not distinct from v_queue.job_id
          and lifecycle.actor_id is not distinct from v_queue.actor_id
          and lifecycle.actor_role is not distinct from v_queue.actor_role
          and lifecycle.transition_reason = 'realtime_fallback'
          and lifecycle.safe_metadata->>'q4_queue_id' = v_queue.id::text
          and lifecycle.safe_metadata->>'q4_reason' = 'realtime_fallback'
      ) then
        raise exception using
          errcode = '23514',
          message = 'LEARNING_QUEUE_COMPLETION_CORRUPT';
      end if;

      completed_queue_id := v_queue.id;
      replayed := true;
      return next;
      continue;
    end if;

    if v_queue.queue_state <> 'processing'
      or v_queue.claim_id is distinct from p_claim_id
      or v_queue.claimed_at is null
    then
      raise exception using
        errcode = '40001',
        message = 'LEARNING_QUEUE_CLAIM_STALE';
    end if;

    select exists (
      select 1
      from public.kael_rule_lifecycle_log as lifecycle
      where lifecycle.skill_id = v_queue.skill_id
        and lifecycle.job_id is not distinct from v_queue.job_id
        and lifecycle.actor_id is not distinct from v_queue.actor_id
        and lifecycle.actor_role is not distinct from v_queue.actor_role
        and lifecycle.transition_reason = 'realtime_fallback'
        and lifecycle.safe_metadata->>'q4_queue_id' = v_queue.id::text
        and lifecycle.safe_metadata->>'q4_reason' = 'realtime_fallback'
    ) into v_lifecycle_exists;

    if not v_lifecycle_exists then
      insert into public.kael_rule_lifecycle_log (
        skill_id,
        job_id,
        rule_id,
        candidate_id,
        previous_state,
        next_state,
        transition_reason,
        actor_id,
        actor_role,
        safe_metadata,
        created_at
      ) values (
        v_queue.skill_id,
        v_queue.job_id,
        null,
        null,
        null,
        case
          when v_queue.candidate_payload @> '{"requires_manual_review":true}'::jsonb
            then 'manual_review'
          else 'candidate'
        end,
        'realtime_fallback',
        v_queue.actor_id,
        v_queue.actor_role,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'event_type', v_queue.event_type,
          'target', v_queue.candidate_payload->'target',
          'prompt_version', v_queue.candidate_payload->'prompt_version',
          'requires_manual_review', v_queue.candidate_payload->'requires_manual_review',
          'payload', v_queue.candidate_payload->'payload',
          'q4_queue_id', v_queue.id,
          'q4_reason', 'realtime_fallback'
        )),
        p_now
      );
    end if;

    update public.kael_learning_queue as queue_row
      set queue_state = 'realtime_fallback',
          claim_id = null,
          claimed_at = null,
          finalized_claim_id = p_claim_id,
          error_code = null,
          processed_at = p_now,
          updated_at = p_now
      where queue_row.id = v_queue.id
        and queue_row.queue_state = 'processing'
        and queue_row.claim_id = p_claim_id;
    if not found then
      raise exception using
        errcode = '40001',
        message = 'LEARNING_QUEUE_CLAIM_STALE';
    end if;

    completed_queue_id := v_queue.id;
    replayed := false;
    return next;
  end loop;

  if v_seen <> v_expected then
    raise exception using
      errcode = 'P0002',
      message = 'LEARNING_QUEUE_ROW_NOT_FOUND';
  end if;
end;
$function$;

revoke execute on function public.claim_kael_learning_queue_atomic(
  uuid, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_kael_learning_queue_atomic(
  uuid, integer, timestamptz
) to service_role;

revoke execute on function public.complete_kael_learning_queue_realtime_atomic(
  uuid, uuid[], timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_kael_learning_queue_realtime_atomic(
  uuid, uuid[], timestamptz
) to service_role;

do $$
begin
  if pg_catalog.to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'kael-learning-queue-stale-fallback';
  end if;
end;
$$;

select cron.schedule(
  'kael-learning-queue-stale-fallback',
  '17 * * * *',
  $$update public.kael_learning_queue
    set queue_state = 'failed',
        claim_id = null,
        claimed_at = null,
        error_code = coalesce(error_code, 'STALE_QUEUE_OVER_48H'),
        updated_at = now()
    where (
      queue_state = 'pending'
      and created_at < now() - interval '48 hours'
    ) or (
      queue_state = 'processing'
      and claimed_at < now() - interval '48 hours'
    );$$
);

comment on column public.kael_learning_queue.claim_id is
  'Service-only worker token that owns the current learning-queue processing lease.';
comment on column public.kael_learning_queue.finalized_claim_id is
  'Last successful claim token retained for exact idempotent completion replay.';
comment on function public.claim_kael_learning_queue_atomic(
  uuid, integer, timestamptz
) is
  'Claims due or stale Kael learning rows with FOR UPDATE SKIP LOCKED and a 15-minute lease.';
comment on function public.complete_kael_learning_queue_realtime_atomic(
  uuid, uuid[], timestamptz
) is
  'Atomically records idempotent realtime lifecycle effects and finalizes only rows owned by the exact claim.';

commit;
