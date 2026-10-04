import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  assertPlan55ReleaseStageGateProof,
  buildPlan55ReleaseStageGateProofs,
  PLAN55_RELEASE_STAGE_GATES,
} from './plan55-release-gate-proofs.mjs'
import { loadPlan55ProductionOnlyPolicy } from './promotion.mjs'
import { PRODUCTION_REQUIRED_PROVIDERS, PROVIDER_READINESS_KEYS } from './release-bundle.mjs'

const basePolicy = loadPlan55ProductionOnlyPolicy(process.cwd())
const policy = {
  ...basePolicy,
  trustedEvidenceWorkflowPathsByGate: {
    ...basePolicy.trustedEvidenceWorkflowPathsByGate,
    ...Object.fromEntries([
      'hosted-drift-baseline',
      'compatible-rollback-target',
      'plan55-production-target-attestation',
      'plan55-rollback-preflight',
      'plan55-exact-binary-release-attestation',
      'plan55-full-production-readiness',
    ].map((gate) => [gate, '.github/workflows/ci.yml'])),
  },
}
const sourceSha = 'a'.repeat(40)
const releaseId = `harness-${sourceSha.slice(0, 12)}-${'b'.repeat(12)}`
const provenance = {
  workflowPath: '.github/workflows/ci.yml',
  runId: '9001',
  runAttempt: 2,
}

function bytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function canonicalJson(value) {
  const canonicalize = (item) => {
    if (Array.isArray(item)) return item.map(canonicalize)
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonicalize(item[key])]))
    }
    return item
  }
  return JSON.stringify(canonicalize(value))
}

function replaceRelease(input, release) {
  const releaseBytes = bytes(release)
  const files = new Map(input.files)
  files.set('release.json', releaseBytes)
  return { ...input, release, releaseBytes, files }
}

function mobileBinaryAttestation(release) {
  const compatibility = release.activeClientCompatibility
  const platforms = Object.fromEntries(['ios', 'android'].map((platform) => {
    const active = compatibility[platform]
    return [platform, {
      easBuildId: active.easBuildId,
      applicationId: active.applicationId,
      appVersion: '0.2.0',
      buildNumber: active.minimumBuildNumber,
      runtimeVersion: active.runtimeVersion,
      gitCommitHash: sourceSha,
      easFingerprintAlgorithm: 'sha1',
      easFingerprintHash: 'c'.repeat(40),
      artifactSha256: 'd'.repeat(64),
      artifactSizeBytes: 1,
      completedAt: '2026-10-03T00:00:00.000Z',
      distribution: 'store',
      profile: 'production',
    }]
  }))
  const receipt = {
    schemaVersion: 'stage1-mobile-binary-attestation.v2',
    releaseId: release.releaseId,
    gitSha: release.gitSha,
    sourceFingerprintSha256: release.mobileBuildFingerprintSha256,
    contractEpoch: 2,
    binaryRelation: 'active_production',
    platforms,
    generatedAt: '2026-10-03T00:00:00.000Z',
    receiptSha256: '',
  }
  receipt.receiptSha256 = createHash('sha256')
    .update(canonicalJson({ ...receipt, receiptSha256: undefined })).digest('hex')
  return receipt
}

function fixture(overrides = {}) {
  const providerReadiness = Object.fromEntries(
    PROVIDER_READINESS_KEYS.map((provider) => [provider, provider !== 'deepseek']),
  )
  const release = {
    environment: 'production',
    releaseLane: 'plan55-production-only',
    releaseId,
    gitSha: sourceSha,
    mobileBuildFingerprintSha256: 'e'.repeat(64),
    providerReadiness,
    providerReadinessFingerprintSha256: createHash('sha256').update(canonicalJson(providerReadiness)).digest('hex'),
    activeClientCompatibility: {
      ios: {
        easBuildId: '00000000-0000-4000-8000-000000000001',
        applicationId: 'com.phanmanhtu.homeservices',
        minimumBuildNumber: 45,
        runtimeVersion: '0.2.0',
      },
      android: {
        easBuildId: '00000000-0000-4000-8000-000000000002',
        applicationId: 'com.phanmanhtu.nestscout',
        minimumBuildNumber: 4,
        runtimeVersion: '0.2.0',
      },
    },
  }
  const hostedBefore = {
    environment: 'production',
    projectRef: policy.projectRef,
    releaseId: policy.productionSourceBase.releaseId,
    gitSha: policy.productionSourceBase.sha,
    migrations: [{ version: '20261001000000', name: 'base' }],
    managedEdgeFunctions: {
      'mobile-api': {
        status: 'ACTIVE',
        version: 42,
        ezbr_sha256: 'c'.repeat(64),
        verify_jwt: true,
        import_map: 'supabase/functions/mobile-api/deno.json',
        entrypoint_path: 'supabase/functions/mobile-api/index.ts',
        import_map_path: 'supabase/functions/mobile-api/deno.json',
      },
    },
  }
  const hostedRollback = structuredClone(hostedBefore)
  const changed = overrides.hostedBefore ?? {}
  Object.assign(hostedBefore, changed)
  if (overrides.rollbackMigrations) hostedRollback.migrations = overrides.rollbackMigrations
  if (overrides.rollbackEdgeVersion) {
    hostedRollback.managedEdgeFunctions['mobile-api'].version = overrides.rollbackEdgeVersion
  }
  const releaseBytes = bytes(release)
  const hostedBeforeBytes = bytes(hostedBefore)
  const hostedRollbackBytes = bytes(hostedRollback)
  const binaryAttestation = overrides.mobileBinaryAttestation ?? mobileBinaryAttestation(release)
  const mobileBinaryAttestationBytes = bytes(binaryAttestation)
  const rollbackSourceSha256 = overrides.rollbackSourceSha256 ?? 'd'.repeat(64)
  const files = new Map([
    ['release.json', releaseBytes],
    ['hosted-before.json', hostedBeforeBytes],
    ['hosted-rollback-snapshot.json', hostedRollbackBytes],
    ['rollback-mobile-source-sha256.txt', Buffer.from(`${rollbackSourceSha256}\n`)],
    ['mobile-binary-attestation.json', mobileBinaryAttestationBytes],
  ])
  return {
    release,
    releaseBytes,
    hostedBefore,
    hostedBeforeBytes,
    hostedRollback,
    hostedRollbackBytes,
    binaryAttestation,
    mobileBinaryAttestationBytes,
    rollbackSourceSha256,
    files,
  }
}

function build(input = fixture()) {
  return buildPlan55ReleaseStageGateProofs({
    policy,
    ...input,
    provenance,
  })
}

function withLiveProviderProbeEvidence(input = fixture(), mutate = (value) => value) {
  const actorSha256 = 'a'.repeat(64)
  const androidReceiptSha256 = '3'.repeat(64)
  const iosReceiptSha256 = '5'.repeat(64)
  const receiptSetSha256 = createHash('sha256')
    .update(canonicalJson([androidReceiptSha256, iosReceiptSha256].sort())).digest('hex')
  const evidence = mutate({
    schemaVersion: 'plan55-live-provider-probe.v1',
    status: 'PASS',
    environment: 'production',
    projectRef: policy.projectRef,
    releaseId: input.release.releaseId,
    sourceSha: input.release.gitSha,
    workflowPath: provenance.workflowPath,
    runId: provenance.runId,
    runAttempt: provenance.runAttempt,
    observedAt: new Date().toISOString(),
    syntheticActorIdSha256: actorSha256,
    providers: {
      android_fcm_v1: {
        status: 'PASS', provider: 'android_fcm_v1', platform: 'android', transport: 'expo',
        ticketStatus: 'ok', receiptStatus: 'ok', deviceTokenSha256: '1'.repeat(64),
        ticketIdSha256: '2'.repeat(64), receiptIdSha256: androidReceiptSha256,
        syntheticActorIdSha256: actorSha256,
      },
      ios_apns: {
        status: 'PASS', provider: 'ios_apns', platform: 'ios', transport: 'expo',
        ticketStatus: 'ok', receiptStatus: 'ok', deviceTokenSha256: '6'.repeat(64),
        ticketIdSha256: '4'.repeat(64), receiptIdSha256: iosReceiptSha256,
        syntheticActorIdSha256: actorSha256,
      },
      push_receipt_reconciler: {
        status: 'PASS', provider: 'push_receipt_reconciler', checkedCount: 2,
        appliedCount: 2, unresolvedCount: 0, failedCount: 0,
        receiptSetSha256, syntheticActorIdSha256: actorSha256,
      },
    },
  })
  const providerProbeEvidenceBytes = bytes(evidence)
  const files = new Map(input.files)
  files.set('provider-readiness-live.json', providerProbeEvidenceBytes)
  return { ...input, providerProbeEvidenceBytes, files }
}

test('builds the four Production baseline and rollback proofs from exact hosted snapshots', () => {
  assert.ok(PLAN55_RELEASE_STAGE_GATES.includes('plan55-exact-binary-release-attestation'))
  const input = fixture()
  const proofs = build(input)
  assert.deepEqual(Object.keys(proofs).sort(), [...PLAN55_RELEASE_STAGE_GATES].sort())
  assert.equal(proofs['hosted-drift-baseline'].baseline.sourceSha, policy.productionSourceBase.sha)
  assert.equal(proofs['plan55-production-target-attestation'].baseline.releaseId,
    policy.productionSourceBase.releaseId)
  assert.equal(proofs['compatible-rollback-target'].rollback.snapshotSha256,
    createHash('sha256').update(input.hostedRollbackBytes).digest('hex'))
  assert.equal(proofs['plan55-rollback-preflight'].rollback.sourceSha256, input.rollbackSourceSha256)
  assert.equal(proofs['plan55-exact-binary-release-attestation'].binaryAttestationSha256,
    createHash('sha256').update(input.mobileBinaryAttestationBytes).digest('hex'))
  for (const gate of PLAN55_RELEASE_STAGE_GATES) {
    if (gate === 'plan55-full-production-readiness') {
      assert.equal(proofs[gate].status, 'BLOCKED')
      continue
    }
    assert.equal(assertPlan55ReleaseStageGateProof(proofs[gate], {
      gate, policy, release: input.release, provenance, sourceArtifactFiles: input.files,
    }), true)
  }
  assert.doesNotMatch(JSON.stringify(proofs), /projectUrl|serviceRoleKey|TEST_SECRET/u)
})

test('full Production readiness requires exact-source live push and reconciler evidence', () => {
  const gate = 'plan55-full-production-readiness'
  assert.ok(PLAN55_RELEASE_STAGE_GATES.includes(gate))

  const configuredOnly = fixture()
  const blocked = build(configuredOnly)[gate]
  assert.equal(blocked.status, 'BLOCKED')
  for (const provider of ['android_fcm_v1', 'ios_apns', 'push_receipt_reconciler']) {
    assert.ok(blocked.checks.some(({ id, outcome }) =>
      id === `production_provider_${provider}_ready` && outcome === 'failure'), provider)
  }
  assert.throws(() => assertPlan55ReleaseStageGateProof(blocked, {
    gate, policy, release: configuredOnly.release, provenance, sourceArtifactFiles: configuredOnly.files,
  }), /proof contract/u)

  const input = withLiveProviderProbeEvidence(fixture())
  const proof = build(input)[gate]
  assert.equal(proof.status, 'PASS')
  assert.ok(proof.checks.every(({ outcome }) => outcome === 'success'))
  assert.equal(proof.providerProbeEvidenceSha256,
    createHash('sha256').update(input.providerProbeEvidenceBytes).digest('hex'))
  assert.equal(assertPlan55ReleaseStageGateProof(proof, {
    gate, policy, release: input.release, provenance, sourceArtifactFiles: input.files,
  }), true)
  const tamperedEvidenceFiles = new Map(input.files)
  const tamperedProbe = JSON.parse(input.providerProbeEvidenceBytes.toString('utf8'))
  tamperedProbe.providers.android_fcm_v1.receiptStatus = 'error'
  tamperedEvidenceFiles.set('provider-readiness-live.json', bytes(tamperedProbe))
  assert.throws(() => assertPlan55ReleaseStageGateProof(proof, {
    gate, policy, release: input.release, provenance, sourceArtifactFiles: tamperedEvidenceFiles,
  }), /proof contract/u)
  const omittedEvidenceFiles = new Map(input.files)
  omittedEvidenceFiles.delete('provider-readiness-live.json')
  assert.throws(() => assertPlan55ReleaseStageGateProof(proof, {
    gate, policy, release: input.release, provenance, sourceArtifactFiles: omittedEvidenceFiles,
  }), /proof contract/u)

  for (const provider of PRODUCTION_REQUIRED_PROVIDERS) {
    const providerReadiness = { ...input.release.providerReadiness, [provider]: false }
    const blockedInput = withLiveProviderProbeEvidence(replaceRelease(input, {
      ...input.release,
      providerReadiness,
      providerReadinessFingerprintSha256: createHash('sha256')
        .update(canonicalJson(providerReadiness)).digest('hex'),
    }))
    const blockedProof = build(blockedInput)[gate]
    assert.equal(blockedProof.status, 'BLOCKED', provider)
    assert.ok(blockedProof.checks.some(({ id, outcome }) =>
      id === `production_provider_${provider}_ready` && outcome === 'failure'), provider)
    assert.equal(blockedProof.providerReadinessFingerprintSha256,
      blockedInput.release.providerReadinessFingerprintSha256)
    assert.throws(() => assertPlan55ReleaseStageGateProof(blockedProof, {
      gate, policy, release: blockedInput.release, provenance, sourceArtifactFiles: blockedInput.files,
    }), /proof contract/u)

    const forgedProof = {
      ...proof,
      providerReadinessFingerprintSha256: blockedInput.release.providerReadinessFingerprintSha256,
    }
    assert.throws(() => assertPlan55ReleaseStageGateProof(forgedProof, {
      gate, policy, release: blockedInput.release, provenance,
    }), /proof contract/u)
  }

  const changedReadiness = { ...input.release.providerReadiness, ios_apns: false }
  const changedArtifact = replaceRelease(input, {
    ...input.release,
    providerReadiness: changedReadiness,
    providerReadinessFingerprintSha256: createHash('sha256')
      .update(canonicalJson(changedReadiness)).digest('hex'),
  })
  assert.throws(() => assertPlan55ReleaseStageGateProof(proof, {
    gate, policy, release: input.release, provenance, sourceArtifactFiles: changedArtifact.files,
  }), /does not match source artifacts/u)

  const staleFingerprint = replaceRelease(input, {
    ...input.release,
    providerReadinessFingerprintSha256: 'f'.repeat(64),
  })
  assert.throws(() => build(staleFingerprint), /provider readiness fingerprint/u)

  const malformedReadiness = { ...input.release.providerReadiness, ios_apns: 'true' }
  const malformedInput = replaceRelease(input, {
    ...input.release,
    providerReadiness: malformedReadiness,
    providerReadinessFingerprintSha256: createHash('sha256')
      .update(canonicalJson(malformedReadiness)).digest('hex'),
  })
  assert.throws(() => build(malformedInput), /provider readiness evidence is invalid/u)
})

test('live provider evidence rejects stale, wrong-source, and cross-actor receipts', () => {
  const gate = 'plan55-full-production-readiness'
  const invalidEvidence = [
    (value) => ({ ...value, sourceSha: 'f'.repeat(40) }),
    (value) => ({ ...value, observedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }),
    (value) => ({ ...value, providers: {
      ...value.providers,
      ios_apns: { ...value.providers.ios_apns, syntheticActorIdSha256: 'f'.repeat(64) },
    } }),
    (value) => ({ ...value, providers: {
      ...value.providers,
      push_receipt_reconciler: { ...value.providers.push_receipt_reconciler, unresolvedCount: 1 },
    } }),
  ]
  for (const mutate of invalidEvidence) {
    const input = withLiveProviderProbeEvidence(fixture(), mutate)
    assert.equal(build(input)[gate].status, 'BLOCKED')
  }
})

test('refuses a Production baseline that is not the pinned source and project', () => {
  for (const hostedBefore of [
    { projectRef: 'wrong-project' },
    { gitSha: 'f'.repeat(40) },
    { releaseId: 'harness-ffffffffffff-ffffffffffff' },
  ]) {
    assert.throws(() => build(fixture({ hostedBefore })), /Production baseline/u)
  }
})

test('refuses a rollback snapshot that differs from the captured Production baseline', () => {
  assert.throws(() => build(fixture({
    rollbackMigrations: [{ version: '20261001000001', name: 'different' }],
  })), /rollback snapshot/u)
  assert.throws(() => build(fixture({ rollbackEdgeVersion: 43 })), /rollback snapshot/u)
  assert.throws(() => build(fixture({ rollbackSourceSha256: 'not-a-sha' })), /rollback source/u)
})

test('refuses an invalid or non-active-Production binary attestation', () => {
  const input = fixture()
  const wrongRelease = { ...input.binaryAttestation, releaseId: 'harness-ffffffffffff-ffffffffffff' }
  assert.throws(() => build(fixture({ mobileBinaryAttestation: wrongRelease })), /binary attestation is invalid/u)
  const wrongRelation = { ...input.binaryAttestation, binaryRelation: 'exact' }
  assert.throws(() => build(fixture({ mobileBinaryAttestation: wrongRelation })), /binary attestation is invalid/u)
})

test('rejects proof edits and source snapshot changes after proof generation', () => {
  const input = fixture()
  const proof = build(input)['compatible-rollback-target']
  const changedFiles = new Map(input.files)
  changedFiles.set('hosted-before.json', bytes({ ...input.hostedBefore, gitSha: 'f'.repeat(40) }))
  assert.throws(() => assertPlan55ReleaseStageGateProof(proof, {
    gate: 'compatible-rollback-target', policy, release: input.release, provenance,
    sourceArtifactFiles: changedFiles,
  }), /Production baseline/u)
  assert.throws(() => assertPlan55ReleaseStageGateProof({ ...proof, status: 'SKIPPED' }, {
    gate: 'compatible-rollback-target', policy, release: input.release, provenance,
  }), /proof contract/u)
  const binaryProof = build(input)['plan55-exact-binary-release-attestation']
  const changedBinaryFiles = new Map(input.files)
  changedBinaryFiles.set('mobile-binary-attestation.json', bytes({ ...input.binaryAttestation, releaseId: 'harness-ffffffffffff-ffffffffffff' }))
  assert.throws(() => assertPlan55ReleaseStageGateProof(binaryProof, {
    gate: 'plan55-exact-binary-release-attestation', policy, release: input.release, provenance,
    sourceArtifactFiles: changedBinaryFiles,
  }), /binary attestation is invalid/u)
})
