import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import {
  assertPlan55Cleanup,
  buildPlan55ServiceSlices,
  PLAN55_SERVICE_ORDER,
} from '../../apps/api/scripts/lib/plan55-production-canary-core.mjs'
import {
  assertPlan55ReleaseStageGateProof,
  PLAN55_RELEASE_STAGE_GATES,
} from './plan55-release-gate-proofs.mjs'
import {
  assertPlan55DeployedGuardGateProof,
  PLAN55_DEPLOYED_GUARD_GATES,
} from './plan55-deployed-guard-gate-proofs.mjs'
export { PLAN55_RELEASE_STAGE_GATES }
export { PLAN55_DEPLOYED_GUARD_GATES }

const GATE_SET_SCHEMA = 'plan55-gate-evidence-set.v1'
const GATE_RECEIPT_SCHEMA = 'plan55-gate-evidence.v2'
const SHA256 = /^[a-f0-9]{64}$/u
const GIT_SHA = /^[a-f0-9]{40}$/u
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u
const WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/u
const SENSITIVE_EVIDENCE_KEY = /token|secret|password|authorization|cookie|credential|api[_-]?key|service[_-]?role|email|phone|address|description|content|prompt|image|audio|transcript|latitude|longitude|cccd|bank|message|text|question|answer|query|title|name|url|uri|unit|floor|street|ward|postal|zip|otp/iu
const SAFE_CLEANUP_COUNT_KEYS = new Set(['chat_messages_as_sender'])
const SENSITIVE_EVIDENCE_VALUE = /(?:bearer\s+[a-z0-9._~-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b|\b(?:\+?84|0)\d{8,10}\b)/iu
const SAFE_EVIDENCE_VALUE = /^[A-Za-z0-9._:/+-]{1,240}$/u
const MAX_ARTIFACT_ARCHIVE_BYTES = 64 * 1024 * 1024
const MAX_ARTIFACT_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
const MAX_EVIDENCE_FILE_BYTES = 16 * 1024 * 1024
const GITHUB_REQUEST_TIMEOUT_MS = 30_000
const CANARY_RECEIPT_GATES = new Set([
  'plan55-service-slice-integrity-pass',
  'plan55-service-g5-safety-pass',
  'plan55-service-cleanup-pass',
  'plan55-six-current-source-receipts',
  'plan55-six-cleanup-passes',
])
export const PLAN55_PREFLIGHT_GATE_CHECKS = Object.freeze({
  'plan55-production-source-merge': Object.freeze(['verify_source']),
  'plan55-exact-production-base-ancestry': Object.freeze(['verify_source']),
  'plan55-source-lock': Object.freeze(['verify_source']),
  'workspace-typecheck': Object.freeze(['workspace_quality']),
  'workspace-tests': Object.freeze(['workspace_quality']),
  'workspace-build': Object.freeze(['workspace_quality']),
  'production-ui-normality': Object.freeze(['production_ui_normality']),
  security: Object.freeze(['workspace_quality', 'secret_scan']),
  harness: Object.freeze(['workspace_quality']),
  'plan55-actor-scoped-guard-tests': Object.freeze(['workspace_quality']),
  'plan55-canary-runner-tests': Object.freeze(['workspace_quality']),
  'edge-deno': Object.freeze(['workspace_quality']),
  'sql-verification': Object.freeze(['docker_ram_floor', 'sql_verification']),
  'generated-types': Object.freeze(['docker_ram_floor', 'sql_verification']),
})
const PREFLIGHT_RECEIPT_GATES = new Set(Object.keys(PLAN55_PREFLIGHT_GATE_CHECKS))
const RELEASE_STAGE_RECEIPT_GATES = new Set(PLAN55_RELEASE_STAGE_GATES)
const DEPLOYED_GUARD_RECEIPT_GATES = new Set(PLAN55_DEPLOYED_GUARD_GATES)
const CANARY_EVIDENCE_TARGET_STATES = new Set([
  'receipts_validated', 'paired_wave_1', 'paired_wave_2', 'paired_wave_3', 'production',
])
const PROMOTION_GATE_PHASES = Object.freeze([
  'verified', 'guard_deployed_off', 'service_canary', 'service_cleanup',
  'receipts_validated', 'paired_wave_1', 'paired_wave_2', 'paired_wave_3', 'production',
])

export function loadPlan55GateEvidenceSet(manifestPath, { policy, release, targetState, requiredGates }) {
  const resolvedManifest = realpathSync(resolve(manifestPath))
  const manifestRoot = realpathSync(dirname(resolvedManifest))
  const manifest = parseJson(readFileSync(resolvedManifest), 'gate evidence set')
  const expectedGates = [...new Set(requiredGates ?? [])].sort()
  if (expectedGates.length !== (requiredGates ?? []).length ||
      !matchesPolicyGateInventory(policy, targetState, expectedGates) ||
      manifest.schemaVersion !== GATE_SET_SCHEMA ||
      !Array.isArray(manifest.receipts) || manifest.receipts.length !== expectedGates.length) {
    throw new Error('Plan 55 gate inventory is invalid')
  }
  assertIdentity(manifest, { policy, release, targetState })
  assertPlan55GateEvidenceCoverage({ policy, targetState, requiredGates: expectedGates })

  const receiptEntries = new Map()
  for (const entry of manifest.receipts) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        typeof entry.gate !== 'string' || receiptEntries.has(entry.gate) ||
        !expectedGates.includes(entry.gate)) {
      throw new Error('Plan 55 gate inventory is invalid')
    }
    receiptEntries.set(entry.gate, entry)
  }
  if (JSON.stringify([...receiptEntries.keys()].sort()) !== JSON.stringify(expectedGates)) {
    throw new Error('Plan 55 gate inventory is invalid')
  }

  return Object.fromEntries(expectedGates.map((gate) => {
    const entry = receiptEntries.get(gate)
    const receiptPath = resolveEvidenceFile(manifestRoot, entry.receiptPath, `receipt for ${gate}`)
    const receiptBytes = readFileSync(receiptPath)
    if (!isSha256(entry.receiptSha256) || sha256(receiptBytes) !== entry.receiptSha256) {
      throw new Error(`Plan 55 receipt checksum mismatch: ${gate}`)
    }
    const receipt = parseJson(receiptBytes, `receipt for ${gate}`)
    if (!receiptBytes.equals(Buffer.from(`${JSON.stringify(receipt)}\n`))) {
      throw new Error(`Plan 55 receipt serialization is invalid: ${gate}`)
    }
    const evidencePath = resolveEvidenceFile(manifestRoot, receipt.evidence?.path, `evidence for ${gate}`)
    const sourceEvidencePath = resolveEvidenceFile(manifestRoot, receipt.evidence?.sourcePath,
      `source evidence for ${gate}`)
    assertReceiptIdentity(receipt, gate, { policy, release, targetState })
    const evidenceBytes = readFileSync(evidencePath)
    if (!isSha256(receipt.evidence?.sha256) || sha256(evidenceBytes) !== receipt.evidence.sha256) {
      throw new Error(`Plan 55 evidence checksum mismatch: ${gate}`)
    }
    const evidence = parseJson(evidenceBytes, `evidence for ${gate}`)
    const sourceEvidenceBytes = readFileSync(sourceEvidencePath)
    if (!isSha256(receipt.evidence?.sourceSha256) ||
        sha256(sourceEvidenceBytes) !== receipt.evidence.sourceSha256) {
      throw new Error(`Plan 55 source evidence checksum mismatch: ${gate}`)
    }
    const sourceEvidence = parseJson(sourceEvidenceBytes, `source evidence for ${gate}`)
    assertSafeGateEvidence(sourceEvidence)
    if (!sourceEvidenceBytes.equals(Buffer.from(`${JSON.stringify(sourceEvidence)}\n`))) {
      throw new Error(`Plan 55 source evidence serialization is invalid: ${gate}`)
    }
    assertEvidenceIdentity(evidence, gate, {
      policy, release, targetState, provenance: receipt.provenance,
    })
    if (PREFLIGHT_RECEIPT_GATES.has(gate) || RELEASE_STAGE_RECEIPT_GATES.has(gate) ||
        DEPLOYED_GUARD_RECEIPT_GATES.has(gate)) {
      if (JSON.stringify(sourceEvidence) !== JSON.stringify(evidence.proof)) {
        throw new Error(`Plan 55 source gate proof does not match its archived evidence: ${gate}`)
      }
    } else if (!sourceEvidenceBytes.equals(evidenceBytes)) {
      throw new Error(`Plan 55 source gate evidence does not match its archived evidence: ${gate}`)
    }
    assertGateEvidenceProducer(receipt.provenance, gate, policy)
    if (!evidenceBytes.equals(Buffer.from(`${JSON.stringify(evidence)}\n`))) {
      throw new Error(`Plan 55 evidence serialization is invalid: ${gate}`)
    }
    if (!isTrustedGitHubArtifactProvenance(receipt.provenance, policy, gate)) {
      throw new Error(`Plan 55 artifact provenance is invalid: ${gate}`)
    }

    return [gate, Object.freeze({
      receipt,
      receiptSha256: sha256(Buffer.from(JSON.stringify(receipt))),
      receiptFileSha256: entry.receiptSha256,
      evidenceSha256: receipt.evidence.sha256,
      evidenceBytes,
      sourceEvidenceBytes,
      evidenceProof: evidence,
      evidencePath: receipt.evidence.path,
    })]
  }))
}

export function inspectPlan55GateEvidenceCoverage({ policy, targetState, requiredGates }) {
  if (!Array.isArray(requiredGates) || requiredGates.some((gate) => typeof gate !== 'string' || !gate)) {
    throw new Error('Plan 55 gate evidence package inventory is invalid')
  }
  const gates = [...new Set(requiredGates)].sort()
  if (gates.length !== requiredGates.length ||
      !gates.length || gates.length > 256 || !matchesPolicyGateInventory(policy, targetState, gates)) {
    throw new Error('Plan 55 gate evidence package inventory is invalid')
  }

  const semanticVerifiers = CANARY_EVIDENCE_TARGET_STATES.has(targetState)
    ? new Set([
      ...CANARY_RECEIPT_GATES,
      ...PREFLIGHT_RECEIPT_GATES,
      ...RELEASE_STAGE_RECEIPT_GATES,
      ...DEPLOYED_GUARD_RECEIPT_GATES,
    ])
    : new Set()
  const missingSemanticVerifierGates = gates.filter((gate) => !semanticVerifiers.has(gate))
  const missingApprovedProducerGates = gates.filter((gate) => {
    const workflowPath = policy?.trustedEvidenceWorkflowPathsByGate?.[gate]
    return typeof workflowPath !== 'string' ||
      !policy.trustedEvidenceWorkflowPaths?.includes(workflowPath)
  })

  return Object.freeze({
    targetState,
    requiredGates: Object.freeze(gates),
    missingSemanticVerifierGates: Object.freeze(missingSemanticVerifierGates),
    missingApprovedProducerGates: Object.freeze(missingApprovedProducerGates),
    ready: missingSemanticVerifierGates.length === 0 && missingApprovedProducerGates.length === 0,
  })
}

export function assertPlan55GateEvidenceCoverage(options) {
  const coverage = inspectPlan55GateEvidenceCoverage(options)
  if (coverage.ready) return coverage

  const problems = []
  if (coverage.missingSemanticVerifierGates.length) {
    problems.push(`missing semantic verifiers: ${coverage.missingSemanticVerifierGates.join(', ')}`)
  }
  if (coverage.missingApprovedProducerGates.length) {
    problems.push(`missing approved producers: ${coverage.missingApprovedProducerGates.join(', ')}`)
  }
  throw new Error(`Plan 55 gate evidence coverage is incomplete (${problems.join('; ')})`)
}

export function buildPlan55GateEvidenceArtifact({
  policy,
  release,
  targetState,
  requiredGates,
  sourceEvidence,
}) {
  const gates = [...new Set(requiredGates ?? [])].sort()
  if (!Array.isArray(requiredGates) || gates.length !== requiredGates.length ||
      !gates.length || gates.length > 256 || !matchesPolicyGateInventory(policy, targetState, gates) ||
      !(sourceEvidence instanceof Map) ||
      sourceEvidence.size !== gates.length) {
    throw new Error('Plan 55 gate evidence package inventory is invalid')
  }
  assertPlan55GateEvidenceCoverage({ policy, targetState, requiredGates: gates })

  const files = new Map([
    ['receipts/', Buffer.alloc(0)],
    ['evidence/', Buffer.alloc(0)],
    ['source-results/', Buffer.alloc(0)],
  ])
  const entries = []
  for (const gate of gates) {
    const supplied = sourceEvidence.get(gate)
    const evidencePath = `evidence/${gate}.json`
    const receiptPath = `receipts/${gate}.json`
    if (!supplied || typeof supplied !== 'object' || !(supplied.evidenceBytes instanceof Buffer) ||
        !isSafeArtifactPath(supplied.artifactEvidencePath) ||
        !(supplied.artifactFiles instanceof Map) ||
        !isTrustedGitHubArtifactProvenance(supplied.provenance, policy, gate)) {
      throw new Error(`Plan 55 source artifact does not prove the gate evidence: ${gate}`)
    }
    if (supplied.evidenceBytes.length > MAX_EVIDENCE_FILE_BYTES) {
      throw new Error(`Plan 55 evidence file is too large: ${gate}`)
    }
    const archivedEvidence = supplied.artifactFiles.get(supplied.artifactEvidencePath)
    if (!(archivedEvidence instanceof Buffer) || !archivedEvidence.equals(supplied.evidenceBytes)) {
      throw new Error(`Plan 55 source artifact does not prove the gate evidence: ${gate}`)
    }
    const sourcePayload = parseJson(supplied.evidenceBytes, `evidence for ${gate}`)
    assertSafeGateEvidence(sourcePayload)
    if (!supplied.evidenceBytes.equals(Buffer.from(`${JSON.stringify(sourcePayload)}\n`))) {
      throw new Error(`Plan 55 evidence serialization is invalid: ${gate}`)
    }
    const evidence = PREFLIGHT_RECEIPT_GATES.has(gate)
      ? wrapPlan55PreflightGateEvidence(sourcePayload, gate, {
        policy, release, targetState, provenance: supplied.provenance,
      })
      : RELEASE_STAGE_RECEIPT_GATES.has(gate)
        ? wrapPlan55ReleaseStageGateEvidence(sourcePayload, gate, {
          policy, release, targetState, provenance: supplied.provenance,
          sourceArtifactFiles: supplied.artifactFiles,
        })
        : DEPLOYED_GUARD_RECEIPT_GATES.has(gate)
          ? wrapPlan55DeployedGuardGateEvidence(sourcePayload, gate, {
            policy, release, targetState, provenance: supplied.provenance,
            sourceArtifactFiles: supplied.artifactFiles,
          })
          : sourcePayload
    assertSafeGateEvidence(evidence)
    assertEvidenceIdentity(evidence, gate, {
      policy, release, targetState, provenance: supplied.provenance,
      sourceArtifactFiles: supplied.artifactFiles,
    })
    assertGateEvidenceProducer(supplied.provenance, gate, policy)
    if (supplied.provenance.workflowHeadSha !== release.gitSha) {
      throw new Error(`Plan 55 source artifact SHA mismatch: ${gate}`)
    }

    const sourcePath = `source-results/${gate}.json`
    const evidenceBytes = Buffer.from(`${JSON.stringify(evidence)}\n`)
    const receipt = {
      schemaVersion: GATE_RECEIPT_SCHEMA,
      gate,
      status: 'PASS',
      environment: release.environment,
      projectRef: policy.projectRef,
      policyId: policy.policyId,
      policySha256: policy.policySha256,
      releaseId: release.releaseId,
      sourceSha: release.gitSha,
      targetState,
      evidence: {
        path: evidencePath,
        sha256: sha256(evidenceBytes),
        sourcePath,
        sourceSha256: sha256(supplied.evidenceBytes),
        reference: `artifact://${supplied.provenance.artifactId}/${gate}`,
      },
      provenance: { ...supplied.provenance },
    }
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
    files.set(sourcePath, supplied.evidenceBytes)
    files.set(evidencePath, evidenceBytes)
    files.set(receiptPath, receiptBytes)
    entries.push({
      gate,
      receiptPath,
      sourcePath,
      receiptSha256: sha256(receiptBytes),
    })
  }

  const manifest = {
    schemaVersion: GATE_SET_SCHEMA,
    policyId: policy.policyId,
    policySha256: policy.policySha256,
    environment: release.environment,
    projectRef: policy.projectRef,
    releaseId: release.releaseId,
    sourceSha: release.gitSha,
    targetState,
    receipts: entries,
  }
  files.set('gate-evidence-set.json', Buffer.from(`${JSON.stringify(manifest)}\n`))
  assertPlan55FinalizationArtifactFiles(files)
  return files
}

export function buildPlan55CanaryGateEvidenceFiles({
  policy, release, checkpoint, aggregate, targetState = 'receipts_validated',
}) {
  const proof = {
    schemaVersion: 'plan55-canary-gate-proof.v1',
    validatedTargetState: 'receipts_validated',
    projectRef: policy.projectRef,
    releaseId: release.releaseId,
    sourceSha: release.gitSha,
    checkpoint,
    aggregate,
  }
  const files = new Map()
  for (const gate of CANARY_RECEIPT_GATES) {
    const evidence = {
      schemaVersion: 'plan55-gate-result.v1',
      gate,
      status: 'PASS',
      environment: release.environment,
      projectRef: policy.projectRef,
      policyId: policy.policyId,
      policySha256: policy.policySha256,
      releaseId: release.releaseId,
      sourceSha: release.gitSha,
      targetState,
      proof,
    }
    assertSafeGateEvidence(evidence)
    assertEvidenceIdentity(evidence, gate, {
      policy,
      release,
      targetState,
    })
    files.set(gate, Buffer.from(`${JSON.stringify(evidence)}\n`))
  }
  return files
}

export async function verifyPlan55GitHubArtifactProvenance(receiptSet, {
  repository, trustedEvidenceWorkflowPaths, trustedEvidenceWorkflowPathsByGate, sourceSha, token, fetchImpl = fetch,
}) {
  if (!REPOSITORY.test(repository ?? '') || !Array.isArray(trustedEvidenceWorkflowPaths) ||
      !GIT_SHA.test(sourceSha ?? '') || typeof token !== 'string' || !token.trim() ||
      typeof fetchImpl !== 'function') {
    throw new Error('Plan 55 GitHub artifact verification requires repository, token, and fetch')
  }
  const uniqueArtifacts = new Map()
  for (const [gate, receiptRecord] of Object.entries(receiptSet ?? {})) {
    const provenance = receiptRecord?.receipt?.provenance
    if (!isTrustedGitHubArtifactProvenance(provenance, {
      repository,
      trustedEvidenceWorkflowPaths,
      trustedEvidenceWorkflowPathsByGate,
    }, gate)) {
      throw new Error('Plan 55 GitHub artifact provenance is invalid')
    }
    if (provenance.workflowHeadSha !== sourceSha) {
      throw new Error('Plan 55 GitHub artifact workflow source SHA mismatch')
    }
    const previous = uniqueArtifacts.get(provenance.artifactId)
    if (previous && JSON.stringify(previous) !== JSON.stringify(provenance)) {
      throw new Error('Plan 55 artifact ID has conflicting provenance')
    }
    uniqueArtifacts.set(provenance.artifactId, provenance)
  }

  for (const [artifactId, provenance] of uniqueArtifacts) {
    const artifact = await githubJson(fetchImpl, token, repository,
      `/actions/artifacts/${artifactId}`)
    const workflowRunId = String(artifact.workflow_run?.id ?? '')
    const workflowHeadSha = artifact.workflow_run?.head_sha
    if (Number(artifact.id) !== artifactId || artifact.name !== provenance.artifactName ||
        artifact.expired !== false || workflowRunId !== provenance.runId ||
        workflowHeadSha !== provenance.workflowHeadSha ||
        !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? '') ||
        artifact.digest !== provenance.artifactDigest ||
        artifact.archive_download_url !== `https://api.github.com/repos/${repository}/actions/artifacts/${artifactId}/zip`) {
      throw new Error(`Plan 55 artifact identity verification failed: ${artifactId}`)
    }

    const run = await githubJson(fetchImpl, token, repository,
      `/actions/runs/${provenance.runId}`)
    if (Number(run.id) !== Number(provenance.runId) ||
        Number(run.run_attempt) !== provenance.runAttempt ||
        run.status !== 'completed' || run.conclusion !== 'success' ||
        run.head_sha !== provenance.workflowHeadSha || run.head_sha !== sourceSha ||
        run.path !== provenance.workflowPath || run.head_branch !== 'main' ||
        run.repository?.full_name !== repository) {
      throw new Error(`Plan 55 workflow-run provenance verification failed: ${artifactId}`)
    }

    const archiveResponse = await fetchImpl(artifact.archive_download_url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    })
    if (!archiveResponse?.ok) throw new Error(`Plan 55 artifact download failed: ${artifactId}`)
    const archive = await readBoundedArtifactArchive(archiveResponse)
    if (`sha256:${sha256(archive)}` !== artifact.digest) {
      throw new Error(`Plan 55 artifact archive checksum mismatch: ${artifactId}`)
    }
    const archivedFiles = readZipFiles(archive)
    for (const receiptRecord of Object.values(receiptSet)) {
      if (receiptRecord.receipt.provenance.artifactId !== artifactId) continue
      const artifactEvidencePath = receiptRecord.receipt.provenance.artifactEvidencePath
      const archivedEvidence = archivedFiles.get(artifactEvidencePath)
      if (!archivedEvidence || !archivedEvidence.equals(receiptRecord.sourceEvidenceBytes)) {
        throw new Error(`Plan 55 evidence is not present in its attested artifact: ${artifactId}`)
      }
    }
  }
  return true
}

export async function downloadPlan55GitHubRunArtifact({
  repository,
  trustedWorkflowPaths,
  sourceSha,
  artifactId,
  artifactNamePrefix,
  expectedRunId,
  expectedRunAttempt,
  token,
  fetchImpl = fetch,
}) {
  if (!REPOSITORY.test(repository ?? '') || !Array.isArray(trustedWorkflowPaths) ||
      trustedWorkflowPaths.length === 0 || trustedWorkflowPaths.some((path) => !WORKFLOW_PATH.test(path ?? '')) ||
      !GIT_SHA.test(sourceSha ?? '') || !Number.isSafeInteger(artifactId) || artifactId < 1 ||
      typeof artifactNamePrefix !== 'string' || !/^[A-Za-z0-9_.-]{1,96}$/u.test(artifactNamePrefix) ||
      ((expectedRunId !== undefined || expectedRunAttempt !== undefined) &&
        (!Number.isSafeInteger(expectedRunId) || expectedRunId < 1 ||
         !Number.isSafeInteger(expectedRunAttempt) || expectedRunAttempt < 1)) ||
      typeof token !== 'string' || !token.trim() || typeof fetchImpl !== 'function') {
    throw new Error('Plan 55 finalization artifact verification requires trusted exact-source inputs')
  }

  const artifact = await githubJson(fetchImpl, token, repository,
    `/actions/artifacts/${artifactId}`)
  const runId = Number(artifact.workflow_run?.id)
  if (!Number.isSafeInteger(runId) || runId < 1 ||
      (expectedRunId !== undefined && runId !== expectedRunId)) {
    throw new Error('Plan 55 finalization artifact identity verification failed')
  }
  const archiveUrl = `https://api.github.com/repos/${repository}/actions/artifacts/${artifactId}/zip`
  if (Number(artifact.id) !== artifactId ||
      artifact.expired !== false || Number(artifact.workflow_run?.id) !== runId ||
      artifact.workflow_run?.head_sha !== sourceSha ||
      !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? '') ||
      artifact.archive_download_url !== archiveUrl) {
    throw new Error('Plan 55 finalization artifact identity verification failed')
  }

  const run = await githubJson(fetchImpl, token, repository, `/actions/runs/${runId}`)
  const runAttempt = Number(run.run_attempt)
  const workflowPath = run.path
  const artifactName = `${artifactNamePrefix}-${runId}-${runAttempt}`
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1 ||
      (expectedRunAttempt !== undefined && runAttempt !== expectedRunAttempt) ||
      Number(run.id) !== runId || artifact.name !== artifactName ||
      run.status !== 'completed' || run.conclusion !== 'success' || run.head_sha !== sourceSha ||
      !trustedWorkflowPaths.includes(workflowPath) || run.head_branch !== 'main' ||
      run.repository?.full_name !== repository) {
    throw new Error('Plan 55 finalization workflow-run provenance verification failed')
  }

  const archiveResponse = await fetchImpl(archiveUrl, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
  })
  if (!archiveResponse?.ok) throw new Error('Plan 55 finalization artifact download failed')
  const archive = await readBoundedArtifactArchive(archiveResponse)
  if (`sha256:${sha256(archive)}` !== artifact.digest) {
    throw new Error('Plan 55 finalization artifact archive checksum mismatch')
  }
  return Object.freeze({
    artifactId,
    artifactName,
    runId,
    runAttempt,
    sourceSha,
    workflowPath,
    artifactDigest: artifact.digest,
    files: readZipFiles(archive),
  })
}

export function assertPlan55FinalizationArtifactFiles(files) {
  if (!(files instanceof Map) || files.size < 3 || files.size > 512) {
    throw new Error('Plan 55 finalization artifact file inventory is invalid')
  }
  const fileNames = new Set()
  for (const [name, bytes] of files) {
    const directoryName = typeof name === 'string' && name.endsWith('/') ? name.slice(0, -1) : null
    const normalizedName = directoryName ?? name
    if (typeof name !== 'string' || name.includes('\\') || name.startsWith('/') ||
        normalizedName.split('/').some((part) => !part || part === '.' || part === '..') ||
        !(bytes instanceof Buffer)) {
      throw new Error('Plan 55 finalization artifact path is invalid')
    }
    if (directoryName !== null) {
      if (!['receipts', 'evidence', 'source-results'].includes(directoryName)) {
        throw new Error('Plan 55 finalization artifact directory is invalid')
      }
      continue
    }
    if (name !== 'gate-evidence-set.json' &&
        !/^receipts\/[a-z0-9][a-z0-9-]{0,127}\.json$/u.test(name) &&
        !/^evidence\/[a-z0-9][a-z0-9-]{0,127}\.json$/u.test(name) &&
        !/^source-results\/[a-z0-9][a-z0-9-]{0,127}\.json$/u.test(name)) {
      throw new Error('Plan 55 finalization artifact contains an unexpected file')
    }
    fileNames.add(name)
  }

  const required = new Set(['gate-evidence-set.json'])
  if ([...required].some((name) => !fileNames.has(name))) {
    throw new Error('Plan 55 finalization artifact is missing required inputs')
  }

  const manifest = parseJson(files.get('gate-evidence-set.json'), 'finalization gate evidence set')
  if (!Array.isArray(manifest.receipts) || !manifest.receipts.length || manifest.receipts.length > 256) {
    throw new Error('Plan 55 finalization gate evidence inventory is invalid')
  }
  for (const entry of manifest.receipts) {
    if (!entry || typeof entry.gate !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(entry.gate) ||
        entry.receiptPath !== `receipts/${entry.gate}.json` ||
        !fileNames.has(entry.receiptPath) ||
        entry.sourcePath !== `source-results/${entry.gate}.json` || !fileNames.has(entry.sourcePath)) {
      throw new Error('Plan 55 finalization receipt path is invalid')
    }
    const receipt = parseJson(files.get(entry.receiptPath), 'finalization receipt')
    const evidencePath = receipt.evidence?.path
    const sourcePath = receipt.evidence?.sourcePath
    if (evidencePath !== `evidence/${entry.gate}.json` || !fileNames.has(evidencePath) ||
        sourcePath !== `source-results/${entry.gate}.json` || !fileNames.has(sourcePath)) {
      throw new Error('Plan 55 finalization evidence path is invalid')
    }
    required.add(entry.receiptPath)
    required.add(evidencePath)
    required.add(entry.sourcePath)
  }
  if (fileNames.size !== required.size || [...fileNames].some((name) => !required.has(name))) {
    throw new Error('Plan 55 finalization artifact has missing or unreferenced files')
  }
  return true
}

export function isPlan55GateReceiptRecord(value, gate, { policy, release, targetState }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const receipt = value.receipt
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false
    const serializedReceipt = JSON.stringify(receipt)
    if (typeof serializedReceipt !== 'string') return false
    const evidenceProof = value.evidenceProof
    const sourceEvidenceBytes = value.sourceEvidenceBytes
    if (!evidenceProof || typeof evidenceProof !== 'object' || Array.isArray(evidenceProof)) return false
    if (!(sourceEvidenceBytes instanceof Buffer) ||
        sha256(sourceEvidenceBytes) !== receipt.evidence?.sourceSha256) return false
    const sourceEvidence = parseJson(sourceEvidenceBytes, `source evidence for ${gate}`)
    assertSafeGateEvidence(sourceEvidence)
    if (!sourceEvidenceBytes.equals(Buffer.from(`${JSON.stringify(sourceEvidence)}\n`))) return false
    if (PREFLIGHT_RECEIPT_GATES.has(gate) || RELEASE_STAGE_RECEIPT_GATES.has(gate) ||
        DEPLOYED_GUARD_RECEIPT_GATES.has(gate)) {
      if (JSON.stringify(sourceEvidence) !== JSON.stringify(evidenceProof.proof)) return false
    } else if (!sourceEvidenceBytes.equals(Buffer.from(`${JSON.stringify(evidenceProof)}\n`))) {
      return false
    }
    assertSafeGateEvidence(evidenceProof)
    assertEvidenceIdentity(evidenceProof, gate, {
      policy, release, targetState, provenance: receipt.provenance,
    })
    assertGateEvidenceProducer(receipt.provenance, gate, policy)
    const serializedEvidence = Buffer.from(`${JSON.stringify(evidenceProof)}\n`)
    return isSha256(value.receiptSha256) && isSha256(value.receiptFileSha256) &&
      isSha256(value.evidenceSha256) && value.receiptSha256 === sha256(Buffer.from(serializedReceipt)) &&
      value.receiptFileSha256 === sha256(Buffer.from(`${serializedReceipt}\n`)) &&
      value.evidenceSha256 === receipt.evidence?.sha256 &&
      value.evidenceSha256 === sha256(serializedEvidence) &&
      isReceiptIdentity(receipt, gate, { policy, release, targetState }) &&
      isTrustedGitHubArtifactProvenance(receipt.provenance, policy, gate)
  } catch {
    return false
  }
}

function assertIdentity(value, { policy, release, targetState }) {
  if (value.policyId !== policy.policyId || value.policySha256 !== policy.policySha256 ||
      value.environment !== release.environment || value.environment !== policy.environment ||
      value.projectRef !== policy.projectRef || value.releaseId !== release.releaseId ||
      value.sourceSha !== release.gitSha || value.targetState !== targetState) {
    throw new Error('Plan 55 gate evidence target/source identity mismatch')
  }
}

function assertReceiptIdentity(receipt, gate, context) {
  if (!isReceiptIdentity(receipt, gate, context)) {
    if (receipt?.provenance?.workflowHeadSha !== context.release?.gitSha) {
      throw new Error(`Plan 55 gate workflow source SHA mismatch: ${gate}`)
    }
    if (receipt?.sourceSha !== context.release?.gitSha) {
      throw new Error(`Plan 55 gate source identity mismatch: ${gate}`)
    }
    if (receipt?.status !== 'PASS') throw new Error(`Plan 55 gate receipt is not PASS: ${gate}`)
    throw new Error(`Plan 55 gate receipt identity mismatch: ${gate}`)
  }
}

function isReceiptIdentity(receipt, gate, { policy, release, targetState }) {
  return Boolean(receipt && typeof receipt === 'object' && !Array.isArray(receipt) &&
    receipt.schemaVersion === GATE_RECEIPT_SCHEMA && receipt.gate === gate && receipt.status === 'PASS' &&
    receipt.policyId === policy.policyId && receipt.policySha256 === policy.policySha256 &&
    receipt.environment === release.environment && receipt.environment === policy.environment &&
    receipt.projectRef === policy.projectRef && receipt.releaseId === release.releaseId &&
    receipt.sourceSha === release.gitSha && receipt.targetState === targetState &&
    receipt.evidence && typeof receipt.evidence === 'object' && !Array.isArray(receipt.evidence) &&
    typeof receipt.evidence.path === 'string' && receipt.evidence.path.length > 0 &&
    isSha256(receipt.evidence.sha256) &&
    receipt.evidence.sourcePath === `source-results/${gate}.json` &&
    isSha256(receipt.evidence.sourceSha256) &&
    receipt.provenance?.workflowHeadSha === release.gitSha &&
    isGitHubArtifactProvenance(receipt.provenance, policy.repository))
}

function assertEvidenceIdentity(evidence, gate, {
  policy, release, targetState, provenance, sourceArtifactFiles,
}) {
  const matches = {
    object: Boolean(evidence && typeof evidence === 'object' && !Array.isArray(evidence)),
    schema: evidence?.schemaVersion === 'plan55-gate-result.v1',
    gate: evidence?.gate === gate,
    status: evidence?.status === 'PASS',
    policy: evidence?.policyId === policy.policyId,
    policySha256: evidence?.policySha256 === policy.policySha256,
    environment: evidence?.environment === release.environment,
    projectRef: evidence?.projectRef === policy.projectRef,
    releaseId: evidence?.releaseId === release.releaseId,
    sourceSha: evidence?.sourceSha === release.gitSha,
    targetState: evidence?.targetState === targetState,
  }
  const mismatches = Object.entries(matches).filter(([, matches]) => !matches).map(([key]) => key)
  if (mismatches.length) {
    throw new Error(`Plan 55 gate evidence identity mismatch: ${gate} (${mismatches.join(',')})`)
  }
  assertGateSpecificEvidence(evidence, gate, {
    policy, release, targetState, provenance, sourceArtifactFiles,
  })
}

function assertGateSpecificEvidence(evidence, gate, {
  policy, release, targetState, provenance, sourceArtifactFiles,
}) {
  if (!CANARY_EVIDENCE_TARGET_STATES.has(targetState) ||
      policy.trustedEvidenceWorkflowPathsByGate?.[gate] !== '.github/workflows/ci.yml') {
    throw new Error(`Plan 55 gate has no approved semantic evidence producer: ${gate}`)
  }
  if (PREFLIGHT_RECEIPT_GATES.has(gate)) {
    assertPlan55PreflightGateProof(evidence.proof, {
      gate, policy, release, provenance,
    })
    return
  }
  if (RELEASE_STAGE_RECEIPT_GATES.has(gate)) {
    assertPlan55ReleaseStageGateProof(evidence.proof, {
      gate, policy, release, provenance, sourceArtifactFiles,
    })
    return
  }
  if (DEPLOYED_GUARD_RECEIPT_GATES.has(gate)) {
    assertPlan55DeployedGuardGateProof(evidence.proof, {
      gate, policy, release, provenance, sourceArtifactFiles,
    })
    return
  }
  if (!CANARY_RECEIPT_GATES.has(gate)) {
    throw new Error(`Gate has no semantic evidence verifier: ${gate}`)
  }
  assertSixServiceCanaryProof(evidence.proof, gate, { policy, release })
}

export function assertPlan55PreflightGateProof(proof, {
  gate, policy, release, provenance, sourceSha, runId, runAttempt, workflowPath,
}) {
  const fail = () => { throw new Error(`Plan 55 preflight gate evidence contract failed: ${gate ?? 'unknown'}`) }
  const expectedChecks = PLAN55_PREFLIGHT_GATE_CHECKS[gate]
  const expectedSourceSha = release?.gitSha ?? sourceSha
  const expectedWorkflowPath = provenance?.workflowPath ?? workflowPath
  const expectedRunId = provenance?.runId ?? runId
  const expectedRunAttempt = provenance?.runAttempt ?? runAttempt
  const expectedKeys = [
    'schemaVersion', 'gate', 'status', 'environment', 'projectRef', 'policyId', 'policySha256',
    'sourceSha', 'workflowPath', 'runId', 'runAttempt', 'checks',
  ]
  if (!expectedChecks || !proof || typeof proof !== 'object' || Array.isArray(proof) ||
      JSON.stringify(Object.keys(proof).sort()) !== JSON.stringify([...expectedKeys].sort()) ||
      proof.schemaVersion !== 'plan55-preflight-gate-proof.v1' || proof.gate !== gate ||
      proof.status !== 'PASS' || proof.environment !== 'production' ||
      proof.environment !== policy.environment || proof.projectRef !== policy.projectRef ||
      proof.policyId !== policy.policyId || proof.policySha256 !== policy.policySha256 ||
      proof.sourceSha !== expectedSourceSha || !isGitSha(proof.sourceSha) ||
      proof.workflowPath !== expectedWorkflowPath ||
      proof.workflowPath !== policy.trustedEvidenceWorkflowPathsByGate?.[gate] ||
      !policy.trustedEvidenceWorkflowPaths?.includes(proof.workflowPath) ||
      proof.runId !== String(expectedRunId) || !/^[1-9]\d*$/u.test(proof.runId) ||
      proof.runAttempt !== expectedRunAttempt || !Number.isSafeInteger(proof.runAttempt) ||
      proof.runAttempt < 1 || !Array.isArray(proof.checks) ||
      proof.checks.length !== expectedChecks.length) fail()
  for (const [index, check] of expectedChecks.entries()) {
    if (!check || typeof check !== 'string' || !proof.checks[index] ||
        typeof proof.checks[index] !== 'object' || Array.isArray(proof.checks[index]) ||
        JSON.stringify(Object.keys(proof.checks[index]).sort()) !== JSON.stringify(['id', 'outcome']) ||
        proof.checks[index].id !== check || proof.checks[index].outcome !== 'success') fail()
  }
  return true
}

function wrapPlan55PreflightGateEvidence(proof, gate, context) {
  assertPlan55PreflightGateProof(proof, { gate, ...context })
  const { policy, release, targetState } = context
  return {
    schemaVersion: 'plan55-gate-result.v1',
    gate,
    status: 'PASS',
    environment: release.environment,
    projectRef: policy.projectRef,
    policyId: policy.policyId,
    policySha256: policy.policySha256,
    releaseId: release.releaseId,
    sourceSha: release.gitSha,
    targetState,
    proof,
  }
}

function wrapPlan55ReleaseStageGateEvidence(proof, gate, context) {
  assertPlan55ReleaseStageGateProof(proof, {
    gate,
    policy: context.policy,
    release: context.release,
    provenance: context.provenance,
    sourceArtifactFiles: context.sourceArtifactFiles,
  })
  const { policy, release, targetState } = context
  return {
    schemaVersion: 'plan55-gate-result.v1',
    gate,
    status: 'PASS',
    environment: release.environment,
    projectRef: policy.projectRef,
    policyId: policy.policyId,
    policySha256: policy.policySha256,
    releaseId: release.releaseId,
    sourceSha: release.gitSha,
    targetState,
    proof,
  }
}

function wrapPlan55DeployedGuardGateEvidence(proof, gate, context) {
  assertPlan55DeployedGuardGateProof(proof, {
    gate,
    policy: context.policy,
    release: context.release,
    provenance: context.provenance,
    sourceArtifactFiles: context.sourceArtifactFiles,
  })
  const { policy, release, targetState } = context
  return {
    schemaVersion: 'plan55-gate-result.v1',
    gate,
    status: 'PASS',
    environment: release.environment,
    projectRef: policy.projectRef,
    policyId: policy.policyId,
    policySha256: policy.policySha256,
    releaseId: release.releaseId,
    sourceSha: release.gitSha,
    targetState,
    proof,
  }
}

function assertGateEvidenceProducer(provenance, gate, policy) {
  const expectedWorkflow = policy.trustedEvidenceWorkflowPathsByGate?.[gate]
  if (typeof expectedWorkflow !== 'string' ||
      !policy.trustedEvidenceWorkflowPaths?.includes(expectedWorkflow)) {
    throw new Error(`Gate has no approved semantic evidence producer: ${gate}`)
  }
  if (provenance?.workflowPath !== expectedWorkflow) {
    throw new Error(`Gate artifact provenance is invalid: ${gate}`)
  }
}

function assertSixServiceCanaryProof(proof, gate, { policy, release }) {
  const fail = () => { throw new Error(`Plan 55 gate-specific evidence contract failed: ${gate}`) }
  const checkpoint = proof?.checkpoint
  const aggregate = proof?.aggregate
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) ||
      proof.schemaVersion !== 'plan55-canary-gate-proof.v1' ||
      proof.validatedTargetState !== 'receipts_validated' ||
      proof.projectRef !== policy.projectRef || proof.releaseId !== release.releaseId ||
      proof.sourceSha !== release.gitSha || !checkpoint || typeof checkpoint !== 'object' ||
      !aggregate || typeof aggregate !== 'object') fail()
  if (checkpoint.schema !== 'plan55-production-checkpoint-status/v2' ||
      checkpoint.scope !== 'currently_served_production_release_only' ||
      checkpoint.canary_started !== true || checkpoint.canary_attempt_cleaned !== true ||
      checkpoint.deployment?.project_ref !== policy.projectRef ||
      checkpoint.deployment?.source_sha !== release.gitSha ||
      checkpoint.deployment?.release_id !== release.releaseId ||
      checkpoint.verified_slice_count !== 48 ||
      checkpoint.services?.length !== PLAN55_SERVICE_ORDER.length ||
      aggregate.schema !== 'plan55-production-canary-sequence/v1' ||
      aggregate.scope !== 'production_synthetic_actor_sequence' ||
      aggregate.project_ref !== policy.projectRef ||
      aggregate.status !== 'SIX_SERVICE_CANARY_PASS_PENDING_REMAINING_GATES' ||
      aggregate.services?.length !== PLAN55_SERVICE_ORDER.length) fail()

  for (const [index, service] of PLAN55_SERVICE_ORDER.entries()) {
    const checkpointService = checkpoint.services[index]
    const aggregateService = aggregate.services[index]
    const expectedSliceIds = buildPlan55ServiceSlices(service).map(({ id }) => id)
    if (!checkpointService || checkpointService.service !== service ||
        checkpointService.complete !== true || checkpointService.cleanup_verified !== true ||
        checkpointService.verified_slice_count !== expectedSliceIds.length ||
        checkpointService.missing_slice_count !== 0 ||
        JSON.stringify(checkpointService.verified_slice_ids) !== JSON.stringify(expectedSliceIds) ||
        !Array.isArray(checkpointService.missing_slice_ids) || checkpointService.missing_slice_ids.length !== 0 ||
        !checkpointService.cleanup ||
        !aggregateService || aggregateService.service !== service ||
        aggregateService.status !== 'G5_PASSED' || aggregateService.slice_count !== expectedSliceIds.length ||
        aggregateService.case_count !== 96 || aggregateService.error_count !== 0 ||
        aggregateService.release_id !== release.releaseId || aggregateService.source_sha !== release.gitSha ||
        !Array.isArray(aggregateService.slices) || aggregateService.slices.length !== expectedSliceIds.length ||
        JSON.stringify(aggregateService.slices.map(({ sliceId }) => sliceId)) !== JSON.stringify(expectedSliceIds) ||
        aggregateService.slices.some((slice, sliceIndex) => {
          const expectedSlice = buildPlan55ServiceSlices(service)[sliceIndex]
          return slice.caseCount !== 12 || slice.errorCount !== 0 ||
            slice.sourceSha !== release.gitSha ||
            !SHA256.test(slice.sourceAttestationSha256 ?? '') ||
            slice.corpusPath !== expectedSlice.corpusPath ||
            slice.playbookPath !== expectedSlice.playbookPath ||
            slice.playbookEnabled !== expectedSlice.playbookEnabled ||
            slice.artifactIntegrity !== 'pass'
        })) fail()
    try {
      assertPlan55Cleanup(checkpointService.cleanup)
      assertPlan55Cleanup(aggregateService.cleanup)
    } catch {
      fail()
    }
    if (typeof aggregateService.cleanup.reused !== 'boolean') fail()
    assertG5Deltas(aggregateService.g5_deltas, gate)
  }
}

function assertG5Deltas(value, gate) {
  const fail = () => { throw new Error(`Plan 55 gate-specific evidence contract failed: ${gate}`) }
  for (const dataset of ['corpus', 'holdout']) {
    const delta = value?.[dataset]
    if (!delta) fail()
    assertRateDelta(delta.scope_signal, 'passed', 'total', 'non_decreasing', 'rate', fail)
    assertRateDelta(delta.problem_slug, 'passed', 'total', 'non_decreasing', 'rate', fail)
    assertRateDelta(delta.required_safety_recall, 'observed', 'expected', 'non_decreasing', 'recall', fail)
    if (delta.scope_signal.baseline.total !== 24 || delta.scope_signal.after.total !== 24 ||
        delta.problem_slug.baseline.total !== 24 || delta.problem_slug.after.total !== 24 ||
        delta.required_safety_recall.baseline.expected !== delta.required_safety_recall.after.expected ||
        delta.provider_fallback?.baseline?.total !== 24 || delta.provider_fallback?.after?.total !== 24) fail()
    const fallback = delta.provider_fallback
    if (!fallback || !isValidCountPair(fallback.baseline?.runs, fallback.baseline?.total) ||
        !isValidCountPair(fallback.after?.runs, fallback.after?.total)) fail()
    const before = fallback.baseline.runs / fallback.baseline.total
    const after = fallback.after.runs / fallback.after.total
    const withinTwentyPoints = Math.abs(
      fallback.after.runs * fallback.baseline.total - fallback.baseline.runs * fallback.after.total,
    ) * 100 <= 20 * fallback.baseline.total * fallback.after.total
    if (fallback.within_20pp !== withinTwentyPoints || !withinTwentyPoints ||
        !isRoundedDelta(fallback.delta, after - before)) fail()
  }
}

function assertRateDelta(value, countKey, totalKey, resultKey, ratioKey, fail) {
  if (!value || !isValidCountPair(value.baseline?.[countKey], value.baseline?.[totalKey]) ||
      !isValidCountPair(value.after?.[countKey], value.after?.[totalKey]) ||
      value.baseline[totalKey] !== value.after[totalKey]) fail()
  const before = value.baseline[countKey] / value.baseline[totalKey]
  const after = value.after[countKey] / value.after[totalKey]
  const nonDecreasing = value.after[countKey] * value.baseline[totalKey] >=
    value.baseline[countKey] * value.after[totalKey]
  if (value[resultKey] !== nonDecreasing || !nonDecreasing ||
      !isRoundedDelta(value.delta, after - before) ||
      value.baseline[ratioKey] !== roundMetric(before) ||
      value.after[ratioKey] !== roundMetric(after)) fail()
}

function isValidCountPair(count, total) {
  return Number.isSafeInteger(count) && count >= 0 && Number.isSafeInteger(total) && total > 0 && count <= total
}

function isRoundedDelta(value, expected) {
  return Number.isFinite(value) && value === roundMetric(expected)
}

function roundMetric(value) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000
}

function matchesPolicyGateInventory(policy, targetState, gates) {
  if (targetState === 'aborted') return gates.length === 0
  const phases = targetState === 'rolled_back'
    ? ['rolled_back']
    : PROMOTION_GATE_PHASES.slice(0, PROMOTION_GATE_PHASES.indexOf(targetState) + 1)
  if (phases.length === 0 || (targetState !== 'rolled_back' && !PROMOTION_GATE_PHASES.includes(targetState))) {
    return false
  }
  const expected = [...new Set(phases.flatMap((phase) => policy?.requiredGatesByTarget?.[phase] ?? []))].sort()
  return JSON.stringify(gates) === JSON.stringify(expected)
}

function isGitHubArtifactProvenance(value, repository) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    value.repository === repository && REPOSITORY.test(value.repository ?? '') &&
    WORKFLOW_PATH.test(value.workflowPath ?? '') && Number.isSafeInteger(Number(value.runId)) && Number(value.runId) > 0 &&
    Number.isSafeInteger(value.runAttempt) && value.runAttempt > 0 &&
    Number.isSafeInteger(value.artifactId) && value.artifactId > 0 &&
    typeof value.artifactName === 'string' && /^[A-Za-z0-9_.-]{1,128}$/u.test(value.artifactName) &&
    isSafeArtifactPath(value.artifactEvidencePath) &&
    isGitSha(value.workflowHeadSha) && /^sha256:[a-f0-9]{64}$/u.test(value.artifactDigest ?? ''))
}

function isSafeArtifactPath(value) {
  return typeof value === 'string' && value.length <= 512 && !value.includes('\\') &&
    !value.startsWith('/') && value.split('/').every((part) => part && part !== '.' && part !== '..')
}

function assertSafeGateEvidence(value, path = 'evidence', depth = 0) {
  if (depth > 12) throw new Error(`${path} exceeds safe Plan 55 evidence depth`)
  if (value === null || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`)
    return
  }
  if (typeof value === 'string') {
    if (!SAFE_EVIDENCE_VALUE.test(value) || SENSITIVE_EVIDENCE_VALUE.test(value)) {
      throw new Error(`${path} contains unsafe Plan 55 evidence text`)
    }
    return
  }
  if (Array.isArray(value)) {
    if (value.length > 40) throw new Error(`${path} exceeds safe Plan 55 evidence item count`)
    value.forEach((item, index) => assertSafeGateEvidence(item, `${path}[${index}]`, depth + 1))
    return
  }
  if (!value || typeof value !== 'object') throw new Error(`${path} contains an unsupported value`)
  for (const [key, item] of Object.entries(value)) {
    if (key.length > 80 ||
        (SENSITIVE_EVIDENCE_KEY.test(key) && !SAFE_CLEANUP_COUNT_KEYS.has(key))) {
      throw new Error(`${path}.${key} is not allowed in Plan 55 evidence`)
    }
    assertSafeGateEvidence(item, `${path}.${key}`, depth + 1)
  }
}

function isTrustedGitHubArtifactProvenance(value, policy, gate) {
  const gateWorkflow = policy?.trustedEvidenceWorkflowPathsByGate?.[gate]
  return isGitHubArtifactProvenance(value, policy?.repository) &&
    Array.isArray(policy?.trustedEvidenceWorkflowPaths) &&
    policy.trustedEvidenceWorkflowPaths.includes(value.workflowPath) &&
    typeof gateWorkflow === 'string' && value.workflowPath === gateWorkflow
}

async function githubJson(fetchImpl, token, repository, path) {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
  })
  if (!response?.ok) throw new Error('Plan 55 GitHub artifact provenance lookup failed')
  return response.json()
}

function readZipFiles(archive) {
  const endSignature = 0x06054b50
  const centralSignature = 0x02014b50
  const localSignature = 0x04034b50
  const searchStart = Math.max(0, archive.length - 65_557)
  let endOffset = -1
  for (let offset = archive.length - 22; offset >= searchStart; offset -= 1) {
    if (archive.readUInt32LE(offset) === endSignature) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0 || archive.readUInt16LE(endOffset + 4) !== 0 ||
      archive.readUInt16LE(endOffset + 6) !== 0 ||
      endOffset + 22 + archive.readUInt16LE(endOffset + 20) !== archive.length) {
    throw new Error('Plan 55 artifact archive format is invalid')
  }
  const entryCount = archive.readUInt16LE(endOffset + 10)
  const centralSize = archive.readUInt32LE(endOffset + 12)
  const centralOffset = archive.readUInt32LE(endOffset + 16)
  if (archive.readUInt16LE(endOffset + 8) !== entryCount || centralOffset + centralSize > endOffset) {
    throw new Error('Plan 55 artifact archive index is invalid')
  }

  const files = new Map()
  let cursor = centralOffset
  let totalUncompressedSize = 0
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== centralSignature) {
      throw new Error('Plan 55 artifact archive entry is invalid')
    }
    const flags = archive.readUInt16LE(cursor + 8)
    const method = archive.readUInt16LE(cursor + 10)
    const compressedSize = archive.readUInt32LE(cursor + 20)
    const uncompressedSize = archive.readUInt32LE(cursor + 24)
    totalUncompressedSize += uncompressedSize
    const nameLength = archive.readUInt16LE(cursor + 28)
    const extraLength = archive.readUInt16LE(cursor + 30)
    const commentLength = archive.readUInt16LE(cursor + 32)
    const localOffset = archive.readUInt32LE(cursor + 42)
    const nameStart = cursor + 46
    const nameEnd = nameStart + nameLength
    const entryEnd = nameEnd + extraLength + commentLength
    if (entryEnd > archive.length || (flags & 1) !== 0 ||
        compressedSize === 0xffffffff || uncompressedSize === 0xffffffff ||
        uncompressedSize > MAX_EVIDENCE_FILE_BYTES ||
        totalUncompressedSize > MAX_ARTIFACT_UNCOMPRESSED_BYTES ||
        localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== localSignature) {
      throw new Error('Plan 55 artifact archive entry is unsupported')
    }
    let name
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(archive.subarray(nameStart, nameEnd))
    } catch {
      throw new Error('Plan 55 artifact archive filename is invalid')
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26)
    const localExtraLength = archive.readUInt16LE(localOffset + 28)
    const localFlags = archive.readUInt16LE(localOffset + 6)
    const localMethod = archive.readUInt16LE(localOffset + 8)
    const localName = archive.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8')
    if (localFlags !== flags || localMethod !== method || localName !== name) {
      throw new Error('Plan 55 artifact archive local header is inconsistent')
    }
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > centralOffset) throw new Error('Plan 55 artifact archive data is invalid')
    const compressed = archive.subarray(dataStart, dataEnd)
    let content
    try {
      content = method === 0
        ? Buffer.from(compressed)
        : method === 8
          ? inflateRawSync(compressed, { maxOutputLength: MAX_EVIDENCE_FILE_BYTES })
          : null
    } catch {
      throw new Error('Plan 55 artifact archive compression is invalid')
    }
    if (!content || content.length !== uncompressedSize || files.has(name)) {
      throw new Error('Plan 55 artifact archive content is invalid')
    }
    files.set(name, content)
    cursor = entryEnd
  }
  if (cursor !== centralOffset + centralSize) throw new Error('Plan 55 artifact archive index is inconsistent')
  return files
}

async function readBoundedArtifactArchive(response) {
  const contentLengthHeader = response.headers?.get?.('content-length')
  const contentLength = typeof contentLengthHeader === 'string' && contentLengthHeader.trim()
    ? Number(contentLengthHeader)
    : Number.NaN
  if (Number.isFinite(contentLength) && contentLength > MAX_ARTIFACT_ARCHIVE_BYTES) {
    throw new Error('Plan 55 artifact archive is too large')
  }
  const reader = response.body?.getReader?.()
  if (!reader) throw new Error('Plan 55 artifact download requires a bounded stream')
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      total += chunk.length
      if (total > MAX_ARTIFACT_ARCHIVE_BYTES) {
        try {
          await reader.cancel()
        } catch {}
        throw new Error('Plan 55 artifact archive is too large')
      }
      chunks.push(chunk)
    }
  } catch (error) {
    if (total > MAX_ARTIFACT_ARCHIVE_BYTES) throw error
    throw new Error('Plan 55 artifact download stream failed')
  }
  return Buffer.concat(chunks, total)
}

function resolveEvidenceFile(root, path, label) {
  if (typeof path !== 'string' || !path.trim() || isAbsolute(path) ||
      path.split(/[\\/]/u).includes('..')) {
    throw new Error(`Plan 55 ${label} path is invalid or outside the evidence set`)
  }
  let resolved
  try {
    resolved = realpathSync(resolve(root, path))
  } catch {
    throw new Error(`Plan 55 ${label} file is missing`)
  }
  const fromRoot = relative(root, resolved)
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot) ||
      !statSync(resolved).isFile()) {
    throw new Error(`Plan 55 ${label} path is outside the evidence set`)
  }
  return resolved
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error(`Plan 55 ${label} JSON is invalid`)
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function isSha256(value) {
  return typeof value === 'string' && SHA256.test(value)
}

function isGitSha(value) {
  return typeof value === 'string' && GIT_SHA.test(value)
}
