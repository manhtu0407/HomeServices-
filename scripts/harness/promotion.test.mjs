import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildPromotionPacket,
  buildRollbackPacket,
  canTransition,
  evaluateAbortThresholds,
  releaseCompatibilityProblems,
  sanitizePromotionEvidence,
  simulateCanaryDecision,
  validatePromotionConfig,
  verifyPromotionPacket,
} from './promotion.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'

const config = JSON.parse(readFileSync(resolve('config/harness/promotion.json'), 'utf8'))
const releaseTemplate = buildHarnessRelease({
  environment: 'staging',
  gitSha: 'f'.repeat(40),
  requireCleanWorktree: false,
  providerReadiness: {
    android_fcm_v1: true,
    anthropic: true,
    deepseek: false,
    durable_guards: true,
    global_ai_enabled: true,
    ios_apns: true,
    perplexity: true,
    push_receipt_reconciler: true,
    vietmap: true,
  },
})
const release = fakeRelease('a', 'b')
const rollbackRelease = fakeRelease('1', '2', {
  migrationInventorySha256: release.migrationInventorySha256,
  databaseTypesSha256: release.databaseTypesSha256,
})
const evaluation = {
  reportId: 'report-1',
  suiteVersion: release.evaluationSuiteVersion,
  status: 'passed',
  release,
  versions: {
    promptBundleSha256: release.promptBundleSha256,
    policyBundleSha256: release.policyBundleSha256,
    toolManifestSha256: release.manifestSha256,
    capabilityRegistrySha256: release.capabilityRegistrySha256,
  },
  metrics: {
    critical_safety_failures: 0,
    authorization_bypass_failures: 0,
    confirmation_bypass_failures: 0,
    error_rate: 0,
    p95_latency_regression: 0,
    cost_regression: 0,
  },
}

test('validates transition, runbook, kill-switch, and SLO policy', () => {
  assert.deepEqual(validatePromotionConfig(config, { root: resolve('.') }), [])
  assert.equal(canTransition(config, 'verified', 'staging'), true)
  assert.equal(canTransition(config, 'assembled', 'production'), false)
})

test('blocks a canary when a critical threshold fails', () => {
  const result = evaluateAbortThresholds(config, {
    ...evaluation.metrics,
    confirmation_bypass_failures: 1,
  })
  assert.equal(result.passed, false)
  assert.equal(result.failures[0].metric, 'confirmation_bypass_failures')
})


test('fails closed when an abort-threshold metric is missing', () => {
  const metrics = { ...evaluation.metrics }
  delete metrics.error_rate
  const result = evaluateAbortThresholds(config, metrics)
  assert.equal(result.passed, false)
  assert.deepEqual(
    result.failures.find((failure) => failure.metric === 'error_rate'),
    {
      metric: 'error_rate',
      threshold: config.abort_thresholds.error_rate,
      actual: null,
      status: 'metric_missing',
      passed: false,
    },
  )
})

test('simulates a canary abort with containment for a critical failure', () => {
  const decision = simulateCanaryDecision(config, {
    ...evaluation.metrics,
    authorization_bypass_failures: 1,
  })
  assert.equal(decision.action, 'abort')
  assert.deepEqual(decision.containmentSwitches, ['global_ai'])
})

test('builds and verifies an approved canary packet with a compatible rollback release', () => {
  const packet = buildPromotionPacket({
    root: resolve('.'),
    config,
    release,
    evaluation,
    environment: 'staging',
    currentState: 'shadow',
    targetState: 'canary',
    humanApprovalId: 'approval-1',
    rollbackRelease,
    cohort: 'internal',
    observationWindowMinutes: 30,
    evidence: { trace_id: 'trace-1', sample_count: 5 },
    now: 0,
  })
  assert.deepEqual(verifyPromotionPacket(packet, config), [])
  assert.equal(packet.killSwitches.provider_anthropic, false)
  assert.equal(packet.rollbackReleaseId, rollbackRelease.releaseId)
  assert.equal(packet.promptBundleSha256, release.promptBundleSha256)
})

test('rejects a rollback release with incompatible schema identity', () => {
  const incompatible = fakeRelease('3', '4', { migrationInventorySha256: 'e'.repeat(64), databaseTypesSha256: 'f'.repeat(64) })
  assert.match(releaseCompatibilityProblems(release, incompatible).join('; '), /migrationInventorySha256/)
  assert.throws(() => buildPromotionPacket({
    root: resolve('.'),
    config,
    release,
    evaluation,
    environment: 'staging',
    currentState: 'shadow',
    targetState: 'canary',
    humanApprovalId: 'approval-1',
    rollbackRelease: incompatible,
  }), /incompatible/)
})

test('rejects evaluation evidence from a different prompt bundle', () => {
  assert.throws(() => buildPromotionPacket({
    root: resolve('.'),
    config,
    release,
    evaluation: {
      ...evaluation,
      versions: { ...evaluation.versions, promptBundleSha256: '9'.repeat(64) },
    },
    environment: 'staging',
    currentState: 'assembled',
    targetState: 'verified',
  }), /promptBundleSha256/)
})

test('rejects remote promotion without explicit approval', () => {
  assert.throws(() => buildPromotionPacket({
    root: resolve('.'),
    config,
    release,
    evaluation,
    environment: 'staging',
    currentState: 'verified',
    targetState: 'staging',
  }), /human approval/)
})

test('verifier rejects a remote packet without approval or an exact policy binding', () => {
  const packet = buildPromotionPacket({
    root: resolve('.'),
    config,
    release,
    evaluation,
    environment: 'staging',
    currentState: 'shadow',
    targetState: 'canary',
    humanApprovalId: 'approval-1',
    rollbackRelease,
  })
  const withoutApproval = resealPacket({ ...packet, humanApprovalId: null })
  assert.match(
    verifyPromotionPacket(withoutApproval, config).join('; '),
    /requires explicit human approval/,
  )
  const policyDrift = resealPacket({
    ...packet,
    killSwitches: { ...packet.killSwitches, global_ai: 'false' },
    abortThresholds: packet.abortThresholds.slice(1),
  })
  const problems = verifyPromotionPacket(policyDrift, config).join('; ')
  assert.match(problems, /kill switch is invalid: global_ai/)
  assert.match(problems, /abort thresholds do not match policy/)
})

test('rejects secret-shaped incident evidence', () => {
  assert.throws(() => sanitizePromotionEvidence({ authorization: 'Bearer abc' }), /not allowed/)
  assert.throws(() => sanitizePromotionEvidence({ message: 'customer supplied text' }), /not allowed/)
  assert.throws(() => sanitizePromotionEvidence({ note: 'eyJaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaa' }), /secret-shaped/)
})

test('builds a deterministic rollback control packet', () => {
  const packet = buildRollbackPacket({
    failedRelease: release,
    rollbackRelease,
    reasonCode: 'AUTHORIZATION_REGRESSION',
    humanApprovalId: 'approval-2',
    containmentSwitches: ['global_ai', 'provider_anthropic', 'global_ai'],
    evidence: { incident_id: 'incident-1' },
    now: 0,
  })
  assert.deepEqual(packet.containmentSwitches, ['global_ai', 'provider_anthropic'])
  assert.equal(packet.rollbackReleaseId, rollbackRelease.releaseId)
  assert.match(packet.packetSha256, /^[0-9a-f]{64}$/)
})

function fakeRelease(gitSeed, behaviorSeed, overrides = {}) {
  const value = {
    ...JSON.parse(JSON.stringify(releaseTemplate)),
    releaseId: '',
    bundleSha256: '',
    gitSha: gitSeed.repeat(40),
    sourceBundleSha256: sha256(`fixture-source:${behaviorSeed}`),
    ...overrides,
  }
  if (overrides.databaseTypesSha256) {
    value.migrationInventory = {
      ...value.migrationInventory,
      databaseTypes: { sha256: overrides.databaseTypesSha256 },
    }
  }
  const behaviorHash = sha256(canonicalJson({ ...value, releaseId: undefined, bundleSha256: undefined }))
  value.releaseId = `harness-${value.gitSha.slice(0, 12)}-${behaviorHash.slice(0, 12)}`
  value.bundleSha256 = sha256(canonicalJson({ ...value, bundleSha256: undefined }))
  return Object.freeze(value)
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function resealPacket(packet) {
  const resealed = { ...packet, packetSha256: '' }
  resealed.packetSha256 = sha256(JSON.stringify({ ...resealed, packetSha256: undefined }))
  return resealed
}
