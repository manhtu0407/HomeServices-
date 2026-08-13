import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../../')
const edgeSource = readFileSync(
  resolve(root, 'supabase/functions/kael-media-retention/index.ts'),
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
    expect(edgeSource).toContain('.storage.from(BUCKET).remove([row.object_path])')
    expect(edgeSource).toContain('complete_kael_chat_media_cleanup')
  })

  it('drains abandoned job-media upload intents through the same durable worker', () => {
    expect(edgeSource).toContain('claim_job_media_cleanup_batch')
    expect(edgeSource).toContain('complete_job_media_cleanup')
    expect(edgeSource).toContain('job-media')
    expect(edgeSource).toContain('Promise.all(CLEANUP_PLANS.map')
  })

  it('uses dedicated maintenance auth and never exposes object paths in logs', () => {
    expect(edgeSource).toContain('KAEL_MEDIA_RETENTION_SECRET')
    expect(edgeSource).toContain('constantTimeEqual')
    expect(edgeSource).not.toMatch(/console\.(?:log|warn|error)\([^\n]*object_path/)
  })

  it('accepts only an object of non-empty service keys from the encoded secret', () => {
    expect(edgeSource).toContain('isNonEmptyStringRecord(parsed)')
    expect(edgeSource).toContain('Array.isArray(value)')
  })

  it('bounds and validates maintenance request JSON before running cleanup', () => {
    expect(edgeSource).toContain('INVALID_JSON')
    expect(edgeSource).toContain('readJsonRequestBounded(request, MAX_JSON_BODY_BYTES)')
    expect(edgeSource).toContain('error instanceof RequestJsonError')
    expect(edgeSource).toContain('parseCleanupLimit(parsedBody, MAX_BATCH, 50)')
    expect(edgeSource).not.toContain('request.json()')
    expect(edgeSource).not.toContain('request.json().catch(() => ({}))')
  })

  it('uses an abortable bounded Supabase transport for RPC and Storage calls', () => {
    expect(edgeSource).toContain('global: { fetch: retentionFetch }')
    expect(edgeSource).toContain('fetchBufferedWithTimeout')
    expect(edgeSource).toContain('redirect: "error"')
    expect(edgeSource).toContain('SUPABASE_MAX_RESPONSE_BYTES')
    expect(edgeSource).toContain('validateJsonResponses: true')
  })

  it('fails closed on malformed claim and Storage removal responses', () => {
    expect(edgeSource).toContain('parseCleanupRows(claimed.data, plan.bucket, limit)')
    expect(edgeSource).toContain('isStorageRemoveSuccess(removed)')
    expect(edgeSource).toContain('parseCompletedCount(finalized.data, successfulIds.length)')
    expect(edgeSource).not.toContain('normalizeRows')
  })

})
