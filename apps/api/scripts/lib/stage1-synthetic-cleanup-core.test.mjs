import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSyntheticCleanupReceipt,
  verifySyntheticCleanupReceipt,
} from './stage1-synthetic-cleanup-core.mjs'

const input = {
  releaseId: 'harness-123456789abc-def012345678',
  cohortId: 'synthetic-stage1-123456789abc-def012345678-gh77-2',
  runId: 'gh:77:2',
  proof: {
    member_count: 2,
    worker_member_count: 1,
    worker_marker_count: 1,
    active_delivery_signal_count: 0,
    scenario_record_count: 0,
  },
  now: '2026-08-23T00:00:00.000Z',
}

test('builds a checksummed exact-cohort cleanup proof while retaining actor markers', () => {
  const receipt = buildSyntheticCleanupReceipt(input)
  assert.equal(receipt.status, 'cleaned')
  assert.equal(receipt.workerMarkerCount, 1)
  assert.equal(verifySyntheticCleanupReceipt(receipt), true)
})

test('rejects leftover scenario rows, delivery signals, and declassified workers', () => {
  for (const proof of [
    { ...input.proof, scenario_record_count: 1 },
    { ...input.proof, active_delivery_signal_count: 1 },
    { ...input.proof, worker_marker_count: 0 },
  ]) {
    assert.throws(() => buildSyntheticCleanupReceipt({ ...input, proof }), /cleanup did not preserve/u)
  }
})

test('detects any mutation after receipt generation', () => {
  const receipt = buildSyntheticCleanupReceipt(input)
  assert.equal(verifySyntheticCleanupReceipt({ ...receipt, memberCount: 3 }), false)
})
