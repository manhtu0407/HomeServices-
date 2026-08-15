begin;

revoke execute on function public.get_customer_profile_insights_aggregate(uuid)
  from authenticated;

comment on function public.get_customer_profile_insights_aggregate(uuid) is
  'Service-owned Customer profile aggregate invoked by mobile-api after actor authorization.';

commit;
