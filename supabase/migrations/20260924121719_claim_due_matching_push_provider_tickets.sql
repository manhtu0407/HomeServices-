begin;

-- The matching maintainer reconciles Expo receipts for every recipient, not for one worker, and
-- identifies itself with a non-UUID dispatcher id. claim_matching_push_provider_tickets(uuid, integer)
-- filters by one recipient worker, so the maintainer's call failed every minute before any
-- ticket was claimed. This claim covers every due ticket; the per-worker function stays for
-- existing callers.
create or replace function public.claim_due_matching_push_provider_tickets(
  p_limit integer default 50
) returns table(provider_ticket_row_id uuid, provider_ticket_id text)
language plpgsql security invoker set search_path = '' as $func$
declare
  v_now timestamptz := pg_catalog.now();
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'PUSH_RECEIPT_CLAIM_INVALID';
  end if;

  return query
  with claimable as (
    select ticket.id
    from public.matching_push_provider_tickets as ticket
    where ticket.provider_status = 'submitted'
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

revoke execute on function public.claim_due_matching_push_provider_tickets(integer)
from public, anon, authenticated;
grant execute on function public.claim_due_matching_push_provider_tickets(integer)
to service_role;

commit;
