import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
const POLICY_PATH = 'config/harness/plan55-production-only-policy.json'

const RELEASE_PROOF_SCHEMA = 'plan55-release-stage-gate-proof.v1'
const GIT_SHA = /^[a-f0-9]{40}$/u
const SHA256 = /^[a-f0-9]{64}$/u
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
})

export const PLAN55_RELEASE_STAGE_GATES = Object.freeze(Object.keys(RELEASE_STAGE_CHECKS))

const EDGE_IDENTITY_FIELDS = Object.freeze([
  'status', 'version', 'ezbr_sha256', 'verify_jwt', 'import_map', 'entrypoint_path', 'import_map_path',
])
const PROOF_KEYS = Object.freeze([
  'schemaVersion', 'gate', 'status', 'environment', 'projectRef', 'policyId', 'policySha256',
  'releaseId', 'sourceSha', 'workflowPath', 'runId', 'runAttempt', 'baseline', 'rollback', 'checks',
])
const SNAPSHOT_KEYS = Object.freeze([
  'environment', 'projectRef', 'releaseId', 'sourceSha', 'snapshotSha256', 'migrationsSha256',
  'mobileApiSha256',
])

export function buildPlan55ReleaseStageGateProofs({
  policy, releaseBytes, hostedBeforeBytes, hostedRollbackBytes,
  rollbackSourceSha256, provenance,
}) {
  const release = parseJsonBuffer(releaseBytes, 'Plan 55 release manifest')
  const hostedBefore = parseJsonBuffer(hostedBeforeBytes, 'Production baseline snapshot')
  const hostedRollback = parseJsonBuffer(hostedRollbackBytes, 'rollback hosted snapshot')
  const sourceDigest = typeof rollbackSourceSha256 === 'string' ? rollbackSourceSha256.trim() : ''
  assertReleaseIdentity(policy, release)
  assertWorkflowRun(policy, provenance)
  assertPinnedProductionBaseline(policy, hostedBefore)
  assertRollbackSnapshot(hostedBefore, hostedRollback)
  if (!SHA256.test(sourceDigest)) throw new Error('Plan 55 rollback source fingerprint is invalid')

  const baseline = snapshotIdentity(hostedBefore, hostedBeforeBytes)
  const rollback = {
    ...snapshotIdentity(hostedRollback, hostedRollbackBytes),
    sourceSha256: sourceDigest,
  }
  return Object.fromEntries(PLAN55_RELEASE_STAGE_GATES.map((gate) => [gate, {
    schemaVersion: RELEASE_PROOF_SCHEMA,
    gate,
    status: 'PASS',
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
    checks: RELEASE_STAGE_CHECKS[gate].map((id) => ({ id, outcome: 'success' })),
  }]))
}

export function assertPlan55ReleaseStageGateProof(proof, {
  gate, policy, release, provenance, sourceArtifactFiles,
}) {
  const fail = () => { throw new Error(`Plan 55 release stage proof contract failed: ${gate ?? 'unknown'}`) }
  const expectedWorkflow = policy?.trustedEvidenceWorkflowPathsByGate?.[gate]
  const checkIds = RELEASE_STAGE_CHECKS[gate]
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
    'release', 'hosted-before', 'hosted-rollback-snapshot', 'rollback-mobile-source-sha256', 'output',
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
