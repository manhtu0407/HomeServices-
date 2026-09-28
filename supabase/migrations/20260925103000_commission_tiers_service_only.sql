begin;

-- The platform fee is fixed at 15% (product decision 2026-09-25). A signed-in admin could
-- previously rewrite it through PostgREST, so writes are now service-role only; a rate
-- change needs a reviewed migration. Admins keep read access for the finance screens.
drop policy if exists "Admins manage worker commission tiers" on public.worker_commission_tiers;
drop policy if exists "Admins read worker commission tiers" on public.worker_commission_tiers;
create policy "Admins read worker commission tiers"
  on public.worker_commission_tiers for select
  to authenticated
  using (private.is_admin());

revoke all on table public.worker_commission_tiers from anon, authenticated;
grant select on table public.worker_commission_tiers to authenticated;
grant all on table public.worker_commission_tiers to service_role;

commit;
