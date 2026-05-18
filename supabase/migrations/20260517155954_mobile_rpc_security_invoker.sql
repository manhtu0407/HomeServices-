-- =============================================================================
-- Migration: mobile_rpc_security_invoker
--
-- The mobile RPCs are invoked only by the Edge/Next server with the Supabase
-- service role key. They do not need SECURITY DEFINER privilege escalation.
-- Keeping them SECURITY INVOKER reduces blast radius while preserving atomic
-- transaction semantics and the service_role-only execute grants.
-- =============================================================================

alter function public.accept_broadcast_atomic(uuid, uuid) security invoker;
alter function public.request_scope_change_atomic(uuid, uuid, text, int, int, text) security invoker;
alter function public.decide_scope_change_atomic(uuid, uuid, text) security invoker;
alter function public.submit_review_atomic(uuid, uuid, int, text[], text) security invoker;
