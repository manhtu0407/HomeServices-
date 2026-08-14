revoke all on function public.get_admin_operator_activation_status(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admin_operator_activation_status(uuid)
  to service_role;

revoke all on function public.activate_admin_operator_atomic(uuid)
  from public, anon, authenticated;
grant execute on function public.activate_admin_operator_atomic(uuid)
  to service_role;
