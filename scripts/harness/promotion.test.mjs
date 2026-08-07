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

const config = JSON.parse(readFileSync(resolve('config/harness/promotion.json'), 'utf8'))
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

test('rejects secret-shaped incident evidence', () => {
  assert.throws(() => sanitizePromotionEvidence({ authorization: 'Bearer abc' }), /not allowed/)
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
  const databaseTypesSha256 = overrides.databaseTypesSha256 ?? '5'.repeat(64)
  const migrationEntry = {
    version: '20260101000000',
    name: 'fixture',
    file: 'supabase/migrations/20260101000000_fixture.sql',
    sha256: '0'.repeat(64),
  }
  const value = {
    schemaVersion: '1.0.0',
    releaseId: `harness-${gitSeed.repeat(12)}-${behaviorSeed.repeat(12)}`,
    environment: 'staging',
    gitSha: gitSeed.repeat(40),
    manifestSha256: '3'.repeat(64),
    migrationInventorySha256: '4'.repeat(64),
    databaseTypesSha256,
    promptBundleSha256: '6'.repeat(64),
    policyBundleSha256: '7'.repeat(64),
    runtimeConfigurationSha256: '0'.repeat(64),
    evaluationSuiteVersion: 'harness-eval.1.0.0',
    evaluationSuiteSha256: '8'.repeat(64),
    capabilityRegistrySha256: '9'.repeat(64),
    accessMatrixSha256: 'a'.repeat(64),
    reliabilityPolicySha256: 'b'.repeat(64),
    promotionPolicySha256: 'c'.repeat(64),
    environmentBinding: {
      providerConfigurationClass: 'staging-isolated',
      webhookConfigurationClass: 'staging-sandbox',
    },
    migrationInventory: {
      version: '1.0.0',
      migrationCount: 1,
      migrationsSha256: sha256(`${migrationEntry.version}:${migrationEntry.name}:${migrationEntry.sha256}\n`),
      databaseTypes: { sha256: databaseTypesSha256 },
      entries: [migrationEntry],
    },
    edgeFunctions: { 'mobile-api': 'd'.repeat(64) },
    edgeFunctionInputs: { 'mobile-api': ['supabase/functions/mobile-api/index.ts'] },
    verificationRequirements: Array.from({ length: 10 }, (_, index) => `gate-${index + 1}`),
    rollbackPolicy: {
      historicalMigrationsImmutable: true,
      schemaCorrectionMode: 'forward-migration',
      compatibilityStrategy: 'expand-contract',
    },
    bundleSha256: '',
    ...overrides,
  }
  if (overrides.databaseTypesSha256) {
    value.migrationInventory = {
      ...value.migrationInventory,
      databaseTypes: { sha256: overrides.databaseTypesSha256 },
    }
  }
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
