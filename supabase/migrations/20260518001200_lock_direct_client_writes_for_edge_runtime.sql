-- =============================================================================
-- Migration: lock_direct_client_writes_for_edge_runtime
-- Production mobile runtime writes workflow state through Supabase Edge
-- mobile-api using service-role-only RPCs. Direct authenticated inserts for
-- reviews/chat can bypass atomic review status updates or unlock placeholder
-- chat behavior, so keep them server-owned until those domains are explicitly
-- implemented.
-- =============================================================================

drop policy if exists "Customers create reviews after confirmation" on public.reviews;
drop policy if exists "Participants send messages" on public.chat_messages;

revoke insert on public.reviews from authenticated;
revoke insert on public.chat_messages from authenticated;
