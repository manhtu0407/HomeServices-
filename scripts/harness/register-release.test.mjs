import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHarnessRelease } from './release-bundle.mjs'
import {
  buildReleaseRegistrationSql,
  parseReleaseRegistrationArgs,
  resolveRegistrationOutputPath,
} from './register-release.mjs'

test('builds a complete immutable release-ledger registration statement', () => {
  const release = buildHarnessRelease({
    environment: 'production',
    gitSha: 'd'.repeat(40),
    requireCleanWorktree: false,
    providerReadiness: productionProviderReadiness(),
  })
  const sql = buildReleaseRegistrationSql(release)

  assert.match(sql, /public\.register_harness_release/u)
  assert.match(sql, /decode\('[A-Za-z0-9+/=]+'/u)
  assert.match(sql, /artifact->>'releaseId'/u)
  assert.match(sql, /artifact->'edgeFunctions'/u)
  assert.match(sql, /operator-release-ledger/u)
})

function productionProviderReadiness() {
  return {
    android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
    global_ai_enabled: true, ios_apns: true, perplexity: true,
    push_receipt_reconciler: true, vietmap: true,
  }
}

test('rejects an invalid release artifact and an output path outside the repository', () => {
  const invalidRelease = { environment: 'production' }

  assert.throws(() => buildReleaseRegistrationSql(invalidRelease), /release artifact is invalid/u)
  assert.throws(
    () => resolveRegistrationOutputPath('C:/repo', '../outside.sql'),
    /escapes repository root/u,
  )
})

test('accepts the argument separator forwarded by the package wrapper', () => {
  assert.deepEqual(
    parseReleaseRegistrationArgs(['--', '--release', 'release.json', '--output', '.scratch/registration.sql']),
    { releasePath: 'release.json', outputPath: '.scratch/registration.sql' },
  )
})
