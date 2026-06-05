-- ============================================================
-- Combine customer_kael_feedback SELECT RLS policies.
--
-- Supabase advisor flags multiple permissive policies for the same
-- table/role/action because Postgres evaluates each matching policy.
-- This keeps the same access shape with a single policy.
-- ============================================================

begin;

drop policy if exists "Customers read own Kael feedback"
  on public.customer_kael_feedback;
drop policy if exists "Admins read Kael feedback"
  on public.customer_kael_feedback;

drop policy if exists "Customers or admins read Kael feedback"
  on public.customer_kael_feedback;
create policy "Customers or admins read Kael feedback"
  on public.customer_kael_feedback
  for select
  to authenticated
  using (
    customer_id = (select auth.uid())
    or (select private.is_admin())
  );

commit;
