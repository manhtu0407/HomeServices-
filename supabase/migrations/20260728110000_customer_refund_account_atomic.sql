-- =============================================================================
-- Customer refund account persistence
--
-- Customer clients remain read-only. The mobile-api Edge function uses this
-- service-role RPC to serialize concurrent updates and return only masked data.
-- =============================================================================

create or replace function public.upsert_customer_refund_payment_method(
  p_customer_id uuid,
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
  is_default boolean,
  verified_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_key text := lower(btrim(p_bank_key));
  v_bank_name text;
  v_account_holder_name text := btrim(p_account_holder_name);
  v_bank_account text := btrim(p_bank_account);
  v_bank_account_masked text;
  v_payment_method public.customer_payment_methods%rowtype;
begin
  if p_customer_id is null then
    raise exception 'customer id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_customer_id
      and role = 'customer'
  ) then
    raise exception 'refund account owner must be a customer' using errcode = '23514';
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
    or char_length(v_account_holder_name) not between 2 and 200
    or v_bank_account !~ '^[0-9A-Za-z]{6,50}$'
  then
    raise exception 'refund account input is invalid' using errcode = '22023';
  end if;

  v_bank_account_masked := '**** ' || right(v_bank_account, 4);
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));

  update public.customer_payment_methods
  set
    bank_key = v_bank_key,
    bank_name = v_bank_name,
    account_holder_name = v_account_holder_name,
    bank_account = v_bank_account,
    bank_account_masked = v_bank_account_masked,
    status = case
      when bank_key is distinct from v_bank_key
        or account_holder_name is distinct from v_account_holder_name
        or bank_account is distinct from v_bank_account
      then 'pending_verification'
      else status
    end,
    verified_at = case
      when bank_key is distinct from v_bank_key
        or account_holder_name is distinct from v_account_holder_name
        or bank_account is distinct from v_bank_account
      then null
      else verified_at
    end,
    is_default = true
  where customer_id = p_customer_id
    and is_default
  returning * into v_payment_method;

  if not found then
    insert into public.customer_payment_methods (
      customer_id,
      bank_key,
      bank_name,
      account_holder_name,
      bank_account,
      bank_account_masked,
      status,
      is_default
    )
    values (
      p_customer_id,
      v_bank_key,
      v_bank_name,
      v_account_holder_name,
      v_bank_account,
      v_bank_account_masked,
      'pending_verification',
      true
    )
    returning * into v_payment_method;
  end if;

  return query
  select
    v_payment_method.id,
    v_payment_method.bank_key,
    v_payment_method.bank_name,
    v_payment_method.bank_account_masked,
    v_payment_method.status,
    v_payment_method.is_default,
    v_payment_method.verified_at,
    v_payment_method.updated_at;
end;
$$;

revoke all on function public.upsert_customer_refund_payment_method(uuid, text, text, text) from public;
revoke all on function public.upsert_customer_refund_payment_method(uuid, text, text, text) from anon;
revoke all on function public.upsert_customer_refund_payment_method(uuid, text, text, text) from authenticated;
grant execute on function public.upsert_customer_refund_payment_method(uuid, text, text, text) to service_role;
