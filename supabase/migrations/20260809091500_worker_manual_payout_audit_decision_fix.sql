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

  update public.worker_payout_methods as payout_method
  set
    bank_key = v_bank_key,
    bank_name = v_bank_name,
    account_holder_name = v_holder_name,
    bank_account = v_bank_account,
    bank_account_masked = v_masked,
    status = case
      when payout_method.bank_key is distinct from v_bank_key
        or payout_method.account_holder_name is distinct from v_holder_name
        or payout_method.bank_account is distinct from v_bank_account
      then 'pending_verification'
      else payout_method.status
    end,
    reviewed_at = case
      when payout_method.bank_key is distinct from v_bank_key
        or payout_method.account_holder_name is distinct from v_holder_name
        or payout_method.bank_account is distinct from v_bank_account
      then null
      else payout_method.reviewed_at
    end,
    reviewed_by = case
      when payout_method.bank_key is distinct from v_bank_key
        or payout_method.account_holder_name is distinct from v_holder_name
        or payout_method.bank_account is distinct from v_bank_account
      then null
      else payout_method.reviewed_by
    end,
    review_reason = case
      when payout_method.bank_key is distinct from v_bank_key
        or payout_method.account_holder_name is distinct from v_holder_name
        or payout_method.bank_account is distinct from v_bank_account
      then null
      else payout_method.review_reason
    end,
    is_default = true
  where payout_method.worker_id = p_worker_id
    and payout_method.is_default
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
    'allow',
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
    'allow',
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
