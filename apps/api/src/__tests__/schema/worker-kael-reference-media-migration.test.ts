import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../../supabase/migrations/20260714080000_worker_kael_reference_media.sql', import.meta.url),
  'utf8',
)

describe('worker Kael reference media migration', () => {
  it('allows only an assigned worker or customer to upload a private Kael reference', () => {
    expect(migration).toContain('Participants upload job media files')
    expect(migration).toMatch(/\(storage\.foldername\(name\)\)\[2\] = 'kael_reference'[\s\S]*private\.is_job_customer[\s\S]*private\.is_job_worker/)
    expect(migration).toContain("(storage.foldername(name))[2] = 'before'")
    expect(migration).not.toMatch(/\(storage\.foldername\(name\)\)\[2\] in \('before', 'kael_reference'\)[\s\S]*private\.is_job_worker/)
  })

  it('keeps the raw-audio and file-extension boundary intact', () => {
    expect(migration).toContain("lower(coalesce(metadata ->> 'mimetype', '')) in ('image/jpeg', 'image/png', 'image/webp')")
    expect(migration).toContain("lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')")
    expect(migration).toMatch(/lower\(storage\.extension\(name\)\) = 'mp4'[\s\S]*private\.is_job_customer/)
    expect(migration).not.toMatch(/'audio\//)
  })
})
