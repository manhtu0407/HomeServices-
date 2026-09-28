-- @pillar id: P281-compensation-mediation-sql
-- @pillar invariant: Only the customer of a confirmed damage case can open a compensation claim; the two sides answer in turn within the deadline and a bounded number of offers; a worker can neither offer nor accept more than their balance covers, so NestScout never advances money; claim photos must sit under the customer's own case prefix; agreement reserves exactly the agreed amount from the worker's withdrawable balance once, retries are replays, and the reservation can only move to paid with a transfer reference and is never deleted; the admin reads the customer's Profile refund account only for a reserved payout, and each read is logged
-- @pillar authority: governance/RULES.md #7 | Tu 2026-09-28: compensation by agreement both sides accept; held money leaves only with the worker's consent or an authority decision
-- @pillar target: supabase/migrations/20260928126000_compensation_mediation.sql
-- @pillar layer: sql
-- @pillar siblings: P280-compensation-edge-routes, P255-withdrawable-balance-single-owner-sql, P268-appeal-restores-exactly-sql
-- @pillar mutation: Drop the balance check on accept in respond_compensation; accepting 2,000,000 against an 850,000 balance succeeds and P281 raises P281_OVER_BALANCE_AGREED

begin;
set local statement_timeout = '60s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('c2320000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'compensation-p232-' || n || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 4) as n;
-- 1 = worker, 2 = customer, 3 = admin, 4 = unrelated customer
update public.profiles set role = 'worker' where id = 'c2320000-0000-4000-8000-000000000001';
update public.profiles set role = 'admin' where id = 'c2320000-0000-4000-8000-000000000003';

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values ('c2320000-0000-4000-8000-000000000001', array['plumbing']::public.service_type[], array['q7'], true, true, 4.9,
  10, 'approved', false, 'Compensation Worker', '1990-01-01')
on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, status,
  final_price, gross_amount, platform_fee, worker_net, display_code, created_at, paid_at
) values
  ('c2320000-0000-4000-8000-000000000101', 'c2320000-0000-4000-8000-000000000002', 'c2320000-0000-4000-8000-000000000001',
    'plumbing', 'Compensation fixture paid', 'paid', 1000000, 1000000, 150000, 850000, 'CMP-0001', now(), now()),
  ('c2320000-0000-4000-8000-000000000102', 'c2320000-0000-4000-8000-000000000002', 'c2320000-0000-4000-8000-000000000001',
    'plumbing', 'Compensation fixture damage', 'paid', 400000, 400000, 60000, 340000, 'CMP-0002', now(), now());

insert into public.worker_payment_ledger (
  job_id, worker_id, payment_provider, payment_state, settlement_state, gross_amount,
  platform_fee, worker_net, commission_level, commission_rate_bps, available_at
) values ('c2320000-0000-4000-8000-000000000101', 'c2320000-0000-4000-8000-000000000001', 'platform_bank_manual',
  'available', 'admin_verified', 1000000, 150000, 850000, 1, 1500, now());

insert into public.worker_violation_cases (
  id, worker_id, customer_id, job_id, violation_code, level, source, reporter_id, statement, dedupe_key,
  status, decision_deadline_at, decided_by, decided_at, decision_reason
) values
  ('c2320000-0000-4000-8000-000000000201', 'c2320000-0000-4000-8000-000000000001', 'c2320000-0000-4000-8000-000000000002',
    'c2320000-0000-4000-8000-000000000102', 'intentional_damage', 5, 'customer_report', 'c2320000-0000-4000-8000-000000000002',
    'Thợ làm vỡ bồn rửa rồi bỏ đi.', 'p232-damage', 'confirmed', now() + interval '3 days',
    'c2320000-0000-4000-8000-000000000003', now(), 'Ảnh và hóa đơn thay bồn rửa khớp nhau.'),
  ('c2320000-0000-4000-8000-000000000202', 'c2320000-0000-4000-8000-000000000001', 'c2320000-0000-4000-8000-000000000002',
    'c2320000-0000-4000-8000-000000000102', 'harassment_sexual', 5, 'customer_report', 'c2320000-0000-4000-8000-000000000002',
    'Thợ có lời lẽ quấy rối.', 'p232-harassment', 'confirmed', now() + interval '3 days',
    'c2320000-0000-4000-8000-000000000003', now(), 'Có ghi âm và nhân chứng xác nhận.');

do $mediation$
declare
  v_worker constant uuid := 'c2320000-0000-4000-8000-000000000001';
  v_customer constant uuid := 'c2320000-0000-4000-8000-000000000002';
  v_admin constant uuid := 'c2320000-0000-4000-8000-000000000003';
  v_case constant uuid := 'c2320000-0000-4000-8000-000000000201';
  v_result jsonb;
  v_negotiation uuid;
  v_before bigint := (select withdrawable_vnd from private.worker_withdrawable_balance('c2320000-0000-4000-8000-000000000001'));
begin
  if v_before <> 850000 then raise exception 'P281_FIXTURE_BALANCE got %', v_before; end if;

  begin
    perform public.open_compensation_claim(v_customer, 'c2320000-0000-4000-8000-000000000202', 500000, 'Đòi bồi thường tinh thần.', '{}');
    raise exception 'P281_HARASSMENT_PRICED';
  exception when others then if sqlerrm <> 'COMPENSATION_NOT_ALLOWED' then raise; end if;
  end;
  begin
    perform public.open_compensation_claim('c2320000-0000-4000-8000-000000000004', v_case, 500000, 'Không phải khách của vụ này.', '{}');
    raise exception 'P281_STRANGER_CLAIMED';
  exception when others then if sqlerrm <> 'CASE_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.open_compensation_claim(v_customer, v_case, 5, 'Số tiền quá nhỏ để hợp lệ.', '{}');
    raise exception 'P281_TINY_AMOUNT_ACCEPTED';
  exception when others then if sqlerrm <> 'INVALID_COMPENSATION_INPUT' then raise; end if;
  end;

  begin
    perform public.open_compensation_claim(v_customer, v_case, 2000000, 'Bồn rửa vỡ, hóa đơn thay mới 2 triệu.',
      array['compensation/c2320000-0000-4000-8000-000000000004/c2320000-0000-4000-8000-000000000201/c2320000-0000-4000-8000-000000000301.jpg']);
    raise exception 'P281_FOREIGN_PHOTO_ACCEPTED';
  exception when others then if sqlerrm <> 'INVALID_COMPENSATION_INPUT' then raise; end if;
  end;
  v_result := public.open_compensation_claim(v_customer, v_case, 2000000, 'Bồn rửa vỡ, hóa đơn thay mới 2 triệu.', array['compensation/c2320000-0000-4000-8000-000000000002/c2320000-0000-4000-8000-000000000201/c2320000-0000-4000-8000-000000000301.jpg']);
  v_negotiation := (v_result->>'id')::uuid;
  if v_result->>'status' <> 'awaiting_worker' or pg_catalog.jsonb_array_length(v_result->'evidence_paths') <> 1
     or (public.open_compensation_claim(v_customer, v_case, 2000000, 'Bồn rửa vỡ, hóa đơn thay mới 2 triệu.', array['compensation/c2320000-0000-4000-8000-000000000002/c2320000-0000-4000-8000-000000000201/c2320000-0000-4000-8000-000000000301.jpg'])->>'id')::uuid <> v_negotiation then
    raise exception 'P281_CLAIM_NOT_OPENED_ONCE';
  end if;

  begin
    perform public.respond_compensation(v_customer, 'customer', v_negotiation, 'accept', null, null);
    raise exception 'P281_ANSWERED_OUT_OF_TURN';
  exception when others then if sqlerrm <> 'COMPENSATION_NOT_YOUR_TURN' then raise; end if;
  end;
  begin
    perform public.respond_compensation(v_worker, 'worker', v_negotiation, 'accept', null, null);
    raise exception 'P281_OVER_BALANCE_AGREED';
  exception when others then if sqlerrm <> 'INSUFFICIENT_WORKER_BALANCE' then raise; end if;
  end;
  begin
    perform public.respond_compensation(v_worker, 'worker', v_negotiation, 'counter', 900000, 'Tôi trả tối đa được như vầy.');
    raise exception 'P281_OVER_BALANCE_OFFERED';
  exception when others then if sqlerrm <> 'INSUFFICIENT_WORKER_BALANCE' then raise; end if;
  end;

  v_result := public.respond_compensation(v_worker, 'worker', v_negotiation, 'counter', 600000, 'Tôi chịu phần bồn rửa.');
  if v_result->>'status' <> 'awaiting_customer' or (v_result->>'current_amount_vnd')::integer <> 600000 then
    raise exception 'P281_COUNTER_NOT_RECORDED';
  end if;
  v_result := public.respond_compensation(v_customer, 'customer', v_negotiation, 'accept', null, null);
  perform public.respond_compensation(v_customer, 'customer', v_negotiation, 'accept', null, null);
  if v_result->>'status' <> 'agreed'
     or (select count(*) from public.worker_compensation_payouts where negotiation_id = v_negotiation) <> 1
     or (select withdrawable_vnd from private.worker_withdrawable_balance(v_worker)) <> v_before - 600000
     or private.worker_compensation_reserved_vnd(v_worker) <> 600000 then
    raise exception 'P281_AGREEMENT_NOT_RESERVED_ONCE';
  end if;

  if (public.admin_get_compensation_payee(v_admin, v_negotiation)->'account') <> 'null'::jsonb
     or (public.get_customer_compensation(v_customer)->>'refund_account_ready')::boolean then
    raise exception 'P281_PAYEE_INVENTED';
  end if;
  insert into public.customer_payment_methods (customer_id, bank_key, bank_name, account_holder_name, bank_account, bank_account_masked)
  values (v_customer, 'vietcombank', 'Vietcombank', 'NGUYEN VAN KHACH', '0123456789', '**** 6789');
  -- Read first: the event the read writes is only visible to the next statement.
  v_result := public.admin_get_compensation_payee(v_admin, v_negotiation);
  if v_result->'account'->>'bank_account' <> '0123456789'
     or not (public.get_customer_compensation(v_customer)->>'refund_account_ready')::boolean
     or not exists (select 1 from public.worker_violation_case_events where case_id = v_case and event_kind = 'compensation_payee_viewed') then
    raise exception 'P281_PAYEE_NOT_READ';
  end if;

  begin
    perform public.admin_record_compensation_paid(v_admin, v_negotiation, ' ');
    raise exception 'P281_PAID_WITHOUT_REFERENCE';
  exception when others then if sqlerrm <> 'INVALID_COMPENSATION_INPUT' then raise; end if;
  end;
  v_result := public.admin_record_compensation_paid(v_admin, v_negotiation, 'VCB-778899');
  perform public.admin_record_compensation_paid(v_admin, v_negotiation, 'VCB-778899');
  if v_result->'payout'->>'status' <> 'paid'
     or not exists (select 1 from public.worker_violation_case_events where case_id = v_case and event_kind = 'compensation_released')
     or (select withdrawable_vnd from private.worker_withdrawable_balance(v_worker)) <> v_before - 600000 then
    raise exception 'P281_PAYOUT_NOT_RECORDED';
  end if;
  begin
    perform public.admin_record_compensation_paid(v_admin, v_negotiation, 'VCB-000000');
    raise exception 'P281_PAID_TWICE';
  exception when others then if sqlerrm <> 'COMPENSATION_ALREADY_PAID' then raise; end if;
  end;
  begin
    delete from public.worker_compensation_payouts where negotiation_id = v_negotiation;
    raise exception 'P281_PAYOUT_DELETED';
  exception when others then if sqlerrm <> 'COMPENSATION_PAYOUT_IMMUTABLE' then raise; end if;
  end;
end;
$mediation$;

do $deadline$
declare
  v_negotiation uuid;
begin
  update public.worker_violation_cases set violation_code = 'extra_cash', level = 3
  where id = 'c2320000-0000-4000-8000-000000000202';
  v_negotiation := (public.open_compensation_claim('c2320000-0000-4000-8000-000000000002',
    'c2320000-0000-4000-8000-000000000202', 200000, 'Thợ thu thêm tiền mặt ngoài app.', '{}')->>'id')::uuid;
  update public.compensation_negotiations set respond_by = now() - interval '1 minute' where id = v_negotiation;
  if private.compensation_json(v_negotiation)->>'status' <> 'expired' then
    raise exception 'P281_DEADLINE_NOT_SHOWN';
  end if;
  begin
    perform public.respond_compensation('c2320000-0000-4000-8000-000000000001', 'worker', v_negotiation, 'accept', null, null);
    raise exception 'P281_ANSWERED_AFTER_DEADLINE';
  exception when others then if sqlerrm <> 'COMPENSATION_EXPIRED' then raise; end if;
  end;
end;
$deadline$;

rollback;
