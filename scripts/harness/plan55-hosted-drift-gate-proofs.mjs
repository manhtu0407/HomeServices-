import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compareDeploymentState } from './deployment-drift.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const GATE = 'plan55-hosted-drift-pass'
const WORKFLOW_PATH = '.github/workflows/plan55-hosted-drift.yml'
const SOURCE_WORKFLOW_PATH = '.github/workflows/ci.yml'
const ALLOWED_TARGET_STATES = new Set([
  'rollback_drill', 'paired_wave_1', 'paired_wave_2', 'paired_wave_3', 'production',
])
const PROOF_KEYS = Object.freeze([
  'schemaVersion', 'gate', 'status', 'environment', 'projectRef', 'policyId', 'policySha256',
  'releaseId', 'sourceSha', 'targetState', 'producerWorkflowPath', 'producerRunId',
  'producerRunAttempt', 'sourceWorkflowPath', 'sourceRunId', 'sourceRunAttempt',
  'releaseArtifactId', 'releaseManifestSha256', 'hostedBaselineSha256',
  'hostedGuardDeployedSha256', 'hostedObservedStateSha256',
])
const SHA256 = /^[a-f0-9]{64}$/u
const GIT_SHA = /^[a-f0-9]{40}$/u

export function buildPlan55HostedDriftGateProof(input) {
  const sourceArtifactFiles = input?.sourceArtifactFiles
  const proof = {
    schemaVersion: 'plan55-hosted-drift-proof.v1',
    gate: GATE,
    status: 'PASS',
    environment: input?.release?.environment,
    projectRef: input?.policy?.projectRef,
    policyId: input?.policy?.policyId,
    policySha256: input?.policy?.policySha256,
    releaseId: input?.release?.releaseId,
    sourceSha: input?.release?.gitSha,
    targetState: input?.targetState,
    producerWorkflowPath: input?.provenance?.workflowPath,
    producerRunId: String(input?.provenance?.runId ?? ''),
    producerRunAttempt: input?.provenance?.runAttempt,
    sourceWorkflowPath: SOURCE_WORKFLOW_PATH,
    sourceRunId: String(input?.sourceRun?.id ?? ''),
    sourceRunAttempt: input?.sourceRun?.attempt,
    releaseArtifactId: input?.releaseArtifactId,
    releaseManifestSha256: sha256(getArtifactFile(sourceArtifactFiles, 'release.json')),
    hostedBaselineSha256: sha256(getArtifactFile(sourceArtifactFiles, 'hosted-before.json')),
    hostedGuardDeployedSha256: sha256(getArtifactFile(sourceArtifactFiles, 'hosted-guard-deployed.json')),
    hostedObservedStateSha256: sha256(getArtifactFile(sourceArtifactFiles, 'hosted-observed.json')),
  }
  assertPlan55HostedDriftGateProof(proof, input)
  return proof
}

export function assertPlan55HostedDriftGateProof(proof, {
  policy, release, targetState, provenance, sourceArtifactFiles,
}) {
  const fail = () => { throw new Error('Plan 55 hosted drift proof contract failed') }
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) ||
      JSON.stringify(Object.keys(proof).sort()) !== JSON.stringify([...PROOF_KEYS].sort()) ||
      proof.schemaVersion !== 'plan55-hosted-drift-proof.v1' || proof.gate !== GATE ||
      proof.status !== 'PASS' || proof.environment !== 'production' ||
      proof.environment !== policy?.environment || proof.projectRef !== policy?.projectRef ||
      proof.policyId !== policy?.policyId || proof.policySha256 !== policy?.policySha256 ||
      proof.releaseId !== release?.releaseId || proof.sourceSha !== release?.gitSha ||
      proof.environment !== release?.environment || proof.targetState !== targetState ||
      !ALLOWED_TARGET_STATES.has(targetState) ||
      proof.producerWorkflowPath !== WORKFLOW_PATH ||
      proof.producerWorkflowPath !== policy?.trustedEvidenceWorkflowPathsByGate?.[GATE] ||
      !policy?.trustedEvidenceWorkflowPaths?.includes(WORKFLOW_PATH) ||
      proof.producerWorkflowPath !== provenance?.workflowPath ||
      proof.producerRunId !== String(provenance?.runId ?? '') ||
      !/^[1-9]\d*$/u.test(proof.producerRunId) ||
      proof.producerRunAttempt !== provenance?.runAttempt ||
      !Number.isSafeInteger(proof.producerRunAttempt) || proof.producerRunAttempt < 1 ||
      provenance?.workflowHeadSha !== release?.gitSha ||
      proof.sourceWorkflowPath !== SOURCE_WORKFLOW_PATH ||
      !/^[1-9]\d*$/u.test(proof.sourceRunId) ||
      !Number.isSafeInteger(proof.sourceRunAttempt) || proof.sourceRunAttempt < 1 ||
      !Number.isSafeInteger(proof.releaseArtifactId) || proof.releaseArtifactId < 1 ||
      ![proof.releaseManifestSha256, proof.hostedBaselineSha256,
        proof.hostedGuardDeployedSha256, proof.hostedObservedStateSha256].every((value) => SHA256.test(value ?? '')) ||
      !GIT_SHA.test(proof.sourceSha ?? '') || policy.projectRef !== 'iwevizmsedyqozxlawwl') {
    fail()
  }

  if (sourceArtifactFiles === undefined) return true
  if (!(sourceArtifactFiles instanceof Map)) fail()
  const releaseBytes = getArtifactFile(sourceArtifactFiles, 'release.json')
  const baselineBytes = getArtifactFile(sourceArtifactFiles, 'hosted-before.json')
  const guardBytes = getArtifactFile(sourceArtifactFiles, 'hosted-guard-deployed.json')
  const observedBytes = getArtifactFile(sourceArtifactFiles, 'hosted-observed.json')
  if (sha256(releaseBytes) !== proof.releaseManifestSha256 ||
      sha256(baselineBytes) !== proof.hostedBaselineSha256 ||
      sha256(guardBytes) !== proof.hostedGuardDeployedSha256 ||
      sha256(observedBytes) !== proof.hostedObservedStateSha256) fail()

  const sourceRelease = parseJson(releaseBytes)
  const baseline = parseJson(baselineBytes)
  const deployedGuard = parseJson(guardBytes)
  const observedState = parseJson(observedBytes)
  if (JSON.stringify(sourceRelease) !== JSON.stringify(release) ||
      baseline.environment !== 'production' || baseline.projectRef !== policy.projectRef ||
      baseline.releaseId !== policy.productionSourceBase?.releaseId ||
      baseline.gitSha !== policy.productionSourceBase?.sha ||
      deployedGuard.environment !== 'production' || deployedGuard.projectRef !== policy.projectRef ||
      deployedGuard.releaseId !== release.releaseId || deployedGuard.gitSha !== release.gitSha ||
      observedState.environment !== 'production' || observedState.projectRef !== policy.projectRef ||
      !Array.isArray(baseline.migrations) || !Array.isArray(deployedGuard.migrations) ||
      !Array.isArray(observedState.migrations) ||
      JSON.stringify(baseline.migrations) !== JSON.stringify(deployedGuard.migrations) ||
      JSON.stringify(deployedGuard.migrations) !== JSON.stringify(observedState.migrations)) fail()

  const inventory = JSON.parse(readFileSync(resolve(ROOT, 'config/harness/migration-inventory.json'), 'utf8'))
  if (!compareDeploymentState({ release, inventory, remote: deployedGuard }).ok ||
      !compareDeploymentState({ release, inventory, remote: observedState }).ok) fail()
  return true
}

function getArtifactFile(files, basename) {
  if (!(files instanceof Map)) throw new Error('Plan 55 hosted drift proof contract failed')
  const matches = [...files].filter(([path]) => path === basename || path.endsWith(`/${basename}`))
  if (matches.length !== 1 || !(matches[0][1] instanceof Buffer)) {
    throw new Error('Plan 55 hosted drift proof contract failed')
  }
  return matches[0][1]
}

function parseJson(bytes) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error('Plan 55 hosted drift proof contract failed')
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
