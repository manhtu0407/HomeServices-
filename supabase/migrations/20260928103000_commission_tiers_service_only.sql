begin;

-- The platform fee is fixed at 15% (product decision 2026-09-25). A signed-in admin could
-- previously rewrite it through PostgREST, so writes are now service-role only; a rate
-- change needs a reviewed migration. Table privileges are what enforce this: the existing
-- admin policy still lets admins read for the finance screens, but without insert, update or
-- delete privileges every write from a signed-in account fails with 42501.

-- Normalize before locking: an earlier admin edit or a higher tier would otherwise keep freezing
-- a non-15% rate into new payment intents with no way left to repair it from the app.
update public.worker_commission_tiers
set commission_rate_bps = 1500, is_active = true, updated_at = now()
where level = 1 and (commission_rate_bps <> 1500 or not is_active);
update public.worker_commission_tiers
set is_active = false, updated_at = now()
where level <> 1 and is_active;

revoke all on table public.worker_commission_tiers from anon, authenticated;
grant select on table public.worker_commission_tiers to authenticated;
grant all on table public.worker_commission_tiers to service_role;

commit;
