-- Cover the composite owner FK used for cascades and owner-scoped turn reads.
create index if not exists kael_customer_conversation_turns_owner_idx
  on public.kael_customer_conversation_turns (conversation_id, customer_id);
