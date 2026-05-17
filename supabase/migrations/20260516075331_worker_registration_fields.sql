-- =============================================================================
-- Migration: 20260517000000_worker_registration_fields.sql
-- Add B0 worker registration fields per STRUCTURES.md §B0
--
-- Adds:
--   - legal_name      (PII from CCCD — never log full value, used for verification)
--   - date_of_birth   (PII from CCCD)
--   - gender          (optional — text, accepted values: male/female/other/null)
--
-- Safety: all columns nullable to preserve existing rows. Application layer
-- enforces non-null on registration submit (verification_status='submitted').
-- Idempotent via IF NOT EXISTS — safe to re-run.
-- =============================================================================

alter table public.worker_profiles
  add column if not exists legal_name     text,
  add column if not exists date_of_birth  date,
  add column if not exists gender         text;

comment on column public.worker_profiles.legal_name is
  'Legal name from CCCD. PII — never log full value. Required on submission.';

comment on column public.worker_profiles.date_of_birth is
  'Date of birth from CCCD. PII. Required on submission.';

comment on column public.worker_profiles.gender is
  'Optional. Application-level values: male, female, other.';

-- CHECK constraint: when verification_status reaches 'submitted' or further,
-- legal_name and date_of_birth must be present.
alter table public.worker_profiles
  drop constraint if exists worker_profiles_submitted_requires_identity;

alter table public.worker_profiles
  add constraint worker_profiles_submitted_requires_identity
  check (
    verification_status = 'draft'
    or (legal_name is not null and date_of_birth is not null)
  );
