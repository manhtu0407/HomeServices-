-- =============================================================================
-- Plan.md Section 32 WBF.7 - worker Kael feedback + training consent parity.
-- Writes stay behind the mobile-api service role. Authenticated workers can
-- read their own rows; they do not write tables directly.
-- =============================================================================

create table if not exists public.worker_kael_feedback (
  id               uuid primary key default gen_random_uuid(),
  worker_id        uuid not null references public.profiles(id) on delete cascade,
  source           text not null default 'worker_chat' check (source in ('worker_chat', 'profile')),
  language         text not null default 'vi' check (language in ('vi', 'en')),
  raw_message      text not null check (char_length(raw_message) between 8 and 1200),
  scrubbed_message text not null check (char_length(scrubbed_message) between 1 and 1200),
  status           text not null default 'new' check (status in ('new', 'reviewed', 'archived')),
  safe_metadata    jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.worker_kael_training_consent (
  worker_id         uuid primary key references public.profiles(id) on delete cascade,
  training_consent  boolean not null default false,
  source            text not null default 'worker_chat' check (source in ('worker_chat', 'profile')),
  language          text not null default 'vi' check (language in ('vi', 'en')),
  safe_metadata     jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists worker_kael_feedback_worker_created_idx
  on public.worker_kael_feedback (worker_id, created_at desc);
create index if not exists worker_kael_feedback_status_created_idx
  on public.worker_kael_feedback (status, created_at desc);

alter table public.worker_kael_feedback enable row level security;
alter table public.worker_kael_training_consent enable row level security;

drop trigger if exists worker_kael_feedback_updated_at on public.worker_kael_feedback;
create trigger worker_kael_feedback_updated_at
  before update on public.worker_kael_feedback
  for each row execute function update_updated_at();

drop trigger if exists worker_kael_training_consent_updated_at on public.worker_kael_training_consent;
create trigger worker_kael_training_consent_updated_at
  before update on public.worker_kael_training_consent
  for each row execute function update_updated_at();

drop policy if exists "Workers read own Kael feedback" on public.worker_kael_feedback;
create policy "Workers read own Kael feedback"
  on public.worker_kael_feedback for select
  to authenticated
  using (worker_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Workers read own Kael training consent" on public.worker_kael_training_consent;
create policy "Workers read own Kael training consent"
  on public.worker_kael_training_consent for select
  to authenticated
  using (worker_id = (select auth.uid()) or private.is_admin());

revoke all on public.worker_kael_feedback from public;
revoke all on public.worker_kael_feedback from anon;
revoke all on public.worker_kael_feedback from authenticated;
revoke all on public.worker_kael_training_consent from public;
revoke all on public.worker_kael_training_consent from anon;
revoke all on public.worker_kael_training_consent from authenticated;
grant select on public.worker_kael_feedback to authenticated;
grant select on public.worker_kael_training_consent to authenticated;
grant all on public.worker_kael_feedback to service_role;
grant all on public.worker_kael_training_consent to service_role;

comment on table public.worker_kael_feedback is
  'Worker-submitted feedback for Kael worker advisory UX. Raw and scrubbed copies are stored for controlled review.';
comment on table public.worker_kael_training_consent is
  'Worker-controlled consent flag for using worker Kael advisory feedback in training/review workflows.';
