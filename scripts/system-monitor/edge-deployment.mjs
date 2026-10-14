import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { edgeSourceClosures } from '../harness/release-bundle.mjs'

const PROJECT_REF = 'iwevizmsedyqozxlawwl'
const EDGE_FUNCTION = 'system-monitor'
const SAFE_STATUS = new Set(['ACTIVE', 'active'])

export async function captureSystemMonitorEdgeState(input) {
  const projectRef = input?.projectRef?.trim() ?? ''
  const accessToken = input?.accessToken?.trim() ?? ''
  const fetcher = input?.fetcher ?? fetch
  if (projectRef !== PROJECT_REF || accessToken.length < 20) {
    throw new Error('SYSTEM_MONITOR_EDGE_CONFIGURATION_INVALID')
  }

  let listResponse
  try {
    listResponse = await fetcher(`https://api.supabase.com/v1/projects/${projectRef}/functions`, {
      headers: { authorization: `Bearer ${accessToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw new Error('SYSTEM_MONITOR_EDGE_LIST_UNAVAILABLE')
  }
  if (!listResponse.ok) throw new Error(`SYSTEM_MONITOR_EDGE_LIST_FAILED_${listResponse.status}`)

  let rows
  try {
    const payload = await listResponse.json()
    rows = Array.isArray(payload) ? payload : payload?.data ?? payload?.result
  } catch {
    throw new Error('SYSTEM_MONITOR_EDGE_LIST_INVALID')
  }
  if (!Array.isArray(rows)) throw new Error('SYSTEM_MONITOR_EDGE_LIST_INVALID')
  const listed = rows.find((item) => item?.slug === EDGE_FUNCTION || item?.name === EDGE_FUNCTION)
  if (!listed) return Object.freeze({ exists: false })

  let detailResponse
  try {
    detailResponse = await fetcher(`https://api.supabase.com/v1/projects/${projectRef}/functions/${EDGE_FUNCTION}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw new Error('SYSTEM_MONITOR_EDGE_DETAIL_UNAVAILABLE')
  }
  if (!detailResponse.ok) throw new Error(`SYSTEM_MONITOR_EDGE_DETAIL_FAILED_${detailResponse.status}`)

  let detail
  try {
    detail = await detailResponse.json()
  } catch {
    throw new Error('SYSTEM_MONITOR_EDGE_DETAIL_INVALID')
  }
  const version = Number(detail?.version ?? listed?.version)
  const id = detail?.id ?? listed?.id
  const status = detail?.status ?? listed?.status
  const verifyJwt = detail?.verify_jwt ?? detail?.verifyJwt ?? listed?.verify_jwt
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id ?? '') ||
      !Number.isSafeInteger(version) || version < 1 || typeof status !== 'string' || typeof verifyJwt !== 'boolean') {
    throw new Error('SYSTEM_MONITOR_EDGE_DETAIL_INVALID')
  }
  return Object.freeze({ exists: true, id, version, status, verifyJwt })
}

export function verifySystemMonitorPreviousState(input) {
  const release = input?.release
  const edgeState = input?.edgeState
  const workerState = input?.workerState
  if (!edgeState?.exists && !workerState?.exists) {
    return Object.freeze({ status: 'no_previous_monitor', edgeExists: false, workerExists: false })
  }
  if (release === null) {
    throw new Error('SYSTEM_MONITOR_UNREGISTERED_RUNTIME_FOUND')
  }
  const observer = release?.systemHealthObserver
  if (!observer) {
    throw new Error('SYSTEM_MONITOR_UNREGISTERED_RUNTIME_FOUND')
  }
  if (!edgeState?.exists || !workerState?.exists || workerState.releaseTag !== release.releaseId ||
      !SAFE_STATUS.has(edgeState.status) || edgeState.verifyJwt !== false) {
    throw new Error('SYSTEM_MONITOR_PREVIOUS_RUNTIME_IDENTITY_MISMATCH')
  }
  const source = verifySource(input.sourceRoot, observer.edgeFunction)
  return Object.freeze({
    status: 'previous_monitor_verified',
    releaseId: release.releaseId,
    edgeFunctionId: edgeState.id,
    edgeVersion: edgeState.version,
    workerVersionId: workerState.versionId,
    workerReleaseTag: workerState.releaseTag,
    sourceSha256: source.sha256,
    sourceInputs: source.inputs,
  })
}

export function verifySystemMonitorCandidate(input) {
  const release = input?.release
  const expected = release?.systemHealthObserver
  const before = input?.beforeState
  const after = input?.afterState
  if (!expected || expected.profileId !== 'cloudflare-admin-v1' || !after?.exists ||
      !SAFE_STATUS.has(after.status) || after.verifyJwt !== false ||
      after.version <= (before?.exists ? before.version : 0)) {
    throw new Error('SYSTEM_MONITOR_CANDIDATE_IDENTITY_MISMATCH')
  }
  const source = verifySource(input.sourceRoot, expected.edgeFunction)
  return Object.freeze({
    status: 'verified',
    releaseId: release.releaseId,
    gitSha: release.gitSha,
    profileId: expected.profileId,
    edgeFunction: EDGE_FUNCTION,
    edgeFunctionId: after.id,
    edgeVersion: after.version,
    sourceSha256: source.sha256,
    sourceInputs: source.inputs,
    runtimeConfigurationSha256: expected.edgeFunction.runtimeConfiguration.sha256,
  })
}

function verifySource(sourceRoot, expected) {
  if (!expected || !/^[0-9a-f]{64}$/u.test(expected.sha256 ?? '') ||
      !Array.isArray(expected.inputs) || expected.inputs.length === 0) {
    throw new Error('SYSTEM_MONITOR_EDGE_RELEASE_IDENTITY_INVALID')
  }
  let source
  try {
    source = edgeSourceClosures(sourceRoot, [EDGE_FUNCTION])
  } catch {
    throw new Error('SYSTEM_MONITOR_EDGE_SOURCE_UNAVAILABLE')
  }
  const sha256 = source.digests[EDGE_FUNCTION]
  const inputs = source.inputs[EDGE_FUNCTION]
  if (sha256 !== expected.sha256 || JSON.stringify(inputs) !== JSON.stringify(expected.inputs)) {
    throw new Error('SYSTEM_MONITOR_EDGE_SOURCE_MISMATCH')
  }
  return { sha256, inputs }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
}

async function main(args) {
  const mode = args[0]
  const options = new Map()
  for (let index = 1; index < args.length; index += 1) {
    const key = args[index]
    const value = args[++index]
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('SYSTEM_MONITOR_EDGE_ARGUMENTS_INVALID')
    options.set(key, value)
  }
  const output = options.get('--output')
  if (!output) throw new Error('SYSTEM_MONITOR_EDGE_ARGUMENTS_INVALID')
  if (mode === 'capture') {
    writeJson(output, await captureSystemMonitorEdgeState({
      projectRef: options.get('--project-ref') ?? process.env.PRODUCTION_PROJECT_REF,
      accessToken: process.env.SUPABASE_ACCESS_TOKEN,
    }))
    process.stdout.write('system-monitor Edge deployment state captured\n')
    return
  }

  if (mode === 'previous') {
    const evidence = verifySystemMonitorPreviousState({
      release: readJson(options.get('--release')),
      edgeState: readJson(options.get('--edge-state')),
      workerState: readJson(options.get('--worker-state')),
      ...(options.has('--source-root') ? { sourceRoot: options.get('--source-root') } : {}),
    })
    writeJson(output, evidence)
    process.stdout.write(`${evidence.status} system-monitor baseline verified\n`)
    return
  }

  if (mode === 'candidate') {
    const evidence = verifySystemMonitorCandidate({
      release: readJson(options.get('--release')),
      beforeState: readJson(options.get('--before')),
      afterState: readJson(options.get('--after')),
      sourceRoot: options.get('--source-root'),
    })
    writeJson(output, evidence)
    process.stdout.write('system-monitor Edge source and deployment identity verified\n')
    return
  }
  throw new Error('SYSTEM_MONITOR_EDGE_MODE_INVALID')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'SYSTEM_MONITOR_EDGE_VERIFICATION_FAILED'}\n`)
    process.exitCode = 1
  })
}
