begin;

drop function if exists public.get_worker_earnings_summary(uuid, timestamptz, timestamptz);

revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric) to service_role;

commit;
