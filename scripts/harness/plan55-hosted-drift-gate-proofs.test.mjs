import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { RELEASE_EDGE_FUNCTIONS } from './release-bundle.mjs'
import { compareDeploymentState } from './deployment-drift.mjs'
import { canonicalMigrationEntries } from './migration-history.mjs'
import {
  assertPlan55HostedDriftGateProof,
  buildPlan55HostedDriftGateProof,
} from './plan55-hosted-drift-gate-proofs.mjs'
import { loadPlan55ProductionOnlyPolicy } from './promotion.mjs'

const root = resolve('.')
const policy = loadPlan55ProductionOnlyPolicy(root)
const targetState = 'rollback_drill'
const workflowPath = '.github/workflows/plan55-hosted-drift.yml'
const gate = 'plan55-hosted-drift-pass'
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
const providerReadinessFingerprintSha256 = createHash('sha256')
  .update(canonicalJson(providerReadiness))
  .digest('hex')
const release = {
  releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
  releaseLane: policy.releaseLane,
  environment: 'production',
  gitSha: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64),
  bundleSha256: 'c'.repeat(64),
  migrationInventorySha256: 'd'.repeat(64),
  sourceBundleSha256: '1'.repeat(64),
  mobileBuildFingerprintSha256: '2'.repeat(64),
  productionUiSourceSha256: '3'.repeat(64),
  edgeBundleSha256: '4'.repeat(64),
  serviceIntakePolicyBundleSha256: '5'.repeat(64),
  priceEvidenceBundleSha256: '6'.repeat(64),
  providerReadiness,
  providerReadinessFingerprintSha256,
  edgeFunctions: Object.fromEntries(RELEASE_EDGE_FUNCTIONS.map((name) => [name, '7'.repeat(64)])),
}
const migrationInventory = JSON.parse(readFileSync(
  resolve(root, 'config/harness/migration-inventory.json'), 'utf8'))
const migrations = canonicalMigrationEntries(migrationInventory)
  .map(({ version }) => ({ version, name: `migration_${version}` }))
const hostedAfter = {
  environment: 'production',
  projectRef: policy.projectRef,
  releaseId: release.releaseId,
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
  providerReadinessFingerprintSha256,
  providerReadiness,
  migrations,
  edgeFunctions: release.edgeFunctions,
}
const hostedBefore = {
  environment: 'production',
  projectRef: policy.projectRef,
  releaseId: policy.productionSourceBase.releaseId,
  gitSha: policy.productionSourceBase.sha,
  migrations,
}
const encode = (value) => Buffer.from(`${JSON.stringify(value)}\n`)
const sourceArtifactFiles = new Map([
  ['release.json', encode(release)],
  ['hosted-before.json', encode(hostedBefore)],
  ['hosted-guard-deployed.json', encode(hostedAfter)],
  ['hosted-observed.json', encode(hostedAfter)],
])
const provenance = {
  workflowPath,
  runId: '501',
  runAttempt: 2,
  workflowHeadSha: release.gitSha,
}
const sourceRun = { id: '401', attempt: 3 }

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function makeProof(overrides = {}) {
  return buildPlan55HostedDriftGateProof({
    policy,
    release,
    targetState,
    provenance,
    sourceRun,
    releaseArtifactId: 4321,
    sourceArtifactFiles: new Map(sourceArtifactFiles),
    ...overrides,
  })
}

test('builds a source-bound pass only from exact Production snapshots and the locked source artifact', () => {
  const report = compareDeploymentState({ release, inventory: migrationInventory, remote: hostedAfter })
  assert.equal(report.ok, true, report.problems.join('; '))
  const proof = makeProof()

  assert.equal(proof.gate, gate)
  assert.equal(proof.status, 'PASS')
  assert.equal(proof.sourceSha, release.gitSha)
  assert.equal(proof.releaseId, release.releaseId)
  assert.equal(proof.targetState, targetState)
  assert.equal(assertPlan55HostedDriftGateProof(proof, {
    policy, release, targetState, provenance, sourceArtifactFiles,
  }), true)
})

test('rejects wrong target, producer, release artifact and proof identity', () => {
  const proof = makeProof()

  for (const [mutated, options] of [
    [{ ...proof, targetState: 'receipts_validated' }, {}],
    [{ ...proof, sourceSha: 'f'.repeat(40) }, {}],
    [{ ...proof, releaseArtifactId: -1 }, {}],
    [proof, { provenance: { ...provenance, runId: '502' } }],
  ]) {
    assert.throws(() => assertPlan55HostedDriftGateProof(mutated, {
      policy, release, targetState, provenance, sourceArtifactFiles, ...options,
    }), /hosted drift proof contract failed/u)
  }
  assert.throws(() => makeProof({ sourceRun: { id: 'not-a-run', attempt: 3 } }),
    /hosted drift proof contract failed/u)
})

test('rejects a current Production snapshot whose runtime or migration state drifted', () => {
  const proof = makeProof()
  const drifted = new Map(sourceArtifactFiles)
  drifted.set('hosted-observed.json', encode({ ...hostedAfter, gitSha: 'f'.repeat(40) }))
  const driftedProof = {
    ...proof,
    hostedObservedStateSha256: createHash('sha256').update(drifted.get('hosted-observed.json')).digest('hex'),
  }

  assert.throws(() => assertPlan55HostedDriftGateProof(driftedProof, {
    policy, release, targetState, provenance, sourceArtifactFiles: drifted,
  }), /hosted drift proof contract failed/u)
})

test('requires immutable snapshot bytes to be present when building the pass proof', () => {
  const incomplete = new Map(sourceArtifactFiles)
  incomplete.delete('hosted-observed.json')

  assert.throws(() => makeProof({ sourceArtifactFiles: incomplete }),
    /hosted drift proof contract failed/u)
})
