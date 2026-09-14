import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertLiveApproval,
  assertSupabaseProjectRef,
  assertSupabaseTargets,
  createTimeoutFetch,
  readBoundedInteger,
  resolveTrustedSupabaseCli,
  resolveWorkspacePath,
} from '../../../scripts/lib/privileged-script-safety.mjs'

const repoRoot = resolve(__dirname, '../../../../../')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

afterEach(() => {
  delete process.env.TEST_PRIVILEGED_RUN
  vi.unstubAllGlobals()
})

describe('privileged admin script safety', () => {
  it('accepts only exact Supabase project origins and the mobile-api base path', () => {
    expect(() => assertSupabaseTargets(
      'staging',
      'https://xyylanuyflrjzbjzhqfl.supabase.co',
      'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api',
    )).toThrow('Staging and non-production Supabase targets are locked')
    expect(() => assertSupabaseTargets(
      'production',
      'https://iwevizmsedyqozxlawwl.supabase.co/',
      'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api/',
    )).not.toThrow()

    for (const attackerUrl of [
      'https://attacker.example/iwevizmsedyqozxlawwl',
      'https://iwevizmsedyqozxlawwl.supabase.co.attacker.example',
      'https://iwevizmsedyqozxlawwl.supabase.co@attacker.example',
    ]) {
      expect(() => assertSupabaseTargets(
        'production',
        attackerUrl,
        'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api',
      )).toThrow('exact production Supabase origin')
    }
    expect(() => assertSupabaseTargets(
      'production',
      'https://iwevizmsedyqozxlawwl.supabase.co',
      'https://attacker.example/functions/v1/mobile-api?iwevizmsedyqozxlawwl=1',
    )).toThrow('exact production Supabase origin')
    expect(() => assertSupabaseTargets(
      'production',
      'https://user:secret@iwevizmsedyqozxlawwl.supabase.co',
      'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api',
    )).toThrow('exact production Supabase origin')
    expect(() => assertSupabaseTargets(
      'production',
      'https://iwevizmsedyqozxlawwl.supabase.co',
      'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api?token=secret',
    )).toThrow('exact production Supabase origin')
    expect(() => assertSupabaseTargets(
      'production',
      'https://iwevizmsedyqozxlawwl.supabase.co',
      'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/not-mobile-api',
    )).toThrow('exact mobile-api path')
  })

  it('requires exact approvals, project refs, bounded integers, and workspace paths', () => {
    process.env.TEST_PRIVILEGED_RUN = '1'
    expect(() => assertLiveApproval('TEST_PRIVILEGED_RUN', '1')).not.toThrow()
    expect(() => assertLiveApproval('TEST_PRIVILEGED_RUN', 'I_UNDERSTAND_PRODUCTION_MUTATION')).toThrow(
      'I_UNDERSTAND_PRODUCTION_MUTATION',
    )
    expect(() => assertSupabaseProjectRef('production', 'iwevizmsedyqozxlawwl')).not.toThrow()
    expect(() => assertSupabaseProjectRef('staging', 'xyylanuyflrjzbjzhqfl')).toThrow('Staging and non-production Supabase targets are locked')
    expect(readBoundedInteger('2', 'retries', 0, 2)).toBe(2)
    expect(() => readBoundedInteger('200', 'retries', 0, 2)).toThrow('between 0 and 2')
    expect(resolveWorkspacePath(repoRoot, 'docs/test-logs/report.md', 'report')).toBe(
      resolve(repoRoot, 'docs/test-logs/report.md'),
    )
    expect(() => resolveWorkspacePath(repoRoot, '../outside.md', 'report')).toThrow('inside the repository')
  })

  it('rejects arbitrary executables before forwarding a Supabase access token', () => {
    expect(() => resolveTrustedSupabaseCli(repoRoot, process.execPath)).toThrow('repo-local Supabase binary')

    const binaryName = process.platform === 'win32' ? 'supabase.exe' : 'supabase'
    const installedCli = resolve(repoRoot, 'apps/api/node_modules/supabase/bin', binaryName)
    if (existsSync(installedCli)) {
      expect(resolveTrustedSupabaseCli(repoRoot, installedCli)).toBe(installedCli)
    }
  })

  it('aborts stalled privileged requests', async () => {
    vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })))

    await expect(createTimeoutFetch(5)('https://example.com')).rejects.toThrow(
      'Privileged request timed out after 5ms',
    )
  })

  it('rejects redirects on privileged requests', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await createTimeoutFetch(100)('https://example.com', { redirect: 'follow' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ redirect: 'error' }),
    )
  })

  it('wires all privileged scripts through the shared guards', () => {
    const stagingScripts = [
      'apps/api/scripts/kael-ab-pricesynth.mjs',
      'apps/api/scripts/kael-f26-source-trust-smoke.mjs',
      'apps/api/scripts/kael-p15-staging-e2e.mjs',
      'apps/api/scripts/kael-q1-baseline.mjs',
      'apps/api/scripts/kael-section32-staging-smoke.mjs',
    ]
    for (const path of stagingScripts) {
      const source = read(path)
      expect(source).toContain("assertSupabaseTargets('staging'")
      expect(source).toContain('createTimeoutFetch')
      expect(source).toContain('createEphemeralPassword')
      expect(source).not.toContain('value.includes(STAGING_REF)')
      expect(source).not.toContain('global: { fetch }')
    }

    const production = read('apps/api/scripts/kael-f26-production-smoke.mjs')
    expect(production).toContain("assertSupabaseTargets('production'")
    expect(production).toContain('I_UNDERSTAND_PRODUCTION_MUTATION')
    expect(production).toContain('createTimeoutFetch')
    expect(production).toContain('createEphemeralPassword')
    expect(production).not.toContain('value.includes(PRODUCTION_REF)')
    expect(production).not.toContain('global: { fetch }')

    for (const path of [
      'apps/api/scripts/kael-p15-staging-e2e.mjs',
      'apps/api/scripts/kael-q1-baseline.mjs',
      'apps/api/scripts/kael-section32-staging-smoke.mjs',
    ]) {
      expect(read(path)).toContain('resolveWorkspacePath')
    }

    const p15 = read('apps/api/scripts/kael-p15-staging-e2e.mjs')
    expect(p15).toContain('resolveTrustedSupabaseCli')
    expect(p15).toContain('assertSupabaseProjectRef')
    expect(p15).toContain('timeout: 120_000')
    expect(p15).toContain('cleanupSqlOk && cleanupSqlError === null && authErrors.length === 0 && verified.ok')
    expect(p15).not.toContain('result.stderr || result.stdout')
    expect(p15).not.toContain('rating: 4.8')
    expect(p15).not.toContain('total_jobs: 20 + index')

    const priceSynth = read('apps/api/scripts/kael-ab-pricesynth.mjs')
    expect(priceSynth).toContain('verify persisted A/B cases')
    expect(priceSynth).toContain('A/B dashboard did not expose the completed experiment')
    expect(priceSynth).toContain('assertEvaluation(json, abCase.case_key)')

    const sourceTrust = read('apps/api/scripts/kael-f26-source-trust-smoke.mjs')
    expect(sourceTrust).toContain('jobsWithoutMarketLogs')
    expect(sourceTrust).toContain('missingDistricts')
    expect(sourceTrust).toContain('validateArtifactSince')
    expect(sourceTrust).toContain('artifactIdsBeforeRun')

    const q1 = read('apps/api/scripts/kael-q1-baseline.mjs')
    expect(q1).toContain("readBoundedInteger(readEnv('Q1_SAMPLE_SIZE')")
    expect(q1).toContain("readBoundedInteger(readEnv('Q1_FETCH_RETRIES')")
    expect(q1).toContain('client_request_id: `${this.runId}-job-${index + 1}`')

    const section32 = read('apps/api/scripts/kael-section32-staging-smoke.mjs')
    expect(section32).toContain("harness.results.status !== 'passed'")
  })

  it('documents every privileged input as an empty example value', () => {
    const envExample = read('config/env/workspace.env.example')
    for (const name of [
      'F26_RUN_AB_PRICESYNTH',
      'F26_RUN_SOURCE_TRUST_SMOKE',
      'F26_RUN_PRODUCTION',
      'F26_SUPABASE_URL',
      'F26_API_BASE_URL',
      'F26_SUPABASE_ANON_KEY',
      'F26_SUPABASE_SERVICE_ROLE_KEY',
      'F26_ARTIFACTS_SINCE',
      'P15_RUN_LIVE',
      'P15_SUPABASE_URL',
      'P15_API_BASE_URL',
      'P15_SUPABASE_ANON_KEY',
      'P15_SUPABASE_SERVICE_ROLE_KEY',
      'P15_SUPABASE_CLI',
      'P15_SUPABASE_WORKDIR',
      'P15_REPORT_PATH',
      'Q1_BASELINE_RUN_LIVE',
      'Q1_SUPABASE_URL',
      'Q1_API_BASE_URL',
      'Q1_SUPABASE_ANON_KEY',
      'Q1_SUPABASE_SERVICE_ROLE_KEY',
      'Q1_SAMPLE_SIZE',
      'Q1_BASELINE_REPORT_PATH',
      'Q1_PURPOSE_PROBES',
      'Q1_FETCH_RETRIES',
      'Q1_USE_PHOTOS',
    ]) {
      expect(envExample).toMatch(new RegExp(`^${name}=$`, 'm'))
    }
  })
})
