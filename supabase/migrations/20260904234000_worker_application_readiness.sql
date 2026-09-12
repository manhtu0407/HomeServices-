begin;

create index if not exists kael_admin_queue_worker_application_actor_created_idx
  on public.kael_admin_queue (actor_id, created_at desc)
  where queue_type = 'worker_application_review';

create or replace function public.submit_worker_application_atomic(
  p_actor_id uuid,
  p_contact_suffix text,
  p_language text,
  p_source text,
  p_client_request_id uuid default null,
  p_revision_of_application_id uuid default null
)
returns table(
  ok boolean,
  error_code text,
  application_id uuid,
  status_out text,
  submitted_at timestamptz,
  decided_at timestamptz,
  reason_out text,
  can_submit boolean,
  can_resume boolean,
  idempotent_out boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile public.profiles%rowtype;
  v_queue public.kael_admin_queue%rowtype;
  v_review public.admin_worker_application_reviews%rowtype;
  v_decision text;
  v_exact_request boolean := false;
  v_status text;
begin
  if p_actor_id is null
     or p_source <> 'auth_worker_create'
     or p_language not in ('vi', 'en')
     or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_contact_suffix, ''))) not between 1 and 64 then
    return query select false, 'INVALID_INPUT', null::uuid, null::text,
      null::timestamptz, null::timestamptz, null::text, false, false, false;
    return;
  end if;

  select profile.* into v_profile
  from public.profiles as profile
  where profile.id = p_actor_id
  for update;

  if not found then
    return query select false, 'PROFILE_NOT_FOUND', null::uuid, null::text,
      null::timestamptz, null::timestamptz, null::text, false, false, false;
    return;
  end if;

  if v_profile.role not in ('customer'::public.user_role, 'worker'::public.user_role) then
    return query select false, 'INVALID_ROLE', null::uuid, null::text,
      null::timestamptz, null::timestamptz, null::text, false, false, false;
    return;
  end if;

  if p_client_request_id is not null then
    select queue.* into v_queue
    from public.kael_admin_queue as queue
    where queue.actor_id = p_actor_id
      and queue.queue_type = 'worker_application_review'
      and queue.safe_metadata->>'client_request_id' = p_client_request_id::text
    order by queue.created_at desc, queue.id desc
    limit 1;
    v_exact_request := v_queue.id is not null;
  end if;

  if v_queue.id is null then
    select queue.* into v_queue
    from public.kael_admin_queue as queue
    where queue.actor_id = p_actor_id
      and queue.queue_type = 'worker_application_review'
    order by queue.created_at desc, queue.id desc
    limit 1;
  end if;

  if v_queue.id is not null then
    select review.* into v_review
    from public.admin_worker_application_reviews as review
    where review.queue_id = v_queue.id;

    v_decision := coalesce(v_review.decision, nullif(v_queue.safe_metadata->>'decision', ''));
    v_status := case
      when v_decision = 'approve' then 'approved'
      when v_decision = 'request_changes' then 'changes_requested'
      when v_decision = 'reject' then 'rejected'
      else 'pending_review'
    end;

    if v_exact_request
       or v_status <> 'changes_requested'
       or p_revision_of_application_id is null
       or p_revision_of_application_id is distinct from v_queue.id then
      return query select true, null::text, v_queue.id, v_status,
        v_queue.created_at, coalesce(v_review.decided_at, nullif(v_queue.safe_metadata->>'decided_at', '')::timestamptz),
        v_review.reason, v_status in ('not_submitted', 'changes_requested'),
        v_status = 'changes_requested', true;
      return;
    end if;
  elsif v_profile.role = 'worker'::public.user_role then
    return query select true, null::text, null::uuid, 'approved'::text,
      null::timestamptz, null::timestamptz, null::text, false, false, true;
    return;
  end if;

  insert into public.kael_admin_queue (
    actor_id,
    actor_role,
    escalation_level,
    priority,
    queue_type,
    reason_code,
    response_summary,
    safe_metadata,
    status
  ) values (
    p_actor_id,
    v_profile.role::text,
    'soft',
    'medium',
    'worker_application_review',
    'worker_application_submitted',
    'worker_application_submitted',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'actor_id', p_actor_id,
      'client_request_id', p_client_request_id,
      'contact_suffix', pg_catalog.btrim(p_contact_suffix),
      'contact_type', 'email',
      'language', p_language,
      'revision_of_application_id', p_revision_of_application_id,
      'source', p_source
    )),
    'open'
  ) returning * into v_queue;

  return query select true, null::text, v_queue.id, 'pending_review'::text,
    v_queue.created_at, null::timestamptz, null::text, false, false, false;
end;
$function$;

revoke all on function public.submit_worker_application_atomic(
  uuid, text, text, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.submit_worker_application_atomic(
  uuid, text, text, text, uuid, uuid
) to service_role;

comment on function public.submit_worker_application_atomic(
  uuid, text, text, text, uuid, uuid
) is
  'Creates at most one pending access application per actor, returns durable prior state on retry, and requires an explicit revision id before resubmitting a changes-requested application.';

commit;
