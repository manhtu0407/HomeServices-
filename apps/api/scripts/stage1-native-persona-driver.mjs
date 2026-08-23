#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertReleaseTarget } from '../../../scripts/harness/release-safety.mjs'
import { checkHarnessRelease, resolveReleaseArtifactPath } from '../../../scripts/harness/release-bundle.mjs'
import { assertScenarioReady, pollUntil } from './lib/stage1-synthetic-smoke-core.mjs'
import { Stage1SyntheticReleaseSmoke } from './stage1-synthetic-release-smoke.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SCRATCH = resolve(ROOT, '.scratch')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const config = loadConfig(options)
  const output = resolveScratchPath(options.state)
  const smoke = new Stage1SyntheticReleaseSmoke(config)

  if (options.phase === 'prepare') {
    const state = await prepareNativeScenario(smoke, config, options.mode)
    await writeState(output, state)
    printResult(output, state)
    return
  }

  const state = loadState(output, config)
  if (options.phase === 'inspect') {
    const inspection = await inspectNativeScenario(smoke, state)
    const next = { ...state, lastInspection: inspection }
    await writeState(output, next)
    printResult(output, next)
    return
  }

  const proof = await smoke.cleanupCohort(config.cohortId)
  const next = { ...state, cleanup: { completedAt: new Date().toISOString(), proof }, status: 'cleaned' }
  await writeState(output, next)
  printResult(output, next)
}

async function prepareNativeScenario(smoke, config, mode) {
  const actors = await smoke.signInActors()
  smoke.actorIds = { customerId: actors.customer.id, workerId: actors.worker.id }
  const boundAt = new Date()
  await smoke.preparePermanentCohort()
  const heartbeat = await pollUntil(
    () => loadNativeHeartbeat(smoke, actors.worker.id),
    (value) => Date.parse(value?.matching_foreground_active_until ?? '') > Date.now() &&
      Date.parse(value?.updated_at ?? '') >= boundAt.getTime(),
    { attempts: 25, intervalMs: 2_000 },
  )
  const worker = await smoke.loadEligibleWorker(actors.worker.id)
  const policies = await smoke.selectScenarioPolicies(worker.serviceTypes, worker.capabilities)
  const policy = mode === 'auto' ? policies.autoQuote : policies.unpriced
  const ready = await smoke.createReadySession(actors.customer, policy, worker.district)
  const contract = assertScenarioReady(ready.response, policy.quote_mode)
  const sessionId = ready.response.session.id
  const confirmation = await smoke.api(actors.customer, 'POST', `/kael/chat/${sessionId}/confirm`, {
    confirmation_kind: contract.confirmationKind,
    ...(contract.priceReasoningReceiptId
      ? { price_reasoning_receipt_id: contract.priceReasoningReceiptId }
      : {}),
  }, {
    expectedStatus: 202,
    idempotencyKey: `stage1-native-confirm-${sessionId}`,
  })
  const operation = await pollUntil(
    async () => (await smoke.api(actors.customer, 'GET', `/kael/chat/${sessionId}/operation`)).json?.operation,
    (value) => Boolean(value?.job_id) && ['broadcasting', 'candidate_ready'].includes(value?.state),
    { attempts: 60, intervalMs: 500 },
  )
  if (operation.value.job_id !== confirmation.json?.job_id) {
    throw new Error('native scenario confirmation and recovery job receipts differ')
  }
  return {
    schemaVersion: 'stage1-native-persona-state.v1',
    status: 'awaiting_native_worker',
    environment: config.environment,
    projectRef: config.projectRef,
    releaseId: config.release.releaseId,
    cohortId: config.cohortId,
    createdAt: new Date().toISOString(),
    nativeHeartbeatObservedAt: heartbeat.value.updated_at,
    nativeHeartbeatActiveUntil: heartbeat.value.matching_foreground_active_until,
    quoteMode: policy.quote_mode,
    policyVersion: contract.coverage.policy_version,
    sessionId,
    jobId: operation.value.job_id,
    operationId: operation.value.operation_id,
    workerId: actors.worker.id,
  }
}

async function loadNativeHeartbeat(smoke, workerId) {
  const { data, error } = await smoke.admin.from('worker_profiles')
    .select('matching_foreground_active_until,updated_at')
    .eq('id', workerId)
    .maybeSingle()
  if (error || !data) throw new Error('native Worker heartbeat could not be read')
  return data
}

async function inspectNativeScenario(smoke, state) {
  const [operation, matching, job, broadcasts, candidates, heartbeat] = await Promise.all([
    one(smoke.admin.from('confirmation_operations')
      .select('id,state,job_id,updated_at')
      .eq('id', state.operationId)),
    one(smoke.admin.from('matching_operations')
      .select('id,state,job_id,updated_at')
      .eq('job_id', state.jobId)),
    one(smoke.admin.from('jobs')
      .select('id,status,worker_id,quote_mode,updated_at')
      .eq('id', state.jobId)),
    many(smoke.admin.from('job_broadcasts')
      .select('id,status,worker_id,expires_at,responded_at')
      .eq('job_id', state.jobId)),
    many(smoke.admin.from('job_worker_candidates')
      .select('id,status,worker_id,created_at,updated_at')
      .eq('job_id', state.jobId)),
    loadNativeHeartbeat(smoke, state.workerId),
  ])
  const broadcastIds = broadcasts.map((row) => row.id)
  const deliveries = broadcastIds.length === 0
    ? []
    : await many(smoke.admin.from('matching_recipient_deliveries')
      .select('id,broadcast_id,status,delivered_at,seen_at,accepted_at,expires_at')
      .in('broadcast_id', broadcastIds))
  return {
    inspectedAt: new Date().toISOString(),
    operation,
    matching,
    job,
    broadcasts,
    deliveries,
    candidates,
    heartbeat,
  }
}

async function one(query) {
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data
}

async function many(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function loadConfig(options) {
  const release = JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.release), 'utf8'))
  const releaseProblems = checkHarnessRelease(release)
  if (releaseProblems.length > 0) throw new Error(`release artifact is invalid: ${releaseProblems.join('; ')}`)
  if (release.environment !== 'staging') throw new Error('native persona driver is restricted to Staging')
  const target = assertReleaseTarget({
    environment: release.environment,
    projectRef: requireEnv('STAGE1_SUPABASE_PROJECT_REF'),
    projectUrl: requireEnv('STAGE1_SUPABASE_URL'),
  })
  const runId = requireEnv('STAGE1_RUN_ID')
  if (process.env.STAGE1_SMOKE_MUTATION_APPROVAL?.trim() !== `stage1-synthetic:${runId}`) {
    throw new Error('explicit Stage 1 synthetic mutation approval is missing')
  }
  if (!UUID.test(options.iosEasBuildId)) throw new Error('driver iOS compatibility build ID is invalid')
  if (!options.cohort.startsWith(`synthetic-stage1-${release.releaseId.slice(8, 20)}-${release.releaseId.slice(21)}-`)) {
    throw new Error('synthetic cohort is not bound to the selected release')
  }
  return {
    environment: release.environment,
    projectRef: target.projectRef,
    projectUrl: target.projectUrl,
    apiBaseUrl: `${target.projectUrl}/functions/v1/mobile-api`,
    anonKey: requireEnv('STAGE1_SUPABASE_ANON_KEY'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    customer: dedicatedCredentials('STAGE1_SYNTHETIC_CUSTOMER'),
    worker: dedicatedCredentials('STAGE1_SYNTHETIC_WORKER'),
    release,
    cohortId: options.cohort,
    runId,
    sequence: 1,
    mobileAttestation: { contractEpoch: 2 },
    clientBinary: {
      applicationId: 'com.phanmanhtu.homeservices',
      buildNumber: options.iosBuildNumber,
      easBuildId: options.iosEasBuildId,
      runtimeVersion: options.iosRuntimeVersion,
    },
  }
}

function parseArgs(args) {
  const result = {}
  const fields = new Map([
    ['--phase', 'phase'],
    ['--mode', 'mode'],
    ['--release', 'release'],
    ['--cohort', 'cohort'],
    ['--state', 'state'],
    ['--ios-eas-build-id', 'iosEasBuildId'],
    ['--ios-build-number', 'iosBuildNumber'],
    ['--ios-runtime-version', 'iosRuntimeVersion'],
  ])
  for (let index = 0; index < args.length; index += 1) {
    const field = fields.get(args[index])
    if (!field) throw new Error(`unknown argument: ${args[index]}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${args[index - 1]} requires a value`)
    result[field] = value
  }
  result.mode ??= 'auto'
  result.release ??= 'artifacts/harness/release-manifest.json'
  result.iosBuildNumber = Number(result.iosBuildNumber)
  if (!['prepare', 'inspect', 'cleanup'].includes(result.phase)) throw new Error('phase must be prepare, inspect, or cleanup')
  if (!['auto', 'unpriced'].includes(result.mode)) throw new Error('mode must be auto or unpriced')
  for (const required of ['cohort', 'state', 'iosEasBuildId', 'iosRuntimeVersion']) {
    if (!result[required]) throw new Error(`missing required option: ${required}`)
  }
  if (!Number.isSafeInteger(result.iosBuildNumber) || result.iosBuildNumber < 1) {
    throw new Error('iOS build number is invalid')
  }
  return result
}

function dedicatedCredentials(prefix) {
  const email = requireEnv(`${prefix}_EMAIL`).toLowerCase()
  const password = requireEnv(`${prefix}_PASSWORD`)
  if (!email.endsWith('@example.test') || password.length < 12) {
    throw new Error(`${prefix} must be a dedicated @example.test identity with a strong password`)
  }
  return { email, password }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing required environment variable ${name}`)
  return value
}

function resolveScratchPath(value) {
  const path = resolve(ROOT, value)
  if (path !== SCRATCH && !path.startsWith(`${SCRATCH}\\`) && !path.startsWith(`${SCRATCH}/`)) {
    throw new Error('native persona state must stay under .scratch')
  }
  return path
}

function loadState(path, config) {
  const state = JSON.parse(readFileSync(path, 'utf8'))
  if (state.schemaVersion !== 'stage1-native-persona-state.v1' ||
      state.environment !== config.environment || state.projectRef !== config.projectRef ||
      state.releaseId !== config.release.releaseId || state.cohortId !== config.cohortId) {
    throw new Error('native persona state does not match the exact Staging release target')
  }
  return state
}

async function writeState(path, state) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { flag: 'w' })
}

function printResult(path, state) {
  process.stdout.write(`${JSON.stringify({
    state: relative(ROOT, path).replaceAll('\\', '/'),
    status: state.status,
    quoteMode: state.quoteMode,
    jobId: state.jobId,
    operationId: state.operationId,
    lastInspection: state.lastInspection ?? null,
    cleanup: state.cleanup ?? null,
  }, null, 2)}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
