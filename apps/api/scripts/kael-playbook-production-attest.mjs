#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync as runFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PRODUCTION_MOBILE_API_URL,
  PRODUCTION_PROJECT_REF,
  PLAN55_EVALUATOR_PATHS,
  PLAN55_RUNTIME_SOURCE_PATHS,
  PLAN55_SOURCE_ASSETS,
  validateProductionHealthPayload,
} from './lib/kael-playbook-production-attestation.mjs'
import { verifyEdgeSourceProof, verifyHostedSourceProof } from '../../../scripts/harness/edge-source-proof.mjs'

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')

async function main() {
  if (process.argv.length !== 2) throw new Error('production_source_attest_accepts_no_arguments')

  const response = await fetch(`${PRODUCTION_MOBILE_API_URL}/harness/health`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`production_health_http_${response.status}`)
  const deployment = validateProductionHealthPayload(await response.json())
  assertGitCommitAvailable(deployment.git_sha)
  const [release, hosted, edgeProof] = await Promise.all([
    readArtifact('artifacts/release/release.json'),
    readArtifact('artifacts/release/hosted-guard-deployed.json'),
    readArtifact('artifacts/release/production-edge-source-proof.json'),
  ])
  verifyEdgeSourceProof(edgeProof)
  if (release.gitSha !== deployment.git_sha || hosted.gitSha !== deployment.git_sha ||
      hosted.environment !== 'production' || hosted.projectRef !== PRODUCTION_PROJECT_REF ||
      hosted.releaseId !== deployment.release_id || edgeProof.environment !== 'production' ||
      edgeProof.projectRef !== PRODUCTION_PROJECT_REF || edgeProof.functionName !== 'mobile-api' ||
      edgeProof.releaseId !== release.releaseId || edgeProof.sourceSha256 === '' ) {
    throw new Error('plan55_deployed_source_candidate_identity_mismatch')
  }
  verifyHostedSourceProof(edgeProof, hosted)
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN
  if (!accessToken) throw new Error('plan55_deployed_source_management_token_missing')
  const managedFunction = await readManagedFunction(accessToken)
  const liveHosted = {
    ...hosted,
    deploymentId: `${hosted.projectRef}_${managedFunction.id}_${managedFunction.version}`,
    managedEdgeFunctions: {
      ...hosted.managedEdgeFunctions,
      'mobile-api': managedFunction,
    },
  }
  verifyHostedSourceProof(edgeProof, liveHosted)

  const services = {}
  for (const [service, paths] of Object.entries(PLAN55_SOURCE_ASSETS)) {
    const assets = {}
    for (const [kind, path] of Object.entries(paths)) assets[kind] = await attestFile(deployment.git_sha, path)
    services[service] = assets
  }
  const runtimeFiles = []
  for (const path of PLAN55_RUNTIME_SOURCE_PATHS) {
    runtimeFiles.push(await attestFile(deployment.git_sha, path, 'runtime'))
  }
  const evaluator = await attestEvaluator()

  process.stdout.write(`${JSON.stringify({
    schema: 'plan55-production-source-attestation/v1',
    observed_at: new Date().toISOString(),
    endpoint: `${PRODUCTION_MOBILE_API_URL}/harness/health`,
    deployment,
    deployed_source: {
      schema: 'plan55-deployed-edge-source-attestation/v1',
      environment: edgeProof.environment,
      project_ref: edgeProof.projectRef,
      release_id: edgeProof.releaseId,
      deployment_id: edgeProof.deploymentId,
      function_id: managedFunction.id,
      edge_version: managedFunction.version,
      git_sha: deployment.git_sha,
      source_sha256: `sha256:${edgeProof.sourceSha256}`,
      hosted_bundle_sha256: `sha256:${edgeProof.hostedBundleSha256}`,
      runtime_configuration_sha256: `sha256:${edgeProof.runtimeConfigurationSha256}`,
      verify_jwt: edgeProof.verifyJwt,
      import_map: edgeProof.importMap,
      entrypoint_path: edgeProof.entrypointPath,
      import_map_path: edgeProof.importMapPath,
      proof_sha256: `sha256:${edgeProof.proofSha256}`,
    },
    runtime_files: runtimeFiles,
    evaluator,
    services,
  }, null, 2)}\n`)
}

async function readArtifact(path) {
  return JSON.parse(await readFile(resolve(REPO_ROOT, path), 'utf8'))
}

async function readManagedFunction(accessToken) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT_REF}/functions/mobile-api`,
    {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000),
    },
  )
  if (!response.ok) throw new Error(`plan55_deployed_source_management_http_${response.status}`)
  const value = await response.json()
  if (!value || value.status !== 'ACTIVE' || typeof value.id !== 'string' ||
      !Number.isSafeInteger(value.version) || typeof value.ezbr_sha256 !== 'string') {
    throw new Error('plan55_deployed_source_management_response_invalid')
  }
  return value
}

async function attestEvaluator() {
  const entries = []
  for (const path of PLAN55_EVALUATOR_PATHS) {
    const bytes = await readFile(resolve(REPO_ROOT, path))
    entries.push(`${path}\0${sha256(bytes)}`)
  }
  return {
    files: PLAN55_EVALUATOR_PATHS,
    sha256: `sha256:${sha256(entries.join('\n'))}`,
  }
}

async function attestFile(commit, path, sourceKind = 'asset') {
  const deployedBlob = gitText(['rev-parse', `${commit}:${path}`])
  const localBlob = gitText(['hash-object', `--path=${path}`, path])
  if (deployedBlob !== localBlob) throw new Error(`production_${sourceKind}_source_mismatch:${path}`)
  const deployedBytes = runFile('git', ['show', `${commit}:${path}`], {
    cwd: REPO_ROOT,
    encoding: 'buffer',
    maxBuffer: 8 * 1024 * 1024,
  })
  const workingBytes = await readFile(resolve(REPO_ROOT, path))
  return {
    path,
    git_blob_sha1: deployedBlob,
    deployed_sha256: `sha256:${sha256(deployedBytes)}`,
    working_tree_sha256: `sha256:${sha256(workingBytes)}`,
    working_tree_matches_release_after_git_clean_filter: true,
  }
}

function assertGitCommitAvailable(commit) {
  try {
    runFile('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: REPO_ROOT, stdio: 'ignore' })
  } catch {
    throw new Error('production_release_commit_unavailable_locally')
  }
}

function gitText(args) {
  return runFile('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'production_source_attest_failed'}\n`)
  process.exitCode = 1
})
