-- The Supabase performance advisor flags three things, and read semantics stay identical for each:
-- - Two Kael incident read policies call auth.uid() once per row instead of once per statement.
-- - Four tables carry several permissive SELECT policies for `authenticated`, and every one of them
--   is evaluated for every row. Each table now has one SELECT policy OR-ing the same conditions.
-- - kael_permission_audit has two identical (actor_id, created_at desc) indexes.

begin;

drop policy if exists "Job participants read Kael incidents" on public.kael_job_incidents;
create policy "Job participants read Kael incidents"
on public.kael_job_incidents
for select
to authenticated
using (
  private.is_admin() or exists (
    select 1 from public.jobs job
    where job.id = kael_job_incidents.job_id
      and ((select auth.uid()) = job.customer_id or (select auth.uid()) = job.worker_id)
  )
);

drop policy if exists "Job participants read Kael incident events" on public.kael_job_incident_events;
create policy "Job participants read Kael incident events"
on public.kael_job_incident_events
for select
to authenticated
using (
  private.is_admin() or exists (
    select 1 from public.jobs job
    where job.id = kael_job_incident_events.job_id
      and ((select auth.uid()) = job.customer_id or (select auth.uid()) = job.worker_id)
  )
);

drop policy if exists "Admins read customer favorite workers" on public.customer_favorite_workers;
drop policy if exists "Customers read own favorite workers" on public.customer_favorite_workers;
create policy "Customers and admins read favorite workers"
on public.customer_favorite_workers
for select
to authenticated
using (customer_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Admins read matching preferences" on public.job_matching_preferences;
drop policy if exists "Customers read own matching preferences" on public.job_matching_preferences;
create policy "Customers and admins read matching preferences"
on public.job_matching_preferences
for select
to authenticated
using (customer_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Admins read worker candidates" on public.job_worker_candidates;
drop policy if exists "Customers read own worker candidates" on public.job_worker_candidates;
drop policy if exists "Workers read own candidacies" on public.job_worker_candidates;
create policy "Participants and admins read worker candidates"
on public.job_worker_candidates
for select
to authenticated
using (
  worker_id = (select auth.uid())
  or exists (
    select 1 from public.jobs j
    where j.id = job_worker_candidates.job_id and j.customer_id = (select auth.uid())
  )
  or private.is_admin()
);

drop policy if exists "Admins view voice transcript" on public.kael_voice_transcript;
drop policy if exists "Users view own voice transcript" on public.kael_voice_transcript;
create policy "Owners and admins view voice transcript"
on public.kael_voice_transcript
for select
to authenticated
using ((select auth.uid()) = user_id or private.is_admin());

drop index if exists public.kael_permission_audit_actor_created_idx;

commit;
