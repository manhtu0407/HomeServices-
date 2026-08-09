begin;

create table if not exists public.admin_operator_accounts (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  baseline_role public.user_role not null check (baseline_role in ('customer', 'worker')),
  capabilities text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid not null references public.profiles(id) on delete restrict,
  last_changed_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists admin_operator_accounts_status_idx
  on public.admin_operator_accounts (status, updated_at desc);

drop trigger if exists admin_operator_accounts_updated_at on public.admin_operator_accounts;
create trigger admin_operator_accounts_updated_at
  before update on public.admin_operator_accounts
  for each row execute function public.update_updated_at();

alter table public.admin_operator_accounts enable row level security;
revoke all on public.admin_operator_accounts from anon, authenticated;
grant all on public.admin_operator_accounts to service_role;

create table if not exists public.admin_worker_application_reviews (
  queue_id uuid primary key references public.kael_admin_queue(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null check (decision in ('approve', 'request_changes', 'reject')),
  reason text,
  decided_by uuid not null references public.profiles(id) on delete restrict,
  decided_at timestamptz not null default now()
);

create index if not exists admin_worker_application_reviews_worker_idx
  on public.admin_worker_application_reviews (worker_id, decided_at desc);

alter table public.admin_worker_application_reviews enable row level security;
revoke all on public.admin_worker_application_reviews from anon, authenticated;
grant all on public.admin_worker_application_reviews to service_role;

alter table public.kael_permission_audit
  drop constraint if exists kael_permission_audit_actor_role_check;

alter table public.kael_permission_audit
  add constraint kael_permission_audit_actor_role_check
  check (actor_role in ('customer', 'worker', 'admin', 'admin_operator', 'system'));

create index if not exists kael_permission_audit_actor_created_idx
  on public.kael_permission_audit (actor_id, created_at desc);

create index if not exists disputes_open_updated_idx
  on public.disputes (status, updated_at desc)
  where status <> 'resolved';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_requested_role text := lower(coalesce(new.raw_user_meta_data->>'role', ''));
begin
  insert into public.profiles (id, role, phone)
  values (
    new.id,
    case when v_requested_role = 'worker' then 'worker'::public.user_role else 'customer'::public.user_role end,
    new.phone
  );
  return new;
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

  if pg_catalog.cardinality(v_capabilities) > 6
     or exists (
       select 1
       from pg_catalog.unnest(v_capabilities) as capability
       where capability not in (
         'operations.read',
         'workers.read',
         'workers.review',
         'workers.manage',
         'transactions.read',
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

      update public.admin_operator_accounts
      set capabilities = v_capabilities,
          status = 'active',
          last_changed_by = p_owner_id,
          revoked_at = null
      where user_id = p_target_id
      returning * into v_account;
    else
      if v_target.role not in ('customer'::public.user_role, 'worker'::public.user_role) then
        return query select false, 'INVALID_TARGET_ROLE'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
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
    end if;

    update public.profiles
    set role = 'admin_operator'::public.user_role
    where id = p_target_id;
  elsif v_action = 'update' then
    if not found or v_account.status <> 'active' or v_target.role <> 'admin_operator'::public.user_role then
      return query select false, 'OPERATOR_NOT_ACTIVE'::text, p_target_id, null::text, v_target.role, coalesce(v_account.capabilities, '{}'::text[]), null::timestamptz;
      return;
    end if;

    update public.admin_operator_accounts
    set capabilities = v_capabilities,
        last_changed_by = p_owner_id
    where user_id = p_target_id
    returning * into v_account;
  else
    if not found then
      return query select false, 'OPERATOR_NOT_FOUND'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
      return;
    end if;

    update public.admin_operator_accounts
    set capabilities = '{}'::text[],
        status = 'revoked',
        last_changed_by = p_owner_id,
        revoked_at = v_now
    where user_id = p_target_id
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

revoke execute on function public.admin_set_sub_admin_access_atomic(uuid, uuid, text, text[], text) from public, anon, authenticated;
grant execute on function public.admin_set_sub_admin_access_atomic(uuid, uuid, text, text[], text) to service_role;

create or replace function public.admin_set_worker_access_atomic(
  p_actor_id uuid,
  p_worker_id uuid,
  p_action text,
  p_reason text
)
returns table(
  ok boolean,
  error_code text,
  worker_id uuid,
  verification_status_out public.worker_verification_status,
  is_suspended_out boolean,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role public.user_role;
  v_worker public.worker_profiles%rowtype;
  v_action text := lower(pg_catalog.btrim(coalesce(p_action, '')));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select role into v_actor_role
  from public.profiles
  where id = p_actor_id;

  if v_actor_role <> 'admin'::public.user_role
     and not (
       v_actor_role = 'admin_operator'::public.user_role
       and exists (
         select 1
         from public.admin_operator_accounts
         where user_id = p_actor_id
           and status = 'active'
           and 'workers.manage' = any(capabilities)
       )
     ) then
    return query select false, 'WORKER_MANAGE_REQUIRED'::text, p_worker_id, null::public.worker_verification_status, null::boolean, null::timestamptz;
    return;
  end if;

  if v_action not in ('suspend', 'reinstate') or pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 1000 then
    return query select false, 'INVALID_INPUT'::text, p_worker_id, null::public.worker_verification_status, null::boolean, null::timestamptz;
    return;
  end if;

  select worker_row.*
  into v_worker
  from public.worker_profiles as worker_row
  where worker_row.id = p_worker_id
  for update;

  if not found then
    return query select false, 'WORKER_NOT_FOUND'::text, p_worker_id, null::public.worker_verification_status, null::boolean, null::timestamptz;
    return;
  end if;

  if v_action = 'suspend' then
    if v_worker.is_suspended then
      return query select true, null::text, p_worker_id, v_worker.verification_status, true, v_now;
      return;
    end if;
    if v_worker.verification_status <> 'approved'::public.worker_verification_status or v_worker.is_approved is not true then
      return query select false, 'WORKER_NOT_APPROVED'::text, p_worker_id, v_worker.verification_status, v_worker.is_suspended, null::timestamptz;
      return;
    end if;

    update public.worker_profiles
    set verification_status = 'suspended'::public.worker_verification_status,
        is_approved = false,
        is_available = false,
        is_suspended = true
    where id = p_worker_id
    returning * into v_worker;
  else
    if not v_worker.is_suspended then
      return query select true, null::text, p_worker_id, v_worker.verification_status, false, v_now;
      return;
    end if;

    update public.worker_profiles
    set verification_status = 'approved'::public.worker_verification_status,
        is_approved = true,
        is_available = false,
        is_suspended = false
    where id = p_worker_id
    returning * into v_worker;
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
    p_actor_id,
    v_actor_role::text,
    'admin_worker_access',
    v_action,
    'worker_access',
    case when v_action = 'suspend' then 'deny' else 'allow' end,
    'worker_' || v_action,
    jsonb_build_object('worker_id', p_worker_id, 'reason_provided', true)
  );

  return query select true, null::text, p_worker_id, v_worker.verification_status, v_worker.is_suspended, v_now;
end;
$function$;

revoke execute on function public.admin_set_worker_access_atomic(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_worker_access_atomic(uuid, uuid, text, text) to service_role;

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
  ) on conflict (queue_id) do update
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

revoke execute on function public.admin_review_worker_application_atomic(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_review_worker_application_atomic(uuid, uuid, text, text) to service_role;

create or replace function public.admin_operations_snapshot(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.user_role;
  v_snapshot jsonb;
begin
  select role into v_role from public.profiles where id = p_actor_id;
  if v_role <> 'admin'::public.user_role
     and not (
       v_role = 'admin_operator'::public.user_role
       and exists (
         select 1
         from public.admin_operator_accounts
         where user_id = p_actor_id
           and status = 'active'
           and 'operations.read' = any(capabilities)
       )
     ) then
    raise exception 'admin operations access is required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', pg_catalog.clock_timestamp(),
    'attention', (
      with attention_rows as (
        select 'worker_applications'::text as key, 'workers'::text as target_section, 10 as sort_order, count(*)::integer as count
        from public.kael_admin_queue
        where queue_type = 'worker_application_review'
          and status in ('open', 'acknowledged')
        union all
        select 'payment_attention', 'transactions', 20, count(*)::integer
        from public.jobs
        where payment_status = 'amount_mismatch'
        union all
        select 'open_disputes', 'transactions', 30, count(*)::integer
        from public.disputes
        where status <> 'resolved'
        union all
        select 'other_admin_queue', 'operations', 40, count(*)::integer
        from public.kael_admin_queue
        where queue_type <> 'worker_application_review'
          and status in ('open', 'acknowledged')
      )
      select coalesce(
        jsonb_agg(jsonb_build_object('key', key, 'target_section', target_section, 'count', count) order by sort_order) filter (where count > 0),
        '[]'::jsonb
      )
      from attention_rows
    ),
    'flow', (
      select coalesce(
        jsonb_agg(jsonb_build_object('status', status, 'count', count) order by status),
        '[]'::jsonb
      )
      from (
        select status::text as status, count(*)::integer as count
        from public.jobs
        where status not in ('paid'::public.job_status, 'reviewed'::public.job_status, 'cancelled'::public.job_status)
        group by status
      ) as active_flow
    ),
    'quality', (
      with quality_rows as (
        select 'workers_suspended'::text as key, 10 as sort_order, count(*)::integer as count
        from public.worker_profiles
        where is_suspended is true
        union all
        select 'workers_in_verification', 20, count(*)::integer
        from public.worker_profiles
        where verification_status in ('submitted'::public.worker_verification_status, 'under_review'::public.worker_verification_status)
      )
      select coalesce(
        jsonb_agg(jsonb_build_object('key', key, 'count', count) order by sort_order),
        '[]'::jsonb
      )
      from quality_rows
    ),
    'audit_events', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'actor_id', actor_id,
            'actor_name', actor_name,
            'actor_role', actor_role,
            'action', action,
            'topic', topic,
            'decision', decision,
            'occurred_at', created_at
          ) order by created_at desc
        ),
        '[]'::jsonb
      )
      from (
        select audit.id, audit.actor_id, profile.full_name as actor_name, audit.actor_role, audit.action, audit.topic, audit.decision, audit.created_at
        from public.kael_permission_audit as audit
        left join public.profiles as profile on profile.id = audit.actor_id
        order by audit.created_at desc
        limit 20
      ) as recent_audit
    )
  ) into v_snapshot;

  return v_snapshot;
end;
$function$;

revoke execute on function public.admin_operations_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.admin_operations_snapshot(uuid) to service_role;

commit;
