import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertResponseIdentity,
  assertScenarioReady,
  buildSyntheticSmokeObservation,
  buildSyntheticSmokeReceipt,
  isSyntheticActorPresentationSafe,
  isReleaseConvergenceRetry,
  pollUntil,
  priceEvidenceHasQuorum,
} from './stage1-synthetic-smoke-core.mjs'

const releaseId = 'harness-123456789abc-def012345678'
const cohortId = 'synthetic-stage1-123456789abc-def012345678-gh77'

test('synthetic actor presentation stays natural while cohort identity remains server-side', () => {
  assert.equal(isSyntheticActorPresentationSafe('Khách hàng NestScout'), true)
  assert.equal(isSyntheticActorPresentationSafe('Đối tác NestScout'), true)
  assert.equal(isSyntheticActorPresentationSafe('Stage 1 Native Worker'), false)
  assert.equal(isSyntheticActorPresentationSafe('Production synthetic customer'), false)
  assert.equal(isSyntheticActorPresentationSafe('Kỹ thuật viên test'), false)
  assert.equal(isSyntheticActorPresentationSafe('  '), false)
})

test('assertResponseIdentity requires exact release and safe request lineage', () => {
  const headers = new Headers({
    'x-release-id': releaseId,
    'x-trace-id': '10000000-0000-4000-8000-000000000001',
    'x-run-id': '10000000-0000-4000-8000-000000000002',
    'x-operation-id': '10000000-0000-4000-8000-000000000003',
    'x-support-code': 'ABCDEF12',
  })
  assert.deepEqual(assertResponseIdentity(headers, releaseId), {
    releaseId,
    traceId: '10000000-0000-4000-8000-000000000001',
    runId: '10000000-0000-4000-8000-000000000002',
    operationId: '10000000-0000-4000-8000-000000000003',
    supportCode: 'ABCDEF12',
  })
  headers.set('x-release-id', 'unreleased')
  assert.throws(() => assertResponseIdentity(headers, releaseId), /release identity mismatch/u)
})

test('release convergence retries only a safe stale-isolate handshake refusal', () => {
  const stale = new Response(JSON.stringify({ code: 'CLIENT_UPDATE_REQUIRED' }), {
    status: 426,
    headers: { 'x-release-id': 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb' },
  })
  assert.equal(isReleaseConvergenceRetry(stale, { code: 'CLIENT_UPDATE_REQUIRED' }, releaseId), true)
  assert.equal(isReleaseConvergenceRetry(stale, { code: 'AUTH_FORBIDDEN' }, releaseId), false)
  assert.equal(isReleaseConvergenceRetry(new Response(null, {
    status: 500,
    headers: { 'x-release-id': 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb' },
  }), { code: 'CLIENT_UPDATE_REQUIRED' }, releaseId), false)
})

test('assertScenarioReady distinguishes priced evidence from honest RFQ and inspection', () => {
  const coverage = {
    policy_id: '10000000-0000-4000-8000-000000000001',
    policy_version: 3,
    order_eligible: true,
    missing_required_fields: [],
    missing_enrichment_slots: ['optional_detail'],
    safety_blocker: null,
  }
  assert.equal(assertScenarioReady({
    session: {
      quote_mode: 'kael_auto_quote',
      intake_coverage: { ...coverage, quote_mode: 'kael_auto_quote', confirmation_kind: 'priced_offer', next_action: 'offer_review' },
      estimate: {
        price_min: 120000,
        price_max: 180000,
        price_reasoning_receipt: { receipt_id: 'price_reasoning:abc123' },
      },
    },
  }, 'kael_auto_quote').confirmationKind, 'priced_offer')
  assert.equal(assertScenarioReady({
    session: {
      quote_mode: 'rfq',
      intake_coverage: { ...coverage, quote_mode: 'rfq', confirmation_kind: 'rfq_request', next_action: 'rfq_review' },
      estimate: null,
    },
  }, 'rfq').confirmationKind, 'rfq_request')
  assert.throws(() => assertScenarioReady({
    session: {
      quote_mode: 'rfq',
      intake_coverage: { ...coverage, quote_mode: 'rfq', confirmation_kind: 'rfq_request', next_action: 'rfq_review' },
      estimate: { price_min: 0, price_max: 0 },
    },
  }, 'rfq'), /RFQ.*price/u)
})

test('priceEvidenceHasQuorum accepts the governed sources schema with two valid domains', () => {
  assert.equal(priceEvidenceHasQuorum({
    schema_version: 'baseline_price_evidence.v1',
    sources: [
      governedPriceSource('provider-one.example', 'https://provider-one.example/prices'),
      governedPriceSource('provider-two.example', 'https://provider-two.example/prices'),
    ],
  }), true)
})

test('priceEvidenceHasQuorum ignores self-asserted summary booleans and counts', () => {
  assert.equal(priceEvidenceHasQuorum({
    quorum_met: true,
    accepted_source_count: 99,
    high_trust_source_count: 99,
  }), false)
  assert.equal(priceEvidenceHasQuorum({
    schema_version: 'baseline_price_evidence.v1',
    quorum_met: true,
    accepted_source_count: 99,
    high_trust_source_count: 99,
    sources: [
      governedPriceSource('provider-one.example', 'https://provider-one.example/prices'),
      {
        ...governedPriceSource('provider-two.example', 'https://provider-two.example/prices'),
        signals: {
          ...governedPriceSource('provider-two.example', 'https://provider-two.example/prices').signals,
          integrity_verified: false,
        },
      },
    ],
  }), false)
})

test('priceEvidenceHasQuorum rejects duplicate provenance and malformed source signals', () => {
  const first = governedPriceSource('provider.example', 'https://provider.example/prices-a')
  const second = governedPriceSource('provider.example', 'https://provider.example/prices-b')
  assert.equal(priceEvidenceHasQuorum({
    schema_version: 'baseline_price_evidence.v1',
    sources: [first, second],
  }), false)
  assert.equal(priceEvidenceHasQuorum({
    schema_version: 'baseline_price_evidence.v1',
    sources: [
      first,
      { ...governedPriceSource('provider-two.example', 'https://provider-two.example/prices'), observed_at: '23-08-2026' },
    ],
  }), false)
  assert.equal(priceEvidenceHasQuorum({
    schema_version: 'baseline_price_evidence.v1',
    sources: [
      first,
      {
        ...governedPriceSource('provider-two.example', 'https://provider-two.example/prices'),
        signals: { identity_verified: true },
      },
    ],
  }), false)
})

test('pollUntil returns measured terminal value and fails closed at attempt bound', async () => {
  let calls = 0
  const result = await pollUntil(async () => {
    calls += 1
    return { ready: calls === 3, calls }
  }, (value) => value.ready, { attempts: 3, intervalMs: 0 })
  assert.equal(result.value.calls, 3)
  await assert.rejects(
    pollUntil(async () => ({ ready: false }), (value) => value.ready, { attempts: 2, intervalMs: 0 }),
    /did not reach the required state/u,
  )
})

test('buildSyntheticSmokeReceipt is checksummed and rejects a breached metric', () => {
  const receipt = buildSyntheticSmokeReceipt({
    releaseId,
    environment: 'production',
    cohortId,
    runId: 'gh-77-1',
    sequence: 1,
    scenarios: { autoQuote: true, rfqOrInspection: true, recovery: true },
    releaseIdentityMatch: true,
    terminalReconcilePassed: true,
    syntheticLeakCount: 0,
    duplicateJobCount: 0,
    duplicateBroadcastCount: 0,
    safeErrorCodeRatio: 1,
    confirmAcceptanceMs: 1100,
    workerOfferVisibleMs: 2600,
    supportTraceCount: 14,
    now: 1_700_000_000_000,
  })
  assert.match(receipt.receiptSha256, /^[0-9a-f]{64}$/u)
  assert.equal(receipt.generatedAt, '2023-11-14T22:13:20.000Z')
  assert.throws(
    () => buildSyntheticSmokeReceipt({ ...receipt, duplicateJobCount: 1 }),
    /duplicate jobs/u,
  )
  assert.throws(
    () => buildSyntheticSmokeReceipt({ ...receipt, confirmAcceptanceMs: 8_001 }),
    /confirmation acceptance exceeded 8 seconds: 8001ms/u,
  )
})

test('confirm acceptance tolerates real Production write-path latency on a fresh candidate', () => {
  const receipt = buildSyntheticSmokeReceipt({
    releaseId,
    environment: 'production',
    cohortId,
    runId: 'run-17',
    sequence: 1,
    scenarios: { autoQuote: true, rfqOrInspection: true, recovery: true },
    releaseIdentityMatch: true,
    terminalReconcilePassed: true,
    syntheticLeakCount: 0,
    duplicateJobCount: 0,
    duplicateBroadcastCount: 0,
    safeErrorCodeRatio: 1,
    // Observed against real Production even with the throwaway warm-up confirm already run.
    confirmAcceptanceMs: 4_938,
    workerOfferVisibleMs: 2_600,
    supportTraceCount: 14,
    now: 1_700_000_000_000,
  })
  assert.match(receipt.receiptSha256, /^[0-9a-f]{64}$/u)
  assert.throws(
    () => buildSyntheticSmokeReceipt({ ...receipt, confirmAcceptanceMs: 8_001 }),
    /confirmation acceptance exceeded 8 seconds: 8001ms/u,
  )
})

test('worker offer visibility tolerates the once-a-minute matching-maintainer cron tick', () => {
  const receipt = buildSyntheticSmokeReceipt({
    releaseId,
    environment: 'production',
    cohortId,
    runId: 'run-16',
    sequence: 1,
    scenarios: { autoQuote: true, rfqOrInspection: true, recovery: true },
    releaseIdentityMatch: true,
    terminalReconcilePassed: true,
    syntheticLeakCount: 0,
    duplicateJobCount: 0,
    duplicateBroadcastCount: 0,
    safeErrorCodeRatio: 1,
    confirmAcceptanceMs: 1_100,
    // Observed against real Production: a confirmation landing just after a kael-matching-maintainer
    // pg_cron tick waited close to a full minute for the next one.
    workerOfferVisibleMs: 13_155,
    supportTraceCount: 14,
    now: 1_700_000_000_000,
  })
  assert.match(receipt.receiptSha256, /^[0-9a-f]{64}$/u)
  assert.throws(
    () => buildSyntheticSmokeReceipt({ ...receipt, workerOfferVisibleMs: 80_001 }),
    /worker offer visibility exceeded 80 seconds: 80001ms/u,
  )
})

test('Staging observations preserve functional gates without applying a per-run SLO', () => {
  const observation = buildSyntheticSmokeObservation({
    releaseId,
    environment: 'staging',
    cohortId,
    runId: 'staging-run-15',
    sequence: 15,
    scenarios: { autoQuote: true, rfqOrInspection: true, recovery: true },
    releaseIdentityMatch: true,
    terminalReconcilePassed: true,
    syntheticLeakCount: 0,
    duplicateJobCount: 0,
    duplicateBroadcastCount: 0,
    safeErrorCodeRatio: 1,
    confirmAcceptanceMs: 5_929,
    workerOfferVisibleMs: 9_500,
    supportTraceCount: 14,
    now: 1_700_000_000_000,
  })
  assert.equal(observation.confirmAcceptanceMs, 5_929)
  assert.match(observation.observationSha256, /^[0-9a-f]{64}$/u)
  assert.throws(
    () => buildSyntheticSmokeReceipt({ ...observation, environment: 'staging' }),
    /reserved for Production/u,
  )
  assert.throws(
    () => buildSyntheticSmokeObservation({ ...observation, duplicateBroadcastCount: 1 }),
    /duplicate broadcasts/u,
  )
})

function governedPriceSource(domain, url) {
  return {
    domain,
    url,
    observed_at: '2026-08-23',
    unit: 'VND/job',
    signals: {
      identity_verified: true,
      hcmc_relevant: true,
      clear_price_and_unit: true,
      integrity_verified: true,
      review_overdue: false,
      price_jump_suspected: false,
    },
  }
}
