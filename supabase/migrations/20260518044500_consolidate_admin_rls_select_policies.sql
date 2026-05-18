-- =============================================================================
-- Migration: consolidate_admin_rls_select_policies
--
-- Why:
-- - Supabase performance advisor flags permissive admin `FOR ALL` policies
--   overlapping with participant/user `FOR SELECT` policies.
-- - Mobile production writes through Edge mobile-api/service_role; direct
--   authenticated DML grants remain revoked by 20260518032000.
-- - Keep read semantics intact while ensuring each table has only one SELECT
--   policy for the authenticated role.
-- =============================================================================

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
on public.profiles
for select
to authenticated
using (((select auth.uid()) = id) or private.is_admin());

drop policy if exists "Participants read jobs" on public.jobs;
create policy "Participants read jobs"
on public.jobs
for select
to authenticated
using (private.is_job_participant(id) or private.is_admin());

drop policy if exists "Participants read messages" on public.chat_messages;
create policy "Participants read messages"
on public.chat_messages
for select
to authenticated
using (private.is_job_participant(job_id) or private.is_admin());

drop policy if exists "Participants read job events" on public.job_events;
create policy "Participants read job events"
on public.job_events
for select
to authenticated
using (private.is_job_participant(job_id) or private.is_admin());

drop policy if exists "Participants read scope changes" on public.scope_change_requests;
create policy "Participants read scope changes"
on public.scope_change_requests
for select
to authenticated
using (private.is_job_participant(job_id) or private.is_admin());

drop policy if exists "Admins manage profiles" on public.profiles;
drop policy if exists "Admins insert profiles" on public.profiles;
drop policy if exists "Admins update profiles" on public.profiles;
drop policy if exists "Admins delete profiles" on public.profiles;
create policy "Admins insert profiles" on public.profiles for insert to authenticated with check (private.is_admin());
create policy "Admins update profiles" on public.profiles for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete profiles" on public.profiles for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage customer profiles" on public.customer_profiles;
drop policy if exists "Admins insert customer profiles" on public.customer_profiles;
drop policy if exists "Admins update customer profiles" on public.customer_profiles;
drop policy if exists "Admins delete customer profiles" on public.customer_profiles;
create policy "Admins insert customer profiles" on public.customer_profiles for insert to authenticated with check (private.is_admin());
create policy "Admins update customer profiles" on public.customer_profiles for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete customer profiles" on public.customer_profiles for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage worker profiles" on public.worker_profiles;
drop policy if exists "Admins insert worker profiles" on public.worker_profiles;
drop policy if exists "Admins update worker profiles" on public.worker_profiles;
drop policy if exists "Admins delete worker profiles" on public.worker_profiles;
create policy "Admins insert worker profiles" on public.worker_profiles for insert to authenticated with check (private.is_admin());
create policy "Admins update worker profiles" on public.worker_profiles for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete worker profiles" on public.worker_profiles for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage service categories" on public.service_categories;
drop policy if exists "Admins insert service categories" on public.service_categories;
drop policy if exists "Admins update service categories" on public.service_categories;
drop policy if exists "Admins delete service categories" on public.service_categories;
create policy "Admins insert service categories" on public.service_categories for insert to authenticated with check (private.is_admin());
create policy "Admins update service categories" on public.service_categories for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete service categories" on public.service_categories for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage service problems" on public.service_problems;
drop policy if exists "Admins insert service problems" on public.service_problems;
drop policy if exists "Admins update service problems" on public.service_problems;
drop policy if exists "Admins delete service problems" on public.service_problems;
create policy "Admins insert service problems" on public.service_problems for insert to authenticated with check (private.is_admin());
create policy "Admins update service problems" on public.service_problems for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete service problems" on public.service_problems for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage price baselines" on public.price_baselines;
drop policy if exists "Admins insert price baselines" on public.price_baselines;
drop policy if exists "Admins update price baselines" on public.price_baselines;
drop policy if exists "Admins delete price baselines" on public.price_baselines;
create policy "Admins insert price baselines" on public.price_baselines for insert to authenticated with check (private.is_admin());
create policy "Admins update price baselines" on public.price_baselines for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete price baselines" on public.price_baselines for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage jobs" on public.jobs;
drop policy if exists "Admins insert jobs" on public.jobs;
drop policy if exists "Admins update jobs" on public.jobs;
drop policy if exists "Admins delete jobs" on public.jobs;
create policy "Admins insert jobs" on public.jobs for insert to authenticated with check (private.is_admin());
create policy "Admins update jobs" on public.jobs for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete jobs" on public.jobs for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage broadcasts" on public.job_broadcasts;
drop policy if exists "Admins insert broadcasts" on public.job_broadcasts;
drop policy if exists "Admins update broadcasts" on public.job_broadcasts;
drop policy if exists "Admins delete broadcasts" on public.job_broadcasts;
create policy "Admins insert broadcasts" on public.job_broadcasts for insert to authenticated with check (private.is_admin());
create policy "Admins update broadcasts" on public.job_broadcasts for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete broadcasts" on public.job_broadcasts for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage messages" on public.chat_messages;
drop policy if exists "Admins insert messages" on public.chat_messages;
drop policy if exists "Admins update messages" on public.chat_messages;
drop policy if exists "Admins delete messages" on public.chat_messages;
create policy "Admins insert messages" on public.chat_messages for insert to authenticated with check (private.is_admin());
create policy "Admins update messages" on public.chat_messages for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete messages" on public.chat_messages for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage reviews" on public.reviews;
drop policy if exists "Admins insert reviews" on public.reviews;
drop policy if exists "Admins update reviews" on public.reviews;
drop policy if exists "Admins delete reviews" on public.reviews;
create policy "Admins insert reviews" on public.reviews for insert to authenticated with check (private.is_admin());
create policy "Admins update reviews" on public.reviews for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete reviews" on public.reviews for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage job events" on public.job_events;
drop policy if exists "Admins insert job events" on public.job_events;
drop policy if exists "Admins update job events" on public.job_events;
drop policy if exists "Admins delete job events" on public.job_events;
create policy "Admins insert job events" on public.job_events for insert to authenticated with check (private.is_admin());
create policy "Admins update job events" on public.job_events for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete job events" on public.job_events for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage scope changes" on public.scope_change_requests;
drop policy if exists "Admins insert scope changes" on public.scope_change_requests;
drop policy if exists "Admins update scope changes" on public.scope_change_requests;
drop policy if exists "Admins delete scope changes" on public.scope_change_requests;
create policy "Admins insert scope changes" on public.scope_change_requests for insert to authenticated with check (private.is_admin());
create policy "Admins update scope changes" on public.scope_change_requests for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete scope changes" on public.scope_change_requests for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage notifications" on public.notifications;
drop policy if exists "Admins insert notifications" on public.notifications;
drop policy if exists "Admins update notifications" on public.notifications;
drop policy if exists "Admins delete notifications" on public.notifications;
create policy "Admins insert notifications" on public.notifications for insert to authenticated with check (private.is_admin());
create policy "Admins update notifications" on public.notifications for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete notifications" on public.notifications for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage learning candidates" on public.learning_candidates;
drop policy if exists "Admins insert learning candidates" on public.learning_candidates;
drop policy if exists "Admins update learning candidates" on public.learning_candidates;
drop policy if exists "Admins delete learning candidates" on public.learning_candidates;
create policy "Admins insert learning candidates" on public.learning_candidates for insert to authenticated with check (private.is_admin());
create policy "Admins update learning candidates" on public.learning_candidates for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete learning candidates" on public.learning_candidates for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage learning rules" on public.learning_rules;
drop policy if exists "Admins insert learning rules" on public.learning_rules;
drop policy if exists "Admins update learning rules" on public.learning_rules;
drop policy if exists "Admins delete learning rules" on public.learning_rules;
create policy "Admins insert learning rules" on public.learning_rules for insert to authenticated with check (private.is_admin());
create policy "Admins update learning rules" on public.learning_rules for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete learning rules" on public.learning_rules for delete to authenticated using (private.is_admin());

drop policy if exists "Admins manage learning rule versions" on public.learning_rule_versions;
drop policy if exists "Admins insert learning rule versions" on public.learning_rule_versions;
drop policy if exists "Admins update learning rule versions" on public.learning_rule_versions;
drop policy if exists "Admins delete learning rule versions" on public.learning_rule_versions;
create policy "Admins insert learning rule versions" on public.learning_rule_versions for insert to authenticated with check (private.is_admin());
create policy "Admins update learning rule versions" on public.learning_rule_versions for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins delete learning rule versions" on public.learning_rule_versions for delete to authenticated using (private.is_admin());
