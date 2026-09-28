begin;

-- The platform fee is fixed at 15% (product decision 2026-09-25). A signed-in admin could
-- previously rewrite it through PostgREST, so writes are now service-role only; a rate
-- change needs a reviewed migration. Table privileges are what enforce this: the existing
-- admin policy still lets admins read for the finance screens, but without insert, update or
-- delete privileges every write from a signed-in account fails with 42501.

revoke all on table public.worker_commission_tiers from anon, authenticated;
grant select on table public.worker_commission_tiers to authenticated;
grant all on table public.worker_commission_tiers to service_role;

commit;
