begin;

-- Discipline and compensation decisions already reach the inbox in the same transaction that
-- makes them; this lets the maintainer also push them to a closed app. A receipt row is written
-- when a notice is claimed, so each notice is pushed at most once; a failed push is logged by
-- the caller and the inbox entry remains the record.
create table public.program_push_receipts (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.program_push_receipts enable row level security;
revoke all on table public.program_push_receipts from public, anon, authenticated;
grant select on table public.program_push_receipts to service_role;

create index notifications_program_push_idx
  on public.notifications (created_at)
  where event_type in (
    'violation_confirmed', 'violation_confirmed_customer', 'violation_appeal_upheld',
    'violation_appeal_overturned', 'withdrawal_hold_extended', 'compensation_claim_received',
    'compensation_counter_offer', 'compensation_agreed', 'compensation_declined', 'compensation_paid'
  );

-- Only notices from the last day are claimed: an older one is stale news, and the window keeps
-- the scan on the partial index.
create or replace function public.claim_program_pushes(p_limit integer)
returns table (notification_id uuid, user_id uuid, recipient_role text, event_type text, title text, body text)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'INVALID_PROGRAM_PUSH_LIMIT' using errcode = '22023';
  end if;

  return query
  with due as (
    select notice.id, notice.user_id, notice.event_type, notice.title, notice.body, notice.created_at
    from public.notifications as notice
    where notice.event_type in (
        'violation_confirmed', 'violation_confirmed_customer', 'violation_appeal_upheld',
        'violation_appeal_overturned', 'withdrawal_hold_extended', 'compensation_claim_received',
        'compensation_counter_offer', 'compensation_agreed', 'compensation_declined', 'compensation_paid'
      )
      and notice.created_at > pg_catalog.now() - interval '1 day'
      and not exists (
        select 1 from public.program_push_receipts as receipt where receipt.notification_id = notice.id
      )
    order by notice.created_at
    limit p_limit
    for update of notice skip locked
  ), claimed as (
    insert into public.program_push_receipts (notification_id)
    select due.id from due
    on conflict do nothing
    returning program_push_receipts.notification_id
  )
  select due.id, due.user_id, profile.role::text, due.event_type, due.title, due.body
  from due
  join claimed on claimed.notification_id = due.id
  join public.profiles as profile on profile.id = due.user_id
  order by due.created_at;
end;
$function$;

revoke all on function public.claim_program_pushes(integer) from public, anon, authenticated;
grant execute on function public.claim_program_pushes(integer) to service_role;

commit;
