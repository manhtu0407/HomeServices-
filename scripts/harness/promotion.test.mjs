import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  buildPromotionPacket,
  buildRollbackPacket,
  canTransition,
  evaluateAbortThresholds,
  loadPlan55ProductionOnlyPolicy,
  requiredPromotionGates,
  releaseCompatibilityProblems,
  resolvePromotionPath,
  sanitizePromotionEvidence,
  simulateCanaryDecision,
  validatePromotionConfig,
  verifyPromotionPacket,
} from './promotion.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'

const config = JSON.parse(readFileSync(resolve('config/harness/promotion.json'), 'utf8'))

test('promotion CLI paths reject traversal and links escaping the repository root', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'plan55-promotion-root-'))
  const outside = mkdtempSync(join(tmpdir(), 'plan55-promotion-outside-'))
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })
  mkdirSync(join(root, '.scratch'))
  writeFileSync(join(outside, 'release.json'), '{}\n')
  symlinkSync(outside, join(root, 'outside-link'), process.platform === 'win32' ? 'junction' : 'dir')

  assert.throws(() => resolvePromotionPath('../plan55-promotion-outside/release.json', { root }), /outside the repository/u)
  assert.throws(() => resolvePromotionPath('outside-link/release.json', { root }), /outside the repository/u)
  assert.throws(() => resolvePromotionPath('outside-link/packet.json', { root, mustExist: false }), /outside the repository/u)
  assert.equal(resolvePromotionPath('.scratch/packet.json', { root, mustExist: false }), join(root, '.scratch', 'packet.json'))
})

function plan55HostedBeforeBytes(policy) {
  const inventory = JSON.parse(readFileSync(resolve('config/harness/migration-inventory.json'), 'utf8'))
  return Buffer.from(`${JSON.stringify({
    environment: 'production',
    projectRef: policy.projectRef,
    releaseId: policy.productionSourceBase.releaseId,
    gitSha: policy.productionSourceBase.sha,
    releaseLane: 'verification',
    clientCompatibility: {
      gitSha: policy.productionSourceBase.sha,
      releaseId: policy.productionSourceBase.releaseId,
      contractEpoch: 2,
      ios: {
        applicationId: 'com.phanmanhtu.homeservices', minimumBuildNumber: 45,
        easBuildId: '11111111-1111-4111-8111-111111111111', runtimeVersion: '0.2.0',
      },
      android: {
        applicationId: 'com.phanmanhtu.nestscout', minimumBuildNumber: 4,
        easBuildId: '22222222-2222-4222-8222-222222222222', runtimeVersion: '0.2.0',
      },
    },
    migrations: inventory.entries.slice(0, 3).map(({ version, name }) => ({ version, name })),
  }, null, 2)}\n`)
}

function plan55GateReceipts(policy, release, gates, targetState) {
  return Object.fromEntries(gates.map((gate, index) => {
    const receipt = {
      schemaVersion: 'plan55-gate-evidence.v1',
      gate,
      status: 'PASS',
      environment: 'production',
      projectRef: policy.projectRef,
      policyId: policy.policyId,
      policySha256: policy.policySha256,
      releaseId: release.releaseId,
      sourceSha: release.gitSha,
      targetState,
      evidence: { path: 'evidence.json', sha256: String(index + 1).padStart(64, '0') },
      provenance: {
        repository: policy.repository,
        workflowPath: '.github/workflows/plan55-production-only.yml',
        runId: String(100 + index),
        runAttempt: 1,
        workflowHeadSha: release.gitSha,
        artifactId: 200 + index,
        artifactName: `plan55-gate-${index}`,
        artifactDigest: `sha256:${'f'.repeat(64)}`,
      },
    }
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
    return [gate, {
      receipt,
      receiptSha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),
      receiptFileSha256: createHash('sha256').update(receiptBytes).digest('hex'),
      evidenceSha256: receipt.evidence.sha256,
    }]
  }))
}
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

test('Plan 55 has a separate fail-closed Production-only transition policy with no Staging path', () => {
  const policy = loadPlan55ProductionOnlyPolicy(resolve('.'))
  assert.deepEqual(validatePromotionConfig(policy, { root: resolve('.') }), [])
  assert.equal(policy.projectRef, 'iwevizmsedyqozxlawwl')
  assert.equal(policy.repository, 'manhtu0407/HomeServices-')
  assert.deepEqual(policy.trustedEvidenceWorkflowPaths, [
    '.github/workflows/ci.yml',
    '.github/workflows/plan55-production-only.yml',
    '.github/workflows/plan55-production-canary-service.yml',
  ])
  assert.ok(validatePromotionConfig({
    ...policy,
    trustedEvidenceWorkflowPaths: ['.github/workflows/not-present.yml'],
  }, { root: resolve('.') }).some((problem) => problem.includes('trusted evidence workflow is missing')))
  assert.deepEqual(policy.productionSourceBase, {
    branch: 'codex/plan55-production-base-891b1e26-review-v2',
    sha: '891b1e26dd9a785f05671002c5e74cb270678be4',
    releaseId: 'harness-891b1e26dd9a-8c7eb92a4783',
  })
  assert.ok(!policy.requiredGatesByTarget.verified.includes('main-branch-merge'))
  assert.ok(policy.requiredGatesByTarget.verified.includes('plan55-exact-production-base-ancestry'))
  assert.deepEqual(policy.serviceOrder, ['hvac', 'handyman', 'cleaning', 'upholstery', 'plumbing', 'electrical'])
  assert.equal(policy.slicesPerService, 8)
  assert.equal(policy.casesPerSlice, 12)
  assert.equal(policy.serviceConcurrency, 1)
  assert.equal(policy.globalServiceFlags, 'absent')
  assert.equal(policy.realCustomerTraffic, false)
  assert.equal(canTransition(policy, 'verified', 'staging'), false)
  assert.equal(canTransition(policy, 'verified', 'guard_deployed_off'), true)
  assert.equal(canTransition(policy, 'paired_wave_3', 'production'), true)
  assert.equal(canTransition(policy, 'service_canary', 'paired_wave_1'), false)
  for (const wave of [1, 2, 3]) {
    assert.ok(policy.requiredGatesByTarget[`paired_wave_${wave}`].includes(`plan55-paired-wave-${wave}-pass`))
    assert.ok(requiredPromotionGates(policy, 'production').includes(`plan55-paired-wave-${wave}-pass`))
  }
  assert.ok(policy.requiredGatesByTarget.production.includes('plan55-post-rollout-cohort-pass'))
  const missingHoldoutGate = {
    ...policy,
    requiredGatesByTarget: {
      ...policy.requiredGatesByTarget,
      verified: policy.requiredGatesByTarget.verified.filter((gate) => gate !== 'plan55-independent-holdout-freeze'),
    },
  }
  assert.ok(validatePromotionConfig(missingHoldoutGate).includes(
    'Plan 55 target is missing required gate: verified:plan55-independent-holdout-freeze',
  ))
  const mutableBase = {
    ...policy,
    productionSourceBase: { ...policy.productionSourceBase, sha: '0'.repeat(40) },
  }
  assert.ok(validatePromotionConfig(mutableBase).includes(
    'Plan 55 exact Production source base is invalid',
  ))
  const staleBaseBranch = {
    ...policy,
    productionSourceBase: { ...policy.productionSourceBase, branch: 'codex/plan55-production-base-645c907e' },
  }
  assert.ok(validatePromotionConfig(staleBaseBranch).includes(
    'Plan 55 exact Production source base is invalid',
  ))
  const missingAncestryGate = {
    ...policy,
    requiredGatesByTarget: {
      ...policy.requiredGatesByTarget,
      verified: policy.requiredGatesByTarget.verified.filter((gate) => gate !== 'plan55-exact-production-base-ancestry'),
    },
  }
  assert.ok(validatePromotionConfig(missingAncestryGate).includes(
    'Plan 55 target is missing required gate: verified:plan55-exact-production-base-ancestry',
  ))
})

test('Plan 55 promotion packets bind every target gate to source-bound evidence receipts', () => {
  const policy = loadPlan55ProductionOnlyPolicy(resolve('.'))
  const plan55Release = buildHarnessRelease({
    environment: 'production',
    gitSha: '9'.repeat(40),
    lane: 'plan55-production-only',
    requireCleanWorktree: false,
    providerReadiness: releaseTemplate.providerReadiness,
    hostedBeforeBytes: plan55HostedBeforeBytes(policy),
  })
  const plan55Evaluation = {
    ...evaluation,
    suiteVersion: plan55Release.evaluationSuiteVersion,
    release: plan55Release,
    versions: {
      promptBundleSha256: plan55Release.promptBundleSha256,
      policyBundleSha256: plan55Release.policyBundleSha256,
      toolManifestSha256: plan55Release.manifestSha256,
      capabilityRegistrySha256: plan55Release.capabilityRegistrySha256,
    },
  }
  const passedGates = policy.requiredGatesByTarget.verified
  const gateReceipts = plan55GateReceipts(policy, plan55Release, passedGates, 'verified')
  const packet = buildPromotionPacket({
    root: resolve('.'), config: policy, release: plan55Release, evaluation: plan55Evaluation,
    environment: 'production', currentState: 'assembled', targetState: 'verified',
    passedGates, gateReceipts, now: 0,
  })
  assert.equal(packet.policyId, 'plan55-production-only')
  assert.equal(packet.policySha256, policy.policySha256)
  assert.deepEqual(packet.passedGates, [...passedGates].sort())
  assert.deepEqual(verifyPromotionPacket(packet, policy), [])
  const changedPolicy = resealPacket({ ...packet, policySha256: '0'.repeat(64) })
  assert.match(verifyPromotionPacket(changedPolicy, policy).join('; '), /policy binding/u)
  assert.throws(() => buildPromotionPacket({
    root: resolve('.'), config: policy, release: plan55Release, evaluation: plan55Evaluation,
    environment: 'production', currentState: 'assembled', targetState: 'verified',
    passedGates: passedGates.slice(1), gateReceipts, now: 0,
  }), /missing required release gate/u)
  assert.throws(() => buildPromotionPacket({
    root: resolve('.'), config: policy, release: plan55Release, evaluation: plan55Evaluation,
    environment: 'production', currentState: 'assembled', targetState: 'verified',
    passedGates, gateReceipts: { ...gateReceipts, [passedGates[0]]: { ...gateReceipts[passedGates[0]], receiptSha256: 'not-a-digest' } }, now: 0,
  }), /valid source-bound receipt/u)
  const firstGate = passedGates[0]
  const staleReceipt = { ...gateReceipts[firstGate].receipt, sourceSha: 'b'.repeat(40) }
  const staleRecord = {
    ...gateReceipts[firstGate],
    receipt: staleReceipt,
    receiptSha256: createHash('sha256').update(JSON.stringify(staleReceipt)).digest('hex'),
  }
  const stalePacket = resealPacket({
    ...packet,
    gateReceipts: { ...packet.gateReceipts, [firstGate]: staleRecord },
  })
  assert.match(verifyPromotionPacket(stalePacket, policy).join('; '), /gate evidence receipt is invalid/u)
  const alteredReceiptFileDigest = {
    ...gateReceipts[firstGate],
    receiptFileSha256: 'd'.repeat(64),
  }
  const alteredDigestPacket = resealPacket({
    ...packet,
    gateReceipts: { ...packet.gateReceipts, [firstGate]: alteredReceiptFileDigest },
  })
  assert.match(verifyPromotionPacket(alteredDigestPacket, policy).join('; '), /gate evidence receipt is invalid/u)
  const missingReceiptPacket = resealPacket({
    ...packet,
    gateReceipts: {
      ...packet.gateReceipts,
      [firstGate]: { receiptSha256: 'a'.repeat(64), receiptFileSha256: 'b'.repeat(64), evidenceSha256: 'c'.repeat(64) },
    },
  })
  assert.match(verifyPromotionPacket(missingReceiptPacket, policy).join('; '), /gate evidence receipt is invalid/u)
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
