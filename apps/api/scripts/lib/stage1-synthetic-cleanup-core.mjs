import { createHash } from 'node:crypto'

const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const COHORT_ID = /^synthetic-stage1-[0-9a-f]{12}-[0-9a-f]{12}-[A-Za-z0-9_-]{1,48}$/u

export function buildSyntheticCleanupReceipt(input) {
  if (!RELEASE_ID.test(input?.releaseId ?? '') ||
      !COHORT_ID.test(input?.cohortId ?? '') ||
      !/^[A-Za-z0-9_.:-]{1,120}$/u.test(input?.runId ?? '')) {
    throw new Error('synthetic cleanup receipt identity is invalid')
  }
  const proof = input.proof
  for (const field of [
    'member_count',
    'worker_member_count',
    'worker_marker_count',
    'active_delivery_signal_count',
    'scenario_record_count',
  ]) {
    if (!Number.isSafeInteger(proof?.[field]) || proof[field] < 0) {
      throw new Error(`synthetic cleanup proof field is invalid: ${field}`)
    }
  }
  if (proof.scenario_record_count !== 0 || proof.active_delivery_signal_count !== 0 ||
      proof.worker_marker_count !== proof.worker_member_count) {
    throw new Error('synthetic cleanup did not preserve classification or remove exact-cohort state')
  }
  const receipt = {
    schemaVersion: 'stage1-synthetic-cleanup.v1',
    status: 'cleaned',
    releaseId: input.releaseId,
    cohortId: input.cohortId,
    runId: input.runId,
    memberCount: proof.member_count,
    workerMemberCount: proof.worker_member_count,
    workerMarkerCount: proof.worker_marker_count,
    activeDeliverySignalCount: 0,
    scenarioRecordCount: 0,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    receiptSha256: '',
  }
  receipt.receiptSha256 = syntheticCleanupReceiptSha256(receipt)
  return receipt
}

export function syntheticCleanupReceiptSha256(receipt) {
  return createHash('sha256').update([
    receipt.schemaVersion,
    receipt.status,
    receipt.releaseId,
    receipt.cohortId,
    receipt.runId,
    receipt.memberCount,
    receipt.workerMemberCount,
    receipt.workerMarkerCount,
    receipt.activeDeliverySignalCount,
    receipt.scenarioRecordCount,
    receipt.generatedAt,
  ].map(String).join('\n')).digest('hex')
}

export function verifySyntheticCleanupReceipt(receipt) {
  return typeof receipt?.receiptSha256 === 'string' &&
    receipt.receiptSha256 === syntheticCleanupReceiptSha256(receipt)
}
