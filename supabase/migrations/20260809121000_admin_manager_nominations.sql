begin;

create table if not exists public.admin_manager_nominations (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete restrict,
  nominated_by uuid not null references public.profiles(id) on delete restrict,
  baseline_role public.user_role not null check (baseline_role in ('customer', 'worker')),
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'granted')),
  nominated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  granted_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_manager_nominations_pending_target_idx
  on public.admin_manager_nominations (target_user_id)
  where status = 'pending';

create index if not exists admin_manager_nominations_owner_status_idx
  on public.admin_manager_nominations (nominated_by, status, nominated_at desc);

drop trigger if exists admin_manager_nominations_updated_at on public.admin_manager_nominations;
create trigger admin_manager_nominations_updated_at
  before update on public.admin_manager_nominations
  for each row execute function public.update_updated_at();

alter table public.admin_manager_nominations enable row level security;
revoke all on public.admin_manager_nominations from anon, authenticated;
grant all on public.admin_manager_nominations to service_role;

create or replace function public.admin_nominate_manager_atomic(
  p_owner_id uuid,
  p_target_id uuid
)
returns table(
  ok boolean,
  error_code text,
  nomination_id uuid,
  user_id uuid,
  baseline_role_out public.user_role,
  nominated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.profiles%rowtype;
  v_nomination public.admin_manager_nominations%rowtype;
begin
  if not exists (
    select 1
    from public.profiles as owner_profile
    where owner_profile.id = p_owner_id
      and owner_profile.role = 'admin'::public.user_role
  ) then
    return query select false, 'OWNER_REQUIRED'::text, null::uuid, p_target_id, null::public.user_role, null::timestamptz;
    return;
  end if;

  if p_target_id is null or p_target_id = p_owner_id then
    return query select false, 'INVALID_TARGET'::text, null::uuid, p_target_id, null::public.user_role, null::timestamptz;
    return;
  end if;

  select profile_row.*
  into v_target
  from public.profiles as profile_row
  where profile_row.id = p_target_id
  for update;

  if not found then
    return query select false, 'TARGET_NOT_FOUND'::text, null::uuid, p_target_id, null::public.user_role, null::timestamptz;
    return;
  end if;

  if v_target.role not in ('customer'::public.user_role, 'worker'::public.user_role) then
    return query select false, 'INVALID_TARGET_ROLE'::text, null::uuid, p_target_id, v_target.role, null::timestamptz;
    return;
  end if;

  if exists (
    select 1
    from public.admin_operator_accounts as operator_account
    where operator_account.user_id = p_target_id
      and operator_account.status = 'active'
  ) then
    return query select false, 'ALREADY_OPERATOR'::text, null::uuid, p_target_id, v_target.role, null::timestamptz;
    return;
  end if;

  select nomination_row.*
  into v_nomination
  from public.admin_manager_nominations as nomination_row
  where nomination_row.target_user_id = p_target_id
    and nomination_row.status = 'pending'
  for update;

  if found then
    if v_nomination.nominated_by = p_owner_id then
      return query select false, 'NOMINATION_EXISTS'::text, v_nomination.id, p_target_id, v_nomination.baseline_role, v_nomination.nominated_at;
    else
      return query select false, 'NOMINATION_OWNED_BY_ANOTHER_OWNER'::text, v_nomination.id, p_target_id, v_nomination.baseline_role, v_nomination.nominated_at;
    end if;
    return;
  end if;

  insert into public.admin_manager_nominations (
    target_user_id,
    nominated_by,
    baseline_role
  ) values (
    p_target_id,
    p_owner_id,
    v_target.role
  )
  returning * into v_nomination;

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
    'admin_manager_nomination',
    'nominate',
    'admin_operator',
    'allow',
    'admin_manager_nominated',
    jsonb_build_object('target_id', p_target_id)
  );

  return query select true, null::text, v_nomination.id, p_target_id, v_nomination.baseline_role, v_nomination.nominated_at;
end;
$function$;

revoke execute on function public.admin_nominate_manager_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_nominate_manager_atomic(uuid, uuid) to service_role;

create or replace function public.admin_cancel_manager_nomination_atomic(
  p_owner_id uuid,
  p_nomination_id uuid
)
returns table(
  ok boolean,
  error_code text,
  nomination_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_nomination public.admin_manager_nominations%rowtype;
begin
  if not exists (
    select 1
    from public.profiles as owner_profile
    where owner_profile.id = p_owner_id
      and owner_profile.role = 'admin'::public.user_role
  ) then
    return query select false, 'OWNER_REQUIRED'::text, p_nomination_id;
    return;
  end if;

  select nomination_row.*
  into v_nomination
  from public.admin_manager_nominations as nomination_row
  where nomination_row.id = p_nomination_id
  for update;

  if not found then
    return query select false, 'NOMINATION_NOT_FOUND'::text, p_nomination_id;
    return;
  end if;

  if v_nomination.nominated_by <> p_owner_id then
    return query select false, 'OWNER_REQUIRED'::text, p_nomination_id;
    return;
  end if;

  if v_nomination.status <> 'pending' then
    return query select false, 'NOMINATION_NOT_PENDING'::text, p_nomination_id;
    return;
  end if;

  update public.admin_manager_nominations
  set status = 'cancelled',
      cancelled_at = pg_catalog.clock_timestamp()
  where id = p_nomination_id;

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
    'admin_manager_nomination',
    'cancel',
    'admin_operator',
    'deny',
    'admin_manager_nomination_cancelled',
    jsonb_build_object('target_id', v_nomination.target_user_id)
  );

  return query select true, null::text, p_nomination_id;
end;
$function$;

revoke execute on function public.admin_cancel_manager_nomination_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_cancel_manager_nomination_atomic(uuid, uuid) to service_role;

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

commit;
