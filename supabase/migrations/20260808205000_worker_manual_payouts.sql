begin;

-- Manual payouts are a separate financial record. Raw bank data remains
-- service-only; requests retain an immutable account snapshot for settlement.
create table if not exists public.worker_payout_methods (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  bank_key text not null,
  bank_name text not null,
  account_holder_name text not null,
  bank_account text not null,
  bank_account_masked text not null,
  status text not null default 'pending_verification',
  is_default boolean not null default true,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_payout_methods_bank_key_check
    check (bank_key in ('vietcombank', 'techcombank', 'bidv', 'mbbank', 'acb', 'vietinbank')),
  constraint worker_payout_methods_bank_name_check
    check (char_length(btrim(bank_name)) between 2 and 100),
  constraint worker_payout_methods_holder_check
    check (char_length(btrim(account_holder_name)) between 2 and 200),
  constraint worker_payout_methods_account_check
    check (bank_account ~ '^[0-9A-Za-z]{6,50}$'),
  constraint worker_payout_methods_mask_check
    check (bank_account_masked ~ '^[*]{4} [0-9A-Za-z]{4}$'),
  constraint worker_payout_methods_status_check
    check (status in ('pending_verification', 'verified', 'rejected')),
  constraint worker_payout_methods_review_check
    check (
      (status = 'pending_verification' and reviewed_at is null and reviewed_by is null and review_reason is null)
      or (status = 'verified' and reviewed_at is not null and reviewed_by is not null and review_reason is null)
      or (status = 'rejected' and reviewed_at is not null and reviewed_by is not null and char_length(btrim(review_reason)) between 3 and 500)
    )
);

create unique index if not exists worker_payout_methods_one_default_per_worker
  on public.worker_payout_methods (worker_id)
  where is_default;

create index if not exists worker_payout_methods_worker_status_updated_idx
  on public.worker_payout_methods (worker_id, status, updated_at desc);

create index if not exists worker_payout_methods_review_queue_idx
  on public.worker_payout_methods (status, created_at asc)
  where status = 'pending_verification';

drop trigger if exists worker_payout_methods_updated_at on public.worker_payout_methods;
create trigger worker_payout_methods_updated_at
  before update on public.worker_payout_methods
  for each row execute function public.update_updated_at();

alter table public.worker_payout_methods enable row level security;
revoke all on table public.worker_payout_methods from public, anon, authenticated;
grant all on table public.worker_payout_methods to service_role;

create table if not exists public.worker_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  payout_method_id uuid not null references public.worker_payout_methods(id) on delete restrict,
  client_request_id uuid not null,
  amount_vnd integer not null check (amount_vnd > 0),
  available_balance_before_vnd integer not null check (available_balance_before_vnd >= 0),
  bank_key text not null,
  bank_name text not null,
  account_holder_name text not null,
  bank_account text not null,
  bank_account_masked text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  processing_at timestamptz,
  processing_by uuid references public.profiles(id) on delete restrict,
  processed_at timestamptz,
  processed_by uuid references public.profiles(id) on delete restrict,
  transfer_reference text,
  resolution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_withdrawal_requests_client_request_unique unique (worker_id, client_request_id),
  constraint worker_withdrawal_requests_bank_key_check
    check (bank_key in ('vietcombank', 'techcombank', 'bidv', 'mbbank', 'acb', 'vietinbank')),
  constraint worker_withdrawal_requests_account_check
    check (bank_account ~ '^[0-9A-Za-z]{6,50}$'),
  constraint worker_withdrawal_requests_mask_check
    check (bank_account_masked ~ '^[*]{4} [0-9A-Za-z]{4}$'),
  constraint worker_withdrawal_requests_status_check
    check (status in ('pending', 'processing', 'paid', 'rejected', 'failed')),
  constraint worker_withdrawal_requests_lifecycle_check
    check (
      (status = 'pending'
        and processing_at is null and processing_by is null
        and processed_at is null and processed_by is null
        and transfer_reference is null and resolution_reason is null)
      or (status = 'processing'
        and processing_at is not null and processing_by is not null
        and processed_at is null and processed_by is null
        and transfer_reference is null and resolution_reason is null)
      or (status = 'paid'
        and processing_at is not null and processing_by is not null
        and processed_at is not null and processed_by is not null
        and transfer_reference ~ '^[A-Za-z0-9._/-]{3,128}$'
        and resolution_reason is null)
      or (status in ('rejected', 'failed')
        and processing_at is not null and processing_by is not null
        and processed_at is not null and processed_by is not null
        and transfer_reference is null
        and char_length(btrim(resolution_reason)) between 3 and 500)
    )
);

create index if not exists worker_withdrawal_requests_worker_status_requested_idx
  on public.worker_withdrawal_requests (worker_id, status, requested_at desc);

create index if not exists worker_withdrawal_requests_admin_queue_idx
  on public.worker_withdrawal_requests (status, requested_at asc);

create index if not exists worker_withdrawal_requests_processing_by_idx
  on public.worker_withdrawal_requests (processing_by, processing_at desc)
  where status = 'processing';

drop trigger if exists worker_withdrawal_requests_updated_at on public.worker_withdrawal_requests;
create trigger worker_withdrawal_requests_updated_at
  before update on public.worker_withdrawal_requests
  for each row execute function public.update_updated_at();

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
  then
    raise exception 'worker withdrawal request financial snapshot is immutable';
  end if;
  return new;
end;
$function$;

revoke all on function private.protect_worker_withdrawal_request_snapshot() from public, anon, authenticated;
grant execute on function private.protect_worker_withdrawal_request_snapshot() to service_role;

drop trigger if exists worker_withdrawal_requests_snapshot_immutable on public.worker_withdrawal_requests;
create trigger worker_withdrawal_requests_snapshot_immutable
  before update on public.worker_withdrawal_requests
  for each row execute function private.protect_worker_withdrawal_request_snapshot();

alter table public.worker_withdrawal_requests enable row level security;
revoke all on table public.worker_withdrawal_requests from public, anon, authenticated;
grant all on table public.worker_withdrawal_requests to service_role;

-- Carry forward a valid registered Worker bank account as pending review. A
-- Worker whose legacy bank name cannot be mapped must submit it again instead
-- of receiving an invented account record.
insert into public.worker_payout_methods (
  worker_id,
  bank_key,
  bank_name,
  account_holder_name,
  bank_account,
  bank_account_masked,
  status,
  is_default
)
select
  worker.id,
  mapped.bank_key,
  case mapped.bank_key
    when 'vietcombank' then 'Vietcombank'
    when 'techcombank' then 'Techcombank'
    when 'bidv' then 'BIDV'
    when 'mbbank' then 'MBBank'
    when 'acb' then 'ACB'
    when 'vietinbank' then 'VietinBank'
  end,
  btrim(worker.legal_name),
  btrim(worker.bank_account),
  '**** ' || right(btrim(worker.bank_account), 4),
  'pending_verification',
  true
from public.worker_profiles as worker
join public.profiles as profile on profile.id = worker.id and profile.role = 'worker'::public.user_role
cross join lateral (
  select case lower(regexp_replace(coalesce(worker.bank_name, ''), '[[:space:]]+', '', 'g'))
    when 'vietcombank' then 'vietcombank'
    when 'vcb' then 'vietcombank'
    when 'techcombank' then 'techcombank'
    when 'tcb' then 'techcombank'
    when 'bidv' then 'bidv'
    when 'mbbank' then 'mbbank'
    when 'mb' then 'mbbank'
    when 'acb' then 'acb'
    when 'vietinbank' then 'vietinbank'
    when 'ctg' then 'vietinbank'
    else null
  end as bank_key
) as mapped
where mapped.bank_key is not null
  and char_length(btrim(coalesce(worker.legal_name, ''))) between 2 and 200
  and btrim(coalesce(worker.bank_account, '')) ~ '^[0-9A-Za-z]{6,50}$'
  and not exists (
    select 1
    from public.worker_payout_methods as existing
    where existing.worker_id = worker.id and existing.is_default
  );

create or replace function public.upsert_worker_payout_method(
  p_worker_id uuid,
  p_bank_key text,
  p_account_holder_name text,
  p_bank_account text
)
returns table (
  id uuid,
  bank_key text,
  bank_name text,
  bank_account_masked text,
  status text,
  reviewed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_bank_key text := lower(pg_catalog.btrim(coalesce(p_bank_key, '')));
  v_bank_name text;
  v_holder_name text := pg_catalog.btrim(coalesce(p_account_holder_name, ''));
  v_bank_account text := pg_catalog.btrim(coalesce(p_bank_account, ''));
  v_masked text;
  v_method public.worker_payout_methods%rowtype;
begin
  if p_worker_id is null
     or not exists (
       select 1
       from public.profiles as profile
       join public.worker_profiles as worker on worker.id = profile.id
       where profile.id = p_worker_id
         and profile.role = 'worker'::public.user_role
     )
  then
    raise exception 'worker payout method owner is invalid' using errcode = '23514';
  end if;

  v_bank_name := case v_bank_key
    when 'vietcombank' then 'Vietcombank'
    when 'techcombank' then 'Techcombank'
    when 'bidv' then 'BIDV'
    when 'mbbank' then 'MBBank'
    when 'acb' then 'ACB'
    when 'vietinbank' then 'VietinBank'
    else null
  end;

  if v_bank_name is null
     or pg_catalog.char_length(v_holder_name) not between 2 and 200
     or v_bank_account !~ '^[0-9A-Za-z]{6,50}$'
  then
    raise exception 'worker payout method input is invalid' using errcode = '22023';
  end if;

  v_masked := '**** ' || right(v_bank_account, 4);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_worker_id::text, 0));

  update public.worker_payout_methods
  set
    bank_key = v_bank_key,
    bank_name = v_bank_name,
    account_holder_name = v_holder_name,
    bank_account = v_bank_account,
    bank_account_masked = v_masked,
    status = case
      when bank_key is distinct from v_bank_key
        or account_holder_name is distinct from v_holder_name
        or bank_account is distinct from v_bank_account
      then 'pending_verification'
      else status
    end,
    reviewed_at = case
      when bank_key is distinct from v_bank_key
        or account_holder_name is distinct from v_holder_name
        or bank_account is distinct from v_bank_account
      then null
      else reviewed_at
    end,
    reviewed_by = case
      when bank_key is distinct from v_bank_key
        or account_holder_name is distinct from v_holder_name
        or bank_account is distinct from v_bank_account
      then null
      else reviewed_by
    end,
    review_reason = case
      when bank_key is distinct from v_bank_key
        or account_holder_name is distinct from v_holder_name
        or bank_account is distinct from v_bank_account
      then null
      else review_reason
    end,
    is_default = true
  where worker_id = p_worker_id
    and is_default
  returning * into v_method;

  if not found then
    insert into public.worker_payout_methods (
      worker_id,
      bank_key,
      bank_name,
      account_holder_name,
      bank_account,
      bank_account_masked,
      status,
      is_default
    ) values (
      p_worker_id,
      v_bank_key,
      v_bank_name,
      v_holder_name,
      v_bank_account,
      v_masked,
      'pending_verification',
      true
    ) returning * into v_method;
  end if;

  insert into public.kael_permission_audit (
    actor_id,
    actor_role,
    purpose,
    action,
    topic,
    decision,
    reason_code,
    safe_metadata
  ) values (
    p_worker_id,
    'worker',
    'worker_payout_method',
    'submit',
    'bank_account',
    'request',
    'worker_payout_method_submitted',
    pg_catalog.jsonb_build_object(
      'payout_method_id', v_method.id,
      'bank_key', v_method.bank_key,
      'status', v_method.status
    )
  );

  return query select
    v_method.id,
    v_method.bank_key,
    v_method.bank_name,
    v_method.bank_account_masked,
    v_method.status,
    v_method.reviewed_at,
    v_method.updated_at;
end;
$function$;

revoke all on function public.upsert_worker_payout_method(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.upsert_worker_payout_method(uuid, text, text, text) to service_role;

create or replace function public.create_worker_withdrawal_request(
  p_worker_id uuid,
  p_amount_vnd integer,
  p_client_request_id uuid
)
returns table (
  ok boolean,
  error_code text,
  request_id uuid,
  status_out text,
  amount_vnd_out integer,
  available_balance_before_vnd_out integer,
  bank_key_out text,
  bank_name_out text,
  bank_account_masked_out text,
  requested_at_out timestamptz,
  updated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker public.worker_profiles%rowtype;
  v_method public.worker_payout_methods%rowtype;
  v_request public.worker_withdrawal_requests%rowtype;
  v_available_credits bigint := 0;
  v_cash_commission_collected bigint := 0;
  v_reserved_or_paid bigint := 0;
  v_available_balance bigint := 0;
begin
  if p_worker_id is null or p_client_request_id is null
     or p_amount_vnd is null or p_amount_vnd <= 0 or p_amount_vnd > 1000000000
  then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select worker.*
  into v_worker
  from public.worker_profiles as worker
  join public.profiles as profile on profile.id = worker.id
  where worker.id = p_worker_id
    and profile.role = 'worker'::public.user_role
  for update;

  if not found then
    return query select false, 'WORKER_NOT_FOUND'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_worker.is_suspended or not v_worker.is_approved or v_worker.verification_status <> 'approved'::public.worker_verification_status then
    return query select false, 'WORKER_NOT_ELIGIBLE'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_worker_id::text, 0));

  select request.*
  into v_request
  from public.worker_withdrawal_requests as request
  where request.worker_id = p_worker_id
    and request.client_request_id = p_client_request_id
  for update;

  if found then
    if v_request.amount_vnd <> p_amount_vnd then
      return query select false, 'CLIENT_REQUEST_MISMATCH'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
      return;
    end if;
    return query select
      true,
      null::text,
      v_request.id,
      v_request.status,
      v_request.amount_vnd,
      v_request.available_balance_before_vnd,
      v_request.bank_key,
      v_request.bank_name,
      v_request.bank_account_masked,
      v_request.requested_at,
      v_request.updated_at;
    return;
  end if;

  select method.*
  into v_method
  from public.worker_payout_methods as method
  where method.worker_id = p_worker_id
    and method.is_default
  for update;

  if not found then
    return query select false, 'PAYOUT_METHOD_MISSING'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_method.status <> 'verified' then
    return query select false, 'PAYOUT_METHOD_NOT_VERIFIED'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select coalesce(sum(ledger.worker_net) filter (where ledger.payment_state = 'available'), 0)::bigint
  into v_available_credits
  from public.worker_payment_ledger as ledger
  where ledger.worker_id = p_worker_id;

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
  where cash_ledger.worker_id = p_worker_id;

  select coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing', 'paid')), 0)::bigint
  into v_reserved_or_paid
  from public.worker_withdrawal_requests as request
  where request.worker_id = p_worker_id;

  v_available_balance := greatest(0::bigint, v_available_credits - v_cash_commission_collected - v_reserved_or_paid);
  if p_amount_vnd::bigint > v_available_balance then
    return query select false, 'INSUFFICIENT_BALANCE'::text, null::uuid, null::text, null::integer, v_available_balance::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  insert into public.worker_withdrawal_requests (
    worker_id,
    payout_method_id,
    client_request_id,
    amount_vnd,
    available_balance_before_vnd,
    bank_key,
    bank_name,
    account_holder_name,
    bank_account,
    bank_account_masked,
    status
  ) values (
    p_worker_id,
    v_method.id,
    p_client_request_id,
    p_amount_vnd,
    v_available_balance::integer,
    v_method.bank_key,
    v_method.bank_name,
    v_method.account_holder_name,
    v_method.bank_account,
    v_method.bank_account_masked,
    'pending'
  ) returning * into v_request;

  insert into public.kael_permission_audit (
    actor_id,
    actor_role,
    purpose,
    action,
    topic,
    decision,
    reason_code,
    safe_metadata
  ) values (
    p_worker_id,
    'worker',
    'worker_withdrawal_request',
    'create',
    'manual_payout',
    'request',
    'withdrawal_requested',
    pg_catalog.jsonb_build_object(
      'withdrawal_request_id', v_request.id,
      'amount_vnd', v_request.amount_vnd,
      'payout_method_id', v_method.id,
      'bank_key', v_method.bank_key
    )
  );

  return query select
    true,
    null::text,
    v_request.id,
    v_request.status,
    v_request.amount_vnd,
    v_request.available_balance_before_vnd,
    v_request.bank_key,
    v_request.bank_name,
    v_request.bank_account_masked,
    v_request.requested_at,
    v_request.updated_at;
end;
$function$;

revoke all on function public.create_worker_withdrawal_request(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.create_worker_withdrawal_request(uuid, integer, uuid) to service_role;

create or replace function public.admin_review_worker_payout_method_atomic(
  p_actor_id uuid,
  p_payout_method_id uuid,
  p_decision text,
  p_reason text default null
)
returns table (
  ok boolean,
  error_code text,
  payout_method_id uuid,
  status_out text,
  reviewed_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role public.user_role;
  v_method public.worker_payout_methods%rowtype;
  v_decision text := lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select profile.role into v_actor_role from public.profiles as profile where profile.id = p_actor_id;
  if v_actor_role <> 'admin'::public.user_role
     and not exists (
       select 1
       from public.admin_operator_accounts as operator_account
       where operator_account.user_id = p_actor_id
         and operator_account.status = 'active'
         and 'payouts.process' = any(operator_account.capabilities)
     )
  then
    return query select false, 'PAYOUT_PROCESS_REQUIRED'::text, p_payout_method_id, null::text, null::timestamptz;
    return;
  end if;
  if v_decision not in ('verify', 'reject')
     or (v_decision = 'reject' and (pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 500))
  then
    return query select false, 'INVALID_INPUT'::text, p_payout_method_id, null::text, null::timestamptz;
    return;
  end if;

  select method.* into v_method
  from public.worker_payout_methods as method
  where method.id = p_payout_method_id
  for update;
  if not found then
    return query select false, 'PAYOUT_METHOD_NOT_FOUND'::text, p_payout_method_id, null::text, null::timestamptz;
    return;
  end if;
  if v_method.status <> 'pending_verification' then
    return query select false, 'PAYOUT_METHOD_ALREADY_REVIEWED'::text, v_method.id, v_method.status, v_method.reviewed_at;
    return;
  end if;

  update public.worker_payout_methods
  set
    status = case when v_decision = 'verify' then 'verified' else 'rejected' end,
    reviewed_at = v_now,
    reviewed_by = p_actor_id,
    review_reason = case when v_decision = 'reject' then v_reason else null end
  where id = v_method.id
  returning * into v_method;

  insert into public.kael_permission_audit (
    actor_id,
    actor_role,
    purpose,
    action,
    topic,
    decision,
    reason_code,
    safe_metadata
  ) values (
    p_actor_id,
    v_actor_role::text,
    'admin_worker_payout_method_review',
    'review',
    'worker_payout_method',
    case when v_decision = 'verify' then 'allow' else 'deny' end,
    'worker_payout_method_' || v_decision,
    pg_catalog.jsonb_build_object(
      'payout_method_id', v_method.id,
      'worker_id', v_method.worker_id,
      'bank_key', v_method.bank_key,
      'reason_provided', v_reason <> ''
    )
  );

  return query select true, null::text, v_method.id, v_method.status, v_method.reviewed_at;
end;
$function$;

revoke all on function public.admin_review_worker_payout_method_atomic(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_review_worker_payout_method_atomic(uuid, uuid, text, text) to service_role;

create or replace function public.admin_claim_worker_withdrawal_atomic(
  p_actor_id uuid,
  p_request_id uuid
)
returns table (
  ok boolean,
  error_code text,
  request_id uuid,
  status_out text,
  processing_by_out uuid,
  processing_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role public.user_role;
  v_request public.worker_withdrawal_requests%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select profile.role into v_actor_role from public.profiles as profile where profile.id = p_actor_id;
  if v_actor_role <> 'admin'::public.user_role
     and not exists (
       select 1 from public.admin_operator_accounts as operator_account
       where operator_account.user_id = p_actor_id
         and operator_account.status = 'active'
         and 'payouts.process' = any(operator_account.capabilities)
     )
  then
    return query select false, 'PAYOUT_PROCESS_REQUIRED'::text, p_request_id, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  select request.* into v_request
  from public.worker_withdrawal_requests as request
  where request.id = p_request_id
  for update;
  if not found then
    return query select false, 'WITHDRAWAL_NOT_FOUND'::text, p_request_id, null::text, null::uuid, null::timestamptz;
    return;
  end if;
  if v_request.status = 'processing' then
    if v_request.processing_by = p_actor_id then
      return query select true, null::text, v_request.id, v_request.status, v_request.processing_by, v_request.processing_at;
    end if;
    return query select false, 'WITHDRAWAL_ALREADY_PROCESSING'::text, v_request.id, v_request.status, v_request.processing_by, v_request.processing_at;
    return;
  end if;
  if v_request.status <> 'pending' then
    return query select false, 'WITHDRAWAL_ALREADY_RESOLVED'::text, v_request.id, v_request.status, v_request.processing_by, v_request.processing_at;
    return;
  end if;

  update public.worker_withdrawal_requests
  set status = 'processing', processing_at = v_now, processing_by = p_actor_id
  where id = v_request.id
  returning * into v_request;

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id,
    v_actor_role::text,
    'admin_worker_withdrawal',
    'claim',
    'manual_payout',
    'allow',
    'withdrawal_processing_started',
    pg_catalog.jsonb_build_object(
      'withdrawal_request_id', v_request.id,
      'worker_id', v_request.worker_id,
      'amount_vnd', v_request.amount_vnd
    )
  );

  return query select true, null::text, v_request.id, v_request.status, v_request.processing_by, v_request.processing_at;
end;
$function$;

revoke all on function public.admin_claim_worker_withdrawal_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_claim_worker_withdrawal_atomic(uuid, uuid) to service_role;

create or replace function public.admin_resolve_worker_withdrawal_atomic(
  p_actor_id uuid,
  p_request_id uuid,
  p_decision text,
  p_transfer_reference text default null,
  p_reason text default null
)
returns table (
  ok boolean,
  error_code text,
  request_id uuid,
  status_out text,
  processed_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role public.user_role;
  v_request public.worker_withdrawal_requests%rowtype;
  v_decision text := lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_transfer_reference text := pg_catalog.btrim(coalesce(p_transfer_reference, ''));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select profile.role into v_actor_role from public.profiles as profile where profile.id = p_actor_id;
  if v_actor_role <> 'admin'::public.user_role
     and not exists (
       select 1 from public.admin_operator_accounts as operator_account
       where operator_account.user_id = p_actor_id
         and operator_account.status = 'active'
         and 'payouts.process' = any(operator_account.capabilities)
     )
  then
    return query select false, 'PAYOUT_PROCESS_REQUIRED'::text, p_request_id, null::text, null::timestamptz;
    return;
  end if;
  if v_decision not in ('paid', 'rejected', 'failed')
     or (v_decision = 'paid' and v_transfer_reference !~ '^[A-Za-z0-9._/-]{3,128}$')
     or (v_decision in ('rejected', 'failed') and (pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 500))
  then
    return query select false, 'INVALID_INPUT'::text, p_request_id, null::text, null::timestamptz;
    return;
  end if;

  select request.* into v_request
  from public.worker_withdrawal_requests as request
  where request.id = p_request_id
  for update;
  if not found then
    return query select false, 'WITHDRAWAL_NOT_FOUND'::text, p_request_id, null::text, null::timestamptz;
    return;
  end if;
  if v_request.status <> 'processing' then
    return query select false, 'WITHDRAWAL_NOT_PROCESSING'::text, v_request.id, v_request.status, v_request.processed_at;
    return;
  end if;
  if v_request.processing_by <> p_actor_id and v_actor_role <> 'admin'::public.user_role then
    return query select false, 'WITHDRAWAL_ASSIGNED_TO_OTHER'::text, v_request.id, v_request.status, null::timestamptz;
    return;
  end if;

  update public.worker_withdrawal_requests
  set
    status = v_decision,
    processed_at = v_now,
    processed_by = p_actor_id,
    transfer_reference = case when v_decision = 'paid' then v_transfer_reference else null end,
    resolution_reason = case when v_decision in ('rejected', 'failed') then v_reason else null end
  where id = v_request.id
  returning * into v_request;

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id,
    v_actor_role::text,
    'admin_worker_withdrawal',
    'resolve',
    'manual_payout',
    case when v_decision = 'paid' then 'allow' when v_decision = 'rejected' then 'deny' else 'escalate' end,
    'withdrawal_' || v_decision,
    pg_catalog.jsonb_build_object(
      'withdrawal_request_id', v_request.id,
      'worker_id', v_request.worker_id,
      'amount_vnd', v_request.amount_vnd,
      'reference_provided', v_transfer_reference <> '',
      'processing_owner_changed', v_request.processing_by <> p_actor_id
    )
  );

  return query select true, null::text, v_request.id, v_request.status, v_request.processed_at;
end;
$function$;

revoke all on function public.admin_resolve_worker_withdrawal_atomic(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_worker_withdrawal_atomic(uuid, uuid, text, text, text) to service_role;

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
  withdrawal_reserved_amount bigint,
  withdrawn_total bigint,
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
    from public.worker_payment_ledger as ledger
    left join public.jobs as job on job.id = ledger.job_id
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
    from public.worker_cash_commission_ledger as cash_ledger
    left join public.jobs as job on job.id = cash_ledger.job_id
    cross join lateral (
      select least(
        cash_ledger.cash_commission_due::bigint,
        coalesce(sum(reconciliation.amount), 0)
      )::integer as amount
      from public.worker_cash_commission_reconciliations as reconciliation
      where reconciliation.cash_commission_ledger_id = cash_ledger.id
    ) as reconciliations
    where cash_ledger.worker_id = p_worker_id
  ), all_worker_transactions as (
    select * from all_worker_ledger
    union all
    select * from all_cash_ledger
  ), filtered_transactions as (
    select *
    from all_worker_transactions as transaction
    where (p_from is null or transaction.recorded_at >= p_from)
      and (p_to is null or transaction.recorded_at <= p_to)
  ), paid_transactions as (
    select *
    from filtered_transactions as transaction
    where transaction.entry_type = 'cash_commission_debit'
      or (transaction.entry_type = 'worker_credit' and transaction.payment_state = 'available')
  ), available_credits as (
    select coalesce(sum(ledger.worker_net), 0)::bigint as amount
    from all_worker_ledger as ledger
    where ledger.payment_state = 'available'
  ), cash_commission_totals as (
    select
      coalesce(sum(cash_commission_collected), 0)::bigint as cash_commission_collected_total,
      coalesce(sum(cash_commission_due), 0)::bigint as cash_commission_due_total
    from all_cash_ledger
  ), withdrawal_totals as (
    select
      coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing')), 0)::bigint as withdrawal_reserved_amount,
      coalesce(sum(request.amount_vnd) filter (where request.status = 'paid'), 0)::bigint as withdrawn_total
    from public.worker_withdrawal_requests as request
    where request.worker_id = p_worker_id
  ), daily_paid as (
    select
      (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date as paid_date,
      sum(transaction.gross_amount)::bigint as gross_earnings,
      sum(transaction.platform_fee)::bigint as platform_fee_total,
      sum(transaction.worker_net)::bigint as net_earnings,
      count(*)::bigint as paid_job_count
    from paid_transactions as transaction
    group by (transaction.recorded_at at time zone 'Asia/Ho_Chi_Minh')::date
  ), recent_transactions as (
    select *
    from filtered_transactions as transaction
    order by transaction.recorded_at desc, transaction.id desc
    limit 20
  )
  select
    p_worker_id,
    coalesce((select count(*) from paid_transactions), 0)::bigint,
    coalesce((select sum(gross_amount) from paid_transactions), 0)::bigint,
    coalesce((select sum(platform_fee) from paid_transactions), 0)::bigint,
    coalesce((select sum(worker_net) from paid_transactions), 0)::bigint,
    greatest(0::bigint, available_credits.amount - cash_commission_totals.cash_commission_collected_total - withdrawal_totals.withdrawal_reserved_amount - withdrawal_totals.withdrawn_total),
    withdrawal_totals.withdrawal_reserved_amount,
    withdrawal_totals.withdrawn_total,
    cash_commission_totals.cash_commission_collected_total,
    cash_commission_totals.cash_commission_due_total,
    coalesce((select count(*) from all_worker_ledger as ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger as ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger as ledger where ledger.payment_state = 'on_hold'), 0)::bigint,
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
      from recent_transactions as transaction
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
      ) as daily
    ), '[]'::jsonb),
    p_from,
    p_to
  from current_tier as tier
  cross join available_credits
  cross join cash_commission_totals
  cross join withdrawal_totals;
end;
$function$;

revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz) to service_role;

create or replace function public.admin_set_sub_admin_access_atomic(
  p_owner_id uuid,
  p_target_id uuid,
  p_action text,
  p_capabilities text[] default '{}',
  p_reason text default null
)
returns table(
  ok boolean,
  error_code text,
  user_id uuid,
  status_out text,
  role_out public.user_role,
  capabilities_out text[],
  updated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.profiles%rowtype;
  v_account public.admin_operator_accounts%rowtype;
  v_role_out public.user_role;
  v_action text := lower(pg_catalog.btrim(coalesce(p_action, '')));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_capabilities text[] := coalesce(p_capabilities, '{}'::text[]);
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if not exists (
    select 1
    from public.profiles as owner_profile
    where owner_profile.id = p_owner_id
      and owner_profile.role = 'admin'::public.user_role
  ) then
    return query select false, 'OWNER_REQUIRED'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;
  if p_target_id is null or p_target_id = p_owner_id then
    return query select false, 'INVALID_TARGET'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;
  if v_action not in ('grant', 'update', 'revoke') then
    return query select false, 'INVALID_ACTION'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;
  if pg_catalog.cardinality(v_capabilities) > 8
     or exists (
       select 1
       from pg_catalog.unnest(v_capabilities) as capability
       where capability not in (
         'operations.read',
         'workers.read',
         'workers.review',
         'workers.manage',
         'transactions.read',
         'payouts.read',
         'payouts.process',
         'team.read'
       )
     )
     or (select count(*) from pg_catalog.unnest(v_capabilities)) <> (select count(distinct capability) from pg_catalog.unnest(v_capabilities) as capability)
     or (v_action in ('grant', 'update') and pg_catalog.cardinality(v_capabilities) = 0)
     or (v_action = 'revoke' and (pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 500))
  then
    return query select false, 'INVALID_INPUT'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  select profile_row.* into v_target
  from public.profiles as profile_row
  where profile_row.id = p_target_id
  for update;
  if not found then
    return query select false, 'TARGET_NOT_FOUND'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;
  if v_target.role = 'admin'::public.user_role then
    return query select false, 'OWNER_CANNOT_BE_OPERATOR'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
    return;
  end if;

  select account_row.* into v_account
  from public.admin_operator_accounts as account_row
  where account_row.user_id = p_target_id
  for update;

  if v_action = 'grant' then
    if found then
      if v_target.role not in ('admin_operator'::public.user_role, v_account.baseline_role) then
        return query select false, 'INVALID_TARGET_ROLE'::text, p_target_id, null::text, v_target.role, v_account.capabilities, null::timestamptz;
        return;
      end if;
      update public.admin_operator_accounts
      set capabilities = v_capabilities, status = 'active', last_changed_by = p_owner_id, revoked_at = null
      where user_id = p_target_id
      returning * into v_account;
    else
      if v_target.role not in ('customer'::public.user_role, 'worker'::public.user_role) then
        return query select false, 'INVALID_TARGET_ROLE'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
        return;
      end if;
      insert into public.admin_operator_accounts (
        user_id, baseline_role, capabilities, status, granted_by, last_changed_by
      ) values (
        p_target_id, v_target.role, v_capabilities, 'active', p_owner_id, p_owner_id
      ) returning * into v_account;
    end if;
    update public.profiles set role = 'admin_operator'::public.user_role where id = p_target_id;
  elsif v_action = 'update' then
    if not found or v_account.status <> 'active' or v_target.role <> 'admin_operator'::public.user_role then
      return query select false, 'OPERATOR_NOT_ACTIVE'::text, p_target_id, null::text, v_target.role, coalesce(v_account.capabilities, '{}'::text[]), null::timestamptz;
      return;
    end if;
    update public.admin_operator_accounts
    set capabilities = v_capabilities, last_changed_by = p_owner_id
    where user_id = p_target_id
    returning * into v_account;
  else
    if not found then
      return query select false, 'OPERATOR_NOT_FOUND'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
      return;
    end if;
    update public.admin_operator_accounts
    set capabilities = '{}'::text[], status = 'revoked', last_changed_by = p_owner_id, revoked_at = v_now
    where user_id = p_target_id
    returning * into v_account;
    update public.profiles
    set role = v_account.baseline_role
    where id = p_target_id and role = 'admin_operator'::public.user_role;
  end if;

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_owner_id,
    'admin',
    'admin_sub_admin_access',
    v_action,
    'admin_operator',
    case when v_action = 'revoke' then 'deny' else 'allow' end,
    'admin_operator_' || v_action,
    pg_catalog.jsonb_build_object(
      'target_id', p_target_id,
      'capability_count', pg_catalog.cardinality(v_account.capabilities),
      'reason_provided', v_reason <> ''
    )
  );

  select role into v_role_out from public.profiles where id = p_target_id;
  return query select true, null::text, p_target_id, v_account.status, v_role_out, v_account.capabilities, v_account.updated_at;
end;
$function$;

revoke execute on function public.admin_set_sub_admin_access_atomic(uuid, uuid, text, text[], text) from public, anon, authenticated;
grant execute on function public.admin_set_sub_admin_access_atomic(uuid, uuid, text, text[], text) to service_role;

commit;
