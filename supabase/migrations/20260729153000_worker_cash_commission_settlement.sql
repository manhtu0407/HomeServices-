begin;

-- Cash is collected outside the app. This ledger records only the commission
-- settlement against the worker's in-app balance and any remaining amount due.
create table if not exists public.worker_cash_commission_ledger (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete restrict,
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  gross_amount integer not null check (gross_amount > 0),
  platform_fee integer not null check (platform_fee >= 0),
  worker_net integer not null check (worker_net > 0),
  commission_level smallint not null check (commission_level >= 1),
  commission_rate_bps integer not null check (commission_rate_bps between 0 and 1500),
  cash_commission_collected integer not null check (cash_commission_collected >= 0),
  cash_commission_due integer not null check (cash_commission_due >= 0),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (gross_amount = platform_fee + worker_net),
  check (cash_commission_collected + cash_commission_due = platform_fee)
);

create index if not exists worker_cash_commission_ledger_worker_confirmed_idx
  on public.worker_cash_commission_ledger (worker_id, confirmed_at desc);

create table if not exists public.worker_cash_commission_reconciliations (
  id uuid primary key default gen_random_uuid(),
  cash_commission_ledger_id uuid not null references public.worker_cash_commission_ledger(id) on delete restrict,
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  amount integer not null check (amount > 0),
  reconciled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists worker_cash_commission_reconciliations_worker_created_idx
  on public.worker_cash_commission_reconciliations (worker_id, reconciled_at desc);

create or replace function private.protect_worker_cash_commission_ledger_amounts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  if new.job_id is distinct from old.job_id
    or new.worker_id is distinct from old.worker_id
    or new.gross_amount is distinct from old.gross_amount
    or new.platform_fee is distinct from old.platform_fee
    or new.worker_net is distinct from old.worker_net
    or new.commission_level is distinct from old.commission_level
    or new.commission_rate_bps is distinct from old.commission_rate_bps
    or new.cash_commission_collected is distinct from old.cash_commission_collected
    or new.cash_commission_due is distinct from old.cash_commission_due
    or new.confirmed_at is distinct from old.confirmed_at
    or new.created_at is distinct from old.created_at then
    raise exception 'cash commission settlement fields are immutable';
  end if;
  return new;
end;
$function$;

drop trigger if exists worker_cash_commission_ledger_immutable_amounts on public.worker_cash_commission_ledger;
create trigger worker_cash_commission_ledger_immutable_amounts
before update on public.worker_cash_commission_ledger
for each row execute function private.protect_worker_cash_commission_ledger_amounts();

create or replace function private.protect_worker_cash_commission_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  if new.cash_commission_ledger_id is distinct from old.cash_commission_ledger_id
    or new.worker_id is distinct from old.worker_id
    or new.amount is distinct from old.amount
    or new.reconciled_at is distinct from old.reconciled_at
    or new.created_at is distinct from old.created_at then
    raise exception 'cash commission reconciliation fields are immutable';
  end if;
  return new;
end;
$function$;

drop trigger if exists worker_cash_commission_reconciliations_immutable on public.worker_cash_commission_reconciliations;
create trigger worker_cash_commission_reconciliations_immutable
before update on public.worker_cash_commission_reconciliations
for each row execute function private.protect_worker_cash_commission_reconciliation();

alter table public.worker_cash_commission_ledger enable row level security;
drop policy if exists "Workers read own cash commission ledger" on public.worker_cash_commission_ledger;
create policy "Workers read own cash commission ledger"
  on public.worker_cash_commission_ledger for select
  to authenticated
  using ((select auth.uid()) = worker_id or private.is_admin());
revoke all on table public.worker_cash_commission_ledger from anon, authenticated;
grant select on table public.worker_cash_commission_ledger to authenticated;
grant all on table public.worker_cash_commission_ledger to service_role;

alter table public.worker_cash_commission_reconciliations enable row level security;
drop policy if exists "Workers read own cash commission reconciliations" on public.worker_cash_commission_reconciliations;
create policy "Workers read own cash commission reconciliations"
  on public.worker_cash_commission_reconciliations for select
  to authenticated
  using ((select auth.uid()) = worker_id or private.is_admin());
revoke all on table public.worker_cash_commission_reconciliations from anon, authenticated;
grant select on table public.worker_cash_commission_reconciliations to authenticated;
grant all on table public.worker_cash_commission_reconciliations to service_role;

alter table public.jobs drop constraint if exists jobs_payment_status_check;
alter table public.jobs add constraint jobs_payment_status_check
  check (payment_status in (
    'not_started',
    'code_requested',
    'vietqr_ready',
    'pending',
    'received',
    'cash_confirmed',
    'amount_mismatch',
    'expired',
    'failed',
    'reconciled'
  ));

create or replace function public.confirm_worker_cash_payment(
  p_job_id uuid,
  p_worker_id uuid
)
returns table (
  outcome text,
  job_id uuid,
  job_status public.job_status,
  payment_status text,
  gross_amount integer,
  platform_fee integer,
  worker_net integer,
  commission_level smallint,
  commission_rate_bps integer,
  cash_commission_collected integer,
  cash_commission_due integer,
  payment_received_at timestamptz,
  payment_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_job record;
  v_cash_ledger record;
  v_tier record;
  v_worker record;
  v_available_credits bigint;
  v_previous_cash_debits bigint;
  v_reconciled_cash_debits bigint;
  v_available_balance bigint;
  v_platform_fee integer;
  v_worker_net integer;
  v_cash_commission_collected integer;
  v_cash_commission_due integer;
  v_now timestamptz := now();
begin
  if p_job_id is null or p_worker_id is null then
    raise exception 'job and worker are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtext(p_job_id::text));

  select
    id,
    worker_id,
    status,
    final_price,
    payment_provider,
    payment_status,
    gross_amount,
    platform_fee,
    worker_net,
    worker_commission_level,
    worker_commission_rate_bps,
    payment_received_at,
    payment_updated_at
  into v_job
  from public.jobs
  where id = p_job_id
    and worker_id = p_worker_id
  for update;

  if not found then
    raise exception 'cash payment job not found' using errcode = 'P0001';
  end if;

  if v_job.status = 'paid'::public.job_status
    and v_job.payment_provider = 'cash'
    and v_job.payment_status = 'cash_confirmed' then
    select * into v_cash_ledger
    from public.worker_cash_commission_ledger
    where job_id = v_job.id
      and worker_id = p_worker_id
    for update;

    if not found then
      raise exception 'cash commission ledger is missing' using errcode = 'P0001';
    end if;

    return query select
      'already_confirmed'::text,
      v_job.id,
      'paid'::public.job_status,
      'cash_confirmed'::text,
      v_cash_ledger.gross_amount,
      v_cash_ledger.platform_fee,
      v_cash_ledger.worker_net,
      v_cash_ledger.commission_level,
      v_cash_ledger.commission_rate_bps,
      v_cash_ledger.cash_commission_collected,
      v_cash_ledger.cash_commission_due,
      v_job.payment_received_at,
      v_job.payment_updated_at;
    return;
  end if;

  if v_job.status is distinct from 'confirmed_by_customer'::public.job_status
    or v_job.final_price is null
    or v_job.final_price <= 0 then
    raise exception 'cash payment confirmation is unavailable' using errcode = 'P0001';
  end if;

  select id into v_worker
  from public.worker_profiles
  where id = p_worker_id
    and is_approved is true
  for update;
  if not found then
    raise exception 'cash payment worker is not approved' using errcode = 'P0001';
  end if;

  select * into v_tier
  from private.resolve_worker_commission_tier(p_worker_id);
  if not found then
    raise exception 'worker commission tier is not configured' using errcode = 'P0001';
  end if;

  v_platform_fee := round(v_job.final_price::numeric * v_tier.commission_rate_bps / 10000.0);
  v_worker_net := v_job.final_price - v_platform_fee;
  if v_worker_net <= 0 then
    raise exception 'worker net must be positive' using errcode = 'P0001';
  end if;

  select coalesce(sum(worker_net), 0)
  into v_available_credits
  from public.worker_payment_ledger
  where worker_id = p_worker_id
    and payment_state = 'available';

  select coalesce(sum(cash_commission_collected), 0)
  into v_previous_cash_debits
  from public.worker_cash_commission_ledger
  where worker_id = p_worker_id;

  select coalesce(sum(amount), 0)
  into v_reconciled_cash_debits
  from public.worker_cash_commission_reconciliations
  where worker_id = p_worker_id;

  v_available_balance := greatest(0, v_available_credits - v_previous_cash_debits - v_reconciled_cash_debits);
  v_cash_commission_collected := least(v_platform_fee, v_available_balance);
  v_cash_commission_due := v_platform_fee - v_cash_commission_collected;

  update public.jobs
  set
    gross_amount = v_job.final_price,
    platform_fee = v_platform_fee,
    worker_net = v_worker_net,
    worker_commission_level = v_tier.commission_level,
    worker_commission_rate_bps = v_tier.commission_rate_bps,
    paid_at = coalesce(paid_at, v_now),
    payment_amount_received = v_job.final_price,
    payment_code = null,
    payment_expires_at = null,
    payment_failure_reason = null,
    payment_provider = 'cash',
    payment_qr_image_url = null,
    payment_received_at = v_now,
    payment_status = 'cash_confirmed',
    payment_transfer_content = null,
    payment_updated_at = v_now,
    sepay_reference_code = null,
    sepay_transaction_id = null,
    status = 'paid'::public.job_status
  where id = v_job.id;

  insert into public.worker_cash_commission_ledger (
    job_id,
    worker_id,
    gross_amount,
    platform_fee,
    worker_net,
    commission_level,
    commission_rate_bps,
    cash_commission_collected,
    cash_commission_due,
    confirmed_at
  ) values (
    v_job.id,
    p_worker_id,
    v_job.final_price,
    v_platform_fee,
    v_worker_net,
    v_tier.commission_level,
    v_tier.commission_rate_bps,
    v_cash_commission_collected,
    v_cash_commission_due,
    v_now
  );

  insert into public.job_events (
    job_id,
    actor_id,
    actor_role,
    event_type,
    from_status,
    to_status,
    safe_metadata
  ) values (
    v_job.id,
    p_worker_id,
    'worker'::public.user_role,
    'worker_confirmed_cash_payment',
    'confirmed_by_customer'::public.job_status,
    'paid'::public.job_status,
    jsonb_build_object(
      'confirmation_kind', 'cash_payment_confirmed',
      'payment_mode', 'cash',
      'commission_level', v_tier.commission_level,
      'commission_state', case when v_cash_commission_due = 0 then 'collected' else 'reconciliation_due' end
    )
  );

  return query select
    'confirmed'::text,
    v_job.id,
    'paid'::public.job_status,
    'cash_confirmed'::text,
    v_job.final_price,
    v_platform_fee,
    v_worker_net,
    v_tier.commission_level,
    v_tier.commission_rate_bps,
    v_cash_commission_collected,
    v_cash_commission_due,
    v_now,
    v_now;
end;
$function$;

revoke all on function public.confirm_worker_cash_payment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_worker_cash_payment(uuid, uuid)
  to service_role;

create or replace function private.reconcile_worker_cash_commission(p_worker_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_available_credits bigint;
  v_initial_cash_collected bigint;
  v_reconciled_cash_collected bigint;
  v_remaining_balance bigint;
  v_debt record;
  v_allocation integer;
begin
  if p_worker_id is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;

  perform 1
  from public.worker_profiles
  where id = p_worker_id
  for update;
  if not found then
    raise exception 'cash commission worker is missing' using errcode = 'P0001';
  end if;

  select coalesce(sum(worker_net), 0)
  into v_available_credits
  from public.worker_payment_ledger
  where worker_id = p_worker_id
    and payment_state = 'available';

  select coalesce(sum(cash_commission_collected), 0)
  into v_initial_cash_collected
  from public.worker_cash_commission_ledger
  where worker_id = p_worker_id;

  select coalesce(sum(amount), 0)
  into v_reconciled_cash_collected
  from public.worker_cash_commission_reconciliations
  where worker_id = p_worker_id;

  v_remaining_balance := greatest(
    0,
    v_available_credits - v_initial_cash_collected - v_reconciled_cash_collected
  );
  if v_remaining_balance = 0 then
    return;
  end if;

  for v_debt in
    select
      cash_ledger.id,
      cash_ledger.cash_commission_due - coalesce((
        select sum(reconciliation.amount)
        from public.worker_cash_commission_reconciliations reconciliation
        where reconciliation.cash_commission_ledger_id = cash_ledger.id
      ), 0) as outstanding
    from public.worker_cash_commission_ledger cash_ledger
    where cash_ledger.worker_id = p_worker_id
    order by cash_ledger.confirmed_at, cash_ledger.id
    for update
  loop
    if v_debt.outstanding <= 0 then
      continue;
    end if;

    v_allocation := least(v_debt.outstanding, v_remaining_balance)::integer;
    insert into public.worker_cash_commission_reconciliations (
      cash_commission_ledger_id,
      worker_id,
      amount
    ) values (
      v_debt.id,
      p_worker_id,
      v_allocation
    );

    v_remaining_balance := v_remaining_balance - v_allocation;
    exit when v_remaining_balance = 0;
  end loop;
end;
$function$;

revoke all on function private.reconcile_worker_cash_commission(uuid)
  from public, anon, authenticated;
grant execute on function private.reconcile_worker_cash_commission(uuid)
  to service_role;

create or replace function private.reconcile_cash_commission_after_available_credit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  if new.payment_state is distinct from 'available' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.payment_state = 'available' then
    return new;
  end if;

  perform private.reconcile_worker_cash_commission(new.worker_id);
  return new;
end;
$function$;

revoke all on function private.reconcile_cash_commission_after_available_credit()
  from public, anon, authenticated;
grant execute on function private.reconcile_cash_commission_after_available_credit()
  to service_role;

drop trigger if exists worker_payment_ledger_reconcile_cash_commission on public.worker_payment_ledger;
create trigger worker_payment_ledger_reconcile_cash_commission
after insert or update of payment_state on public.worker_payment_ledger
for each row execute function private.reconcile_cash_commission_after_available_credit();

drop function if exists public.get_worker_earnings_summary(uuid, timestamptz, timestamptz);
create function public.get_worker_earnings_summary(
  p_worker_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  worker_id uuid,
  total_jobs_paid bigint,
  gross_earnings bigint,
  platform_fee_total bigint,
  net_earnings bigint,
  available_balance bigint,
  cash_commission_collected_total bigint,
  cash_commission_due_total bigint,
  pending_payment_count bigint,
  pending_payment_amount bigint,
  on_hold_amount bigint,
  current_commission_level smallint,
  current_commission_rate_bps integer,
  recent_transactions jsonb,
  daily_earnings jsonb,
  from_date timestamptz,
  to_date timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $function$
begin
  if p_worker_id is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'invalid earnings range' using errcode = '22023';
  end if;

  return query
  with current_tier as (
    select commission_level, commission_rate_bps
    from private.resolve_worker_commission_tier(p_worker_id)
  ), all_worker_ledger as (
    select
      ledger.id,
      ledger.job_id,
      'worker_credit'::text as entry_type,
      ledger.payment_state,
      ledger.gross_amount,
      ledger.platform_fee,
      ledger.worker_net,
      ledger.commission_level,
      ledger.commission_rate_bps,
      0::integer as cash_commission_collected,
      0::integer as cash_commission_due,
      ledger.created_at,
      ledger.available_at,
      job.display_code,
      coalesce(ledger.available_at, ledger.created_at) as recorded_at
    from public.worker_payment_ledger ledger
    left join public.jobs job on job.id = ledger.job_id
    where ledger.worker_id = p_worker_id
  ), all_cash_ledger as (
    select
      cash_ledger.id,
      cash_ledger.job_id,
      'cash_commission_debit'::text as entry_type,
      case
        when cash_ledger.cash_commission_due = reconciliations.amount then 'cash_collected'::text
        else 'cash_reconciliation_due'::text
      end as payment_state,
      cash_ledger.gross_amount,
      cash_ledger.platform_fee,
      cash_ledger.worker_net,
      cash_ledger.commission_level,
      cash_ledger.commission_rate_bps,
      cash_ledger.cash_commission_collected + reconciliations.amount as cash_commission_collected,
      cash_ledger.cash_commission_due - reconciliations.amount as cash_commission_due,
      cash_ledger.created_at,
      cash_ledger.confirmed_at as available_at,
      job.display_code,
      cash_ledger.confirmed_at as recorded_at
    from public.worker_cash_commission_ledger cash_ledger
    left join public.jobs job on job.id = cash_ledger.job_id
    cross join lateral (
      select least(
        cash_ledger.cash_commission_due::bigint,
        coalesce(sum(reconciliation.amount), 0)
      )::integer as amount
      from public.worker_cash_commission_reconciliations reconciliation
      where reconciliation.cash_commission_ledger_id = cash_ledger.id
    ) reconciliations
    where cash_ledger.worker_id = p_worker_id
  ), all_worker_transactions as (
    select * from all_worker_ledger
    union all
    select * from all_cash_ledger
  ), filtered_transactions as (
    select *
    from all_worker_transactions transaction
    where (p_from is null or transaction.recorded_at >= p_from)
      and (p_to is null or transaction.recorded_at <= p_to)
  ), paid_transactions as (
    select *
    from filtered_transactions transaction
    where transaction.entry_type = 'cash_commission_debit'
      or (transaction.entry_type = 'worker_credit' and transaction.payment_state = 'available')
  ), available_credits as (
    select coalesce(sum(ledger.worker_net), 0)::bigint as amount
    from all_worker_ledger ledger
    where ledger.payment_state = 'available'
  ), cash_commission_totals as (
    select
      coalesce(sum(cash_commission_collected), 0)::bigint as cash_commission_collected_total,
      coalesce(sum(cash_commission_due), 0)::bigint as cash_commission_due_total
    from all_cash_ledger
  ), daily_paid as (
    select
      (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date as paid_date,
      sum(transaction.gross_amount)::bigint as gross_earnings,
      sum(transaction.platform_fee)::bigint as platform_fee_total,
      sum(transaction.worker_net)::bigint as net_earnings,
      count(*)::bigint as paid_job_count
    from paid_transactions transaction
    group by (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date
  ), recent_transactions as (
    select *
    from filtered_transactions transaction
    order by transaction.recorded_at desc, transaction.id desc
    limit 20
  )
  select
    p_worker_id,
    coalesce((select count(*) from paid_transactions), 0)::bigint,
    coalesce((select sum(gross_amount) from paid_transactions), 0)::bigint,
    coalesce((select sum(platform_fee) from paid_transactions), 0)::bigint,
    coalesce((select sum(worker_net) from paid_transactions), 0)::bigint,
    greatest(0::bigint, available_credits.amount - cash_commission_totals.cash_commission_collected_total),
    cash_commission_totals.cash_commission_collected_total,
    cash_commission_totals.cash_commission_due_total,
    coalesce((select count(*) from all_worker_ledger ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger ledger where ledger.payment_state = 'on_hold'), 0)::bigint,
    tier.commission_level,
    tier.commission_rate_bps,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'job_id', transaction.job_id,
          'display_code', transaction.display_code,
          'entry_type', transaction.entry_type,
          'payment_state', transaction.payment_state,
          'gross_amount', transaction.gross_amount,
          'platform_fee', transaction.platform_fee,
          'worker_net', transaction.worker_net,
          'commission_level', transaction.commission_level,
          'commission_rate_bps', transaction.commission_rate_bps,
          'cash_commission_collected', transaction.cash_commission_collected,
          'cash_commission_due', transaction.cash_commission_due,
          'recorded_at', transaction.recorded_at,
          'available_at', transaction.available_at
        ) order by transaction.recorded_at desc, transaction.id desc
      )
      from recent_transactions transaction
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', daily.paid_date,
          'gross_earnings', daily.gross_earnings,
          'platform_fee_total', daily.platform_fee_total,
          'net_earnings', daily.net_earnings,
          'paid_job_count', daily.paid_job_count
        ) order by daily.paid_date desc
      )
      from (
        select * from daily_paid order by paid_date desc limit 366
      ) daily
    ), '[]'::jsonb),
    p_from,
    p_to
  from current_tier tier
  cross join available_credits
  cross join cash_commission_totals;
end;
$function$;

revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz) from anon;
revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz) from authenticated;
grant execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz) to service_role;

commit;
