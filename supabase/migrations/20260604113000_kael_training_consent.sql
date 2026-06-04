-- Kael training consent + training/non-training ledgers.
-- Mobile writes through mobile-api. Privacy default is opt-out.

begin;

create table if not exists public.customer_kael_training_consent (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  allow_training boolean not null default false,
  source text not null default 'profile'
    check (source in ('profile')),
  consent_version text not null default '2026-06-04.v1',
  decided_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_kael_training_consent_updated_idx
  on public.customer_kael_training_consent (updated_at desc);

drop trigger if exists customer_kael_training_consent_updated_at
  on public.customer_kael_training_consent;
create trigger customer_kael_training_consent_updated_at
  before update on public.customer_kael_training_consent
  for each row execute function update_updated_at();

alter table public.customer_kael_training_consent enable row level security;

drop policy if exists "Customer or admin reads Kael training consent"
  on public.customer_kael_training_consent;
create policy "Customer or admin reads Kael training consent"
  on public.customer_kael_training_consent
  for select
  to authenticated
  using (((select auth.uid()) = customer_id) or (select private.is_admin()));

revoke all on public.customer_kael_training_consent from public;
revoke all on public.customer_kael_training_consent from anon;
revoke all on public.customer_kael_training_consent from authenticated;
grant select on public.customer_kael_training_consent to authenticated;
grant all on public.customer_kael_training_consent to service_role;

create table if not exists public.kael_training_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  source text not null
    check (source in ('customer_kael_feedback', 'kael_learning_queue', 'kael_chat', 'job_review', 'worker_completion', 'scope_change')),
  source_id uuid,
  event_type text not null check (char_length(btrim(event_type)) between 3 and 120),
  payload_scrubbed jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload_scrubbed) = 'object'),
  safe_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists kael_training_events_customer_created_idx
  on public.kael_training_events (customer_id, created_at desc)
  where customer_id is not null;

create index if not exists kael_training_events_source_idx
  on public.kael_training_events (source, source_id, created_at desc);

alter table public.kael_training_events enable row level security;

drop policy if exists "Admins read Kael training events"
  on public.kael_training_events;
create policy "Admins read Kael training events"
  on public.kael_training_events
  for select
  to authenticated
  using ((select private.is_admin()));

revoke all on public.kael_training_events from public;
revoke all on public.kael_training_events from anon;
revoke all on public.kael_training_events from authenticated;
grant select on public.kael_training_events to authenticated;
grant all on public.kael_training_events to service_role;

create table if not exists public.kael_training_excluded_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  source text not null
    check (source in ('customer_kael_feedback', 'kael_learning_queue', 'kael_chat', 'job_review', 'worker_completion', 'scope_change')),
  source_id uuid,
  event_type text not null check (char_length(btrim(event_type)) between 3 and 120),
  exclusion_reason text not null default 'customer_opt_out'
    check (exclusion_reason in ('customer_opt_out', 'consent_missing', 'consent_lookup_failed')),
  payload_scrubbed jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload_scrubbed) = 'object'),
  safe_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists kael_training_excluded_customer_created_idx
  on public.kael_training_excluded_events (customer_id, created_at desc)
  where customer_id is not null;

create index if not exists kael_training_excluded_source_idx
  on public.kael_training_excluded_events (source, source_id, created_at desc);

alter table public.kael_training_excluded_events enable row level security;

drop policy if exists "Admins read Kael training excluded events"
  on public.kael_training_excluded_events;
create policy "Admins read Kael training excluded events"
  on public.kael_training_excluded_events
  for select
  to authenticated
  using ((select private.is_admin()));

revoke all on public.kael_training_excluded_events from public;
revoke all on public.kael_training_excluded_events from anon;
revoke all on public.kael_training_excluded_events from authenticated;
grant select on public.kael_training_excluded_events to authenticated;
grant all on public.kael_training_excluded_events to service_role;

comment on table public.customer_kael_training_consent is
  'Customer opt-in/out preference for using collected Kael data in training. Default is opt-out; mobile-api service role owns writes.';

comment on table public.kael_training_events is
  'Shared Kael training ledger for scrubbed customer data only after explicit training consent.';

comment on table public.kael_training_excluded_events is
  'Scrubbed audit ledger for customer data that must not be used for training because consent is missing, declined, or unavailable.';

commit;
