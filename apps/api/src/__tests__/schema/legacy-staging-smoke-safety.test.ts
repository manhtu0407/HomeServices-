import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertStagingOrLocalTargets,
  assertSupabaseCredentials,
  fetchWithTimeout,
} from '../../../../../scripts/lib/staging-smoke-safety.mjs'

const root = resolve(__dirname, '../../../../../')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

const smokeScripts = [
  ['scripts/kael-x1-boundary-smoke.mjs', 'KAEL_X1_RUN_LIVE'],
  ['scripts/kael-x2-idempotency-smoke.mjs', 'KAEL_X2_RUN_LIVE'],
  ['scripts/kael-x4-hydrate-smoke.mjs', 'KAEL_X4_RUN_LIVE'],
] as const

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('legacy staging smoke safety', () => {
  it.each(smokeScripts)('%s requires explicit execution, target validation, and bounded fetch', (path, flag) => {
    const source = read(path)

    expect(source).toContain(flag)
    expect(source).toContain('assertStagingOrLocalTargets')
    expect(source).toContain('fetchWithTimeout')
    expect(source).not.toMatch(/(?<!WithTimeout)\bfetch\(/)
  })

  it('central helper rejects production/cross-origin targets and aborts stalled requests', () => {
    const source = read('scripts/lib/staging-smoke-safety.mjs')

    expect(source).toContain('xyylanuyflrjzbjzhqfl')
    expect(source).toContain('iwevizmsedyqozxlawwl')
    expect(source).toContain('supabase.origin === mobileApi.origin')
    expect(source).toContain('AbortController')
    expect(source).toContain("process.env[runFlag] === 'yes'")
  })

  it('rejects the staging hostname on a non-default HTTPS port', () => {
    process.env.KAEL_TOOLING_TEST_RUN = 'yes'
    try {
      expect(() => assertStagingOrLocalTargets(
        'KAEL_TOOLING_TEST_RUN',
        'https://xyylanuyflrjzbjzhqfl.supabase.co:444',
        'https://xyylanuyflrjzbjzhqfl.supabase.co:444/functions/v1/mobile-api',
      )).toThrow('default HTTPS port')
    } finally {
      delete process.env.KAEL_TOOLING_TEST_RUN
    }
  })

  it('keeps public and server Supabase credentials in their intended slots', () => {
    expect(() => assertSupabaseCredentials(
      'sb_publishable_fixture_key',
      'sb_secret_fixture_key',
    )).not.toThrow()
    expect(() => assertSupabaseCredentials(
      'e30.eyJyb2xlIjoiYW5vbiJ9.signature',
      'e30.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
    )).not.toThrow()
    expect(() => assertSupabaseCredentials(
      'e30.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
      'e30.eyJyb2xlIjoiYW5vbiJ9.signature',
    )).toThrow('publishable key must not contain server authority')
  })

  it('rejects redirects and relays caller cancellation in staging smoke requests', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchWithTimeout('https://xyylanuyflrjzbjzhqfl.supabase.co/rest/v1/jobs', {
      redirect: 'follow',
    })
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ redirect: 'error' }))

    const caller = new AbortController()
    caller.abort(new DOMException('Canceled', 'AbortError'))
    await expect(fetchWithTimeout('https://xyylanuyflrjzbjzhqfl.supabase.co/rest/v1/jobs', {
      signal: caller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('keeps the X1 boundary fixture aligned with the six-service launch scope', () => {
    const source = read('scripts/kael-x1-boundary-smoke.mjs')

    expect(source).not.toContain('AC repair / electrical')
    expect(source).toContain('Unsupported appliance repair / electrical')
  })

  it('does not report X2 job idempotency as passing when every request failed', () => {
    const source = read('scripts/kael-x2-idempotency-smoke.mjs')

    expect(source).toContain('okCount >= 1 && uniqueOkIds.size === 1')
    expect(source).not.toContain('uniqueOkIds.size <= 1')
  })

  it.each([
    'scripts/kael-x1-boundary-smoke.mjs',
    'scripts/kael-x2-idempotency-smoke.mjs',
  ])('%s never leaks auth response bodies and fails when fixture cleanup fails', (path) => {
    const source = read(path)

    expect(source).not.toContain('signIn returned no access_token: ${body}')
    expect(source).not.toContain('signIn failed: ${response.status} ${body}')
    expect(source).toContain('process.env.KEEP_USER === "yes"')
    expect(source).toContain('cleanupFailed = true')
    expect(source).toContain('if (cleanupFailed) allPass = false')
  })

  it('does not report X4 as passing when cleanup fails or serialize auth tokens into errors', () => {
    const source = read('scripts/kael-x4-hydrate-smoke.mjs')

    expect(source).not.toContain('signinText.slice')
    expect(source).not.toContain('signin: ${JSON.stringify(signin)}')
    expect(source).toContain('let cleanupFailed = false')
    expect(source).toContain('cleanupFailed = true')
    expect(source).toContain('if (cleanupFailed) pass = false')
  })
})
