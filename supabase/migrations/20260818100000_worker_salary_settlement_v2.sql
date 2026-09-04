begin;

-- Keep the payment and salary state machine explicit. A customer claim is not
-- a payout or an admin verification, so it must be visible as provisional.
alter table public.jobs
  drop constraint if exists jobs_payment_status_check;

alter table public.jobs
  add constraint jobs_payment_status_check
  check (
    payment_status in (
      'not_started',
      'code_requested',
      'vietqr_ready',
      'pending',
      'received',
      'cash_confirmed',
      'amount_mismatch',
      'expired',
      'failed',
      'reconciled',
      'manual_qr_ready',
      'manual_customer_claimed',
      'manual_reconcile_required',
      'manual_verified',
      'direct_awaiting_confirmation',
      'direct_admin_confirmation_required',
      'direct_reconcile_required',
      'direct_paid'
    )
  );

alter table public.job_payment_orders
  drop constraint if exists job_payment_orders_status_check;

alter table public.job_payment_orders
  add constraint job_payment_orders_status_check
  check (status in (
    'manual_qr_ready',
    'manual_customer_claimed',
    'manual_reconcile_required',
    'manual_verified',
    'manual_cancelled',
    'direct_awaiting_customer_confirmation',
    'direct_awaiting_worker_confirmation',
    'direct_admin_confirmation_required',
    'direct_reconcile_required',
    'direct_paid'
  ));

alter table public.worker_payment_ledger
  drop constraint if exists worker_payment_ledger_payment_provider_check;

alter table public.worker_payment_ledger
  add constraint worker_payment_ledger_payment_provider_check
  check (payment_provider in ('sepay_vietqr', 'platform_bank_manual', 'direct_worker'));

alter table public.job_payment_reconciliation_events
  drop constraint if exists job_payment_reconciliation_events_event_type_check;

alter table public.job_payment_reconciliation_events
  add constraint job_payment_reconciliation_events_event_type_check
  check (event_type in (
    'manual_order_created',
    'customer_transfer_claimed',
    'manual_reconcile_required',
    'manual_payment_verified',
    'direct_payment_selected',
    'direct_payment_customer_confirmed',
    'direct_payment_worker_confirmed',
    'direct_payment_admin_confirmation_required',
    'direct_payment_admin_rejected',
    'direct_payment_disputed',
    'direct_payment_timeout',
    'direct_payment_admin_paid',
    'direct_collateral_released',
    'worker_credit_released'
  ));

alter table public.worker_payment_ledger
  add column if not exists settlement_state text default 'pending';

update public.worker_payment_ledger as ledger
set settlement_state = case
  when job.payment_status in ('received', 'cash_confirmed', 'manual_verified', 'direct_paid')
    or job.status = 'paid'::public.job_status and job.payment_status in ('received', 'cash_confirmed', 'manual_verified', 'direct_paid')
    then 'admin_verified'
  when job.payment_status in ('manual_reconcile_required', 'direct_reconcile_required')
    then 'admin_rejected'
  when payment_order.status in (
    'manual_customer_claimed',
    'manual_reconcile_required',
    'direct_awaiting_customer_confirmation',
    'direct_awaiting_worker_confirmation',
    'direct_admin_confirmation_required'
  ) then 'customer_claimed'
  else 'pending'
end
from public.jobs as job
left join public.job_payment_orders as payment_order on payment_order.job_id = job.id
where job.id = ledger.job_id
  and (ledger.settlement_state is null or ledger.settlement_state = 'pending');

alter table public.worker_payment_ledger
  alter column settlement_state set default 'pending',
  alter column settlement_state set not null;

alter table public.worker_payment_ledger
  add constraint worker_payment_ledger_settlement_state_check
  check (settlement_state in ('pending', 'customer_claimed', 'admin_verified', 'admin_rejected'));

create index if not exists worker_payment_ledger_worker_settlement_state_idx
  on public.worker_payment_ledger (worker_id, settlement_state, payment_state, created_at desc);

-- The trigger is the last line of defence for legacy callers: no order status
-- can make a salary look verified without a server-side admin decision.
create or replace function private.sync_worker_payment_settlement_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_hold_until timestamptz := coalesce(new.hold_until, pg_catalog.clock_timestamp() + interval '24 hours');
begin
  if new.status = 'manual_customer_claimed' then
    update public.worker_payment_ledger
    set settlement_state = 'customer_claimed'
    where job_id = new.job_id;
  elsif new.status = 'manual_reconcile_required' then
    update public.worker_payment_ledger
    set settlement_state = 'admin_rejected', payment_state = 'reversed', available_at = null
    where job_id = new.job_id;
  elsif new.status = 'manual_verified' then
    update public.worker_payment_ledger
    set settlement_state = 'admin_verified'
    where job_id = new.job_id;
  elsif new.status = 'direct_admin_confirmation_required' then
    insert into public.worker_payment_ledger (
      job_id,
      worker_id,
      payment_provider,
      payment_state,
      settlement_state,
      gross_amount,
      platform_fee,
      worker_net,
      commission_level,
      commission_rate_bps
    ) values (
      new.job_id,
      new.worker_id,
      'direct_worker',
      'pending',
      'customer_claimed',
      new.gross_amount,
      new.platform_fee,
      new.worker_net,
      1,
      1500
    ) on conflict (job_id) do update
      set settlement_state = 'customer_claimed';
  elsif new.status = 'direct_reconcile_required' then
    update public.worker_payment_ledger
    set settlement_state = 'admin_rejected', payment_state = 'reversed', available_at = null
    where job_id = new.job_id;
  elsif new.status = 'direct_paid' then
    insert into public.worker_payment_ledger (
      job_id,
      worker_id,
      payment_provider,
      payment_state,
      settlement_state,
      gross_amount,
      platform_fee,
      worker_net,
      commission_level,
      commission_rate_bps,
      available_at
    ) values (
      new.job_id,
      new.worker_id,
      'direct_worker',
      'on_hold',
      'admin_verified',
      new.gross_amount,
      new.platform_fee,
      new.worker_net,
      1,
      1500,
      v_hold_until
    ) on conflict (job_id) do update
      set settlement_state = 'admin_verified',
          payment_state = case when worker_payment_ledger.payment_state = 'reversed' then 'on_hold' else worker_payment_ledger.payment_state end,
          available_at = case when worker_payment_ledger.payment_state = 'reversed' then v_hold_until else worker_payment_ledger.available_at end;
  end if;
  return new;
end;
$function$;

drop trigger if exists job_payment_order_sync_worker_settlement on public.job_payment_orders;
create trigger job_payment_order_sync_worker_settlement
after insert or update of status on public.job_payment_orders
for each row execute function private.sync_worker_payment_settlement_state();

revoke all on function private.sync_worker_payment_settlement_state() from public, anon, authenticated;
grant execute on function private.sync_worker_payment_settlement_state() to service_role;

-- Preserve the existing direct-payment selection guards while making a repeat
-- selection return the new Admin-confirmation state instead of a null status.
do $function$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef('public.select_direct_worker_payment(uuid, uuid, text)'::pg_catalog.regprocedure)
  into v_definition;
  if v_definition is null or position(
    $$when 'direct_awaiting_worker_confirmation' then 'awaiting_worker_confirmation'$$ in v_definition
  ) = 0 then
    raise exception 'select_direct_worker_payment definition is not compatible with settlement v2';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    $$when 'direct_awaiting_worker_confirmation' then 'awaiting_worker_confirmation'$$,
    $$when 'direct_awaiting_worker_confirmation' then 'awaiting_worker_confirmation'
        when 'direct_admin_confirmation_required' then 'awaiting_admin_confirmation'$$
  );
  execute v_definition;
end;
$function$;

-- Customer acknowledgement creates a provisional Worker salary snapshot. The
-- function is idempotent and never verifies or pays the order.
create or replace function public.recognize_customer_payment_claim(
  p_job_id uuid,
  p_customer_id uuid
)
returns table (
  ok boolean,
  error_code text,
  job_id uuid,
  payment_method text,
  settlement_state text,
  direct_status text,
  status public.job_status,
  salary_visible boolean,
  response_deadline timestamptz,
  notification_required boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_job public.jobs%rowtype;
  v_order public.job_payment_orders%rowtype;
  v_previous_status text;
  v_was_customer_confirmed boolean;
  v_notification_required boolean := false;
begin
  if p_job_id is null or p_customer_id is null then
    return query select false, 'INVALID_INPUT', p_job_id, null::text, null::text, null::text, null::public.job_status, false, null::timestamptz, false;
    return;
  end if;

  select job.* into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;
  if not found or v_job.customer_id is distinct from p_customer_id then
    return query select false, 'JOB_NOT_FOUND', p_job_id, null::text, null::text, null::text, null::public.job_status, false, null::timestamptz, false;
    return;
  end if;

  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.job_id = p_job_id
  for update;
  if not found then
    return query select false, 'PAYMENT_ORDER_NOT_FOUND', v_job.id, null::text, null::text, null::text, v_job.status, false, null::timestamptz, false;
    return;
  end if;

  if v_order.payment_method = 'platform_bank_manual' then
    if v_order.status = 'manual_reconcile_required' then
      update public.worker_payment_ledger
      set settlement_state = 'admin_rejected', payment_state = 'reversed', available_at = null
      where job_id = v_job.id;
      return query select
        true,
        null::text,
        v_job.id,
        v_order.payment_method,
        'admin_rejected'::text,
        null::text,
        v_job.status,
        false,
        v_order.response_deadline,
        false;
      return;
    end if;
    if v_order.status not in ('manual_customer_claimed', 'manual_verified') then
      return query select false, 'INVALID_STATUS', v_job.id, v_order.payment_method, null::text, null::text, v_job.status, false, v_order.response_deadline, false;
      return;
    end if;
    update public.worker_payment_ledger
    set settlement_state = case when v_order.status = 'manual_verified' then 'admin_verified' else 'customer_claimed' end
    where job_id = v_job.id;
    if not found then
      return query select false, 'WORKER_LEDGER_INVALID', v_job.id, v_order.payment_method, null::text, null::text, v_job.status, false, v_order.response_deadline, false;
      return;
    end if;
    return query select
      true,
      null::text,
      v_job.id,
      v_order.payment_method,
      case when v_order.status = 'manual_verified' then 'admin_verified' else 'customer_claimed' end,
      null::text,
      v_job.status,
      true,
      v_order.response_deadline,
      false;
    return;
  end if;

  if v_order.payment_method <> 'direct_worker' then
    return query select false, 'PAYMENT_METHOD_UNSUPPORTED', v_job.id, v_order.payment_method, null::text, null::text, v_job.status, false, v_order.response_deadline, false;
    return;
  end if;

  v_previous_status := v_order.status;
  v_was_customer_confirmed := v_order.customer_confirmed_at is not null;
  if v_order.status = 'direct_paid' then
    return query select true, null::text, v_job.id, v_order.payment_method, 'admin_verified', 'paid', 'paid'::public.job_status, true, v_order.response_deadline, false;
    return;
  end if;
  if v_order.status = 'direct_reconcile_required' then
    return query select true, null::text, v_job.id, v_order.payment_method, 'admin_rejected', 'reconcile_required', v_job.status, true, v_order.response_deadline, false;
    return;
  end if;
  if v_order.status not in ('direct_awaiting_customer_confirmation', 'direct_awaiting_worker_confirmation', 'direct_admin_confirmation_required') then
    return query select false, 'INVALID_STATUS', v_job.id, v_order.payment_method, null::text, null::text, v_job.status, false, v_order.response_deadline, false;
    return;
  end if;

  update public.job_payment_orders
  set
    customer_confirmed_at = coalesce(customer_confirmed_at, pg_catalog.clock_timestamp()),
    status = 'direct_admin_confirmation_required'
  where id = v_order.id
  returning * into v_order;

  update public.jobs
  set payment_status = 'direct_admin_confirmation_required', payment_updated_at = pg_catalog.clock_timestamp()
  where id = v_job.id
    and status = 'payment_pending'::public.job_status;

  if not v_was_customer_confirmed or v_previous_status <> v_order.status then
    v_notification_required := true;
    insert into public.job_payment_reconciliation_events (
      payment_order_id, job_id, actor_id, event_type, safe_metadata
    ) values (
      v_order.id,
      v_job.id,
      p_customer_id,
      'direct_payment_admin_confirmation_required',
      jsonb_build_object('salary_visibility', 'provisional', 'payment_mode', 'direct_worker')
    );
  end if;

  return query select
    true,
    null::text,
    v_job.id,
    v_order.payment_method,
    'customer_claimed'::text,
    'awaiting_admin_confirmation'::text,
    'payment_pending'::public.job_status,
    true,
    v_order.response_deadline,
    v_notification_required;
end;
$function$;

revoke all on function public.recognize_customer_payment_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.recognize_customer_payment_claim(uuid, uuid) to service_role;

-- Worker acknowledgement is informational. It can move a direct order to the
-- Admin queue, but it cannot collect collateral or make the job paid.
create or replace function public.acknowledge_worker_cash_payment(
  p_job_id uuid,
  p_worker_id uuid,
  p_received boolean
)
returns table (
  ok boolean,
  error_code text,
  job_id uuid,
  status public.job_status,
  direct_status text,
  collateral_amount integer,
  response_deadline timestamptz,
  notification_required boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_job public.jobs%rowtype;
  v_order public.job_payment_orders%rowtype;
  v_reservation public.worker_direct_payment_collateral_reservations%rowtype;
  v_previous_status text;
  v_was_worker_confirmed boolean;
  v_notification_required boolean := false;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_job_id is null or p_worker_id is null or p_received is null then
    return query select false, 'INVALID_INPUT', p_job_id, null::public.job_status, null::text, null::integer, null::timestamptz, false;
    return;
  end if;

  select job.* into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;
  if not found or v_job.worker_id is distinct from p_worker_id then
    return query select false, 'AUTH_FORBIDDEN', p_job_id, null::public.job_status, null::text, null::integer, null::timestamptz, false;
    return;
  end if;

  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.job_id = p_job_id
  for update;
  select reservation.* into v_reservation
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.job_id = p_job_id
  for update;
  if not found or v_order.payment_method <> 'direct_worker' then
    return query select false, 'DIRECT_PAYMENT_NOT_FOUND', v_job.id, v_job.status, null::text, null::integer, v_order.response_deadline, false;
    return;
  end if;

  if v_order.status = 'direct_paid' then
    return query select true, null::text, v_job.id, 'paid'::public.job_status, 'paid', v_reservation.collateral_amount, v_order.response_deadline, false;
    return;
  end if;
  if v_order.status = 'direct_reconcile_required' then
    return query select true, null::text, v_job.id, 'payment_pending'::public.job_status, 'reconcile_required', v_reservation.collateral_amount, v_order.response_deadline, false;
    return;
  end if;
  if not p_received then
    update public.job_payment_orders
    set status = 'direct_reconcile_required'
    where id = v_order.id
    returning * into v_order;
    update public.jobs
    set payment_status = 'direct_reconcile_required', payment_failure_reason = 'direct_payment_disputed', payment_updated_at = v_now
    where id = v_job.id;
    insert into public.job_payment_reconciliation_events (payment_order_id, job_id, actor_id, event_type, reason_code)
    values (v_order.id, v_job.id, p_worker_id, 'direct_payment_disputed', 'worker_disagreed');
    return query select true, null::text, v_job.id, 'payment_pending'::public.job_status, 'reconcile_required', v_reservation.collateral_amount, v_order.response_deadline, true;
    return;
  end if;

  v_previous_status := v_order.status;
  v_was_worker_confirmed := v_order.worker_confirmed_at is not null;
  update public.job_payment_orders
  set worker_confirmed_at = coalesce(worker_confirmed_at, v_now),
      status = case when customer_confirmed_at is not null then 'direct_admin_confirmation_required' else 'direct_awaiting_customer_confirmation' end
  where id = v_order.id
  returning * into v_order;

  update public.jobs
  set payment_status = case when v_order.status = 'direct_admin_confirmation_required' then 'direct_admin_confirmation_required' else 'direct_awaiting_confirmation' end,
      payment_updated_at = v_now
  where id = v_job.id
    and status = 'payment_pending'::public.job_status;

  if not v_was_worker_confirmed or v_previous_status <> v_order.status then
    insert into public.job_payment_reconciliation_events (payment_order_id, job_id, actor_id, event_type, safe_metadata)
    values (
      v_order.id,
      v_job.id,
      p_worker_id,
      case when v_order.status = 'direct_admin_confirmation_required' then 'direct_payment_admin_confirmation_required' else 'direct_payment_worker_confirmed' end,
      jsonb_build_object('payment_mode', 'direct_worker')
    );
  end if;
  v_notification_required := v_order.status = 'direct_admin_confirmation_required' and (not v_was_worker_confirmed or v_previous_status <> v_order.status);

  return query select
    true,
    null::text,
    v_job.id,
    'payment_pending'::public.job_status,
    case when v_order.status = 'direct_admin_confirmation_required' then 'awaiting_admin_confirmation' else 'awaiting_customer_confirmation' end,
    v_reservation.collateral_amount,
    v_order.response_deadline,
    v_notification_required;
end;
$function$;

revoke all on function public.acknowledge_worker_cash_payment(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.acknowledge_worker_cash_payment(uuid, uuid, boolean) to service_role;

-- Admin cash reconciliation collects only the platform commission. The
-- Worker net amount remains the salary credit; any shortfall is due, never a
-- fabricated negative balance.
create or replace function public.decide_cash_payment_reconciliation(
  p_payment_order_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_reason_code text default null
)
returns table (
  ok boolean,
  error_code text,
  outcome text,
  job_id uuid,
  status public.job_status,
  payment_status text,
  hold_until timestamptz,
  cash_commission_collected integer,
  cash_commission_due integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_order public.job_payment_orders%rowtype;
  v_job public.jobs%rowtype;
  v_reservation public.worker_direct_payment_collateral_reservations%rowtype;
  v_ledger public.worker_payment_ledger%rowtype;
  v_cash_ledger public.worker_cash_commission_ledger%rowtype;
  v_decision text := lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_reason text := nullif(left(pg_catalog.btrim(coalesce(p_reason_code, '')), 80), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_hold_until timestamptz := v_now + interval '24 hours';
  v_collected integer;
  v_due integer;
begin
  perform private.assert_finance_reconciler(p_actor_id);
  if p_payment_order_id is null or v_decision not in ('confirm', 'reject') then
    return query select false, 'INVALID_INPUT', null::text, null::uuid, null::public.job_status, null::text, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.id = p_payment_order_id
  for update;
  if not found then
    return query select false, 'PAYMENT_ORDER_NOT_FOUND', null::text, null::uuid, null::public.job_status, null::text, null::timestamptz, null::integer, null::integer;
    return;
  end if;
  select job.* into v_job from public.jobs as job where job.id = v_order.job_id for update;
  if not found or v_order.payment_method <> 'direct_worker' then
    return query select false, 'PAYMENT_ORDER_NOT_FOUND', null::text, v_order.job_id, null::public.job_status, null::text, null::timestamptz, null::integer, null::integer;
    return;
  end if;
  select reservation.* into v_reservation
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.payment_order_id = v_order.id
  for update;

  if v_order.status = 'direct_paid' and v_decision = 'confirm' then
    select cash_ledger.* into v_cash_ledger from public.worker_cash_commission_ledger as cash_ledger where cash_ledger.job_id = v_job.id;
    return query select true, null::text, 'confirmed'::text, v_job.id, 'paid'::public.job_status, 'direct_paid'::text, v_order.hold_until,
      coalesce(v_cash_ledger.cash_commission_collected, v_order.platform_fee), coalesce(v_cash_ledger.cash_commission_due, 0);
    return;
  end if;
  if v_order.status = 'direct_reconcile_required' and v_decision = 'reject' then
    return query select true, null::text, 'rejected'::text, v_job.id, 'payment_pending'::public.job_status, 'direct_reconcile_required'::text, null::timestamptz, 0, v_order.platform_fee;
    return;
  end if;
  if v_order.status <> 'direct_admin_confirmation_required' or v_job.status <> 'payment_pending'::public.job_status then
    return query select false, 'INVALID_STATUS', null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  if v_decision = 'reject' then
    update public.job_payment_orders
    set status = 'direct_reconcile_required', verified_by = p_actor_id, verified_at = v_now
    where id = v_order.id
    returning * into v_order;
    update public.worker_direct_payment_collateral_reservations
    set status = 'released', resolved_at = v_now, resolved_by = p_actor_id
    where id = v_reservation.id and status = 'held';
    update public.worker_payment_ledger
    set settlement_state = 'admin_rejected', payment_state = 'reversed', available_at = null
    where job_id = v_job.id;
    update public.jobs
    set payment_status = 'direct_reconcile_required', payment_failure_reason = coalesce(v_reason, 'admin_rejected'), payment_updated_at = v_now
    where id = v_job.id;
    insert into public.job_payment_reconciliation_events (payment_order_id, job_id, actor_id, event_type, reason_code)
    values (v_order.id, v_job.id, p_actor_id, 'direct_payment_admin_rejected', coalesce(v_reason, 'admin_rejected'));
    return query select true, null::text, 'rejected'::text, v_job.id, 'payment_pending'::public.job_status, 'direct_reconcile_required'::text, null::timestamptz, 0, v_order.platform_fee;
    return;
  end if;

  v_collected := least(v_order.platform_fee, greatest(0, coalesce(v_reservation.collateral_amount, 0)));
  v_due := v_order.platform_fee - v_collected;
  insert into public.worker_cash_commission_ledger (
    job_id, worker_id, gross_amount, platform_fee, worker_net,
    commission_level, commission_rate_bps, cash_commission_collected, cash_commission_due, confirmed_at
  ) values (
    v_job.id, v_job.worker_id, v_order.gross_amount, v_order.platform_fee, v_order.worker_net,
    1, 1500, v_collected, v_due, v_now
  ) on conflict (job_id) do nothing;

  if v_reservation.id is not null then
    update public.worker_direct_payment_collateral_reservations
    set status = 'collected', resolved_at = v_now, resolved_by = p_actor_id
    where id = v_reservation.id and status = 'held';
  end if;

  select ledger.* into v_ledger from public.worker_payment_ledger as ledger where ledger.job_id = v_job.id for update;
  if not found then
    insert into public.worker_payment_ledger (
      job_id, worker_id, payment_provider, payment_state, settlement_state,
      gross_amount, platform_fee, worker_net, commission_level, commission_rate_bps, available_at
    ) values (
      v_job.id, v_job.worker_id, 'direct_worker', 'on_hold', 'admin_verified',
      v_order.gross_amount, v_order.platform_fee, v_order.worker_net, 1, 1500, v_hold_until
    ) returning * into v_ledger;
  else
    update public.worker_payment_ledger
    set payment_state = 'on_hold', settlement_state = 'admin_verified', available_at = v_hold_until
    where id = v_ledger.id;
  end if;

  update public.job_payment_orders
  set status = 'direct_paid', amount_received = v_order.gross_amount, credited_at = v_now,
      verified_by = p_actor_id, verified_at = v_now, hold_until = v_hold_until
  where id = v_order.id
  returning * into v_order;
  update public.jobs
  set paid_at = coalesce(paid_at, v_now), payment_amount_received = v_order.gross_amount,
      payment_failure_reason = null, payment_received_at = v_now,
      payment_status = 'direct_paid', payment_updated_at = v_now, status = 'paid'::public.job_status
  where id = v_job.id;
  insert into public.job_events (job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata)
  values (
    v_job.id, p_actor_id, 'admin'::public.user_role, 'payment_confirmed',
    'payment_pending'::public.job_status, 'paid'::public.job_status,
    jsonb_build_object('payment_mode', 'direct_worker', 'confirmation_mode', 'admin_cash_reconciliation', 'cash_commission_due', v_due)
  );
  insert into public.job_payment_reconciliation_events (payment_order_id, job_id, actor_id, event_type, safe_metadata)
  values (
    v_order.id, v_job.id, p_actor_id, 'direct_payment_admin_paid',
    jsonb_build_object('cash_commission_collected', v_collected, 'cash_commission_due', v_due, 'worker_net_preserved', v_order.worker_net)
  );
  return query select true, null::text, 'confirmed'::text, v_job.id, 'paid'::public.job_status, 'direct_paid'::text, v_hold_until, v_collected, v_due;
end;
$function$;

revoke all on function public.decide_cash_payment_reconciliation(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.decide_cash_payment_reconciliation(uuid, uuid, text, text) to service_role;

-- One safe wrapper makes repeated Admin confirmation idempotent for the
-- existing manual-bank RPC without weakening its amount/reference checks.
create or replace function public.decide_manual_bank_payment_reconciliation_idempotent(
  p_payment_order_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_amount_received integer default null,
  p_credited_at timestamptz default null,
  p_bank_reference_hash text default null,
  p_bank_reference_suffix text default null,
  p_reason_code text default null
)
returns table (
  ok boolean,
  error_code text,
  outcome text,
  job_id uuid,
  status public.job_status,
  payment_status text,
  hold_until timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_order public.job_payment_orders%rowtype;
begin
  return query select * from public.decide_manual_bank_payment_reconciliation(
    p_payment_order_id,
    p_actor_id,
    p_decision,
    p_amount_received,
    p_credited_at,
    p_bank_reference_hash,
    p_bank_reference_suffix,
    p_reason_code
  );
exception when others then
  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.id = p_payment_order_id;
  if p_decision = 'confirm' and v_order.status = 'manual_verified' then
    return query select true, null::text, 'paid'::text, v_order.job_id, 'paid'::public.job_status, 'manual_verified'::text, v_order.hold_until;
    return;
  end if;
  if p_decision = 'reconcile_required' and v_order.status = 'manual_reconcile_required' then
    return query select true, null::text, 'reconcile_required'::text, v_order.job_id, 'payment_pending'::public.job_status, 'manual_reconcile_required'::text, null::timestamptz;
    return;
  end if;
  raise;
end;
$function$;

revoke all on function public.decide_manual_bank_payment_reconciliation_idempotent(uuid, uuid, text, integer, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.decide_manual_bank_payment_reconciliation_idempotent(uuid, uuid, text, integer, timestamptz, text, text, text) to service_role;

-- Add the server-owned payout eligibility timestamp and fail closed before an
-- Admin can claim or mark a request paid.
alter table public.worker_withdrawal_requests
  add column if not exists eligible_at timestamptz;

update public.worker_withdrawal_requests
set eligible_at = requested_at + interval '24 hours'
where eligible_at is null;

alter table public.worker_withdrawal_requests
  alter column eligible_at set default (now() + interval '24 hours'),
  alter column eligible_at set not null;

alter table public.worker_withdrawal_requests
  add constraint worker_withdrawal_requests_eligibility_check
  check (eligible_at >= requested_at);

create or replace function private.set_worker_withdrawal_eligible_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  new.eligible_at := new.requested_at + interval '24 hours';
  return new;
end;
$function$;

drop trigger if exists worker_withdrawal_requests_eligibility_at_insert on public.worker_withdrawal_requests;
create trigger worker_withdrawal_requests_eligibility_at_insert
before insert on public.worker_withdrawal_requests
for each row execute function private.set_worker_withdrawal_eligible_at();

create or replace function private.protect_worker_withdrawal_request_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.worker_id is distinct from old.worker_id
    or new.payout_method_id is distinct from old.payout_method_id
    or new.client_request_id is distinct from old.client_request_id
    or new.amount_vnd is distinct from old.amount_vnd
    or new.available_balance_before_vnd is distinct from old.available_balance_before_vnd
    or new.bank_key is distinct from old.bank_key
    or new.bank_name is distinct from old.bank_name
    or new.account_holder_name is distinct from old.account_holder_name
    or new.bank_account is distinct from old.bank_account
    or new.bank_account_masked is distinct from old.bank_account_masked
    or new.requested_at is distinct from old.requested_at
    or new.eligible_at is distinct from old.eligible_at
  then
    raise exception 'worker withdrawal request financial snapshot is immutable';
  end if;
  return new;
end;
$function$;

revoke all on function private.protect_worker_withdrawal_request_snapshot() from public, anon, authenticated;
grant execute on function private.protect_worker_withdrawal_request_snapshot() to service_role;

create or replace function private.enforce_worker_withdrawal_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  if new.status in ('processing', 'paid')
    and new.status is distinct from old.status
    and (
      new.eligible_at is null
      or new.eligible_at <> new.requested_at + interval '24 hours'
      or new.eligible_at > pg_catalog.clock_timestamp()
    )
  then
    raise exception 'WITHDRAWAL_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

drop trigger if exists worker_withdrawal_requests_eligibility_guard on public.worker_withdrawal_requests;
create trigger worker_withdrawal_requests_eligibility_guard
before update on public.worker_withdrawal_requests
for each row execute function private.enforce_worker_withdrawal_eligibility();

revoke all on function private.set_worker_withdrawal_eligible_at() from public, anon, authenticated;
grant execute on function private.set_worker_withdrawal_eligible_at() to service_role;
revoke all on function private.enforce_worker_withdrawal_eligibility() from public, anon, authenticated;
grant execute on function private.enforce_worker_withdrawal_eligibility() to service_role;

create or replace function public.get_worker_earnings_summary_v2(
  p_worker_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_platform_fee_rate numeric default 0.10
)
returns table (
  worker_id uuid,
  total_jobs_paid bigint,
  gross_earnings bigint,
  platform_fee_total bigint,
  net_earnings bigint,
  available_balance bigint,
  withdrawal_reserved_amount bigint,
  withdrawn_total bigint,
  cash_commission_collected_total bigint,
  cash_commission_due_total bigint,
  pending_payment_count bigint,
  pending_payment_amount bigint,
  provisional_payment_count bigint,
  provisional_payment_amount bigint,
  on_hold_amount bigint,
  current_commission_level smallint,
  current_commission_rate_bps integer,
  withdrawal_eligible_at timestamptz,
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
  if p_platform_fee_rate is null or p_platform_fee_rate < 0 or p_platform_fee_rate > 1 then
    raise exception 'invalid platform fee rate' using errcode = '22023';
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
      ledger.settlement_state,
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
      (ledger.settlement_state = 'admin_verified'
        or (job.status = 'paid'::public.job_status and job.payment_status in ('received', 'cash_confirmed', 'manual_verified', 'direct_paid'))
      ) as is_verified_credit,
      coalesce(job.paid_at, ledger.available_at, ledger.created_at) as recorded_at
    from public.worker_payment_ledger as ledger
    left join public.jobs as job on job.id = ledger.job_id
    where ledger.worker_id = p_worker_id
  ), all_cash_ledger as (
    select
      cash_ledger.id,
      cash_ledger.job_id,
      'cash_commission_debit'::text as entry_type,
      case when cash_ledger.cash_commission_due = reconciliations.amount then 'cash_collected'::text else 'cash_reconciliation_due'::text end as payment_state,
      'admin_verified'::text as settlement_state,
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
      true as is_verified_credit,
      cash_ledger.confirmed_at as recorded_at
    from public.worker_cash_commission_ledger as cash_ledger
    left join public.jobs as job on job.id = cash_ledger.job_id
    cross join lateral (
      select least(cash_ledger.cash_commission_due::bigint, coalesce(sum(reconciliation.amount), 0))::integer as amount
      from public.worker_cash_commission_reconciliations as reconciliation
      where reconciliation.cash_commission_ledger_id = cash_ledger.id
    ) as reconciliations
    where cash_ledger.worker_id = p_worker_id
  ), all_worker_transactions as (
    select * from all_worker_ledger
    union all
    select * from all_cash_ledger
  ), filtered_transactions as (
    select * from all_worker_transactions as transaction
    where (p_from is null or transaction.recorded_at >= p_from)
      and (p_to is null or transaction.recorded_at <= p_to)
  ), recognized_transactions as (
    select * from filtered_transactions as transaction
    where transaction.entry_type = 'cash_commission_debit'
      or (transaction.entry_type = 'worker_credit' and (transaction.payment_state = 'available' or (transaction.payment_state = 'on_hold' and transaction.is_verified_credit)))
  ), provisional_transactions as (
    select * from filtered_transactions as transaction
    where transaction.entry_type = 'worker_credit'
      and transaction.settlement_state = 'customer_claimed'
      and transaction.payment_state = 'pending'
  ), available_credits as (
    select coalesce(sum(ledger.worker_net), 0)::bigint as amount
    from all_worker_ledger as ledger
    where ledger.payment_state = 'available' and ledger.settlement_state <> 'admin_rejected'
  ), cash_commission_totals as (
    select coalesce(sum(cash_commission_collected), 0)::bigint as cash_commission_collected_total,
      coalesce(sum(cash_commission_due), 0)::bigint as cash_commission_due_total
    from all_cash_ledger
  ), withdrawal_totals as (
    select coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing')), 0)::bigint as withdrawal_reserved_amount,
      coalesce(sum(request.amount_vnd) filter (where request.status = 'paid'), 0)::bigint as withdrawn_total,
      min(request.eligible_at) filter (where request.status in ('pending', 'processing') and request.eligible_at > pg_catalog.clock_timestamp()) as withdrawal_eligible_at
    from public.worker_withdrawal_requests as request
    where request.worker_id = p_worker_id
  ), daily_recognized as (
    select (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date as paid_date,
      sum(transaction.gross_amount)::bigint as gross_earnings,
      sum(transaction.platform_fee)::bigint as platform_fee_total,
      sum(transaction.worker_net)::bigint as net_earnings,
      count(*)::bigint as paid_job_count
    from recognized_transactions as transaction
    where transaction.entry_type = 'worker_credit'
    group by (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date
  ), recent_transactions as (
    select * from filtered_transactions as transaction
    order by transaction.recorded_at desc, transaction.id desc
    limit 20
  )
  select
    p_worker_id,
    coalesce((select count(*) from recognized_transactions where entry_type = 'worker_credit'), 0)::bigint,
    coalesce((select sum(gross_amount) from recognized_transactions where entry_type = 'worker_credit'), 0)::bigint,
    coalesce((select sum(platform_fee) from recognized_transactions where entry_type = 'worker_credit'), 0)::bigint,
    coalesce((select sum(worker_net) from recognized_transactions where entry_type = 'worker_credit'), 0)::bigint,
    greatest(0::bigint, available_credits.amount - cash_commission_totals.cash_commission_collected_total - withdrawal_totals.withdrawal_reserved_amount - withdrawal_totals.withdrawn_total),
    withdrawal_totals.withdrawal_reserved_amount,
    withdrawal_totals.withdrawn_total,
    cash_commission_totals.cash_commission_collected_total,
    cash_commission_totals.cash_commission_due_total,
    coalesce((select count(*) from all_worker_ledger as ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger as ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select count(*) from provisional_transactions), 0)::bigint,
    coalesce((select sum(transaction.worker_net) from provisional_transactions as transaction), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger as ledger where ledger.payment_state = 'on_hold' and ledger.is_verified_credit), 0)::bigint,
    tier.commission_level,
    tier.commission_rate_bps,
    withdrawal_totals.withdrawal_eligible_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'job_id', transaction.job_id,
      'display_code', transaction.display_code,
      'entry_type', transaction.entry_type,
      'payment_state', transaction.payment_state,
      'settlement_state', transaction.settlement_state,
      'gross_amount', transaction.gross_amount,
      'platform_fee', transaction.platform_fee,
      'worker_net', transaction.worker_net,
      'commission_level', transaction.commission_level,
      'commission_rate_bps', transaction.commission_rate_bps,
      'cash_commission_collected', transaction.cash_commission_collected,
      'cash_commission_due', transaction.cash_commission_due,
      'recorded_at', transaction.recorded_at,
      'available_at', transaction.available_at
    ) order by transaction.recorded_at desc, transaction.id desc) from recent_transactions as transaction), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'date', daily.paid_date,
      'gross_earnings', daily.gross_earnings,
      'platform_fee_total', daily.platform_fee_total,
      'net_earnings', daily.net_earnings,
      'paid_job_count', daily.paid_job_count
    ) order by daily.paid_date desc) from (select * from daily_recognized order by paid_date desc limit 366) as daily), '[]'::jsonb),
    p_from,
    p_to
  from current_tier as tier
  cross join available_credits
  cross join cash_commission_totals
  cross join withdrawal_totals;
end;
$function$;

revoke execute on function public.get_worker_earnings_summary_v2(uuid, timestamptz, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.get_worker_earnings_summary_v2(uuid, timestamptz, timestamptz, numeric) to service_role;

create or replace function public.get_admin_worker_finance_snapshot(
  p_actor_id uuid,
  p_worker_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_platform_fee_rate numeric default 0.10
)
returns table (
  worker_id uuid,
  total_jobs_paid bigint,
  gross_earnings bigint,
  platform_fee_total bigint,
  net_earnings bigint,
  available_balance bigint,
  withdrawal_reserved_amount bigint,
  withdrawn_total bigint,
  cash_commission_collected_total bigint,
  cash_commission_due_total bigint,
  pending_payment_count bigint,
  pending_payment_amount bigint,
  provisional_payment_count bigint,
  provisional_payment_amount bigint,
  on_hold_amount bigint,
  current_commission_level smallint,
  current_commission_rate_bps integer,
  withdrawal_eligible_at timestamptz,
  recent_transactions jsonb,
  daily_earnings jsonb,
  from_date timestamptz,
  to_date timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $function$
begin
  perform private.assert_finance_reader(p_actor_id);
  return query
  select summary.*
  from public.get_worker_earnings_summary_v2(
    p_worker_id,
    p_from,
    p_to,
    p_platform_fee_rate
  ) as summary;
end;
$function$;

revoke execute on function public.get_admin_worker_finance_snapshot(uuid, uuid, timestamptz, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.get_admin_worker_finance_snapshot(uuid, uuid, timestamptz, timestamptz, numeric) to service_role;

commit;
