import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { callAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/provider-client'

const repoRoot = path.resolve(__dirname, '../../../../..')
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('Edge fetch guard wiring', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects an oversized provider response before parsing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', {
      headers: { 'content-length': '99999999', 'content-type': 'application/json' },
    })))

    const result = await callAI({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'test' }],
      maxRetries: 0,
    }, { anthropicApiKey: 'test-key' })

    expect(result).toMatchObject({ success: false, code: 'AI_CALL_FAILED' })
  })

  it.each([
    'supabase/functions/mobile-api/_shared/auth.ts',
    'supabase/functions/mobile-api/_shared/services/_runtime/db.ts',
  ])('buffers bounded SDK/provider responses through the shared deadline guard: %s', (file) => {
    const source = read(file)
    expect(source).toContain('fetchBufferedWithTimeout')
  })

  it('bounds Edge AI, batch, push, and vision response reads', () => {
    expect(read('supabase/functions/mobile-api/_shared/kael/provider-client.ts'))
      .toContain('readResponseTextBounded')
    expect(read('supabase/functions/mobile-api/_shared/kael/provider-batch.ts'))
      .toContain('readResponseBytesBounded')
    expect(read('supabase/functions/mobile-api/_shared/push.ts'))
      .toContain('readResponseBytesBounded')
    expect(read('supabase/functions/mobile-api/_shared/kael/vision.ts'))
      .toContain('readResponseBytesBounded')
  })

  it.each([
    'supabase/functions/map-proxy-spike/index.ts',
    'supabase/functions/mobile-api/_shared/push.ts',
    'supabase/functions/mobile-api/_shared/services/places-geo.service.ts',
    'supabase/functions/mobile-api/_shared/services/workers/route.ts',
  ])('strictly decodes bounded JSON responses before provider parsing: %s', (file) => {
    expect(read(file)).toContain('readResponseJsonBounded')
  })

  it('keeps authenticated Supabase responses bounded without rejecting valid job media', () => {
    const authSource = read('supabase/functions/mobile-api/_shared/auth.ts')
    const contractSource = read('supabase/functions/_shared/job-media-contract.ts')

    expect(contractSource).toContain('export const MAX_JOB_MEDIA_BYTES = 26_214_400')
    expect(contractSource).toContain('export const JOB_MEDIA_STORAGE_TIMEOUT_MS = 15_000')
    expect(authSource).toContain('const SUPABASE_MAX_RESPONSE_BYTES = MAX_JOB_MEDIA_BYTES')
    expect(authSource).toContain('const SUPABASE_TIMEOUT_MS = JOB_MEDIA_STORAGE_TIMEOUT_MS')
    expect(authSource).toContain('validateJsonResponses: true')
  })

  it('rejects redirects on every Edge fetch that carries provider credentials or signed URLs', () => {
    expect(read('supabase/functions/mobile-api/_shared/services/_runtime/db.ts'))
      .toContain('redirect: "error"')
    expect(read('supabase/functions/mobile-api/_shared/push.ts'))
      .toContain('redirect: "error"')
    expect(read('supabase/functions/mobile-api/_shared/kael/provider-client.ts'))
      .toContain('redirect: "error"')
    expect(read('supabase/functions/mobile-api/_shared/kael/provider-batch.ts'))
      .toContain('redirect: "error"')
    expect(read('supabase/functions/mobile-api/_shared/kael/vision.ts'))
      .toContain('redirect: "error"')
    expect(read('supabase/functions/mobile-api/_shared/services/kael-chat/media.ts'))
      .toContain('redirect: "error"')
    expect(read('supabase/functions/map-proxy-spike/index.ts').match(/redirect: "error"/g))
      .toHaveLength(2)
  })
})
