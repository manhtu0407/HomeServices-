import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const COHORT_ID = /^synthetic-stage1-[0-9a-f]{12}-[0-9a-f]{12}-[A-Za-z0-9_-]{1,48}$/u
const INTERNAL_ACTOR_PRESENTATION = /\b(?:cohort|harness|native\s+(?:customer|worker)|production|stage\s*\d+|staging|synthetic|test)\b|kỹ\s*thuật\s*viên/iu

export function isSyntheticActorPresentationSafe(value) {
  return nonEmptyString(value) && !INTERNAL_ACTOR_PRESENTATION.test(value.trim())
}

export function assertResponseIdentity(headers, expectedReleaseId) {
  const identity = {
    releaseId: headers.get('x-release-id'),
    traceId: headers.get('x-trace-id'),
    runId: headers.get('x-run-id'),
    operationId: headers.get('x-operation-id'),
    supportCode: headers.get('x-support-code'),
  }
  if (!RELEASE_ID.test(expectedReleaseId ?? '') || identity.releaseId !== expectedReleaseId) {
    throw new Error('release identity mismatch')
  }
  if (!UUID.test(identity.traceId ?? '') || !UUID.test(identity.runId ?? '') ||
      !UUID.test(identity.operationId ?? '') || !/^[A-Z0-9]{8}$/u.test(identity.supportCode ?? '')) {
    throw new Error('response lineage or support code is missing')
  }
  return identity
}

export function assertSafeErrorEvidence(actual, expected) {
  if (!expected || !Number.isSafeInteger(expected.status) || !nonEmptyString(expected.code) ||
      !nonEmptyString(expected.surface)) {
    throw new Error('safe error expectation is invalid')
  }
  if (actual?.status !== expected.status || actual?.code !== expected.code ||
      !/^[A-Z0-9]{8}$/u.test(actual?.supportCode ?? '') || !UUID.test(actual?.traceId ?? '')) {
    throw new Error(`response did not prove expected safe error ${expected.code}`)
  }
  return Object.freeze({
    surface: expected.surface,
    status: actual.status,
    code: actual.code,
    supportCode: actual.supportCode,
    traceId: actual.traceId,
  })
}

export function assertScenarioReady(response, expectedMode) {
  const session = response?.session
  const coverage = session?.intake_coverage
  if (!session || !coverage || session.quote_mode !== expectedMode || coverage.quote_mode !== expectedMode) {
    const actual = {
      sessionQuoteMode: session?.quote_mode ?? null,
      coverageQuoteMode: coverage?.quote_mode ?? null,
      status: session?.status ?? null,
      nextAction: session?.next_action ?? null,
      confirmationStatus: session?.intake_confirmation?.status ?? null,
      policyVersion: coverage?.policy_version ?? null,
      orderEligible: coverage?.order_eligible ?? null,
      missingRequiredFields: Array.isArray(coverage?.missing_required_fields)
        ? coverage.missing_required_fields.filter((field) => typeof field === 'string')
        : null,
    }
    throw new Error(`Stage 1 response did not resolve expected quote mode ${expectedMode}; actual=${JSON.stringify(actual)}`)
  }
  if (coverage.order_eligible !== true || coverage.safety_blocker !== null ||
      !Array.isArray(coverage.missing_required_fields) || coverage.missing_required_fields.length !== 0 ||
      !Number.isSafeInteger(coverage.policy_version) || coverage.policy_version < 1) {
    throw new Error(`Stage 1 ${expectedMode} intake is not order eligible`)
  }
  const expected = expectedMode === 'kael_auto_quote'
    ? ['priced_offer', 'offer_review']
    : expectedMode === 'rfq'
      ? ['rfq_request', 'rfq_review']
      : expectedMode === 'inspection_only'
        ? ['inspection_request', 'inspection_review']
        : null
  if (!expected || coverage.confirmation_kind !== expected[0] || coverage.next_action !== expected[1]) {
    throw new Error(`Stage 1 ${expectedMode} confirmation contract is inconsistent`)
  }
  if (expectedMode === 'kael_auto_quote') {
    const estimate = session.estimate
    const receiptId = estimate?.price_reasoning_receipt?.receipt_id
    if (!Number.isSafeInteger(estimate?.price_min) || estimate.price_min <= 0 ||
        !Number.isSafeInteger(estimate?.price_max) || estimate.price_max < estimate.price_min ||
        typeof receiptId !== 'string' || receiptId.length < 8) {
      throw new Error('auto-quote is missing validated positive price evidence')
    }
    return { confirmationKind: expected[0], priceReasoningReceiptId: receiptId, coverage }
  }
  if (session.estimate !== null && session.estimate !== undefined) {
    throw new Error(`${expectedMode === 'rfq' ? 'RFQ' : 'inspection'} must not expose a price estimate`)
  }
  return { confirmationKind: expected[0], priceReasoningReceiptId: null, coverage }
}

export function priceEvidenceHasQuorum(value) {
  if (!isRecord(value) || value.schema_version !== 'baseline_price_evidence.v1' ||
      !Array.isArray(value.sources)) {
    return false
  }
  const domains = new Set()
  for (const source of value.sources) {
    if (!isRecord(source) || !nonEmptyString(source.domain) || !nonEmptyString(source.url) ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(source.observed_at ?? '') || !nonEmptyString(source.unit) ||
        !isRecord(source.signals) || source.signals.identity_verified !== true ||
        source.signals.hcmc_relevant !== true || source.signals.clear_price_and_unit !== true ||
        source.signals.integrity_verified !== true || source.signals.review_overdue !== false ||
        source.signals.price_jump_suspected !== false) {
      return false
    }
    domains.add(source.domain.trim())
  }
  return domains.size >= 2
}

export async function pollUntil(read, predicate, options = {}) {
  const attempts = options.attempts ?? 30
  const intervalMs = options.intervalMs ?? 1_000
  if (!Number.isSafeInteger(attempts) || attempts < 1 || !Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error('polling bounds are invalid')
  }
  const started = performance.now()
  let value
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    value = await read(attempt)
    if (predicate(value)) return { value, attempts: attempt, durationMs: Math.round(performance.now() - started) }
    if (attempt < attempts && intervalMs > 0) await delay(intervalMs)
  }
  throw new Error('workflow did not reach the required state within the bounded poll')
}

export function buildSyntheticSmokeReceipt(input) {
  const observation = buildSyntheticSmokeObservation(input)
  if (observation.environment !== 'production') {
    throw new Error('strict synthetic smoke receipts are reserved for Production promotion')
  }
  if (!boundedInteger(observation.confirmAcceptanceMs, 0, 3_000)) {
    throw new Error(`confirmation acceptance exceeded 3 seconds: ${String(observation.confirmAcceptanceMs)}ms`)
  }
  if (!boundedInteger(observation.workerOfferVisibleMs, 0, 10_000)) {
    throw new Error(`worker offer visibility exceeded 10 seconds: ${String(observation.workerOfferVisibleMs)}ms`)
  }
  const receipt = {
    schemaVersion: '1.0.0',
    releaseId: observation.releaseId,
    environment: observation.environment,
    cohortId: observation.cohortId,
    runId: observation.runId,
    sequence: observation.sequence,
    scenarios: observation.scenarios,
    releaseIdentityMatch: observation.releaseIdentityMatch,
    terminalReconcilePassed: observation.terminalReconcilePassed,
    syntheticLeakCount: observation.syntheticLeakCount,
    duplicateJobCount: observation.duplicateJobCount,
    duplicateBroadcastCount: observation.duplicateBroadcastCount,
    safeErrorCodeRatio: observation.safeErrorCodeRatio,
    confirmAcceptanceMs: observation.confirmAcceptanceMs,
    workerOfferVisibleMs: observation.workerOfferVisibleMs,
    supportTraceCount: observation.supportTraceCount,
    generatedAt: observation.generatedAt,
    receiptSha256: '',
  }
  receipt.receiptSha256 = syntheticSmokeReceiptSha256(receipt)
  return receipt
}

export function buildSyntheticSmokeObservation(input) {
  if (!RELEASE_ID.test(input?.releaseId ?? '') || !['staging', 'production'].includes(input?.environment) ||
      !COHORT_ID.test(input?.cohortId ?? '') || !/^[A-Za-z0-9_.:-]{1,120}$/u.test(input?.runId ?? '') ||
      !Number.isSafeInteger(input?.sequence) || input.sequence < 1 || input.sequence > 20) {
    throw new Error('synthetic smoke observation identity is invalid')
  }
  if (input.scenarios?.autoQuote !== true || input.scenarios?.rfqOrInspection !== true || input.scenarios?.recovery !== true) {
    throw new Error('all Stage 1 synthetic scenarios must pass')
  }
  if (input.releaseIdentityMatch !== true || input.terminalReconcilePassed !== true) {
    throw new Error('release identity and terminal reconciliation must pass')
  }
  if (input.syntheticLeakCount !== 0) throw new Error('synthetic records leaked into a real surface')
  if (input.duplicateJobCount !== 0) throw new Error('duplicate jobs were observed')
  if (input.duplicateBroadcastCount !== 0) throw new Error('duplicate broadcasts were observed')
  if (input.safeErrorCodeRatio !== 1) throw new Error('not every error response carried a safe support code')
  if (!boundedInteger(input.confirmAcceptanceMs, 0, 120_000)) throw new Error('confirmation latency observation is invalid')
  if (!boundedInteger(input.workerOfferVisibleMs, 0, 120_000)) throw new Error('worker offer latency observation is invalid')
  if (!boundedInteger(input.supportTraceCount, 1, Number.MAX_SAFE_INTEGER)) throw new Error('support trace evidence is missing')
  const observation = {
    schemaVersion: 'stage1-synthetic-smoke-observation.v1',
    releaseId: input.releaseId,
    environment: input.environment,
    cohortId: input.cohortId,
    runId: input.runId,
    sequence: input.sequence,
    scenarios: {
      autoQuote: true,
      rfqOrInspection: true,
      recovery: true,
    },
    releaseIdentityMatch: true,
    terminalReconcilePassed: true,
    syntheticLeakCount: 0,
    duplicateJobCount: 0,
    duplicateBroadcastCount: 0,
    safeErrorCodeRatio: 1,
    confirmAcceptanceMs: input.confirmAcceptanceMs,
    workerOfferVisibleMs: input.workerOfferVisibleMs,
    supportTraceCount: input.supportTraceCount,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    observationSha256: '',
  }
  observation.observationSha256 = sha256(syntheticSmokeObservationChecksumPayload(observation))
  return observation
}

export function verifySyntheticSmokeObservationChecksum(observation) {
  return typeof observation?.observationSha256 === 'string' &&
    observation.observationSha256 === sha256(syntheticSmokeObservationChecksumPayload(observation))
}

export function syntheticSmokeObservationChecksumPayload(observation) {
  return syntheticSmokeReceiptChecksumPayload(observation)
}

export function syntheticSmokeReceiptSha256(receipt) {
  return sha256(syntheticSmokeReceiptChecksumPayload(receipt))
}

export function verifySyntheticSmokeReceiptChecksum(receipt) {
  return typeof receipt?.receiptSha256 === 'string' &&
    receipt.receiptSha256 === syntheticSmokeReceiptSha256(receipt)
}

export function syntheticSmokeReceiptChecksumPayload(receipt) {
  return [
    receipt?.schemaVersion,
    receipt?.releaseId,
    receipt?.environment,
    receipt?.cohortId,
    receipt?.runId,
    receipt?.sequence,
    receipt?.scenarios?.autoQuote,
    receipt?.scenarios?.rfqOrInspection,
    receipt?.scenarios?.recovery,
    receipt?.releaseIdentityMatch,
    receipt?.terminalReconcilePassed,
    receipt?.syntheticLeakCount,
    receipt?.duplicateJobCount,
    receipt?.duplicateBroadcastCount,
    receipt?.safeErrorCodeRatio,
    receipt?.confirmAcceptanceMs,
    receipt?.workerOfferVisibleMs,
    receipt?.supportTraceCount,
    receipt?.generatedAt,
  ].map((value) => String(value)).join('\n')
}

function boundedInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
