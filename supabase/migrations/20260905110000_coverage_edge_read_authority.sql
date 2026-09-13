begin;

revoke execute on function public.get_service_coverage_readiness(uuid,public.service_type,text)
from public, anon, authenticated;
grant execute on function public.get_service_coverage_readiness(uuid,public.service_type,text)
to service_role;

commit;
