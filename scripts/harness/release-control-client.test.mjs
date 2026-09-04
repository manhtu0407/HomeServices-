import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createReleaseControlClient,
  releaseRegistrationArgs,
} from './release-control-client.mjs'

const TARGET = {
  environment: 'production',
  projectRef: 'iwevizmsedyqozxlawwl',
  projectUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
  serviceRoleKey: 'service-role-test-only',
}

test('release registration binds the complete immutable artifact without exposing credentials', () => {
  const release = {
    releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    environment: 'production',
    gitSha: 'a'.repeat(40),
    manifestSha256: '1'.repeat(64),
    migrationInventorySha256: '2'.repeat(64),
    databaseTypesSha256: '3'.repeat(64),
    promptBundleSha256: '4'.repeat(64),
    policyBundleSha256: '5'.repeat(64),
    runtimeConfigurationSha256: '6'.repeat(64),
    evaluationSuiteVersion: '1.0.0',
    evaluationSuiteSha256: '7'.repeat(64),
    capabilityRegistrySha256: '8'.repeat(64),
    accessMatrixSha256: '9'.repeat(64),
    reliabilityPolicySha256: 'a'.repeat(64),
    promotionPolicySha256: 'b'.repeat(64),
    bundleSha256: 'c'.repeat(64),
    edgeFunctions: { 'mobile-api': 'd'.repeat(64) },
  }
  const args = releaseRegistrationArgs(release, null)
  assert.equal(args.p_release_id, release.releaseId)
  assert.deepEqual(args.p_release_artifact, release)
  assert.equal(JSON.stringify(args).includes(TARGET.serviceRoleKey), false)
})

test('hosted control uses exact target and service-role RPC without logging response bodies', async () => {
  const requests = []
  const client = createReleaseControlClient({
    ...TARGET,
    fetchImpl: async (url, init) => {
      requests.push({ url, init })
      return { ok: true, status: 200, text: async () => '{"ok":true}' }
    },
  })
  await client.rpc('cleanup_synthetic_matching_cohort', { p_cohort_id: 'synthetic-stage1-test' })
  assert.equal(requests[0].url, `${TARGET.projectUrl}/rest/v1/rpc/cleanup_synthetic_matching_cohort`)
  assert.equal(requests[0].init.headers.authorization, `Bearer ${TARGET.serviceRoleKey}`)

  const failing = createReleaseControlClient({
    ...TARGET,
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      text: async () => '{"message":"password=do-not-echo"}',
    }),
  })
  await assert.rejects(
    failing.rpc('safe_function', {}),
    (error) => error.message === 'hosted RPC safe_function failed with HTTP 500',
  )
})

test('hosted control refuses a production/staging target mix', () => {
  assert.throws(() => createReleaseControlClient({
    ...TARGET,
    projectRef: 'xyylanuyflrjzbjzhqfl',
  }), /registered release target/u)
})

test('hosted release artifact read is exact, single-row, and service-role scoped', async () => {
  const requests = []
  const artifact = { releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb' }
  const client = createReleaseControlClient({
    ...TARGET,
    fetchImpl: async (url, init) => {
      requests.push({ url, init })
      return { ok: true, status: 200, text: async () => JSON.stringify([{ release_artifact: artifact }]) }
    },
  })

  assert.deepEqual(await client.selectRelease(artifact.releaseId), artifact)
  assert.match(requests[0].url, /harness_releases\?select=release_artifact/u)
  assert.match(requests[0].url, new RegExp(`release_id=eq\.${artifact.releaseId}`, 'u'))
  assert.equal(requests[0].init.headers.authorization, `Bearer ${TARGET.serviceRoleKey}`)
  await assert.rejects(() => client.selectRelease('unreleased'), /ID is invalid/u)
})
