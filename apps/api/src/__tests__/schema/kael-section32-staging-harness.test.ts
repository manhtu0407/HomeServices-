import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../../')
const harnessPath = resolve(repoRoot, 'apps/api/scripts/kael-section32-staging-smoke.mjs')
const nativeRecordingPath = resolve(repoRoot, 'scripts/section32-android-native-recording.ps1')
const rootEnvExamplePath = resolve(repoRoot, 'config/env/workspace.env.example')
const mobileEnvExamplePath = resolve(repoRoot, 'apps/mobile/.env.example')

describe('Section 32 staging smoke harness contract', () => {
  it('keeps the harness staging-only and explicit-live only', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).toContain('SECTION32_RUN_LIVE')
    expect(source).toContain('xyylanuyflrjzbjzhqfl')
    expect(source).toContain("assertSupabaseTargets('staging', supabaseUrl, apiBaseUrl)")
    expect(source).toContain('createTimeoutFetch')
    expect(source).not.toContain('value.includes(STAGING_REF)')
    expect(source).toContain('SECTION32_REQUIRE_PROVIDER')
  })

  it('proves the Section 32 worker Kael follow-up instead of a generic service ping', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).toContain('worker_chat_job_scoped_idempotency')
    expect(source).toContain('worker_chat_turn_job_id')
    expect(source).toContain('worker_chat_ai_model_column')
    expect(source).toContain('worker_chat_sse_result')
    expect(source).toContain('idempotencyRequestId')
    expect(source).toContain('firstSession.id !== secondSession.id')
    expect(source).toContain('/workers/me/kael/chat')
    expect(source).toContain('/workers/me/kael/chat/${sessionId}/stream')
    expect(source).toContain("select('id, session_id, job_id, turn_index, role, content_type, ai_provider, ai_model, cost_usd, safe_metadata')")
  })

  it('requires cleanup and a durable report before it can be used as G1 evidence', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).toContain('cleanup ok=true')
    expect(source).toContain('cleanup residue_total=0')
    expect(source).toContain('SECTION32_REPORT_PATH')
    expect(source).toContain('docs/test-logs/2026-06-05_kael-section32-staging-smoke.md')
    expect(source).toContain("Status: ${this.results.status}")
    expect(source).toContain('kael_worker_chat_sessions')
    expect(source).toContain('kael_worker_chat_turns')
    expect(source).toContain('kael_worker_chat_rate_limit_log')
    expect(source).toContain('kael_guardrail_trip_audit')
    expect(source).toContain('verifyCleanupResidue')
    expect(source).toContain('cleanup residue remained')
    expect(source).toContain('residue_total')
    expect(source).toContain('kael_guardrail_trip_audit_by_session_metadata')
    expect(source).toContain('kael_admin_queue')
    expect(source).toContain('worker_kael_memory')
    expect(source).toContain('auth.admin.deleteUser')
  })

  it('does not seed fake worker trust metrics into staging fixtures', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).not.toContain('rating: 4.8')
    expect(source).not.toContain('total_jobs: 32')
  })
})

describe('Section 32 Android native recording harness contract', () => {
  it('keeps native recording staging-only and explicit-live only', () => {
    const source = readFileSync(nativeRecordingPath, 'utf8')

    expect(source).toContain('SECTION32_NATIVE_RUN')
    expect(source).toContain('xyylanuyflrjzbjzhqfl')
    expect(source).toContain('lib\\staging-target-safety.ps1')
    expect(source).toContain(
      'Assert-StagingSupabaseTargets -SupabaseUrl $supabaseUrl -MobileApiUrl $apiBase',
    )
    expect(source).toContain('$env:EXPO_NO_DOTENV = \'1\'')
    expect(source).toContain('$env:EXPO_PUBLIC_SUPABASE_URL = $supabaseUrl')
    expect(source).toContain('$env:EXPO_PUBLIC_API_BASE_URL = $apiBase')
    expect(source).toContain('SECTION32_NATIVE_CUSTOMER_EMAIL')
    expect(source).toContain('SECTION32_NATIVE_CUSTOMER_PASSWORD')
    expect(source).toContain('SECTION32_NATIVE_WORKER_EMAIL')
    expect(source).toContain('SECTION32_NATIVE_WORKER_PASSWORD')
    expect(source).toContain('$allowedEnvNames')
    expect(source).toContain('if ($AllowedNames -notcontains $name)')
    expect(source).toContain('Import-EnvFile -Path $EnvFile -AllowedNames $allowedEnvNames')
    expect(source).toContain('$credentialEnvNames')
    expect(source).toContain("[Environment]::SetEnvironmentVariable($name, $null, 'Process')")
  })

  it('captures real Android device evidence instead of web/pre-auth proof', () => {
    const source = readFileSync(nativeRecordingPath, 'utf8')

    expect(source).toContain('expo\\bin\\cli')
    expect(source).toContain("'--android'")
    expect(source).toContain('screenrecord')
    expect(source).toContain('screencap')
    expect(source).toContain('recorded_unreviewed')
    expect(source).toContain('G3 is not complete until a reviewer annotates the checklist')
  })

  it('fails closed when the Android capture toolchain cannot produce real evidence', () => {
    const source = readFileSync(nativeRecordingPath, 'utf8')

    expect(source).toContain('[ValidateRange(1, 65535)]')
    expect(source).toContain('[ValidateRange(1, 180)]')
    expect(source).toContain('[int]$DurationSeconds = 180')
    expect(source).toContain('$adbExitCode = $LASTEXITCODE')
    expect(source).toContain('adb command failed with exit code')
    expect(source).toContain('$resolvedAndroidSdk = Split-Path -Parent (Split-Path -Parent $adbPath)')
    expect(source).toContain('$env:ANDROID_HOME = $resolvedAndroidSdk')
    expect(source).toContain('Quote-NativeArgument -Value $expoCli')
    expect(source).toContain('Assert-ExpoProcessHealthy -Process $expoProcess')
    expect(source).toContain('Assert-NonEmptyFile -Path $localVideo')
    expect(source).toContain('Assert-NonEmptyFile -Path $localScreenshot')
  })

  it('requires the Section 32 scenes and accessibility modes in the checklist', () => {
    const source = readFileSync(nativeRecordingPath, 'utf8')

    expect(source).toContain('Customer authenticated flow')
    expect(source).toContain('Worker authenticated flow')
    expect(source).toContain('Scope-change progress')
    expect(source).toContain('Section 32.6 anti-disintermediation')
    expect(source).toContain('Section 32.7 apartment access')
    expect(source).toContain('light, dark, Reduce Motion, and Reduce Transparency')
    expect(source).toContain('Language honesty')
  })
})

describe('Section 32 harness env documentation contract', () => {
  it('documents staging smoke env names without committing values', () => {
    const source = readFileSync(rootEnvExamplePath, 'utf8')

    for (const name of [
      'SECTION32_RUN_LIVE',
      'SECTION32_SUPABASE_URL',
      'SECTION32_API_BASE_URL',
      'SECTION32_SUPABASE_ANON_KEY',
      'SECTION32_SUPABASE_SERVICE_ROLE_KEY',
      'SECTION32_REPORT_PATH',
      'SECTION32_REQUIRE_PROVIDER',
    ]) {
      expect(source).toContain(`${name}=`)
    }
  })

  it('documents native recording env names without committing values', () => {
    const source = readFileSync(mobileEnvExamplePath, 'utf8')

    for (const name of [
      'SECTION32_NATIVE_RUN',
      'SECTION32_NATIVE_CUSTOMER_EMAIL',
      'SECTION32_NATIVE_CUSTOMER_PASSWORD',
      'SECTION32_NATIVE_WORKER_EMAIL',
      'SECTION32_NATIVE_WORKER_PASSWORD',
      'SECTION32_NODE_PATH',
    ]) {
      expect(source).toContain(`${name}=`)
    }
  })
})
