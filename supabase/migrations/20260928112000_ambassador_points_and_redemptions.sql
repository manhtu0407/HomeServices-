begin;

-- Points are stored in thousandths so a 15,000 VND fee is exactly 1.5 points; rounding
-- happens once per entry, always down. Every movement is an append-only row, including
-- reversals, penalties and restores, so a balance is always a sum a person can audit.
create table public.worker_ambassador_point_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  entry_kind text not null check (entry_kind in (
    'order_accrual', 'accrual_reversal', 'redemption',
    'penalty_debit', 'penalty_forfeit', 'appeal_restore', 'admin_correction'
  )),
  points_milli bigint not null,
  source_ledger_id uuid references public.worker_payment_ledger(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete restrict,
  customer_id uuid references public.profiles(id) on delete set null,
  link_id uuid references public.customer_worker_links(id) on delete restrict,
  commission_basis_vnd integer check (commission_basis_vnd is null or commission_basis_vnd >= 0),
  multiplier_bps integer check (multiplier_bps is null or multiplier_bps between 10000 and 12000),
  program_version_id uuid references public.ambassador_program_versions(id) on delete restrict,
  redemption_id uuid,
  case_id uuid,
  actor_id uuid references public.profiles(id) on delete restrict,
  reason text check (reason is null or pg_catalog.char_length(reason) between 3 and 1000),
  idempotency_key text not null unique check (pg_catalog.char_length(idempotency_key) between 3 and 200),
  created_at timestamptz not null default now(),
  check (
    (entry_kind in ('order_accrual', 'appeal_restore') and points_milli > 0)
    or (entry_kind in ('accrual_reversal', 'redemption', 'penalty_debit', 'penalty_forfeit') and points_milli < 0)
    or (entry_kind = 'admin_correction' and points_milli <> 0 and actor_id is not null and reason is not null)
  ),
  check (entry_kind <> 'order_accrual' or (source_ledger_id is not null and link_id is not null
    and commission_basis_vnd is not null and multiplier_bps is not null and program_version_id is not null))
);

create index worker_ambassador_point_entries_worker_idx
  on public.worker_ambassador_point_entries (worker_id, created_at desc);
create unique index worker_ambassador_point_entries_source_kind
  on public.worker_ambassador_point_entries (source_ledger_id, entry_kind) where source_ledger_id is not null;

create table public.worker_bonus_redemptions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  milestone_id uuid not null references public.ambassador_milestones(id) on delete restrict,
  program_version_id uuid not null references public.ambassador_program_versions(id) on delete restrict,
  points_milli bigint not null check (points_milli > 0),
  reward_vnd integer not null check (reward_vnd > 0),
  tax_policy_id uuid not null references public.admin_finance_tax_policies(id) on delete restrict,
  tax_withheld_vnd integer not null check (tax_withheld_vnd >= 0),
  net_vnd integer not null check (net_vnd > 0),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (worker_id, client_request_id),
  check (reward_vnd = tax_withheld_vnd + net_vnd)
);

create index worker_bonus_redemptions_worker_idx
  on public.worker_bonus_redemptions (worker_id, created_at desc);

-- A clawback only ever reduces bonus credit that is still in the balance; money the worker
-- already withdrew becomes a recorded receivable, never a deduction from job income.
create table public.worker_bonus_clawbacks (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  redemption_id uuid not null references public.worker_bonus_redemptions(id) on delete restrict,
  amount_vnd integer not null,
  receivable_vnd integer not null default 0 check (receivable_vnd >= 0),
  case_id uuid,
  decided_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (pg_catalog.char_length(reason) between 3 and 1000),
  created_at timestamptz not null default now(),
  -- A clawback may record money already withdrawn as a receivable with no balance deduction.
  constraint worker_bonus_clawbacks_amount_vnd_check check (amount_vnd >= 0 and amount_vnd + receivable_vnd > 0)
);

alter table public.worker_ambassador_point_entries enable row level security;
alter table public.worker_bonus_redemptions enable row level security;
alter table public.worker_bonus_clawbacks enable row level security;
revoke all on table public.worker_ambassador_point_entries, public.worker_bonus_redemptions,
  public.worker_bonus_clawbacks from public, anon, authenticated;
grant select, insert on table public.worker_ambassador_point_entries, public.worker_bonus_redemptions,
  public.worker_bonus_clawbacks to service_role;

create trigger worker_ambassador_point_entries_append_only
before update or delete on public.worker_ambassador_point_entries
for each row execute function private.reject_append_only_mutation();
create trigger worker_bonus_redemptions_append_only
before update or delete on public.worker_bonus_redemptions
for each row execute function private.reject_append_only_mutation();
create trigger worker_bonus_clawbacks_append_only
before update or delete on public.worker_bonus_clawbacks
for each row execute function private.reject_append_only_mutation();

-- Synthetic test cohorts must never touch real money tables; the guard needs a branch for
-- each new one or it rejects every insert.
create or replace function private.guard_real_traffic_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_cohort text;
begin
  if tg_table_name = 'customer_payment_methods' then
    v_cohort := private.synthetic_profile_cohort(new.customer_id);
    if new.synthetic_cohort_id is not null then v_cohort := coalesce(v_cohort, new.synthetic_cohort_id); end if;
  elsif tg_table_name in ('worker_payout_methods', 'worker_withdrawal_requests') then
    v_cohort := private.synthetic_profile_cohort(new.worker_id);
    if new.synthetic_cohort_id is not null then v_cohort := coalesce(v_cohort, new.synthetic_cohort_id); end if;
  elsif tg_table_name in (
    'worker_payment_ledger', 'worker_cash_commission_ledger',
    'worker_cash_commission_reconciliations',
    'worker_ambassador_point_entries', 'worker_bonus_redemptions', 'worker_bonus_clawbacks',
    'worker_compensation_payouts'
  ) then
    v_cohort := private.synthetic_profile_cohort(new.worker_id);
  elsif tg_table_name = 'customer_membership_point_entries' then
    v_cohort := private.synthetic_profile_cohort(new.customer_id);
  elsif tg_table_name in (
    'job_payment_orders', 'job_payment_reconciliation_events',
    'worker_direct_payment_collateral_reservations',
    'admin_financial_adjustments', 'reviews'
  ) then
    v_cohort := private.synthetic_job_cohort(new.job_id);
  else
    raise exception using errcode = '0A000', message = 'SYNTHETIC_FINANCE_GUARD_TABLE_UNSUPPORTED';
  end if;
  if v_cohort is not null then
    raise exception using errcode = '42501', message = 'SYNTHETIC_FINANCE_FORBIDDEN';
  end if;
  return new;
end;
$function$;

create trigger worker_ambassador_point_entries_synthetic_guard
before insert on public.worker_ambassador_point_entries
for each row execute function private.guard_real_traffic_finance();
create trigger worker_bonus_redemptions_synthetic_guard
before insert on public.worker_bonus_redemptions
for each row execute function private.guard_real_traffic_finance();
create trigger worker_bonus_clawbacks_synthetic_guard
before insert on public.worker_bonus_clawbacks
for each row execute function private.guard_real_traffic_finance();

-- Bonus withholding uses the finance team's tax policy system, not a number in this file.
alter table public.admin_finance_tax_rules
  add column if not exists applies_at_or_above_vnd integer
    check (applies_at_or_above_vnd is null or applies_at_or_above_vnd >= 0);
alter table public.admin_finance_tax_rules
  drop constraint if exists admin_finance_tax_rules_calculation_basis_check;
alter table public.admin_finance_tax_rules
  add constraint admin_finance_tax_rules_calculation_basis_check check (calculation_basis in (
    'gmv', 'commission_collected', 'commission_retained', 'worker_net_paid',
    'platform_commission', 'worker_net', 'worker_bonus'
  ));

create or replace function public.admin_save_finance_tax_policy_draft(p_actor_id uuid, p_policy_id uuid, p_policy_key text, p_version integer, p_name text, p_subject_type text, p_effective_from date, p_effective_to date, p_rules jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_policy public.admin_finance_tax_policies%rowtype;
  v_rule_count integer;
begin
  perform private.assert_finance_tax_manager(p_actor_id);

  if p_policy_key is null or p_policy_key !~ '^[a-z0-9_]{3,64}$'
    or p_version is null or p_version <= 0
    or p_name is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 3 and 120
    or p_subject_type not in ('platform', 'worker')
    or p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from)
    or p_rules is null or pg_catalog.jsonb_typeof(p_rules) <> 'array'
    or pg_catalog.jsonb_array_length(p_rules) not between 1 and 20 then
    raise exception 'INVALID_TAX_POLICY_INPUT' using errcode = '22023';
  end if;

  select count(*) into v_rule_count
  from pg_catalog.jsonb_to_recordset(p_rules) as rule(
    tax_code text,
    label text,
    calculation_basis text,
    rate_bps integer,
    service_type text,
    applies_at_or_above_vnd integer
  )
  where rule.tax_code ~ '^[a-z0-9_]{2,40}$'
    and pg_catalog.char_length(pg_catalog.btrim(rule.label)) between 2 and 120
    and rule.calculation_basis in (
      'gmv', 'commission_collected', 'commission_retained', 'worker_net_paid',
      'platform_commission', 'worker_net', 'worker_bonus'
    )
    and rule.rate_bps between 1 and 10000
    and (rule.applies_at_or_above_vnd is null or rule.applies_at_or_above_vnd >= 0)
    and (rule.calculation_basis <> 'worker_bonus' or (rule.service_type is null and p_subject_type = 'worker'))
    and (rule.service_type is null or rule.service_type in (
      select enum_value::text from pg_catalog.enum_range(null::public.service_type) as enum_value
    ));

  -- Bonus withholding reads one rule per policy, so a second worker_bonus rule would be ignored.
  if v_rule_count <> pg_catalog.jsonb_array_length(p_rules)
    or (
      select count(*) from pg_catalog.jsonb_to_recordset(p_rules) as rule(calculation_basis text)
      where rule.calculation_basis = 'worker_bonus'
    ) > 1
    or exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_rules) as rule(tax_code text, service_type text)
      group by rule.tax_code, rule.service_type
      having count(*) > 1
    ) then
    raise exception 'INVALID_TAX_RULE_INPUT' using errcode = '22023';
  end if;

  if p_policy_id is null then
    insert into public.admin_finance_tax_policies (
      policy_key, version, name, subject_type, effective_from, effective_to, created_by
    ) values (
      p_policy_key, p_version, pg_catalog.btrim(p_name), p_subject_type,
      p_effective_from, p_effective_to, p_actor_id
    ) returning * into v_policy;
  else
    select policy.* into v_policy
    from public.admin_finance_tax_policies as policy
    where policy.id = p_policy_id
    for update;

    if not found then
      raise exception 'TAX_POLICY_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_policy.status <> 'draft' then
      raise exception 'TAX_POLICY_NOT_DRAFT' using errcode = 'P0001';
    end if;

    update public.admin_finance_tax_policies
    set policy_key = p_policy_key,
        version = p_version,
        name = pg_catalog.btrim(p_name),
        subject_type = p_subject_type,
        effective_from = p_effective_from,
        effective_to = p_effective_to
    where id = p_policy_id
    returning * into v_policy;

    -- Saved rules are edited in place and never removed, so a rule dropped from the editor
    -- needs a fresh draft instead of silently disappearing from this one.
    if exists (
      select 1 from public.admin_finance_tax_rules as existing
      where existing.policy_id = p_policy_id
        and not exists (
          select 1 from pg_catalog.jsonb_to_recordset(p_rules) as rule(tax_code text, service_type text)
          where rule.tax_code = existing.tax_code
            and rule.service_type is not distinct from existing.service_type::text
        )
    ) then
      raise exception 'TAX_RULE_REMOVAL_NEEDS_NEW_DRAFT' using errcode = 'P0001';
    end if;

    update public.admin_finance_tax_rules as existing
    set label = pg_catalog.btrim(rule.label),
        calculation_basis = rule.calculation_basis,
        rate_bps = rule.rate_bps,
        applies_at_or_above_vnd = rule.applies_at_or_above_vnd
    from pg_catalog.jsonb_to_recordset(p_rules) as rule(
      tax_code text,
      label text,
      calculation_basis text,
      rate_bps integer,
      service_type text,
      applies_at_or_above_vnd integer
    )
    where existing.policy_id = p_policy_id
      and existing.tax_code = rule.tax_code
      and existing.service_type::text is not distinct from rule.service_type;
  end if;

  insert into public.admin_finance_tax_rules (
    policy_id, tax_code, label, calculation_basis, rate_bps, service_type, applies_at_or_above_vnd
  )
  select
    v_policy.id,
    rule.tax_code,
    pg_catalog.btrim(rule.label),
    rule.calculation_basis,
    rule.rate_bps,
    case when rule.service_type is null then null else rule.service_type::public.service_type end,
    rule.applies_at_or_above_vnd
  from pg_catalog.jsonb_to_recordset(p_rules) as rule(
    tax_code text,
    label text,
    calculation_basis text,
    rate_bps integer,
    service_type text,
    applies_at_or_above_vnd integer
  )
  where not exists (
    select 1 from public.admin_finance_tax_rules as existing
    where existing.policy_id = v_policy.id
      and existing.tax_code = rule.tax_code
      and existing.service_type::text is not distinct from rule.service_type
  );

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id,
    (select profile.role::text from public.profiles as profile where profile.id = p_actor_id),
    'admin_finance_tax_policy',
    'save_draft',
    'finance_tax_policy',
    'allow',
    'finance_tax_policy_draft_saved',
    pg_catalog.jsonb_build_object('policy_id', v_policy.id, 'version', v_policy.version, 'rule_count', v_rule_count)
  );

  return pg_catalog.jsonb_build_object(
    'policy_id', v_policy.id,
    'status', v_policy.status,
    'version', v_policy.version,
    'rule_count', v_rule_count
  );
end;
$function$;

-- Returns no row when no approved worker policy carries a worker_bonus rule today; the
-- redemption then refuses rather than paying out an unwithheld amount.
create or replace function private.worker_bonus_withholding(p_reward_vnd integer)
returns table (tax_policy_id uuid, tax_withheld_vnd integer)
language sql
stable
security definer
set search_path = ''
as $function$
  select policy.id,
    case when p_reward_vnd >= coalesce(rule.applies_at_or_above_vnd, 0)
      then pg_catalog.floor(p_reward_vnd::numeric * rule.rate_bps / 10000)::integer
      else 0
    end
  from public.admin_finance_tax_policies as policy
  join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
  where policy.status = 'approved'
    and policy.subject_type = 'worker'
    and rule.calculation_basis = 'worker_bonus'
    and policy.effective_from <= (pg_catalog.statement_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
    and coalesce(policy.effective_to, 'infinity'::date)
      >= (pg_catalog.statement_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
  order by policy.effective_from desc, policy.version desc
  limit 1;
$function$;

-- Placeholder until the discipline ledger exists: nobody is frozen or banned. It already has the
-- final shape so the discipline migration can replace its body without dropping it.
create or replace function private.worker_discipline_state(p_worker_id uuid)
returns table (
  redemption_frozen_until timestamptz,
  network_frozen_until timestamptz,
  withdrawal_hold boolean,
  banned boolean,
  matching_penalty_until timestamptz,
  strikes_12m integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  select null::timestamptz, null::timestamptz, false, false, null::timestamptz, 0;
$function$;

create or replace function private.worker_ambassador_points_balance(p_worker_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(sum(points_milli), 0)::bigint
  from public.worker_ambassador_point_entries
  where worker_id = p_worker_id;
$function$;

-- A linked customer counts as active while they have a paid in-app order inside the
-- program's window. The multiplier reads the highest tier the count reaches, and drops to
-- 1.0x while the worker's network tier is frozen by a confirmed violation.
create or replace function private.worker_ambassador_network(p_worker_id uuid)
returns table (linked_customers integer, active_customers integer, multiplier_bps integer)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_program public.ambassador_program_versions%rowtype;
  v_linked integer;
  v_active integer;
  v_multiplier integer;
  v_frozen_until timestamptz;
begin
  v_program := private.current_ambassador_program();

  select count(*)::integer into v_linked
  from public.customer_worker_links as link
  where link.worker_id = p_worker_id and link.ended_at is null and link.expires_at > pg_catalog.now();

  select count(distinct link.customer_id)::integer into v_active
  from public.customer_worker_links as link
  join public.jobs as job on job.customer_id = link.customer_id
  join public.job_payment_orders as payment_order on payment_order.job_id = job.id
  where link.worker_id = p_worker_id
    and link.ended_at is null
    and link.expires_at > pg_catalog.now()
    and payment_order.payment_method = 'platform_bank_manual'
    and payment_order.status = 'manual_verified'
    and job.paid_at > pg_catalog.now() - pg_catalog.make_interval(days => coalesce(v_program.network_window_days, 90));

  select state.network_frozen_until into v_frozen_until from private.worker_discipline_state(p_worker_id) as state;

  if v_frozen_until is not null and v_frozen_until > pg_catalog.now() then
    v_multiplier := 10000;
  else
    select coalesce(max(tier.multiplier_bps), 10000) into v_multiplier
    from public.ambassador_multiplier_tiers as tier
    where tier.version_id = v_program.id and tier.min_active_customers <= v_active;
  end if;

  return query select v_linked, v_active, v_multiplier;
end;
$function$;

revoke all on function private.worker_bonus_withholding(integer) from public, anon, authenticated;
revoke all on function private.worker_discipline_state(uuid) from public, anon, authenticated;
revoke all on function private.worker_ambassador_points_balance(uuid) from public, anon, authenticated;
revoke all on function private.worker_ambassador_network(uuid) from public, anon, authenticated;
grant execute on function private.worker_bonus_withholding(integer) to service_role;
grant execute on function private.worker_discipline_state(uuid) to service_role;
grant execute on function private.worker_ambassador_points_balance(uuid) to service_role;
grant execute on function private.worker_ambassador_network(uuid) to service_role;

create or replace function private.worker_withdrawable_balance(p_worker_id uuid)
returns table (
  ledger_available_vnd bigint,
  admin_credit_vnd bigint,
  bonus_available_vnd bigint,
  cash_commission_vnd bigint,
  collateral_reserved_vnd bigint,
  pending_withdrawals_vnd bigint,
  paid_withdrawals_vnd bigint,
  withdrawable_vnd bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_ledger bigint;
  v_admin_credit bigint;
  v_bonus bigint;
  v_cash_commission bigint;
  v_collateral bigint;
  v_pending bigint;
  v_paid bigint;
begin
  if p_worker_id is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;

  select coalesce(sum(ledger.worker_net), 0)::bigint
  into v_ledger
  from public.worker_payment_ledger as ledger
  where ledger.worker_id = p_worker_id
    and ledger.payment_state = 'available'
    and ledger.settlement_state <> 'admin_rejected';

  select coalesce(sum(adjustment.worker_credit_vnd), 0)::bigint
  into v_admin_credit
  from public.admin_financial_adjustments as adjustment
  where adjustment.worker_id = p_worker_id
    and adjustment.adjustment_type = 'worker_credit'
    and adjustment.realization_status = 'completed';

  select coalesce((select sum(redemption.net_vnd) from public.worker_bonus_redemptions as redemption
      where redemption.worker_id = p_worker_id), 0)::bigint
    - coalesce((select sum(clawback.amount_vnd) from public.worker_bonus_clawbacks as clawback
      where clawback.worker_id = p_worker_id), 0)::bigint
  into v_bonus;

  select coalesce(sum(
    cash_ledger.cash_commission_collected
    + least(cash_ledger.cash_commission_due, coalesce((
      select sum(reconciliation.amount)
      from public.worker_cash_commission_reconciliations as reconciliation
      where reconciliation.cash_commission_ledger_id = cash_ledger.id
    ), 0)::integer)
  ), 0)::bigint
  into v_cash_commission
  from public.worker_cash_commission_ledger as cash_ledger
  where cash_ledger.worker_id = p_worker_id;

  select coalesce(sum(reservation.collateral_amount) filter (where reservation.status = 'held'), 0)::bigint
  into v_collateral
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.worker_id = p_worker_id;

  select
    coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing')), 0)::bigint,
    coalesce(sum(request.amount_vnd) filter (where request.status = 'paid'), 0)::bigint
  into v_pending, v_paid
  from public.worker_withdrawal_requests as request
  where request.worker_id = p_worker_id;

  return query select
    v_ledger,
    v_admin_credit,
    v_bonus,
    v_cash_commission,
    v_collateral,
    v_pending,
    v_paid,
    greatest(0::bigint, v_ledger + v_admin_credit + v_bonus - v_cash_commission - v_collateral - v_pending - v_paid);
end;
$function$;

create or replace function public.redeem_ambassador_milestone(
  p_worker_id uuid,
  p_milestone_id uuid,
  p_client_request_id uuid
)
returns table (
  ok boolean,
  error_code text,
  redemption_id uuid,
  reward_vnd integer,
  tax_withheld_vnd integer,
  net_vnd integer,
  points_left_milli bigint,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.worker_bonus_redemptions%rowtype;
  v_milestone public.ambassador_milestones%rowtype;
  v_program public.ambassador_program_versions%rowtype;
  v_state record;
  v_tax record;
  v_balance bigint;
  v_redemption public.worker_bonus_redemptions%rowtype;
begin
  if p_worker_id is null or p_milestone_id is null or p_client_request_id is null then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::integer, null::integer, null::integer, null::bigint, false;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_worker_id::text, 0));

  select * into v_existing from public.worker_bonus_redemptions
  where worker_id = p_worker_id and client_request_id = p_client_request_id;
  if found then
    if v_existing.milestone_id <> p_milestone_id then
      return query select false, 'CLIENT_REQUEST_MISMATCH'::text, null::uuid, null::integer, null::integer, null::integer, null::bigint, false;
      return;
    end if;
    return query select true, null::text, v_existing.id, v_existing.reward_vnd, v_existing.tax_withheld_vnd,
      v_existing.net_vnd, private.worker_ambassador_points_balance(p_worker_id), true;
    return;
  end if;

  select * into v_state from private.worker_discipline_state(p_worker_id);
  if not exists (
    select 1 from public.worker_profiles
    where id = p_worker_id and is_approved and not is_suspended
  ) or v_state.banned then
    return query select false, 'WORKER_NOT_ELIGIBLE'::text, null::uuid, null::integer, null::integer, null::integer, null::bigint, false;
    return;
  end if;
  if v_state.redemption_frozen_until is not null and v_state.redemption_frozen_until > pg_catalog.now() then
    return query select false, 'REDEMPTION_FROZEN'::text, null::uuid, null::integer, null::integer, null::integer, null::bigint, false;
    return;
  end if;

  v_program := private.current_ambassador_program();
  select * into v_milestone from public.ambassador_milestones
  where id = p_milestone_id and version_id = v_program.id;
  if not found then
    return query select false, 'MILESTONE_UNAVAILABLE'::text, null::uuid, null::integer, null::integer, null::integer, null::bigint, false;
    return;
  end if;

  v_balance := private.worker_ambassador_points_balance(p_worker_id);
  if v_balance < v_milestone.points_required::bigint * 1000 then
    return query select false, 'INSUFFICIENT_POINTS'::text, null::uuid, null::integer, null::integer, null::integer, v_balance, false;
    return;
  end if;

  select * into v_tax from private.worker_bonus_withholding(v_milestone.reward_vnd);
  if v_tax.tax_policy_id is null then
    return query select false, 'BONUS_TAX_POLICY_MISSING'::text, null::uuid, null::integer, null::integer, null::integer, v_balance, false;
    return;
  end if;

  insert into public.worker_bonus_redemptions (
    worker_id, milestone_id, program_version_id, points_milli, reward_vnd,
    tax_policy_id, tax_withheld_vnd, net_vnd, client_request_id
  ) values (
    p_worker_id, v_milestone.id, v_program.id, v_milestone.points_required::bigint * 1000, v_milestone.reward_vnd,
    v_tax.tax_policy_id, v_tax.tax_withheld_vnd, v_milestone.reward_vnd - v_tax.tax_withheld_vnd, p_client_request_id
  ) returning * into v_redemption;

  insert into public.worker_ambassador_point_entries (
    worker_id, entry_kind, points_milli, program_version_id, redemption_id, idempotency_key
  ) values (
    p_worker_id, 'redemption', -v_redemption.points_milli, v_program.id, v_redemption.id,
    'redemption:' || v_redemption.id
  );

  return query select true, null::text, v_redemption.id, v_redemption.reward_vnd, v_redemption.tax_withheld_vnd,
    v_redemption.net_vnd, private.worker_ambassador_points_balance(p_worker_id), false;
end;
$function$;

create or replace function public.get_worker_ambassador_summary(p_worker_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_program public.ambassador_program_versions%rowtype;
  v_network record;
  v_state record;
begin
  v_program := private.current_ambassador_program();
  select * into v_network from private.worker_ambassador_network(p_worker_id);
  select * into v_state from private.worker_discipline_state(p_worker_id);

  return pg_catalog.jsonb_build_object(
    'program', case when v_program.id is null then null else private.ambassador_program_json(v_program.id) - 'violations' - 'created_by' - 'approved_by' end,
    'referral_code', (select code from public.worker_referral_codes where worker_id = p_worker_id and revoked_at is null),
    'points_milli', private.worker_ambassador_points_balance(p_worker_id),
    'linked_customers', v_network.linked_customers,
    'active_customers', v_network.active_customers,
    'multiplier_bps', v_network.multiplier_bps,
    'redemption_frozen_until', v_state.redemption_frozen_until,
    'network_frozen_until', v_state.network_frozen_until,
    'tax_policy_ready', exists (select 1 from private.worker_bonus_withholding(1)),
    'recent_entries', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', entry.id,
        'entry_kind', entry.entry_kind,
        'points_milli', entry.points_milli,
        'commission_basis_vnd', entry.commission_basis_vnd,
        'multiplier_bps', entry.multiplier_bps,
        'created_at', entry.created_at
      ) order by entry.created_at desc)
      from (
        select * from public.worker_ambassador_point_entries
        where worker_id = p_worker_id
        order by created_at desc
        limit 20
      ) as entry
    ), '[]'::jsonb),
    'redemptions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', redemption.id,
        'milestone_id', redemption.milestone_id,
        'reward_vnd', redemption.reward_vnd,
        'tax_withheld_vnd', redemption.tax_withheld_vnd,
        'net_vnd', redemption.net_vnd,
        'created_at', redemption.created_at
      ) order by redemption.created_at desc)
      from (
        select * from public.worker_bonus_redemptions
        where worker_id = p_worker_id
        order by created_at desc
        limit 10
      ) as redemption
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.redeem_ambassador_milestone(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_worker_ambassador_summary(uuid) from public, anon, authenticated;
grant execute on function public.redeem_ambassador_milestone(uuid, uuid, uuid) to service_role;
grant execute on function public.get_worker_ambassador_summary(uuid) to service_role;

commit;
