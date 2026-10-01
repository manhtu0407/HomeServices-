-- @pillar id: P289-late-arrival-window-sql
-- @pillar invariant: A worker who arrives inside the booked window is never proposed as late; lateness counts from the window end plus the grace minutes, and only a job with no recorded window falls back to its start time
-- @pillar authority: governance/structures/do-not-build-now.md §21 | OCR review 2026-09-28: the detector measured from the window start and would deprioritize on-time workers
-- @pillar target: supabase/migrations/20260928123000_violation_detectors.sql
-- @pillar layer: sql
-- @pillar siblings: P267-no-penalty-without-admin-sql
-- @pillar mutation: Make private.job_arrival_deadline return p_scheduled_at only; the in-window arrival is proposed as late and P289 raises P289_IN_WINDOW_FLAGGED

begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('c2890000-0000-4000-8000-000000000001','authenticated','authenticated','late-p289-worker@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2890000-0000-4000-8000-000000000002','authenticated','authenticated','late-p289-customer@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role = 'worker' where id = 'c2890000-0000-4000-8000-000000000001';

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'c2890000-0000-4000-8000-000000000001', array['plumbing']::public.service_type[], array['q7'],
  true, true, 4.9, 10, 'approved', false, 'Late Window Fixture Worker', '1990-01-01'
) on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

-- Every window opens yesterday at 10:00 in Ho Chi Minh City, so none crosses midnight.
create temp table p289_clock on commit drop as
select (((now() at time zone 'Asia/Ho_Chi_Minh')::date - 1) + time '10:00') at time zone 'Asia/Ho_Chi_Minh' as window_start;

-- 101: 10:00-12:00 window, arrived 11:30 (inside).  102: 10:00-11:00 window, arrived 11:30 (30 min
-- past the end).  103: no recorded window, arrived 11:00 (an hour after the start).
insert into public.jobs (id, customer_id, worker_id, service_type, description, status, quote_mode, scheduled_at, arrived_at)
select id::uuid, 'c2890000-0000-4000-8000-000000000002', 'c2890000-0000-4000-8000-000000000001',
  'plumbing', 'Late window fixture', 'arrived', 'rfq', clock.window_start, clock.window_start + arrival
from p289_clock as clock
cross join (values
  ('c2890000-0000-4000-8000-000000000101', interval '90 minutes'),
  ('c2890000-0000-4000-8000-000000000102', interval '90 minutes'),
  ('c2890000-0000-4000-8000-000000000103', interval '60 minutes')
) as fixture(id, arrival);

insert into public.kael_chat_sessions (customer_id, service_type, job_id, safe_metadata)
select 'c2890000-0000-4000-8000-000000000002', 'plumbing', fixture.job_id::uuid,
  pg_catalog.jsonb_build_object('schedule_window', pg_catalog.jsonb_build_object(
    'date', to_char(clock.window_start at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
    'start', '10:00', 'end', fixture.window_end, 'time_zone', 'Asia/Ho_Chi_Minh'))
from p289_clock as clock
cross join (values
  ('c2890000-0000-4000-8000-000000000101', '12:00'),
  ('c2890000-0000-4000-8000-000000000102', '11:00')
) as fixture(job_id, window_end);

do $late$
begin
  perform private.detect_worker_violations();

  if exists (select 1 from public.worker_violation_cases where dedupe_key = 'late:c2890000-0000-4000-8000-000000000101') then
    raise exception 'P289_IN_WINDOW_FLAGGED';
  end if;
  if not exists (select 1 from public.worker_violation_cases where dedupe_key = 'late:c2890000-0000-4000-8000-000000000102') then
    raise exception 'P289_PAST_WINDOW_MISSED';
  end if;
  if not exists (select 1 from public.worker_violation_cases where dedupe_key = 'late:c2890000-0000-4000-8000-000000000103') then
    raise exception 'P289_NO_WINDOW_FALLBACK_MISSED';
  end if;
end;
$late$;

rollback;
