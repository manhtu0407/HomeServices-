begin;

create index if not exists kael_admin_queue_worker_application_status_idx
  on public.kael_admin_queue (queue_type, status, created_at desc)
  where queue_type = 'worker_application_review';

create index if not exists jobs_admin_payment_activity_idx
  on public.jobs (payment_status, payment_updated_at desc nulls last, updated_at desc);

create or replace function public.admin_review_worker_application_atomic(
  p_queue_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_reason text default null
)
returns table (
  ok boolean,
  error_code text,
  queue_id uuid,
  worker_id uuid,
  decision text,
  status_out text,
  role_out public.user_role,
  verification_status_out public.worker_verification_status,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_queue public.kael_admin_queue%rowtype;
  v_profile public.profiles%rowtype;
  v_worker public.worker_profiles%rowtype;
  v_has_worker_profile boolean := false;
  v_decision text := lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_metadata jsonb;
begin
  if not exists (
    select 1
    from public.profiles as admin_profile
    where admin_profile.id = p_admin_id
      and admin_profile.role = 'admin'::public.user_role
  ) then
    return query select
      false,
      'ADMIN_REQUIRED'::text,
      p_queue_id,
      null::uuid,
      v_decision,
      null::text,
      null::public.user_role,
      null::public.worker_verification_status,
      null::timestamptz;
    return;
  end if;

  if v_decision not in ('approve', 'request_changes', 'reject') then
    return query select
      false,
      'INVALID_DECISION'::text,
      p_queue_id,
      null::uuid,
      v_decision,
      null::text,
      null::public.user_role,
      null::public.worker_verification_status,
      null::timestamptz;
    return;
  end if;

  if pg_catalog.char_length(v_reason) > 1000
     or (v_decision in ('request_changes', 'reject') and v_reason = '') then
    return query select
      false,
      'REASON_REQUIRED'::text,
      p_queue_id,
      null::uuid,
      v_decision,
      null::text,
      null::public.user_role,
      null::public.worker_verification_status,
      null::timestamptz;
    return;
  end if;

  select queue_row.*
  into v_queue
  from public.kael_admin_queue as queue_row
  where queue_row.id = p_queue_id
    and queue_row.queue_type = 'worker_application_review'
  for update;

  if not found then
    return query select
      false,
      'APPLICATION_NOT_FOUND'::text,
      p_queue_id,
      null::uuid,
      v_decision,
      null::text,
      null::public.user_role,
      null::public.worker_verification_status,
      null::timestamptz;
    return;
  end if;

  if v_queue.safe_metadata->>'decision' = v_decision then
    select profile_row.*
    into v_profile
    from public.profiles as profile_row
    where profile_row.id = v_queue.actor_id;

    select worker_row.*
    into v_worker
    from public.worker_profiles as worker_row
    where worker_row.id = v_queue.actor_id;
    v_has_worker_profile := found;

    return query select
      true,
      null::text,
      v_queue.id,
      v_queue.actor_id,
      v_decision,
      v_queue.status,
      v_profile.role,
      case when v_has_worker_profile then v_worker.verification_status else null end,
      nullif(v_queue.safe_metadata->>'decided_at', '')::timestamptz;
    return;
  end if;

  if v_queue.status not in ('open', 'acknowledged') then
    return query select
      false,
      'ALREADY_REVIEWED'::text,
      v_queue.id,
      v_queue.actor_id,
      v_decision,
      v_queue.status,
      null::public.user_role,
      null::public.worker_verification_status,
      nullif(v_queue.safe_metadata->>'decided_at', '')::timestamptz;
    return;
  end if;

  select profile_row.*
  into v_profile
  from public.profiles as profile_row
  where profile_row.id = v_queue.actor_id
  for update;

  if not found then
    return query select
      false,
      'WORKER_NOT_FOUND'::text,
      v_queue.id,
      v_queue.actor_id,
      v_decision,
      v_queue.status,
      null::public.user_role,
      null::public.worker_verification_status,
      null::timestamptz;
    return;
  end if;

  select worker_row.*
  into v_worker
  from public.worker_profiles as worker_row
  where worker_row.id = v_queue.actor_id
  for update;
  v_has_worker_profile := found;

  if v_decision = 'approve' then
    insert into public.worker_profiles (
      id,
      verification_status,
      is_approved,
      is_available
    ) values (
      v_queue.actor_id,
      'draft'::public.worker_verification_status,
      false,
      false
    ) on conflict (id) do nothing;

    update public.profiles
    set role = 'worker'::public.user_role
    where id = v_queue.actor_id
      and role in ('customer'::public.user_role, 'worker'::public.user_role);

    select worker_row.*
    into v_worker
    from public.worker_profiles as worker_row
    where worker_row.id = v_queue.actor_id;
    v_has_worker_profile := found;
  elsif v_decision = 'reject' and v_has_worker_profile then
    update public.worker_profiles
    set verification_status = 'rejected'::public.worker_verification_status,
        is_approved = false,
        is_available = false
    where id = v_queue.actor_id;

    select worker_row.*
    into v_worker
    from public.worker_profiles as worker_row
    where worker_row.id = v_queue.actor_id;
  end if;

  v_metadata := coalesce(v_queue.safe_metadata, '{}'::jsonb) || jsonb_build_object(
    'decision', v_decision,
    'decided_at', v_now,
    'reason_provided', v_reason <> ''
  );

  update public.kael_admin_queue
  set status = case when v_decision = 'request_changes' then 'acknowledged' else 'resolved' end,
      response_summary = case v_decision
        when 'approve' then 'worker_application_approved'
        when 'request_changes' then 'worker_application_changes_requested'
        else 'worker_application_rejected'
      end,
      safe_metadata = v_metadata
  where id = v_queue.id;

  insert into public.kael_permission_audit (
    actor_id,
    actor_role,
    purpose,
    action,
    topic,
    decision,
    reason_code,
    safe_metadata
  ) values (
    p_admin_id,
    'admin',
    'admin_worker_application_review',
    'review',
    'worker_application',
    case when v_decision = 'approve' then 'allow'
      when v_decision = 'request_changes' then 'escalate'
      else 'deny'
    end,
    'worker_application_' || v_decision,
    jsonb_build_object(
      'queue_id', v_queue.id,
      'worker_id', v_queue.actor_id,
      'decision', v_decision
    )
  );

  return query select
    true,
    null::text,
    v_queue.id,
    v_queue.actor_id,
    v_decision,
    case when v_decision = 'request_changes' then 'acknowledged' else 'resolved' end,
    case when v_decision = 'approve' then 'worker'::public.user_role else v_profile.role end,
    case
      when v_has_worker_profile then v_worker.verification_status
      else null::public.worker_verification_status
    end,
    v_now;
end;
$function$;

revoke execute on function public.admin_review_worker_application_atomic(uuid, uuid, text, text)
  from public;
revoke execute on function public.admin_review_worker_application_atomic(uuid, uuid, text, text)
  from anon;
revoke execute on function public.admin_review_worker_application_atomic(uuid, uuid, text, text)
  from authenticated;
grant execute on function public.admin_review_worker_application_atomic(uuid, uuid, text, text)
  to service_role;

comment on function public.admin_review_worker_application_atomic(uuid, uuid, text, text) is
  'Admin-only atomic worker account review. Approval grants worker onboarding access but does not approve KYC or set is_approved.';

commit;
