import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const helperPath = resolve(__dirname, '../../../../../scripts/lib/staging-target-safety.ps1')
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'

function validateTargets(supabaseUrl: string, mobileApiUrl: string) {
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
  const command = [
    `. ${quote(helperPath)}`,
    `Assert-StagingSupabaseTargets -SupabaseUrl ${quote(supabaseUrl)} -MobileApiUrl ${quote(mobileApiUrl)}`,
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
    'scripts/run-mobile-web-staging-preview.ps1',
    'scripts/staging-mobile-api-smoke.ps1',
    'scripts/section32-android-native-recording.ps1',
  ])('%s uses the shared exact-target guard', (relativePath) => {
    const source = readFileSync(resolve(__dirname, '../../../../..', relativePath), 'utf8')

    expect(source).toContain('staging-target-safety.ps1')
    expect(source).toContain('Assert-StagingSupabaseTargets')
    expect(source).toContain('Assert-SupabasePublishableKey')
    expect(source).not.toMatch(/\.Contains\(\$stagingRef\)|-notlike\s+"\*\$stagingRef\*"/)
  })

  it('accepts only the canonical staging Supabase root and mobile-api path', () => {
    const result = validateTargets(
      'https://xyylanuyflrjzbjzhqfl.supabase.co',
      'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api',
    )

    expect(result.status, result.stderr).toBe(0)
  })

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
    expect(validateTargets(supabaseUrl, apiUrl).status).not.toBe(0)
  })

  it.each([
    'sb_publishable_fixture_key',
    'e30.eyJyb2xlIjoiYW5vbiJ9.signature',
  ])('accepts a Supabase public client key without exposing its value', (value) => {
    expect(validatePublishableKey(value).status).toBe(0)
  })

  it.each([
    'sb_secret_fixture_key',
    'e30.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
  ])('rejects server-authority credentials in a public client key slot', (value) => {
    const result = validatePublishableKey(value)

    expect(result.status).not.toBe(0)
    expect(result.stderr).not.toContain(value)
  })

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
