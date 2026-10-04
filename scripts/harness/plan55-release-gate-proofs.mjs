import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyMobileBinaryAttestation } from './mobile-binary-attestation.mjs'
import { PRODUCTION_REQUIRED_PROVIDERS, PROVIDER_READINESS_KEYS } from './release-bundle.mjs'
const POLICY_PATH = 'config/harness/plan55-production-only-policy.json'

const RELEASE_PROOF_SCHEMA = 'plan55-release-stage-gate-proof.v1'
const LIVE_PROVIDER_PROBE_SCHEMA = 'plan55-live-provider-probe.v1'
const GIT_SHA = /^[a-f0-9]{40}$/u
const SHA256 = /^[a-f0-9]{64}$/u
const LIVE_PROVIDER_PROBE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const LIVE_PUSH_PROVIDERS = Object.freeze(['android_fcm_v1', 'ios_apns', 'push_receipt_reconciler'])
const RELEASE_STAGE_CHECKS = Object.freeze({
  'hosted-drift-baseline': Object.freeze([
    'production_target_pinned', 'active_release_pinned', 'hosted_migrations_snapshotted',
    'mobile_api_runtime_snapshotted',
  ]),
  'compatible-rollback-target': Object.freeze([
    'rollback_release_matches_production', 'rollback_migrations_match',
    'mobile_api_runtime_matches',
  ]),
  'plan55-production-target-attestation': Object.freeze([
    'production_project_ref_pinned', 'production_source_sha_pinned',
    'production_release_id_pinned', 'release_lane_source_bound',
  ]),
  'plan55-rollback-preflight': Object.freeze([
    'rollback_snapshot_matches_production', 'rollback_mobile_api_source_fingerprinted',
  ]),
  'plan55-exact-binary-release-attestation': Object.freeze([
    'active_ios_binary_attested', 'active_android_binary_attested',
    'binary_attestation_matches_release',
  ]),
  'plan55-full-production-readiness': Object.freeze(
    PRODUCTION_REQUIRED_PROVIDERS.map((provider) => `production_provider_${provider}_ready`),
  ),
})

export const PLAN55_RELEASE_STAGE_GATES = Object.freeze(Object.keys(RELEASE_STAGE_CHECKS))

const EDGE_IDENTITY_FIELDS = Object.freeze([
  'status', 'version', 'ezbr_sha256', 'verify_jwt', 'import_map', 'entrypoint_path', 'import_map_path',
])
const PROOF_KEYS = Object.freeze([
  'schemaVersion', 'gate', 'status', 'environment', 'projectRef', 'policyId', 'policySha256',
  'releaseId', 'sourceSha', 'workflowPath', 'runId', 'runAttempt', 'baseline', 'rollback',
  'binaryAttestationSha256', 'providerReadinessFingerprintSha256', 'providerProbeEvidenceSha256', 'checks',
])
const SNAPSHOT_KEYS = Object.freeze([
  'environment', 'projectRef', 'releaseId', 'sourceSha', 'snapshotSha256', 'migrationsSha256',
  'mobileApiSha256',
])

export function buildPlan55ReleaseStageGateProofs({
  policy, releaseBytes, hostedBeforeBytes, hostedRollbackBytes,
  rollbackSourceSha256, mobileBinaryAttestationBytes, providerProbeEvidenceBytes, provenance,
}) {
  const release = parseJsonBuffer(releaseBytes, 'Plan 55 release manifest')
  const hostedBefore = parseJsonBuffer(hostedBeforeBytes, 'Production baseline snapshot')
  const hostedRollback = parseJsonBuffer(hostedRollbackBytes, 'rollback hosted snapshot')
  const mobileBinaryAttestation = parseJsonBuffer(mobileBinaryAttestationBytes, 'active Production mobile binary attestation')
  assertProviderReadiness(release)
  const sourceDigest = typeof rollbackSourceSha256 === 'string' ? rollbackSourceSha256.trim() : ''
  assertReleaseIdentity(policy, release)
  assertWorkflowRun(policy, provenance)
  assertPinnedProductionBaseline(policy, hostedBefore)
  assertRollbackSnapshot(hostedBefore, hostedRollback)
  if (!SHA256.test(sourceDigest)) throw new Error('Plan 55 rollback source fingerprint is invalid')
  if (mobileBinaryAttestation.binaryRelation !== 'active_production' ||
      verifyMobileBinaryAttestation(mobileBinaryAttestation, release).length > 0) {
    throw new Error('Plan 55 active Production mobile binary attestation is invalid')
  }

  const baseline = snapshotIdentity(hostedBefore, hostedBeforeBytes)
  const binaryAttestationSha256 = sha256(mobileBinaryAttestationBytes)
  const hasLiveProviderProbe = isValidLiveProviderProbeEvidence(
    providerProbeEvidenceBytes, { policy, release, provenance },
  )
  const rollback = {
    ...snapshotIdentity(hostedRollback, hostedRollbackBytes),
    sourceSha256: sourceDigest,
  }
  // Manifest values describe configured state; only a current, exact-source probe may prove push readiness.
  return Object.fromEntries(PLAN55_RELEASE_STAGE_GATES.map((gate) => {
    const readinessChecks = gate === 'plan55-full-production-readiness'
    const checks = RELEASE_STAGE_CHECKS[gate].map((id, index) => ({
      id,
      outcome: !readinessChecks || (release.providerReadiness[PRODUCTION_REQUIRED_PROVIDERS[index]] &&
        (!LIVE_PUSH_PROVIDERS.includes(PRODUCTION_REQUIRED_PROVIDERS[index]) || hasLiveProviderProbe))
        ? 'success'
        : 'failure',
    }))
    return [gate, {
      schemaVersion: RELEASE_PROOF_SCHEMA,
      gate,
      status: !readinessChecks || checks.every(({ outcome }) => outcome === 'success') ? 'PASS' : 'BLOCKED',
      environment: policy.environment,
      projectRef: policy.projectRef,
      policyId: policy.policyId,
      policySha256: policy.policySha256,
      releaseId: release.releaseId,
      sourceSha: release.gitSha,
      workflowPath: provenance.workflowPath,
      runId: provenance.runId,
      runAttempt: provenance.runAttempt,
      baseline,
      rollback,
      binaryAttestationSha256,
      providerReadinessFingerprintSha256: release.providerReadinessFingerprintSha256,
      providerProbeEvidenceSha256: readinessChecks && hasLiveProviderProbe
        ? sha256(providerProbeEvidenceBytes)
        : null,
      checks,
    }]
  }))
}

export function assertPlan55ReleaseStageGateProof(proof, {
  gate, policy, release, provenance, sourceArtifactFiles,
}) {
  const fail = () => { throw new Error(`Plan 55 release stage proof contract failed: ${gate ?? 'unknown'}`) }
  try {
    assertProviderReadiness(release)
  } catch {
    fail()
  }
  const expectedWorkflow = policy?.trustedEvidenceWorkflowPathsByGate?.[gate]
  const checkIds = RELEASE_STAGE_CHECKS[gate]
  let providerProbeEvidenceBytes
  if (gate === 'plan55-full-production-readiness') {
    if (!(sourceArtifactFiles instanceof Map)) fail()
    try {
      providerProbeEvidenceBytes = uniqueArtifactFile(sourceArtifactFiles, 'provider-readiness-live.json')
    } catch {
      fail()
    }
  }
  if (!checkIds || !proof || typeof proof !== 'object' || Array.isArray(proof) ||
      JSON.stringify(Object.keys(proof).sort()) !== JSON.stringify([...PROOF_KEYS].sort()) ||
      proof.schemaVersion !== RELEASE_PROOF_SCHEMA || proof.gate !== gate || proof.status !== 'PASS' ||
      proof.environment !== policy.environment || proof.environment !== 'production' ||
      proof.projectRef !== policy.projectRef || proof.policyId !== policy.policyId ||
      proof.policySha256 !== policy.policySha256 || proof.releaseId !== release?.releaseId ||
      proof.sourceSha !== release?.gitSha || !GIT_SHA.test(proof.sourceSha ?? '') ||
      proof.workflowPath !== expectedWorkflow ||
      !policy.trustedEvidenceWorkflowPaths?.includes(expectedWorkflow) ||
      proof.workflowPath !== provenance?.workflowPath || proof.runId !== String(provenance?.runId) ||
      proof.runAttempt !== provenance?.runAttempt || !Number.isSafeInteger(proof.runAttempt) ||
      proof.runAttempt < 1 || !isSnapshotIdentity(proof.baseline, policy) ||
      !isSnapshotIdentity(proof.rollback, policy, true) ||
      (gate === 'plan55-full-production-readiness' &&
        !PRODUCTION_REQUIRED_PROVIDERS.every((provider) => release.providerReadiness[provider] === true)) ||
      !SHA256.test(proof.binaryAttestationSha256 ?? '') ||
      proof.providerReadinessFingerprintSha256 !== release?.providerReadinessFingerprintSha256 ||
      !SHA256.test(proof.providerReadinessFingerprintSha256 ?? '') ||
      (gate === 'plan55-full-production-readiness'
        ? proof.providerProbeEvidenceSha256 !== sha256(providerProbeEvidenceBytes) ||
          !isValidLiveProviderProbeEvidence(providerProbeEvidenceBytes, { policy, release, provenance })
        : proof.providerProbeEvidenceSha256 !== null) ||
      !Array.isArray(proof.checks) || proof.checks.length !== checkIds.length ||
      proof.checks.some((check, index) => !check || typeof check !== 'object' || Array.isArray(check) ||
        JSON.stringify(Object.keys(check).sort()) !== JSON.stringify(['id', 'outcome']) ||
        check.id !== checkIds[index] || check.outcome !== 'success')) fail()

  if (!isSameRollbackIdentity(proof.baseline, proof.rollback)) fail()
  if (sourceArtifactFiles instanceof Map) {
    const expected = buildPlan55ReleaseStageGateProofs({
      policy,
      releaseBytes: uniqueArtifactFile(sourceArtifactFiles, 'release.json'),
      hostedBeforeBytes: uniqueArtifactFile(sourceArtifactFiles, 'hosted-before.json'),
      hostedRollbackBytes: uniqueArtifactFile(sourceArtifactFiles, 'hosted-rollback-snapshot.json'),
      rollbackSourceSha256: uniqueArtifactFile(sourceArtifactFiles, 'rollback-mobile-source-sha256.txt')
        .toString('utf8'),
      mobileBinaryAttestationBytes: uniqueArtifactFile(sourceArtifactFiles, 'mobile-binary-attestation.json'),
      providerProbeEvidenceBytes,
      provenance,
    })[gate]
    if (JSON.stringify(proof) !== JSON.stringify(expected)) {
      throw new Error(`Plan 55 release stage proof does not match source artifacts: ${gate}`)
    }
  }
  return true
}

function assertReleaseIdentity(policy, release) {
  if (policy?.environment !== 'production' || release?.environment !== policy.environment ||
      release.releaseLane !== 'plan55-production-only' || !GIT_SHA.test(release.gitSha ?? '') ||
      !new RegExp(`^harness-${release.gitSha.slice(0, 12)}-[a-f0-9]{12}$`, 'u')
        .test(release.releaseId ?? '')) {
    throw new Error('Plan 55 release source identity is invalid')
  }
}

function assertProviderReadiness(release) {
  const readiness = release?.providerReadiness
  if (!readiness || typeof readiness !== 'object' || Array.isArray(readiness) ||
      JSON.stringify(Object.keys(readiness).sort()) !== JSON.stringify([...PROVIDER_READINESS_KEYS].sort()) ||
      PROVIDER_READINESS_KEYS.some((provider) => typeof readiness[provider] !== 'boolean')) {
    throw new Error('Plan 55 provider readiness evidence is invalid')
  }
  const expectedFingerprint = sha256(Buffer.from(canonicalJson(readiness)))
  if (!SHA256.test(release.providerReadinessFingerprintSha256 ?? '') ||
      release.providerReadinessFingerprintSha256 !== expectedFingerprint) {
    throw new Error('Plan 55 provider readiness fingerprint is invalid')
  }
}

function isValidLiveProviderProbeEvidence(value, { policy, release, provenance }) {
  try {
    const evidence = parseJsonBuffer(value, 'Plan 55 live provider probe evidence')
    if (!hasExactKeys(evidence, [
      'schemaVersion', 'status', 'environment', 'projectRef', 'releaseId', 'sourceSha',
      'workflowPath', 'runId', 'runAttempt', 'observedAt', 'syntheticActorIdSha256', 'providers',
    ]) || evidence.schemaVersion !== LIVE_PROVIDER_PROBE_SCHEMA || evidence.status !== 'PASS' ||
        evidence.environment !== 'production' || evidence.projectRef !== policy?.projectRef ||
        evidence.releaseId !== release?.releaseId || evidence.sourceSha !== release?.gitSha ||
        evidence.workflowPath !== provenance?.workflowPath || evidence.runId !== String(provenance?.runId) ||
        evidence.runAttempt !== provenance?.runAttempt || !SHA256.test(evidence.syntheticActorIdSha256 ?? '') ||
        !isRecentTimestamp(evidence.observedAt) ||
        !hasExactKeys(evidence.providers, LIVE_PUSH_PROVIDERS)) return false

    const android = evidence.providers.android_fcm_v1
    const ios = evidence.providers.ios_apns
    const reconciler = evidence.providers.push_receipt_reconciler
    if (!isValidPushProviderReceipt(android, {
      provider: 'android_fcm_v1', platform: 'android', actorSha256: evidence.syntheticActorIdSha256,
    }) || !isValidPushProviderReceipt(ios, {
      provider: 'ios_apns', platform: 'ios', actorSha256: evidence.syntheticActorIdSha256,
    })) return false

    const receiptSetSha256 = sha256(Buffer.from(canonicalJson([
      android.receiptIdSha256, ios.receiptIdSha256,
    ].sort())))
    return hasExactKeys(reconciler, [
      'status', 'provider', 'checkedCount', 'appliedCount', 'unresolvedCount', 'failedCount',
      'receiptSetSha256', 'syntheticActorIdSha256',
    ]) && reconciler.status === 'PASS' && reconciler.provider === 'push_receipt_reconciler' &&
      Number.isSafeInteger(reconciler.checkedCount) && reconciler.checkedCount >= 2 &&
      reconciler.appliedCount === reconciler.checkedCount && reconciler.unresolvedCount === 0 &&
      reconciler.failedCount === 0 && reconciler.receiptSetSha256 === receiptSetSha256 &&
      reconciler.syntheticActorIdSha256 === evidence.syntheticActorIdSha256
  } catch {
    return false
  }
}

function isValidPushProviderReceipt(value, { provider, platform, actorSha256 }) {
  return hasExactKeys(value, [
    'status', 'provider', 'platform', 'transport', 'ticketStatus', 'receiptStatus',
    'deviceTokenSha256', 'ticketIdSha256', 'receiptIdSha256', 'syntheticActorIdSha256',
  ]) && value.status === 'PASS' && value.provider === provider && value.platform === platform &&
    value.transport === 'expo' && value.ticketStatus === 'ok' && value.receiptStatus === 'ok' &&
    SHA256.test(value.deviceTokenSha256 ?? '') && SHA256.test(value.ticketIdSha256 ?? '') &&
    SHA256.test(value.receiptIdSha256 ?? '') && value.syntheticActorIdSha256 === actorSha256
}

function hasExactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()))
}

function isRecentTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false
  const timestamp = Date.parse(value)
  const age = Date.now() - timestamp
  return Number.isFinite(timestamp) && age >= -5 * 60 * 1000 && age <= LIVE_PROVIDER_PROBE_MAX_AGE_MS
}

function assertWorkflowRun(policy, provenance) {
  if (!provenance || typeof provenance !== 'object' ||
      !policy.trustedEvidenceWorkflowPaths?.includes(provenance.workflowPath) ||
      !/^[1-9]\d*$/u.test(String(provenance.runId)) ||
      !Number.isSafeInteger(provenance.runAttempt) || provenance.runAttempt < 1 ||
      PLAN55_RELEASE_STAGE_GATES.some((gate) =>
        policy.trustedEvidenceWorkflowPathsByGate?.[gate] !== provenance.workflowPath)) {
    throw new Error('Plan 55 release evidence workflow identity is invalid')
  }
}

function assertPinnedProductionBaseline(policy, hosted) {
  const edge = hosted?.managedEdgeFunctions?.['mobile-api']
  const pinned = policy?.productionSourceBase
  if (!pinned || hosted?.environment !== 'production' || hosted.projectRef !== policy.projectRef ||
      hosted.releaseId !== pinned.releaseId || hosted.gitSha !== pinned.sha ||
      !Array.isArray(hosted.migrations) || !isValidMobileApiIdentity(edge)) {
    throw new Error('Plan 55 Production baseline does not match the pinned Production source')
  }
}

function assertRollbackSnapshot(before, rollback) {
  const beforeEdge = before?.managedEdgeFunctions?.['mobile-api']
  const rollbackEdge = rollback?.managedEdgeFunctions?.['mobile-api']
  if (rollback?.environment !== before.environment || rollback.projectRef !== before.projectRef ||
      rollback.releaseId !== before.releaseId || rollback.gitSha !== before.gitSha ||
      !Array.isArray(rollback.migrations) || JSON.stringify(rollback.migrations) !== JSON.stringify(before.migrations) ||
      !isValidMobileApiIdentity(rollbackEdge) || !sameMobileApiIdentity(beforeEdge, rollbackEdge)) {
    throw new Error('Plan 55 rollback snapshot does not match the pinned Production snapshot')
  }
}

function snapshotIdentity(snapshot, bytes) {
  const edge = snapshot.managedEdgeFunctions['mobile-api']
  return {
    environment: snapshot.environment,
    projectRef: snapshot.projectRef,
    releaseId: snapshot.releaseId,
    sourceSha: snapshot.gitSha,
    snapshotSha256: sha256(bytes),
    migrationsSha256: sha256(Buffer.from(JSON.stringify(snapshot.migrations))),
    mobileApiSha256: sha256(Buffer.from(JSON.stringify(pickMobileApiIdentity(edge)))),
  }
}

function isSnapshotIdentity(value, policy, includesSourceFingerprint = false) {
  const pinned = policy?.productionSourceBase
  const expectedKeys = includesSourceFingerprint ? [...SNAPSHOT_KEYS, 'sourceSha256'] : SNAPSHOT_KEYS
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expectedKeys].sort()) &&
    value.environment === 'production' && value.projectRef === policy?.projectRef &&
    value.releaseId === pinned?.releaseId && value.sourceSha === pinned?.sha &&
    SHA256.test(value.snapshotSha256 ?? '') && SHA256.test(value.migrationsSha256 ?? '') &&
    SHA256.test(value.mobileApiSha256 ?? '') &&
    (!includesSourceFingerprint || SHA256.test(value.sourceSha256 ?? '')))
}

function isSameRollbackIdentity(baseline, rollback) {
  return baseline.environment === rollback.environment && baseline.projectRef === rollback.projectRef &&
    baseline.releaseId === rollback.releaseId && baseline.sourceSha === rollback.sourceSha &&
    baseline.migrationsSha256 === rollback.migrationsSha256 &&
    baseline.mobileApiSha256 === rollback.mobileApiSha256
}

function isValidMobileApiIdentity(value) {
  return Boolean(value && value.status === 'ACTIVE' && Number.isSafeInteger(value.version) &&
    value.version > 0 && SHA256.test(value.ezbr_sha256 ?? '') && typeof value.verify_jwt === 'boolean' &&
    typeof value.import_map === 'string' && value.import_map.length > 0 &&
    typeof value.entrypoint_path === 'string' && value.entrypoint_path.length > 0 &&
    typeof value.import_map_path === 'string' && value.import_map_path.length > 0)
}

function sameMobileApiIdentity(left, right) {
  return JSON.stringify(pickMobileApiIdentity(left)) === JSON.stringify(pickMobileApiIdentity(right))
}

function pickMobileApiIdentity(value) {
  return Object.fromEntries(EDGE_IDENTITY_FIELDS.map((field) => [field, value?.[field]]))
}

function uniqueArtifactFile(files, name) {
  const matches = [...files].filter(([path, bytes]) =>
    (path === name || path.endsWith(`/${name}`)) && Buffer.isBuffer(bytes))
  if (matches.length !== 1) throw new Error(`Plan 55 source artifact file is missing or ambiguous: ${name}`)
  return matches[0][1]
}

function parseJsonBuffer(value, label) {
  if (!Buffer.isBuffer(value) || value.length === 0) throw new Error(`${label} is missing`)
  try {
    const parsed = JSON.parse(value.toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid object')
    return parsed
  } catch {
    throw new Error(`${label} is invalid JSON`)
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
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

function parseArgs(argv) {
  const result = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || !value || result.has(key.slice(2))) {
      throw new Error('Plan 55 release proof arguments are invalid')
    }
    result.set(key.slice(2), value)
  }
  const required = [
    'release', 'hosted-before', 'hosted-rollback-snapshot', 'rollback-mobile-source-sha256',
    'mobile-binary-attestation', 'output',
  ]
  if (required.some((key) => !result.has(key))) throw new Error('Plan 55 release proof arguments are incomplete')
  return result
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const policyBytes = readFileSync(resolve(POLICY_PATH))
  const policy = {
    ...JSON.parse(policyBytes.toString('utf8')),
    policySha256: sha256(policyBytes),
  }
  const provenance = {
    workflowPath: policy.trustedEvidenceWorkflowPathsByGate[PLAN55_RELEASE_STAGE_GATES[0]],
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  }
  const proofs = buildPlan55ReleaseStageGateProofs({
    policy,
    releaseBytes: readFileSync(resolve(options.get('release'))),
    hostedBeforeBytes: readFileSync(resolve(options.get('hosted-before'))),
    hostedRollbackBytes: readFileSync(resolve(options.get('hosted-rollback-snapshot'))),
    rollbackSourceSha256: readFileSync(resolve(options.get('rollback-mobile-source-sha256')), 'utf8'),
    mobileBinaryAttestationBytes: readFileSync(resolve(options.get('mobile-binary-attestation'))),
    providerProbeEvidenceBytes: options.has('provider-probe-evidence')
      ? readFileSync(resolve(options.get('provider-probe-evidence')))
      : undefined,
    provenance,
  })
  const output = resolve(options.get('output'))
  const root = resolve(process.cwd())
  const local = relative(root, output)
  if (!local || local.startsWith('..') || isAbsolute(local) || local.split(sep).includes('..')) {
    throw new Error('Plan 55 release proof output escapes repository root')
  }
  mkdirSync(dirname(resolve(output, 'proof-placeholder')), { recursive: true })
  for (const [gate, proof] of Object.entries(proofs)) {
    writeFileSync(resolve(output, `${gate}.json`), `${JSON.stringify(proof)}\n`, { flag: 'wx' })
  }
  console.log(`Plan 55 release gate proofs written: ${Object.keys(proofs).length}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Plan 55 release proof generation failed')
    process.exitCode = 1
  }
}
