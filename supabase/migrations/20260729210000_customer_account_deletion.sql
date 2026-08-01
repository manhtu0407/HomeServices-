-- Customer account deletion foundation.
--
-- The account row stays as a de-identified transaction anchor because jobs,
-- reviews, disputes, and settlement records must not be silently destroyed.
-- Authentication is soft-deleted separately by mobile-api after this
-- transaction completes.

begin;

alter table public.profiles
  add column if not exists account_state text not null default 'active',
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_account_state_check;

alter table public.profiles
  add constraint profiles_account_state_check
  check (account_state in ('active', 'deletion_processing', 'deleted'));

create table if not exists public.customer_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  client_request_id uuid not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed')),
  checkpoint text not null default 'requested'
    check (checkpoint in ('requested', 'database_scrubbed', 'completed')),
  avatar_storage_ref text,
  requested_at timestamptz not null default now(),
  database_scrubbed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, client_request_id)
);

create unique index if not exists customer_account_deletion_one_open_idx
  on public.customer_account_deletion_requests (customer_id)
  where status = 'processing';

create index if not exists customer_account_deletion_status_idx
  on public.customer_account_deletion_requests (status, updated_at);

drop trigger if exists customer_account_deletion_requests_updated_at
  on public.customer_account_deletion_requests;
create trigger customer_account_deletion_requests_updated_at
  before update on public.customer_account_deletion_requests
  for each row execute function public.update_updated_at();

alter table public.customer_account_deletion_requests enable row level security;
revoke all on table public.customer_account_deletion_requests from public, anon, authenticated;
grant all on table public.customer_account_deletion_requests to service_role;

create or replace function private.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.account_state = 'active'
  );
$$;

revoke all on function private.is_active_account() from public, anon;
grant execute on function private.is_active_account() to authenticated, service_role;

do $policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'customer_profiles',
    'jobs',
    'chat_messages',
    'reviews',
    'notifications',
    'customer_payment_methods',
    'customer_kael_memory',
    'kael_chat_sessions',
    'kael_chat_turns',
    'kael_customer_conversations',
    'kael_customer_conversation_turns',
    'customer_kael_feedback',
    'customer_cancellation_records',
    'device_push_tokens'
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

create or replace function public.prepare_customer_account_deletion(
  p_customer_id uuid,
  p_client_request_id uuid
)
returns table (
  request_id uuid,
  request_status text,
  checkpoint text,
  avatar_storage_ref text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_request public.customer_account_deletion_requests%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_FORBIDDEN';
  end if;

  select profile.*
  into v_profile
  from public.profiles profile
  where profile.id = p_customer_id
  for update;

  if not found or v_profile.role <> 'customer'::public.user_role then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_NOT_FOUND';
  end if;

  select deletion_request.*
  into v_request
  from public.customer_account_deletion_requests deletion_request
  where deletion_request.customer_id = p_customer_id
    and deletion_request.client_request_id = p_client_request_id
  limit 1;

  if found then
    return query
      select
        v_request.id,
        v_request.status,
        v_request.checkpoint,
        v_request.avatar_storage_ref;
    return;
  end if;

  if v_profile.account_state = 'deleted' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_ALREADY_DELETED';
  end if;

  if exists (
    select 1
    from public.jobs job
    where job.customer_id = p_customer_id
      and job.status not in (
        'paid'::public.job_status,
        'reviewed'::public.job_status,
        'cancelled'::public.job_status
      )
  ) then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_BLOCKED_ACTIVE_JOB';
  end if;

  if exists (
    select 1
    from public.disputes dispute
    join public.jobs job on job.id = dispute.job_id
    where job.customer_id = p_customer_id
      and dispute.status <> 'resolved'
  ) then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_BLOCKED_DISPUTE';
  end if;

  if exists (
    select 1
    from public.worker_payment_ledger ledger
    join public.jobs job on job.id = ledger.job_id
    where job.customer_id = p_customer_id
      and ledger.payment_state in ('pending', 'on_hold')
  ) then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_BLOCKED_PAYMENT';
  end if;

  if exists (
    select 1
    from public.customer_account_deletion_requests deletion_request
    where deletion_request.customer_id = p_customer_id
      and deletion_request.status = 'processing'
  ) then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_ALREADY_PROCESSING';
  end if;

  insert into public.customer_account_deletion_requests (
    customer_id,
    client_request_id,
    status,
    checkpoint,
    avatar_storage_ref
  )
  values (
    p_customer_id,
    p_client_request_id,
    'processing',
    'requested',
    v_profile.avatar_url
  )
  returning * into v_request;

  update public.profiles
  set
    account_state = 'deletion_processing',
    deletion_requested_at = coalesce(deletion_requested_at, now()),
    full_name = null,
    phone = null,
    avatar_url = null
  where id = p_customer_id;

  update public.customer_profiles
  set
    building_name = null,
    unit_number = null,
    floor = null,
    district = null
  where id = p_customer_id;

  delete from public.customer_payment_methods
  where customer_id = p_customer_id;

  delete from public.device_push_tokens
  where user_id = p_customer_id;

  delete from public.notifications
  where user_id = p_customer_id;

  delete from public.customer_kael_memory
  where customer_id = p_customer_id;

  delete from public.customer_kael_feedback
  where customer_id = p_customer_id;

  delete from public.kael_customer_conversations
  where customer_id = p_customer_id;

  delete from public.kael_chat_sessions
  where customer_id = p_customer_id;

  delete from public.kael_chat_pre_intake_memory
  where customer_id = p_customer_id;

  delete from public.kael_chat_media_upload_intents
  where customer_id = p_customer_id;

  delete from public.customer_favorite_workers
  where customer_id = p_customer_id;

  delete from public.customer_stats
  where customer_id = p_customer_id;

  update public.jobs
  set
    problem_chips = '{}'::text[],
    description = 'Thông tin đã được xóa theo yêu cầu của khách hàng.',
    photo_urls = '{}'::text[],
    address_building = null,
    address_unit = null,
    address_floor = null,
    address_district = null,
    kael_problem_identified = null,
    kael_advisory = null,
    price_context_1 = null,
    price_context_2 = null,
    scope_change_description = null,
    scope_change_reason = null,
    completion_notes = null,
    completion_photo_urls = '{}'::text[]
  where customer_id = p_customer_id;

  update public.chat_messages message
  set
    sender_id = case when message.sender_id = p_customer_id then null else message.sender_id end,
    content = 'Nội dung đã được xóa theo yêu cầu của khách hàng.'
  where message.job_id in (
    select job.id
    from public.jobs job
    where job.customer_id = p_customer_id
  );

  update public.reviews
  set comment = null
  where customer_id = p_customer_id;

  update public.customer_cancellation_records
  set
    reason_note = null,
    safe_metadata = '{}'::jsonb
  where customer_id = p_customer_id;

  update public.customer_account_deletion_requests
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
      v_request.avatar_storage_ref;
end;
$$;

create or replace function public.complete_customer_account_deletion(
  p_customer_id uuid,
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
  v_request public.customer_account_deletion_requests%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_FORBIDDEN';
  end if;

  select deletion_request.*
  into v_request
  from public.customer_account_deletion_requests deletion_request
  where deletion_request.customer_id = p_customer_id
    and deletion_request.client_request_id = p_client_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_NOT_FOUND';
  end if;

  update public.profiles
  set
    account_state = 'deleted',
    deleted_at = coalesce(deleted_at, now())
  where id = p_customer_id;

  update public.customer_account_deletion_requests
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

revoke all on function public.prepare_customer_account_deletion(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_customer_account_deletion(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_customer_account_deletion(uuid, uuid)
  to service_role;
grant execute on function public.complete_customer_account_deletion(uuid, uuid)
  to service_role;

commit;
