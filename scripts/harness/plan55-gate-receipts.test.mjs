import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  assertPlan55GateEvidenceCoverage,
  assertPlan55FinalizationArtifactFiles,
  buildPlan55CanaryGateEvidenceFiles,
  buildPlan55GateEvidenceArtifact,
  downloadPlan55GitHubRunArtifact,
  inspectPlan55GateEvidenceCoverage,
  loadPlan55GateEvidenceSet,
  PLAN55_DEPLOYED_GUARD_GATES,
  PLAN55_PREFLIGHT_GATE_CHECKS,
  PLAN55_RELEASE_STAGE_GATES,
  verifyPlan55GitHubArtifactProvenance,
} from './plan55-gate-receipts.mjs'
import { loadPlan55ProductionOnlyPolicy, requiredPromotionGates } from './promotion.mjs'
import {
  buildPlan55ServiceSlices,
  PLAN55_SERVICE_ORDER,
} from '../../apps/api/scripts/lib/plan55-production-canary-core.mjs'
import {
  buildPlan55ReleaseStageGateProofs,
} from './plan55-release-gate-proofs.mjs'

const sourcePolicy = loadPlan55ProductionOnlyPolicy(resolve('.'))
const requiredGates = [
  'plan55-service-slice-integrity-pass',
  'plan55-service-g5-safety-pass',
  'plan55-service-cleanup-pass',
  'plan55-six-current-source-receipts',
  'plan55-six-cleanup-passes',
]
const policy = {
  ...sourcePolicy,
  requiredGatesByTarget: Object.fromEntries(Object.keys(sourcePolicy.requiredGatesByTarget).map((target) => [
    target,
    target === 'receipts_validated' ? requiredGates : [],
  ])),
  trustedEvidenceWorkflowPathsByGate: Object.fromEntries(requiredGates.map((gate) => [
    gate,
    '.github/workflows/ci.yml',
  ])),
}
const release = {
  environment: 'production',
  releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
  gitSha: 'a'.repeat(40),
  releaseLane: 'plan55-production-only',
}
const targetState = 'receipts_validated'

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

const cleanupRows = Object.freeze({
  profiles: 0,
  customer_profiles: 0,
  customer_account_deletion_requests: 0,
  kael_chat_sessions: 0,
  kael_chat_turns: 0,
  worker_profiles: 0,
  jobs_as_customer: 0,
  jobs_as_worker: 0,
  job_broadcasts_as_worker: 0,
  job_events_as_actor: 0,
  chat_messages_as_sender: 0,
  notifications_as_user: 0,
})

function cleanupProof() {
  return {
    globalFlags: 'absent',
    canaryFlag: 'absent',
    canaryActorId: 'absent',
    authStatus: 404,
    orphanWorkers: 0,
    rows: { ...cleanupRows },
    reused: true,
  }
}

function g5DatasetProof() {
  return {
    scope_signal: {
      baseline: { passed: 18, total: 24, rate: 0.75 },
      after: { passed: 18, total: 24, rate: 0.75 },
      delta: 0,
      non_decreasing: true,
    },
    problem_slug: {
      baseline: { passed: 18, total: 24, rate: 0.75 },
      after: { passed: 18, total: 24, rate: 0.75 },
      delta: 0,
      non_decreasing: true,
    },
    required_safety_recall: {
      baseline: { observed: 24, expected: 24, recall: 1 },
      after: { observed: 24, expected: 24, recall: 1 },
      delta: 0,
      non_decreasing: true,
    },
    provider_fallback: {
      baseline: { runs: 0, total: 24 },
      after: { runs: 0, total: 24 },
      delta: 0,
      within_20pp: true,
    },
  }
}

function canaryProofInputs() {
  const checkpoint = {
    schema: 'plan55-production-checkpoint-status/v2',
    scope: 'currently_served_production_release_only',
    canary_started: true,
    canary_attempt_cleaned: true,
    deployment: {
      project_ref: policy.projectRef,
      source_sha: release.gitSha,
      release_id: release.releaseId,
    },
    verified_slice_count: 48,
    services: PLAN55_SERVICE_ORDER.map((service) => ({
      service,
      complete: true,
      cleanup_verified: true,
      verified_slice_count: 8,
      missing_slice_count: 0,
      verified_slice_ids: buildPlan55ServiceSlices(service).map(({ id }) => id),
      missing_slice_ids: [],
      cleanup: cleanupProof(),
    })),
  }
  const aggregate = {
    schema: 'plan55-production-canary-sequence/v1',
    scope: 'production_synthetic_actor_sequence',
    project_ref: policy.projectRef,
    status: 'SIX_SERVICE_CANARY_PASS_PENDING_REMAINING_GATES',
    services: PLAN55_SERVICE_ORDER.map((service) => ({
      service,
      status: 'G5_PASSED',
      slices: buildPlan55ServiceSlices(service).map((slice) => ({
        sliceId: slice.id,
        caseCount: 12,
        errorCount: 0,
        sourceSha: release.gitSha,
        sourceAttestationSha256: 'e'.repeat(64),
        corpusPath: slice.corpusPath,
        playbookPath: slice.playbookPath,
        playbookEnabled: slice.playbookEnabled,
        artifactIntegrity: 'pass',
      })),
      slice_count: 8,
      case_count: 96,
      error_count: 0,
      g5_deltas: { corpus: g5DatasetProof(), holdout: g5DatasetProof() },
      cleanup: { ...cleanupProof(), reused: true },
      release_id: release.releaseId,
      source_sha: release.gitSha,
    })),
  }
  return { checkpoint, aggregate }
}

function streamResponse(bytes) {
  let sent = false
  return {
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true }
          sent = true
          return { done: false, value: bytes }
        },
        cancel: async () => {},
      }),
    },
  }
}

function zipStored(files) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const [path, content] of files) {
    const name = Buffer.from(path)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(content.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(name.length, 26)
    localParts.push(local, name, content)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt32LE(content.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + content.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, centralDirectory, end])
}

function makeEvidenceSet(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'plan55-gate-evidence-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const receipts = []
  const artifactArchives = new Map()
  const sourceEvidence = new Map()
  const proofInputs = canaryProofInputs()
  const proofFiles = buildPlan55CanaryGateEvidenceFiles({
    policy,
    release,
    ...proofInputs,
  })
  for (const [index, gate] of requiredGates.entries()) {
    const evidencePath = `evidence/${gate}.json`
    const sourcePath = `source-results/${gate}.json`
    const artifactEvidencePath = `source-results/${gate}.json`
    const receiptPath = `receipts/${gate}.json`
    mkdirSync(join(root, 'evidence'), { recursive: true })
    mkdirSync(join(root, 'receipts'), { recursive: true })
    mkdirSync(join(root, 'source-results'), { recursive: true })
    const evidenceBytes = overrides.identityOnlyEvidence === true
      ? Buffer.from(JSON.stringify({
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
      }) + '\n')
      : proofFiles.get(gate)
    writeFileSync(join(root, evidencePath), evidenceBytes)
    writeFileSync(join(root, sourcePath), evidenceBytes)
    const artifactId = 100 + index
    const artifactBytes = zipStored([[artifactEvidencePath, evidenceBytes]])
    artifactArchives.set(artifactId, artifactBytes)
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
      targetState,
      evidence: {
        path: evidencePath,
        sha256: digest(evidenceBytes),
        sourcePath,
        sourceSha256: digest(evidenceBytes),
        reference: `artifact://${100 + index}/${gate}`,
      },
      provenance: {
        repository: 'manhtu0407/HomeServices-',
        workflowPath: '.github/workflows/ci.yml',
        runId: String(9000 + index),
        runAttempt: 1,
        workflowHeadSha: release.gitSha,
        artifactId,
        artifactName: `plan55-gate-${gate}`,
        artifactDigest: `sha256:${digest(artifactBytes)}`,
        artifactEvidencePath,
      },
      ...overrides.receipt,
    }
    sourceEvidence.set(gate, {
      evidenceBytes,
      artifactEvidencePath,
      artifactFiles: new Map([[artifactEvidencePath, evidenceBytes]]),
      provenance: receipt.provenance,
    })
    const receiptBytes = Buffer.from(JSON.stringify(receipt) + '\n')
    writeFileSync(join(root, receiptPath), receiptBytes)
    receipts.push({ gate, receiptPath, sourcePath, receiptSha256: digest(receiptBytes) })
  }
  const manifest = {
    schemaVersion: 'plan55-gate-evidence-set.v1',
    policyId: policy.policyId,
    policySha256: policy.policySha256,
    environment: 'production',
    projectRef: policy.projectRef,
    releaseId: release.releaseId,
    sourceSha: release.gitSha,
    targetState,
    receipts: overrides.receipts ?? receipts,
  }
  const manifestPath = join(root, 'gate-evidence-set.json')
  writeFileSync(manifestPath, JSON.stringify(manifest) + '\n')
  return { root, manifestPath, manifest, artifactArchives, sourceEvidence }
}

test('packages only source-proven, exact-target PASS evidence into a closed artifact', (t) => {
  const { sourceEvidence } = makeEvidenceSet(t)
  const files = buildPlan55GateEvidenceArtifact({
    policy, release, targetState, requiredGates, sourceEvidence,
  })
  assert.equal(assertPlan55FinalizationArtifactFiles(files), true)
  const manifest = JSON.parse(files.get('gate-evidence-set.json').toString('utf8'))
  assert.equal(manifest.schemaVersion, 'plan55-gate-evidence-set.v1')
  assert.deepEqual(manifest.receipts.map(({ gate }) => gate), [...requiredGates].sort())
  const firstReceipt = JSON.parse(files.get(manifest.receipts[0].receiptPath).toString('utf8'))
  assert.equal(firstReceipt.provenance.artifactEvidencePath, `source-results/${firstReceipt.gate}.json`)

  const tampered = new Map(sourceEvidence)
  const [gate, original] = tampered.entries().next().value
  tampered.set(gate, { ...original, evidenceBytes: Buffer.from('{}\n') })
  assert.throws(() => buildPlan55GateEvidenceArtifact({
    policy, release, targetState, requiredGates, sourceEvidence: tampered,
  }), /source artifact does not prove the gate evidence/u)
})

test('auto-packages release-stage gates from the exact Production release artifact', () => {
  const gates = [...PLAN55_RELEASE_STAGE_GATES].sort()
  const releasePolicy = {
    ...sourcePolicy,
    requiredGatesByTarget: Object.fromEntries(Object.keys(sourcePolicy.requiredGatesByTarget).map((state) => [
      state,
      state === targetState ? gates : [],
    ])),
  }
  const releaseSourceSha = 'a'.repeat(40)
  const releaseManifest = {
    environment: 'production',
    releaseId: `harness-${releaseSourceSha.slice(0, 12)}-${'b'.repeat(12)}`,
    gitSha: releaseSourceSha,
    releaseLane: releasePolicy.releaseLane,
  }
  const mobileApi = {
    status: 'ACTIVE',
    version: 3,
    ezbr_sha256: digest(Buffer.from('mobile-api-bundle')),
    verify_jwt: true,
    import_map: 'supabase/functions/mobile-api/deno.json',
    entrypoint_path: 'supabase/functions/mobile-api/index.ts',
    import_map_path: 'supabase/functions/mobile-api/deno.json',
  }
  const productionSnapshot = {
    environment: 'production',
    projectRef: releasePolicy.projectRef,
    releaseId: releasePolicy.productionSourceBase.releaseId,
    gitSha: releasePolicy.productionSourceBase.sha,
    migrations: [{ version: '20261001000000' }],
    managedEdgeFunctions: { 'mobile-api': mobileApi },
  }
  const releaseBytes = Buffer.from(`${JSON.stringify(releaseManifest)}\n`)
  const hostedBeforeBytes = Buffer.from(`${JSON.stringify(productionSnapshot)}\n`)
  const hostedRollbackBytes = Buffer.from(`${JSON.stringify(productionSnapshot)}\n`)
  const rollbackSourceBytes = Buffer.from(`${digest(Buffer.from('rollback-mobile-source'))}\n`)
  const provenance = {
    workflowPath: '.github/workflows/ci.yml',
    runId: '97531',
    runAttempt: 2,
  }
  const proofs = buildPlan55ReleaseStageGateProofs({
    policy: releasePolicy,
    releaseBytes,
    hostedBeforeBytes,
    hostedRollbackBytes,
    rollbackSourceSha256: rollbackSourceBytes.toString('utf8'),
    provenance,
  })
  const artifactFiles = new Map([
    ['release.json', releaseBytes],
    ['hosted-before.json', hostedBeforeBytes],
    ['hosted-rollback-snapshot.json', hostedRollbackBytes],
    ['rollback-mobile-source-sha256.txt', rollbackSourceBytes],
  ])
  const artifactId = 97532
  const artifactDigest = `sha256:${digest(Buffer.from('exact release artifact archive'))}`
  const sourceEvidence = new Map()
  for (const gate of gates) {
    const artifactEvidencePath = `plan55-gate-evidence/${gate}.json`
    const evidenceBytes = Buffer.from(`${JSON.stringify(proofs[gate])}\n`)
    artifactFiles.set(artifactEvidencePath, evidenceBytes)
    sourceEvidence.set(gate, {
      evidenceBytes,
      artifactEvidencePath,
      artifactFiles,
      provenance: {
        repository: releasePolicy.repository,
        ...provenance,
        workflowHeadSha: releaseSourceSha,
        artifactId,
        artifactName: `plan55-release-${provenance.runId}-${provenance.runAttempt}`,
        artifactDigest,
        artifactEvidencePath,
      },
    })
  }

  const files = buildPlan55GateEvidenceArtifact({
    policy: releasePolicy,
    release: releaseManifest,
    targetState,
    requiredGates: gates,
    sourceEvidence,
  })
  assert.equal(assertPlan55FinalizationArtifactFiles(files), true)
  const manifest = JSON.parse(files.get('gate-evidence-set.json').toString('utf8'))
  assert.deepEqual(manifest.receipts.map(({ gate }) => gate), gates)
  for (const gate of gates) {
    const receipt = JSON.parse(files.get(`receipts/${gate}.json`).toString('utf8'))
    const evidence = JSON.parse(files.get(`evidence/${gate}.json`).toString('utf8'))
    const archivedSource = JSON.parse(files.get(`source-results/${gate}.json`).toString('utf8'))
    assert.equal(receipt.status, 'PASS')
    assert.equal(evidence.schemaVersion, 'plan55-gate-result.v1')
    assert.equal(evidence.proof.gate, gate)
    assert.deepEqual(archivedSource, proofs[gate])
  }
})

test('rejects identity-only PASS evidence for receipt and cleanup gates', (t) => {
  const { sourceEvidence } = makeEvidenceSet(t, { identityOnlyEvidence: true })
  assert.throws(() => buildPlan55GateEvidenceArtifact({
    policy, release, targetState, requiredGates, sourceEvidence,
  }), /gate-specific evidence contract/u)
})

test('canary evidence rejects altered slices, cleanup, G5 deltas, and source identity', () => {
  const mutations = [
    ({ aggregate }) => { aggregate.services[0].slices[0].caseCount = 11 },
    ({ aggregate }) => { aggregate.services[0].slices[0].sourceSha = 'b'.repeat(40) },
    ({ aggregate }) => { aggregate.services[0].cleanup.authStatus = 200 },
    ({ aggregate }) => { aggregate.services[0].g5_deltas.corpus.scope_signal.after.passed = 17 },
    ({ aggregate }) => { aggregate.services[0].status = 'G5_FAILED_SERVICE_OFF' },
    ({ checkpoint }) => { checkpoint.services[0].cleanup.rows.profiles = 1 },
  ]
  for (const mutate of mutations) {
    const inputs = canaryProofInputs()
    mutate(inputs)
    assert.throws(() => buildPlan55CanaryGateEvidenceFiles({ policy, release, ...inputs }),
      /gate-specific evidence contract/u)
  }
})

test('repackages receipt evidence for later targets without claiming wave outcomes', () => {
  const files = buildPlan55CanaryGateEvidenceFiles({
    policy,
    release,
    ...canaryProofInputs(),
    targetState: 'paired_wave_1',
  })
  const evidence = JSON.parse(files.get(requiredGates[0]).toString('utf8'))
  assert.equal(evidence.targetState, 'paired_wave_1')
  assert.equal(evidence.proof.validatedTargetState, 'receipts_validated')
})

test('reports every missing Plan 55 verifier and producer before artifact downloads', () => {
  const gates = requiredPromotionGates(sourcePolicy, targetState)
  const coverage = inspectPlan55GateEvidenceCoverage({
    policy: sourcePolicy,
    targetState,
    requiredGates: gates,
  })
  const supportedGates = [
    'plan55-service-slice-integrity-pass',
    'plan55-service-g5-safety-pass',
    'plan55-service-cleanup-pass',
    'plan55-six-current-source-receipts',
    'plan55-six-cleanup-passes',
    ...Object.keys(PLAN55_PREFLIGHT_GATE_CHECKS),
    ...PLAN55_RELEASE_STAGE_GATES,
    ...PLAN55_DEPLOYED_GUARD_GATES,
  ]
  const unsupportedGates = gates.filter((gate) => !supportedGates.includes(gate)).sort()
  const gatesWithoutProducer = gates.filter((gate) =>
    typeof sourcePolicy.trustedEvidenceWorkflowPathsByGate?.[gate] !== 'string')
    .sort()

  assert.equal(coverage.ready, false)
  assert.deepEqual(coverage.requiredGates, [...gates].sort())
  assert.deepEqual(coverage.missingSemanticVerifierGates, unsupportedGates)
  assert.deepEqual(coverage.missingApprovedProducerGates, gatesWithoutProducer)
  assert.ok(coverage.missingSemanticVerifierGates.includes('plan55-independent-cohort-outcome'))
  assert.ok(!coverage.missingSemanticVerifierGates.includes('workspace-typecheck'))
  assert.ok(coverage.requiredGates.includes('workspace-typecheck'))
})

test('coverage preflight names the full unsupported gate set in one error', () => {
  const gates = requiredPromotionGates(sourcePolicy, targetState)
  const coverage = inspectPlan55GateEvidenceCoverage({
    policy: sourcePolicy,
    targetState,
    requiredGates: gates,
  })
  assert.throws(() => assertPlan55GateEvidenceCoverage({
    policy: sourcePolicy,
    targetState,
    requiredGates: gates,
  }), (error) => {
    assert.match(error.message, /gate evidence coverage is incomplete/u)
    assert.match(error.message, /missing semantic verifiers:/u)
    assert.match(error.message, /missing approved producers:/u)
    for (const gate of coverage.missingSemanticVerifierGates) assert.ok(error.message.includes(gate))
    for (const gate of coverage.missingApprovedProducerGates) assert.ok(error.message.includes(gate))
    return true
  })
})

test('coverage inspection rejects malformed gate inventories without partial results', () => {
  for (const requiredGates of [
    undefined,
    [],
    ['plan55-independent-cohort-outcome', 'plan55-independent-cohort-outcome'],
    [null],
  ]) {
    assert.throws(() => inspectPlan55GateEvidenceCoverage({
      policy: sourcePolicy,
      targetState,
      requiredGates,
    }), /gate evidence package inventory is invalid/u)
  }
})

test('does not package an independent-outcome gate without its semantic verifier and producer', (t) => {
  const { sourceEvidence } = makeEvidenceSet(t)
  const gate = 'plan55-independent-cohort-outcome'
  const expandedGates = [...requiredGates, gate]
  const expandedPolicy = {
    ...policy,
    requiredGatesByTarget: {
      ...policy.requiredGatesByTarget,
      receipts_validated: expandedGates,
    },
    trustedEvidenceWorkflowPathsByGate: {
      ...policy.trustedEvidenceWorkflowPathsByGate,
      [gate]: '.github/workflows/ci.yml',
    },
  }
  const identityOnly = Buffer.from(JSON.stringify({
    schemaVersion: 'plan55-gate-result.v1',
    gate,
    status: 'PASS',
    environment: 'production',
    projectRef: expandedPolicy.projectRef,
    policyId: expandedPolicy.policyId,
    policySha256: expandedPolicy.policySha256,
    releaseId: release.releaseId,
    sourceSha: release.gitSha,
    targetState,
  }) + '\n')
  const artifactId = 102
  const artifactEvidencePath = `source-results/${gate}.json`
  const artifactBytes = zipStored([[artifactEvidencePath, identityOnly]])
  sourceEvidence.set(gate, {
    evidenceBytes: identityOnly,
    artifactEvidencePath,
    artifactFiles: new Map([[artifactEvidencePath, identityOnly]]),
    provenance: {
      repository: expandedPolicy.repository,
      workflowPath: '.github/workflows/ci.yml',
      runId: '9002',
      runAttempt: 1,
      workflowHeadSha: release.gitSha,
      artifactId,
      artifactName: `plan55-gate-${gate}`,
      artifactDigest: `sha256:${digest(artifactBytes)}`,
      artifactEvidencePath,
    },
  })
  assert.throws(() => buildPlan55GateEvidenceArtifact({
    policy: expandedPolicy,
    release,
    targetState,
    requiredGates: expandedGates,
    sourceEvidence,
  }), (error) => {
    assert.match(error.message, /gate evidence coverage is incomplete/u)
    assert.match(error.message, /missing semantic verifiers:.*plan55-independent-cohort-outcome/u)
    return true
  })
})

test('workspace gate has a semantic verifier and rejects unrelated artifact evidence', (t) => {
  const expandedGates = [...requiredGates, 'workspace-typecheck']
  const expandedPolicy = {
    ...policy,
    trustedEvidenceWorkflowPathsByGate: {
      ...policy.trustedEvidenceWorkflowPathsByGate,
      'workspace-typecheck': '.github/workflows/ci.yml',
    },
    requiredGatesByTarget: {
      ...policy.requiredGatesByTarget,
      receipts_validated: expandedGates,
    },
  }
  const { sourceEvidence } = makeEvidenceSet(t)
  sourceEvidence.set('workspace-typecheck', sourceEvidence.get(requiredGates[0]))
  const coverage = inspectPlan55GateEvidenceCoverage({
    policy: expandedPolicy,
    targetState,
    requiredGates: expandedGates,
  })

  assert.ok(!coverage.missingSemanticVerifierGates.includes('workspace-typecheck'))
  assert.ok(!coverage.missingApprovedProducerGates.includes('workspace-typecheck'))
  assert.throws(() => buildPlan55GateEvidenceArtifact({
    policy: expandedPolicy,
    release,
    targetState,
    requiredGates: expandedGates,
    sourceEvidence,
  }), (error) => {
    assert.match(error.message, /preflight gate evidence contract failed/u)
    assert.match(error.message, /workspace-typecheck/u)
    return true
  })
})

test('rejects oversized and PII-bearing source evidence before packaging', (t) => {
  const { sourceEvidence } = makeEvidenceSet(t)
  const [gate, original] = sourceEvidence.entries().next().value
  const oversized = Buffer.alloc(16 * 1024 * 1024 + 1, 0x20)
  const oversizedSet = new Map(sourceEvidence)
  oversizedSet.set(gate, {
    ...original,
    evidenceBytes: oversized,
    artifactFiles: new Map([[original.artifactEvidencePath, oversized]]),
  })
  assert.throws(() => buildPlan55GateEvidenceArtifact({
    policy, release, targetState, requiredGates, sourceEvidence: oversizedSet,
  }), /evidence file is too large/u)

  const piiSet = new Map(sourceEvidence)
  const piiEvidence = Buffer.from(JSON.stringify({
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
    email: 'person@example.invalid',
  }) + '\n')
  piiSet.set(gate, {
    ...original,
    evidenceBytes: piiEvidence,
    artifactFiles: new Map([[original.artifactEvidencePath, piiEvidence]]),
  })
  assert.throws(() => buildPlan55GateEvidenceArtifact({
    policy, release, targetState, requiredGates, sourceEvidence: piiSet,
  }), /not allowed in Plan 55 evidence/u)

  const freeTextSet = new Map(sourceEvidence)
  const freeTextEvidence = Buffer.from(JSON.stringify({
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
    proof: '12 Nguyen Trai',
  }) + '\n')
  freeTextSet.set(gate, {
    ...original,
    evidenceBytes: freeTextEvidence,
    artifactFiles: new Map([[original.artifactEvidencePath, freeTextEvidence]]),
  })
  assert.throws(() => buildPlan55GateEvidenceArtifact({
    policy, release, targetState, requiredGates, sourceEvidence: freeTextSet,
  }), /unsafe Plan 55 evidence text/u)
})

test('loads exact source-bound gate receipts and verifies the referenced evidence bytes', (t) => {
  const { root, manifestPath } = makeEvidenceSet(t)
  const receiptSet = loadPlan55GateEvidenceSet(manifestPath, {
    policy, release, targetState, requiredGates,
  })
  assert.deepEqual(Object.keys(receiptSet).sort(), [...requiredGates].sort())
  for (const gate of requiredGates) {
    assert.match(receiptSet[gate].receiptSha256, /^[a-f0-9]{64}$/u)
    assert.match(receiptSet[gate].evidenceSha256, /^[a-f0-9]{64}$/u)
    assert.equal(receiptSet[gate].receipt.gate, gate)
    assert.equal(readFileSync(join(root, receiptSet[gate].receipt.evidence.path)).length > 0, true)
  }
})

test('rejects an incomplete, duplicate, or extra gate inventory', (t) => {
  const missing = makeEvidenceSet(t, { receipts: [] })
  assert.throws(() => loadPlan55GateEvidenceSet(missing.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /gate inventory/u)

  const duplicate = makeEvidenceSet(t)
  duplicate.manifest.receipts[1] = { ...duplicate.manifest.receipts[0] }
  writeFileSync(duplicate.manifestPath, JSON.stringify(duplicate.manifest))
  assert.throws(() => loadPlan55GateEvidenceSet(duplicate.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /gate inventory/u)
})

test('fails closed for stale source, release, policy, target, or non-pass evidence', (t) => {
  const staleSource = makeEvidenceSet(t, { receipt: { sourceSha: 'b'.repeat(40) } })
  assert.throws(() => loadPlan55GateEvidenceSet(staleSource.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /source identity/u)

  const wrongTarget = makeEvidenceSet(t)
  wrongTarget.manifest.targetState = 'production'
  writeFileSync(wrongTarget.manifestPath, JSON.stringify(wrongTarget.manifest))
  assert.throws(() => loadPlan55GateEvidenceSet(wrongTarget.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /target\/source identity/u)

  const wrongRelease = makeEvidenceSet(t)
  wrongRelease.manifest.releaseId = 'harness-cccccccccccc-dddddddddddd'
  writeFileSync(wrongRelease.manifestPath, JSON.stringify(wrongRelease.manifest))
  assert.throws(() => loadPlan55GateEvidenceSet(wrongRelease.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /target\/source identity/u)

  const stalePolicy = makeEvidenceSet(t, { receipt: { policySha256: '0'.repeat(64) } })
  assert.throws(() => loadPlan55GateEvidenceSet(stalePolicy.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /receipt identity mismatch/u)

  const failed = makeEvidenceSet(t, { receipt: { status: 'blocked' } })
  assert.throws(() => loadPlan55GateEvidenceSet(failed.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /not PASS/u)
})

test('rejects artifact provenance from a workflow outside the explicit trusted allowlist', (t) => {
  const untrustedWorkflow = makeEvidenceSet(t)
  const entry = untrustedWorkflow.manifest.receipts[0]
  const receiptPath = join(untrustedWorkflow.root, entry.receiptPath)
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  receipt.provenance.workflowPath = '.github/workflows/untrusted.yml'
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
  writeFileSync(receiptPath, receiptBytes)
  entry.receiptSha256 = digest(receiptBytes)
  writeFileSync(untrustedWorkflow.manifestPath, `${JSON.stringify(untrustedWorkflow.manifest)}\n`)

  assert.throws(() => loadPlan55GateEvidenceSet(untrustedWorkflow.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /artifact provenance is invalid/u)
})

test('rejects trusted workflow artifacts produced from a different source SHA', (t) => {
  const staleWorkflowSource = makeEvidenceSet(t)
  const entry = staleWorkflowSource.manifest.receipts[0]
  const receiptPath = join(staleWorkflowSource.root, entry.receiptPath)
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  receipt.provenance.workflowHeadSha = 'c'.repeat(40)
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
  writeFileSync(receiptPath, receiptBytes)
  entry.receiptSha256 = digest(receiptBytes)
  writeFileSync(staleWorkflowSource.manifestPath, `${JSON.stringify(staleWorkflowSource.manifest)}\n`)
  assert.throws(() => loadPlan55GateEvidenceSet(staleWorkflowSource.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /workflow source SHA mismatch/u)
})

test('rejects tampered receipt/evidence bytes and paths outside the evidence set', (t) => {
  const tampered = makeEvidenceSet(t)
  writeFileSync(join(tampered.root, 'evidence', `${requiredGates[0]}.json`), 'tampered\n')
  assert.throws(() => loadPlan55GateEvidenceSet(tampered.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /evidence checksum mismatch/u)

  const changedReceipt = makeEvidenceSet(t)
  writeFileSync(join(changedReceipt.root, changedReceipt.manifest.receipts[0].receiptPath), 'tampered\n')
  assert.throws(() => loadPlan55GateEvidenceSet(changedReceipt.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /receipt checksum mismatch/u)

  const escaped = makeEvidenceSet(t, {
    receipt: {
      evidence: {
        path: '../outside.json',
        sha256: 'a'.repeat(64),
        sourcePath: `source-results/${requiredGates[0]}.json`,
        sourceSha256: 'b'.repeat(64),
        reference: 'artifact://1/outside',
      },
    },
  })
  assert.throws(() => loadPlan55GateEvidenceSet(escaped.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /outside the evidence set/u)
})

test('verifies each immutable receipt artifact against the completed main-branch GitHub run', async (t) => {
  const { manifestPath, artifactArchives } = makeEvidenceSet(t)
  const receiptSet = loadPlan55GateEvidenceSet(manifestPath, {
    policy, release, targetState, requiredGates,
  })
  const requests = []
  let overLimit = false
  let omitStream = false
  let archiveBuffered = false
  const fetchImpl = async (url, options) => {
    requests.push({ url, options })
    const artifactMatch = /\/actions\/artifacts\/(\d+)$/u.exec(url)
    const archiveMatch = /\/actions\/artifacts\/(\d+)\/zip$/u.exec(url)
    if (archiveMatch) {
      const archive = artifactArchives.get(Number(archiveMatch[1]))
      return {
        ok: true,
        headers: { get: () => String(overLimit ? 64 * 1024 * 1024 + 1 : archive.length) },
        ...(omitStream ? {
          arrayBuffer: async () => {
            archiveBuffered = true
            return archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength)
          },
        } : streamResponse(archive)),
      }
    }
    if (artifactMatch) {
      const id = Number(artifactMatch[1])
      const receipt = Object.values(receiptSet).find((item) => item.receipt.provenance.artifactId === id).receipt
      return {
        ok: true,
        json: async () => ({
          id,
          name: receipt.provenance.artifactName,
          expired: false,
          digest: receipt.provenance.artifactDigest,
          archive_download_url: `https://api.github.com/repos/${policy.repository}/actions/artifacts/${id}/zip`,
          workflow_run: { id: Number(receipt.provenance.runId), head_sha: receipt.provenance.workflowHeadSha },
        }),
      }
    }
    const runMatch = /\/actions\/runs\/(\d+)$/u.exec(url)
    assert.ok(runMatch)
    const receipt = Object.values(receiptSet).find((item) => item.receipt.provenance.runId === runMatch[1]).receipt
    return {
      ok: true,
      json: async () => ({
        id: Number(receipt.provenance.runId),
        run_attempt: receipt.provenance.runAttempt,
        status: 'completed',
        conclusion: 'success',
        head_sha: receipt.provenance.workflowHeadSha,
        head_branch: 'main',
        path: receipt.provenance.workflowPath,
        repository: { full_name: receipt.provenance.repository },
      }),
    }
  }
  assert.equal(await verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    trustedEvidenceWorkflowPathsByGate: policy.trustedEvidenceWorkflowPathsByGate,
    sourceSha: release.gitSha,
    token: 'test-token', fetchImpl,
  }), true)
  assert.equal(requests.length, requiredGates.length * 3)
  assert.ok(requests.every(({ options }) => options.headers.authorization === 'Bearer test-token'))
  assert.ok(requests.every(({ options }) => options.signal instanceof AbortSignal && !options.signal.aborted))
  overLimit = true
  archiveBuffered = false
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    trustedEvidenceWorkflowPathsByGate: policy.trustedEvidenceWorkflowPathsByGate,
    sourceSha: release.gitSha,
    token: 'test-token', fetchImpl,
  }), /artifact archive is too large/u)
  assert.equal(archiveBuffered, false)
  overLimit = false
  omitStream = true
  archiveBuffered = false
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    trustedEvidenceWorkflowPathsByGate: policy.trustedEvidenceWorkflowPathsByGate,
    sourceSha: release.gitSha,
    token: 'test-token', fetchImpl,
  }), /requires a bounded stream/u)
  assert.equal(archiveBuffered, false)
})

test('rejects a workflow-source mismatch before calling the GitHub API', async (t) => {
  const { manifestPath } = makeEvidenceSet(t)
  const receiptSet = loadPlan55GateEvidenceSet(manifestPath, {
    policy, release, targetState, requiredGates,
  })
  let requestCount = 0
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    trustedEvidenceWorkflowPathsByGate: policy.trustedEvidenceWorkflowPathsByGate,
    sourceSha: 'b'.repeat(40),
    token: 'test-token',
    fetchImpl: async () => {
      requestCount += 1
      throw new Error('unexpected GitHub request')
    },
  }), /workflow source SHA mismatch/u)
  assert.equal(requestCount, 0)
})

test('rejects failed, stale, expired, or mismatched GitHub artifact provenance', async (t) => {
  const { manifestPath, artifactArchives } = makeEvidenceSet(t)
  const receiptSet = loadPlan55GateEvidenceSet(manifestPath, {
    policy, release, targetState, requiredGates,
  })
  let runConclusion = 'failure'
  const fetchImpl = async (url) => {
    const archiveMatch = /\/actions\/artifacts\/(\d+)\/zip$/u.exec(url)
    if (archiveMatch) {
      const archive = artifactArchives.get(Number(archiveMatch[1]))
      return {
        ok: true,
        arrayBuffer: async () => archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength),
      }
    }
    if (url.includes('/actions/artifacts/')) {
      const id = Number(url.match(/artifacts\/(\d+)$/u)[1])
      const receipt = Object.values(receiptSet).find((item) => item.receipt.provenance.artifactId === id).receipt
      return {
        ok: true,
        json: async () => ({
          id,
          name: receipt.provenance.artifactName,
          expired: false,
          digest: receipt.provenance.artifactDigest,
          archive_download_url: `https://api.github.com/repos/${policy.repository}/actions/artifacts/${id}/zip`,
          workflow_run: { id: Number(receipt.provenance.runId), head_sha: receipt.provenance.workflowHeadSha },
        }),
      }
    }
    const runId = url.match(/\/actions\/runs\/(\d+)$/u)?.[1]
    const receipt = Object.values(receiptSet).find((item) => item.receipt.provenance.runId === runId).receipt
    return {
      ok: true,
      json: async () => ({
        id: Number(runId),
        run_attempt: receipt.provenance.runAttempt,
        status: 'completed',
        conclusion: runConclusion,
        head_sha: receipt.provenance.workflowHeadSha,
        head_branch: 'main',
        path: `${receipt.provenance.workflowPath}@main`,
        repository: { full_name: receipt.provenance.repository },
      }),
    }
  }
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    trustedEvidenceWorkflowPathsByGate: policy.trustedEvidenceWorkflowPathsByGate,
    sourceSha: release.gitSha,
    token: 'test-token', fetchImpl,
  }), /workflow-run provenance verification failed/u)
  runConclusion = 'success'
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    trustedEvidenceWorkflowPathsByGate: policy.trustedEvidenceWorkflowPathsByGate,
    sourceSha: release.gitSha,
    token: 'test-token', fetchImpl,
  }), /workflow-run provenance verification failed/u)
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    trustedEvidenceWorkflowPathsByGate: policy.trustedEvidenceWorkflowPathsByGate,
    sourceSha: release.gitSha,
    token: '', fetchImpl,
  }), /requires repository, token, and fetch/u)
})

test('downloads an artifact only from its exact successful main-branch source run and name prefix', async () => {
  const artifactId = 9701
  const runId = 9702
  const runAttempt = 2
  const workflowPath = '.github/workflows/ci.yml'
  const artifactName = `plan55-release-${runId}-${runAttempt}`
  const archive = zipStored([
    ['release-manifest.json', Buffer.from('{"gitSha":"' + release.gitSha + '"}\n')],
  ])
  const artifact = {
    id: artifactId,
    name: artifactName,
    expired: false,
    digest: `sha256:${digest(archive)}`,
    archive_download_url: `https://api.github.com/repos/${policy.repository}/actions/artifacts/${artifactId}/zip`,
    workflow_run: { id: runId, head_sha: release.gitSha },
  }
  const run = {
    id: runId,
    run_attempt: runAttempt,
    status: 'completed',
    conclusion: 'success',
    head_sha: release.gitSha,
    head_branch: 'main',
    path: workflowPath,
    repository: { full_name: policy.repository },
  }
  const requests = []
  const result = await downloadPlan55GitHubRunArtifact({
    repository: policy.repository,
    trustedWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    sourceSha: release.gitSha,
    artifactId,
    artifactNamePrefix: 'plan55-release',
    expectedRunId: runId,
    expectedRunAttempt: runAttempt,
    token: 'test-token',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      if (url.endsWith(`/actions/artifacts/${artifactId}/zip`)) {
        return { ok: true, ...streamResponse(archive) }
      }
      return {
        ok: true,
        json: async () => url.endsWith(`/actions/artifacts/${artifactId}`) ? artifact : run,
      }
    },
  })

  assert.equal(result.artifactId, artifactId)
  assert.equal(result.runId, runId)
  assert.equal(result.files.get('release-manifest.json').toString(), `{"gitSha":"${release.gitSha}"}\n`)
  assert.equal(requests.length, 3)
  assert.ok(requests.every(({ options }) => options.headers.authorization === 'Bearer test-token'))
})

test('rejects artifacts with wrong source, run, name, path, status, expiry, or checksum', async () => {
  const artifactId = 9711
  const runId = 9712
  const runAttempt = 1
  const workflowPath = '.github/workflows/ci.yml'
  const artifactName = `plan55-gate-evidence-${runId}-${runAttempt}`
  const archive = zipStored([['release-manifest.json', Buffer.from('{}\n')]])
  const artifact = {
    id: artifactId,
    name: artifactName,
    expired: false,
    digest: `sha256:${digest(archive)}`,
    archive_download_url: `https://api.github.com/repos/${policy.repository}/actions/artifacts/${artifactId}/zip`,
    workflow_run: { id: runId, head_sha: release.gitSha },
  }
  const run = {
    id: runId,
    run_attempt: runAttempt,
    status: 'completed',
    conclusion: 'success',
    head_sha: release.gitSha,
    head_branch: 'main',
    path: workflowPath,
    repository: { full_name: policy.repository },
  }
  let artifactOverride = {}
  let runOverride = {}
  let archiveRequested = false
  const fetchImpl = async (url) => {
    if (url.endsWith('/zip')) {
      archiveRequested = true
      return { ok: true, ...streamResponse(archive) }
    }
    return {
      ok: true,
      json: async () => url.includes('/actions/artifacts/')
        ? { ...artifact, ...artifactOverride }
        : { ...run, ...runOverride },
    }
  }
  const verify = () => downloadPlan55GitHubRunArtifact({
    repository: policy.repository,
    trustedWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    sourceSha: release.gitSha,
    artifactId,
    artifactNamePrefix: 'plan55-gate-evidence',
    expectedRunId: runId,
    expectedRunAttempt: runAttempt,
    token: 'test-token',
    fetchImpl,
  })

  artifactOverride = { expired: true }
  await assert.rejects(verify(), /artifact identity verification failed/u)
  assert.equal(archiveRequested, false)
  artifactOverride = { workflow_run: { id: runId, head_sha: 'b'.repeat(40) } }
  await assert.rejects(verify(), /artifact identity verification failed/u)
  assert.equal(archiveRequested, false)
  artifactOverride = { workflow_run: { id: runId + 1, head_sha: release.gitSha } }
  await assert.rejects(verify(), /artifact identity verification failed/u)
  assert.equal(archiveRequested, false)
  artifactOverride = { name: `plan55-untrusted-${runId}-${runAttempt}` }
  await assert.rejects(verify(), /workflow-run provenance verification failed/u)
  assert.equal(archiveRequested, false)
  artifactOverride = {}
  runOverride = { conclusion: 'failure' }
  await assert.rejects(verify(), /workflow-run provenance verification failed/u)
  assert.equal(archiveRequested, false)
  runOverride = { path: '.github/workflows/untrusted.yml' }
  await assert.rejects(verify(), /workflow-run provenance verification failed/u)
  assert.equal(archiveRequested, false)
  runOverride = {}
  artifactOverride = { digest: `sha256:${'0'.repeat(64)}` }
  await assert.rejects(verify(), /artifact archive checksum mismatch/u)
  assert.equal(archiveRequested, true)
})

test('accepts only a closed gate-evidence artifact inventory with referenced receipts and evidence files', () => {
  const files = new Map([
    ['receipts/', Buffer.alloc(0)],
    ['evidence/', Buffer.alloc(0)],
    ['source-results/', Buffer.alloc(0)],
    ['gate-evidence-set.json', Buffer.from(JSON.stringify({
      receipts: [{
        gate: 'plan55-example-gate',
        receiptPath: 'receipts/plan55-example-gate.json',
        sourcePath: 'source-results/plan55-example-gate.json',
      }],
    }))],
    ['receipts/plan55-example-gate.json', Buffer.from(JSON.stringify({
      evidence: {
        path: 'evidence/plan55-example-gate.json',
        sourcePath: 'source-results/plan55-example-gate.json',
      },
    }))],
    ['evidence/plan55-example-gate.json', Buffer.from('{}\n')],
    ['source-results/plan55-example-gate.json', Buffer.from('{}\n')],
  ])
  assert.equal(assertPlan55FinalizationArtifactFiles(files), true)

  const traversal = new Map(files)
  traversal.set('evidence/../release.json', Buffer.from('{}\n'))
  assert.throws(() => assertPlan55FinalizationArtifactFiles(traversal), /artifact path is invalid/u)

  const unreferenced = new Map(files)
  unreferenced.set('evidence/other-gate.json', Buffer.from('{}\n'))
  assert.throws(() => assertPlan55FinalizationArtifactFiles(unreferenced), /missing or unreferenced/u)
})
