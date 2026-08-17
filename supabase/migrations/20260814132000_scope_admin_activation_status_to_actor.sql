create or replace function public.get_admin_operator_activation_status(p_actor_id uuid)
returns table(email text, full_name text, status text, capabilities text[])
language sql
stable
security definer
set search_path = ''
as $function$
  select
    provisioning.email,
    provisioning.full_name,
    provisioning.status,
    provisioning.capabilities
  from public.admin_operator_provisioning as provisioning
  where provisioning.user_id = p_actor_id
    and (
      p_actor_id = (select auth.uid())
      or (select auth.role()) = 'service_role'
    )
  limit 1;
$function$;

revoke all on function public.get_admin_operator_activation_status(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_operator_activation_status(uuid)
  to authenticated, service_role;
