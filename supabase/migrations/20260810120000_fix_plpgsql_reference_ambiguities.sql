begin;

create or replace function public.admin_review_worker_application_atomic(
  p_queue_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_reason text default null
)
returns table(
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
  v_actor_role public.user_role;
  v_has_worker_profile boolean := false;
  v_decision text := lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_metadata jsonb;
begin
  select role into v_actor_role
  from public.profiles
  where id = p_admin_id;

  if v_actor_role <> 'admin'::public.user_role
     and not (
       v_actor_role = 'admin_operator'::public.user_role
       and exists (
         select 1
         from public.admin_operator_accounts
         where user_id = p_admin_id
           and status = 'active'
           and 'workers.review' = any(capabilities)
       )
     ) then
    return query select false, 'ADMIN_REQUIRED'::text, p_queue_id, null::uuid, v_decision, null::text, null::public.user_role, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  if v_decision not in ('approve', 'request_changes', 'reject') then
    return query select false, 'INVALID_DECISION'::text, p_queue_id, null::uuid, v_decision, null::text, null::public.user_role, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  if pg_catalog.char_length(v_reason) > 1000
     or (v_decision in ('request_changes', 'reject') and v_reason = '') then
    return query select false, 'REASON_REQUIRED'::text, p_queue_id, null::uuid, v_decision, null::text, null::public.user_role, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  select queue_row.*
  into v_queue
  from public.kael_admin_queue as queue_row
  where queue_row.id = p_queue_id
    and queue_row.queue_type = 'worker_application_review'
  for update;

  if not found then
    return query select false, 'APPLICATION_NOT_FOUND'::text, p_queue_id, null::uuid, v_decision, null::text, null::public.user_role, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  if v_queue.safe_metadata->>'decision' = v_decision then
    select profile_row.* into v_profile from public.profiles as profile_row where profile_row.id = v_queue.actor_id;
    select worker_row.* into v_worker from public.worker_profiles as worker_row where worker_row.id = v_queue.actor_id;
    v_has_worker_profile := found;
    return query select true, null::text, v_queue.id, v_queue.actor_id, v_decision, v_queue.status, v_profile.role, case when v_has_worker_profile then v_worker.verification_status else null end, nullif(v_queue.safe_metadata->>'decided_at', '')::timestamptz;
    return;
  end if;

  if v_queue.status not in ('open', 'acknowledged') then
    return query select false, 'ALREADY_REVIEWED'::text, v_queue.id, v_queue.actor_id, v_decision, v_queue.status, null::public.user_role, null::public.worker_verification_status, nullif(v_queue.safe_metadata->>'decided_at', '')::timestamptz;
    return;
  end if;

  select profile_row.* into v_profile from public.profiles as profile_row where profile_row.id = v_queue.actor_id for update;
  if not found then
    return query select false, 'WORKER_NOT_FOUND'::text, v_queue.id, v_queue.actor_id, v_decision, v_queue.status, null::public.user_role, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  select worker_row.* into v_worker from public.worker_profiles as worker_row where worker_row.id = v_queue.actor_id for update;
  v_has_worker_profile := found;

  if v_decision = 'approve' then
    insert into public.worker_profiles (id, verification_status, is_approved, is_available)
    values (v_queue.actor_id, 'draft'::public.worker_verification_status, false, false)
    on conflict (id) do nothing;

    update public.profiles
    set role = 'worker'::public.user_role
    where id = v_queue.actor_id
      and role in ('customer'::public.user_role, 'worker'::public.user_role);

    select worker_row.* into v_worker from public.worker_profiles as worker_row where worker_row.id = v_queue.actor_id;
    v_has_worker_profile := found;
  elsif v_decision = 'reject' and v_has_worker_profile then
    update public.worker_profiles
    set verification_status = 'rejected'::public.worker_verification_status,
        is_approved = false,
        is_available = false
    where id = v_queue.actor_id
    returning * into v_worker;
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

  insert into public.admin_worker_application_reviews (
    queue_id,
    worker_id,
    decision,
    reason,
    decided_by,
    decided_at
  ) values (
    v_queue.id,
    v_queue.actor_id,
    v_decision,
    nullif(v_reason, ''),
    p_admin_id,
    v_now
  ) on conflict on constraint admin_worker_application_reviews_pkey do update
  set decision = excluded.decision,
      reason = excluded.reason,
      decided_by = excluded.decided_by,
      decided_at = excluded.decided_at;

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
    v_actor_role::text,
    'admin_worker_application_review',
    'review',
    'worker_application',
    case when v_decision = 'approve' then 'allow' when v_decision = 'request_changes' then 'escalate' else 'deny' end,
    'worker_application_' || v_decision,
    jsonb_build_object('queue_id', v_queue.id, 'worker_id', v_queue.actor_id, 'decision', v_decision)
  );

  return query select true, null::text, v_queue.id, v_queue.actor_id, v_decision, case when v_decision = 'request_changes' then 'acknowledged' else 'resolved' end, case when v_decision = 'approve' then 'worker'::public.user_role else v_profile.role end, case when v_has_worker_profile then v_worker.verification_status else null::public.worker_verification_status end, v_now;
end;
$function$;

create or replace function public.admin_set_sub_admin_access_atomic(
  p_owner_id uuid,
  p_target_id uuid,
  p_action text,
  p_capabilities text[] default '{}',
  p_reason text default null
)
returns table(
  ok boolean,
  error_code text,
  user_id uuid,
  status_out text,
  role_out public.user_role,
  capabilities_out text[],
  updated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.profiles%rowtype;
  v_account public.admin_operator_accounts%rowtype;
  v_nomination public.admin_manager_nominations%rowtype;
  v_role_out public.user_role;
  v_action text := lower(pg_catalog.btrim(coalesce(p_action, '')));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_capabilities text[] := coalesce(p_capabilities, '{}'::text[]);
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if not exists (
    select 1
    from public.profiles as owner_profile
    where owner_profile.id = p_owner_id
      and owner_profile.role = 'admin'::public.user_role
  ) then
    return query select false, 'OWNER_REQUIRED'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  if p_target_id is null or p_target_id = p_owner_id then
    return query select false, 'INVALID_TARGET'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  if v_action not in ('grant', 'update', 'revoke') then
    return query select false, 'INVALID_ACTION'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  if pg_catalog.cardinality(v_capabilities) > 8
     or exists (
       select 1
       from pg_catalog.unnest(v_capabilities) as capability
       where capability not in (
         'operations.read',
         'workers.read',
         'workers.review',
         'workers.manage',
         'transactions.read',
         'payouts.read',
         'payouts.process',
         'team.read'
       )
     )
     or (select count(*) from pg_catalog.unnest(v_capabilities)) <> (select count(distinct capability) from pg_catalog.unnest(v_capabilities) as capability)
     or (v_action in ('grant', 'update') and pg_catalog.cardinality(v_capabilities) = 0)
     or (v_action = 'revoke' and (pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 500)) then
    return query select false, 'INVALID_INPUT'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  select profile_row.*
  into v_target
  from public.profiles as profile_row
  where profile_row.id = p_target_id
  for update;

  if not found then
    return query select false, 'TARGET_NOT_FOUND'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  if v_target.role = 'admin'::public.user_role then
    return query select false, 'OWNER_CANNOT_BE_OPERATOR'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
    return;
  end if;

  select account_row.*
  into v_account
  from public.admin_operator_accounts as account_row
  where account_row.user_id = p_target_id
  for update;

  if v_action = 'grant' then
    if found then
      if v_target.role not in ('admin_operator'::public.user_role, v_account.baseline_role) then
        return query select false, 'INVALID_TARGET_ROLE'::text, p_target_id, null::text, v_target.role, v_account.capabilities, null::timestamptz;
        return;
      end if;

      update public.admin_operator_accounts as operator_account
      set capabilities = v_capabilities,
          status = 'active',
          last_changed_by = p_owner_id,
          revoked_at = null
      where operator_account.user_id = p_target_id
      returning * into v_account;
    else
      if v_target.role not in ('customer'::public.user_role, 'worker'::public.user_role) then
        return query select false, 'INVALID_TARGET_ROLE'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
        return;
      end if;

      select nomination_row.*
      into v_nomination
      from public.admin_manager_nominations as nomination_row
      where nomination_row.target_user_id = p_target_id
        and nomination_row.nominated_by = p_owner_id
        and nomination_row.status = 'pending'
      for update;

      if not found then
        return query select false, 'NOMINATION_REQUIRED'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
        return;
      end if;

      insert into public.admin_operator_accounts (
        user_id,
        baseline_role,
        capabilities,
        status,
        granted_by,
        last_changed_by
      ) values (
        p_target_id,
        v_target.role,
        v_capabilities,
        'active',
        p_owner_id,
        p_owner_id
      )
      returning * into v_account;

      update public.admin_manager_nominations
      set status = 'granted',
          granted_at = v_now
      where id = v_nomination.id;
    end if;

    update public.profiles
    set role = 'admin_operator'::public.user_role
    where id = p_target_id;
  elsif v_action = 'update' then
    if not found or v_account.status <> 'active' or v_target.role <> 'admin_operator'::public.user_role then
      return query select false, 'OPERATOR_NOT_ACTIVE'::text, p_target_id, null::text, v_target.role, coalesce(v_account.capabilities, '{}'::text[]), null::timestamptz;
      return;
    end if;

    update public.admin_operator_accounts as operator_account
    set capabilities = v_capabilities,
        last_changed_by = p_owner_id
    where operator_account.user_id = p_target_id
    returning * into v_account;
  else
    if not found then
      return query select false, 'OPERATOR_NOT_FOUND'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
      return;
    end if;

    update public.admin_operator_accounts as operator_account
    set capabilities = '{}'::text[],
        status = 'revoked',
        last_changed_by = p_owner_id,
        revoked_at = v_now
    where operator_account.user_id = p_target_id
    returning * into v_account;

    update public.profiles
    set role = v_account.baseline_role
    where id = p_target_id
      and role = 'admin_operator'::public.user_role;
  end if;

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
    p_owner_id,
    'admin',
    'admin_sub_admin_access',
    v_action,
    'admin_operator',
    case when v_action = 'revoke' then 'deny' else 'allow' end,
    'admin_operator_' || v_action,
    jsonb_build_object(
      'target_id', p_target_id,
      'capability_count', pg_catalog.cardinality(v_account.capabilities),
      'reason_provided', v_reason <> ''
    )
  );

  select role into v_role_out from public.profiles where id = p_target_id;
  return query select true, null::text, p_target_id, v_account.status, v_role_out, v_account.capabilities, v_account.updated_at;
end;
$function$;

create or replace function public.reserve_harness_idempotency(
  p_environment text,
  p_release_id text,
  p_operation_id text,
  p_actor_id_hash text,
  p_key_hash text,
  p_request_hash text,
  p_ttl_seconds integer
)
returns table (state text, reservation_id uuid, response_hash text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.harness_idempotency_keys%rowtype;
  v_reservation_id uuid;
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_release_id text := nullif(trim(coalesce(p_release_id, '')), '');
  v_operation_id text := nullif(trim(coalesce(p_operation_id, '')), '');
  v_actor_id_hash text := nullif(trim(coalesce(p_actor_id_hash, '')), '');
begin
  if p_environment is null
     or v_environment = ''
     or v_environment not in ('local', 'preview', 'staging', 'production')
     or v_release_id is null or char_length(v_release_id) > 160
     or v_operation_id is null or char_length(v_operation_id) > 160
     or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or (v_actor_id_hash is not null and v_actor_id_hash !~ '^[0-9a-f]{64}$') then
    return query select 'conflict'::text, null::uuid, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(
    v_environment || '|' || v_operation_id || '|' || coalesce(v_actor_id_hash, 'system') || '|' || p_key_hash
  ));

  select * into v_row
  from public.harness_idempotency_keys as idempotency_key
  where idempotency_key.environment = v_environment
    and idempotency_key.operation_id = v_operation_id
    and idempotency_key.actor_id_hash is not distinct from v_actor_id_hash
    and idempotency_key.key_hash = p_key_hash
  for update;

  if found then
    if v_row.request_hash <> p_request_hash then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result, error_code
      ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'conflict', 'REQUEST_HASH_CONFLICT');
      return query select 'conflict'::text, null::uuid, null::text;
      return;
    end if;
    if v_row.status = 'completed' then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result
      ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'replayed');
      return query select 'completed'::text, v_row.reservation_id, v_row.response_hash;
      return;
    end if;
    if v_row.status = 'reconcile_required' then
      return query select 'reconcile_required'::text, v_row.reservation_id, null::text;
      return;
    end if;
    if v_row.status in ('reserved', 'executing') and v_row.expires_at > now() then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result
      ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'in_progress');
      return query select 'in_progress'::text, v_row.reservation_id, null::text;
      return;
    end if;
    if v_row.status = 'executing' then
      update public.harness_idempotency_keys as idempotency_key
      set status = 'reconcile_required', completed_at = now(),
          error_code = 'EXECUTION_OUTCOME_UNKNOWN'
      where idempotency_key.reservation_id = v_row.reservation_id;
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result, error_code
      ) values (v_environment, v_release_id, v_operation_id,
        'idempotency', 'reconcile_required', 'EXECUTION_OUTCOME_UNKNOWN');
      return query select 'reconcile_required'::text, v_row.reservation_id, null::text;
      return;
    end if;
    update public.harness_idempotency_keys as idempotency_key
    set status = 'reserved', release_id = v_release_id,
        request_hash = p_request_hash, response_hash = null, error_code = null,
        reserved_at = now(), completed_at = null,
        expires_at = now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 300), 30))
    where idempotency_key.reservation_id = v_row.reservation_id;
    return query select 'reserved'::text, v_row.reservation_id, null::text;
    return;
  end if;

  insert into public.harness_idempotency_keys (
    environment, release_id, operation_id, actor_id_hash, key_hash,
    request_hash, expires_at
  ) values (
    v_environment, v_release_id, v_operation_id,
    v_actor_id_hash, p_key_hash, p_request_hash,
    now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 300), 30))
  ) returning harness_idempotency_keys.reservation_id into v_reservation_id;

  insert into public.harness_reliability_events (
    environment, release_id, operation_id, event_class, result
  ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'reserved');
  return query select 'reserved'::text, v_reservation_id, null::text;
end;
$function$;

commit;
