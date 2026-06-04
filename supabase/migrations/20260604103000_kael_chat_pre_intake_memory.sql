-- =============================================================================
-- Kael chat pre-intake memory.
--
-- A customer can greet Kael or describe a problem before choosing electrical,
-- plumbing, or cleaning. Those turns should still persist as a real Kael chat
-- session, then be promoted to a service intake once the customer chooses scope.
-- =============================================================================

alter table public.kael_chat_sessions
  alter column service_type drop not null;

alter table public.kael_chat_sessions
  drop constraint if exists kael_chat_sessions_service_required_for_deal_check;

alter table public.kael_chat_sessions
  add constraint kael_chat_sessions_service_required_for_deal_check
  check (
    service_type is not null
    or status in ('active', 'abandoned', 'unsupported')
  );

create index if not exists kael_chat_sessions_customer_updated_idx
  on public.kael_chat_sessions (customer_id, updated_at desc);

comment on column public.kael_chat_sessions.service_type is
  'Nullable only for pre-intake Kael memory sessions before the customer chooses electrical, plumbing, or cleaning.';
