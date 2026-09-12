create or replace function public.admin_review_worker_profile_snapshot_atomic(
  p_queue_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_reason text,
  p_expected_profile_updated_at timestamptz,
  p_application_id uuid
)
returns table(ok boolean, error_code text, queue_id uuid, worker_id uuid, decision text,
  verification_status public.worker_verification_status, decided_at timestamptz)
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_worker_id uuid;
  v_worker public.worker_profiles%rowtype;
  v_queue public.kael_admin_queue%rowtype;
  v_review public.admin_worker_application_reviews%rowtype;
  v_receipt jsonb;
  v_result record;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  -- An absent actor is a denial, not SQL NULL falling through a role comparison.
  if not exists (
    select 1 from public.profiles as actor
    where actor.id = p_admin_id and not exists (
      select 1 from public.synthetic_matching_cohort_members as member where member.profile_id = actor.id
    )
      and (actor.role = 'admin' or (actor.role = 'admin_operator' and exists (
        select 1 from public.admin_operator_accounts as operator
        where operator.user_id = actor.id and operator.status = 'active'
          and 'workers.review' = any(operator.capabilities)
      )))
  ) then
    return query select false, 'WORKERS_REVIEW_REQUIRED', p_queue_id, null::uuid,
      v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;
  if p_queue_id is null or p_application_id is null
    or p_expected_profile_updated_at is null
    or not pg_catalog.isfinite(p_expected_profile_updated_at)
    or v_decision not in ('approve', 'request_changes')
    or char_length(v_reason) > 1000
    or (v_decision = 'request_changes' and v_reason is null) then
    return query select false, 'INVALID_DECISION', p_queue_id, null::uuid,
      v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  select application.actor_id into v_worker_id
  from public.kael_admin_queue as application
  where application.id = p_application_id and application.synthetic_cohort_id is null
    and application.queue_type = 'worker_application_review'
    and application.status = 'resolved' and application.safe_metadata->>'decision' = 'approve';
  if not found then
    return query select false, 'APPLICATION_NOT_FOUND', p_queue_id, null::uuid,
      v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  -- Submission locks the Worker before its queue trigger; keep the same order.
  select worker.* into v_worker from public.worker_profiles as worker
  where worker.id = v_worker_id and worker.synthetic_cohort_id is null for update;
  if not found then
    return query select false, 'WORKER_NOT_FOUND', p_queue_id, v_worker_id,
      v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;
  select queue.* into v_queue from public.kael_admin_queue as queue
  where queue.id = p_queue_id and queue.actor_id = v_worker_id
    and queue.queue_type = 'worker_profile_verification' and queue.synthetic_cohort_id is null for update;
  if not found then
    return query select false, 'APPLICATION_NOT_FOUND', p_queue_id, null::uuid,
      v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  v_receipt := v_queue.safe_metadata->'profile_review_receipt';
  if v_receipt is not null then
    select review.* into v_review from public.admin_worker_application_reviews as review
    where review.queue_id = p_queue_id and review.review_stage = 'profile';
    if not found or v_review.decided_by is distinct from p_admin_id
      or v_review.decision is distinct from v_decision or v_review.reason is distinct from v_reason
      or (v_receipt->>'application_id')::uuid is distinct from p_application_id
      or (v_receipt->>'profile_updated_at')::timestamptz is distinct from p_expected_profile_updated_at then
      return query select false, 'IDEMPOTENCY_CONFLICT', p_queue_id, v_worker_id,
        v_decision, null::public.worker_verification_status, null::timestamptz;
      return;
    end if;
    -- A later correction round must not rewrite the outcome of this reviewed round.
    return query select true, null::text, p_queue_id, v_worker_id, v_decision,
      (v_receipt->>'verification_status')::public.worker_verification_status, v_review.decided_at;
    return;
  end if;
  if v_queue.status not in ('open', 'acknowledged') or v_queue.safe_metadata ? 'decision' then
    return query select false, 'ALREADY_REVIEWED', p_queue_id, v_worker_id,
      v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;
  if v_worker.updated_at is distinct from p_expected_profile_updated_at
    or v_worker.verification_status not in ('submitted', 'under_review')
    or v_worker.is_suspended is not false then
    return query select false, 'STALE_REVIEW', p_queue_id, v_worker_id,
      v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  select * into strict v_result from public.admin_review_worker_profile_atomic(
    p_queue_id, p_admin_id, v_decision, v_reason
  );
  if v_result.ok is true then
    if v_result.error_code is not null or v_result.queue_id is distinct from p_queue_id
      or v_result.worker_id is distinct from v_worker_id or v_result.decision is distinct from v_decision
      or v_result.decided_at is null or v_result.verification_status is distinct from
        (case when v_decision = 'approve' then 'approved' else 'rejected' end)::public.worker_verification_status then
      raise exception using errcode = 'XX000', message = 'INVALID_REVIEW_RECEIPT';
    end if;
    update public.kael_admin_queue as queue
    set safe_metadata = queue.safe_metadata || pg_catalog.jsonb_build_object(
      'profile_review_receipt', pg_catalog.jsonb_build_object(
        'application_id', p_application_id, 'profile_updated_at', p_expected_profile_updated_at,
        'verification_status', v_result.verification_status
      )
    ) where queue.id = p_queue_id;
  end if;
  return query select v_result.ok, v_result.error_code, v_result.queue_id,
    v_result.worker_id, v_result.decision, v_result.verification_status, v_result.decided_at;
end;
$function$;

revoke all on function public.admin_review_worker_profile_snapshot_atomic(uuid, uuid, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_review_worker_profile_snapshot_atomic(uuid, uuid, text, text, timestamptz, uuid)
  to service_role;

-- Only the snapshot-checked definer may invoke the legacy mutation implementation.
revoke all on function public.admin_review_worker_profile_atomic(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
