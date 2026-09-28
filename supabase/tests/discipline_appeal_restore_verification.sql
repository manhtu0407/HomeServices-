-- @pillar id: P219-appeal-restores-exactly-sql
-- @pillar invariant: A confirmed level-3 case forfeits every unredeemed point, ends the link to that customer, freezes redemption and the network tier and adds a strike; an overturned appeal restores exactly those points, the link, the tier and the strike. A second strike bans, a banned worker may still withdraw earned income unless a harm case holds it for the policy period (longer only with a recorded authority reference), a harm case can suspend at once and is lifted if dismissed, a verified harm case blocks the recorded CCCD, phone and sign-in email so none of them can be used again, and a fabricated report locks the reporter
-- @pillar authority: governance/RULES.md #7 | Tu 2026-09-25: 5-level discipline, 7-day appeal, 100% restore, never deduct earned income
-- @pillar target: supabase/migrations/20260925122000_worker_discipline_decisions.sql
-- @pillar layer: sql
-- @pillar siblings: P218-no-penalty-without-admin-sql, P211-ambassador-accrual-sql
-- @pillar mutation: Skip the appeal_restore point entry in admin_decide_violation_appeal; the overturned case leaves the balance at zero and P219 raises P219_POINTS_NOT_RESTORED

begin;
set local statement_timeout = '60s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('c2190000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'discipline-p219-' || n || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 5) as n;
-- 1 = worker, 2 = customer, 3 = admin, 4 = second worker, 5 = customer who fabricates
update public.profiles set role = 'worker'
where id in ('c2190000-0000-4000-8000-000000000001', 'c2190000-0000-4000-8000-000000000004');
update public.profiles set role = 'admin' where id = 'c2190000-0000-4000-8000-000000000003';

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
)
select id, array['plumbing']::public.service_type[], array['q7'], true, true, 4.9, 10, 'approved', false,
  'Appeal Fixture Worker', '1990-01-01'
from (values ('c2190000-0000-4000-8000-000000000001'::uuid), ('c2190000-0000-4000-8000-000000000004'::uuid)) as w(id)
on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

insert into public.worker_payout_methods (worker_id, bank_key, bank_name, account_holder_name, bank_account,
  bank_account_masked, is_default, status, reviewed_at, reviewed_by)
values ('c2190000-0000-4000-8000-000000000004', 'vietcombank', 'Vietcombank', 'APPEAL FIXTURE WORKER', '12345678',
  '**** 5678', true, 'verified', now(), 'c2190000-0000-4000-8000-000000000003');

insert into public.worker_ambassador_point_entries (worker_id, entry_kind, points_milli, actor_id, reason, idempotency_key)
values ('c2190000-0000-4000-8000-000000000001', 'admin_correction', 30000,
  'c2190000-0000-4000-8000-000000000003', 'Verification fixture balance', 'p219-fixture');

insert into public.customer_worker_links (customer_id, worker_id, source, program_version_id, expires_at)
values ('c2190000-0000-4000-8000-000000000002', 'c2190000-0000-4000-8000-000000000001', 'invite_code',
  (private.current_ambassador_program()).id, now() + interval '11 months');

insert into public.jobs (id, customer_id, worker_id, service_type, description, status, quote_mode, created_at)
select ('c2190000-0000-4000-8000-00000000010' || n)::uuid,
  case when n = 5 then 'c2190000-0000-4000-8000-000000000005'::uuid else 'c2190000-0000-4000-8000-000000000002'::uuid end,
  case when n in (3, 4) then 'c2190000-0000-4000-8000-000000000004'::uuid else 'c2190000-0000-4000-8000-000000000001'::uuid end,
  'plumbing', 'Appeal fixture job ' || n, 'worker_on_way', 'rfq', now()
from generate_series(1, 6) as n;

do $appeal$
declare
  v_worker constant uuid := 'c2190000-0000-4000-8000-000000000001';
  v_admin constant uuid := 'c2190000-0000-4000-8000-000000000003';
  v_report jsonb;
  v_case uuid;
  v_state record;
begin
  v_report := public.create_worker_report('c2190000-0000-4000-8000-000000000002',
    'c2190000-0000-4000-8000-000000000101', 'off_app_dealing', 'Thợ rủ tôi chuyển khoản riêng, không qua app.');
  v_case := (v_report->>'case_id')::uuid;
  if (v_report->>'level')::integer <> 3 then raise exception 'P219_WRONG_LEVEL'; end if;

  perform public.admin_decide_violation_case(v_admin, v_case, 'confirm', 'Xác nhận qua lời khai và lịch sử chat đã lưu.');
  select * into v_state from private.worker_discipline_state(v_worker);
  if private.worker_ambassador_points_balance(v_worker) <> 0
     or exists (select 1 from public.customer_worker_links where worker_id = v_worker and ended_at is null)
     or v_state.redemption_frozen_until < now() + interval '89 days'
     or v_state.network_frozen_until < now() + interval '89 days'
     or v_state.strikes_12m <> 1 or v_state.banned then
    raise exception 'P219_L3_CONSEQUENCES_WRONG: % %', private.worker_ambassador_points_balance(v_worker), v_state;
  end if;
  if not exists (select 1 from public.notifications where user_id = v_worker and event_type = 'violation_confirmed') then
    raise exception 'P219_WORKER_NOT_NOTIFIED';
  end if;

  begin
    perform public.submit_violation_appeal(v_worker, v_case, 'ngắn', '{}');
    raise exception 'P219_SHORT_APPEAL_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.submit_violation_appeal(v_worker, v_case, 'Tôi chỉ gửi số tổng đài NestScout cho khách, không rủ giao dịch riêng.',
      array['appeals/' || gen_random_uuid() || '/' || v_case || '/' || gen_random_uuid() || '.jpg']);
    raise exception 'P219_FOREIGN_EVIDENCE_PATH_ACCEPTED';
  exception when sqlstate '22023' then null;
  end;
  perform public.submit_violation_appeal(v_worker, v_case, 'Tôi chỉ gửi số tổng đài NestScout cho khách, không rủ giao dịch riêng.',
    array['appeals/' || v_worker || '/' || v_case || '/' || gen_random_uuid() || '.jpg']);

  perform public.admin_decide_violation_appeal(v_admin, v_case, 'overturned', 'Bằng chứng cho thấy số điện thoại là tổng đài NestScout.');
  select * into v_state from private.worker_discipline_state(v_worker);
  if private.worker_ambassador_points_balance(v_worker) <> 30000 then
    raise exception 'P219_POINTS_NOT_RESTORED: %', private.worker_ambassador_points_balance(v_worker);
  end if;
  if not exists (select 1 from public.customer_worker_links
                 where worker_id = v_worker and customer_id = 'c2190000-0000-4000-8000-000000000002' and ended_at is null)
     or v_state.redemption_frozen_until is not null or v_state.network_frozen_until is not null
     or v_state.strikes_12m <> 0 then
    raise exception 'P219_NOT_FULLY_RESTORED: %', v_state;
  end if;
  if not exists (select 1 from public.notifications where user_id = v_worker and event_type = 'violation_appeal_overturned') then
    raise exception 'P219_EXONERATION_NOT_NOTIFIED';
  end if;
end;
$appeal$;

do $second_strike_ban$
declare
  v_worker constant uuid := 'c2190000-0000-4000-8000-000000000004';
  v_admin constant uuid := 'c2190000-0000-4000-8000-000000000003';
  v_result record;
begin
  perform public.admin_decide_violation_case(v_admin, (public.create_worker_report('c2190000-0000-4000-8000-000000000002',
    'c2190000-0000-4000-8000-000000000103', 'extra_cash', 'Thợ thu thêm tiền mặt ngoài giá đã chốt.')->>'case_id')::uuid,
    'confirm', 'Khách có biên nhận tiền mặt, thợ thừa nhận.');
  if (select banned from private.worker_discipline_state(v_worker)) then raise exception 'P219_BANNED_ON_FIRST_STRIKE'; end if;
  perform public.admin_decide_violation_case(v_admin, (public.create_worker_report('c2190000-0000-4000-8000-000000000002',
    'c2190000-0000-4000-8000-000000000104', 'off_app_dealing', 'Thợ lại rủ giao dịch riêng lần thứ hai.')->>'case_id')::uuid,
    'confirm', 'Lần vi phạm thứ hai trong 12 tháng, có chat lưu.');
  if not (select banned from private.worker_discipline_state(v_worker))
     or not (select is_suspended from public.worker_profiles where id = v_worker) then
    raise exception 'P219_SECOND_STRIKE_NOT_BANNED';
  end if;
  -- Earned income stays withdrawable after a ban: the refusal is about balance, not eligibility.
  select * into v_result from public.create_worker_withdrawal_request(v_worker, 100000, gen_random_uuid());
  if v_result.error_code = 'WORKER_NOT_ELIGIBLE' then
    raise exception 'P219_BANNED_WORKER_INCOME_LOCKED';
  end if;
end;
$second_strike_ban$;

do $harm_case$
declare
  v_worker constant uuid := 'c2190000-0000-4000-8000-000000000001';
  v_admin constant uuid := 'c2190000-0000-4000-8000-000000000003';
  v_case uuid;
  v_fabricated uuid;
begin
  v_case := (public.create_worker_report('c2190000-0000-4000-8000-000000000002',
    'c2190000-0000-4000-8000-000000000102', 'theft', 'Mất đồng hồ sau khi thợ rời đi, camera ghi lại.')->>'case_id')::uuid;
  perform public.admin_suspend_worker_for_case(v_admin, v_case, 'Tạm dừng nhận việc trong lúc xác minh.');
  if not (select is_suspended from public.worker_profiles where id = v_worker) then raise exception 'P219_NOT_SUSPENDED_AT_ONCE'; end if;
  perform public.admin_decide_violation_case(v_admin, v_case, 'dismiss', 'Camera cho thấy khách để quên đồng hồ ở nơi khác.');
  if (select is_suspended from public.worker_profiles where id = v_worker) then raise exception 'P219_DISMISSED_STILL_SUSPENDED'; end if;

  v_fabricated := (public.create_worker_report('c2190000-0000-4000-8000-000000000005',
    'c2190000-0000-4000-8000-000000000105', 'violence', 'Bịa rằng thợ đánh người để quỵt tiền công.')->>'case_id')::uuid;
  perform public.admin_decide_violation_case(v_admin, v_fabricated, 'fabricated_report', 'Camera và nhân chứng cho thấy không có sự việc.');
  if (select account_state from public.profiles where id = 'c2190000-0000-4000-8000-000000000005') <> 'locked' then
    raise exception 'P219_FABRICATOR_NOT_LOCKED';
  end if;

  -- Digests recorded with the CCCD at approval; a verified harm case blocks all three.
  insert into public.worker_identity_numbers (worker_id, cccd_hmac, cccd_last4, phone_hmac, email_hmac, entered_by)
  values (v_worker, repeat('c1', 32), '4321', repeat('d1', 32), repeat('e1', 32), v_admin)
  on conflict (worker_id) do update set cccd_hmac = excluded.cccd_hmac, phone_hmac = excluded.phone_hmac,
    email_hmac = excluded.email_hmac;

  v_case := (public.create_worker_report('c2190000-0000-4000-8000-000000000002',
    'c2190000-0000-4000-8000-000000000106', 'harassment_sexual', 'Thợ có hành vi quấy rối, đã trình báo công an.')->>'case_id')::uuid;
  perform public.admin_decide_violation_case(v_admin, v_case, 'confirm', 'Có biên bản công an và lời khai nhân chứng.', 0,
    jsonb_build_array(jsonb_build_object('kind', 'phone', 'value_hmac', repeat('ab', 32))));
  if not (select withdrawal_hold and banned from private.worker_discipline_state(v_worker))
     or not private.identity_blocked('phone', repeat('ab', 32)) then
    raise exception 'P219_HARM_CONSEQUENCES_WRONG';
  end if;

  -- The hold is time-boxed by policy, lapses on its own, and renews only with an authority reference.
  if not exists (
    select 1 from public.worker_discipline_entries
    where case_id = v_case and entry_kind = 'withdrawal_hold'
      and effective_until between now() + interval '89 days' and now() + interval '91 days'
  ) then
    raise exception 'P219_HOLD_NOT_TIME_BOXED';
  end if;
  insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, effective_from, effective_until, actor_id)
  values (v_case, 'c2190000-0000-4000-8000-000000000004', 'withdrawal_hold', now() - interval '100 days',
    now() - interval '10 days', v_admin);
  if (select withdrawal_hold from private.worker_discipline_state('c2190000-0000-4000-8000-000000000004')) then
    raise exception 'P219_LAPSED_HOLD_STILL_BLOCKS';
  end if;
  begin
    perform public.admin_extend_withdrawal_hold(v_admin, v_case, '  ', now() + interval '30 days');
    raise exception 'P219_HOLD_EXTENDED_WITHOUT_REFERENCE';
  exception when others then
    if sqlerrm <> 'INVALID_HOLD_INPUT' then raise; end if;
  end;
  perform public.admin_extend_withdrawal_hold(v_admin, v_case, 'CA-Q7-2026/118', now() + interval '200 days');
  if not exists (
    select 1 from public.worker_discipline_entries
    where case_id = v_case and entry_kind = 'withdrawal_hold' and detail->>'authority_reference' = 'CA-Q7-2026/118'
  ) or not exists (
    select 1 from public.worker_violation_case_events where case_id = v_case and event_kind = 'withdrawal_hold_extended'
  ) then
    raise exception 'P219_HOLD_EXTENSION_NOT_RECORDED';
  end if;

  if not private.identity_blocked('cccd', repeat('c1', 32))
     or not private.identity_blocked('phone', repeat('d1', 32))
     or not private.identity_blocked('email', repeat('e1', 32)) then
    raise exception 'P219_RECORDED_IDENTITY_NOT_BLOCKED';
  end if;

  -- A new account with a fresh CCCD but the banned sign-in email is refused at identity entry.
  begin
    perform public.admin_set_worker_identity_number(v_admin, v_worker, repeat('c9', 32), '9999', null, repeat('e1', 32));
    raise exception 'P219_BLOCKED_EMAIL_ACCEPTED';
  exception when others then
    if sqlerrm <> 'IDENTITY_BLOCKLISTED' then raise; end if;
  end;
end;
$harm_case$;

rollback;
