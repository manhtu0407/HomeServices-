-- Normal Customer Kael Chat stores private image refs on the customer turn so
-- the conversation remains recoverable without persisting signed provider URLs.
alter table public.kael_customer_conversation_turns
  add column media_refs text[] not null default '{}'::text[];

alter table public.kael_customer_conversation_turns
  add constraint kael_customer_conversation_turns_media_refs_check
  check (
    cardinality(media_refs) <= 5
    and (role = 'customer' or cardinality(media_refs) = 0)
  );

create or replace function public.append_customer_kael_conversation_exchange(
  p_conversation_id uuid,
  p_customer_id uuid,
  p_client_request_id uuid,
  p_customer_text text,
  p_media_refs text[],
  p_kael_text text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_turns integer;
  customer_media_refs text[] := coalesce(p_media_refs, '{}'::text[]);
begin
  if cardinality(customer_media_refs) > 5 then
    raise exception 'too many customer Kael image refs' using errcode = '22023';
  end if;

  select conversations.total_turns
    into current_turns
  from public.kael_customer_conversations as conversations
  where conversations.id = p_conversation_id
    and conversations.customer_id = p_customer_id
    and conversations.archived_at is null
  for update;

  if not found then
    raise exception 'customer Kael conversation not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.kael_customer_conversation_turns as turns
    where turns.conversation_id = p_conversation_id
      and turns.customer_id = p_customer_id
      and turns.client_request_id = p_client_request_id
  ) then
    return current_turns;
  end if;

  insert into public.kael_customer_conversation_turns (
    conversation_id,
    customer_id,
    turn_index,
    role,
    text_content,
    client_request_id,
    media_refs
  ) values
    (
      p_conversation_id,
      p_customer_id,
      current_turns + 1,
      'customer',
      p_customer_text,
      p_client_request_id,
      customer_media_refs
    ),
    (
      p_conversation_id,
      p_customer_id,
      current_turns + 2,
      'kael',
      p_kael_text,
      null,
      '{}'::text[]
    );

  update public.kael_customer_conversations
  set total_turns = current_turns + 2
  where id = p_conversation_id
    and customer_id = p_customer_id;

  return current_turns + 2;
end;
$$;

-- Keep the old no-media RPC shape available to any already shipped caller.
create or replace function public.append_customer_kael_conversation_exchange(
  p_conversation_id uuid,
  p_customer_id uuid,
  p_client_request_id uuid,
  p_customer_text text,
  p_kael_text text
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select public.append_customer_kael_conversation_exchange(
    p_conversation_id,
    p_customer_id,
    p_client_request_id,
    p_customer_text,
    '{}'::text[],
    p_kael_text
  );
$$;

revoke all on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text[], text)
  to service_role;
revoke all on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.append_customer_kael_conversation_exchange(uuid, uuid, uuid, text, text)
  to service_role;

comment on column public.kael_customer_conversation_turns.media_refs is
  'Private model_vision refs attached to a Customer normal-chat turn; signed URLs are generated only for provider calls.';
