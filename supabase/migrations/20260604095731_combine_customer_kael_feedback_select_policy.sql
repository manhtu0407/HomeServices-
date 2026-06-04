-- ============================================================
-- Combine customer_kael_feedback SELECT RLS policies.
--
-- Supabase advisor flags multiple permissive policies for the same
-- table/role/action because Postgres must evaluate each policy for every
-- matching query. Production already has this combined policy state; this
-- migration records the convergence in source/history and applies it to
-- staging/fresh databases.
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
