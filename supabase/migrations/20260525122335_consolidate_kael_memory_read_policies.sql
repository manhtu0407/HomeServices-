-- P7 verification cleanup: remove multiple permissive SELECT policies from P6 memory tables.
-- Same visibility, fewer RLS policy evaluations: owner OR admin can read.

drop policy if exists "Customers view own kael memory" on public.customer_kael_memory;
drop policy if exists "Admins view customer kael memory" on public.customer_kael_memory;
drop policy if exists "Customer or admin reads customer kael memory" on public.customer_kael_memory;
create policy "Customer or admin reads customer kael memory"
  on public.customer_kael_memory
  for select
  to authenticated
  using (((select auth.uid()) = customer_id) or private.is_admin());

drop policy if exists "Workers view own kael memory" on public.worker_kael_memory;
drop policy if exists "Admins view worker kael memory" on public.worker_kael_memory;
drop policy if exists "Worker or admin reads worker kael memory" on public.worker_kael_memory;
create policy "Worker or admin reads worker kael memory"
  on public.worker_kael_memory
  for select
  to authenticated
  using (((select auth.uid()) = worker_id) or private.is_admin());

comment on policy "Customer or admin reads customer kael memory" on public.customer_kael_memory is
  'P7 cleanup of P6 memory RLS: consolidate owner/admin SELECT to avoid multiple permissive policies.';
comment on policy "Worker or admin reads worker kael memory" on public.worker_kael_memory is
  'P7 cleanup of P6 memory RLS: consolidate owner/admin SELECT to avoid multiple permissive policies.';
