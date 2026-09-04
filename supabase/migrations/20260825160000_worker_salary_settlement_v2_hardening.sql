begin;

do $verification$
begin
  if exists (
    select 1
    from public.job_payment_orders as payment_order
    join public.jobs as job on job.id = payment_order.job_id
    left join public.worker_direct_payment_collateral_reservations as reservation
      on reservation.payment_order_id = payment_order.id
    where payment_order.payment_method = 'direct_worker'
      and (
        job.worker_id is distinct from payment_order.worker_id
        or job.worker_commission_level is null
        or job.worker_commission_level < 1
        or job.worker_commission_rate_bps is null
        or job.worker_commission_rate_bps not between 0 and 1500
        or payment_order.gross_amount <> payment_order.platform_fee + payment_order.worker_net
        or payment_order.platform_fee <> round(
          payment_order.gross_amount::numeric * job.worker_commission_rate_bps / 10000.0
        )
        or reservation.id is null
        or reservation.worker_id is distinct from payment_order.worker_id
        or reservation.collateral_amount <> payment_order.platform_fee
      )
  ) then
    raise exception 'existing direct-payment rows need commission reconciliation before salary hardening';
  end if;
end;
$verification$;

do $resolve_salary_rpc_ambiguities$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.recognize_customer_payment_claim(uuid,uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_rewritten := v_definition;
  if pg_catalog.strpos(v_rewritten, 'where job_id = v_job.id') > 0 then
    v_rewritten := pg_catalog.replace(
      v_rewritten,
      'where job_id = v_job.id',
      'where worker_payment_ledger.job_id = v_job.id'
    );
  elsif pg_catalog.strpos(v_rewritten, 'where worker_payment_ledger.job_id = v_job.id') = 0
    and pg_catalog.strpos(v_rewritten, 'where worker_ledger.job_id = v_job.id') = 0
  then
    raise exception 'customer payment claim ledger target was not found';
  end if;
  if pg_catalog.strpos(v_rewritten, 'where id = v_job.id') > 0 then
    v_rewritten := pg_catalog.replace(
      v_rewritten,
      'where id = v_job.id',
      'where jobs.id = v_job.id'
    );
  elsif pg_catalog.strpos(v_rewritten, 'where jobs.id = v_job.id') = 0
    and pg_catalog.strpos(v_rewritten, 'where job_target.id = v_job.id') = 0
  then
    raise exception 'customer payment claim job target was not found';
  end if;
  if pg_catalog.strpos(v_rewritten, 'and status = ''payment_pending''::public.job_status') > 0 then
    v_rewritten := pg_catalog.replace(
      v_rewritten,
      'and status = ''payment_pending''::public.job_status',
      'and jobs.status = ''payment_pending''::public.job_status'
    );
  elsif pg_catalog.strpos(v_rewritten, 'and jobs.status = ''payment_pending''::public.job_status') = 0
    and pg_catalog.strpos(v_rewritten, 'and job_target.status = ''payment_pending''::public.job_status') = 0
  then
    raise exception 'customer payment claim status target was not found';
  end if;
  if v_rewritten is distinct from v_definition then
    execute v_rewritten;
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.acknowledge_worker_cash_payment(uuid,uuid,boolean)'::pg_catalog.regprocedure
  ) into v_definition;
  v_rewritten := v_definition;
  if pg_catalog.strpos(v_rewritten, 'where id = v_job.id') > 0 then
    v_rewritten := pg_catalog.replace(
      v_rewritten,
      'where id = v_job.id',
      'where jobs.id = v_job.id'
    );
  elsif pg_catalog.strpos(v_rewritten, 'where jobs.id = v_job.id') = 0
    and pg_catalog.strpos(v_rewritten, 'where job_target.id = v_job.id') = 0
  then
    raise exception 'worker cash acknowledgement job target was not found';
  end if;
  if pg_catalog.strpos(v_rewritten, 'and status = ''payment_pending''::public.job_status') > 0 then
    v_rewritten := pg_catalog.replace(
      v_rewritten,
      'and status = ''payment_pending''::public.job_status',
      'and jobs.status = ''payment_pending''::public.job_status'
    );
  elsif pg_catalog.strpos(v_rewritten, 'and jobs.status = ''payment_pending''::public.job_status') = 0
    and pg_catalog.strpos(v_rewritten, 'and job_target.status = ''payment_pending''::public.job_status') = 0
  then
    raise exception 'worker cash acknowledgement status target was not found';
  end if;
  if v_rewritten is distinct from v_definition then
    execute v_rewritten;
  end if;
end;
$resolve_salary_rpc_ambiguities$;

create or replace function public.select_direct_worker_payment(
  p_job_id uuid,
  p_customer_id uuid,
  p_client_request_id text
)
returns table (
  ok boolean,
  error_code text,
  job_id uuid,
  status public.job_status,
  direct_status text,
  collateral_amount integer,
  response_deadline timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_order public.job_payment_orders%rowtype;
  v_reservation public.worker_direct_payment_collateral_reservations%rowtype;
  v_tier record;
  v_available_credits bigint;
  v_cash_commission_collected bigint;
  v_reserved_or_paid bigint;
  v_active_collateral bigint;
  v_available_balance bigint;
  v_collateral integer;
  v_has_existing_order boolean := false;
  v_worker_net integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_deadline timestamptz := v_now + interval '24 hours';
begin
  if p_job_id is null
    or p_customer_id is null
    or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
  then
    return query select false, 'INVALID_INPUT'::text, p_job_id, null::public.job_status, null::text, null::integer, null::timestamptz;
    return;
  end if;

  select job.* into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found or v_job.customer_id is distinct from p_customer_id then
    return query select false, 'JOB_NOT_FOUND'::text, p_job_id, null::public.job_status, null::text, null::integer, null::timestamptz;
    return;
  end if;
  if v_job.worker_id is null or v_job.final_price is null or v_job.final_price <= 0 then
    return query select false, 'INVALID_STATUS'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_job.worker_id::text, 0));

  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.job_id = v_job.id
  for update;
  v_has_existing_order := found;

  if v_has_existing_order and v_order.payment_method = 'direct_worker' then
    select reservation.* into v_reservation
    from public.worker_direct_payment_collateral_reservations as reservation
    where reservation.job_id = v_job.id
    for update;
    return query select
      true,
      null::text,
      v_job.id,
      v_job.status,
      case v_order.status
        when 'direct_awaiting_customer_confirmation' then 'awaiting_customer_confirmation'
        when 'direct_awaiting_worker_confirmation' then 'awaiting_worker_confirmation'
        when 'direct_admin_confirmation_required' then 'awaiting_admin_confirmation'
        when 'direct_reconcile_required' then 'reconcile_required'
        when 'direct_paid' then 'paid'
        else null
      end,
      v_reservation.collateral_amount,
      v_order.response_deadline;
    return;
  end if;

  if v_job.status = 'payment_pending'::public.job_status then
    if not v_has_existing_order or v_order.payment_method <> 'platform_bank_manual' or v_order.status <> 'manual_qr_ready' then
      return query select false, 'PAYMENT_ALREADY_CLAIMED'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz;
      return;
    end if;
  elsif v_job.status is distinct from 'confirmed_by_customer'::public.job_status then
    return query select false, 'INVALID_STATUS'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz;
    return;
  end if;

  select * into v_tier
  from private.resolve_job_commission_terms(v_job.id, v_job.worker_id);
  if not found
    or v_tier.commission_level is null
    or v_tier.commission_level < 1
    or v_tier.commission_rate_bps is null
    or v_tier.commission_rate_bps not between 0 and 1500
  then
    return query select false, 'WORKER_TIER_MISSING'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz;
    return;
  end if;

  select coalesce(sum(ledger.worker_net) filter (where ledger.payment_state = 'available'), 0)::bigint
  into v_available_credits
  from public.worker_payment_ledger as ledger
  where ledger.worker_id = v_job.worker_id;

  select coalesce(sum(
    cash_ledger.cash_commission_collected
    + least(
      cash_ledger.cash_commission_due,
      coalesce((
        select sum(reconciliation.amount)
        from public.worker_cash_commission_reconciliations as reconciliation
        where reconciliation.cash_commission_ledger_id = cash_ledger.id
      ), 0)::integer
    )
  ), 0)::bigint
  into v_cash_commission_collected
  from public.worker_cash_commission_ledger as cash_ledger
  where cash_ledger.worker_id = v_job.worker_id;

  select coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing', 'paid')), 0)::bigint
  into v_reserved_or_paid
  from public.worker_withdrawal_requests as request
  where request.worker_id = v_job.worker_id;

  select coalesce(sum(reservation.collateral_amount) filter (where reservation.status = 'held'), 0)::bigint
  into v_active_collateral
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.worker_id = v_job.worker_id;

  v_collateral := round(v_job.final_price::numeric * v_tier.commission_rate_bps / 10000.0);
  v_worker_net := v_job.final_price - v_collateral;
  v_available_balance := greatest(0::bigint, v_available_credits - v_cash_commission_collected - v_reserved_or_paid - v_active_collateral);
  if v_collateral <= 0 or v_worker_net <= 0 or v_available_balance < v_collateral then
    return query select false, 'INSUFFICIENT_COLLATERAL'::text, v_job.id, v_job.status, null::text, v_collateral, null::timestamptz;
    return;
  end if;

  if v_job.status = 'payment_pending'::public.job_status then
    delete from public.worker_payment_ledger as ledger
    where ledger.job_id = v_job.id
      and ledger.payment_provider = 'platform_bank_manual'
      and ledger.payment_state = 'pending';
    if not found then
      return query select false, 'PAYMENT_METHOD_LOCKED'::text, v_job.id, v_job.status, null::text, null::integer, null::timestamptz;
      return;
    end if;
  end if;

  if v_has_existing_order then
    update public.job_payment_orders
    set
      payment_method = 'direct_worker',
      status = 'direct_awaiting_customer_confirmation',
      platform_fee = v_collateral,
      worker_net = v_worker_net,
      payment_code = null,
      transfer_content = null,
      qr_image_url = null,
      client_request_id = p_client_request_id,
      response_deadline = v_deadline,
      customer_transfer_claimed_at = null,
      customer_transferred_at = null,
      sending_bank_code = null
    where id = v_order.id
    returning * into v_order;
  else
    insert into public.job_payment_orders (
      job_id, customer_id, worker_id, payment_method, status, gross_amount,
      platform_fee, worker_net, client_request_id, response_deadline
    ) values (
      v_job.id, p_customer_id, v_job.worker_id, 'direct_worker',
      'direct_awaiting_customer_confirmation', v_job.final_price,
      v_collateral, v_worker_net, p_client_request_id, v_deadline
    ) returning * into v_order;
  end if;

  insert into public.worker_direct_payment_collateral_reservations (
    job_id, payment_order_id, worker_id, collateral_amount, status
  ) values (
    v_job.id, v_order.id, v_job.worker_id, v_collateral, 'held'
  ) returning * into v_reservation;

  update public.jobs
  set
    gross_amount = v_job.final_price,
    platform_fee = v_collateral,
    worker_net = v_worker_net,
    worker_commission_level = v_tier.commission_level,
    worker_commission_rate_bps = v_tier.commission_rate_bps,
    payment_amount_received = null,
    payment_code = null,
    payment_expires_at = null,
    payment_failure_reason = null,
    payment_provider = 'direct_worker',
    payment_qr_image_url = null,
    payment_received_at = null,
    payment_status = 'direct_awaiting_confirmation',
    payment_transfer_content = null,
    payment_updated_at = v_now,
    sepay_reference_code = null,
    sepay_transaction_id = null,
    status = 'payment_pending'::public.job_status
  where id = v_job.id;

  insert into public.job_events (
    job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
  ) values (
    v_job.id,
    p_customer_id,
    'customer'::public.user_role,
    'customer_selected_direct_payment',
    v_job.status,
    'payment_pending'::public.job_status,
    pg_catalog.jsonb_build_object(
      'payment_mode', 'direct_worker',
      'commission_level', v_tier.commission_level,
      'collateral_rate_bps', v_tier.commission_rate_bps
    )
  );

  insert into public.job_payment_reconciliation_events (
    payment_order_id, job_id, actor_id, event_type, safe_metadata
  ) values (
    v_order.id, v_job.id, p_customer_id, 'direct_payment_selected',
    pg_catalog.jsonb_build_object(
      'commission_level', v_tier.commission_level,
      'collateral_rate_bps', v_tier.commission_rate_bps
    )
  );

  return query select
    true,
    null::text,
    v_job.id,
    'payment_pending'::public.job_status,
    'awaiting_customer_confirmation'::text,
    v_reservation.collateral_amount,
    v_deadline;
end;
$function$;

revoke all on function public.select_direct_worker_payment(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.select_direct_worker_payment(uuid, uuid, text)
  to service_role;

create or replace function private.sync_worker_payment_settlement_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_existing_ledger public.worker_payment_ledger%rowtype;
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
  elsif new.status in ('direct_admin_confirmation_required', 'direct_paid') then
    select job.* into v_job
    from public.jobs as job
    where job.id = new.job_id;

    if not found
      or v_job.worker_id is distinct from new.worker_id
      or v_job.worker_commission_level is null
      or v_job.worker_commission_level < 1
      or v_job.worker_commission_rate_bps is null
      or v_job.worker_commission_rate_bps not between 0 and 1500
      or new.gross_amount <> new.platform_fee + new.worker_net
      or new.platform_fee <> round(
        new.gross_amount::numeric * v_job.worker_commission_rate_bps / 10000.0
      )
    then
      raise exception 'INVALID_DIRECT_PAYMENT_BALANCE' using errcode = '23514';
    end if;

    select ledger.* into v_existing_ledger
    from public.worker_payment_ledger as ledger
    where ledger.job_id = new.job_id;
    if found and (
      v_existing_ledger.worker_id is distinct from new.worker_id
      or v_existing_ledger.payment_provider <> 'direct_worker'
      or v_existing_ledger.gross_amount <> new.gross_amount
      or v_existing_ledger.platform_fee <> new.platform_fee
      or v_existing_ledger.worker_net <> new.worker_net
      or v_existing_ledger.commission_level <> v_job.worker_commission_level
      or v_existing_ledger.commission_rate_bps <> v_job.worker_commission_rate_bps
    ) then
      raise exception 'INVALID_DIRECT_PAYMENT_LEDGER' using errcode = '23514';
    end if;

    insert into public.worker_payment_ledger as current_ledger (
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
      case when new.status = 'direct_paid' then 'on_hold' else 'pending' end,
      case when new.status = 'direct_paid' then 'admin_verified' else 'customer_claimed' end,
      new.gross_amount,
      new.platform_fee,
      new.worker_net,
      v_job.worker_commission_level,
      v_job.worker_commission_rate_bps,
      case when new.status = 'direct_paid' then v_hold_until else null end
    ) on conflict (job_id) do update
      set settlement_state = excluded.settlement_state,
          payment_state = case
            when new.status = 'direct_paid' and current_ledger.payment_state = 'reversed'
              then 'on_hold'
            else current_ledger.payment_state
          end,
          available_at = case
            when new.status = 'direct_paid' and current_ledger.payment_state = 'reversed'
              then v_hold_until
            else current_ledger.available_at
          end;
  elsif new.status = 'direct_reconcile_required' then
    update public.worker_payment_ledger
    set settlement_state = 'admin_rejected', payment_state = 'reversed', available_at = null
    where job_id = new.job_id;
  end if;
  return new;
end;
$function$;

revoke all on function private.sync_worker_payment_settlement_state()
  from public, anon, authenticated;
grant execute on function private.sync_worker_payment_settlement_state()
  to service_role;

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
set search_path = ''
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

  select job.* into v_job
  from public.jobs as job
  where job.id = v_order.job_id
  for update;
  if not found or v_order.payment_method <> 'direct_worker' then
    return query select false, 'PAYMENT_ORDER_NOT_FOUND', null::text, v_order.job_id, null::public.job_status, null::text, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  select reservation.* into v_reservation
  from public.worker_direct_payment_collateral_reservations as reservation
  where reservation.payment_order_id = v_order.id
  for update;
  if not found then
    return query select false, 'COLLATERAL_NOT_FOUND', null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  if v_job.worker_id is distinct from v_order.worker_id
    or v_job.worker_commission_level is null
    or v_job.worker_commission_level < 1
    or v_job.worker_commission_rate_bps is null
    or v_job.worker_commission_rate_bps not between 0 and 1500
    or v_order.gross_amount <> v_order.platform_fee + v_order.worker_net
    or v_order.platform_fee <> round(
      v_order.gross_amount::numeric * v_job.worker_commission_rate_bps / 10000.0
    )
    or v_job.gross_amount is distinct from v_order.gross_amount
    or v_job.platform_fee is distinct from v_order.platform_fee
    or v_job.worker_net is distinct from v_order.worker_net
    or v_reservation.worker_id is distinct from v_order.worker_id
    or v_reservation.collateral_amount <> v_order.platform_fee
  then
    return query select false, 'WORKER_LEDGER_INVALID', null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  select ledger.* into v_ledger
  from public.worker_payment_ledger as ledger
  where ledger.job_id = v_job.id
  for update;
  if found and (
    v_ledger.worker_id is distinct from v_job.worker_id
    or v_ledger.payment_provider <> 'direct_worker'
    or v_ledger.gross_amount <> v_order.gross_amount
    or v_ledger.platform_fee <> v_order.platform_fee
    or v_ledger.worker_net <> v_order.worker_net
    or v_ledger.commission_level <> v_job.worker_commission_level
    or v_ledger.commission_rate_bps <> v_job.worker_commission_rate_bps
  ) then
    return query select false, 'WORKER_LEDGER_INVALID', null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  select cash_ledger.* into v_cash_ledger
  from public.worker_cash_commission_ledger as cash_ledger
  where cash_ledger.job_id = v_job.id;
  if found and (
    v_cash_ledger.worker_id is distinct from v_job.worker_id
    or v_cash_ledger.gross_amount <> v_order.gross_amount
    or v_cash_ledger.platform_fee <> v_order.platform_fee
    or v_cash_ledger.worker_net <> v_order.worker_net
    or v_cash_ledger.commission_level <> v_job.worker_commission_level
    or v_cash_ledger.commission_rate_bps <> v_job.worker_commission_rate_bps
  ) then
    return query select false, 'WORKER_LEDGER_INVALID', null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  if v_order.status = 'direct_paid' and v_decision = 'confirm' then
    return query select
      true,
      null::text,
      'confirmed'::text,
      v_job.id,
      'paid'::public.job_status,
      'direct_paid'::text,
      v_order.hold_until,
      coalesce(v_cash_ledger.cash_commission_collected, v_order.platform_fee),
      coalesce(v_cash_ledger.cash_commission_due, 0);
    return;
  end if;
  if v_order.status = 'direct_reconcile_required' and v_decision = 'reject' then
    return query select true, null::text, 'rejected'::text, v_job.id, 'payment_pending'::public.job_status, 'direct_reconcile_required'::text, null::timestamptz, 0, v_order.platform_fee;
    return;
  end if;
  if v_order.status <> 'direct_admin_confirmation_required'
    or v_job.status <> 'payment_pending'::public.job_status
  then
    return query select false, 'INVALID_STATUS', null::text, v_job.id, v_job.status, v_job.payment_status, null::timestamptz, null::integer, null::integer;
    return;
  end if;

  if v_decision = 'reject' then
    update public.job_payment_orders
    set status = 'direct_reconcile_required', verified_by = p_actor_id, verified_at = v_now
    where id = v_order.id
    returning * into v_order;
    update public.worker_direct_payment_collateral_reservations as reservation
    set status = 'released', resolved_at = v_now, resolved_by = p_actor_id
    where reservation.id = v_reservation.id and reservation.status = 'held';
    update public.worker_payment_ledger as ledger
    set settlement_state = 'admin_rejected', payment_state = 'reversed', available_at = null
    where ledger.job_id = v_job.id;
    update public.jobs
    set payment_status = 'direct_reconcile_required',
        payment_failure_reason = coalesce(v_reason, 'admin_rejected'),
        payment_updated_at = v_now
    where id = v_job.id;
    insert into public.job_payment_reconciliation_events (
      payment_order_id, job_id, actor_id, event_type, reason_code
    ) values (
      v_order.id, v_job.id, p_actor_id, 'direct_payment_admin_rejected', coalesce(v_reason, 'admin_rejected')
    );
    return query select true, null::text, 'rejected'::text, v_job.id, 'payment_pending'::public.job_status, 'direct_reconcile_required'::text, null::timestamptz, 0, v_order.platform_fee;
    return;
  end if;

  v_collected := least(v_order.platform_fee, greatest(0, coalesce(v_reservation.collateral_amount, 0)));
  v_due := v_order.platform_fee - v_collected;
  insert into public.worker_cash_commission_ledger (
    job_id, worker_id, gross_amount, platform_fee, worker_net,
    commission_level, commission_rate_bps, cash_commission_collected,
    cash_commission_due, confirmed_at
  ) values (
    v_job.id, v_job.worker_id, v_order.gross_amount, v_order.platform_fee,
    v_order.worker_net, v_job.worker_commission_level,
    v_job.worker_commission_rate_bps, v_collected, v_due, v_now
  ) on conflict on constraint worker_cash_commission_ledger_job_id_key do nothing;

  update public.worker_direct_payment_collateral_reservations as reservation
  set status = 'collected', resolved_at = v_now, resolved_by = p_actor_id
  where reservation.id = v_reservation.id and reservation.status = 'held';

  if v_ledger.id is null then
    insert into public.worker_payment_ledger (
      job_id, worker_id, payment_provider, payment_state, settlement_state,
      gross_amount, platform_fee, worker_net, commission_level,
      commission_rate_bps, available_at
    ) values (
      v_job.id, v_job.worker_id, 'direct_worker', 'on_hold', 'admin_verified',
      v_order.gross_amount, v_order.platform_fee, v_order.worker_net,
      v_job.worker_commission_level, v_job.worker_commission_rate_bps,
      v_hold_until
    ) returning * into v_ledger;
  else
    update public.worker_payment_ledger
    set payment_state = 'on_hold',
        settlement_state = 'admin_verified',
        available_at = v_hold_until
    where id = v_ledger.id;
  end if;

  update public.job_payment_orders
  set status = 'direct_paid',
      amount_received = v_order.gross_amount,
      credited_at = v_now,
      verified_by = p_actor_id,
      verified_at = v_now,
      hold_until = v_hold_until
  where id = v_order.id
  returning * into v_order;
  update public.jobs
  set paid_at = coalesce(paid_at, v_now),
      payment_amount_received = v_order.gross_amount,
      payment_failure_reason = null,
      payment_received_at = v_now,
      payment_status = 'direct_paid',
      payment_updated_at = v_now,
      status = 'paid'::public.job_status
  where id = v_job.id;
  insert into public.job_events (
    job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
  ) values (
    v_job.id, p_actor_id, 'admin'::public.user_role, 'payment_confirmed',
    'payment_pending'::public.job_status, 'paid'::public.job_status,
    pg_catalog.jsonb_build_object(
      'payment_mode', 'direct_worker',
      'confirmation_mode', 'admin_cash_reconciliation',
      'commission_level', v_job.worker_commission_level,
      'commission_rate_bps', v_job.worker_commission_rate_bps,
      'cash_commission_due', v_due
    )
  );
  insert into public.job_payment_reconciliation_events (
    payment_order_id, job_id, actor_id, event_type, safe_metadata
  ) values (
    v_order.id, v_job.id, p_actor_id, 'direct_payment_admin_paid',
    pg_catalog.jsonb_build_object(
      'cash_commission_collected', v_collected,
      'cash_commission_due', v_due,
      'worker_net_preserved', v_order.worker_net,
      'commission_level', v_job.worker_commission_level,
      'commission_rate_bps', v_job.worker_commission_rate_bps
    )
  );
  return query select true, null::text, 'confirmed'::text, v_job.id, 'paid'::public.job_status, 'direct_paid'::text, v_hold_until, v_collected, v_due;
end;
$function$;

revoke all on function public.decide_cash_payment_reconciliation(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.decide_cash_payment_reconciliation(uuid, uuid, text, text)
  to service_role;

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
set search_path = ''
as $function$
declare
  v_order public.job_payment_orders%rowtype;
  v_result record;
  v_decision text := lower(pg_catalog.btrim(coalesce(p_decision, '')));
begin
  perform private.assert_finance_reconciler(p_actor_id);

  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.id = p_payment_order_id;

  if found
    and v_order.payment_method = 'platform_bank_manual'
    and v_order.status = 'manual_verified'
    and v_decision = 'confirm'
  then
    if v_order.amount_received is not distinct from p_amount_received
      and v_order.credited_at is not distinct from p_credited_at
      and v_order.bank_reference_hash is not distinct from p_bank_reference_hash
      and v_order.bank_reference_suffix is not distinct from p_bank_reference_suffix
    then
      return query select true, null::text, 'paid'::text, v_order.job_id, 'paid'::public.job_status, 'manual_verified'::text, v_order.hold_until;
    else
      return query select false, 'INVALID_INPUT'::text, null::text, v_order.job_id, 'paid'::public.job_status, 'manual_verified'::text, v_order.hold_until;
    end if;
    return;
  end if;

  if found
    and v_order.payment_method = 'platform_bank_manual'
    and v_order.status = 'manual_reconcile_required'
    and v_decision = 'reconcile_required'
  then
    if v_order.amount_received is not distinct from p_amount_received
      and v_order.credited_at is not distinct from p_credited_at
      and v_order.bank_reference_hash is not distinct from p_bank_reference_hash
      and v_order.bank_reference_suffix is not distinct from p_bank_reference_suffix
    then
      return query select true, null::text, 'reconcile_required'::text, v_order.job_id, 'payment_pending'::public.job_status, 'manual_reconcile_required'::text, null::timestamptz;
    else
      return query select false, 'INVALID_INPUT'::text, null::text, v_order.job_id, 'payment_pending'::public.job_status, 'manual_reconcile_required'::text, null::timestamptz;
    end if;
    return;
  end if;

  select * into v_result
  from public.decide_manual_bank_payment_reconciliation(
    p_payment_order_id,
    p_actor_id,
    p_decision,
    p_amount_received,
    p_credited_at,
    p_bank_reference_hash,
    p_bank_reference_suffix,
    p_reason_code
  );

  if v_result.ok or v_result.error_code is distinct from 'INVALID_STATUS' then
    return query select
      v_result.ok,
      v_result.error_code,
      v_result.outcome,
      v_result.job_id,
      v_result.status,
      v_result.payment_status,
      v_result.hold_until;
    return;
  end if;

  select payment_order.* into v_order
  from public.job_payment_orders as payment_order
  where payment_order.id = p_payment_order_id;

  if found
    and v_order.payment_method = 'platform_bank_manual'
    and v_order.status = 'manual_verified'
    and v_decision = 'confirm'
    and v_order.amount_received is not distinct from p_amount_received
    and v_order.credited_at is not distinct from p_credited_at
    and v_order.bank_reference_hash is not distinct from p_bank_reference_hash
    and v_order.bank_reference_suffix is not distinct from p_bank_reference_suffix
  then
    return query select true, null::text, 'paid'::text, v_order.job_id, 'paid'::public.job_status, 'manual_verified'::text, v_order.hold_until;
    return;
  end if;

  if found
    and v_order.payment_method = 'platform_bank_manual'
    and v_order.status = 'manual_reconcile_required'
    and v_decision = 'reconcile_required'
    and v_order.amount_received is not distinct from p_amount_received
    and v_order.credited_at is not distinct from p_credited_at
    and v_order.bank_reference_hash is not distinct from p_bank_reference_hash
    and v_order.bank_reference_suffix is not distinct from p_bank_reference_suffix
  then
    return query select true, null::text, 'reconcile_required'::text, v_order.job_id, 'payment_pending'::public.job_status, 'manual_reconcile_required'::text, null::timestamptz;
    return;
  end if;

  return query select
    v_result.ok,
    v_result.error_code,
    v_result.outcome,
    v_result.job_id,
    v_result.status,
    v_result.payment_status,
    v_result.hold_until;
end;
$function$;

revoke all on function public.decide_manual_bank_payment_reconciliation_idempotent(
  uuid, uuid, text, integer, timestamptz, text, text, text
) from public, anon, authenticated;
grant execute on function public.decide_manual_bank_payment_reconciliation_idempotent(
  uuid, uuid, text, integer, timestamptz, text, text, text
) to service_role;

commit;
