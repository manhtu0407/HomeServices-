-- Aligns the deletion scrub with the worker active-service constraint:
-- no active services is represented by null, while selected services may be empty.

begin;

create or replace function public.prepare_worker_account_deletion(
  p_worker_id uuid,
  p_client_request_id uuid
)
returns table (
  request_id uuid,
  request_status text,
  checkpoint text,
  storage_refs text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_request public.worker_account_deletion_requests%rowtype;
  v_storage_refs text[] := '{}'::text[];
  v_anonymous_bank_account text;
  v_has_held_collateral boolean := false;
  v_has_open_payment_order boolean := false;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_FORBIDDEN';
  end if;

  select profile.*
  into v_profile
  from public.profiles profile
  where profile.id = p_worker_id
  for update;

  if not found or v_profile.role <> 'worker'::public.user_role then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_NOT_FOUND';
  end if;

  select deletion_request.*
  into v_request
  from public.worker_account_deletion_requests deletion_request
  where deletion_request.worker_id = p_worker_id
    and deletion_request.client_request_id = p_client_request_id
  limit 1;

  if found then
    return query
      select
        v_request.id,
        v_request.status,
        v_request.checkpoint,
        v_request.storage_refs;
    return;
  end if;

  if v_profile.account_state = 'deleted' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_ALREADY_DELETED';
  end if;

  if exists (
    select 1
    from public.jobs job
    where job.worker_id = p_worker_id
      and job.status not in (
        'paid'::public.job_status,
        'reviewed'::public.job_status,
        'cancelled'::public.job_status
      )
  ) or exists (
    select 1
    from public.job_worker_candidates candidate
    where candidate.worker_id = p_worker_id
      and candidate.status in ('proposed', 'customer_confirmed')
  ) then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_BLOCKED_ACTIVE_JOB';
  end if;

  if exists (
    select 1
    from public.disputes dispute
    left join public.jobs job on job.id = dispute.job_id
    where dispute.status <> 'resolved'
      and (
        job.worker_id = p_worker_id
        or dispute.initiated_by_id = p_worker_id
        or dispute.counter_party_id = p_worker_id
      )
  ) then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_BLOCKED_DISPUTE';
  end if;

  if pg_catalog.to_regclass('public.job_payment_orders') is not null then
    execute $query$
      select exists (
        select 1
        from public.job_payment_orders payment_order
        where payment_order.worker_id = $1
          and payment_order.status not in (
            'manual_verified',
            'manual_cancelled',
            'direct_paid'
          )
      )
    $query$
    into v_has_open_payment_order
    using p_worker_id;
  end if;

  if exists (
    select 1
    from public.worker_payment_ledger ledger
    where ledger.worker_id = p_worker_id
      and (
        ledger.payment_state in ('pending', 'on_hold')
        or coalesce(
          pg_catalog.to_jsonb(ledger) ->> 'settlement_state',
          ''
        ) in ('pending', 'customer_claimed')
      )
  ) or v_has_open_payment_order then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_BLOCKED_PAYMENT';
  end if;

  if pg_catalog.to_regclass(
    'public.worker_direct_payment_collateral_reservations'
  ) is not null then
    execute $query$
      select exists (
        select 1
        from public.worker_direct_payment_collateral_reservations collateral
        where collateral.worker_id = $1
          and collateral.status = 'held'
      )
    $query$
    into v_has_held_collateral
    using p_worker_id;
  end if;

  if exists (
    select 1
    from public.worker_withdrawal_requests withdrawal
    where withdrawal.worker_id = p_worker_id
      and withdrawal.status in ('pending', 'processing')
  ) or v_has_held_collateral or exists (
    select 1
    from public.worker_cash_commission_ledger ledger
    where ledger.worker_id = p_worker_id
      and ledger.cash_commission_due > coalesce((
        select sum(reconciliation.amount)
        from public.worker_cash_commission_reconciliations reconciliation
        where reconciliation.cash_commission_ledger_id = ledger.id
      ), 0)
  ) then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_BLOCKED_SETTLEMENT';
  end if;

  if exists (
    select 1
    from public.worker_account_deletion_requests deletion_request
    where deletion_request.worker_id = p_worker_id
      and deletion_request.status = 'processing'
  ) then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_ALREADY_PROCESSING';
  end if;

  select coalesce(array_agg(distinct owned_ref.storage_ref), '{}'::text[])
  into v_storage_refs
  from (
    select v_profile.avatar_url as storage_ref
    union all
    select worker.cccd_front_url
    from public.worker_profiles worker
    where worker.id = p_worker_id
    union all
    select worker.cccd_back_url
    from public.worker_profiles worker
    where worker.id = p_worker_id
    union all
    select worker.selfie_url
    from public.worker_profiles worker
    where worker.id = p_worker_id
    union all
    select unnest(turn.media_refs)
    from public.kael_worker_chat_turns turn
    join public.kael_worker_chat_sessions session on session.id = turn.session_id
    where session.worker_id = p_worker_id
    union all
    select unnest(turn_request.media_refs)
    from public.kael_worker_chat_turn_requests turn_request
    where turn_request.worker_id = p_worker_id
  ) owned_ref
  where owned_ref.storage_ref is not null
    and (
      owned_ref.storage_ref like 'supabase://worker-avatars/' || p_worker_id::text || '/%'
      or owned_ref.storage_ref like 'supabase://worker-verification/' || p_worker_id::text || '/%'
      or owned_ref.storage_ref like 'supabase://kael-chat-media/' || p_worker_id::text || '/kael-chat/%'
    );

  insert into public.worker_account_deletion_requests (
    worker_id,
    client_request_id,
    status,
    checkpoint,
    storage_refs
  )
  values (
    p_worker_id,
    p_client_request_id,
    'processing',
    'requested',
    v_storage_refs
  )
  returning * into v_request;

  update public.profiles
  set
    account_state = 'deletion_processing',
    deletion_requested_at = coalesce(deletion_requested_at, now()),
    full_name = null,
    phone = null,
    avatar_url = null
  where id = p_worker_id;

  update public.worker_profiles
  set
    service_types = '{}'::public.service_type[],
    selected_service_types = '{}'::public.service_type[],
    active_service_types = null,
    problem_specializations = '{}'::text[],
    districts = '{}'::text[],
    is_approved = false,
    is_available = false,
    is_suspended = true,
    cccd_front_url = null,
    cccd_back_url = null,
    selfie_url = null,
    bank_account = null,
    bank_name = null,
    legal_name = null,
    date_of_birth = null,
    gender = null,
    home_lat = null,
    home_lng = null,
    verification_status = 'draft'::public.worker_verification_status,
    app_active_minutes = 0,
    app_last_active_minute = null
  where id = p_worker_id;

  v_anonymous_bank_account := 'deleted' || replace(p_worker_id::text, '-', '');

  update public.worker_payout_methods
  set
    account_holder_name = 'Tài khoản đã xóa',
    bank_account = v_anonymous_bank_account,
    bank_account_masked = '**** 0000'
  where worker_id = p_worker_id;

  update public.worker_withdrawal_requests
  set
    account_holder_name = 'Tài khoản đã xóa',
    bank_account = v_anonymous_bank_account,
    bank_account_masked = '**** 0000'
  where worker_id = p_worker_id;

  delete from public.device_push_tokens
  where user_id = p_worker_id;

  delete from public.notifications
  where user_id = p_worker_id;

  delete from public.worker_kael_memory
  where worker_id = p_worker_id;

  delete from public.worker_kael_feedback
  where worker_id = p_worker_id;

  delete from public.worker_kael_training_consent
  where worker_id = p_worker_id;

  delete from public.kael_voice_transcript
  where user_id = p_worker_id;

  delete from public.kael_worker_qa_log
  where worker_id = p_worker_id;

  delete from public.kael_worker_chat_rate_limit_log
  where worker_id = p_worker_id;

  delete from public.kael_worker_chat_sessions
  where worker_id = p_worker_id;

  delete from public.worker_scope_change_stats
  where worker_id = p_worker_id;

  delete from public.worker_stats
  where worker_id = p_worker_id;

  update public.chat_messages message
  set
    sender_id = null,
    content = 'Nội dung đã được xóa theo yêu cầu của thợ.'
  where message.sender_id = p_worker_id;

  update public.worker_cancellation_requests
  set
    reason = 'Thông tin đã được xóa theo yêu cầu của thợ.',
    abuse_signals = '{}'::text[],
    fallback_options = '{}'::jsonb,
    kael_review = null,
    review_note = null
  where worker_id = p_worker_id;

  update public.worker_account_deletion_requests
  set
    checkpoint = 'database_scrubbed',
    database_scrubbed_at = now()
  where id = v_request.id
  returning * into v_request;

  return query
    select
      v_request.id,
      v_request.status,
      v_request.checkpoint,
      v_request.storage_refs;
end;
$$;

commit;
