import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../../')
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260714092842_job_media_upload_intents.sql'),
  'utf8',
)

describe('job media upload intent migration', () => {
  it('atomically reserves bounded uploads and closes the direct Storage bypass', () => {
    expect(migration).toContain('create table public.job_media_upload_intents')
    expect(migration).toContain('reserve_job_media_upload')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('PENDING_JOB_MEDIA_QUOTA')
    expect(migration).toContain('JOB_MEDIA_QUOTA')
    expect(migration).toContain('DAILY_JOB_MEDIA_QUOTA')
    expect(migration).toContain('drop policy if exists "Participants upload job media files"')
  })

  it('consumes only an exact Storage object and queues every rejected object for cleanup', () => {
    expect(migration).toContain('consume_job_media_uploads')
    expect(migration).toContain('join storage.objects as object')
    expect(migration).toContain("object.metadata ->> 'mimetype'")
    expect(migration).toContain("object.metadata ->> 'size'")
    expect(migration).toContain("intent.attached_at <= p_now - interval '2 minutes'")
    expect(migration).toContain('revoke_job_media_uploads')
    expect(migration).toContain('fail_job_media_uploads')
    expect(migration).toContain("status = 'cleanup_pending'")
    expect(migration).toMatch(
      /consume_job_media_uploads[\s\S]+delete_after = greatest\(intent\.expires_at, p_now\) \+ interval '5 minutes'/,
    )
    expect(migration).toContain("intent.status in ('reserved', 'attached', 'cleanup_pending')")
    expect(migration).toContain('claim_job_media_cleanup_batch')
    expect(migration).toContain('complete_job_media_cleanup')
    expect(migration).toContain('for update skip locked')
  })

  it('keeps upload-intent tables and RPCs service-role only', () => {
    expect(migration).toContain('alter table public.job_media_upload_intents enable row level security')
    expect(migration).toMatch(
      /revoke all on table public\.job_media_upload_intents[\s\S]+from public, anon, authenticated/,
    )
    expect(migration).toMatch(
      /grant execute on function public\.reserve_job_media_upload[\s\S]+to service_role/,
    )
    expect(migration).toMatch(
      /grant execute on function public\.consume_job_media_uploads[\s\S]+to service_role/,
    )
    expect(migration).toMatch(
      /grant execute on function public\.fail_job_media_uploads[\s\S]+to service_role/,
    )
  })
})
