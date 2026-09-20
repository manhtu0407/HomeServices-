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

const ABSENT_CONTROL_TABLE_BODIES = [
  {
    code: 'PGRST205',
    message: "Could not find the table 'public.stage1_release_controls' in the schema cache",
    details: null,
    hint: null,
  },
  { code: '42P01', message: 'relation "public.stage1_release_controls" does not exist' },
]

function failingControlRead(status, body) {
  return createReleaseControlClient({
    ...TARGET,
    fetchImpl: async () => ({
      ok: false,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    }),
  }).selectControl()
}

test('a control read classifies an absent stage1_release_controls table from the exact PostgREST error', async () => {
  for (const body of ABSENT_CONTROL_TABLE_BODIES) {
    await assert.rejects(
      failingControlRead(404, body),
      (error) => error.code === 'RELEASE_CONTROL_TABLE_ABSENT' &&
        error.message === 'hosted release control read failed with HTTP 404',
      JSON.stringify(body),
    )
  }
})

test('a control read never classifies a bare 404, another table, another status, or a permission failure as absent', async () => {
  const unrelated = [
    [404, { message: 'Not Found' }],
    [404, 'not json'],
    [404, { code: 'PGRST205', message: "Could not find the table 'public.harness_releases' in the schema cache" }],
    [404, { code: 'PGRST205', message: "Could not find the table 'public.stage1_release_controls_archive' in the schema cache" }],
    [404, { code: 'PGRST202', message: 'Could not find the public.stage1_release_controls() function in the schema cache' }],
    [401, { code: 'PGRST301', message: 'JWT expired' }],
    [403, { code: '42501', message: 'permission denied for table stage1_release_controls' }],
    [500, ABSENT_CONTROL_TABLE_BODIES[0]],
  ]
  for (const [status, body] of unrelated) {
    await assert.rejects(
      failingControlRead(status, body),
      (error) => error.code === undefined &&
        error.message === `hosted release control read failed with HTTP ${status}`,
      `HTTP ${status} ${JSON.stringify(body)}`,
    )
  }
})
