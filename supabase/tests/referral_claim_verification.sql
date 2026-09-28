-- @pillar id: P263-referral-claim-window-sql
-- @pillar invariant: A customer can claim a worker's invite code only while new — inside the claim window, before any paid order, with no open link — a repeat claim of the same code is a no-op, a second worker's code is refused, and every attempt, accepted or not, is recorded and rate-limited
-- @pillar authority: governance/RULES.md #8 | Tu 2026-09-25: workers bring new customers into the app
-- @pillar target: supabase/migrations/20260928111000_ambassador_referral_links.sql
-- @pillar layer: sql
-- @pillar siblings: P260-ambassador-accrual-sql
-- @pillar mutation: Remove the ALREADY_TRANSACTED branch from claim_referral_code; an existing paying customer is claimed and P263 raises P263_EXISTING_CUSTOMER_CLAIMED

begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('c2140000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'ambassador-p214-' || n || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 6) as n;
-- 1, 2 = workers; 3 = new customer; 4 = old customer; 5 = paying customer; 6 = rate-limit customer
update public.profiles set role = 'worker'
where id in ('c2140000-0000-4000-8000-000000000001', 'c2140000-0000-4000-8000-000000000002');
update public.profiles set created_at = now() - interval '30 days'
where id = 'c2140000-0000-4000-8000-000000000004';

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
)
select id, array['plumbing']::public.service_type[], array['q7'], true, true, 4.9, 10, 'approved', false,
  'Referral Fixture Worker', '1990-01-01'
from (values ('c2140000-0000-4000-8000-000000000001'::uuid), ('c2140000-0000-4000-8000-000000000002'::uuid)) as w(id)
on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

insert into public.jobs (id, customer_id, worker_id, service_type, description, status, final_price,
  gross_amount, platform_fee, worker_net, display_code, created_at, paid_at)
values ('c2140000-0000-4000-8000-000000000101', 'c2140000-0000-4000-8000-000000000005',
  'c2140000-0000-4000-8000-000000000002', 'plumbing', 'Referral fixture', 'paid', 300000, 300000,
  45000, 255000, 'REF-0001', now(), now());

do $claims$
declare
  v_code_a text := public.ensure_worker_referral_code('c2140000-0000-4000-8000-000000000001');
  v_code_b text := public.ensure_worker_referral_code('c2140000-0000-4000-8000-000000000002');
  v_new constant uuid := 'c2140000-0000-4000-8000-000000000003';
  v_result record;
begin
  if v_code_a !~ '^[A-HJ-NP-Z2-9]{8}$' or v_code_a = v_code_b
     or public.ensure_worker_referral_code('c2140000-0000-4000-8000-000000000001') <> v_code_a then
    raise exception 'P263_CODE_NOT_STABLE';
  end if;

  select * into v_result from public.claim_referral_code(v_new, 'NOPE1234');
  if v_result.outcome <> 'CODE_NOT_FOUND' then raise exception 'P263_UNKNOWN_CODE: %', v_result.outcome; end if;

  select * into v_result from public.claim_referral_code(v_new, lower(v_code_a));
  if v_result.outcome <> 'LINKED' or v_result.worker_id <> 'c2140000-0000-4000-8000-000000000001' then
    raise exception 'P263_VALID_CLAIM_REFUSED: %', v_result.outcome;
  end if;
  if (select expires_at from public.customer_worker_links where id = v_result.link_id)
     <> (select created_at from public.profiles where id = v_new) + interval '12 months' then
    raise exception 'P263_LINK_NOT_TWELVE_MONTHS_FROM_SIGNUP';
  end if;

  select * into v_result from public.claim_referral_code(v_new, v_code_a);
  if v_result.outcome <> 'ALREADY_LINKED' then raise exception 'P263_REPEAT_NOT_IDEMPOTENT: %', v_result.outcome; end if;

  select * into v_result from public.claim_referral_code(v_new, v_code_b);
  if v_result.outcome <> 'LINKED_TO_OTHER_WORKER' then raise exception 'P263_SECOND_WORKER_ACCEPTED: %', v_result.outcome; end if;

  select * into v_result from public.claim_referral_code('c2140000-0000-4000-8000-000000000004', v_code_a);
  if v_result.outcome <> 'CLAIM_WINDOW_CLOSED' then raise exception 'P263_OLD_CUSTOMER_CLAIMED: %', v_result.outcome; end if;

  select * into v_result from public.claim_referral_code('c2140000-0000-4000-8000-000000000005', v_code_a);
  if v_result.outcome <> 'ALREADY_TRANSACTED' then raise exception 'P263_EXISTING_CUSTOMER_CLAIMED: %', v_result.outcome; end if;

  select * into v_result from public.claim_referral_code('c2140000-0000-4000-8000-000000000002', v_code_a);
  if v_result.outcome <> 'NOT_CUSTOMER' then raise exception 'P263_WORKER_CLAIMED: %', v_result.outcome; end if;

  if (select count(*) from public.referral_claim_attempts where customer_id = v_new) <> 4 then
    raise exception 'P263_ATTEMPTS_NOT_RECORDED';
  end if;
end;
$claims$;

do $rate_limit$
declare
  v_customer constant uuid := 'c2140000-0000-4000-8000-000000000006';
  v_result record;
begin
  for i in 1..10 loop
    perform public.claim_referral_code(v_customer, 'WRONG' || i);
  end loop;
  select * into v_result from public.claim_referral_code(v_customer,
    public.ensure_worker_referral_code('c2140000-0000-4000-8000-000000000001'));
  if v_result.outcome <> 'RATE_LIMITED' then raise exception 'P263_NOT_RATE_LIMITED: %', v_result.outcome; end if;
end;
$rate_limit$;

rollback;
