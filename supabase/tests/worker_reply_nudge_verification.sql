-- @pillar id: P279-worker-reply-nudge-sql
-- @pillar invariant: A customer message left unanswered past the policy window in a stage where the worker is neither driving nor in the apartment produces exactly one reminder: one nudge row, one Kael line the customer sees and one inbox entry for the worker. A reply, a driving or on-site stage, or a message already reminded produces none, and no reminder ever opens a violation case
-- @pillar authority: governance/structures/do-not-build-now.md section 21 | Tu 2026-09-28: remind the worker before any slow-response penalty; both sides treated fairly
-- @pillar target: supabase/migrations/20260928125000_worker_reply_nudges.sql
-- @pillar layer: sql
-- @pillar siblings: P278-worker-reply-nudge-push, P267-no-penalty-without-admin-sql
-- @pillar mutation: Drop the worker-reply NOT EXISTS from claim_worker_reply_nudges; the answered job is claimed too and P279 raises P279_EXPECTED_ONE_REMINDER got 2 (observed)

begin;
set local statement_timeout = '60s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('c2300000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'reply-nudge-p230-' || n || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 2) as n;
-- 1 = worker, 2 = customer
update public.profiles set role = 'worker' where id = 'c2300000-0000-4000-8000-000000000001';

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values ('c2300000-0000-4000-8000-000000000001', array['plumbing']::public.service_type[], array['q7'], true, true, 4.9,
  10, 'approved', false, 'Reply Nudge Worker', '1990-01-01')
on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

-- 1 = waiting to depart (due), 2 = driving, 3 = on site, 4 = worker already replied, 5 = message too fresh
insert into public.jobs (id, customer_id, worker_id, service_type, description, status, quote_mode, final_price, created_at)
values
  ('c2300000-0000-4000-8000-000000000101', 'c2300000-0000-4000-8000-000000000002', 'c2300000-0000-4000-8000-000000000001',
    'plumbing', 'Reply nudge job 1', 'worker_matched', 'rfq', 300000, now()),
  ('c2300000-0000-4000-8000-000000000102', 'c2300000-0000-4000-8000-000000000002', 'c2300000-0000-4000-8000-000000000001',
    'plumbing', 'Reply nudge job 2', 'worker_on_way', 'rfq', 300000, now()),
  ('c2300000-0000-4000-8000-000000000103', 'c2300000-0000-4000-8000-000000000002', 'c2300000-0000-4000-8000-000000000001',
    'plumbing', 'Reply nudge job 3', 'repairing', 'rfq', 300000, now()),
  ('c2300000-0000-4000-8000-000000000104', 'c2300000-0000-4000-8000-000000000002', 'c2300000-0000-4000-8000-000000000001',
    'plumbing', 'Reply nudge job 4', 'worker_matched', 'rfq', 300000, now()),
  ('c2300000-0000-4000-8000-000000000105', 'c2300000-0000-4000-8000-000000000002', 'c2300000-0000-4000-8000-000000000001',
    'plumbing', 'Reply nudge job 5', 'worker_matched', 'rfq', 300000, now());

insert into public.chat_messages (job_id, sender_id, sender_role, content, created_at)
select job.id, 'c2300000-0000-4000-8000-000000000002', 'customer', 'Anh ơi mấy giờ anh tới?',
  case when job.id = 'c2300000-0000-4000-8000-000000000105' then now() - interval '2 minutes' else now() - interval '20 minutes' end
from public.jobs as job
where job.id::text like 'c2300000-0000-4000-8000-0000000001%';
insert into public.chat_messages (job_id, sender_id, sender_role, content, created_at)
values ('c2300000-0000-4000-8000-000000000104', 'c2300000-0000-4000-8000-000000000001', 'worker',
  'Khoảng 10 phút nữa anh tới nhé.', now() - interval '10 minutes');

do $nudge$
declare
  v_claimed integer;
  v_cases_before integer := (select count(*) from public.worker_violation_cases);
begin
  select count(*) into v_claimed from public.claim_worker_reply_nudges(50);
  if v_claimed <> 1 then
    raise exception 'P279_EXPECTED_ONE_REMINDER got %', v_claimed;
  end if;
  if not exists (select 1 from public.worker_reply_nudges where job_id = 'c2300000-0000-4000-8000-000000000101') then
    raise exception 'P279_DUE_JOB_NOT_NUDGED';
  end if;
  if exists (select 1 from public.worker_reply_nudges where job_id = 'c2300000-0000-4000-8000-000000000104') then
    raise exception 'P279_ANSWERED_JOB_NUDGED';
  end if;
  if exists (select 1 from public.worker_reply_nudges
             where job_id in ('c2300000-0000-4000-8000-000000000102', 'c2300000-0000-4000-8000-000000000103')) then
    raise exception 'P279_DRIVING_OR_ON_SITE_NUDGED';
  end if;
  if (select count(*) from public.chat_messages
      where job_id = 'c2300000-0000-4000-8000-000000000101' and sender_role = 'kael') <> 1 then
    raise exception 'P279_CUSTOMER_NOT_TOLD';
  end if;
  if (select count(*) from public.notifications
      where user_id = 'c2300000-0000-4000-8000-000000000001' and event_type = 'worker_reply_nudge') <> 1 then
    raise exception 'P279_WORKER_INBOX_MISSING';
  end if;

  select count(*) into v_claimed from public.claim_worker_reply_nudges(50);
  if v_claimed <> 0 then
    raise exception 'P279_REMINDED_TWICE';
  end if;
  if (select count(*) from public.worker_violation_cases) <> v_cases_before then
    raise exception 'P279_REMINDER_OPENED_A_CASE';
  end if;
end;
$nudge$;

rollback;
