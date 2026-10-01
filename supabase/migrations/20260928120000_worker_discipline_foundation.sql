begin;

-- Worker discipline: detectors and reports only ever PROPOSE a case; nothing is applied until
-- an admin confirms it (governance/structures/do-not-build-now.md section 21 forbids autonomous
-- worker punishment). The single automatic effect is a matching-rank signal for late arrival.
-- Every consequence is an append-only entry, and an overturned appeal is answered by restore
-- entries, never by editing or deleting what was applied.

create table public.worker_discipline_policy (
  id smallint primary key default 1 check (id = 1),
  l1_matching_days smallint not null check (l1_matching_days between 1 and 90),
  l2_points_debit integer not null check (l2_points_debit between 1 and 1000),
  l2_network_freeze_days smallint not null check (l2_network_freeze_days between 1 and 365),
  l3_freeze_days smallint not null check (l3_freeze_days between 1 and 365),
  strike_window_months smallint not null check (strike_window_months between 1 and 36),
  appeal_window_days smallint not null check (appeal_window_days between 1 and 30),
  decision_deadline_hours smallint not null check (decision_deadline_hours between 1 and 720),
  late_arrival_grace_minutes smallint not null check (late_arrival_grace_minutes between 0 and 240),
  no_show_grace_minutes smallint not null check (no_show_grace_minutes between 5 and 720),
  off_app_evidence_threshold smallint not null check (off_app_evidence_threshold between 1 and 50),
  off_app_window_days smallint not null check (off_app_window_days between 1 and 365),
  withdrawal_hold_days smallint not null check (withdrawal_hold_days between 1 and 365),
  -- A reminder, never a penalty: how long a customer message may wait before Kael nudges the worker.
  reply_nudge_minutes smallint not null check (reply_nudge_minutes between 5 and 120),
  updated_at timestamptz not null default now()
);

insert into public.worker_discipline_policy (
  l1_matching_days, l2_points_debit, l2_network_freeze_days, l3_freeze_days, strike_window_months,
  appeal_window_days, decision_deadline_hours, late_arrival_grace_minutes, no_show_grace_minutes,
  off_app_evidence_threshold, off_app_window_days, withdrawal_hold_days, reply_nudge_minutes
) values (7, 20, 30, 90, 12, 7, 72, 15, 30, 2, 30, 90, 15);

create or replace function private.violation_level(p_code text)
returns smallint
language sql
immutable
set search_path = ''
as $function$
  select case p_code
    when 'late_arrival' then 1
    when 'slow_response' then 1
    when 'cancel_after_accept_no_reason' then 2
    when 'no_show' then 2
    when 'quality_complaint_confirmed' then 2
    when 'off_app_dealing' then 3
    when 'extra_cash' then 3
    when 'fake_customer' then 4
    when 'self_booking' then 4
    when 'fake_review' then 4
    when 'fake_evidence' then 4
    when 'theft' then 5
    when 'intentional_damage' then 5
    when 'harassment_sexual' then 5
    when 'violence' then 5
    when 'threats' then 5
    when 'covert_recording' then 5
  end::smallint;
$function$;

-- Violations that cost the customer money or property; only these can lead to a compensation
-- negotiation, so NestScout never prices harassment or violence, which belong to the authorities.
create or replace function private.compensation_eligible(p_code text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select coalesce(p_code in ('extra_cash', 'quality_complaint_confirmed', 'theft', 'intentional_damage'), false);
$function$;

create table public.worker_violation_cases (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  customer_id uuid references public.profiles(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  violation_code text not null check (private.violation_level(violation_code) is not null),
  level smallint not null check (level between 1 and 5),
  source text not null check (source in ('detector', 'admin', 'customer_report')),
  reporter_id uuid references public.profiles(id) on delete set null,
  statement text check (statement is null or pg_catalog.char_length(statement) between 10 and 2000),
  evidence jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(evidence) = 'object'),
  dedupe_key text not null unique check (pg_catalog.char_length(dedupe_key) between 3 and 200),
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'dismissed', 'fabricated_report')),
  decision_deadline_at timestamptz not null,
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or pg_catalog.char_length(decision_reason) between 10 and 2000),
  appeal_status text not null default 'none' check (appeal_status in ('none', 'submitted', 'upheld', 'overturned')),
  suspended_pending_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (level = private.violation_level(violation_code)),
  check ((status = 'proposed') = (decided_at is null)),
  check (appeal_status = 'none' or status = 'confirmed'),
  check (status <> 'fabricated_report' or source = 'customer_report')
);

create index worker_violation_cases_queue_idx
  on public.worker_violation_cases (status, level desc, created_at);
create index worker_violation_cases_worker_idx
  on public.worker_violation_cases (worker_id, created_at desc);

create table public.worker_violation_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.worker_violation_cases(id) on delete restrict,
  event_kind text not null check (event_kind in (
    'proposed', 'suspended_pending_review', 'confirmed', 'dismissed', 'fabricated_report',
    'appeal_submitted', 'appeal_upheld', 'appeal_overturned', 'withdrawal_hold_extended', 'compensation_payee_viewed', 'compensation_released'
  )),
  actor_id uuid references public.profiles(id) on delete restrict,
  detail jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);

create index worker_violation_case_events_case_idx
  on public.worker_violation_case_events (case_id, created_at);

create table public.worker_discipline_entries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.worker_violation_cases(id) on delete restrict,
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  entry_kind text not null check (entry_kind in (
    'warning', 'matching_deprioritize', 'points_debit', 'points_forfeit', 'network_freeze',
    'redemption_freeze', 'link_revoked', 'strike', 'ban', 'withdrawal_hold', 'bonus_clawback', 'restore'
  )),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  restores_entry_id uuid unique references public.worker_discipline_entries(id) on delete restrict,
  detail jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(detail) = 'object'),
  actor_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((entry_kind = 'restore') = (restores_entry_id is not null)),
  check (effective_until is null or effective_until > effective_from)
);

create index worker_discipline_entries_worker_idx
  on public.worker_discipline_entries (worker_id, entry_kind, effective_until);

alter table public.worker_discipline_policy enable row level security;
alter table public.worker_violation_cases enable row level security;
alter table public.worker_violation_case_events enable row level security;
alter table public.worker_discipline_entries enable row level security;
revoke all on table public.worker_discipline_policy, public.worker_violation_cases,
  public.worker_violation_case_events, public.worker_discipline_entries from public, anon, authenticated;
grant select on table public.worker_discipline_policy to service_role;
grant select, insert, update on table public.worker_violation_cases to service_role;
grant select, insert on table public.worker_violation_case_events, public.worker_discipline_entries to service_role;

create trigger worker_violation_case_events_append_only
before update or delete on public.worker_violation_case_events
for each row execute function private.reject_append_only_mutation();
create trigger worker_discipline_entries_append_only
before update or delete on public.worker_discipline_entries
for each row execute function private.reject_append_only_mutation();

-- A clawback is answered by a reversal row, never deleted, when an appeal overturns it.
alter table public.worker_bonus_clawbacks
  add column clawback_kind text not null default 'clawback' check (clawback_kind in ('clawback', 'reversal')),
  add column reverses_clawback_id uuid unique references public.worker_bonus_clawbacks(id) on delete restrict,
  add constraint worker_bonus_clawbacks_reversal_shape
    check ((clawback_kind = 'reversal') = (reverses_clawback_id is not null));

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
  with policy as (
    select * from public.worker_discipline_policy where id = 1
  ), live as (
    select entry.*
    from public.worker_discipline_entries as entry
    where entry.worker_id = p_worker_id
      and entry.entry_kind <> 'restore'
      and not exists (
        select 1 from public.worker_discipline_entries as restore
        where restore.restores_entry_id = entry.id
      )
  ), pending as (
    -- An open serious case freezes redemption until an admin decides it or its deadline passes,
    -- so a worker cannot cash out points that a pending decision may forfeit.
    select max(decision_deadline_at) as until_at
    from public.worker_violation_cases
    where worker_id = p_worker_id and status = 'proposed' and level >= 3
      and decision_deadline_at > pg_catalog.now()
  )
  select
    nullif(greatest(
      coalesce((select max(effective_until) from live where entry_kind = 'redemption_freeze'
        and effective_until > pg_catalog.now()), '-infinity'::timestamptz),
      coalesce((select until_at from pending), '-infinity'::timestamptz)
    ), '-infinity'::timestamptz),
    (select max(effective_until) from live where entry_kind = 'network_freeze' and effective_until > pg_catalog.now()),
    -- A hold lapses on its own date; only an authority reference recorded by an admin renews it.
    exists (select 1 from live where entry_kind = 'withdrawal_hold'
      and (effective_until is null or effective_until > pg_catalog.now())),
    exists (select 1 from live where entry_kind = 'ban'),
    (select max(effective_until) from live where entry_kind = 'matching_deprioritize' and effective_until > pg_catalog.now()),
    (select count(*)::integer from live, policy where entry_kind = 'strike'
      and live.created_at > pg_catalog.now() - pg_catalog.make_interval(months => policy.strike_window_months));
$function$;

revoke all on function private.worker_discipline_state(uuid) from public, anon, authenticated;
grant execute on function private.worker_discipline_state(uuid) to service_role;

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
    - coalesce((select sum(case when clawback.clawback_kind = 'reversal' then -clawback.amount_vnd else clawback.amount_vnd end)
      from public.worker_bonus_clawbacks as clawback where clawback.worker_id = p_worker_id), 0)::bigint
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

-- Customers who file a report proven fabricated are locked. They can still request deletion
-- of their account, which the Edge auth gate allows for this state.
alter table public.profiles drop constraint if exists profiles_account_state_check;
alter table public.profiles add constraint profiles_account_state_check
  check (account_state in ('active', 'deletion_processing', 'deleted', 'locked'));
alter table public.profiles
  add column if not exists locked_at timestamptz,
  add column if not exists locked_case_id uuid references public.worker_violation_cases(id) on delete set null;

commit;
