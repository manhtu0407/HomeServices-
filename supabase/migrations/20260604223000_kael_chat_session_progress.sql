-- Plan §32 P1: session-scoped Kael progress for perceived-performance.
-- The customer chat table already has owner/admin SELECT RLS and service-role
-- writes; this migration adds only a safe telemetry payload column.

begin;

alter table public.kael_chat_sessions
  add column if not exists kael_progress jsonb;

alter table public.kael_chat_sessions
  drop constraint if exists kael_chat_sessions_kael_progress_is_object;

alter table public.kael_chat_sessions
  add constraint kael_chat_sessions_kael_progress_is_object
  check (kael_progress is null or jsonb_typeof(kael_progress) = 'object')
  not valid;

alter table public.kael_chat_sessions
  validate constraint kael_chat_sessions_kael_progress_is_object;

comment on column public.kael_chat_sessions.kael_progress is
  'Plan §32 safe stage telemetry for Kael chat perceived performance. Contains stage/status/progress/failure metadata only; no raw user text, provider names, or PII.';

commit;
