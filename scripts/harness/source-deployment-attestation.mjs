import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createReleaseControlClient } from './release-control-client.mjs'
import { verifyEdgeSourceProof } from './edge-source-proof.mjs'
import { resolveReleaseArtifactPath } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function sourceDeploymentAttestationInvocation(proof) {
  verifyEdgeSourceProof(proof)
  return Object.freeze({
    name: 'attest_stage1_source_deployment',
    args: Object.freeze({
      p_environment: proof.environment,
      p_release_id: proof.releaseId,
      p_function_name: proof.functionName,
      p_deployment_id: proof.deploymentId,
      p_edge_version: proof.edgeVersion,
      p_source_sha256: proof.sourceSha256,
      p_hosted_bundle_sha256: proof.hostedBundleSha256,
      p_runtime_configuration_sha256: proof.runtimeConfigurationSha256,
      p_verify_jwt: proof.verifyJwt,
      p_import_map: proof.importMap,
      p_entrypoint_path: normalizedManagedPath(proof.entrypointPath, proof.functionName, 'index.ts'),
      p_import_map_path: proof.importMapPath === null
        ? null
        : normalizedManagedPath(proof.importMapPath, proof.functionName, 'deno.json'),
      p_proof_sha256: proof.proofSha256,
    }),
  })
}

function normalizedManagedPath(value, functionName, fileName) {
  const marker = '/source/'
  const index = value.indexOf(marker)
  if (index >= 0) return value.slice(index + marker.length)
  const expected = `supabase/functions/${functionName}/${fileName}`
  try {
    const pathname = decodeURIComponent(new URL(value).pathname).replaceAll('\\', '/')
    if (pathname.endsWith(`/${expected}`)) return expected
  } catch {
    // Repository-relative paths do not require URL normalization.
  }
  return value
}

function parseArgs(args) {
  const options = {}
  const values = new Map([
    ['--environment', 'environment'],
    ['--project-ref', 'projectRef'],
    ['--proof', 'proof'],
    ['--output', 'output'],
  ])
  for (let index = 0; index < args.length; index += 1) {
    const field = values.get(args[index])
    if (!field) throw new Error(`unknown source attestation argument: ${args[index]}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${args[index - 1]} requires a value`)
    options[field] = value
  }
  for (const field of ['environment', 'projectRef', 'proof', 'output']) {
    if (!options[field]) throw new Error(`source attestation option is missing: ${field}`)
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const proof = JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.proof), 'utf8'))
  if (proof.environment !== options.environment || proof.projectRef !== options.projectRef) {
    throw new Error('source attestation proof target mismatch')
  }
  const invocation = sourceDeploymentAttestationInvocation(proof)
  const client = createReleaseControlClient({
    environment: options.environment,
    projectRef: options.projectRef,
    projectUrl: `https://${options.projectRef}.supabase.co`,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  const result = await client.rpc(invocation.name, invocation.args)
  const row = Array.isArray(result) ? result[0] : result
  if (row?.attested !== true || row?.deployment_id !== proof.deploymentId ||
      row?.release_id !== proof.releaseId || row?.source_sha256 !== proof.sourceSha256 ||
      row?.runtime_configuration_sha256 !== proof.runtimeConfigurationSha256 ||
      row?.proof_sha256 !== proof.proofSha256) {
    throw new Error('hosted source deployment attestation did not converge')
  }
  const output = resolveReleaseArtifactPath(ROOT, options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify({ proof, result: row }, null, 2)}\n`)
  console.log(`source deployment attested: ${proof.deploymentId}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
