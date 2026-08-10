import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const helperPath = resolve(__dirname, '../../../../../scripts/lib/staging-target-safety.ps1')
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
const POWERSHELL_TEST_TIMEOUT_MS = 20_000

function validateTargets(
  target: 'staging' | 'production',
  supabaseUrl: string,
  mobileApiUrl: string,
) {
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
  const assertion = target === 'staging'
    ? 'Assert-StagingSupabaseTargets'
    : 'Assert-ProductionSupabaseTargets'
  const command = [
    `. ${quote(helperPath)}`,
    `${assertion} -SupabaseUrl ${quote(supabaseUrl)} -MobileApiUrl ${quote(mobileApiUrl)}`,
  ].join('; ')

  return spawnSync(
    powershell,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { encoding: 'utf8' },
  )
}

function validatePublishableKey(value: string) {
  const quote = (candidate: string) => `'${candidate.replaceAll("'", "''")}'`
  const command = [
    `. ${quote(helperPath)}`,
    `Assert-SupabasePublishableKey -Value ${quote(value)}`,
  ].join('; ')

  return spawnSync(
    powershell,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { encoding: 'utf8' },
  )
}

describe('PowerShell staging target safety', () => {
  it.each([
    'scripts/staging-mobile-api-smoke.ps1',
    'scripts/section32-android-native-recording.ps1',
  ])('%s uses the shared staging exact-target guard', (relativePath) => {
    const source = readFileSync(resolve(__dirname, '../../../../..', relativePath), 'utf8')

    expect(source).toContain('staging-target-safety.ps1')
    expect(source).toContain('Assert-StagingSupabaseTargets')
    expect(source).toContain('Assert-SupabasePublishableKey')
    expect(source).not.toMatch(/\.Contains\(\$stagingRef\)|-notlike\s+"\*\$stagingRef\*"/)
  })

  it('accepts only the canonical staging Supabase root and mobile-api path', () => {
    const result = validateTargets(
      'staging',
      'https://xyylanuyflrjzbjzhqfl.supabase.co',
      'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api',
    )

    expect(result.status, result.stderr).toBe(0)
  }, POWERSHELL_TEST_TIMEOUT_MS)

  it.each([
    [
      'https://xyylanuyflrjzbjzhqfl.supabase.co.attacker.example',
      'https://xyylanuyflrjzbjzhqfl.supabase.co.attacker.example/functions/v1/mobile-api',
    ],
    [
      'https://xyylanuyflrjzbjzhqfl.supabase.co',
      'https://attacker.example/xyylanuyflrjzbjzhqfl/functions/v1/mobile-api',
    ],
    [
      'https://xyylanuyflrjzbjzhqfl.supabase.co',
      'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api?redirect=attacker',
    ],
    [
      'https://xyylanuyflrjzbjzhqfl.supabase.co:444',
      'https://xyylanuyflrjzbjzhqfl.supabase.co:444/functions/v1/mobile-api',
    ],
  ])('rejects a staging-ref substring outside the exact trusted target', (supabaseUrl, apiUrl) => {
    expect(validateTargets('staging', supabaseUrl, apiUrl).status).not.toBe(0)
  }, POWERSHELL_TEST_TIMEOUT_MS)

  it.each([
    'sb_publishable_fixture_key',
    'e30.eyJyb2xlIjoiYW5vbiJ9.signature',
  ])('accepts a Supabase public client key without exposing its value', (value) => {
    expect(validatePublishableKey(value).status).toBe(0)
  }, POWERSHELL_TEST_TIMEOUT_MS)

  it.each([
    'sb_secret_fixture_key',
    'e30.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
  ])('rejects server-authority credentials in a public client key slot', (value) => {
    const result = validatePublishableKey(value)

    expect(result.status).not.toBe(0)
    expect(result.stderr).not.toContain(value)
  }, POWERSHELL_TEST_TIMEOUT_MS)

  it('keeps the authenticated smoke env narrow and verifies the exact six-service contract', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../../..', 'scripts/staging-mobile-api-smoke.ps1'),
      'utf8',
    )

    expect(source).toContain('$allowedEnvNames')
    expect(source).toContain('if ($AllowedNames -notcontains $name)')
    expect(source).toContain('Import-EnvFile -Path $EnvFile -AllowedNames $allowedEnvNames')
    expect(source).toContain("'electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'")
    expect(source).toContain('Compare-Object -ReferenceObject $expectedServiceTypes -DifferenceObject $actualServiceTypes')
    expect(source).not.toContain('Expected at least electrical, plumbing, and cleaning')
  })
})

describe('PowerShell production target safety', () => {
  const sharedPreviewRunnerPath = resolve(__dirname, '../../../../..', 'scripts/run-mobile-web-preview.ps1')
  const sharedPreviewRunner = readFileSync(sharedPreviewRunnerPath, 'utf8')

  it.each([
    ['scripts/run-mobile-web-staging-preview.ps1', 'staging'],
    ['scripts/run-mobile-web-production-preview.ps1', 'production'],
  ] as const)('%s delegates to the shared preview runner for %s', (relativePath, environment) => {
    const source = readFileSync(resolve(__dirname, '../../../../..', relativePath), 'utf8')

    expect(source).toContain('run-mobile-web-preview.ps1')
    expect(source).toContain(`-Environment ${environment}`)
  })

  it('keeps public environment loading and exact target guards in the shared preview runner', () => {
    expect(sharedPreviewRunner).toContain('staging-target-safety.ps1')
    expect(sharedPreviewRunner).toContain('Assert-StagingSupabaseTargets -SupabaseUrl $supabaseUrl -MobileApiUrl $apiBase')
    expect(sharedPreviewRunner).toContain('Assert-ProductionSupabaseTargets -SupabaseUrl $supabaseUrl -MobileApiUrl $apiBase')
    expect(sharedPreviewRunner).toContain("Require-Env 'EXPO_PUBLIC_SUPABASE_URL'")
    expect(sharedPreviewRunner).toContain("Require-Env 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'")
    expect(sharedPreviewRunner).toContain('EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED')
    expect(sharedPreviewRunner).toContain("'false', 'Process'")
    expect(sharedPreviewRunner).not.toMatch(/Write-(Host|Output).*publishableKey/)
    expect(sharedPreviewRunner).not.toMatch(/Write-(Host|Output).*\$value/)
  })

  it('accepts only the canonical Production Supabase root and mobile-api path', () => {
    const result = validateTargets(
      'production',
      'https://iwevizmsedyqozxlawwl.supabase.co',
      'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api',
    )

    expect(result.status, result.stderr).toBe(0)
  }, POWERSHELL_TEST_TIMEOUT_MS)

  it.each([
    [
      'https://iwevizmsedyqozxlawwl.supabase.co.attacker.example',
      'https://iwevizmsedyqozxlawwl.supabase.co.attacker.example/functions/v1/mobile-api',
    ],
    [
      'https://iwevizmsedyqozxlawwl.supabase.co',
      'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api',
    ],
    [
      'https://iwevizmsedyqozxlawwl.supabase.co',
      'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api?redirect=attacker',
    ],
  ])('rejects a non-canonical Production target', (supabaseUrl, apiUrl) => {
    expect(validateTargets('production', supabaseUrl, apiUrl).status).not.toBe(0)
  }, POWERSHELL_TEST_TIMEOUT_MS)
})
