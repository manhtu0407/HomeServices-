-- @pillar id: P264-customer-membership-ledger-sql
-- @pillar invariant: Customer membership points come only from orders paid in the app — one entry per order at the configured VND per point, nothing for unpaid or directly paid jobs or for Kael chats — and a reversed payment takes the same points back
-- @pillar authority: governance/RULES.md #8 | Tu 2026-09-25: rebuild customer membership points on a ledger
-- @pillar target: supabase/migrations/20260925113000_customer_membership_ledger.sql
-- @pillar layer: sql
-- @pillar siblings: P260-ambassador-accrual-sql
-- @pillar mutation: Accrue membership points before the paid-in-app filters in private.accrue_program_points; the unpaid job earns and P215 raises P264_POINTS_WRONG

begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('c2150000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'membership-p215-' || n || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 2) as n;
update public.profiles set role = 'worker' where id = 'c2150000-0000-4000-8000-000000000002';
insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'c2150000-0000-4000-8000-000000000002', array['plumbing']::public.service_type[], array['q7'],
  true, true, 4.9, 10, 'approved', false, 'Membership Fixture Worker', '1990-01-01'
) on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

-- Paid in the app.
insert into public.jobs (id, customer_id, worker_id, service_type, description, status, final_price,
  gross_amount, platform_fee, worker_net, display_code, created_at, paid_at, payment_status)
values ('c2150000-0000-4000-8000-000000000101', 'c2150000-0000-4000-8000-000000000001',
  'c2150000-0000-4000-8000-000000000002', 'plumbing', 'Membership paid', 'paid', 400000, 400000,
  60000, 340000, 'MEM-0001', now(), now(), 'manual_verified');
insert into public.job_payment_orders (job_id, customer_id, worker_id, payment_method, status, gross_amount,
  platform_fee, worker_net, payment_code, transfer_content, qr_image_url, amount_received, credited_at)
values ('c2150000-0000-4000-8000-000000000101', 'c2150000-0000-4000-8000-000000000001',
  'c2150000-0000-4000-8000-000000000002', 'platform_bank_manual', 'manual_verified', 400000, 60000, 340000,
  'NSMEMBERSHIP0000000000000A', 'NSMEMBERSHIP0000000000000A', 'https://example.test/qr.png', 400000, now());
insert into public.worker_payment_ledger (job_id, worker_id, payment_provider, payment_state, settlement_state,
  gross_amount, platform_fee, worker_net, commission_level, commission_rate_bps, available_at)
values ('c2150000-0000-4000-8000-000000000101', 'c2150000-0000-4000-8000-000000000002',
  'platform_bank_manual', 'available', 'admin_verified', 400000, 60000, 340000, 1, 1500, now());

-- Finished but never paid: the old score counted this.
insert into public.jobs (id, customer_id, worker_id, service_type, description, status, final_price,
  gross_amount, platform_fee, worker_net, display_code, created_at)
values ('c2150000-0000-4000-8000-000000000102', 'c2150000-0000-4000-8000-000000000001',
  'c2150000-0000-4000-8000-000000000002', 'plumbing', 'Membership unpaid', 'completed_by_worker', 300000, 300000,
  45000, 255000, 'MEM-0002', now());
insert into public.worker_payment_ledger (job_id, worker_id, payment_provider, payment_state, settlement_state,
  gross_amount, platform_fee, worker_net, commission_level, commission_rate_bps)
values ('c2150000-0000-4000-8000-000000000102', 'c2150000-0000-4000-8000-000000000002',
  'platform_bank_manual', 'pending', 'pending', 300000, 45000, 255000, 1, 1500);

insert into public.kael_chat_sessions (customer_id, service_type) values ('c2150000-0000-4000-8000-000000000001', 'plumbing');

do $membership$
declare
  v_customer constant uuid := 'c2150000-0000-4000-8000-000000000001';
  v_summary jsonb;
begin
  perform private.accrue_program_points(100);
  v_summary := public.get_customer_membership_summary(v_customer);
  if (v_summary->>'points')::integer <> 40 then
    raise exception 'P264_POINTS_WRONG: %', v_summary->>'points';
  end if;
  if (select count(*) from public.customer_membership_point_entries where customer_id = v_customer) <> 1 then
    raise exception 'P264_EXTRA_ENTRIES';
  end if;

  update public.worker_payment_ledger set payment_state = 'reversed'
  where job_id = 'c2150000-0000-4000-8000-000000000101';
  perform private.accrue_program_points(100);
  if (public.get_customer_membership_summary(v_customer)->>'points')::integer <> 0 then
    raise exception 'P264_REVERSAL_MISSING';
  end if;
end;
$membership$;

rollback;
