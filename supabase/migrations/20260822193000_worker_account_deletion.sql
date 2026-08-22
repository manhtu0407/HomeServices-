-- Extends self-service account deletion to workers and closes customer PII
-- fields introduced after the original customer deletion migration.

begin;

alter table public.customer_account_deletion_requests
  add column if not exists storage_refs text[] not null default '{}'::text[];

create table if not exists public.worker_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete restrict,
  client_request_id uuid not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed')),
  checkpoint text not null default 'requested'
    check (checkpoint in ('requested', 'database_scrubbed', 'completed')),
  storage_refs text[] not null default '{}'::text[],
  requested_at timestamptz not null default now(),
  database_scrubbed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, client_request_id)
);

create unique index if not exists worker_account_deletion_one_open_idx
  on public.worker_account_deletion_requests (worker_id)
  where status = 'processing';

create index if not exists worker_account_deletion_status_idx
  on public.worker_account_deletion_requests (status, updated_at);

drop trigger if exists worker_account_deletion_requests_updated_at
  on public.worker_account_deletion_requests;
create trigger worker_account_deletion_requests_updated_at
  before update on public.worker_account_deletion_requests
  for each row execute function public.update_updated_at();

alter table public.worker_account_deletion_requests enable row level security;
revoke all on table public.worker_account_deletion_requests
  from public, anon, authenticated;
grant all on table public.worker_account_deletion_requests to service_role;

do $policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'worker_profiles',
    'worker_kael_memory',
    'worker_kael_feedback',
    'worker_kael_training_consent',
    'kael_worker_chat_sessions',
    'kael_worker_chat_turns',
    'kael_worker_qa_log',
    'kael_voice_transcript',
    'worker_scope_change_stats',
    'worker_stats',
    'worker_cancellation_requests'
  ]
  loop
    execute format(
      'drop policy if exists "Active accounts only" on public.%I',
      table_name
    );
    execute format(
      'create policy "Active accounts only" on public.%I as restrictive for all to authenticated using (private.is_active_account()) with check (private.is_active_account())',
      table_name
    );
  end loop;
end;
$policies$;

-- Withdrawal snapshots remain immutable during ordinary operations. Account
-- deletion may replace only bank-account PII after the profile is locked.
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
    or new.requested_at is distinct from old.requested_at
  then
    raise exception 'worker withdrawal request financial snapshot is immutable';
  end if;

  if (
    new.account_holder_name is distinct from old.account_holder_name
    or new.bank_account is distinct from old.bank_account
    or new.bank_account_masked is distinct from old.bank_account_masked
  ) and not exists (
    select 1
    from public.profiles profile
    where profile.id = old.worker_id
      and profile.account_state = 'deletion_processing'
  ) then
    raise exception 'worker withdrawal request bank snapshot is immutable';
  end if;
  return new;
end;
$function$;

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

  if exists (
    select 1
    from public.worker_payment_ledger ledger
    where ledger.worker_id = p_worker_id
      and (
        ledger.payment_state in ('pending', 'on_hold')
        or ledger.settlement_state in ('pending', 'customer_claimed')
      )
  ) or exists (
    select 1
    from public.job_payment_orders payment_order
    where payment_order.worker_id = p_worker_id
      and payment_order.status not in (
        'manual_verified',
        'manual_cancelled',
        'direct_paid'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_BLOCKED_PAYMENT';
  end if;

  if exists (
    select 1
    from public.worker_withdrawal_requests withdrawal
    where withdrawal.worker_id = p_worker_id
      and withdrawal.status in ('pending', 'processing')
  ) or exists (
    select 1
    from public.worker_direct_payment_collateral_reservations collateral
    where collateral.worker_id = p_worker_id
      and collateral.status = 'held'
  ) or exists (
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
    active_service_types = '{}'::public.service_type[],
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

create or replace function public.complete_worker_account_deletion(
  p_worker_id uuid,
  p_client_request_id uuid
)
returns table (
  request_id uuid,
  request_status text,
  checkpoint text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.worker_account_deletion_requests%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_FORBIDDEN';
  end if;

  select deletion_request.*
  into v_request
  from public.worker_account_deletion_requests deletion_request
  where deletion_request.worker_id = p_worker_id
    and deletion_request.client_request_id = p_client_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_NOT_FOUND';
  end if;

  update public.profiles
  set
    account_state = 'deleted',
    deleted_at = coalesce(deleted_at, now())
  where id = p_worker_id;

  update public.worker_account_deletion_requests
  set
    status = 'completed',
    checkpoint = 'completed',
    completed_at = coalesce(completed_at, now())
  where id = v_request.id
  returning * into v_request;

  return query
    select v_request.id, v_request.status, v_request.checkpoint;
end;
$$;

-- The v2 wrapper captures private Kael media before the original customer RPC
-- cascades its chat rows, then closes address/access fields added later.
create or replace function public.prepare_customer_account_deletion_v2(
  p_customer_id uuid,
  p_client_request_id uuid
)
returns table (
  request_id uuid,
  request_status text,
  checkpoint text,
  avatar_storage_ref text,
  storage_refs text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_storage_refs text[] := '{}'::text[];
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_FORBIDDEN';
  end if;

  select coalesce(array_agg(distinct media_ref), '{}'::text[])
  into v_storage_refs
  from (
    select unnest(turn.media_refs) as media_ref
    from public.kael_chat_turns turn
    join public.kael_chat_sessions session on session.id = turn.session_id
    where session.customer_id = p_customer_id
  ) customer_media
  where media_ref like 'supabase://kael-chat-media/' || p_customer_id::text || '/kael-chat/%';

  select *
  into v_request
  from public.prepare_customer_account_deletion(
    p_customer_id,
    p_client_request_id
  );

  update public.customer_account_deletion_requests deletion_request
  set storage_refs = case
    when cardinality(deletion_request.storage_refs) = 0 then v_storage_refs
    else deletion_request.storage_refs
  end
  where deletion_request.id = v_request.request_id;

  delete from public.kael_voice_transcript
  where user_id = p_customer_id;

  update public.jobs
  set
    address_lat = null,
    address_lng = null,
    apartment_access_profile = '{}'::jsonb,
    apartment_access_state = '{}'::jsonb
  where customer_id = p_customer_id;

  return query
    select
      deletion_request.id,
      deletion_request.status,
      deletion_request.checkpoint,
      deletion_request.avatar_storage_ref,
      deletion_request.storage_refs
    from public.customer_account_deletion_requests deletion_request
    where deletion_request.id = v_request.request_id;
end;
$$;

revoke all on function public.prepare_worker_account_deletion(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_worker_account_deletion(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.prepare_customer_account_deletion_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_worker_account_deletion(uuid, uuid)
  to service_role;
grant execute on function public.complete_worker_account_deletion(uuid, uuid)
  to service_role;
grant execute on function public.prepare_customer_account_deletion_v2(uuid, uuid)
  to service_role;

commit;
