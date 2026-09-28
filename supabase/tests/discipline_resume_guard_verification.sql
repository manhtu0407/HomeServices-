-- @pillar id: P291-dismissal-keeps-other-suspension-sql
-- @pillar invariant: Dismissing one harm case lifts the worker's suspension only when nothing else holds it; while a second open harm case keeps the worker suspended pending review, the worker stays out of matching, and the suspension lifts once the last hold ends
-- @pillar authority: governance/RULES.md #7 | OCR review 2026-09-28: a dismissal reinstated a worker another case still held
-- @pillar target: supabase/migrations/20260928122000_worker_discipline_decisions.sql
-- @pillar layer: sql
-- @pillar siblings: P268-appeal-restores-exactly-sql
-- @pillar mutation: Make private.worker_may_resume return true; dismissing the first case reinstates the worker and P291 raises P291_REINSTATED_WHILE_HELD

begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('c2910000-0000-4000-8000-000000000001','authenticated','authenticated','resume-p291-worker@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2910000-0000-4000-8000-000000000002','authenticated','authenticated','resume-p291-customer@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2910000-0000-4000-8000-000000000003','authenticated','authenticated','resume-p291-admin@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role = 'worker' where id = 'c2910000-0000-4000-8000-000000000001';
update public.profiles set role = 'admin' where id = 'c2910000-0000-4000-8000-000000000003';

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'c2910000-0000-4000-8000-000000000001', array['plumbing']::public.service_type[], array['q7'],
  true, true, 4.9, 10, 'approved', false, 'Resume Guard Fixture Worker', '1990-01-01'
) on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

do $resume$
declare
  v_worker constant uuid := 'c2910000-0000-4000-8000-000000000001';
  v_admin constant uuid := 'c2910000-0000-4000-8000-000000000003';
  v_first uuid;
  v_second uuid;
begin
  v_first := private.propose_violation_case(v_worker, 'c2910000-0000-4000-8000-000000000002', null, 'theft',
    'customer_report', 'c2910000-0000-4000-8000-000000000002', 'Mất đồ sau khi thợ rời đi', '{}'::jsonb, 'p291:first');
  v_second := private.propose_violation_case(v_worker, 'c2910000-0000-4000-8000-000000000002', null, 'violence',
    'customer_report', 'c2910000-0000-4000-8000-000000000002', 'Thợ có hành vi bạo lực', '{}'::jsonb, 'p291:second');
  perform public.admin_suspend_worker_for_case(v_admin, v_first, 'Tạm ngừng trong lúc xác minh vụ mất đồ');
  perform public.admin_suspend_worker_for_case(v_admin, v_second, 'Tạm ngừng trong lúc xác minh vụ bạo lực');

  perform public.admin_decide_violation_case(v_admin, v_first, 'dismiss', 'Không đủ bằng chứng cho vụ mất đồ');
  if not (select is_suspended from public.worker_profiles where id = v_worker) then
    raise exception 'P291_REINSTATED_WHILE_HELD';
  end if;

  perform public.admin_decide_violation_case(v_admin, v_second, 'dismiss', 'Không đủ bằng chứng cho vụ bạo lực');
  if (select is_suspended from public.worker_profiles where id = v_worker) then
    raise exception 'P291_STILL_SUSPENDED_AFTER_LAST_HOLD';
  end if;
end;
$resume$;

rollback;
