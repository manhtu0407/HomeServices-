import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertPlan55SourceAttestation } from '../../apps/api/scripts/lib/kael-playbook-production-attestation.mjs'
import { verifyEdgeSourceProof, verifyHostedSourceProof } from './edge-source-proof.mjs'

const POLICY_PATH = 'config/harness/plan55-production-only-policy.json'
const DEPLOYED_GUARD_PROOF_SCHEMA = 'plan55-deployed-guard-gate-proof.v1'
const WORKFLOW_PATH = '.github/workflows/ci.yml'
const GIT_SHA = /^[a-f0-9]{40}$/u
const SHA256 = /^[a-f0-9]{64}$/u
const PREFLIGHT_PROVIDERS = Object.freeze(['anthropic', 'durable_guards', 'global_ai_enabled'])
const DEPLOYED_GUARD_CHECKS = Object.freeze({
  'plan55-runtime-source-match': Object.freeze(['candidate_release_matches_deployed_source']),
  'plan55-guard-deployed': Object.freeze(['actor_scoped_guard_source_attested']),
  'plan55-all-global-flags-off': Object.freeze(['all_plan55_flags_absent']),
  'plan55-provider-readiness': Object.freeze(['required_providers_ready']),
  'plan55-no-migration': Object.freeze(['hosted_migrations_unchanged']),
})
const DEPLOYED_GUARD_PROOF_KEYS = Object.freeze([
  'schemaVersion', 'gate', 'status', 'environment', 'projectRef', 'policyId', 'policySha256',
  'releaseId', 'sourceSha', 'workflowPath', 'runId', 'runAttempt', 'deployment', 'artifactDigests', 'checks',
])

export const PLAN55_DEPLOYED_GUARD_GATES = Object.freeze(Object.keys(DEPLOYED_GUARD_CHECKS))

export function buildPlan55DeployedGuardGateProofs({
  policy,
  releaseBytes,
  hostedBeforeBytes,
  hostedDeployedBytes,
  edgeSourceProofBytes,
  sourceAttestationBytes,
  releasePreflightBytes,
  provenance,
}) {
  const inputs = parseInputs({
    policy,
    releaseBytes,
    hostedBeforeBytes,
    hostedDeployedBytes,
    edgeSourceProofBytes,
    sourceAttestationBytes,
    releasePreflightBytes,
    provenance,
  })
  const { release, hostedBefore, hostedDeployed, edgeSourceProof, sourceAttestation, releasePreflight } = inputs
  assertReleaseIdentity(policy, release)
  assertWorkflowRun(policy, provenance)
  assertPinnedProductionBaseline(policy, hostedBefore)
  assertDeployedTarget(policy, release, hostedDeployed, hostedBefore)
  assertMigrationInventory(hostedBefore, hostedDeployed)
  assertEdgeReleaseIdentity(release, edgeSourceProof)
  verifyHostedSourceProof(edgeSourceProof, hostedDeployed)
  assertSourceAttestation(release, hostedDeployed, edgeSourceProof, sourceAttestation)
  assertReleasePreflight(policy, release, releasePreflight)

  const deployment = Object.freeze({
    deploymentId: edgeSourceProof.deploymentId,
    edgeVersion: edgeSourceProof.edgeVersion,
    deployedSourceSha256: edgeSourceProof.sourceSha256,
    hostedBundleSha256: edgeSourceProof.hostedBundleSha256,
    runtimeConfigurationSha256: edgeSourceProof.runtimeConfigurationSha256,
  })
  const artifactDigests = Object.freeze({
    hostedBeforeSha256: sha256(inputs.hostedBeforeBytes),
    hostedDeployedSha256: sha256(inputs.hostedDeployedBytes),
    edgeSourceProofSha256: sha256(inputs.edgeSourceProofBytes),
    sourceAttestationSha256: sha256(inputs.sourceAttestationBytes),
    releasePreflightSha256: sha256(inputs.releasePreflightBytes),
    migrationInventorySha256: sha256(Buffer.from(JSON.stringify(hostedBefore.migrations))),
  })

  return Object.fromEntries(PLAN55_DEPLOYED_GUARD_GATES.map((gate) => [gate, Object.freeze({
    schemaVersion: DEPLOYED_GUARD_PROOF_SCHEMA,
    gate,
    status: 'PASS',
    environment: policy.environment,
    projectRef: policy.projectRef,
    policyId: policy.policyId,
    policySha256: policy.policySha256,
    releaseId: release.releaseId,
    sourceSha: release.gitSha,
    workflowPath: provenance.workflowPath,
    runId: String(provenance.runId),
    runAttempt: provenance.runAttempt,
    deployment,
    artifactDigests,
    checks: DEPLOYED_GUARD_CHECKS[gate].map((id) => Object.freeze({ id, outcome: 'success' })),
  })]))
}

export function assertPlan55DeployedGuardGateProof(proof, {
  gate,
  policy,
  release,
  provenance,
  sourceArtifactFiles,
}) {
  const fail = () => {
    throw new Error(`Plan 55 deployed guard gate proof contract failed: ${gate ?? 'unknown'}`)
  }
  const checkIds = DEPLOYED_GUARD_CHECKS[gate]
  if (!checkIds || !proof || typeof proof !== 'object' || Array.isArray(proof) ||
      !(sourceArtifactFiles instanceof Map) ||
      JSON.stringify(Object.keys(proof).sort()) !== JSON.stringify([...DEPLOYED_GUARD_PROOF_KEYS].sort()) ||
      proof.schemaVersion !== DEPLOYED_GUARD_PROOF_SCHEMA || proof.gate !== gate || proof.status !== 'PASS' ||
      proof.environment !== 'production' || proof.environment !== policy?.environment ||
      proof.projectRef !== policy?.projectRef || proof.policyId !== policy?.policyId ||
      proof.policySha256 !== policy?.policySha256 || proof.releaseId !== release?.releaseId ||
      proof.sourceSha !== release?.gitSha || !GIT_SHA.test(proof.sourceSha ?? '') ||
      proof.workflowPath !== policy?.trustedEvidenceWorkflowPathsByGate?.[gate] ||
      proof.workflowPath !== provenance?.workflowPath ||
      !policy?.trustedEvidenceWorkflowPaths?.includes(proof.workflowPath) ||
      proof.runId !== String(provenance?.runId) || !/^[1-9]\d*$/u.test(proof.runId) ||
      proof.runAttempt !== provenance?.runAttempt || !Number.isSafeInteger(proof.runAttempt) ||
      proof.runAttempt < 1 || !isDeploymentIdentity(proof.deployment) ||
      !isArtifactDigests(proof.artifactDigests) || !Array.isArray(proof.checks) ||
      proof.checks.length !== checkIds.length ||
      proof.checks.some((check, index) => !check || typeof check !== 'object' || Array.isArray(check) ||
        JSON.stringify(Object.keys(check).sort()) !== JSON.stringify(['id', 'outcome']) ||
        check.id !== checkIds[index] || check.outcome !== 'success')) fail()

  if (release.environment !== proof.environment || release.gitSha !== proof.sourceSha ||
      release.releaseLane !== 'plan55-production-only' ||
      release.releaseId !== proof.releaseId ||
      !new RegExp(`^harness-${proof.sourceSha.slice(0, 12)}-[a-f0-9]{12}$`, 'u').test(proof.releaseId)) fail()

  const expected = buildPlan55DeployedGuardGateProofs({
    policy,
    releaseBytes: uniqueArtifactFile(sourceArtifactFiles, 'release.json'),
    hostedBeforeBytes: uniqueArtifactFile(sourceArtifactFiles, 'hosted-before.json'),
    hostedDeployedBytes: uniqueArtifactFile(sourceArtifactFiles, 'hosted-guard-deployed.json'),
    edgeSourceProofBytes: uniqueArtifactFile(sourceArtifactFiles, 'production-edge-source-proof.json'),
    sourceAttestationBytes: uniqueArtifactFile(sourceArtifactFiles, 'production-source-attestation.json'),
    releasePreflightBytes: uniqueArtifactFile(sourceArtifactFiles, 'production-release-preflight.json'),
    provenance,
  })[gate]
  if (JSON.stringify(proof) !== JSON.stringify(expected)) {
    throw new Error(`Plan 55 deployed guard proof does not match source artifacts: ${gate}`)
  }
  return true
}

function parseInputs(input) {
  const buffers = [
    input.releaseBytes,
    input.hostedBeforeBytes,
    input.hostedDeployedBytes,
    input.edgeSourceProofBytes,
    input.sourceAttestationBytes,
    input.releasePreflightBytes,
  ]
  if (buffers.some((value) => !Buffer.isBuffer(value) || value.length === 0)) {
    throw new Error('Plan 55 deployed guard source artifact is missing')
  }
  return {
    ...input,
    release: parseJsonBuffer(input.releaseBytes, 'Plan 55 release manifest'),
    hostedBefore: parseJsonBuffer(input.hostedBeforeBytes, 'Production baseline snapshot'),
    hostedDeployed: parseJsonBuffer(input.hostedDeployedBytes, 'deployed Production snapshot'),
    edgeSourceProof: parseJsonBuffer(input.edgeSourceProofBytes, 'deployed Edge source proof'),
    sourceAttestation: parseJsonBuffer(input.sourceAttestationBytes, 'Production source attestation'),
    releasePreflight: parseJsonBuffer(input.releasePreflightBytes, 'deployed Production preflight'),
  }
}

function assertReleaseIdentity(policy, release) {
  if (policy?.environment !== 'production' || release?.environment !== policy.environment ||
      release.releaseLane !== 'plan55-production-only' || !GIT_SHA.test(release.gitSha ?? '') ||
      !new RegExp(`^harness-${release.gitSha.slice(0, 12)}-[a-f0-9]{12}$`, 'u')
        .test(release.releaseId ?? '')) {
    throw new Error('Plan 55 deployed guard release identity is invalid')
  }
}

function assertWorkflowRun(policy, provenance) {
  if (!provenance || typeof provenance !== 'object' ||
      !policy?.trustedEvidenceWorkflowPaths?.includes(provenance.workflowPath) ||
      !/^[1-9]\d*$/u.test(String(provenance.runId)) ||
      !Number.isSafeInteger(provenance.runAttempt) || provenance.runAttempt < 1 ||
      PLAN55_DEPLOYED_GUARD_GATES.some((gate) =>
        policy.trustedEvidenceWorkflowPathsByGate?.[gate] !== provenance.workflowPath) ||
      provenance.workflowPath !== WORKFLOW_PATH) {
    throw new Error('Plan 55 deployed guard evidence workflow identity is invalid')
  }
}

function assertPinnedProductionBaseline(policy, hosted) {
  const pinned = policy?.productionSourceBase
  const edge = hosted?.managedEdgeFunctions?.['mobile-api']
  if (!pinned || hosted?.environment !== 'production' || hosted.projectRef !== policy.projectRef ||
      hosted.projectUrl !== expectedProductionProjectUrl(policy) ||
      hosted.releaseId !== pinned.releaseId || hosted.gitSha !== pinned.sha ||
      !Array.isArray(hosted.migrations) || !isManagedEdge(edge)) {
    throw new Error('Plan 55 deployed guard baseline does not match the pinned Production target')
  }
}

function assertDeployedTarget(policy, release, hosted, before) {
  const edge = hosted?.managedEdgeFunctions?.['mobile-api']
  if (hosted?.environment !== 'production' || hosted.projectRef !== policy.projectRef ||
      hosted.projectUrl !== expectedProductionProjectUrl(policy) ||
      hosted.releaseId !== release.releaseId || hosted.gitSha !== release.gitSha ||
      !isManagedEdge(edge)) {
    throw new Error('Plan 55 deployed snapshot target or source does not match the candidate release')
  }
  const baselineEdge = before.managedEdgeFunctions['mobile-api']
  if (edge.id !== baselineEdge.id || edge.version <= baselineEdge.version) {
    throw new Error('Plan 55 deployed Edge identity did not advance from the captured Production baseline')
  }
}

function expectedProductionProjectUrl(policy) {
  return typeof policy?.projectRef === 'string' && policy.projectRef.length > 0
    ? `https://${policy.projectRef}.supabase.co`
    : null
}

function assertMigrationInventory(before, deployed) {
  if (!Array.isArray(before?.migrations) || !Array.isArray(deployed?.migrations) ||
      JSON.stringify(before.migrations) !== JSON.stringify(deployed.migrations)) {
    throw new Error('Plan 55 deployed guard migration inventory drifted from the Production baseline')
  }
}

function assertEdgeReleaseIdentity(release, proof) {
  verifyEdgeSourceProof(proof)
  const runtime = release.edgeRuntimeConfigurations?.[proof.functionName]
  const expectedSourceInputs = release.edgeFunctionInputs?.[proof.functionName]
  if (proof.environment !== release.environment || proof.releaseId !== release.releaseId ||
      release.edgeFunctions?.[proof.functionName] !== proof.sourceSha256 ||
      !Array.isArray(expectedSourceInputs) ||
      JSON.stringify(expectedSourceInputs) !== JSON.stringify(proof.sourceInputs) ||
      !runtime || runtime.sha256 !== proof.runtimeConfigurationSha256 ||
      runtime.verifyJwt !== proof.verifyJwt || runtime.importMap !== proof.importMap ||
      !managedPathMatches(proof.entrypointPath, runtime.entrypointPath, proof) ||
      (runtime.importMap
        ? !managedPathMatches(proof.importMapPath, runtime.importMapPath, proof)
        : proof.importMapPath !== null)) {
    throw new Error('Plan 55 deployed Edge source proof does not match the candidate release')
  }
}

function assertSourceAttestation(release, hosted, edgeProof, attestation) {
  assertPlan55SourceAttestation(attestation, release.gitSha)
  const source = attestation.deployed_source
  const deployment = attestation.deployment
  const managed = hosted.managedEdgeFunctions['mobile-api']
  if (deployment.project_ref !== hosted.projectRef || deployment.release_id !== release.releaseId ||
      deployment.git_sha !== release.gitSha || deployment.deployment_id !== edgeProof.deploymentId ||
      source.environment !== hosted.environment || source.project_ref !== hosted.projectRef ||
      source.release_id !== hosted.releaseId || source.deployment_id !== edgeProof.deploymentId ||
      source.function_id !== managed.id || source.edge_version !== managed.version ||
      source.git_sha !== release.gitSha || source.source_sha256 !== `sha256:${edgeProof.sourceSha256}` ||
      source.hosted_bundle_sha256 !== `sha256:${edgeProof.hostedBundleSha256}` ||
      source.runtime_configuration_sha256 !== `sha256:${edgeProof.runtimeConfigurationSha256}` ||
      source.verify_jwt !== edgeProof.verifyJwt || source.import_map !== edgeProof.importMap ||
      source.entrypoint_path !== edgeProof.entrypointPath || source.import_map_path !== edgeProof.importMapPath ||
      source.proof_sha256 !== `sha256:${edgeProof.proofSha256}`) {
    throw new Error('Plan 55 deployed guard source attestation does not match the deployed Edge proof')
  }
}

function assertReleasePreflight(policy, release, preflight) {
  const expectedKeys = [
    'schema', 'status', 'project_ref', 'source_sha', 'release_id', 'plan55_flags_absent',
    'required_provider_readiness', 'mutations',
  ]
  const readiness = preflight?.required_provider_readiness
  if (!preflight || typeof preflight !== 'object' || Array.isArray(preflight) ||
      JSON.stringify(Object.keys(preflight).sort()) !== JSON.stringify([...expectedKeys].sort()) ||
      preflight.schema !== 'plan55-production-release-preflight/v1' || preflight.status !== 'PASS' ||
      preflight.project_ref !== policy.projectRef || preflight.source_sha !== release.gitSha ||
      preflight.release_id !== release.releaseId || preflight.plan55_flags_absent !== true ||
      preflight.mutations !== 0 || !readiness || typeof readiness !== 'object' || Array.isArray(readiness) ||
      JSON.stringify(Object.keys(readiness).sort()) !== JSON.stringify([...PREFLIGHT_PROVIDERS].sort()) ||
      PREFLIGHT_PROVIDERS.some((provider) => readiness[provider] !== true)) {
    throw new Error('Plan 55 deployed guard release preflight does not prove flags and providers safe')
  }
}

function isManagedEdge(value) {
  return Boolean(value && value.status === 'ACTIVE' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
      .test(value.id ?? '') && Number.isSafeInteger(value.version) && value.version > 0 &&
    SHA256.test(value.ezbr_sha256 ?? '') && typeof value.verify_jwt === 'boolean' &&
    typeof value.import_map === 'boolean' && typeof value.entrypoint_path === 'string' &&
    typeof value.import_map_path === 'string')
}

function isDeploymentIdentity(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([
      'deploymentId', 'edgeVersion', 'deployedSourceSha256', 'hostedBundleSha256',
      'runtimeConfigurationSha256',
    ].sort()) && typeof value.deploymentId === 'string' && value.deploymentId.length <= 96 &&
    Number.isSafeInteger(value.edgeVersion) && value.edgeVersion > 0 &&
    SHA256.test(value.deployedSourceSha256 ?? '') && SHA256.test(value.hostedBundleSha256 ?? '') &&
    SHA256.test(value.runtimeConfigurationSha256 ?? ''))
}

function isArtifactDigests(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([
      'hostedBeforeSha256', 'hostedDeployedSha256', 'edgeSourceProofSha256',
      'sourceAttestationSha256', 'releasePreflightSha256', 'migrationInventorySha256',
    ].sort()) && Object.values(value).every((digest) => SHA256.test(digest ?? '')))
}

function managedPathMatches(actual, expected, identity) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false
  const normalized = actual.replaceAll('\\', '/').replace(/^\.\//u, '')
  const fileName = expected.split('/').at(-1)
  if (new Set([fileName, `functions/${identity.functionName}/${fileName}`,
    `supabase/functions/${identity.functionName}/${fileName}`]).has(normalized)) {
    return /^[A-Za-z0-9_./-]+$/u.test(normalized) && !normalized.includes('..')
  }
  const providerPath = normalized.match(
    /^file:\/\/\/tmp\/user_fn_([a-z0-9]{20})_([0-9a-f-]{36})_([1-9][0-9]*)\/source\/(supabase\/functions\/[a-z][a-z0-9-]{1,62}\/[A-Za-z0-9._-]+)$/iu,
  )
  if (providerPath) {
    const sourceVersion = Number(providerPath[3])
    return providerPath[1] === identity.projectRef && providerPath[2] === functionIdFromDeployment(identity.deploymentId) &&
      Number.isSafeInteger(sourceVersion) && sourceVersion <= identity.edgeVersion &&
      providerPath[4] === expected
  }
  try {
    const parsed = new URL(actual)
    if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash) return false
    const pathname = decodeURIComponent(parsed.pathname).replaceAll('\\', '/')
    return !pathname.split('/').includes('..') &&
      !pathname.startsWith(`/tmp/user_fn_${identity.projectRef}_`) &&
      pathname.endsWith(`/${expected}`)
  } catch {
    return false
  }
}

function functionIdFromDeployment(deploymentId) {
  const match = String(deploymentId).match(/^[a-z0-9]{20}_([0-9a-f-]{36})_[1-9][0-9]*$/iu)
  return match?.[1] ?? ''
}

function uniqueArtifactFile(files, name) {
  const matches = [...files].filter(([path, bytes]) =>
    (path === name || path.endsWith(`/${name}`)) && Buffer.isBuffer(bytes))
  if (matches.length !== 1) throw new Error(`Plan 55 source artifact file is missing or ambiguous: ${name}`)
  return matches[0][1]
}

function parseJsonBuffer(value, label) {
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
      throw new Error('Plan 55 deployed guard proof arguments are invalid')
    }
    result.set(key.slice(2), value)
  }
  const required = [
    'release', 'hosted-before', 'hosted-deployed', 'edge-source-proof',
    'source-attestation', 'release-preflight', 'output',
  ]
  if (required.some((key) => !result.has(key))) {
    throw new Error('Plan 55 deployed guard proof arguments are incomplete')
  }
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
    workflowPath: policy.trustedEvidenceWorkflowPathsByGate[PLAN55_DEPLOYED_GUARD_GATES[0]],
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  }
  const proofs = buildPlan55DeployedGuardGateProofs({
    policy,
    releaseBytes: readFileSync(resolve(options.get('release'))),
    hostedBeforeBytes: readFileSync(resolve(options.get('hosted-before'))),
    hostedDeployedBytes: readFileSync(resolve(options.get('hosted-deployed'))),
    edgeSourceProofBytes: readFileSync(resolve(options.get('edge-source-proof'))),
    sourceAttestationBytes: readFileSync(resolve(options.get('source-attestation'))),
    releasePreflightBytes: readFileSync(resolve(options.get('release-preflight'))),
    provenance,
  })
  const output = resolve(options.get('output'))
  const root = resolve(process.cwd())
  const local = relative(root, output)
  if (!local || local.startsWith('..') || isAbsolute(local) || local.split(sep).includes('..')) {
    throw new Error('Plan 55 deployed guard proof output escapes repository root')
  }
  mkdirSync(dirname(resolve(output, 'proof-placeholder')), { recursive: true })
  for (const [gate, proof] of Object.entries(proofs)) {
    writeFileSync(resolve(output, `${gate}.json`), `${JSON.stringify(proof)}\n`, { flag: 'wx' })
  }
  console.log(`Plan 55 deployed guard gate proofs written: ${Object.keys(proofs).length}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Plan 55 deployed guard proof generation failed')
    process.exitCode = 1
  }
}
