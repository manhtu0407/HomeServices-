import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildSyntheticSmokeObservation } from '../../apps/api/scripts/lib/stage1-synthetic-smoke-core.mjs'
import { buildStage1SloReport, nearestRankPercentile } from './stage1-slo-report.mjs'

const releaseId = 'harness-123456789abc-def012345678'

test('nearest-rank p95 uses the nineteenth value across twenty runs', () => {
  assert.equal(nearestRankPercentile(Array.from({ length: 20 }, (_, index) => index + 1), 0.95), 19)
})

test('Staging SLO accepts one slow outlier when the nineteenth result is inside the threshold', () => {
  const observations = Array.from({ length: 20 }, (_, index) => observation(index + 1, index === 19 ? 5_929 : 2_000))
  const report = buildStage1SloReport(observations)
  assert.equal(report.confirmAcceptanceP95Ms, 2_000)
  assert.equal(report.workerOfferVisibleP95Ms, 4_000)
  assert.match(report.reportSha256, /^[0-9a-f]{64}$/u)
})

test('Staging SLO fails when p95 breaches or a functional invariant is invalid', () => {
  const slow = Array.from({ length: 20 }, (_, index) => observation(index + 1, index < 19 ? 3_001 : 5_929))
  assert.throws(() => buildStage1SloReport(slow), /p95 exceeded 3 seconds/u)
  const invalid = Array.from({ length: 20 }, (_, index) => observation(index + 1, 2_000))
  invalid[3] = { ...invalid[3], duplicateJobCount: 1 }
  assert.throws(() => buildStage1SloReport(invalid), /checksum is invalid|functional invariant/u)
})

function observation(sequence, confirmAcceptanceMs) {
  return buildSyntheticSmokeObservation({
    releaseId,
    environment: 'staging',
    cohortId: `synthetic-stage1-123456789abc-def012345678-slo${String(sequence).padStart(2, '0')}`,
    runId: `staging-slo-${sequence}`,
    sequence,
    scenarios: { autoQuote: true, rfqOrInspection: true, recovery: true },
    releaseIdentityMatch: true,
    terminalReconcilePassed: true,
    syntheticLeakCount: 0,
    duplicateJobCount: 0,
    duplicateBroadcastCount: 0,
    safeErrorCodeRatio: 1,
    confirmAcceptanceMs,
    workerOfferVisibleMs: 4_000,
    supportTraceCount: 12,
    now: 1_700_000_000_000 + sequence,
  })
}
