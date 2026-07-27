create or replace function public.apply_sepay_vietqr_payment_webhook(
  p_payment_code text,
  p_transaction_id text,
  p_transfer_amount integer,
  p_reference_code text default null
)
returns table (
  ok boolean,
  outcome text,
  job_id uuid,
  job_status public.job_status,
  payment_status text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_existing_transaction record;
  v_job record;
  v_now timestamptz := now();
  v_reference_code text := nullif(left(btrim(p_reference_code), 120), '');
begin
  if p_payment_code !~ '^NS[A-Z0-9]{24}$'
    or p_transaction_id !~ '^[0-9]{1,30}$'
    or p_transfer_amount is null
    or p_transfer_amount <= 0 then
    return query select true, 'ignored', null::uuid, null::public.job_status, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtext(p_transaction_id));

  select id, payment_code, status, payment_status
  into v_existing_transaction
  from public.jobs
  where sepay_transaction_id = p_transaction_id
  for update;

  if found then
    if v_existing_transaction.payment_code = p_payment_code then
      return query select
        true,
        'duplicate',
        v_existing_transaction.id,
        v_existing_transaction.status,
        v_existing_transaction.payment_status;
    else
      return query select
        true,
        'transaction_conflict',
        v_existing_transaction.id,
        v_existing_transaction.status,
        v_existing_transaction.payment_status;
    end if;
    return;
  end if;

  select id, status, payment_provider, payment_status, gross_amount
  into v_job
  from public.jobs
  where payment_code = p_payment_code
  for update;

  if not found
    or v_job.payment_provider is distinct from 'sepay_vietqr'
    or v_job.payment_status is distinct from 'vietqr_ready'
    or v_job.status is distinct from 'payment_pending'::public.job_status
    or v_job.gross_amount is null
    or v_job.gross_amount <= 0 then
    return query select true, 'ignored', null::uuid, null::public.job_status, null::text;
    return;
  end if;

  if v_job.gross_amount <> p_transfer_amount then
    update public.jobs
    set
      payment_amount_received = p_transfer_amount,
      payment_failure_reason = 'amount_mismatch',
      payment_received_at = v_now,
      payment_status = 'amount_mismatch',
      payment_updated_at = v_now,
      sepay_reference_code = v_reference_code,
      sepay_transaction_id = p_transaction_id
    where id = v_job.id;

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
      null,
      null,
      'payment_amount_mismatch',
      'payment_pending',
      'payment_pending',
      jsonb_build_object('payment_mode', 'sepay_vietqr')
    );

    return query select true, 'amount_mismatch', v_job.id, 'payment_pending'::public.job_status, 'amount_mismatch';
    return;
  end if;

  update public.jobs
  set
    paid_at = coalesce(paid_at, v_now),
    payment_amount_received = p_transfer_amount,
    payment_failure_reason = null,
    payment_received_at = v_now,
    payment_status = 'received',
    payment_updated_at = v_now,
    sepay_reference_code = v_reference_code,
    sepay_transaction_id = p_transaction_id,
    status = 'paid'
  where id = v_job.id;

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
    null,
    null,
    'payment_confirmed',
    'payment_pending',
    'paid',
    jsonb_build_object('payment_mode', 'sepay_vietqr')
  );

  return query select true, 'paid', v_job.id, 'paid'::public.job_status, 'received';
end;
$function$;

revoke all on function public.apply_sepay_vietqr_payment_webhook(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.apply_sepay_vietqr_payment_webhook(text, text, integer, text)
  to service_role;
