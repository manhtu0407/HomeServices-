-- P12 follow-up: consolidate customer cancellation SELECT RLS into one
-- policy and wrap auth calls for Supabase performance advisor.

begin;

drop policy if exists "Customers view own customer cancellations"
  on public.customer_cancellation_records;
drop policy if exists "Workers view assigned customer cancellations"
  on public.customer_cancellation_records;
drop policy if exists "Admins view customer cancellations"
  on public.customer_cancellation_records;
drop policy if exists "Admins manage customer cancellations"
  on public.customer_cancellation_records;

drop policy if exists "Participants and admins view customer cancellations"
  on public.customer_cancellation_records;
create policy "Participants and admins view customer cancellations"
  on public.customer_cancellation_records
  for select
  to authenticated
  using (
    customer_id = (select auth.uid()) or
    worker_id = (select auth.uid()) or
    (select private.is_admin())
  );

drop policy if exists "Admins insert customer cancellations"
  on public.customer_cancellation_records;
create policy "Admins insert customer cancellations"
  on public.customer_cancellation_records
  for insert
  to authenticated
  with check ((select private.is_admin()));

drop policy if exists "Admins update customer cancellations"
  on public.customer_cancellation_records;
create policy "Admins update customer cancellations"
  on public.customer_cancellation_records
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "Admins delete customer cancellations"
  on public.customer_cancellation_records;
create policy "Admins delete customer cancellations"
  on public.customer_cancellation_records
  for delete
  to authenticated
  using ((select private.is_admin()));

commit;
