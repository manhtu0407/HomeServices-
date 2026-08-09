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
