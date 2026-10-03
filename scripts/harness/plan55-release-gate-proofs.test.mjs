import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  assertPlan55ReleaseStageGateProof,
  buildPlan55ReleaseStageGateProofs,
  PLAN55_RELEASE_STAGE_GATES,
} from './plan55-release-gate-proofs.mjs'
import { loadPlan55ProductionOnlyPolicy } from './promotion.mjs'

const basePolicy = loadPlan55ProductionOnlyPolicy(process.cwd())
const policy = {
  ...basePolicy,
  trustedEvidenceWorkflowPathsByGate: {
    ...basePolicy.trustedEvidenceWorkflowPathsByGate,
    ...Object.fromEntries([
      'hosted-drift-baseline',
      'compatible-rollback-target',
      'plan55-production-target-attestation',
      'plan55-rollback-preflight',
    ].map((gate) => [gate, '.github/workflows/ci.yml'])),
  },
}
const sourceSha = 'a'.repeat(40)
const releaseId = `harness-${sourceSha.slice(0, 12)}-${'b'.repeat(12)}`
const provenance = {
  workflowPath: '.github/workflows/ci.yml',
  runId: '9001',
  runAttempt: 2,
}

function bytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function fixture(overrides = {}) {
  const release = {
    environment: 'production',
    releaseLane: 'plan55-production-only',
    releaseId,
    gitSha: sourceSha,
  }
  const hostedBefore = {
    environment: 'production',
    projectRef: policy.projectRef,
    releaseId: policy.productionSourceBase.releaseId,
    gitSha: policy.productionSourceBase.sha,
    migrations: [{ version: '20261001000000', name: 'base' }],
    managedEdgeFunctions: {
      'mobile-api': {
        status: 'ACTIVE',
        version: 42,
        ezbr_sha256: 'c'.repeat(64),
        verify_jwt: true,
        import_map: 'supabase/functions/mobile-api/deno.json',
        entrypoint_path: 'supabase/functions/mobile-api/index.ts',
        import_map_path: 'supabase/functions/mobile-api/deno.json',
      },
    },
  }
  const hostedRollback = structuredClone(hostedBefore)
  const changed = overrides.hostedBefore ?? {}
  Object.assign(hostedBefore, changed)
  if (overrides.rollbackMigrations) hostedRollback.migrations = overrides.rollbackMigrations
  if (overrides.rollbackEdgeVersion) {
    hostedRollback.managedEdgeFunctions['mobile-api'].version = overrides.rollbackEdgeVersion
  }
  const releaseBytes = bytes(release)
  const hostedBeforeBytes = bytes(hostedBefore)
  const hostedRollbackBytes = bytes(hostedRollback)
  const rollbackSourceSha256 = overrides.rollbackSourceSha256 ?? 'd'.repeat(64)
  const files = new Map([
    ['release.json', releaseBytes],
    ['hosted-before.json', hostedBeforeBytes],
    ['hosted-rollback-snapshot.json', hostedRollbackBytes],
    ['rollback-mobile-source-sha256.txt', Buffer.from(`${rollbackSourceSha256}\n`)],
  ])
  return {
    release,
    releaseBytes,
    hostedBefore,
    hostedBeforeBytes,
    hostedRollback,
    hostedRollbackBytes,
    rollbackSourceSha256,
    files,
  }
}

function build(input = fixture()) {
  return buildPlan55ReleaseStageGateProofs({
    policy,
    ...input,
    provenance,
  })
}

test('builds the four Production baseline and rollback proofs from exact hosted snapshots', () => {
  const input = fixture()
  const proofs = build(input)
  assert.deepEqual(Object.keys(proofs).sort(), [...PLAN55_RELEASE_STAGE_GATES].sort())
  assert.equal(proofs['hosted-drift-baseline'].baseline.sourceSha, policy.productionSourceBase.sha)
  assert.equal(proofs['plan55-production-target-attestation'].baseline.releaseId,
    policy.productionSourceBase.releaseId)
  assert.equal(proofs['compatible-rollback-target'].rollback.snapshotSha256,
    createHash('sha256').update(input.hostedRollbackBytes).digest('hex'))
  assert.equal(proofs['plan55-rollback-preflight'].rollback.sourceSha256, input.rollbackSourceSha256)
  for (const gate of PLAN55_RELEASE_STAGE_GATES) {
    assert.equal(assertPlan55ReleaseStageGateProof(proofs[gate], {
      gate, policy, release: input.release, provenance, sourceArtifactFiles: input.files,
    }), true)
  }
  assert.doesNotMatch(JSON.stringify(proofs), /projectUrl|serviceRoleKey|TEST_SECRET/u)
})

test('refuses a Production baseline that is not the pinned source and project', () => {
  for (const hostedBefore of [
    { projectRef: 'wrong-project' },
    { gitSha: 'f'.repeat(40) },
    { releaseId: 'harness-ffffffffffff-ffffffffffff' },
  ]) {
    assert.throws(() => build(fixture({ hostedBefore })), /Production baseline/u)
  }
})

test('refuses a rollback snapshot that differs from the captured Production baseline', () => {
  assert.throws(() => build(fixture({
    rollbackMigrations: [{ version: '20261001000001', name: 'different' }],
  })), /rollback snapshot/u)
  assert.throws(() => build(fixture({ rollbackEdgeVersion: 43 })), /rollback snapshot/u)
  assert.throws(() => build(fixture({ rollbackSourceSha256: 'not-a-sha' })), /rollback source/u)
})

test('rejects proof edits and source snapshot changes after proof generation', () => {
  const input = fixture()
  const proof = build(input)['compatible-rollback-target']
  const changedFiles = new Map(input.files)
  changedFiles.set('hosted-before.json', bytes({ ...input.hostedBefore, gitSha: 'f'.repeat(40) }))
  assert.throws(() => assertPlan55ReleaseStageGateProof(proof, {
    gate: 'compatible-rollback-target', policy, release: input.release, provenance,
    sourceArtifactFiles: changedFiles,
  }), /Production baseline/u)
  assert.throws(() => assertPlan55ReleaseStageGateProof({ ...proof, status: 'SKIPPED' }, {
    gate: 'compatible-rollback-target', policy, release: input.release, provenance,
  }), /proof contract/u)
})
