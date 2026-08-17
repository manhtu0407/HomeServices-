-- =============================================================================
-- Worker payment ledger verification
--
-- Rollback-only proof that the in-app payable ledger enforces its own arithmetic,
-- its commission policy range, tier monotonicity, and financial-field immutability
-- against a real Postgres. Every constraint asserted here already exists in
-- 20260727160000_worker_payment_ledger_commission.sql; what was missing was anything
-- that executes them, so a later migration could drop one silently.
--
-- Pattern source: governance/protocols/test-pillars.md (P10 prototype).
-- =============================================================================

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'b7100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'ledger-guard-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b7100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'ledger-guard-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set role = 'worker'
where id = 'b7100000-0000-4000-8000-000000000002';

insert into public.customer_profiles (id, building_name, unit_number, district)
values ('b7100000-0000-4000-8000-000000000001', 'Ledger Guard Building', 'B-01', 'q7')
on conflict (id) do nothing;

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'b7100000-0000-4000-8000-000000000002',
  array['plumbing']::public.service_type[],
  array['q7'],
  true, true, 4.9, 120, 'approved', false, 'Ledger Guard Worker', '1990-01-01'
)
on conflict (id) do nothing;

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, status,
  final_price, gross_amount, platform_fee, worker_net, display_code, created_at
) values (
  'b7100000-0000-4000-8000-000000000010',
  'b7100000-0000-4000-8000-000000000001',
  'b7100000-0000-4000-8000-000000000002',
  'plumbing'::public.service_type,
  'Ledger guard fixture job',
  'paid'::public.job_status,
  1000000, 1000000, 150000, 850000, 'LGD-0001', now()
);

-- 1. The ledger must not accept a row whose parts do not sum to the whole.
do $ledger_sum$
declare
  v_rejected boolean := false;
begin
  begin
    insert into public.worker_payment_ledger (
      job_id, worker_id, payment_provider, payment_state,
      gross_amount, platform_fee, worker_net, commission_level, commission_rate_bps
    ) values (
      'b7100000-0000-4000-8000-000000000010',
      'b7100000-0000-4000-8000-000000000002',
      'sepay_vietqr', 'available',
      1000000, 150000, 849999, 1, 1500
    );
  exception when check_violation then
    v_rejected := true;
  end;

  if not v_rejected then
    raise exception
      'worker payment ledger accepted gross 1000000 <> fee 150000 + net 849999. authority: governance/RULES.md #8. next: sepay_vietqr_webhook_verification.sql';
  end if;
end;
$ledger_sum$;

-- 2. The commission rate is policy data with a hard ceiling; clamping is not allowed.
do $ledger_rate_range$
declare
  v_case record;
  v_rejected boolean;
begin
  for v_case in
    select * from (values (1501, 'above the ceiling'), (-1, 'below zero')) as t(rate, label)
  loop
    v_rejected := false;
    begin
      insert into public.worker_payment_ledger (
        job_id, worker_id, payment_provider, payment_state,
        gross_amount, platform_fee, worker_net, commission_level, commission_rate_bps
      ) values (
        'b7100000-0000-4000-8000-000000000010',
        'b7100000-0000-4000-8000-000000000002',
        'sepay_vietqr', 'available',
        1000000, 150000, 850000, 1, v_case.rate
      );
    exception when check_violation then
      v_rejected := true;
    end;

    if not v_rejected then
      raise exception
        'worker payment ledger accepted commission_rate_bps % (%). authority: governance/RULES.md #8. next: worker_manual_payouts_verification.sql',
        v_case.rate, v_case.label;
    end if;
  end loop;
end;
$ledger_rate_range$;

-- 3. A valid row is accepted, so the rejections above are about the invariant and not
--    about the fixture being unusable.
insert into public.worker_payment_ledger (
  job_id, worker_id, payment_provider, payment_state,
  gross_amount, platform_fee, worker_net, commission_level, commission_rate_bps
) values (
  'b7100000-0000-4000-8000-000000000010',
  'b7100000-0000-4000-8000-000000000002',
  'sepay_vietqr', 'available',
  1000000, 150000, 850000, 1, 1500
);

-- 4. Money already written down cannot be edited afterwards.
do $ledger_immutable$
declare
  v_rejected boolean := false;
begin
  begin
    update public.worker_payment_ledger
    set gross_amount = 2000000
    where job_id = 'b7100000-0000-4000-8000-000000000010';
  -- The immutability trigger raises P0001. Catching `others` here would also pass on a
  -- typo'd column name, which is how a negative test quietly stops testing anything.
  exception when raise_exception then
    v_rejected := true;
  end;

  if not v_rejected then
    raise exception
      'worker payment ledger allowed gross_amount to be rewritten after the fact. authority: governance/RULES.md #8';
  end if;
end;
$ledger_immutable$;

-- 5. Tier policy must stay monotonic: a higher tier can only lower the rate.
do $tier_monotonicity$
declare
  v_rejected boolean := false;
begin
  insert into public.worker_commission_tiers (level, min_completed_jobs, min_average_rating, commission_rate_bps, is_active)
  values (2, 50, 4.5, 1200, true);

  begin
    insert into public.worker_commission_tiers (level, min_completed_jobs, min_average_rating, commission_rate_bps, is_active)
    values (3, 100, 4.7, 1300, true);
  exception when raise_exception then
    v_rejected := true;
  end;

  if not v_rejected then
    raise exception
      'commission tier 3 took a higher rate (1300) than tier 2 (1200). authority: governance/RULES.md #8. next: worker_payment_ledger check constraints above';
  end if;
end;
$tier_monotonicity$;

-- 6. Ordinary API roles read the ledger at most; they never write it.
do $ledger_grants$
declare
  v_can_insert boolean;
  v_can_update boolean;
  v_tier_execute boolean;
begin
  select
    has_table_privilege('authenticated', 'public.worker_payment_ledger', 'INSERT'),
    has_table_privilege('authenticated', 'public.worker_payment_ledger', 'UPDATE')
  into v_can_insert, v_can_update;

  if v_can_insert or v_can_update then
    raise exception
      'authenticated holds write privilege on worker_payment_ledger (insert=%, update=%). authority: governance/RULES.md #0',
      v_can_insert, v_can_update;
  end if;

  if has_table_privilege('anon', 'public.worker_payment_ledger', 'SELECT') then
    raise exception 'anon can read worker_payment_ledger. authority: governance/RULES.md Security Invariants';
  end if;

  select has_function_privilege('anon', p.oid, 'EXECUTE')
  into v_tier_execute
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_worker_current_commission_tier'
  limit 1;

  if coalesce(v_tier_execute, false) then
    raise exception 'anon can execute get_worker_current_commission_tier. authority: governance/RULES.md #0';
  end if;
end;
$ledger_grants$;

select jsonb_build_object(
  'ledger_sum_enforced', true,
  'rate_range_enforced', true,
  'amounts_immutable', true,
  'tier_monotonicity_enforced', true,
  'write_grants_locked', true
) as worker_payment_ledger_verification;

rollback;
