-- @pillar id: P267-no-penalty-without-admin-sql
-- @pillar invariant: The violation detectors only file proposals — once each, however often they run — and never debit or forfeit points, freeze, strike, ban or suspend a worker; the only automatic effect is the level-1 matching down-rank, which disappears when an admin dismisses the case
-- @pillar authority: governance/structures/do-not-build-now.md section 21 (no autonomous worker punishment) | Tu 2026-09-25: system proposes, admin confirms with one tap
-- @pillar target: supabase/migrations/20260928123000_violation_detectors.sql
-- @pillar layer: sql
-- @pillar siblings: P268-appeal-restores-exactly-sql, P256-suspension-blocks-matching-sql
-- @pillar mutation: Make private.propose_violation_case insert a penalty_debit point entry for level 2 and above; the detector run debits points and P267 raises P267_DETECTOR_PUNISHED (observed)

begin;
set local statement_timeout = '60s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,phone,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('c2180000-0000-4000-8000-000000000001','authenticated','authenticated','discipline-p218-worker@example.test','+84900218001',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2180000-0000-4000-8000-000000000002','authenticated','authenticated','discipline-p218-customer@example.test','+84900218002',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2180000-0000-4000-8000-000000000003','authenticated','authenticated','discipline-p218-admin@example.test',null,
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2180000-0000-4000-8000-000000000004','authenticated','authenticated','discipline-p218-selfbook@example.test',null,
    '{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='worker', phone='+84900218001' where id='c2180000-0000-4000-8000-000000000001';
update public.profiles set phone='+84900218002' where id='c2180000-0000-4000-8000-000000000002';
update public.profiles set phone='0900218001' where id='c2180000-0000-4000-8000-000000000004';
update public.profiles set role='admin' where id='c2180000-0000-4000-8000-000000000003';

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'c2180000-0000-4000-8000-000000000001', array['plumbing']::public.service_type[], array['q7'],
  true, true, 4.9, 10, 'approved', false, 'Discipline Fixture Worker', '1990-01-01'
) on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

insert into public.worker_ambassador_point_entries (worker_id, entry_kind, points_milli, actor_id, reason, idempotency_key)
values ('c2180000-0000-4000-8000-000000000001', 'admin_correction', 30000,
  'c2180000-0000-4000-8000-000000000003', 'Verification fixture balance', 'p218-fixture');

insert into public.jobs (id, customer_id, worker_id, service_type, description, status, quote_mode,
  scheduled_at, arrived_at, final_price, created_at)
values
  ('c2180000-0000-4000-8000-000000000101', 'c2180000-0000-4000-8000-000000000002', 'c2180000-0000-4000-8000-000000000001',
    'plumbing', 'Late arrival fixture', 'arrived', 'rfq', now() - interval '2 hours', now() - interval '1 hour', 300000, now()),
  ('c2180000-0000-4000-8000-000000000102', 'c2180000-0000-4000-8000-000000000002', 'c2180000-0000-4000-8000-000000000001',
    'plumbing', 'No-show fixture', 'worker_matched', 'rfq', now() - interval '2 hours', null, null, now());
insert into public.jobs (id, customer_id, worker_id, service_type, description, status, final_price,
  gross_amount, platform_fee, worker_net, display_code, created_at, paid_at)
values ('c2180000-0000-4000-8000-000000000103', 'c2180000-0000-4000-8000-000000000004',
  'c2180000-0000-4000-8000-000000000001', 'plumbing', 'Self booking fixture', 'paid', 300000, 300000,
  45000, 255000, 'DSC-0001', now(), now());

insert into public.worker_cancellation_requests (job_id, worker_id, reason, reason_category)
values ('c2180000-0000-4000-8000-000000000101', 'c2180000-0000-4000-8000-000000000001', 'Không lý do', 'no_reason');

insert into public.chat_messages (id, job_id, sender_id, sender_role, content) values
  ('c2180000-0000-4000-8000-000000000201', 'c2180000-0000-4000-8000-000000000101', 'c2180000-0000-4000-8000-000000000001', 'worker', 'redacted'),
  ('c2180000-0000-4000-8000-000000000202', 'c2180000-0000-4000-8000-000000000101', 'c2180000-0000-4000-8000-000000000001', 'worker', 'redacted');
insert into public.chat_guard_redaction_evidence (job_id, message_id, sender_id, sender_role, original_body, matched_rules) values
  ('c2180000-0000-4000-8000-000000000101', 'c2180000-0000-4000-8000-000000000201', 'c2180000-0000-4000-8000-000000000001', 'worker', 'Goi em 0900 qua zalo', array['zalo']),
  ('c2180000-0000-4000-8000-000000000101', 'c2180000-0000-4000-8000-000000000202', 'c2180000-0000-4000-8000-000000000001', 'worker', 'Khoi qua app nhe', array['off_app']);

do $detectors$
declare
  v_worker constant uuid := 'c2180000-0000-4000-8000-000000000001';
  v_state record;
  v_result jsonb;
begin
  v_result := private.detect_worker_violations();
  if (v_result->>'proposed')::integer <> 5
     or (select count(*) from public.worker_violation_cases where worker_id = v_worker and status = 'proposed') <> 5
     or not exists (select 1 from public.worker_violation_cases where violation_code = 'late_arrival')
     or not exists (select 1 from public.worker_violation_cases where violation_code = 'no_show')
     or not exists (select 1 from public.worker_violation_cases where violation_code = 'cancel_after_accept_no_reason')
     or not exists (select 1 from public.worker_violation_cases where violation_code = 'off_app_dealing')
     or not exists (select 1 from public.worker_violation_cases where violation_code = 'self_booking') then
    raise exception 'P267_DETECTORS_INCOMPLETE: %', v_result;
  end if;

  if private.worker_ambassador_points_balance(v_worker) <> 30000
     or exists (select 1 from public.worker_ambassador_point_entries where worker_id = v_worker and case_id is not null)
     or exists (select 1 from public.worker_discipline_entries where worker_id = v_worker and entry_kind <> 'matching_deprioritize')
     or (select is_suspended from public.worker_profiles where id = v_worker) then
    raise exception 'P267_DETECTOR_PUNISHED';
  end if;

  select * into v_state from private.worker_discipline_state(v_worker);
  if v_state.banned or v_state.network_frozen_until is not null or v_state.strikes_12m <> 0 or v_state.withdrawal_hold then
    raise exception 'P267_DETECTOR_PUNISHED';
  end if;
  -- An open serious case pauses redemption until its decision deadline; it is not a penalty.
  if v_state.redemption_frozen_until is null
     or v_state.redemption_frozen_until > now() + interval '73 hours' then
    raise exception 'P267_PENDING_FREEZE_WRONG: %', v_state.redemption_frozen_until;
  end if;
  if not exists (select 1 from public.list_matching_deprioritized_workers(array[v_worker])) then
    raise exception 'P267_L1_SIGNAL_MISSING';
  end if;

  v_result := private.detect_worker_violations();
  if (v_result->>'proposed')::integer <> 0 then
    raise exception 'P267_DUPLICATE_PROPOSALS: %', v_result;
  end if;

  perform public.admin_decide_violation_case('c2180000-0000-4000-8000-000000000003',
    (select id from public.worker_violation_cases where violation_code = 'late_arrival'),
    'dismiss', 'Kẹt xe có xác nhận từ khách hàng.');
  if exists (select 1 from public.list_matching_deprioritized_workers(array[v_worker])) then
    raise exception 'P267_DISMISSED_SIGNAL_REMAINS';
  end if;
end;
$detectors$;

rollback;
