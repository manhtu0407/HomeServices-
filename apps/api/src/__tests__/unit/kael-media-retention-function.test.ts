import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../../')
const edgeSource = readFileSync(
  resolve(root, 'supabase/functions/kael-media-retention/index.ts'),
  'utf8',
)
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260711066000_kael_chat_media_retention_worker.sql'),
  'utf8',
)
const retentionDenoConfigPath = resolve(
  root,
  'supabase/functions/kael-media-retention/deno.json',
)

describe('Kael private-media retention worker', () => {
  it('pins deploy-time dependencies inside the retention function', () => {
    expect(existsSync(retentionDenoConfigPath)).toBe(true)
    const denoConfig = JSON.parse(readFileSync(retentionDenoConfigPath, 'utf8')) as {
      imports?: Record<string, string>
    }
    expect(denoConfig.imports?.['@supabase/supabase-js']).toBe(
      'npm:@supabase/supabase-js@2.105.4',
    )
  })

  it('leases every due uncleaned status and deletes bytes through Storage', () => {
    expect(migration).toContain('where intent.cleaned_at is null')
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain('cleanup_claim_token')
    expect(migration).toContain('cleanup_claimed_at')
    expect(migration).not.toMatch(/where status in \('reserved', 'consumed'\)/)
    expect(edgeSource).toContain('.storage.from(BUCKET).remove([row.object_path])')
    expect(edgeSource).toContain('complete_kael_chat_media_cleanup')
  })

  it('uses dedicated maintenance auth and never exposes object paths in logs', () => {
    expect(edgeSource).toContain('KAEL_MEDIA_RETENTION_SECRET')
    expect(edgeSource).toContain('constantTimeEqual')
    expect(edgeSource).not.toMatch(/console\.(?:log|warn|error)\([^\n]*object_path/)
  })

  it('schedules only after both Vault secrets exist', () => {
    expect(migration).toContain('schedule_kael_chat_media_retention')
    expect(migration).toContain("name = 'project_url'")
    expect(migration).toContain("name = 'kael_media_retention_secret'")
    expect(migration).toContain("'*/15 * * * *'")
    expect(migration).toContain("'/functions/v1/kael-media-retention'")
    expect(migration).toMatch(/if nullif\(btrim\(v_project_url\), ''\) is null[\s\S]*?return false/)
  })

  it('locks and verifies consume against a concurrent cleanup claim', () => {
    expect(migration).toContain('for update of intent')
    expect(migration).toContain('intent.cleanup_claim_token is null')
    expect(migration).toContain('get diagnostics v_updated = row_count')
    expect(migration).toContain("'MEDIA_INTENT_STATE_CHANGED'")
  })
})
