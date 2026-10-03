import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import {
  buildPlan55GateEvidenceArtifact,
  isPlan55GateReceiptRecord,
  loadPlan55GateEvidenceSet,
} from './plan55-gate-receipts.mjs'
import {
  buildPlan55PreflightGateEvidenceFiles,
  PLAN55_PREFLIGHT_GATE_CHECKS,
} from './plan55-preflight-gate-evidence.mjs'
import { loadPlan55ProductionOnlyPolicy } from './promotion.mjs'

const policy = loadPlan55ProductionOnlyPolicy(resolve('.'))
const sourceSha = 'a'.repeat(40)
const outcomes = {
  verify_source: 'success',
  docker_ram_floor: 'success',
  workspace_quality: 'success',
  production_ui_normality: 'success',
  secret_scan: 'success',
  sql_verification: 'success',
}

function buildProofs(overrides = {}) {
  return buildPlan55PreflightGateEvidenceFiles({
    policy,
    sourceSha,
    githubSha: sourceSha,
    githubRef: 'refs/heads/main',
    eventName: 'workflow_dispatch',
    repository: policy.repository,
    runId: '7001',
    runAttempt: 2,
    outcomes,
    ...overrides,
  })
}

test('emits deterministic per-gate proofs bound to the exact main run and required successful steps', () => {
  const files = buildProofs()
  assert.deepEqual([...files.keys()].sort(), Object.keys(PLAN55_PREFLIGHT_GATE_CHECKS)
    .map((gate) => `plan55-gate-evidence/${gate}.json`).sort())

  for (const [gate, requiredChecks] of Object.entries(PLAN55_PREFLIGHT_GATE_CHECKS)) {
    const evidence = JSON.parse(files.get(`plan55-gate-evidence/${gate}.json`).toString('utf8'))
    assert.equal(evidence.schemaVersion, 'plan55-preflight-gate-proof.v1')
    assert.equal(evidence.gate, gate)
    assert.equal(evidence.status, 'PASS')
    assert.equal(evidence.environment, 'production')
    assert.equal(evidence.projectRef, policy.projectRef)
    assert.equal(evidence.policyId, policy.policyId)
    assert.equal(evidence.policySha256, policy.policySha256)
    assert.equal(evidence.sourceSha, sourceSha)
    assert.equal(evidence.workflowPath, '.github/workflows/ci.yml')
    assert.equal(evidence.runId, '7001')
    assert.equal(evidence.runAttempt, 2)
    assert.deepEqual(evidence.checks, requiredChecks.map((id) => ({ id, outcome: 'success' })))
  }
})

test('rejects non-main, stale source, missing run identity, and any failed, skipped, or unknown step outcome', () => {
  for (const overrides of [
    { githubRef: 'refs/heads/feature' },
    { githubSha: 'b'.repeat(40) },
    { sourceSha: 'not-a-sha' },
    { runId: '0' },
    { runAttempt: 0 },
    { outcomes: { ...outcomes, secret_scan: 'skipped' } },
    { outcomes: { ...outcomes, sql_verification: 'failure' } },
    { outcomes: { ...outcomes, production_ui_normality: 'failure' } },
    { outcomes: { ...outcomes, unexpected: 'success' } },
    { outcomes: Object.fromEntries(Object.entries(outcomes).filter(([id]) => id !== 'workspace_quality')) },
  ]) {
    assert.throws(() => buildProofs(overrides), /Plan 55 preflight gate evidence/u)
  }
})

test('rejects untrusted or incomplete workflow evidence policy', () => {
  assert.throws(() => buildProofs({
    policy: { ...policy, repository: 'attacker/repo' },
  }), /Plan 55 preflight gate evidence/u)
  assert.throws(() => buildProofs({
    policy: {
      ...policy,
      trustedEvidenceWorkflowPathsByGate: {
        ...policy.trustedEvidenceWorkflowPathsByGate,
        'workspace-typecheck': undefined,
      },
    },
  }), /Plan 55 preflight gate evidence/u)
})

test('round-trips a preflight proof through its exact-source receipt artifact', (t) => {
  const gate = 'workspace-typecheck'
  const requiredGates = [gate]
  const receiptPolicy = {
    ...policy,
    requiredGatesByTarget: Object.fromEntries(Object.keys(policy.requiredGatesByTarget).map((target) => [
      target,
      target === 'receipts_validated' ? requiredGates : [],
    ])),
  }
  const evidencePath = `plan55-gate-evidence/${gate}.json`
  const sourceEvidenceBytes = buildPlan55PreflightGateEvidenceFiles({
    policy: receiptPolicy,
    sourceSha,
    githubSha: sourceSha,
    githubRef: 'refs/heads/main',
    eventName: 'workflow_dispatch',
    repository: receiptPolicy.repository,
    runId: '7001',
    runAttempt: 2,
    outcomes,
  }).get(evidencePath)
  const provenance = {
    repository: receiptPolicy.repository,
    workflowPath: '.github/workflows/ci.yml',
    runId: '7001',
    runAttempt: 2,
    workflowHeadSha: sourceSha,
    artifactId: 701,
    artifactName: 'plan55-preflight-gates-7001-2',
    artifactDigest: `sha256:${'c'.repeat(64)}`,
    artifactEvidencePath: evidencePath,
  }
  const release = {
    environment: 'production',
    releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    gitSha: sourceSha,
    releaseLane: 'plan55-production-only',
  }
  const files = buildPlan55GateEvidenceArtifact({
    policy: receiptPolicy,
    release,
    targetState: 'receipts_validated',
    requiredGates,
    sourceEvidence: new Map([[gate, {
      evidenceBytes: sourceEvidenceBytes,
      artifactEvidencePath: evidencePath,
      artifactFiles: new Map([[evidencePath, sourceEvidenceBytes]]),
      provenance,
    }]]),
  })
  const root = mkdtempSync(join(tmpdir(), 'plan55-preflight-receipt-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [path, bytes] of files) {
    if (path.endsWith('/')) continue
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), bytes)
  }

  const receiptSet = loadPlan55GateEvidenceSet(join(root, 'gate-evidence-set.json'), {
    policy: receiptPolicy,
    release,
    targetState: 'receipts_validated',
    requiredGates,
  })
  const record = receiptSet[gate]
  assert.deepEqual(record.evidenceProof.proof, JSON.parse(sourceEvidenceBytes.toString('utf8')))
  assert.ok(record.sourceEvidenceBytes.equals(sourceEvidenceBytes))
  assert.equal(isPlan55GateReceiptRecord(record, gate, {
    policy: receiptPolicy,
    release,
    targetState: 'receipts_validated',
  }), true)
})
