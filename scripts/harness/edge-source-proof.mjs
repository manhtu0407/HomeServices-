import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkHarnessRelease,
  edgeSourceClosures,
  resolveReleaseArtifactPath,
} from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SHA256 = /^[0-9a-f]{64}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const FUNCTION_NAME = /^[a-z][a-z0-9-]{1,62}$/u

export function edgeSourceClosure(input) {
  const functionName = input?.functionName ?? 'mobile-api'
  if (!FUNCTION_NAME.test(functionName)) throw new Error('Edge source function name is invalid')
  const bundle = edgeSourceClosures(input?.sourceRoot, [functionName])
  const digest = bundle.digests[functionName]
  const inputs = bundle.inputs[functionName]
  if (!SHA256.test(digest ?? '') || !Array.isArray(inputs) || inputs.length === 0) {
    throw new Error(`Edge source closure is missing for ${functionName}`)
  }
  return Object.freeze({ digest, inputs: Object.freeze([...inputs]) })
}

export function buildEdgeSourceProof(input) {
  const release = input?.release
  const hosted = input?.hosted
  const functionName = input?.functionName ?? 'mobile-api'
  const releaseProblems = checkHarnessRelease(release)
  if (releaseProblems.length) {
    throw new Error(`source proof requires a valid release: ${releaseProblems.join('; ')}`)
  }
  if (hosted?.environment !== release.environment ||
      hosted?.projectRef !== projectRefFor(release.environment)) {
    throw new Error('source proof hosted target does not match the release environment')
  }
  if (hosted?.releaseId !== release.releaseId) {
    throw new Error('source proof hosted release identity does not match the candidate')
  }
  const managed = hosted?.managedEdgeFunctions?.[functionName]
  if (managed?.status !== 'ACTIVE' || !UUID.test(managed?.id ?? '') ||
      !Number.isSafeInteger(managed?.version) || managed.version < 1 ||
      !SHA256.test(managed?.ezbr_sha256 ?? '')) {
    throw new Error('source proof managed Edge deployment is invalid')
  }
  const deploymentId = `${hosted.projectRef}_${managed.id}_${managed.version}`
  if (functionName === 'mobile-api' && hosted.deploymentId !== deploymentId) {
    throw new Error('source proof provider deployment identity mismatch')
  }
  const closure = edgeSourceClosure({ sourceRoot: input.sourceRoot, functionName })
  const expectedDigest = release.edgeFunctions?.[functionName]
  const expectedInputs = release.edgeFunctionInputs?.[functionName]
  const expectedRuntime = release.edgeRuntimeConfigurations?.[functionName]
  if (closure.digest !== expectedDigest) {
    throw new Error('redownloaded hosted source does not match the local candidate closure')
  }
  if (!Array.isArray(expectedInputs) || JSON.stringify(closure.inputs) !== JSON.stringify(expectedInputs)) {
    throw new Error('redownloaded hosted source import inventory does not match the release')
  }
  if (!SHA256.test(expectedRuntime?.sha256 ?? '') ||
      managed?.verify_jwt !== expectedRuntime.verifyJwt ||
      managed?.import_map !== expectedRuntime.importMap ||
      !managedPathMatches(managed?.entrypoint_path, expectedRuntime.entrypointPath, {
        projectRef: hosted.projectRef,
        functionId: managed.id,
        edgeVersion: managed.version,
        functionName,
      }) ||
      (expectedRuntime.importMap
        ? !managedPathMatches(managed?.import_map_path, expectedRuntime.importMapPath, {
          projectRef: hosted.projectRef,
          functionId: managed.id,
          edgeVersion: managed.version,
          functionName,
        })
        : managed?.import_map_path !== null)) {
    throw new Error('hosted Edge runtime configuration does not match the release')
  }
  const proof = {
    schemaVersion: 'stage1-edge-source-proof.v1',
    environment: release.environment,
    projectRef: hosted.projectRef,
    releaseId: release.releaseId,
    functionName,
    deploymentId,
    edgeVersion: managed.version,
    sourceSha256: closure.digest,
    sourceInputs: [...closure.inputs],
    hostedBundleSha256: managed.ezbr_sha256,
    runtimeConfigurationSha256: expectedRuntime.sha256,
    verifyJwt: managed.verify_jwt,
    importMap: managed.import_map,
    entrypointPath: managed.entrypoint_path,
    importMapPath: managed.import_map_path,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    proofSha256: '',
  }
  proof.proofSha256 = sha256(canonicalJson({ ...proof, proofSha256: undefined }))
  return Object.freeze(proof)
}

export function verifyEdgeSourceProof(proof) {
  if (!proof || proof.schemaVersion !== 'stage1-edge-source-proof.v1' ||
      !['staging', 'production'].includes(proof.environment) ||
      proof.projectRef !== projectRefFor(proof.environment) ||
      !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(proof.releaseId ?? '') ||
      !FUNCTION_NAME.test(proof.functionName ?? '') ||
      !Number.isSafeInteger(proof.edgeVersion) || proof.edgeVersion < 1 ||
      !Array.isArray(proof.sourceInputs) || proof.sourceInputs.length === 0 ||
      new Set(proof.sourceInputs).size !== proof.sourceInputs.length ||
      JSON.stringify(proof.sourceInputs) !== JSON.stringify([...proof.sourceInputs].sort()) ||
      !proof.sourceInputs.some((path) => path.startsWith('supabase/functions/_shared/')) ||
      !SHA256.test(proof.sourceSha256 ?? '') || !SHA256.test(proof.hostedBundleSha256 ?? '') ||
      !SHA256.test(proof.runtimeConfigurationSha256 ?? '') ||
      typeof proof.verifyJwt !== 'boolean' || typeof proof.importMap !== 'boolean' ||
      proof.deploymentId !== `${proof.projectRef}_${deploymentFunctionId(proof.deploymentId)}_${proof.edgeVersion}` ||
      !UUID.test(deploymentFunctionId(proof.deploymentId)) ||
      !proofManagedPathMatches(proof.entrypointPath, proof, 'index.ts') ||
      (proof.importMap ? !proofManagedPathMatches(proof.importMapPath, proof, 'deno.json') : proof.importMapPath !== null)) {
    throw new Error('Edge source proof contract is invalid')
  }
  const expected = sha256(canonicalJson({ ...proof, proofSha256: undefined }))
  if (proof.proofSha256 !== expected) throw new Error('Edge source proof checksum mismatch')
  return true
}

export function verifyHostedSourceProof(proof, hosted) {
  verifyEdgeSourceProof(proof)
  const managed = hosted?.managedEdgeFunctions?.[proof.functionName]
  const managedDeploymentId = managed?.id && managed?.version
    ? `${proof.projectRef}_${managed.id}_${managed.version}`
    : null
  if (hosted?.environment !== proof.environment || hosted?.projectRef !== proof.projectRef ||
      hosted?.releaseId !== proof.releaseId || managedDeploymentId !== proof.deploymentId ||
      managed?.status !== 'ACTIVE' || managed?.version !== proof.edgeVersion ||
      managed?.ezbr_sha256 !== proof.hostedBundleSha256 || managed?.verify_jwt !== proof.verifyJwt ||
      managed?.import_map !== proof.importMap || managed?.entrypoint_path !== proof.entrypointPath ||
      managed?.import_map_path !== proof.importMapPath) {
    throw new Error('hosted Edge deployment changed after source proof')
  }
  return true
}

function managedPathMatches(actual, expected, identity) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false
  const normalized = actual.replaceAll('\\', '/').replace(/^\.\//u, '')
  const fileName = expected.split('/').at(-1)
  if (new Set([
    fileName,
    `functions/${identity.functionName}/${fileName}`,
    `supabase/functions/${identity.functionName}/${fileName}`,
  ]).has(normalized)) return safeManagedPath(normalized)
  if (localManagedPathMatches(normalized, { ...identity, fileName })) return true
  return providerManagedPathMatches(normalized, { ...identity, fileName })
}

function safeManagedPath(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 240 &&
    !value.includes('..') && /^[A-Za-z0-9_./-]+$/u.test(value)
}

function proofManagedPathMatches(actual, proof, fileName) {
  return managedPathMatches(actual, `supabase/functions/${proof.functionName}/${fileName}`, {
    projectRef: proof.projectRef,
    functionId: deploymentFunctionId(proof.deploymentId),
    edgeVersion: proof.edgeVersion,
    functionName: proof.functionName,
  })
}

function providerManagedPathMatches(value, identity) {
  if (value.length > 500 || value.includes('..')) return false
  const match = value.match(
    /^file:\/\/\/tmp\/user_fn_([a-z0-9]{20})_([0-9a-f-]{36})_([1-9][0-9]*)\/source\/(supabase\/functions\/[a-z][a-z0-9-]{1,62}\/[A-Za-z0-9._-]+)$/iu,
  )
  if (!match) return false
  const sourceVersion = Number(match[3])
  return match[1] === identity.projectRef && match[2] === identity.functionId &&
    Number.isSafeInteger(sourceVersion) && sourceVersion <= identity.edgeVersion &&
    match[4] === `supabase/functions/${identity.functionName}/${identity.fileName}`
}

function localManagedPathMatches(value, identity) {
  try {
    const decodedValue = decodeURIComponent(value).replaceAll('\\', '/')
    if (decodedValue.split('/').includes('..')) return false
    const parsed = new URL(value)
    if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash) return false
    const pathname = decodeURIComponent(parsed.pathname).replaceAll('\\', '/')
    if (pathname.startsWith(`/tmp/user_fn_${identity.projectRef}_`)) return false
    return pathname.endsWith(`/supabase/functions/${identity.functionName}/${identity.fileName}`)
  } catch {
    return false
  }
}

function deploymentFunctionId(value) {
  if (typeof value !== 'string') return ''
  const match = value.match(/^[a-z0-9]{20}_([0-9a-f-]{36})_[1-9][0-9]*$/iu)
  return match?.[1] ?? ''
}

function projectRefFor(environment) {
  return environment === 'production'
    ? 'iwevizmsedyqozxlawwl'
    : environment === 'staging'
      ? 'xyylanuyflrjzbjzhqfl'
      : null
}

function parseArgs(args) {
  const options = { digestOnly: false, verifyHosted: false, functionName: 'mobile-api' }
  const values = new Map([
    ['--release', 'release'],
    ['--hosted', 'hosted'],
    ['--source-root', 'sourceRoot'],
    ['--function', 'functionName'],
    ['--output', 'output'],
    ['--proof', 'proof'],
  ])
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--digest-only') {
      options.digestOnly = true
      continue
    }
    if (args[index] === '--verify-hosted') {
      options.verifyHosted = true
      continue
    }
    const field = values.get(args[index])
    if (!field) throw new Error(`unknown Edge source proof argument: ${args[index]}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${args[index - 1]} requires a value`)
    options[field] = value
  }
  if (options.verifyHosted) {
    if (!options.proof || !options.hosted) throw new Error('--verify-hosted requires --proof and --hosted')
    return options
  }
  if (!options.sourceRoot) throw new Error('--source-root is required')
  if (!options.digestOnly && (!options.release || !options.hosted || !options.output)) {
    throw new Error('candidate source proof requires --release, --hosted, and --output')
  }
  return options
}

function insideRoot(path) {
  return resolveReleaseArtifactPath(ROOT, path)
}

function canonicalJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(canonicalValue))
  return JSON.stringify(canonicalValue(value))
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.verifyHosted) {
    verifyHostedSourceProof(
      JSON.parse(readFileSync(insideRoot(options.proof), 'utf8')),
      JSON.parse(readFileSync(insideRoot(options.hosted), 'utf8')),
    )
    console.log('hosted Edge deployment still matches source proof')
    return
  }
  const sourceRoot = insideRoot(options.sourceRoot)
  if (options.digestOnly) {
    process.stdout.write(`${edgeSourceClosure({ sourceRoot, functionName: options.functionName }).digest}\n`)
    return
  }
  const proof = buildEdgeSourceProof({
    release: JSON.parse(readFileSync(insideRoot(options.release), 'utf8')),
    hosted: JSON.parse(readFileSync(insideRoot(options.hosted), 'utf8')),
    sourceRoot,
    functionName: options.functionName,
  })
  const output = insideRoot(options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(proof, null, 2)}\n`)
  console.log(`Edge source proof passed: ${relative(ROOT, output)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
