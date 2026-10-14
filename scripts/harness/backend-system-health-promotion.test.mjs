import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTransactionBehaviorReceipt } from './transaction-behavior-receipt.mjs'
import { transactionBehaviorFixture } from './fixtures/transaction-behavior-fixture.mjs'
import {
  buildBackendGateReceipt,
  requireBackendTransactionEvidence,
  verifyBackendSystemMonitorEdgeProof,
  verifyBackendGateReceipt,
} from './backend-system-health-promotion.mjs'

function evidence(status = 'MAPPED') {
  const fixture = transactionBehaviorFixture(status)
  const receipt = buildTransactionBehaviorReceipt({ manifest: fixture.value, reports: [fixture.report] })
  return { receipt, coverage: { manifestSha256: receipt.manifestSha256,
    entryCount: receipt.entryCount, boundAssertionsRequired: receipt.boundAssertions.required } }
}

test('backend release requires every catalog entry and runner assertion to pass', () => {
  const { receipt, coverage } = evidence()
  assert.equal(requireBackendTransactionEvidence(receipt, coverage).mapped, receipt.entryCount)
  const partial = evidence('PARTIAL')
  assert.throws(() => requireBackendTransactionEvidence(partial.receipt, partial.coverage), /STRICT_MAPPING_REQUIRED/)
  assert.throws(() => requireBackendTransactionEvidence({ ...receipt,
    boundAssertions: { required: receipt.boundAssertions.required, passed: 0 } }, coverage), /TRANSACTION_EVIDENCE_INVALID/)
})

test('runner receipt cannot be reused against another release catalog or asserted count', () => {
  const { receipt, coverage } = evidence()
  for (const change of [{ manifestSha256: 'f'.repeat(64) }, { entryCount: coverage.entryCount + 1 },
    { boundAssertionsRequired: coverage.boundAssertionsRequired + 1 }]) {
    assert.throws(() => requireBackendTransactionEvidence(receipt, { ...coverage, ...change }), /TRANSACTION_CATALOG_MISMATCH/)
  }
  assert.throws(() => requireBackendTransactionEvidence(null, coverage), /TRANSACTION_EVIDENCE_INVALID/)
})

test('system-monitor Edge proof is bound to the exact release, runtime config and downloaded source closure', () => {
  const release = {
    releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    gitSha: 'a'.repeat(40),
    systemHealthObserver: { edgeFunction: {
      sha256: 'c'.repeat(64),
      inputs: ['supabase/functions/system-monitor/index.ts', 'supabase/functions/system-monitor/deno.json'],
      runtimeConfiguration: { sha256: 'd'.repeat(64) },
    } },
  }
  const proof = {
    status: 'verified', releaseId: release.releaseId, gitSha: release.gitSha,
    profileId: 'cloudflare-admin-v1', edgeFunction: 'system-monitor',
    edgeFunctionId: '123e4567-e89b-42d3-a456-426614174000', edgeVersion: 43,
    sourceSha256: release.systemHealthObserver.edgeFunction.sha256,
    sourceInputs: release.systemHealthObserver.edgeFunction.inputs,
    runtimeConfigurationSha256: release.systemHealthObserver.edgeFunction.runtimeConfiguration.sha256,
  }
  const receipt = verifyBackendSystemMonitorEdgeProof(proof, release)
  assert.equal(receipt.edgeVersion, 43)
  assert.equal(receipt.proofSha256.length, 64)
  assert.throws(() => verifyBackendSystemMonitorEdgeProof({ ...proof, sourceSha256: '0'.repeat(64) }, release),
    /BACKEND_SYSTEM_MONITOR_SOURCE_MISMATCH/u)
  assert.throws(() => verifyBackendSystemMonitorEdgeProof({ ...proof, sourceInputs: [] }, release),
    /BACKEND_SYSTEM_MONITOR_SOURCE_MISMATCH/u)
  assert.throws(() => verifyBackendSystemMonitorEdgeProof({ ...proof, edgeVersion: 0 }, release),
    /BACKEND_SYSTEM_MONITOR_SOURCE_MISMATCH/u)
})

test('backend gate receipts bind actual evidence bytes to source, baseline and the current workflow run', () => {
  const sourceSha = 'a'.repeat(40)
  const release = {
    environment: 'production', releaseLane: 'backend-system-health', gitSha: sourceSha,
    releaseId: `harness-${sourceSha.slice(0, 12)}-${'b'.repeat(12)}`,
    manifestSha256: 'c'.repeat(64), backendHostedStateSha256: 'd'.repeat(64),
  }
  const workflowRun = { workflowPath: '.github/workflows/release-backend-system-health.yml',
    runId: '1234567890', runAttempt: 2 }
  const evidenceBytes = Buffer.from('{"command":"pnpm test:api","exitCode":0}')
  const now = Date.now()
  const receipt = buildBackendGateReceipt({ release, gate: 'quality', evidenceBytes, workflowRun, now })
  assert.deepEqual(verifyBackendGateReceipt({ receipt, evidenceBytes, release, gate: 'quality', workflowRun, now }), [])
  assert.ok(verifyBackendGateReceipt({ receipt, evidenceBytes: Buffer.from('different'), release,
    gate: 'quality', workflowRun, now }).includes('BACKEND_GATE_RECEIPT_EVIDENCE_INVALID'))
  assert.ok(verifyBackendGateReceipt({ receipt, evidenceBytes, release: { ...release, gitSha: 'e'.repeat(40) },
    gate: 'quality', workflowRun, now }).includes('BACKEND_GATE_RECEIPT_IDENTITY_INVALID'))
  assert.ok(verifyBackendGateReceipt({ receipt, evidenceBytes, release,
    gate: 'rollback', workflowRun, now }).includes('BACKEND_GATE_RECEIPT_IDENTITY_INVALID'))
  assert.throws(() => buildBackendGateReceipt({ release, gate: 'quality', evidenceBytes,
    workflowRun: { ...workflowRun, workflowPath: '.github/workflows/release-production.yml' }, now }),
  /BACKEND_GATE_RECEIPT_INPUT_INVALID/u)
})
