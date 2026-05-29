-- =============================================================================
-- X2 (Plan.md §27.5 2026-05-29): idempotency keys for customer-initiated job
-- and Kael chat session creation. Closes F-04 (dup jobs/sessions when client
-- spams parallel POST). Mobile generates a UUID v4 per submit; Edge stores
-- it on the new row and the partial unique index rejects races.
--
-- The columns are NULL-able so historical rows (created before this migration)
-- remain valid. Mobile clients should ALWAYS send a UUID on new submits going
-- forward; once the rollout is verified, a future migration can enforce
-- NOT NULL.
-- =============================================================================

alter table public.jobs
  add column if not exists client_request_id uuid;

create unique index if not exists jobs_customer_idempotency_idx
  on public.jobs (customer_id, client_request_id)
  where client_request_id is not null;

alter table public.kael_chat_sessions
  add column if not exists client_request_id uuid;

create unique index if not exists kael_chat_sessions_customer_idempotency_idx
  on public.kael_chat_sessions (customer_id, client_request_id)
  where client_request_id is not null;
