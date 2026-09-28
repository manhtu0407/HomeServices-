-- @pillar id: P262-redemption-idempotent-balance-sql
-- @pillar invariant: Redeeming a milestone consumes exactly its points once per client request, withholds tax only through an approved worker_bonus tax policy (refusing when none exists), raises the withdrawable balance by exactly the net amount, and refuses a suspended worker, a missing balance or a reused request id for a different milestone
-- @pillar authority: governance/RULES.md #7 | Tu 2026-09-25: bonus goes to the withdrawable balance, withheld per the tax policy
-- @pillar target: supabase/migrations/20260925112000_ambassador_points_and_redemptions.sql
-- @pillar layer: sql
-- @pillar siblings: P255-withdrawable-balance-single-owner-sql, P261-milestone-cap-sql
-- @pillar mutation: Drop the bonus term from private.worker_withdrawable_balance; the redeemed net never reaches the balance and P213 raises P262_BALANCE_NOT_CREDITED

begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('c2130000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'ambassador-p213-' || n || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 3) as n;
-- 1 = worker, 2 and 3 = admins (policy editor and approver)
update public.profiles set role = 'worker' where id = 'c2130000-0000-4000-8000-000000000001';
update public.profiles set role = 'admin'
where id in ('c2130000-0000-4000-8000-000000000002', 'c2130000-0000-4000-8000-000000000003');

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'c2130000-0000-4000-8000-000000000001', array['plumbing']::public.service_type[], array['q7'],
  true, true, 4.9, 10, 'approved', false, 'Redemption Fixture Worker', '1990-01-01'
) on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

insert into public.worker_ambassador_point_entries (worker_id, entry_kind, points_milli, actor_id, reason, idempotency_key)
values ('c2130000-0000-4000-8000-000000000001', 'admin_correction', 1012000,
  'c2130000-0000-4000-8000-000000000002', 'Verification fixture balance', 'p213-fixture');

create or replace function pg_temp.milestone(p_rank integer) returns uuid language sql as $$
  select milestone.id from public.ambassador_milestones as milestone
  join public.ambassador_program_versions as version on version.id = milestone.version_id
  where version.status = 'approved' and milestone.rank = p_rank
$$;

do $redeem$
declare
  v_worker constant uuid := 'c2130000-0000-4000-8000-000000000001';
  v_request constant uuid := 'c2130000-0000-4000-8000-000000000901';
  v_result record;
  v_balance_before bigint;
  v_policy jsonb;
begin
  select * into v_result from public.redeem_ambassador_milestone(v_worker, pg_temp.milestone(1), v_request);
  if v_result.ok or v_result.error_code <> 'BONUS_TAX_POLICY_MISSING' then
    raise exception 'P262_UNTAXED_PAYOUT_ALLOWED: %', v_result.error_code;
  end if;

  v_policy := public.admin_save_finance_tax_policy_draft(
    'c2130000-0000-4000-8000-000000000002', null, 'worker_bonus_pit', 1, 'Khấu trừ thuế thưởng thợ', 'worker',
    (now() at time zone 'Asia/Ho_Chi_Minh')::date, null,
    '[{"tax_code":"pit_bonus","label":"Thuế TNCN thưởng","calculation_basis":"worker_bonus","rate_bps":1000,"applies_at_or_above_vnd":2000000}]'::jsonb
  );
  perform public.admin_approve_finance_tax_policy('c2130000-0000-4000-8000-000000000003',
    (v_policy->>'policy_id')::uuid, 'Kế toán xác nhận thử nghiệm');

  -- The admin editor posts Edge-shaped JSON; a bonus rule's threshold must survive that path
  -- and come back in the policy list, or the list would read as withholding from every payout.
  perform * from public.admin_create_finance_tax_policy_draft('c2130000-0000-4000-8000-000000000002',
    '{"name":"Thuế thưởng qua trình soạn thảo","effective_from":"2030-01-01","source_reference":"Kiểm tra JSON",
      "rules":[{"tax_type":"pit_bonus_editor","subject":"worker","basis":"worker_bonus","rate_bps":1000,"applies_at_or_above_vnd":3000000}]}'::jsonb);
  if not exists (
    select 1 from pg_catalog.jsonb_array_elements(
      public.admin_finance_tax_policies('c2130000-0000-4000-8000-000000000002')->'tax_policies') as item
    where item->>'tax_type' = 'pit_bonus_editor' and item->>'basis' = 'worker_bonus'
      and (item->>'applies_at_or_above_vnd')::integer = 3000000
  ) then
    raise exception 'P262_BONUS_THRESHOLD_LOST';
  end if;

  v_balance_before := (select withdrawable_vnd from private.worker_withdrawable_balance(v_worker));
  select * into v_result from public.redeem_ambassador_milestone(v_worker, pg_temp.milestone(1), v_request);
  if not v_result.ok or v_result.reward_vnd <> 20000 or v_result.tax_withheld_vnd <> 0
     or v_result.net_vnd <> 20000 or v_result.points_left_milli <> 1002000 or v_result.replayed then
    raise exception 'P262_SMALL_REDEMPTION_WRONG: % % % %', v_result.error_code, v_result.tax_withheld_vnd,
      v_result.net_vnd, v_result.points_left_milli;
  end if;
  if (select withdrawable_vnd from private.worker_withdrawable_balance(v_worker)) <> v_balance_before + 20000 then
    raise exception 'P262_BALANCE_NOT_CREDITED';
  end if;

  select * into v_result from public.redeem_ambassador_milestone(v_worker, pg_temp.milestone(1), v_request);
  if not v_result.replayed or (select count(*) from public.worker_bonus_redemptions where worker_id = v_worker) <> 1
     or (select withdrawable_vnd from private.worker_withdrawable_balance(v_worker)) <> v_balance_before + 20000 then
    raise exception 'P262_REPLAY_DOUBLE_PAID';
  end if;

  select * into v_result from public.redeem_ambassador_milestone(v_worker, pg_temp.milestone(2), v_request);
  if v_result.ok or v_result.error_code <> 'CLIENT_REQUEST_MISMATCH' then
    raise exception 'P262_REQUEST_REUSED: %', v_result.error_code;
  end if;

  -- 4,000,000 VND is above the 2,000,000 threshold: 10% is withheld.
  select * into v_result from public.redeem_ambassador_milestone(v_worker, pg_temp.milestone(5), gen_random_uuid());
  if not v_result.ok or v_result.tax_withheld_vnd <> 400000 or v_result.net_vnd <> 3600000
     or v_result.points_left_milli <> 2000 then
    raise exception 'P262_LARGE_REDEMPTION_WRONG: % % %', v_result.error_code, v_result.tax_withheld_vnd, v_result.points_left_milli;
  end if;
  if (select withdrawable_vnd from private.worker_withdrawable_balance(v_worker)) <> v_balance_before + 3620000
     or (select available_balance from public.get_worker_payment_safety_balance(v_worker)) <> v_balance_before + 3620000 then
    raise exception 'P262_BALANCE_NOT_CREDITED';
  end if;

  select * into v_result from public.redeem_ambassador_milestone(v_worker, pg_temp.milestone(1), gen_random_uuid());
  if v_result.ok or v_result.error_code <> 'INSUFFICIENT_POINTS' then
    raise exception 'P262_OVERDRAWN_POINTS: %', v_result.error_code;
  end if;

  insert into public.worker_ambassador_point_entries (worker_id, entry_kind, points_milli, actor_id, reason, idempotency_key)
  values (v_worker, 'admin_correction', 50000, 'c2130000-0000-4000-8000-000000000002', 'Verification top-up', 'p213-topup');
  perform private.apply_worker_suspension(v_worker, 'admin', null, 'Kiểm tra đình chỉ', 'c2130000-0000-4000-8000-000000000002', null);
  select * into v_result from public.redeem_ambassador_milestone(v_worker, pg_temp.milestone(1), gen_random_uuid());
  if v_result.ok or v_result.error_code <> 'WORKER_NOT_ELIGIBLE' then
    raise exception 'P262_SUSPENDED_REDEEMED: %', v_result.error_code;
  end if;
end;
$redeem$;

do $receipts_immutable$
begin
  begin
    update public.worker_bonus_redemptions set net_vnd = net_vnd + 1;
    raise exception 'P262_REDEMPTION_EDITED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'APPEND_ONLY_TABLE' then raise; end if;
  end;
end;
$receipts_immutable$;

rollback;
