import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { inspectPlan55GateEvidenceCoverage } from './plan55-gate-receipts.mjs'
import {
  buildPromotionPacket,
  buildPlan55PublicationPacketProof,
  buildRollbackPacket,
  canTransition,
  evaluateAbortThresholds,
  loadPlan55ProductionOnlyPolicy,
  requiredPromotionGates,
  releaseCompatibilityProblems,
  resolvePromotionPath,
  resolvePlan55PairedWavePreregistration,
  sanitizePromotionEvidence,
  serializePromotionPacket,
  simulateCanaryDecision,
  validatePromotionConfig,
  verifyPromotionPacket,
} from './promotion.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'

const config = JSON.parse(readFileSync(resolve('config/harness/promotion.json'), 'utf8'))

test('Plan 55 gate producer source contains no duplicate JSON keys', () => {
  const policySource = readFileSync(resolve('config/harness/plan55-production-only-policy.json'), 'utf8')
  const producerMap = /"trustedEvidenceWorkflowPathsByGate"\s*:\s*\{([\s\S]*?)^[ \t]*\},/mu.exec(policySource)
  assert.ok(producerMap, 'trusted evidence producer map is present')
  const keys = [...producerMap[1].matchAll(/^[ \t]*"([^"]+)"\s*:/gmu)].map((match) => match[1])
  assert.ok(keys.length > 0, 'trusted evidence producer map is non-empty')
  assert.equal(new Set(keys).size, keys.length, 'trusted evidence producer keys are unique')
})

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
    const evidenceProof = {
      schemaVersion: 'plan55-gate-result.v1',
      gate,
      status: 'PASS',
      environment: 'production',
      projectRef: policy.projectRef,
      policyId: policy.policyId,
      policySha256: policy.policySha256,
      releaseId: release.releaseId,
      sourceSha: release.gitSha,
      targetState,
    }
    const evidenceBytes = Buffer.from(`${JSON.stringify(evidenceProof)}\n`)
    const evidenceSha256 = createHash('sha256').update(evidenceBytes).digest('hex')
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
      evidence: { path: 'evidence.json', sha256: evidenceSha256 },
      provenance: {
        repository: policy.repository,
        workflowPath: '.github/workflows/plan55-production-only.yml',
        runId: String(100 + index),
        runAttempt: 1,
        workflowHeadSha: release.gitSha,
        artifactId: 200 + index,
        artifactName: `plan55-gate-${index}`,
        artifactDigest: `sha256:${'f'.repeat(64)}`,
        artifactEvidencePath: 'evidence.json',
      },
    }
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
    return [gate, {
      receipt,
      receiptSha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),
      receiptFileSha256: createHash('sha256').update(receiptBytes).digest('hex'),
      evidenceSha256,
      evidenceProof,
    }]
  }))
}

function publicationPacketFixture(policy, release) {
  const gates = [...requiredPromotionGates(policy, 'receipts_validated')].sort()
  const gateReceipts = Object.fromEntries(gates.map((gate, index) => {
    const sourceEvidenceBytes = Buffer.from(`${JSON.stringify({ gate, status: 'PASS' })}\n`)
    const evidenceProof = {
      schemaVersion: 'plan55-gate-result.v1',
      gate,
      status: 'PASS',
      environment: 'production',
      projectRef: policy.projectRef,
      policyId: policy.policyId,
      policySha256: policy.policySha256,
      releaseId: release.releaseId,
      sourceSha: release.gitSha,
      targetState: 'receipts_validated',
    }
    const evidenceBytes = Buffer.from(`${JSON.stringify(evidenceProof)}\n`)
    const receipt = {
      schemaVersion: 'plan55-gate-evidence.v2',
      gate,
      status: 'PASS',
      environment: 'production',
      projectRef: policy.projectRef,
      policyId: policy.policyId,
      policySha256: policy.policySha256,
      releaseId: release.releaseId,
      sourceSha: release.gitSha,
      targetState: 'receipts_validated',
      evidence: {
        path: `evidence/${gate}.json`,
        sha256: createHash('sha256').update(evidenceBytes).digest('hex'),
        sourcePath: `source-results/${gate}.json`,
        sourceSha256: createHash('sha256').update(sourceEvidenceBytes).digest('hex'),
      },
      provenance: {
        repository: policy.repository,
        workflowPath: policy.trustedEvidenceWorkflowPathsByGate[gate],
        runId: '7001',
        runAttempt: 1,
        workflowHeadSha: release.gitSha,
        artifactId: 8000 + index,
        artifactName: `plan55-gate-${index}-7001-1`,
        artifactDigest: `sha256:${'f'.repeat(64)}`,
        artifactEvidencePath: `evidence/${gate}.json`,
      },
    }
    const receiptJson = JSON.stringify(receipt)
    return [gate, {
      receipt,
      receiptSha256: createHash('sha256').update(receiptJson).digest('hex'),
      receiptFileSha256: createHash('sha256').update(`${receiptJson}\n`).digest('hex'),
      evidenceSha256: receipt.evidence.sha256,
      sourceEvidenceBytes,
      evidenceProof,
    }]
  }))
  const packet = {
    schemaVersion: '1.0.0',
    environment: 'production',
    fromState: 'service_cleanup',
    toState: 'receipts_validated',
    releaseId: release.releaseId,
    gitSha: release.gitSha,
    releaseBundleSha256: release.bundleSha256,
    sourceBundleSha256: release.sourceBundleSha256,
    policyId: policy.policyId,
    policySha256: policy.policySha256,
    projectRef: policy.projectRef,
    passedGates: gates,
    gateReceipts,
    packetSha256: '',
  }
  packet.packetSha256 = createHash('sha256')
    .update(JSON.stringify({ ...packet, packetSha256: undefined })).digest('hex')
  return Buffer.from(`${JSON.stringify(packet)}\n`)
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
  assert.deepEqual(validatePromotionConfig(policy, {
    root: resolve('.'),
    targetState: 'paired_wave_1',
  }), [])
  assert.equal(policy.projectRef, 'iwevizmsedyqozxlawwl')
  assert.equal(policy.repository, 'manhtu0407/HomeServices-')
  assert.deepEqual(policy.trustedEvidenceWorkflowPaths, [
    '.github/workflows/ci.yml',
    '.github/workflows/plan55-postreceipt-finalization.yml',
    '.github/workflows/plan55-rollback-drill.yml',
  ])
  assert.equal(policy.trustedEvidenceWorkflowPathsByGate['plan55-docker-sql-edge-gates'],
    '.github/workflows/ci.yml')
  assert.ok(policy.requiredGatesByTarget.rollback_drill.includes('plan55-docker-sql-edge-gates'))
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
  assert.equal(canTransition(policy, 'receipts_validated', 'rollback_drill'), true)
  assert.equal(canTransition(policy, 'rollback_drill', 'paired_wave_1'), true)
  assert.equal(canTransition(policy, 'receipts_validated', 'paired_wave_1'), false)
  for (const wave of [1, 2, 3]) {
    assert.ok(requiredPromotionGates(policy, 'production').includes(`plan55-paired-wave-${wave}-pass`))
  }
  assert.ok(!policy.requiredGatesByTarget.paired_wave_1.includes('plan55-paired-wave-1-pass'))
  assert.ok(policy.requiredGatesByTarget.paired_wave_1.includes('plan55-rollback-drill'))
  assert.deepEqual(policy.requiredGatesByTarget.paired_wave_2, ['plan55-paired-wave-1-pass'])
  assert.deepEqual(policy.requiredGatesByTarget.paired_wave_3, ['plan55-paired-wave-2-pass'])
  const beforeFirstWave = requiredPromotionGates(policy, 'rollback_drill')
  assert.ok(beforeFirstWave.includes('plan55-rollback-preflight'))
  assert.ok(!beforeFirstWave.includes('plan55-rollback-drill'))
  assert.deepEqual(policy.requiredGatesByTarget.paired_wave_1, ['plan55-rollback-drill'])
  assert.deepEqual(requiredPromotionGates(policy, 'paired_wave_1').sort(),
    [...beforeFirstWave, 'plan55-rollback-drill'].sort())
  assert.ok(requiredPromotionGates(policy, 'paired_wave_2').includes('plan55-rollback-drill'))
  for (const [target, priorPass, currentPass] of [
    ['paired_wave_1', null, 'plan55-paired-wave-1-pass'],
    ['paired_wave_2', 'plan55-paired-wave-1-pass', 'plan55-paired-wave-2-pass'],
    ['paired_wave_3', 'plan55-paired-wave-2-pass', 'plan55-paired-wave-3-pass'],
  ]) {
    const gates = requiredPromotionGates(policy, target)
    if (priorPass) assert.ok(gates.includes(priorPass))
    assert.ok(!gates.includes(currentPass))
  }
  const cyclicWaveGate = {
    ...policy,
    requiredGatesByTarget: {
      ...policy.requiredGatesByTarget,
      paired_wave_1: [...policy.requiredGatesByTarget.paired_wave_1, 'plan55-paired-wave-1-pass'],
    },
  }
  assert.ok(validatePromotionConfig(cyclicWaveGate).includes(
    'Plan 55 target has unexpected gate: paired_wave_1:plan55-paired-wave-1-pass',
  ))
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

test('rollback drill is a wave-one prerequisite and is not duplicated in the wave-two delta', () => {
  const currentPolicy = loadPlan55ProductionOnlyPolicy(process.cwd())
  const drillPrerequisites = requiredPromotionGates(currentPolicy, 'rollback_drill')
  const firstWave = requiredPromotionGates(currentPolicy, 'paired_wave_1')
  const secondWave = requiredPromotionGates(currentPolicy, 'paired_wave_2')

  assert.ok(drillPrerequisites.includes('plan55-rollback-preflight'))
  assert.ok(!drillPrerequisites.includes('plan55-rollback-drill'))
  assert.ok(firstWave.includes('plan55-rollback-drill'))
  assert.ok(firstWave.includes('plan55-rollback-preflight'))
  assert.ok(!firstWave.includes('plan55-paired-wave-1-pass'))
  assert.ok(secondWave.includes('plan55-paired-wave-1-pass'))
  assert.ok(secondWave.includes('plan55-rollback-drill'))
  assert.deepEqual(currentPolicy.requiredGatesByTarget.paired_wave_2, ['plan55-paired-wave-1-pass'])
})

test('read-only receipt and rollback-drill packets do not require a second rollback bundle', () => {
  const policy = loadPlan55ProductionOnlyPolicy(process.cwd())
  const packet = {
    schemaVersion: '1.0.0',
    environment: 'production',
    fromState: 'service_cleanup',
    toState: 'receipts_validated',
  }

  for (const targetState of ['receipts_validated', 'rollback_drill']) {
    const problems = verifyPromotionPacket({
      ...packet,
      toState: targetState,
      fromState: targetState === 'receipts_validated' ? 'service_cleanup' : 'receipts_validated',
    }, policy)
    assert.ok(!problems.includes('promotion packet has no compatible rollback release'), targetState)
  }

  const waveProblems = verifyPromotionPacket({
    ...packet,
    fromState: 'rollback_drill',
    toState: 'paired_wave_1',
  }, policy)
  assert.ok(waveProblems.includes('promotion packet has no compatible rollback release'))
})

test('Plan 55 validates mapped producer workflows and fails closed on missing gate coverage', () => {
  const root = resolve('.')
  const policy = loadPlan55ProductionOnlyPolicy(root)
  const missingRollbackProducer = 'Plan 55 trusted evidence workflow is missing or outside the repository'

  assert.deepEqual(validatePromotionConfig(policy, { root, targetState: 'rollback_drill' }), [])
  assert.deepEqual(validatePromotionConfig(policy, { root, targetState: 'paired_wave_1' }), [])
  assert.deepEqual(validatePromotionConfig(policy, { root, targetState: 'paired_wave_2' }), [])
  assert.deepEqual(validatePromotionConfig(policy, { root }), [])
  assert.ok(validatePromotionConfig(policy, { root, targetState: 'unknown' })
    .includes('Plan 55 promotion target state is invalid'))
  const waveTwoGates = requiredPromotionGates(policy, 'paired_wave_2')
  const coverage = inspectPlan55GateEvidenceCoverage({
    policy,
    targetState: 'paired_wave_2',
    requiredGates: waveTwoGates,
  })
  assert.equal(coverage.ready, false)
  assert.ok(coverage.missingApprovedProducerGates.includes('plan55-paired-wave-1-pass'))
  const packetProblems = verifyPromotionPacket({
    schemaVersion: '1.0.0',
    environment: 'production',
    fromState: 'rollback_drill',
    toState: 'paired_wave_1',
  }, policy)
  assert.ok(!packetProblems.includes(`promotion config: ${missingRollbackProducer}`))
  assert.ok(packetProblems.includes('Plan 55 paired-wave context does not match source-locked preregistration'))
  assert.ok(verifyPromotionPacket({
    schemaVersion: '1.0.0',
    environment: 'production',
    fromState: 'receipts_validated',
    toState: 'paired_wave_1',
  }, policy).includes('promotion packet transition is invalid'))
})

test('Plan 55 promotion fails closed when a required gate has no semantic verifier', () => {
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
  assert.throws(() => buildPromotionPacket({
    root: resolve('.'), config: policy, release: plan55Release, evaluation: plan55Evaluation,
    environment: 'production', currentState: 'assembled', targetState: 'verified',
    passedGates, gateReceipts, now: 0,
  }), (error) => {
    assert.match(error.message, /gate evidence coverage is incomplete/u)
    assert.ok(error.message.includes('plan55-actor-scoped-guard-tests'))
    assert.ok(error.message.includes('plan55-independent-holdout-freeze'))
    return true
  })
})

test('publication packet proof binds an immutable receipts_validated packet to its main-branch run', () => {
  const policy = loadPlan55ProductionOnlyPolicy(resolve('.'))
  const release = buildHarnessRelease({
    environment: 'production',
    gitSha: '8'.repeat(40),
    lane: 'plan55-production-only',
    requireCleanWorktree: false,
    providerReadiness: releaseTemplate.providerReadiness,
    hostedBeforeBytes: plan55HostedBeforeBytes(policy),
  })
  const packetBytes = publicationPacketFixture(policy, release)
  const cliPacketBytes = serializePromotionPacket(JSON.parse(packetBytes.toString('utf8')))
  const input = {
    root: resolve('.'),
    policy,
    release,
    packetBytes,
    repository: policy.repository,
    sourceSha: release.gitSha,
    githubSha: release.gitSha,
    githubRef: 'refs/heads/main',
    eventName: 'workflow_dispatch',
    runId: '7002',
    runAttempt: 2,
  }
  const proof = buildPlan55PublicationPacketProof(input)

  assert.equal(proof.schemaVersion, 'plan55-publication-packet-proof.v1')
  assert.equal(proof.gate, 'plan55-publication-packet')
  assert.equal(proof.packetTargetState, 'receipts_validated')
  assert.equal(proof.sourceSha, release.gitSha)
  assert.equal(proof.releaseId, release.releaseId)
  assert.equal(proof.producerRunId, '7002')
  assert.equal(proof.producerRunAttempt, 2)
  assert.equal(proof.packetFileSha256,
    createHash('sha256').update(packetBytes).digest('hex'))
  assert.deepEqual(cliPacketBytes, packetBytes)
  assert.doesNotThrow(() => buildPlan55PublicationPacketProof({
    ...input,
    packetBytes: cliPacketBytes,
  }))
  assert.throws(() => buildPlan55PublicationPacketProof({ ...input, sourceSha: '9'.repeat(40) }),
    /producer identity is invalid/u)
  assert.throws(() => buildPlan55PublicationPacketProof({ ...input, githubRef: 'refs/heads/feature' }),
    /producer identity is invalid/u)
  assert.throws(() => buildPlan55PublicationPacketProof({ ...input, eventName: 'pull_request' }),
    /producer identity is invalid/u)
  assert.throws(() => buildPlan55PublicationPacketProof({ ...input, runAttempt: 0 }),
    /producer identity is invalid/u)

  const alteredPacket = JSON.parse(packetBytes.toString('utf8'))
  alteredPacket.toState = 'paired_wave_1'
  alteredPacket.packetSha256 = createHash('sha256')
    .update(JSON.stringify({ ...alteredPacket, packetSha256: undefined })).digest('hex')
  assert.throws(() => buildPlan55PublicationPacketProof({
    ...input,
    packetBytes: Buffer.from(`${JSON.stringify(alteredPacket)}\n`),
  }), /packet identity is invalid/u)

  const incompletePacket = JSON.parse(packetBytes.toString('utf8'))
  delete incompletePacket.gateReceipts[Object.keys(incompletePacket.gateReceipts)[0]]
  incompletePacket.packetSha256 = createHash('sha256')
    .update(JSON.stringify({ ...incompletePacket, packetSha256: undefined })).digest('hex')
  assert.throws(() => buildPlan55PublicationPacketProof({
    ...input,
    packetBytes: Buffer.from(`${JSON.stringify(incompletePacket)}\n`),
  }), /gate-inventory verification/u)

  for (const key of ['receiptSha256', 'receiptFileSha256', 'evidenceSha256']) {
    const inconsistentPacket = JSON.parse(packetBytes.toString('utf8'))
    const firstGate = Object.keys(inconsistentPacket.gateReceipts)[0]
    inconsistentPacket.gateReceipts[firstGate][key] = '0'.repeat(64)
    inconsistentPacket.packetSha256 = createHash('sha256')
      .update(JSON.stringify({ ...inconsistentPacket, packetSha256: undefined })).digest('hex')
    assert.throws(() => buildPlan55PublicationPacketProof({
      ...input,
      packetBytes: Buffer.from(`${JSON.stringify(inconsistentPacket)}\n`),
    }), /gate-inventory verification/u, key)
  }
})

test('Plan 55 paired-wave context comes only from source-locked policy preregistration', () => {
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
  const input = {
    root: resolve('.'),
    config: policy,
    release: plan55Release,
    evaluation: plan55Evaluation,
    environment: 'production',
    currentState: 'rollback_drill',
    targetState: 'paired_wave_1',
    humanApprovalId: 'approval-1',
    rollbackRelease,
  }
  const safeCohort = 'synthetic-plan55-7df85505281d69d5968170ef5816fcdc'
  assert.match(safeCohort, /^synthetic-[a-z0-9-]{8,100}$/u)
  const preregistration = {
    schemaVersion: 'plan55-paired-wave-preregistration.v1',
    cohortId: safeCohort,
    observationWindowMinutes: 60,
  }
  const callerContext = /Plan 55 preregistered cohort values must not be supplied by the caller/u
  assert.deepEqual(policy.pairedWavePreregistration, preregistration)
  const resolved = resolvePlan55PairedWavePreregistration(policy)
  assert.deepEqual(resolved, {
    ...preregistration,
    sha256: createHash('sha256').update(JSON.stringify(preregistration)).digest('hex'),
  })
  assert.throws(() => buildPromotionPacket(input), /missing required release gate:/u)
  assert.throws(() => buildPromotionPacket({
    ...input,
    cohort: 'customer@example.com',
    observationWindowMinutes: 60,
  }), callerContext)

  const preregisteredPolicy = { ...policy, pairedWavePreregistration: preregistration }
  assert.ok(!validatePromotionConfig(preregisteredPolicy).includes('Plan 55 policy source binding is invalid'))
  const modifiedPolicy = {
    ...policy,
    pairedWavePreregistration: { ...preregistration, observationWindowMinutes: 61 },
  }
  assert.ok(validatePromotionConfig(modifiedPolicy).includes('Plan 55 policy source binding is invalid'))
  assert.throws(() => buildPromotionPacket({ ...input, config: modifiedPolicy }), /policy source binding is invalid/u)

  const invalidPreregistration = { ...preregistration, cohortId: 'customer@example.com' }
  assert.equal(resolvePlan55PairedWavePreregistration({
    ...policy,
    pairedWavePreregistration: invalidPreregistration,
  }), null)
  assert.ok(validatePromotionConfig({
    ...preregisteredPolicy,
    pairedWavePreregistration: invalidPreregistration,
  }).includes('Plan 55 paired-wave preregistration is invalid'))

  const packetContext = {
    schemaVersion: '1.0.0',
    environment: 'production',
    fromState: 'rollback_drill',
    toState: 'paired_wave_1',
  }
  assert.ok(verifyPromotionPacket(packetContext, policy)
    .includes('Plan 55 paired-wave context does not match source-locked preregistration'))
  assert.ok(verifyPromotionPacket({
    ...packetContext,
    cohort: safeCohort,
    observationWindowMinutes: 60,
    pairedWavePreregistrationSha256: '0'.repeat(64),
  }, preregisteredPolicy).includes('Plan 55 paired-wave context does not match source-locked preregistration'))
  assert.ok(!verifyPromotionPacket({
    ...packetContext,
    cohort: safeCohort,
    observationWindowMinutes: 60,
    pairedWavePreregistrationSha256: resolved.sha256,
  }, preregisteredPolicy).includes('Plan 55 paired-wave context does not match source-locked preregistration'))

  assert.ok(!verifyPromotionPacket({
    ...packetContext,
    cohort: safeCohort,
    observationWindowMinutes: 60,
    pairedWavePreregistrationSha256: resolved.sha256,
  }, policy).includes('Plan 55 paired-wave context does not match source-locked preregistration'))

  const productionPacketContext = {
    ...packetContext,
    fromState: 'paired_wave_3',
    toState: 'production',
  }
  assert.ok(verifyPromotionPacket(productionPacketContext, policy)
    .includes('Plan 55 paired-wave context does not match source-locked preregistration'))
  assert.ok(verifyPromotionPacket({
    ...productionPacketContext,
    cohort: safeCohort,
    observationWindowMinutes: 60,
    pairedWavePreregistrationSha256: '0'.repeat(64),
  }, preregisteredPolicy).includes('Plan 55 paired-wave context does not match source-locked preregistration'))
  assert.ok(!verifyPromotionPacket({
    ...productionPacketContext,
    cohort: safeCohort,
    observationWindowMinutes: 60,
    pairedWavePreregistrationSha256: resolved.sha256,
  }, preregisteredPolicy).includes('Plan 55 paired-wave context does not match source-locked preregistration'))
  assert.throws(() => buildPromotionPacket({
    ...input,
    currentState: 'paired_wave_3',
    targetState: 'production',
  }), /missing required release gate:/u)
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
