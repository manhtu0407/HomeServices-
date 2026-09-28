begin;

-- Compensation is settled by agreement, not decided by NestScout. After a damage case is
-- confirmed, the customer names an amount, the worker accepts, counters or declines, and each
-- side gets a bounded number of turns with a deadline. Both pressing "accept" on the same number
-- is the worker's written consent; only then is that amount reserved from the worker's balance,
-- and an admin pays the customer and records the transfer. NestScout never advances the money:
-- an amount the worker's balance cannot cover cannot be agreed. With no agreement, the customer
-- is pointed to the authorities.

alter table public.worker_discipline_policy
  add column compensation_response_days smallint not null default 3
    check (compensation_response_days between 1 and 14),
  add column compensation_max_offers smallint not null default 4
    check (compensation_max_offers between 2 and 6),
  add column compensation_min_vnd integer not null default 10000 check (compensation_min_vnd > 0),
  add column compensation_max_vnd integer not null default 50000000,
  add constraint worker_discipline_policy_compensation_range check (compensation_max_vnd > compensation_min_vnd);

create table public.compensation_negotiations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.worker_violation_cases(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  status text not null default 'awaiting_worker'
    check (status in ('awaiting_worker', 'awaiting_customer', 'agreed', 'declined')),
  current_amount_vnd integer not null check (current_amount_vnd > 0),
  offers_count smallint not null default 1 check (offers_count >= 1),
  evidence_paths text[] not null default '{}' check (pg_catalog.cardinality(evidence_paths) <= 3),
  respond_by timestamptz not null,
  agreed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'agreed') = (agreed_at is not null))
);

create index compensation_negotiations_worker_idx on public.compensation_negotiations (worker_id, created_at desc);
create index compensation_negotiations_customer_idx on public.compensation_negotiations (customer_id, created_at desc);

create table public.compensation_offers (
  id uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null references public.compensation_negotiations(id) on delete restrict,
  actor_role text not null check (actor_role in ('customer', 'worker')),
  action text not null check (action in ('claim', 'counter', 'accept', 'decline')),
  amount_vnd integer check (amount_vnd is null or amount_vnd > 0),
  note text check (note is null or pg_catalog.char_length(note) between 1 and 1000),
  created_at timestamptz not null default now(),
  check ((action in ('claim', 'counter')) = (amount_vnd is not null))
);

create index compensation_offers_negotiation_idx on public.compensation_offers (negotiation_id, created_at);

-- Reserved at agreement so the worker cannot withdraw it meanwhile; paid once the admin has
-- transferred it to the customer. A reservation is never cancelled: the consent stands.
create table public.worker_compensation_payouts (
  id uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null unique references public.compensation_negotiations(id) on delete restrict,
  case_id uuid not null references public.worker_violation_cases(id) on delete restrict,
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  amount_vnd integer not null check (amount_vnd > 0),
  status text not null default 'reserved' check (status in ('reserved', 'paid')),
  transfer_reference text check (transfer_reference is null or pg_catalog.char_length(transfer_reference) between 3 and 120),
  paid_by uuid references public.profiles(id) on delete restrict,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null and paid_by is not null and transfer_reference is not null))
);

create index worker_compensation_payouts_worker_idx on public.worker_compensation_payouts (worker_id, status);

alter table public.compensation_negotiations enable row level security;
alter table public.compensation_offers enable row level security;
alter table public.worker_compensation_payouts enable row level security;
revoke all on table public.compensation_negotiations, public.compensation_offers, public.worker_compensation_payouts
  from public, anon, authenticated;
grant select on table public.compensation_negotiations, public.compensation_offers, public.worker_compensation_payouts
  to service_role;

create trigger compensation_offers_append_only
before update or delete on public.compensation_offers
for each row execute function private.reject_append_only_mutation();

create or replace function private.guard_compensation_payout_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'COMPENSATION_PAYOUT_IMMUTABLE' using errcode = '42501';
  end if;
  if old.status <> 'reserved' or new.status <> 'paid'
     or new.amount_vnd <> old.amount_vnd or new.worker_id <> old.worker_id
     or new.customer_id <> old.customer_id or new.negotiation_id <> old.negotiation_id then
    raise exception 'COMPENSATION_PAYOUT_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create trigger worker_compensation_payouts_guard
before update or delete on public.worker_compensation_payouts
for each row execute function private.guard_compensation_payout_mutation();
create trigger worker_compensation_payouts_synthetic_guard
before insert on public.worker_compensation_payouts
for each row execute function private.guard_real_traffic_finance();

-- The balance owner gains one column, so the function is recreated rather than replaced.
drop function private.worker_withdrawable_balance(uuid);

create function private.worker_withdrawable_balance(p_worker_id uuid)
returns table (
  ledger_available_vnd bigint,
  admin_credit_vnd bigint,
  bonus_available_vnd bigint,
  cash_commission_vnd bigint,
  collateral_reserved_vnd bigint,
  pending_withdrawals_vnd bigint,
  paid_withdrawals_vnd bigint,
  withdrawable_vnd bigint,
  compensation_vnd bigint
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
  v_compensation bigint;
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

  select coalesce(sum(payout.amount_vnd), 0)::bigint
  into v_compensation
  from public.worker_compensation_payouts as payout
  where payout.worker_id = p_worker_id;

  return query select
    v_ledger,
    v_admin_credit,
    v_bonus,
    v_cash_commission,
    v_collateral,
    v_pending,
    v_paid,
    greatest(0::bigint, v_ledger + v_admin_credit + v_bonus - v_cash_commission - v_collateral - v_pending - v_paid - v_compensation),
    v_compensation;
end;
$function$;

revoke all on function private.worker_withdrawable_balance(uuid) from public, anon, authenticated;
grant execute on function private.worker_withdrawable_balance(uuid) to service_role;

-- A negotiation past its deadline reads as expired; nothing needs to rewrite the row.
create or replace function private.compensation_json(p_negotiation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'id', negotiation.id,
    'case_id', negotiation.case_id,
    'job_id', violation.job_id,
    'violation_code', violation.violation_code,
    'worker_name', (select full_name from public.profiles where id = negotiation.worker_id),
    'status', case
      when negotiation.status in ('awaiting_worker', 'awaiting_customer') and negotiation.respond_by <= pg_catalog.now()
        then 'expired'
      else negotiation.status end,
    'current_amount_vnd', negotiation.current_amount_vnd,
    'respond_by', negotiation.respond_by,
    'offers_left', greatest(0, policy.compensation_max_offers - negotiation.offers_count),
    'agreed_at', negotiation.agreed_at,
    'evidence_paths', pg_catalog.to_jsonb(negotiation.evidence_paths),
    'payout', (
      select pg_catalog.jsonb_build_object('status', payout.status, 'amount_vnd', payout.amount_vnd, 'paid_at', payout.paid_at)
      from public.worker_compensation_payouts as payout where payout.negotiation_id = negotiation.id
    ),
    'offers', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'actor_role', offer.actor_role, 'action', offer.action, 'amount_vnd', offer.amount_vnd,
        'note', offer.note, 'created_at', offer.created_at
      ) order by offer.created_at)
      from public.compensation_offers as offer where offer.negotiation_id = negotiation.id
    ), '[]'::jsonb)
  )
  from public.compensation_negotiations as negotiation
  join public.worker_violation_cases as violation on violation.id = negotiation.case_id
  cross join public.worker_discipline_policy as policy
  where negotiation.id = p_negotiation_id and policy.id = 1;
$function$;

create or replace function private.compensation_policy_json()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'min_vnd', compensation_min_vnd,
    'max_vnd', compensation_max_vnd,
    'response_days', compensation_response_days,
    'max_offers', compensation_max_offers
  )
  from public.worker_discipline_policy where id = 1;
$function$;

create or replace function public.open_compensation_claim(
  p_customer_id uuid,
  p_case_id uuid,
  p_amount_vnd integer,
  p_note text,
  p_evidence_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case public.worker_violation_cases%rowtype;
  v_paths text[] := coalesce(p_evidence_paths, '{}');
  v_prefix text := 'compensation/' || p_customer_id || '/' || p_case_id || '/';
  v_policy public.worker_discipline_policy%rowtype;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_negotiation_id uuid;
begin
  select * into v_policy from public.worker_discipline_policy where id = 1;
  if p_amount_vnd is null or p_amount_vnd not between v_policy.compensation_min_vnd and v_policy.compensation_max_vnd
     or v_note is null or pg_catalog.char_length(v_note) not between 10 and 1000
     or pg_catalog.cardinality(v_paths) > 3
     -- Photos were uploaded through a signed URL under this customer's and case's prefix only.
     or exists (
       select 1 from pg_catalog.unnest(v_paths) as path
       where pg_catalog.left(path, pg_catalog.char_length(v_prefix)) <> v_prefix
         or path !~ '^compensation/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png)$'
     ) then
    raise exception 'INVALID_COMPENSATION_INPUT' using errcode = '22023';
  end if;
  select * into v_case from public.worker_violation_cases where id = p_case_id for update;
  if not found or v_case.customer_id is distinct from p_customer_id then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.status <> 'confirmed' or v_case.appeal_status not in ('none', 'upheld') or v_case.job_id is null
     or not private.compensation_eligible(v_case.violation_code) then
    raise exception 'COMPENSATION_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select id into v_negotiation_id from public.compensation_negotiations where case_id = p_case_id;
  if found then
    -- The same claim sent twice returns the negotiation it opened.
    if exists (select 1 from public.compensation_offers where negotiation_id = v_negotiation_id
               and action = 'claim' and amount_vnd = p_amount_vnd and note = v_note) then
      return private.compensation_json(v_negotiation_id);
    end if;
    raise exception 'COMPENSATION_ALREADY_OPEN' using errcode = 'P0001';
  end if;

  insert into public.compensation_negotiations (case_id, customer_id, worker_id, current_amount_vnd, respond_by, evidence_paths)
  values (p_case_id, p_customer_id, v_case.worker_id, p_amount_vnd,
    pg_catalog.now() + pg_catalog.make_interval(days => v_policy.compensation_response_days), v_paths)
  returning id into v_negotiation_id;
  insert into public.compensation_offers (negotiation_id, actor_role, action, amount_vnd, note)
  values (v_negotiation_id, 'customer', 'claim', p_amount_vnd, v_note);

  perform public.insert_notification_atomic(
    v_case.worker_id, v_case.job_id, 'compensation_claim_received',
    'Khách đề nghị bồi thường',
    'Xem đề nghị trong mục Vi phạm. Bạn có ' || v_policy.compensation_response_days
      || ' ngày để đồng ý, đề xuất mức khác hoặc từ chối.',
    pg_catalog.jsonb_build_object('negotiation_id', v_negotiation_id)
  );
  return private.compensation_json(v_negotiation_id);
end;
$function$;

-- One RPC for both sides: the role decides whose turn is checked and who is told next.
create or replace function public.respond_compensation(
  p_actor_id uuid,
  p_actor_role text,
  p_negotiation_id uuid,
  p_action text,
  p_amount_vnd integer,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_negotiation public.compensation_negotiations%rowtype;
  v_policy public.worker_discipline_policy%rowtype;
  v_job_id uuid;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_other uuid;
  v_withdrawable bigint;
begin
  if p_actor_role not in ('customer', 'worker') or p_action not in ('accept', 'counter', 'decline')
     or (v_note is not null and pg_catalog.char_length(v_note) > 1000) then
    raise exception 'INVALID_COMPENSATION_INPUT' using errcode = '22023';
  end if;
  select * into v_negotiation from public.compensation_negotiations where id = p_negotiation_id;
  if not found
     or (p_actor_role = 'customer' and v_negotiation.customer_id <> p_actor_id)
     or (p_actor_role = 'worker' and v_negotiation.worker_id <> p_actor_id) then
    raise exception 'COMPENSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- The worker lock first, as every balance writer does, then the row.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_negotiation.worker_id::text, 0));
  select * into v_negotiation from public.compensation_negotiations where id = p_negotiation_id for update;
  select * into v_policy from public.worker_discipline_policy where id = 1;
  select job_id into v_job_id from public.worker_violation_cases where id = v_negotiation.case_id;

  -- Turns alternate, so a latest offer from this side with the same action is a retried request.
  if exists (
    select 1 from (
      select offer.actor_role, offer.action, offer.amount_vnd from public.compensation_offers as offer
      where offer.negotiation_id = p_negotiation_id order by offer.created_at desc limit 1
    ) as latest
    where latest.actor_role = p_actor_role and latest.action = p_action
      and (p_action <> 'counter' or latest.amount_vnd = p_amount_vnd)
  ) then
    return private.compensation_json(p_negotiation_id);
  end if;

  if v_negotiation.status <> (case p_actor_role when 'customer' then 'awaiting_customer' else 'awaiting_worker' end) then
    raise exception 'COMPENSATION_NOT_YOUR_TURN' using errcode = 'P0001';
  end if;
  if v_negotiation.respond_by <= pg_catalog.now() then
    raise exception 'COMPENSATION_EXPIRED' using errcode = 'P0001';
  end if;
  v_other := case p_actor_role when 'customer' then v_negotiation.worker_id else v_negotiation.customer_id end;
  select withdrawable_vnd into v_withdrawable from private.worker_withdrawable_balance(v_negotiation.worker_id);

  if p_action = 'counter' then
    if p_amount_vnd is null or p_amount_vnd not between v_policy.compensation_min_vnd and v_policy.compensation_max_vnd
       or p_amount_vnd = v_negotiation.current_amount_vnd then
      raise exception 'INVALID_COMPENSATION_INPUT' using errcode = '22023';
    end if;
    if v_negotiation.offers_count >= v_policy.compensation_max_offers then
      raise exception 'COMPENSATION_NO_COUNTERS_LEFT' using errcode = 'P0001';
    end if;
    -- A worker may only offer what their balance can actually pay.
    if p_actor_role = 'worker' and p_amount_vnd > v_withdrawable then
      raise exception 'INSUFFICIENT_WORKER_BALANCE' using errcode = 'P0001';
    end if;
    update public.compensation_negotiations
    set status = case p_actor_role when 'customer' then 'awaiting_worker' else 'awaiting_customer' end,
        current_amount_vnd = p_amount_vnd, offers_count = offers_count + 1,
        respond_by = pg_catalog.now() + pg_catalog.make_interval(days => v_policy.compensation_response_days),
        updated_at = pg_catalog.now()
    where id = p_negotiation_id;
    perform public.insert_notification_atomic(
      v_other, v_job_id, 'compensation_counter_offer',
      'Có đề xuất bồi thường mới',
      'Bên kia đã đề xuất một mức bồi thường khác. Bạn có ' || v_policy.compensation_response_days || ' ngày để trả lời.',
      pg_catalog.jsonb_build_object('negotiation_id', p_negotiation_id)
    );
  elsif p_action = 'accept' then
    if v_negotiation.current_amount_vnd > v_withdrawable then
      raise exception 'INSUFFICIENT_WORKER_BALANCE' using errcode = 'P0001';
    end if;
    update public.compensation_negotiations
    set status = 'agreed', agreed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = p_negotiation_id;
    insert into public.worker_compensation_payouts (negotiation_id, case_id, worker_id, customer_id, amount_vnd)
    values (p_negotiation_id, v_negotiation.case_id, v_negotiation.worker_id, v_negotiation.customer_id,
      v_negotiation.current_amount_vnd);
    perform public.insert_notification_atomic(
      v_negotiation.customer_id, v_job_id, 'compensation_agreed',
      'Hai bên đã thống nhất bồi thường',
      'NestScout sẽ chuyển khoản cho bạn và báo khi hoàn tất.',
      pg_catalog.jsonb_build_object('negotiation_id', p_negotiation_id)
    );
    perform public.insert_notification_atomic(
      v_negotiation.worker_id, v_job_id, 'compensation_agreed',
      'Hai bên đã thống nhất bồi thường',
      'Khoản bồi thường đã thống nhất được giữ lại từ số dư của bạn để chuyển cho khách.',
      pg_catalog.jsonb_build_object('negotiation_id', p_negotiation_id)
    );
  else
    update public.compensation_negotiations
    set status = 'declined', updated_at = pg_catalog.now()
    where id = p_negotiation_id;
    perform public.insert_notification_atomic(
      v_other, v_job_id, 'compensation_declined',
      'Không thống nhất được bồi thường',
      case p_actor_role when 'worker'
        then 'Thợ đã từ chối. Bạn có thể trình báo cơ quan có thẩm quyền; NestScout sẽ cung cấp hồ sơ khi được yêu cầu.'
        else 'Khách đã từ chối đề xuất. Vụ việc có thể được chuyển tới cơ quan có thẩm quyền.' end,
      pg_catalog.jsonb_build_object('negotiation_id', p_negotiation_id)
    );
  end if;

  insert into public.compensation_offers (negotiation_id, actor_role, action, amount_vnd, note)
  values (p_negotiation_id, p_actor_role, p_action, case when p_action = 'counter' then p_amount_vnd end, v_note);
  return private.compensation_json(p_negotiation_id);
end;
$function$;

create or replace function public.get_customer_compensation(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'policy', private.compensation_policy_json(),
    -- The refund account saved in Profile is where an agreed amount is sent.
    'refund_account_ready', exists (
      select 1 from public.customer_payment_methods as method
      where method.customer_id = p_customer_id and method.is_default and method.status <> 'rejected'
    ),
    'items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'case_id', violation.id,
        'job_id', violation.job_id,
        'violation_code', violation.violation_code,
        'worker_name', (select full_name from public.profiles where id = violation.worker_id),
        'decided_at', violation.decided_at,
        'negotiation', (
          select private.compensation_json(negotiation.id)
          from public.compensation_negotiations as negotiation where negotiation.case_id = violation.id
        )
      ) order by violation.decided_at desc)
      from public.worker_violation_cases as violation
      where violation.customer_id = p_customer_id
        and violation.status = 'confirmed'
        and violation.appeal_status in ('none', 'upheld')
        and violation.job_id is not null
        and private.compensation_eligible(violation.violation_code)
    ), '[]'::jsonb)
  );
$function$;

create or replace function public.get_worker_compensation(p_worker_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'policy', private.compensation_policy_json(),
    'withdrawable_vnd', (select withdrawable_vnd from private.worker_withdrawable_balance(p_worker_id)),
    'negotiations', coalesce((
      select pg_catalog.jsonb_agg(private.compensation_json(negotiation.id) order by negotiation.created_at desc)
      from public.compensation_negotiations as negotiation where negotiation.worker_id = p_worker_id
    ), '[]'::jsonb)
  );
$function$;

create or replace function public.admin_list_compensation(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.discipline.manage');
  return pg_catalog.jsonb_build_object('negotiations', coalesce((
    select pg_catalog.jsonb_agg(private.compensation_json(negotiation.id) || pg_catalog.jsonb_build_object(
      'customer_name', (select full_name from public.profiles where id = negotiation.customer_id),
      'worker_id', negotiation.worker_id
    ) order by (negotiation.status = 'agreed') desc, negotiation.updated_at desc)
    from (
      select * from public.compensation_negotiations order by updated_at desc limit 100
    ) as negotiation
  ), '[]'::jsonb));
end;
$function$;

-- The full account number leaves the database only for an agreement that is due to be paid,
-- and every read is written to the case history.
create or replace function public.admin_get_compensation_payee(p_actor_id uuid, p_negotiation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payout public.worker_compensation_payouts%rowtype;
  v_method public.customer_payment_methods%rowtype;
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.discipline.manage');
  select * into v_payout from public.worker_compensation_payouts where negotiation_id = p_negotiation_id;
  if not found or v_payout.status <> 'reserved' then
    raise exception 'COMPENSATION_NOT_AGREED' using errcode = 'P0001';
  end if;
  select * into v_method from public.customer_payment_methods
  where customer_id = v_payout.customer_id and is_default and status <> 'rejected';
  if not found then
    return pg_catalog.jsonb_build_object('account', null);
  end if;
  insert into public.worker_violation_case_events (case_id, event_kind, actor_id, detail)
  values (v_payout.case_id, 'compensation_payee_viewed', p_actor_id,
    pg_catalog.jsonb_build_object('negotiation_id', p_negotiation_id));
  return pg_catalog.jsonb_build_object('account', pg_catalog.jsonb_build_object(
    'bank_name', v_method.bank_name,
    'account_holder_name', v_method.account_holder_name,
    'bank_account', v_method.bank_account,
    'verified', v_method.status = 'verified'
  ));
end;
$function$;

-- Recorded after the admin has transferred the agreed amount to the customer's own account.
create or replace function public.admin_record_compensation_paid(
  p_actor_id uuid,
  p_negotiation_id uuid,
  p_transfer_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payout public.worker_compensation_payouts%rowtype;
  v_reference text := pg_catalog.btrim(coalesce(p_transfer_reference, ''));
  v_job_id uuid;
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.discipline.manage');
  if pg_catalog.char_length(v_reference) not between 3 and 120 then
    raise exception 'INVALID_COMPENSATION_INPUT' using errcode = '22023';
  end if;
  select * into v_payout from public.worker_compensation_payouts where negotiation_id = p_negotiation_id for update;
  if not found then
    raise exception 'COMPENSATION_NOT_AGREED' using errcode = 'P0001';
  end if;
  if v_payout.status = 'paid' then
    if v_payout.transfer_reference = v_reference then
      return private.compensation_json(p_negotiation_id);
    end if;
    raise exception 'COMPENSATION_ALREADY_PAID' using errcode = 'P0001';
  end if;

  update public.worker_compensation_payouts
  set status = 'paid', transfer_reference = v_reference, paid_by = p_actor_id, paid_at = pg_catalog.now()
  where id = v_payout.id;
  insert into public.worker_violation_case_events (case_id, event_kind, actor_id, detail)
  values (v_payout.case_id, 'compensation_released', p_actor_id,
    pg_catalog.jsonb_build_object('negotiation_id', p_negotiation_id, 'amount_vnd', v_payout.amount_vnd));
  select job_id into v_job_id from public.worker_violation_cases where id = v_payout.case_id;
  perform public.insert_notification_atomic(
    v_payout.customer_id, v_job_id, 'compensation_paid',
    'Đã chuyển tiền bồi thường',
    'NestScout đã chuyển khoản bồi thường theo thỏa thuận. Kiểm tra tài khoản ngân hàng của bạn.',
    pg_catalog.jsonb_build_object('negotiation_id', p_negotiation_id)
  );
  perform public.insert_notification_atomic(
    v_payout.worker_id, v_job_id, 'compensation_paid',
    'Đã chi khoản bồi thường',
    'Khoản bồi thường đã thống nhất đã được chuyển cho khách từ số dư của bạn.',
    pg_catalog.jsonb_build_object('negotiation_id', p_negotiation_id)
  );
  return private.compensation_json(p_negotiation_id);
end;
$function$;

revoke all on function private.compensation_json(uuid) from public, anon, authenticated;
revoke all on function private.compensation_policy_json() from public, anon, authenticated;
revoke all on function public.open_compensation_claim(uuid, uuid, integer, text, text[]) from public, anon, authenticated;
revoke all on function public.respond_compensation(uuid, text, uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.get_customer_compensation(uuid) from public, anon, authenticated;
revoke all on function public.get_worker_compensation(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_compensation(uuid) from public, anon, authenticated;
revoke all on function public.admin_record_compensation_paid(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_get_compensation_payee(uuid, uuid) from public, anon, authenticated;
grant execute on function private.compensation_json(uuid) to service_role;
grant execute on function public.open_compensation_claim(uuid, uuid, integer, text, text[]) to service_role;
grant execute on function public.respond_compensation(uuid, text, uuid, text, integer, text) to service_role;
grant execute on function public.get_customer_compensation(uuid) to service_role;
grant execute on function public.get_worker_compensation(uuid) to service_role;
grant execute on function public.admin_list_compensation(uuid) to service_role;
grant execute on function public.admin_record_compensation_paid(uuid, uuid, text) to service_role;
grant execute on function public.admin_get_compensation_payee(uuid, uuid) to service_role;

commit;
