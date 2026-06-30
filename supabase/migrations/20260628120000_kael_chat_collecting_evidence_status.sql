-- Kael Agentic Chat Gate Flow (2026-06-28):
-- allow a customer Kael chat session to pause before analysis while the app
-- collects optional photo/video/audio evidence.

alter table public.kael_chat_sessions
  drop constraint if exists kael_chat_sessions_status_check;

alter table public.kael_chat_sessions
  add constraint kael_chat_sessions_status_check
  check (status in (
    'active',
    'collecting_evidence',
    'estimate_ready',
    'confirmed',
    'abandoned',
    'unsupported'
  ));
