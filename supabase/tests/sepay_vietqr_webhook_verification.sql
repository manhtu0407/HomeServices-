-- =============================================================================
-- SePay VietQR webhook verification
--
-- Rollback-only proof that the payment webhook is idempotent, that one provider
-- transaction id can never credit two jobs, and that only service_role may call it.
-- The unique index and the RPC already exist (20260614093000_sepay_vietqr_payment_gate.sql,
-- 20260727153000_sepay_vietqr_webhook_atomic.sql); nothing executed them until now, so a
-- replayed webhook was never actually proven harmless.
--
-- Pattern source: governance/protocols/test-pillars.md (P10 prototype).
-- =============================================================================

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'b7200000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'sepay-guard-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b7200000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'sepay-guard-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set role = 'worker'
where id = 'b7200000-0000-4000-8000-000000000002';

insert into public.customer_profiles (id, building_name, unit_number, district)
values ('b7200000-0000-4000-8000-000000000001', 'SePay Guard Building', 'C-01', 'q7')
on conflict (id) do nothing;

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'b7200000-0000-4000-8000-000000000002',
  array['plumbing']::public.service_type[],
  array['q7'],
  true, true, 4.9, 42, 'approved', false, 'SePay Guard Worker', '1990-01-01'
)
on conflict (id) do nothing;

-- Two completed jobs enter the rail through the canonical payment-intent RPC. This keeps
-- the webhook fixture paired with the immutable Worker ledger it is required to settle.
insert into public.jobs (
  id, customer_id, worker_id, service_type, description, status,
  final_price, display_code, created_at
) values
  (
    'b7200000-0000-4000-8000-000000000010',
    'b7200000-0000-4000-8000-000000000001',
    'b7200000-0000-4000-8000-000000000002',
    'plumbing'::public.service_type,
    'SePay guard fixture job A',
    'confirmed_by_customer'::public.job_status,
    500000, 'SPG-0001', now()
  ),
  (
    'b7200000-0000-4000-8000-000000000011',
    'b7200000-0000-4000-8000-000000000001',
    'b7200000-0000-4000-8000-000000000002',
    'plumbing'::public.service_type,
    'SePay guard fixture job B',
    'confirmed_by_customer'::public.job_status,
    600000, 'SPG-0002', now()
  );

select * from public.create_worker_vietqr_payment_intent(
  'b7200000-0000-4000-8000-000000000010',
  'b7200000-0000-4000-8000-000000000001',
  500000,
  'NSA1B2C3D4E5F6G7H8I9J0K1L2',
  'SEPAY GUARD A',
  'https://vietqr.app/img?fixture=sepay-guard-a',
  now()
);

select * from public.create_worker_vietqr_payment_intent(
  'b7200000-0000-4000-8000-000000000011',
  'b7200000-0000-4000-8000-000000000001',
  600000,
  'NSZ9Y8X7W6V5U4T3S2R1Q0P9O8',
  'SEPAY GUARD B',
  'https://vietqr.app/img?fixture=sepay-guard-b',
  now()
);

-- 1. First delivery pays the job exactly once.
do $webhook_first_delivery$
declare
  v_result record;
  v_events integer;
begin
  select * into v_result
  from public.apply_sepay_vietqr_payment_webhook('NSA1B2C3D4E5F6G7H8I9J0K1L2', '900000000001', 500000, 'REF-A');

  if v_result.outcome is distinct from 'paid' then
    raise exception
      'first SePay delivery returned outcome % (expected paid). authority: governance/RULES.md #7',
      coalesce(v_result.outcome, '<null>');
  end if;

  select count(*) into v_events
  from public.job_events
  where job_id = 'b7200000-0000-4000-8000-000000000010' and event_type = 'payment_confirmed';

  if v_events <> 1 then
    raise exception 'first SePay delivery wrote % payment_confirmed events (expected 1)', v_events;
  end if;
end;
$webhook_first_delivery$;

-- 2. Replaying the identical webhook must change nothing. This is the invariant a retrying
--    provider actually exercises in production.
do $webhook_replay$
declare
  v_result record;
  v_events integer;
  v_status public.job_status;
  v_received integer;
begin
  select * into v_result
  from public.apply_sepay_vietqr_payment_webhook('NSA1B2C3D4E5F6G7H8I9J0K1L2', '900000000001', 500000, 'REF-A');

  if v_result.outcome is distinct from 'duplicate' then
    raise exception
      'replayed SePay delivery returned outcome % (expected duplicate). authority: governance/RULES.md #7. next: worker_payment_ledger_verification.sql',
      coalesce(v_result.outcome, '<null>');
  end if;

  select count(*) into v_events
  from public.job_events
  where job_id = 'b7200000-0000-4000-8000-000000000010' and event_type = 'payment_confirmed';

  if v_events <> 1 then
    raise exception 'replayed SePay delivery produced % payment_confirmed events (expected exactly 1)', v_events;
  end if;

  select status, payment_amount_received into v_status, v_received
  from public.jobs where id = 'b7200000-0000-4000-8000-000000000010';

  if v_status is distinct from 'paid'::public.job_status or v_received is distinct from 500000 then
    raise exception
      'replay moved the job off its settled state (status=%, received=%)', v_status, v_received;
  end if;
end;
$webhook_replay$;

-- 3. One provider transaction id must never settle a second, different job.
do $webhook_transaction_conflict$
declare
  v_result record;
  v_status public.job_status;
begin
  select * into v_result
  from public.apply_sepay_vietqr_payment_webhook('NSZ9Y8X7W6V5U4T3S2R1Q0P9O8', '900000000001', 600000, 'REF-B');

  if v_result.outcome is distinct from 'transaction_conflict' then
    raise exception
      'a reused transaction id returned outcome % (expected transaction_conflict). authority: governance/RULES.md #7',
      coalesce(v_result.outcome, '<null>');
  end if;

  select status into v_status from public.jobs where id = 'b7200000-0000-4000-8000-000000000011';
  if v_status is distinct from 'payment_pending'::public.job_status then
    raise exception 'the second job settled on a reused transaction id (status=%)', v_status;
  end if;
end;
$webhook_transaction_conflict$;

-- 4. The unique index is the backstop if the RPC is ever bypassed.
do $webhook_unique_index$
declare
  v_rejected boolean := false;
begin
  begin
    update public.jobs
    set sepay_transaction_id = '900000000001'
    where id = 'b7200000-0000-4000-8000-000000000011';
  exception when unique_violation then
    v_rejected := true;
  end;

  if not v_rejected then
    raise exception
      'two jobs hold the same sepay_transaction_id; jobs_sepay_transaction_uidx is not enforcing. authority: governance/RULES.md #8';
  end if;
end;
$webhook_unique_index$;

-- 5. A mismatched amount parks the job instead of paying it.
do $webhook_amount_mismatch$
declare
  v_result record;
  v_status public.job_status;
begin
  select * into v_result
  from public.apply_sepay_vietqr_payment_webhook('NSZ9Y8X7W6V5U4T3S2R1Q0P9O8', '900000000002', 1, 'REF-C');

  if v_result.outcome is distinct from 'amount_mismatch' then
    raise exception
      'an underpaid transfer returned outcome % (expected amount_mismatch)', coalesce(v_result.outcome, '<null>');
  end if;

  select status into v_status from public.jobs where id = 'b7200000-0000-4000-8000-000000000011';
  if v_status is distinct from 'payment_pending'::public.job_status then
    raise exception 'an underpaid transfer moved the job to % (expected payment_pending)', v_status;
  end if;
end;
$webhook_amount_mismatch$;

-- 6. Only the server may settle money.
do $webhook_grants$
declare
  v_role text;
  v_granted boolean;
begin
  foreach v_role in array array['public', 'anon', 'authenticated'] loop
    select has_function_privilege(v_role, p.oid, 'EXECUTE')
    into v_granted
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'apply_sepay_vietqr_payment_webhook'
    limit 1;

    if coalesce(v_granted, false) then
      raise exception
        'role % can execute apply_sepay_vietqr_payment_webhook. authority: governance/RULES.md #0 and #7',
        v_role;
    end if;
  end loop;
end;
$webhook_grants$;

select jsonb_build_object(
  'first_delivery_pays_once', true,
  'replay_is_idempotent', true,
  'transaction_id_is_unique_across_jobs', true,
  'amount_mismatch_parks_job', true,
  'execute_locked_to_service_role', true
) as sepay_vietqr_webhook_verification;

rollback;
