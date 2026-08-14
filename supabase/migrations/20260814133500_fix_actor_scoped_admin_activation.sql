create or replace function public.activate_admin_operator_atomic(p_actor_id uuid)
returns table(
  ok boolean,
  error_code text,
  role_out public.user_role,
  capabilities_out text[],
  activated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provisioning public.admin_operator_provisioning%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce((select auth.role()), ''::text) <> 'service_role'
     and p_actor_id is distinct from (select auth.uid()) then
    return query select false, 'ACTOR_MISMATCH', null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  select provisioning.* into v_provisioning
  from public.admin_operator_provisioning as provisioning
  where provisioning.user_id = p_actor_id
  for update;
  if not found then
    return query select false, 'PROVISIONING_NOT_FOUND', null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;
  if v_provisioning.status = 'active' then
    return query select true, null::text, 'admin_operator'::public.user_role,
      v_provisioning.capabilities, v_provisioning.activated_at;
    return;
  end if;
  if v_provisioning.status <> 'pending_password_change' then
    return query select false, 'PROVISIONING_NOT_READY', null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  insert into public.admin_operator_accounts (
    user_id, baseline_role, capabilities, status, granted_by, last_changed_by
  ) values (
    p_actor_id, 'customer'::public.user_role, v_provisioning.capabilities,
    'active', v_provisioning.created_by, v_provisioning.created_by
  ) on conflict (user_id) do update
  set capabilities = excluded.capabilities,
      status = 'active',
      last_changed_by = excluded.last_changed_by,
      revoked_at = null;

  update public.profiles
  set role = 'admin_operator'::public.user_role
  where id = p_actor_id;

  update public.admin_operator_provisioning
  set status = 'active', failure_code = null, activated_at = v_now
  where id = v_provisioning.id;

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id, 'customer', 'admin_operator_activation', 'activate',
    'admin_operator', 'allow', 'first_password_changed',
    pg_catalog.jsonb_build_object(
      'provisioning_id', v_provisioning.id,
      'capability_count', pg_catalog.cardinality(v_provisioning.capabilities)
    )
  );

  return query select true, null::text, 'admin_operator'::public.user_role,
    v_provisioning.capabilities, v_now;
end;
$function$;

revoke all on function public.activate_admin_operator_atomic(uuid)
  from public, anon, authenticated;
grant execute on function public.activate_admin_operator_atomic(uuid)
  to authenticated, service_role;
