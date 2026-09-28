-- @pillar id: P260-ambassador-accrual-sql
-- @pillar invariant: Ambassador points accrue only from orders paid in the app and only to the worker the customer is linked to — by invite code, or by a second paid in-app order with the same worker — even when another worker did the job; direct payments, unlinked orders and orders after a link expires earn nothing, a rerun of the sweep adds nothing, and a reversed payment takes back exactly what it earned
-- @pillar authority: governance/RULES.md #7, #8 | Tu 2026-09-25: worker ambassador program, 1 point = 10,000 VND commission
-- @pillar target: supabase/migrations/20260925114000_ambassador_accrual_sweep.sql
-- @pillar layer: sql
-- @pillar siblings: P261-milestone-cap-sql, P262-redemption-idempotent-balance-sql, P263-referral-claim-window-sql
-- @pillar mutation: Drop both the ledger payment_provider and the payment-order payment_method conditions from the sweep; the direct-payment order accrues and P211 raises P260_WRONG_PROCESSED_COUNT

begin;
set local statement_timeout = '60s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('c2110000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'ambassador-p211-' || n || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 6) as n;
-- 1 = inviting worker A, 2 = other worker B, 3 = invited customer, 4 = self-found customer,
-- 5 = direct-payment customer, 6 = customer whose link expired
update public.profiles set role = 'worker'
where id in ('c2110000-0000-4000-8000-000000000001', 'c2110000-0000-4000-8000-000000000002');

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
)
select id, array['plumbing']::public.service_type[], array['q7'], true, true, 4.9, 10, 'approved', false,
  'Ambassador Fixture Worker', '1990-01-01'
from (values ('c2110000-0000-4000-8000-000000000001'::uuid), ('c2110000-0000-4000-8000-000000000002'::uuid)) as w(id)
on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

create or replace function pg_temp.paid_job(
  p_job uuid, p_customer uuid, p_worker uuid, p_gross integer, p_fee integer, p_method text
) returns void language plpgsql as $paid$
declare
  v_code text := 'NS' || upper(substr(md5(p_job::text) || md5(p_job::text || 'x'), 1, 24));
begin
  insert into public.jobs (
    id, customer_id, worker_id, service_type, description, status, final_price, gross_amount,
    platform_fee, worker_net, display_code, created_at, paid_at, payment_status
  ) values (
    p_job, p_customer, p_worker, 'plumbing', 'Ambassador fixture job', 'paid', p_gross, p_gross,
    p_fee, p_gross - p_fee, 'AMB-' || upper(substr(md5(p_job::text), 1, 6)), now(), clock_timestamp(),
    case when p_method = 'platform_bank_manual' then 'manual_verified' else 'direct_paid' end
  );
  if p_method = 'platform_bank_manual' then
    insert into public.job_payment_orders (
      job_id, customer_id, worker_id, payment_method, status, gross_amount, platform_fee, worker_net,
      payment_code, transfer_content, qr_image_url, amount_received, credited_at
    ) values (
      p_job, p_customer, p_worker, 'platform_bank_manual', 'manual_verified', p_gross, p_fee, p_gross - p_fee,
      v_code, v_code, 'https://example.test/qr.png', p_gross, now()
    );
  else
    insert into public.job_payment_orders (
      job_id, customer_id, worker_id, payment_method, status, gross_amount, platform_fee, worker_net, amount_received, credited_at
    ) values (p_job, p_customer, p_worker, 'direct_worker', 'direct_awaiting_customer_confirmation', p_gross, p_fee, p_gross - p_fee, null, null);
  end if;
  insert into public.worker_payment_ledger (
    job_id, worker_id, payment_provider, payment_state, settlement_state, gross_amount,
    platform_fee, worker_net, commission_level, commission_rate_bps, available_at
  ) values (p_job, p_worker, p_method, 'available', 'admin_verified', p_gross, p_fee, p_gross - p_fee, 1, 1500, now());
end;
$paid$;

create or replace function pg_temp.points(p_worker uuid) returns bigint language sql as $$
  select coalesce(sum(points_milli), 0)::bigint from public.worker_ambassador_point_entries where worker_id = p_worker
$$;

do $scenario$
declare
  v_worker_a constant uuid := 'c2110000-0000-4000-8000-000000000001';
  v_worker_b constant uuid := 'c2110000-0000-4000-8000-000000000002';
  v_invited constant uuid := 'c2110000-0000-4000-8000-000000000003';
  v_self constant uuid := 'c2110000-0000-4000-8000-000000000004';
  v_direct constant uuid := 'c2110000-0000-4000-8000-000000000005';
  v_expired constant uuid := 'c2110000-0000-4000-8000-000000000006';
  v_code text;
  v_claim record;
  v_result jsonb;
  v_before bigint;
begin
  v_code := public.ensure_worker_referral_code(v_worker_a);
  select * into v_claim from public.claim_referral_code(v_invited, v_code);
  if v_claim.outcome <> 'LINKED' then
    raise exception 'P260_CLAIM_FAILED: %', v_claim.outcome;
  end if;

  -- Invited customer's order is done by worker B; the inviting worker A earns 60,000 / 10,000 = 6 points.
  perform pg_temp.paid_job('c2110000-0000-4000-8000-000000000101', v_invited, v_worker_b, 400000, 60000, 'platform_bank_manual');
  -- Self-found customer: the first order with B earns nothing, the second links and earns.
  perform pg_temp.paid_job('c2110000-0000-4000-8000-000000000102', v_self, v_worker_b, 200000, 30000, 'platform_bank_manual');
  -- Direct payment never earns.
  perform pg_temp.paid_job('c2110000-0000-4000-8000-000000000103', v_direct, v_worker_b, 400000, 60000, 'direct_worker');
  -- A link that ended in the past earns nothing.
  insert into public.customer_worker_links (customer_id, worker_id, source, program_version_id, formed_at, expires_at)
  values (v_expired, v_worker_a, 'invite_code', (private.current_ambassador_program()).id,
    now() - interval '2 years', now() - interval '1 year');
  perform pg_temp.paid_job('c2110000-0000-4000-8000-000000000104', v_expired, v_worker_b, 400000, 60000, 'platform_bank_manual');

  v_result := private.accrue_program_points(100);
  if (v_result->>'processed')::integer <> 3 then
    raise exception 'P260_WRONG_PROCESSED_COUNT: %', v_result;
  end if;

  if pg_temp.points(v_worker_a) <> 6000 then
    raise exception 'P260_INVITER_NOT_CREDITED: %', pg_temp.points(v_worker_a);
  end if;
  if pg_temp.points(v_worker_b) <> 0 then
    raise exception 'P260_UNLINKED_ORDER_EARNED: %', pg_temp.points(v_worker_b);
  end if;
  if exists (select 1 from public.worker_ambassador_point_entries where job_id = 'c2110000-0000-4000-8000-000000000103') then
    raise exception 'P260_DIRECT_PAYMENT_EARNED';
  end if;
  if not exists (select 1 from public.customer_worker_links
                 where customer_id = v_expired and end_reason = 'expired') then
    raise exception 'P260_EXPIRED_LINK_NOT_CLOSED';
  end if;

  perform pg_temp.paid_job('c2110000-0000-4000-8000-000000000105', v_self, v_worker_b, 200000, 30000, 'platform_bank_manual');
  v_result := private.accrue_program_points(100);
  if (v_result->>'links_formed')::integer <> 1 or not exists (
    select 1 from public.customer_worker_links
    where customer_id = v_self and worker_id = v_worker_b and source = 'rebook' and ended_at is null
      and formed_by_job_id = 'c2110000-0000-4000-8000-000000000105'
  ) then
    raise exception 'P260_REBOOK_LINK_NOT_FORMED: %', v_result;
  end if;
  if pg_temp.points(v_worker_b) <> 3000 then
    raise exception 'P260_REBOOK_ORDER_NOT_CREDITED: %', pg_temp.points(v_worker_b);
  end if;

  v_before := (select count(*) from public.worker_ambassador_point_entries);
  v_result := private.accrue_program_points(100);
  if (select count(*) from public.worker_ambassador_point_entries) <> v_before
     or (v_result->>'processed')::integer <> 0 then
    raise exception 'P260_RERUN_NOT_IDEMPOTENT: %', v_result;
  end if;

  update public.worker_payment_ledger set payment_state = 'reversed'
  where job_id = 'c2110000-0000-4000-8000-000000000101';
  v_result := private.accrue_program_points(100);
  if pg_temp.points(v_worker_a) <> 0 or (v_result->>'reversed')::integer <> 1 then
    raise exception 'P260_REVERSAL_WRONG: % %', pg_temp.points(v_worker_a), v_result;
  end if;
  v_result := private.accrue_program_points(100);
  if pg_temp.points(v_worker_a) <> 0 then
    raise exception 'P260_REVERSAL_REPEATED';
  end if;
end;
$scenario$;

do $append_only$
begin
  begin
    delete from public.worker_ambassador_point_entries;
    raise exception 'P260_ENTRIES_DELETED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'APPEND_ONLY_TABLE' then raise; end if;
  end;
end;
$append_only$;

rollback;
