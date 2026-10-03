import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  PLAN55_EVALUATOR_PATHS,
  PLAN55_RUNTIME_SOURCE_PATHS,
  PLAN55_SOURCE_ASSETS,
} from '../../apps/api/scripts/lib/kael-playbook-production-attestation.mjs'
import { loadPlan55ProductionOnlyPolicy } from './promotion.mjs'
import {
  assertPlan55FinalizationArtifactFiles,
  buildPlan55GateEvidenceArtifact,
} from './plan55-gate-receipts.mjs'
import {
  assertPlan55DeployedGuardGateProof,
  buildPlan55DeployedGuardGateProofs,
  PLAN55_DEPLOYED_GUARD_GATES,
} from './plan55-deployed-guard-gate-proofs.mjs'

const sourcePolicy = loadPlan55ProductionOnlyPolicy(process.cwd())
const policy = {
  ...sourcePolicy,
  trustedEvidenceWorkflowPathsByGate: {
    ...sourcePolicy.trustedEvidenceWorkflowPathsByGate,
    ...Object.fromEntries(PLAN55_DEPLOYED_GUARD_GATES.map((gate) => [
      gate,
      '.github/workflows/ci.yml',
    ])),
  },
}
const sourceSha = 'a'.repeat(40)
const releaseId = `harness-${sourceSha.slice(0, 12)}-${'b'.repeat(12)}`
const functionId = '10000000-0000-4000-8000-000000000057'
const deploymentId = `${policy.projectRef}_${functionId}_43`
const provenance = {
  workflowPath: '.github/workflows/ci.yml',
  runId: '9001',
  runAttempt: 2,
}
const edgeSourceSha256 = '1'.repeat(64)
const runtimeConfigurationSha256 = '2'.repeat(64)
const hostedBundleSha256 = '3'.repeat(64)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const prefixed = (value) => `sha256:${value}`

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`)
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value))
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

function edgeProof() {
  const proof = {
    schemaVersion: 'stage1-edge-source-proof.v1',
    environment: 'production',
    projectRef: policy.projectRef,
    releaseId,
    functionName: 'mobile-api',
    deploymentId,
    edgeVersion: 43,
    sourceSha256: edgeSourceSha256,
    sourceInputs: [
      'supabase/functions/_shared/plan55.ts',
      'supabase/functions/mobile-api/_shared/plan55.ts',
    ],
    hostedBundleSha256,
    runtimeConfigurationSha256,
    verifyJwt: true,
    importMap: true,
    entrypointPath: 'index.ts',
    importMapPath: 'deno.json',
    generatedAt: '2026-10-01T00:00:00.000Z',
    proofSha256: '',
  }
  proof.proofSha256 = sha256(canonicalJson({ ...proof, proofSha256: undefined }))
  return proof
}

function attestedFile(path) {
  return {
    path,
    git_blob_sha1: '4'.repeat(40),
    deployed_sha256: prefixed('5'.repeat(64)),
    working_tree_sha256: prefixed('5'.repeat(64)),
    working_tree_matches_release_after_git_clean_filter: true,
  }
}

function sourceAttestation(edge) {
  return {
    schema: 'plan55-production-source-attestation/v1',
    observed_at: '2026-10-01T00:00:00.000Z',
    endpoint: `https://${policy.projectRef}.supabase.co/functions/v1/mobile-api/harness/health`,
    deployment: {
      source: 'public_harness_health',
      project_ref: policy.projectRef,
      status: 'ok',
      provider_configuration_class: 'production-locked',
      webhook_configuration_class: 'production-signed',
      release_id: releaseId,
      deployment_id: deploymentId,
      git_sha: sourceSha,
      manifest_sha256: prefixed('6'.repeat(64)),
      bundle_sha256: prefixed('7'.repeat(64)),
      source_bundle_sha256: prefixed('8'.repeat(64)),
      edge_bundle_sha256: prefixed('9'.repeat(64)),
    },
    deployed_source: {
      schema: 'plan55-deployed-edge-source-attestation/v1',
      environment: 'production',
      project_ref: policy.projectRef,
      release_id: releaseId,
      deployment_id: deploymentId,
      function_id: functionId,
      edge_version: 43,
      git_sha: sourceSha,
      source_sha256: prefixed(edge.sourceSha256),
      hosted_bundle_sha256: prefixed(edge.hostedBundleSha256),
      runtime_configuration_sha256: prefixed(edge.runtimeConfigurationSha256),
      verify_jwt: edge.verifyJwt,
      import_map: edge.importMap,
      entrypoint_path: edge.entrypointPath,
      import_map_path: edge.importMapPath,
      proof_sha256: prefixed(edge.proofSha256),
    },
    runtime_files: PLAN55_RUNTIME_SOURCE_PATHS.map(attestedFile),
    evaluator: {
      files: [...PLAN55_EVALUATOR_PATHS],
      sha256: prefixed('a'.repeat(64)),
    },
    services: Object.fromEntries(Object.entries(PLAN55_SOURCE_ASSETS).map(([service, assets]) => [
      service,
      Object.fromEntries(Object.entries(assets).map(([kind, path]) => [kind, attestedFile(path)])),
    ])),
  }
}

function fixture(overrides = {}) {
  const edge = edgeProof()
  const migrations = [{ version: '20261001000000', name: 'pinned' }]
  const release = {
    environment: 'production',
    releaseLane: 'plan55-production-only',
    releaseId,
    gitSha: sourceSha,
    edgeFunctions: { 'mobile-api': edge.sourceSha256 },
    edgeFunctionInputs: { 'mobile-api': [...edge.sourceInputs] },
    edgeRuntimeConfigurations: {
      'mobile-api': {
        sha256: runtimeConfigurationSha256,
        verifyJwt: edge.verifyJwt,
        importMap: edge.importMap,
        entrypointPath: 'supabase/functions/mobile-api/index.ts',
        importMapPath: 'supabase/functions/mobile-api/deno.json',
      },
    },
  }
  const hostedBefore = {
    environment: 'production',
    projectRef: policy.projectRef,
    projectUrl: `https://${policy.projectRef}.supabase.co`,
    releaseId: policy.productionSourceBase.releaseId,
    gitSha: policy.productionSourceBase.sha,
    migrations,
    managedEdgeFunctions: {
      'mobile-api': {
        id: functionId,
        status: 'ACTIVE',
        version: 42,
        ezbr_sha256: 'c'.repeat(64),
        verify_jwt: true,
        import_map: true,
        entrypoint_path: 'index.ts',
        import_map_path: 'deno.json',
      },
    },
  }
  const hostedDeployed = {
    environment: 'production',
    projectRef: policy.projectRef,
    projectUrl: `https://${policy.projectRef}.supabase.co`,
    releaseId,
    gitSha: sourceSha,
    migrations: structuredClone(migrations),
    managedEdgeFunctions: {
      'mobile-api': {
        id: functionId,
        status: 'ACTIVE',
        version: 43,
        ezbr_sha256: hostedBundleSha256,
        verify_jwt: edge.verifyJwt,
        import_map: edge.importMap,
        entrypoint_path: edge.entrypointPath,
        import_map_path: edge.importMapPath,
      },
    },
  }
  const preflight = {
    schema: 'plan55-production-release-preflight/v1',
    status: 'PASS',
    project_ref: policy.projectRef,
    source_sha: sourceSha,
    release_id: releaseId,
    plan55_flags_absent: true,
    required_provider_readiness: {
      anthropic: true,
      durable_guards: true,
      global_ai_enabled: true,
    },
    mutations: 0,
  }
  const attestation = sourceAttestation(edge)
  Object.assign(hostedBefore, overrides.hostedBefore)
  Object.assign(hostedDeployed, overrides.hostedDeployed)
  Object.assign(preflight, overrides.preflight)
  const artifactFiles = new Map([
    ['release.json', jsonBytes(release)],
    ['hosted-before.json', jsonBytes(hostedBefore)],
    ['hosted-guard-deployed.json', jsonBytes(hostedDeployed)],
    ['production-edge-source-proof.json', jsonBytes(edge)],
    ['production-source-attestation.json', jsonBytes(attestation)],
    ['production-release-preflight.json', jsonBytes(preflight)],
  ])
  return {
    release,
    provenance,
    policy,
    artifactFiles,
    ...Object.fromEntries(artifactFiles),
  }
}

function build(input = fixture()) {
  return buildPlan55DeployedGuardGateProofs({
    policy,
    releaseBytes: input.artifactFiles.get('release.json'),
    hostedBeforeBytes: input.artifactFiles.get('hosted-before.json'),
    hostedDeployedBytes: input.artifactFiles.get('hosted-guard-deployed.json'),
    edgeSourceProofBytes: input.artifactFiles.get('production-edge-source-proof.json'),
    sourceAttestationBytes: input.artifactFiles.get('production-source-attestation.json'),
    releasePreflightBytes: input.artifactFiles.get('production-release-preflight.json'),
    provenance,
  })
}

test('builds deployed-guard proofs from exact Production deployment and fail-closed live preflight artifacts', () => {
  const input = fixture()
  const proofs = build(input)

  assert.deepEqual(Object.keys(proofs).sort(), [...PLAN55_DEPLOYED_GUARD_GATES].sort())
  assert.deepEqual(proofs['plan55-runtime-source-match'].checks.map(({ id }) => id), [
    'candidate_release_matches_deployed_source',
  ])
  assert.deepEqual(proofs['plan55-all-global-flags-off'].checks.map(({ id }) => id), [
    'all_plan55_flags_absent',
  ])
  for (const gate of PLAN55_DEPLOYED_GUARD_GATES) {
    assert.equal(assertPlan55DeployedGuardGateProof(proofs[gate], {
      gate,
      policy,
      release: input.release,
      provenance,
      sourceArtifactFiles: input.artifactFiles,
    }), true)
  }
  assert.doesNotMatch(JSON.stringify(proofs), /secret|provider[_-]?key|service[_-]?role|SUPABASE_URL/iu)
  assert.doesNotMatch(JSON.stringify(proofs), /projectUrl|https:\/\/[^" ]+\.supabase\.co/iu)
})

test('rejects wrong Production target or deployed source before issuing gate proof', () => {
  for (const overrides of [
    { hostedBefore: { projectUrl: 'https://wrong-project.supabase.co' } },
    { hostedBefore: { projectUrl: undefined } },
    { hostedDeployed: { projectRef: 'wrong-project' } },
    { hostedDeployed: { projectUrl: 'https://wrong-project.supabase.co' } },
    { hostedDeployed: { projectUrl: undefined } },
    { hostedDeployed: { environment: 'staging' } },
    { hostedDeployed: { gitSha: 'f'.repeat(40) } },
    { hostedDeployed: { releaseId: `harness-${'f'.repeat(12)}-${'c'.repeat(12)}` } },
  ]) {
    assert.throws(() => build(fixture(overrides)), /deployed|source proof hosted target|attestation/u)
  }
})

test('rejects deployed Edge digest drift from the source proof and attestation', () => {
  const input = fixture()
  const hosted = JSON.parse(input.artifactFiles.get('hosted-guard-deployed.json').toString('utf8'))
  hosted.managedEdgeFunctions['mobile-api'].ezbr_sha256 = 'd'.repeat(64)
  input.artifactFiles.set('hosted-guard-deployed.json', jsonBytes(hosted))
  assert.throws(() => build(input), /source proof|deployed|attestation/u)
})

test('rejects absent scoped/global flag proof, provider readiness, and mutation evidence', () => {
  for (const preflight of [
    { plan55_flags_absent: false },
    { required_provider_readiness: { anthropic: false, durable_guards: true, global_ai_enabled: true } },
    { mutations: 1 },
  ]) {
    assert.throws(() => build(fixture({ preflight })), /preflight|flag|provider|mutation/u)
  }
})

test('rejects any applied-migration drift from the captured Production baseline', () => {
  const input = fixture()
  const hosted = JSON.parse(input.artifactFiles.get('hosted-guard-deployed.json').toString('utf8'))
  hosted.migrations.push({ version: '20261002000000', name: 'unexpected' })
  input.artifactFiles.set('hosted-guard-deployed.json', jsonBytes(hosted))
  assert.throws(() => build(input), /migration/u)
})

test('revalidates the generated proof against the exact archived source artifact bytes', () => {
  const input = fixture()
  const proof = build(input)['plan55-guard-deployed']
  const altered = new Map(input.artifactFiles)
  const hosted = JSON.parse(altered.get('hosted-guard-deployed.json').toString('utf8'))
  hosted.releaseId = policy.productionSourceBase.releaseId
  altered.set('hosted-guard-deployed.json', jsonBytes(hosted))

  assert.throws(() => assertPlan55DeployedGuardGateProof(proof, {
    gate: 'plan55-guard-deployed',
    policy,
    release: input.release,
    provenance,
    sourceArtifactFiles: altered,
  }), /deployed|source artifacts/u)
})

test('requires exact source artifacts when verifying a deployed guard proof', () => {
  const input = fixture()
  const proof = build(input)['plan55-guard-deployed']

  assert.throws(() => assertPlan55DeployedGuardGateProof(proof, {
    gate: 'plan55-guard-deployed',
    policy,
    release: input.release,
    provenance,
  }), /source artifact|contract/u)
})

test('packages all deployed-guard gates from one verified release artifact without external evidence', () => {
  const input = fixture()
  const release = JSON.parse(input.artifactFiles.get('release.json').toString('utf8'))
  const requiredGates = [...PLAN55_DEPLOYED_GUARD_GATES]
  const packagePolicy = {
    ...policy,
    requiredGatesByTarget: Object.fromEntries(Object.keys(policy.requiredGatesByTarget).map((state) => [
      state,
      state === 'receipts_validated' ? requiredGates : [],
    ])),
  }
  const proofs = build(input)
  const artifactFiles = new Map(input.artifactFiles)
  const sourceEvidence = new Map()
  const artifactId = 97532
  const artifactDigest = `sha256:${sha256(Buffer.from('exact release artifact archive'))}`

  for (const gate of requiredGates) {
    const artifactEvidencePath = `plan55-gate-evidence/${gate}.json`
    const evidenceBytes = jsonBytes(proofs[gate])
    artifactFiles.set(artifactEvidencePath, evidenceBytes)
    sourceEvidence.set(gate, {
      evidenceBytes,
      artifactEvidencePath,
      artifactFiles,
      provenance: {
        repository: packagePolicy.repository,
        ...provenance,
        workflowHeadSha: release.gitSha,
        artifactId,
        artifactName: `plan55-release-${provenance.runId}-${provenance.runAttempt}`,
        artifactDigest,
        artifactEvidencePath,
      },
    })
  }

  const files = buildPlan55GateEvidenceArtifact({
    policy: packagePolicy,
    release,
    targetState: 'receipts_validated',
    requiredGates,
    sourceEvidence,
  })

  assert.equal(assertPlan55FinalizationArtifactFiles(files), true)
  const manifest = JSON.parse(files.get('gate-evidence-set.json').toString('utf8'))
  assert.deepEqual(manifest.receipts.map(({ gate }) => gate), [...requiredGates].sort())
  for (const gate of requiredGates) {
    const receipt = JSON.parse(files.get(`receipts/${gate}.json`).toString('utf8'))
    const evidence = JSON.parse(files.get(`evidence/${gate}.json`).toString('utf8'))
    const sourceProof = JSON.parse(files.get(`source-results/${gate}.json`).toString('utf8'))
    assert.equal(receipt.status, 'PASS')
    assert.equal(receipt.provenance.artifactId, artifactId)
    assert.deepEqual(evidence.proof, sourceProof)
  }
})
