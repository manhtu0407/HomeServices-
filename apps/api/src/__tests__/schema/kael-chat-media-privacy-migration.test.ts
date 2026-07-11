import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260711061000_kael_chat_media_privacy.sql'),
  'utf8',
)
const intentMigration = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260711063000_kael_chat_media_upload_intents.sql'),
  'utf8',
)
const jobMediaGuardMigration = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260711065000_job_media_analysis_audio_guard.sql'),
  'utf8',
)

describe('Kael chat media privacy migration', () => {
  it('blocks raw audio at the private Storage bucket boundary', () => {
    expect(migration).toContain("where id = 'kael-chat-media'")
    expect(migration).toContain("'video/mp4'")
    expect(migration).not.toMatch(/'audio\//)
  })

  it('requires a durable server-only intent and closes direct authenticated uploads', () => {
    expect(intentMigration).toContain('create table if not exists public.kael_chat_media_upload_intents')
    expect(intentMigration).toContain('reserve_kael_chat_media_upload')
    expect(intentMigration).toContain('consume_kael_chat_media_uploads')
    expect(intentMigration).toContain('revoke_kael_chat_media_uploads')
    expect(intentMigration).toContain("join storage.objects as object")
    expect(intentMigration).toContain('pg_advisory_xact_lock')
    expect(intentMigration).toContain('PENDING_MEDIA_QUOTA')
    expect(intentMigration).toContain('DAILY_MEDIA_QUOTA')
    expect(intentMigration).toContain('drop policy if exists "Users upload own kael chat media"')
    expect(intentMigration).toContain('revoke all on table public.kael_chat_media_upload_intents')
    expect(intentMigration).toMatch(/grant execute on function public\.reserve_kael_chat_media_upload[\s\S]+to service_role/)
    expect(intentMigration).toContain("delete_after = greatest(expires_at, p_now) + interval '5 minutes'")
    expect(intentMigration).not.toMatch(/grant execute[\s\S]+to authenticated/)
  })

  it('blocks raw audio at the direct job-media Storage boundary for Kael analysis stages', () => {
    expect(jobMediaGuardMigration).toContain('Participants upload job media files')
    expect(jobMediaGuardMigration).toContain("('before', 'kael_reference')")
    expect(jobMediaGuardMigration).toContain("'scope_change_evidence', 'access_check_in'")
    expect(jobMediaGuardMigration).toContain("metadata ->> 'mimetype'")
    expect(jobMediaGuardMigration).toContain('storage.extension(name)')
    expect(jobMediaGuardMigration).toContain("where id = 'job-media'")
    expect(jobMediaGuardMigration).not.toMatch(/'audio\//)
    expect(jobMediaGuardMigration).not.toContain("'video/quicktime'")
    expect(jobMediaGuardMigration).not.toContain("'video/webm'")
  })
})
