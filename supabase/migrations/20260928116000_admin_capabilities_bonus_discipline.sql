begin;

-- Sub-admins can be granted the two new worker program capabilities: editing the ambassador
-- milestone program, and deciding discipline cases and appeals.
CREATE OR REPLACE FUNCTION public.admin_set_sub_admin_access_atomic(p_owner_id uuid, p_target_id uuid, p_action text, p_capabilities text[] DEFAULT '{}'::text[], p_reason text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, error_code text, user_id uuid, status_out text, role_out user_role, capabilities_out text[], updated_at_out timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select 1 from public.profiles as owner_profile
    where owner_profile.id = p_owner_id and owner_profile.role = 'admin'::public.user_role
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

  if pg_catalog.cardinality(v_capabilities) > 13
    or exists (
      select 1 from pg_catalog.unnest(v_capabilities) as capability
      where capability not in (
        'operations.read', 'workers.read', 'workers.review', 'workers.manage',
        'transactions.read', 'finance.read', 'finance.reconcile',
        'finance.tax.manage', 'payouts.read', 'payouts.process', 'team.read',
        'workers.bonus.manage', 'workers.discipline.manage'
      )
    )
    or (select count(*) from pg_catalog.unnest(v_capabilities))
      <> (select count(distinct capability) from pg_catalog.unnest(v_capabilities) as capability)
    or (v_action = 'revoke' and (pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 500)) then
    return query select false, 'INVALID_INPUT'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  if v_action in ('grant', 'update') and not ('finance.read' = any(v_capabilities)) then
    v_capabilities := pg_catalog.array_append(v_capabilities, 'finance.read');
  end if;

  select profile_row.* into v_target
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

  select account_row.* into v_account
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

      select nomination_row.* into v_nomination
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
        user_id, baseline_role, capabilities, status, granted_by, last_changed_by
      ) values (
        p_target_id, v_target.role, v_capabilities, 'active', p_owner_id, p_owner_id
      ) returning * into v_account;

      update public.admin_manager_nominations
      set status = 'granted', granted_at = v_now
      where id = v_nomination.id;
    end if;

    update public.profiles set role = 'admin_operator'::public.user_role where id = p_target_id;
  elsif v_action = 'update' then
    if not found or v_account.status <> 'active' or v_target.role <> 'admin_operator'::public.user_role then
      return query select false, 'OPERATOR_NOT_ACTIVE'::text, p_target_id, null::text, v_target.role, coalesce(v_account.capabilities, '{}'::text[]), null::timestamptz;
      return;
    end if;

    update public.admin_operator_accounts as operator_account
    set capabilities = v_capabilities, last_changed_by = p_owner_id
    where operator_account.user_id = p_target_id
    returning * into v_account;
  else
    if not found then
      return query select false, 'OPERATOR_NOT_FOUND'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
      return;
    end if;

    update public.admin_operator_accounts as operator_account
    set capabilities = '{}', status = 'revoked', last_changed_by = p_owner_id, revoked_at = v_now
    where operator_account.user_id = p_target_id
    returning * into v_account;

    update public.profiles
    set role = v_account.baseline_role
    where id = p_target_id and role = 'admin_operator'::public.user_role;
  end if;

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_owner_id, 'admin', 'admin_sub_admin_access', v_action, 'admin_operator',
    case when v_action = 'revoke' then 'deny' else 'allow' end,
    'admin_operator_' || v_action,
    pg_catalog.jsonb_build_object(
      'target_id', p_target_id,
      'capability_count', pg_catalog.cardinality(v_account.capabilities),
      'reason_provided', v_reason <> ''
    )
  );

  select role into v_role_out from public.profiles where id = p_target_id;
  return query select true, null::text, p_target_id, v_account.status, v_role_out, v_account.capabilities, v_account.updated_at;
end;
$function$;

-- The team screen grants through v3, which validates through this v2 wrapper first; it carries
-- its own capability list, so the two program capabilities have to be added here as well.
create or replace function public.admin_set_sub_admin_access_v2_atomic(
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
  v_result record;
  v_capabilities text[] := coalesce(p_capabilities, '{}'::text[]);
  v_base_capabilities text[];
begin
  if pg_catalog.cardinality(v_capabilities) > 14
    or exists (
      select 1 from pg_catalog.unnest(v_capabilities) as capability
      where capability not in (
        'operations.read', 'operations.triage',
        'workers.read', 'workers.review', 'workers.manage',
        'transactions.read', 'finance.read', 'finance.reconcile',
        'finance.tax.manage', 'payouts.read', 'payouts.process', 'team.read',
        'workers.bonus.manage', 'workers.discipline.manage'
      )
    )
    or (select count(*) from pg_catalog.unnest(v_capabilities))
      <> (select count(distinct capability) from pg_catalog.unnest(v_capabilities) as capability)
    or ('operations.triage' = any(v_capabilities) and not ('operations.read' = any(v_capabilities)))
  then
    return query select false, 'INVALID_INPUT', p_target_id, null::text,
      null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  select coalesce(array_agg(capability order by ordinal), '{}'::text[])
  into v_base_capabilities
  from unnest(v_capabilities) with ordinality as item(capability, ordinal)
  where capability <> 'operations.triage';

  select * into v_result
  from public.admin_set_sub_admin_access_atomic(
    p_owner_id,
    p_target_id,
    p_action,
    v_base_capabilities,
    p_reason
  );

  if v_result.ok is distinct from true then
    return query select v_result.ok, v_result.error_code, v_result.user_id,
      v_result.status_out, v_result.role_out, v_result.capabilities_out,
      v_result.updated_at_out;
    return;
  end if;

  if p_action in ('grant', 'update') and 'operations.triage' = any(v_capabilities) then
    update public.admin_operator_accounts as operator_account
    set capabilities = array_append(operator_account.capabilities, 'operations.triage')
    where operator_account.user_id = p_target_id
      and not ('operations.triage' = any(operator_account.capabilities));
  end if;

  return query
  select v_result.ok, v_result.error_code, v_result.user_id,
    v_result.status_out, v_result.role_out,
    coalesce(operator_account.capabilities, v_result.capabilities_out),
    coalesce(operator_account.updated_at, v_result.updated_at_out)
  from (select 1) as singleton
  left join public.admin_operator_accounts as operator_account
    on operator_account.user_id = p_target_id;
end;
$function$;

commit;
