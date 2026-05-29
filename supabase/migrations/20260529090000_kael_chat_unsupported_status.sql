-- =============================================================================
-- X1 (Plan.md §27.4 2026-05-29): extend kael_chat_sessions.status to allow
-- 'unsupported' so Kael can permanently end a session when a message hits the
-- boundary guard (out-of-scope service, prompt injection, or service-type
-- mismatch).
--
-- Closes F-18 (AC repair → estimate), F-19 (recipe → estimate), F-20 (prompt
-- injection → estimate), F-21 (service-type vs message mismatch → estimate).
-- =============================================================================

alter table public.kael_chat_sessions
  drop constraint if exists kael_chat_sessions_status_check;

alter table public.kael_chat_sessions
  add constraint kael_chat_sessions_status_check
  check (status in (
    'active',
    'estimate_ready',
    'confirmed',
    'abandoned',
    'unsupported'
  ));
