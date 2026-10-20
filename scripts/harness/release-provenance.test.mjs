import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  HOSTED_EVIDENCE_SOURCE,
  buildProvenanceMatrix,
  classifyParity,
  collectLocalInputs,
  renderProvenanceMarkdown,
} from './release-provenance.mjs'

const providerReadiness = Object.freeze({
  android_fcm_v1: true,
  anthropic: true,
  deepseek: false,
  durable_guards: true,
  global_ai_enabled: true,
  ios_apns: true,
  perplexity: true,
  push_receipt_reconciler: true,
  vietmap: true,
})
const stagingProjectRef = 'xyylanuyflrjzbjzhqfl'
const mobileFunctionId = '10000000-0000-4000-8000-000000000057'
const maintainerFunctionId = '10000000-0000-4000-8000-000000000058'

const release = {
  releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
  environment: 'staging',
  gitSha: 'c'.repeat(40),
  manifestSha256: 'a'.repeat(64),
  bundleSha256: 'b'.repeat(64),
  migrationInventorySha256: 'd'.repeat(64),
  sourceBundleSha256: '1'.repeat(64),
  mobileBuildFingerprintSha256: '2'.repeat(64),
  productionUiSourceSha256: '6'.repeat(64),
  edgeBundleSha256: '3'.repeat(64),
  serviceIntakePolicyBundleSha256: '4'.repeat(64),
  priceEvidenceBundleSha256: '5'.repeat(64),
  providerReadiness,
  providerReadinessFingerprintSha256: createHash('sha256').update(JSON.stringify(providerReadiness)).digest('hex'),
  edgeFunctions: { 'kael-matching-maintainer': 'f'.repeat(64), 'mobile-api': 'e'.repeat(64) },
  edgeRuntimeConfigurations: {
    'kael-matching-maintainer': {
      verifyJwt: false,
      importMap: true,
      entrypointPath: 'supabase/functions/kael-matching-maintainer/index.ts',
      importMapPath: 'supabase/functions/kael-matching-maintainer/deno.json',
    },
    'mobile-api': {
      verifyJwt: false,
      importMap: true,
      entrypointPath: 'supabase/functions/mobile-api/index.ts',
      importMapPath: 'supabase/functions/mobile-api/deno.json',
    },
  },
}
const inventory = {
  migrationEquivalences: { version: '1.0.0', groups: [] },
  entries: [{ version: '20260101000000' }, { version: '20260102000000' }],
}

function hostedRemote(overrides = {}) {
  return {
    evidenceSource: HOSTED_EVIDENCE_SOURCE,
    environment: 'staging',
    projectRef: stagingProjectRef,
    releaseId: release.releaseId,
    releaseLane: null,
    deploymentId: `${stagingProjectRef}_${mobileFunctionId}_7`,
    gitSha: release.gitSha,
    manifestSha256: release.manifestSha256,
    bundleSha256: release.bundleSha256,
    migrationInventorySha256: release.migrationInventorySha256,
    sourceBundleSha256: release.sourceBundleSha256,
    mobileBuildFingerprintSha256: release.mobileBuildFingerprintSha256,
    productionUiSourceSha256: release.productionUiSourceSha256,
    edgeBundleSha256: release.edgeBundleSha256,
    serviceIntakePolicyBundleSha256: release.serviceIntakePolicyBundleSha256,
    priceEvidenceBundleSha256: release.priceEvidenceBundleSha256,
    providerReadinessFingerprintSha256: release.providerReadinessFingerprintSha256,
    providerReadiness: release.providerReadiness,
    clientCompatibility: { ios: { minimumBuildNumber: 56 }, android: { minimumBuildNumber: 5 } },
    migrations: inventory.entries,
    managedEdgeFunctions: {
      'mobile-api': {
        id: mobileFunctionId, status: 'ACTIVE', version: 7, ezbr_sha256: '7'.repeat(64),
        verify_jwt: false, import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json',
      },
      'kael-matching-maintainer': {
        id: maintainerFunctionId, status: 'ACTIVE', version: 3, ezbr_sha256: '8'.repeat(64),
        verify_jwt: false, import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json',
      },
    },
    ...overrides,
  }
}

const local = {
  headSha: 'c'.repeat(40),
  worktreeDirty: false,
  originMainSha: 'c'.repeat(40),
  sourceChange: { sha: 'c'.repeat(40), paths: ['supabase/functions/mobile-api/index.ts'] },
  ci: null,
}
const mobilePolicy = { appVersion: '0.3.2', platforms: { ios: { buildNumber: 56 }, android: { buildNumber: 5 } } }

function matrix(remote) {
  return buildProvenanceMatrix({ local, expectedRelease: release, inventory, mobilePolicy, remote })
}
function row(result, component) {
  return result.rows.find((candidate) => candidate.component === component)
}

test('without hosted evidence parity is UNVERIFIED and no deployed value is invented', () => {
  const result = matrix(null)
  assert.equal(result.parity.state, 'UNVERIFIED')
  assert.match(result.parity.reasons.join(' '), /no hosted deployment snapshot/u)
  for (const component of [
    'edge_release_id_deployed', 'edge_deployment_id', 'edge_mobile_api_version',
    'edge_bundle_sha256_deployed', 'runtime_flags_provider_route', 'edge_enforced_minimum_client', 'mobile_binary_in_field',
  ]) {
    assert.equal(row(result, component).status, 'UNKNOWN', component)
    assert.equal(row(result, component).value, null, component)
  }
})

test('an identical GitHub main ref never upgrades parity', () => {
  const result = matrix(null)
  assert.equal(row(result, 'github_main_ref').status, 'VERIFIED')
  assert.equal(row(result, 'github_main_ref').value, local.headSha)
  assert.match(row(result, 'github_main_ref').note, /not evidence of what is deployed/u)
  assert.notEqual(result.parity.state, 'VERIFIED_MATCH')
})

test('a snapshot that merely looks like a match is UNVERIFIED unless the hosted collector produced it', () => {
  const handWritten = hostedRemote({ evidenceSource: undefined })
  const result = matrix(handWritten)
  assert.equal(result.parity.state, 'UNVERIFIED')
  assert.match(result.parity.reasons.join(' '), /not collected by collectHostedDeploymentState/u)
  assert.equal(row(result, 'edge_release_id_deployed').status, 'UNKNOWN')
})

test('a hosted snapshot with no release identity is UNVERIFIED, not drift', () => {
  const result = matrix(hostedRemote({ releaseId: null, deploymentId: null, gitSha: null }))
  assert.equal(result.parity.state, 'UNVERIFIED')
  assert.match(result.parity.reasons.join(' '), /no release or deployment identity/u)
})

test('an exact hosted snapshot is VERIFIED_MATCH and fills the deployed rows with their source', () => {
  const result = matrix(hostedRemote())
  assert.deepEqual(result.parity, { state: 'VERIFIED_MATCH', reasons: [], problems: [] })
  assert.equal(row(result, 'edge_release_id_deployed').value, release.releaseId)
  assert.equal(row(result, 'edge_mobile_api_version').value, '7')
  assert.match(row(result, 'edge_release_id_deployed').source, new RegExp(HOSTED_EVIDENCE_SOURCE, 'u'))
  assert.match(row(result, 'runtime_flags_provider_route').value, /anthropic=true/u)
  assert.doesNotMatch(row(result, 'runtime_flags_provider_route').value, /sk-|key|secret/iu)
  assert.equal(row(result, 'mobile_binary_in_field').status, 'UNKNOWN')
})

test('a hosted snapshot on another release is VERIFIED_DRIFT and names the mismatch', () => {
  const result = matrix(hostedRemote({
    releaseId: 'harness-dddddddddddd-eeeeeeeeeeee',
    gitSha: '9'.repeat(40),
    edgeBundleSha256: '0'.repeat(64),
  }))
  assert.equal(result.parity.state, 'VERIFIED_DRIFT')
  assert.ok(result.parity.problems.some((problem) => problem.includes('release ID mismatch')))
  assert.ok(result.parity.problems.some((problem) => problem.includes('Git SHA mismatch')))
  assert.ok(result.parity.problems.some((problem) => problem.includes('Edge bundle digest mismatch')))
  assert.equal(row(result, 'edge_release_id_deployed').value, 'harness-dddddddddddd-eeeeeeeeeeee')
})

test('missing migrations are drift even when the release identity matches', () => {
  const result = matrix(hostedRemote({ migrations: [{ version: '20260101000000' }] }))
  assert.equal(result.parity.state, 'VERIFIED_DRIFT')
  assert.ok(result.parity.problems.some((problem) => problem.includes('remote is missing migrations')))
})

test('an expected release that could not be computed leaves parity UNVERIFIED even with hosted evidence', () => {
  const result = classifyParity({ expectedRelease: null, inventory, remote: hostedRemote() })
  assert.equal(result.state, 'UNVERIFIED')
  assert.match(result.reasons.join(' '), /could not be computed offline/u)
})

test('a dirty worktree is stated next to the computed release', () => {
  const result = buildProvenanceMatrix({ local: { ...local, worktreeDirty: true }, expectedRelease: release, inventory, mobilePolicy, remote: null })
  assert.equal(row(result, 'worktree_state').value, 'dirty')
  assert.match(row(result, 'worktree_state').note, /working tree, not the commit/u)
})

test('the markdown report states every row with a source and ends with the parity state', () => {
  const text = renderProvenanceMarkdown(matrix(null))
  for (const candidate of matrix(null).rows) assert.ok(text.includes(candidate.component), candidate.component)
  assert.match(text, /Deployment parity: \*\*UNVERIFIED\*\*/u)
  assert.doesNotMatch(text, /\| (VERIFIED|UNKNOWN) \| undefined/u)
})

test('collecting offline inputs reads the checkout only and never reaches the network', () => {
  const realFetch = globalThis.fetch
  let networkCalls = 0
  globalThis.fetch = () => {
    networkCalls += 1
    throw new Error('network is not permitted for provenance collection')
  }
  try {
    const collected = collectLocalInputs()
    const result = buildProvenanceMatrix({ ...collected, remote: null })
    assert.match(collected.local.headSha, /^[0-9a-f]{40}$/u)
    assert.equal(result.parity.state, 'UNVERIFIED')
    assert.equal(networkCalls, 0)
    assert.equal(row(result, 'ci_build_id').status, process.env.GITHUB_RUN_ID ? 'VERIFIED' : 'UNKNOWN')
    assert.equal(row(result, 'mobile_app_version_declared').status, 'VERIFIED')
  } finally {
    globalThis.fetch = realFetch
  }
})
