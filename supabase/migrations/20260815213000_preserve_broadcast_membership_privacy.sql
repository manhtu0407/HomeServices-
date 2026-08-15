begin;

create or replace function public.accept_broadcast_atomic(
  p_job_id uuid,
  p_worker_id uuid
)
returns table (
  ok boolean,
  error_code text,
  job_status public.job_status,
  candidate_id uuid,
  already_applied boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_quote_id uuid;
begin
  select (broadcast.original_scope_price_quote ->> 'quote_id')::uuid
  into v_quote_id
  from public.job_broadcasts as broadcast
  where broadcast.job_id = p_job_id
    and broadcast.worker_id = p_worker_id
    and broadcast.status in (
      'sent'::public.broadcast_status,
      'accepted'::public.broadcast_status
    )
  order by broadcast.sent_at desc nulls last,
    broadcast.broadcast_at desc nulls last,
    broadcast.id desc
  limit 1;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  if v_quote_id is null then
    return query select false, 'PRICE_QUOTE_REQUIRED'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  return query
  select *
  from public.accept_broadcast_atomic(p_job_id, p_worker_id, v_quote_id);
end;
$func$;

revoke execute on function public.accept_broadcast_atomic(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.accept_broadcast_atomic(uuid, uuid)
  to service_role;

comment on function public.accept_broadcast_atomic(uuid, uuid) is
  'Compatibility wrapper that preserves broadcast-membership privacy while resolving the server-frozen quote.';

commit;
