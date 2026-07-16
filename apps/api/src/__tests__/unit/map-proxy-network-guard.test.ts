import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(
  path.resolve(__dirname, '../../../../../supabase/functions/map-proxy-spike/index.ts'),
  'utf8',
)

describe('map proxy upstream network guard', () => {
  it('keeps style and asset bodies inside the shared deadline and byte guard', () => {
    expect(source.match(/fetchBufferedWithTimeout\(/g)).toHaveLength(2)
    expect(source).toContain('signal: request.signal')
    expect(source).toContain('UPSTREAM_UNAVAILABLE')
    expect(source).not.toContain('const { signal, cancel } = withTimeout')
  })

  it('never forwards credentialed upstream error bodies to clients', () => {
    expect(source.match(/return jsonResponse\(\{ error: "UPSTREAM_FAILED" \}, 502\);/g))
      .toHaveLength(2)
    expect(source).not.toContain('status: response.status, headers')
  })

  it('blocks encoded credential material before returning rewritten styles', () => {
    expect(source).toContain('containsCredentialMaterial(payload, apiKey)')
  })
})
