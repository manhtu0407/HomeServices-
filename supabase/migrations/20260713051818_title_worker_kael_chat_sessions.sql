-- A short, PII-scrubbed title makes a persisted Worker Kael transcript
-- recognizable when the worker returns to the same job. The title is derived
-- from the first worker turn or explicitly renamed through the owned Edge API.

alter table public.kael_worker_chat_sessions
  add column if not exists title text;

alter table public.kael_worker_chat_sessions
  drop constraint if exists kael_worker_chat_sessions_title_length;

alter table public.kael_worker_chat_sessions
  add constraint kael_worker_chat_sessions_title_length
  check (title is null or char_length(btrim(title)) between 1 and 64);
