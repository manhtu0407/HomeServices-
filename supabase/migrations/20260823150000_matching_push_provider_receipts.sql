begin;

create table public.matching_push_provider_tickets (
  id uuid primary key default gen_random_uuid(),
  matching_delivery_id uuid not null references public.matching_recipient_deliveries(id) on delete cascade,
  device_push_token_id uuid not null references public.device_push_tokens(id) on delete cascade,
  device_push_token_updated_at timestamptz not null,
  provider_ticket_id text not null unique
    check (length(provider_ticket_id) between 1 and 200 and provider_ticket_id = btrim(provider_ticket_id)),
  provider_status text not null default 'submitted'
    check (provider_status in ('submitted', 'provider_handoff', 'failed')),
  provider_error_code text check (
    provider_error_code is null or length(provider_error_code) between 1 and 64
  ),
  receipt_attempt_count smallint not null default 0
    check (receipt_attempt_count between 0 and 6),
  next_receipt_check_at timestamptz not null default now(),
  last_receipt_check_at timestamptz,
  provider_receipt_at timestamptz,
  token_generation_current_at_receipt boolean,
  app_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (matching_delivery_id, device_push_token_id, device_push_token_updated_at),
  check (
    (provider_status = 'submitted' and provider_receipt_at is null and provider_error_code is null)
    or (provider_status = 'provider_handoff' and provider_receipt_at is not null and provider_error_code is null)
    or (provider_status = 'failed' and provider_receipt_at is not null and provider_error_code is not null)
  )
);

create index matching_push_provider_tickets_delivery_idx
  on public.matching_push_provider_tickets(matching_delivery_id);
create index matching_push_provider_tickets_token_idx
  on public.matching_push_provider_tickets(device_push_token_id);
create index matching_push_provider_tickets_claim_idx
  on public.matching_push_provider_tickets(next_receipt_check_at, created_at)
  where provider_status = 'submitted' and receipt_attempt_count < 6;

alter table public.matching_push_provider_tickets enable row level security;
revoke all on public.matching_push_provider_tickets from public, anon, authenticated;
grant select, insert, update, delete on public.matching_push_provider_tickets to service_role;

create or replace function public.record_matching_push_provider_ticket(
  p_delivery_id uuid,
  p_device_push_token_id uuid,
  p_device_push_token_updated_at timestamptz,
  p_provider_ticket_id text
) returns table(recorded boolean, ticket_row_id uuid)
language plpgsql security invoker set search_path = '' as $func$
declare
  v_delivery_worker_id uuid;
  v_token_user_id uuid;
begin
  if p_delivery_id is null or p_device_push_token_id is null
    or p_device_push_token_updated_at is null
    or p_provider_ticket_id is null
    or length(p_provider_ticket_id) not between 1 and 200
    or p_provider_ticket_id <> btrim(p_provider_ticket_id)
  then
    return query select false, null::uuid;
    return;
  end if;

  select delivery.worker_id into v_delivery_worker_id
  from public.matching_recipient_deliveries as delivery
  where delivery.id = p_delivery_id;
  select token.user_id into v_token_user_id
  from public.device_push_tokens as token
  where token.id = p_device_push_token_id;
  if v_delivery_worker_id is null or v_token_user_id is distinct from v_delivery_worker_id then
    return query select false, null::uuid;
    return;
  end if;

  insert into public.matching_push_provider_tickets(
    matching_delivery_id,
    device_push_token_id,
    device_push_token_updated_at,
    provider_ticket_id
  ) values (
    p_delivery_id,
    p_device_push_token_id,
    p_device_push_token_updated_at,
    p_provider_ticket_id
  )
  on conflict do nothing
  returning id into ticket_row_id;

  if ticket_row_id is null then
    select ticket.id into ticket_row_id
    from public.matching_push_provider_tickets as ticket
    where ticket.matching_delivery_id = p_delivery_id
      and ticket.device_push_token_id = p_device_push_token_id
      and ticket.device_push_token_updated_at = p_device_push_token_updated_at
      and ticket.provider_ticket_id = p_provider_ticket_id;
  end if;
  recorded := ticket_row_id is not null;
  return next;
end;
$func$;

create or replace function public.claim_matching_push_provider_tickets(
  p_worker_id uuid,
  p_limit integer default 50
) returns table(provider_ticket_row_id uuid, provider_ticket_id text)
language plpgsql security invoker set search_path = '' as $func$
declare
  v_now timestamptz := pg_catalog.now();
begin
  if p_worker_id is null or p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'PUSH_RECEIPT_CLAIM_INVALID';
  end if;

  return query
  with claimable as (
    select ticket.id
    from public.matching_push_provider_tickets as ticket
    join public.matching_recipient_deliveries as delivery
      on delivery.id = ticket.matching_delivery_id
    where delivery.worker_id = p_worker_id
      and ticket.provider_status = 'submitted'
      and ticket.receipt_attempt_count < 6
      and ticket.next_receipt_check_at <= v_now
      and ticket.created_at > v_now - interval '24 hours'
    order by ticket.next_receipt_check_at, ticket.created_at, ticket.id
    for update of ticket skip locked
    limit p_limit
  ), claimed as (
    update public.matching_push_provider_tickets as ticket
    set receipt_attempt_count = ticket.receipt_attempt_count + 1,
      last_receipt_check_at = v_now,
      next_receipt_check_at = v_now + interval '30 seconds',
      updated_at = v_now
    from claimable
    where ticket.id = claimable.id
    returning ticket.id, ticket.provider_ticket_id
  )
  select claimed.id, claimed.provider_ticket_id from claimed;
end;
$func$;

create or replace function public.apply_matching_push_provider_receipt(
  p_provider_ticket_row_id uuid,
  p_provider_status text,
  p_provider_error_code text default null
) returns table(outcome text, token_disabled boolean)
language plpgsql security invoker set search_path = '' as $func$
declare
  v_ticket public.matching_push_provider_tickets%rowtype;
  v_delivery_worker_id uuid;
  v_token_current boolean := false;
  v_disabled_count integer := 0;
  v_now timestamptz := pg_catalog.now();
begin
  if p_provider_ticket_row_id is null or p_provider_status not in ('ok', 'error')
    or (p_provider_status = 'ok' and p_provider_error_code is not null)
    or (p_provider_status = 'error' and (
      p_provider_error_code is null or length(p_provider_error_code) not between 1 and 64
    ))
  then
    raise exception using errcode = '22023', message = 'PUSH_RECEIPT_INVALID';
  end if;

  select ticket.* into v_ticket
  from public.matching_push_provider_tickets as ticket
  where ticket.id = p_provider_ticket_row_id
  for update;
  if not found then return; end if;

  if v_ticket.provider_status = 'provider_handoff' then
    outcome := case when v_ticket.token_generation_current_at_receipt then
      'provider_handoff' else 'stale_token' end;
    token_disabled := false;
    return next;
    return;
  end if;
  if v_ticket.provider_status = 'failed' then
    outcome := 'failed';
    token_disabled := false;
    return next;
    return;
  end if;

  select delivery.worker_id into v_delivery_worker_id
  from public.matching_recipient_deliveries as delivery
  where delivery.id = v_ticket.matching_delivery_id;
  select exists (
    select 1
    from public.device_push_tokens as token
    where token.id = v_ticket.device_push_token_id
      and token.user_id = v_delivery_worker_id
      and token.updated_at = v_ticket.device_push_token_updated_at
      and token.enabled is true
      and token.permission_status = 'granted'
  ) into v_token_current;

  if p_provider_status = 'ok' then
    update public.matching_push_provider_tickets
    set provider_status = 'provider_handoff',
      provider_receipt_at = v_now,
      token_generation_current_at_receipt = v_token_current,
      updated_at = v_now
    where id = v_ticket.id;
    outcome := case when v_token_current then 'provider_handoff' else 'stale_token' end;
    token_disabled := false;
    return next;
    return;
  end if;

  update public.matching_push_provider_tickets
  set provider_status = 'failed',
    provider_error_code = p_provider_error_code,
    provider_receipt_at = v_now,
    token_generation_current_at_receipt = v_token_current,
    updated_at = v_now
  where id = v_ticket.id;
  if p_provider_error_code = 'DeviceNotRegistered' then
    update public.device_push_tokens as token
    set enabled = false,
      push_token = '',
      last_seen_at = v_now,
      updated_at = v_now
    where token.id = v_ticket.device_push_token_id
      and token.updated_at = v_ticket.device_push_token_updated_at
      and token.enabled is true;
    get diagnostics v_disabled_count = row_count;
  end if;
  outcome := 'failed';
  token_disabled := v_disabled_count > 0;
  return next;
end;
$func$;

create or replace function public.acknowledge_matching_push_delivery(
  p_delivery_id uuid,
  p_worker_id uuid,
  p_device_push_token_id uuid,
  p_device_push_token_updated_at timestamptz
) returns setof public.matching_recipient_deliveries
language plpgsql security invoker set search_path = '' as $func$
declare
  v_now timestamptz := pg_catalog.now();
  v_token_current boolean := false;
begin
  if p_delivery_id is null or p_worker_id is null
    or p_device_push_token_id is null or p_device_push_token_updated_at is null
  then return; end if;

  select exists (
    select 1
    from public.matching_push_provider_tickets as ticket
    join public.device_push_tokens as token on token.id = ticket.device_push_token_id
    where ticket.matching_delivery_id = p_delivery_id
      and ticket.device_push_token_id = p_device_push_token_id
      and ticket.device_push_token_updated_at = p_device_push_token_updated_at
      and ticket.provider_status in ('submitted', 'provider_handoff')
      and token.user_id = p_worker_id
      and token.updated_at = p_device_push_token_updated_at
      and token.enabled is true
      and token.permission_status = 'granted'
  ) into v_token_current;
  if not v_token_current then return; end if;

  return query
  with acknowledged as (
    update public.matching_recipient_deliveries as delivery
    set status = case when delivery.status = 'queued' then 'delivered' else delivery.status end,
      delivered_at = coalesce(delivery.delivered_at, v_now),
      updated_at = v_now
    where delivery.id = p_delivery_id
      and delivery.worker_id = p_worker_id
      and delivery.status in ('queued', 'delivered', 'seen')
      and delivery.expires_at > v_now
    returning delivery.*
  ), proof as (
    update public.worker_profiles as worker
    set matching_push_proven_at = v_now,
      updated_at = v_now
    where worker.id = p_worker_id
      and exists (select 1 from acknowledged)
    returning worker.id
  ), ticket_ack as (
    update public.matching_push_provider_tickets as ticket
    set app_acknowledged_at = coalesce(ticket.app_acknowledged_at, v_now),
      updated_at = v_now
    where ticket.matching_delivery_id = p_delivery_id
      and ticket.device_push_token_id = p_device_push_token_id
      and ticket.device_push_token_updated_at = p_device_push_token_updated_at
      and exists (select 1 from proof)
    returning ticket.id
  )
  select acknowledged.* from acknowledged
  where exists (select 1 from ticket_ack);
end;
$func$;

revoke execute on function public.mark_matching_delivery_delivered(uuid) from service_role;
revoke execute on function public.record_matching_push_provider_ticket(uuid, uuid, timestamptz, text),
  public.claim_matching_push_provider_tickets(uuid, integer),
  public.apply_matching_push_provider_receipt(uuid, text, text),
  public.acknowledge_matching_push_delivery(uuid, uuid, uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.record_matching_push_provider_ticket(uuid, uuid, timestamptz, text),
  public.claim_matching_push_provider_tickets(uuid, integer),
  public.apply_matching_push_provider_receipt(uuid, text, text),
  public.acknowledge_matching_push_delivery(uuid, uuid, uuid, timestamptz)
to service_role;

comment on table public.matching_push_provider_tickets is
  'Expo tickets and receipts bound to one matching delivery and one exact device-token generation; provider handoff is not application delivery.';

commit;
