-- Plan.md §39 KC7 (voice transcript capture + Supabase store; OQ-2a/2b/2c).
-- Stores ONLY PII-scrubbed transcript text (RULES #9). Audio never leaves the
-- device (§36 D1); speech-to-text is on-device. Per-user RLS; service-role owns
-- writes. Loop-learning proposes regional-lexicon candidates only and never
-- mutates the charter.
--
-- Applied to STAGING (xyylanuyflrjzbjzhqfl) on 2026-07-06; database.types.ts
-- regenerated and matched. PRODUCTION deploy is still gated on Tu (privacy posture)
-- + the §36 P0 on-device STT spike — do not apply to production here.

create table if not exists public.kael_voice_transcript (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.kael_chat_sessions(id) on delete set null,
  actor_role text not null default 'customer' check (actor_role in ('customer', 'worker')),
  source text not null default 'on_device_stt' check (source in ('on_device_stt', 'typed')),
  scrubbed_text text not null,
  region_hint text not null default 'unknown' check (region_hint in ('bac', 'trung', 'nam', 'unknown')),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.kael_voice_transcript enable row level security;

create index if not exists kael_voice_transcript_user_idx
  on public.kael_voice_transcript (user_id, created_at desc);

drop policy if exists "Users view own voice transcript" on public.kael_voice_transcript;
create policy "Users view own voice transcript"
  on public.kael_voice_transcript for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Admins view voice transcript" on public.kael_voice_transcript;
create policy "Admins view voice transcript"
  on public.kael_voice_transcript for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_voice_transcript from public;
revoke all on public.kael_voice_transcript from anon;
revoke all on public.kael_voice_transcript from authenticated;
grant select on public.kael_voice_transcript to authenticated;
grant all on public.kael_voice_transcript to service_role;

comment on table public.kael_voice_transcript is
  'Plan.md 39 KC7 voice transcript store. PII-scrubbed text only (RULES #9); audio never uploaded (36 D1). Service-role writes; users read own rows via RLS.';

-- Loop-learning candidates: sanitized aggregates that PROPOSE regional-lexicon
-- markers for admin review. Candidate-only; never auto-mutates the charter
-- (tunable add-only via review).
create table if not exists public.kael_region_lexicon_candidate (
  id uuid primary key default gen_random_uuid(),
  marker text not null,
  proposed_region text not null check (proposed_region in ('bac', 'trung', 'nam')),
  proposed_tier text not null check (proposed_tier in ('A', 'B', 'C')),
  support_count integer not null default 1 check (support_count > 0),
  status text not null default 'candidate' check (status in ('candidate', 'accepted', 'rejected')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marker, proposed_region, proposed_tier)
);

alter table public.kael_region_lexicon_candidate enable row level security;

drop trigger if exists kael_region_lexicon_candidate_updated_at on public.kael_region_lexicon_candidate;
create trigger kael_region_lexicon_candidate_updated_at
  before update on public.kael_region_lexicon_candidate
  for each row execute function public.update_updated_at();

drop policy if exists "Admins view region lexicon candidate" on public.kael_region_lexicon_candidate;
create policy "Admins view region lexicon candidate"
  on public.kael_region_lexicon_candidate for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_region_lexicon_candidate from public;
revoke all on public.kael_region_lexicon_candidate from anon;
revoke all on public.kael_region_lexicon_candidate from authenticated;
grant select on public.kael_region_lexicon_candidate to authenticated;
grant all on public.kael_region_lexicon_candidate to service_role;

comment on table public.kael_region_lexicon_candidate is
  'Plan.md 39 KC7 loop-learning candidates for regional-lexicon markers. Sanitized aggregates only; candidate-only, never auto-mutates the charter.';
