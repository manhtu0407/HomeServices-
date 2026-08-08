-- §50 K1.1/K1.2: structured, idempotent Kael feedback for customer and worker chat.

alter table public.customer_kael_feedback
  add column if not exists response_id text,
  add column if not exists rating text,
  add column if not exists reason_scrubbed text;

alter table public.customer_kael_feedback
  drop constraint if exists customer_kael_feedback_source_check;
alter table public.customer_kael_feedback
  add constraint customer_kael_feedback_source_check
  check (source in ('profile', 'customer_chat'));

alter table public.customer_kael_feedback
  drop constraint if exists customer_kael_feedback_response_id_check;
alter table public.customer_kael_feedback
  add constraint customer_kael_feedback_response_id_check
  check (response_id is null or char_length(btrim(response_id)) between 1 and 128);

alter table public.customer_kael_feedback
  drop constraint if exists customer_kael_feedback_rating_check;
alter table public.customer_kael_feedback
  add constraint customer_kael_feedback_rating_check
  check (rating is null or rating in ('useful', 'not_useful'));

alter table public.customer_kael_feedback
  drop constraint if exists customer_kael_feedback_reason_scrubbed_check;
alter table public.customer_kael_feedback
  add constraint customer_kael_feedback_reason_scrubbed_check
  check (reason_scrubbed is null or char_length(btrim(reason_scrubbed)) between 1 and 500);

alter table public.customer_kael_feedback
  drop constraint if exists customer_kael_feedback_response_rating_pair_check;
alter table public.customer_kael_feedback
  add constraint customer_kael_feedback_response_rating_pair_check
  check ((response_id is null and rating is null) or (response_id is not null and rating is not null));

alter table public.customer_kael_feedback
  drop constraint if exists customer_kael_feedback_customer_response_key;
alter table public.customer_kael_feedback
  add constraint customer_kael_feedback_customer_response_key unique (customer_id, response_id);

alter table public.worker_kael_feedback
  add column if not exists response_id text,
  add column if not exists rating text,
  add column if not exists reason_scrubbed text;

alter table public.worker_kael_feedback
  drop constraint if exists worker_kael_feedback_response_id_check;
alter table public.worker_kael_feedback
  add constraint worker_kael_feedback_response_id_check
  check (response_id is null or char_length(btrim(response_id)) between 1 and 128);

alter table public.worker_kael_feedback
  drop constraint if exists worker_kael_feedback_rating_check;
alter table public.worker_kael_feedback
  add constraint worker_kael_feedback_rating_check
  check (rating is null or rating in ('useful', 'not_useful'));

alter table public.worker_kael_feedback
  drop constraint if exists worker_kael_feedback_reason_scrubbed_check;
alter table public.worker_kael_feedback
  add constraint worker_kael_feedback_reason_scrubbed_check
  check (reason_scrubbed is null or char_length(btrim(reason_scrubbed)) between 1 and 500);

alter table public.worker_kael_feedback
  drop constraint if exists worker_kael_feedback_response_rating_pair_check;
alter table public.worker_kael_feedback
  add constraint worker_kael_feedback_response_rating_pair_check
  check ((response_id is null and rating is null) or (response_id is not null and rating is not null));

alter table public.worker_kael_feedback
  drop constraint if exists worker_kael_feedback_worker_response_key;
alter table public.worker_kael_feedback
  add constraint worker_kael_feedback_worker_response_key unique (worker_id, response_id);

comment on column public.customer_kael_feedback.response_id is
  'Stable Kael response identifier used for idempotent useful/not-useful feedback.';
comment on column public.worker_kael_feedback.response_id is
  'Stable Kael response identifier used for idempotent useful/not-useful feedback.';
