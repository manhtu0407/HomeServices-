-- Keep the public-schema aggregate view subject to the querying role's RLS.
alter view public.kael_estimate_accuracy
  set (security_invoker = true);

revoke all on public.kael_estimate_accuracy from public;
revoke all on public.kael_estimate_accuracy from anon;
revoke all on public.kael_estimate_accuracy from authenticated;
grant select on public.kael_estimate_accuracy to service_role;
