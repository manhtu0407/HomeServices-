#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PLAN55_SERVICE_ORDER,
  buildPlan55CanaryPlan,
  buildPlan55CheckpointStatus,
  runPlan55ServiceSequence,
} from './lib/plan55-production-canary-core.mjs'
import { createPlan55FileCheckpointStore } from './lib/plan55-production-canary-checkpoint-store.mjs'
import { createPlan55ProductionCanaryOperations } from './lib/plan55-production-canary-operations.mjs'
import {
  PRODUCTION_MOBILE_API_URL,
  sanitizeProductionAttestationFailureReason,
  validateProductionHealthPayload,
} from './lib/kael-playbook-production-attestation.mjs'

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')

function main(argv) {
  const args = parseArguments(argv)
  if (args.help) return printHelp()
  if (args.plan) return printPlan(args.service ? [args.service] : PLAN55_SERVICE_ORDER)
  if (args.preflight) return runReadOnlyPreflight()
  if (args.run) return runProductionCanary(args.service ? [args.service] : PLAN55_SERVICE_ORDER)
  if (args.cleanupOnly) return runCleanupOnly(args.service, args.actorId)
  if (args.recoverInterrupted) return runRecoverInterrupted(args.service)
  if (args.checkpointStatus) {
    return runReadOnlyCheckpointStatus(args.service ? [args.service] : PLAN55_SERVICE_ORDER)
  }
  throw new Error('plan55_canary_requires_supported_mode')
}

function parseArguments(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') args.help = true
    else if (token === '--plan') args.plan = true
    else if (token === '--preflight') args.preflight = true
    else if (token === '--run') args.run = true
    else if (token === '--cleanup-only') args.cleanupOnly = true
    else if (token === '--recover-interrupted') args.recoverInterrupted = true
    else if (token === '--checkpoint-status') args.checkpointStatus = true
    else if (token === '--service') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('plan55_canary_service_missing')
      args.service = value
      index += 1
    } else if (token === '--actor-id') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('plan55_canary_actor_id_missing')
      args.actorId = value
      index += 1
    } else {
      throw new Error('plan55_canary_unknown_argument')
    }
  }
  if ([args.plan, args.preflight, args.run, args.cleanupOnly, args.recoverInterrupted, args.checkpointStatus].filter(Boolean).length > 1) {
    throw new Error('plan55_canary_choose_one_mode')
  }
  if (args.service && !PLAN55_SERVICE_ORDER.includes(args.service)) {
    throw new Error('plan55_canary_unsupported_service')
  }
  if (args.cleanupOnly && (!args.service || !args.actorId)) {
    throw new Error('plan55_canary_cleanup_identity_required')
  }
  if (args.recoverInterrupted && !args.service) {
    throw new Error('plan55_canary_recovery_service_required')
  }
  if (!args.cleanupOnly && args.actorId) throw new Error('plan55_canary_actor_id_requires_cleanup_mode')
  return args
}

function printPlan(services) {
  const plan = buildPlan55CanaryPlan(services)
  process.stdout.write(`${JSON.stringify({
    schema: 'plan55-production-canary-plan/v1',
    project_ref: 'iwevizmsedyqozxlawwl',
    execution: 'not_started',
    services: plan.map(({ service, slices }) => ({
      service,
      slices: slices.map(({ id, arm, dataset, repetition, offset, limit, corpusPath, playbookPath }) => ({
        id,
        arm,
        dataset,
        repetition,
        offset,
        limit,
        corpus_path: corpusPath,
        playbook_path: playbookPath,
      })),
    })),
  }, null, 2)}\n`)
}

function runReadOnlyPreflight() {
  const attestor = resolve(REPO_ROOT, 'apps/api/scripts/kael-playbook-production-attest.mjs')
  const result = spawnSync(process.execPath, [attestor], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error) throw new Error('plan55_canary_attestation_process_failed')
  if (result.status !== 0) {
    const safeReason = sanitizeProductionAttestationFailureReason(result.stderr)
    process.stderr.write(`plan55_canary_preflight_blocked:${safeReason}\n`)
    process.exitCode = 1
    return
  }
  const attestation = JSON.parse(result.stdout)
  process.stdout.write(`${JSON.stringify({
    schema: 'plan55-production-canary-preflight/v1',
    status: 'SOURCE_ATTESTATION_PASS_REMAINING_GATES_UNVERIFIED',
    project_ref: attestation.deployment.project_ref,
    release_id: attestation.deployment.release_id,
    source_sha: attestation.deployment.git_sha,
    service_count: Object.keys(attestation.services).length,
    runtime_file_count: attestation.runtime_files.length,
    evaluator_file_count: attestation.evaluator.files.length,
    mutations: 0,
  }, null, 2)}\n`)
}

async function runReadOnlyCheckpointStatus(services) {
  const response = await fetch(`${PRODUCTION_MOBILE_API_URL}/harness/health`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  }).catch(() => {
    throw new Error('plan55_checkpoint_health_read_failed')
  })
  if (!response.ok) throw new Error('plan55_checkpoint_health_read_failed')

  const health = await response.json().catch(() => {
    throw new Error('plan55_checkpoint_health_read_failed')
  })
  const deployment = validateProductionHealthPayload(health)
  const store = createPlan55FileCheckpointStore({
    rootDir: resolve(REPO_ROOT, '.scratch/plan55-production-canary'),
  })
  const statuses = []
  for (const service of services) {
    statuses.push(await store.readVerifiedServiceStatus({ service, deployment }))
  }

  process.stdout.write(`${JSON.stringify(buildPlan55CheckpointStatus({ deployment, statuses }), null, 2)}\n`)
}

async function runProductionCanary(services) {
  const operations = await createPlan55ProductionCanaryOperations()
  const result = await runPlan55ServiceSequence({ services, operations })
  const allServicesPassed = result.services.every(({ status }) => status === 'G5_PASSED')
  const fullSequence = services.length === PLAN55_SERVICE_ORDER.length
  process.stdout.write(`${JSON.stringify({
    schema: result.schema,
    scope: fullSequence ? 'production_synthetic_actor_sequence' : 'production_synthetic_actor_service',
    project_ref: result.projectRef,
    status: allServicesPassed
      ? fullSequence
        ? 'SIX_SERVICE_CANARY_PASS_PENDING_REMAINING_GATES'
        : 'SERVICE_CANARY_PASS_PENDING_REMAINING_SERVICES'
      : 'SERVICE_LOCAL_G5_FAILURE_REMAINS_OFF',
    services: result.services.map((service) => ({
      service: service.service,
      status: service.status,
      slice_count: service.slices.length,
      case_count: service.slices.reduce((sum, slice) => sum + slice.caseCount, 0),
      error_count: service.slices.reduce((sum, slice) => sum + slice.errorCount, 0),
      g5_deltas: service.g5,
      cleanup: service.cleanup,
      release_id: service.releaseId,
      source_sha: service.sourceSha,
    })),
  }, null, 2)}\n`)
}

async function runCleanupOnly(service, actorId) {
  const operations = await createPlan55ProductionCanaryOperations()
  const cleanup = await operations.cleanupAbandonedService({ service, actorId })
  process.stdout.write(`${JSON.stringify({
    schema: 'plan55-service-cleanup/v1',
    status: 'CLEANUP_PASS',
    project_ref: 'iwevizmsedyqozxlawwl',
    service,
    cleanup,
  }, null, 2)}\n`)
}

async function runRecoverInterrupted(service) {
  const recoveryInput = readRecoveryInput()
  const runId = process.env.GITHUB_RUN_ID
  const currentAttempt = Number(process.env.GITHUB_RUN_ATTEMPT)
  const sourceSha = String(process.env.PLAN55_SOURCE_SHA ?? '').toLowerCase()
  if (!PLAN55_SERVICE_ORDER.includes(service) || !/^\d+$/u.test(runId ?? '') ||
      !Number.isSafeInteger(currentAttempt) || currentAttempt < 2 ||
      !/^[a-f0-9]{40}$/u.test(sourceSha) || recoveryInput.service !== service ||
      recoveryInput.markers.length === 0) {
    throw new Error('plan55_canary_recovery_identity_invalid')
  }

  const release = JSON.parse(readFileSync(resolve(REPO_ROOT, 'artifacts/release/release.json'), 'utf8'))
  if (release.releaseLane !== 'plan55-production-only' || release.gitSha?.toLowerCase() !== sourceSha ||
      !new RegExp(`^harness-${sourceSha.slice(0, 12)}-[a-f0-9]{12}$`, 'iu').test(release.releaseId ?? '')) {
    throw new Error('plan55_canary_recovery_release_invalid')
  }
  const checkoutSha = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT, encoding: 'utf8', timeout: 15000, maxBuffer: 4096,
  })
  if (checkoutSha.error || checkoutSha.status !== 0 || checkoutSha.stdout.trim().toLowerCase() !== sourceSha) {
    throw new Error('plan55_canary_recovery_source_invalid')
  }

  const operations = await createPlan55ProductionCanaryOperations()
  const recovery = await operations.recoverInterruptedServiceCheckpoint({
    service,
    deployment: { project_ref: 'iwevizmsedyqozxlawwl', release_id: release.releaseId, git_sha: sourceSha },
    runId,
    currentAttempt,
    markers: recoveryInput.markers,
  })
  const safeRecord = {
    ...recovery,
    cleaned_actor_sha256: recoveryInput.markers.map((marker) =>
      createHash('sha256').update(marker.actor_id.toLowerCase()).digest('hex')),
    interrupted_attempts: recoveryInput.markers.map(({ attempt }) => attempt),
  }
  const outputPath = resolve(REPO_ROOT, '.scratch/plan55-production-canary/attempts',
    sourceSha, service, `recovered-${runId}-by-${currentAttempt}.json`)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(safeRecord, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  process.stdout.write(`${JSON.stringify(safeRecord)}\n`)
}

function readRecoveryInput() {
  let input
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    throw new Error('plan55_canary_recovery_input_invalid')
  }
  if (!input || input.schema !== 'plan55-interrupted-service-recovery-input/v1' ||
      !PLAN55_SERVICE_ORDER.includes(input.service) || !Array.isArray(input.markers) ||
      input.markers.length < 1 || input.markers.length > 1000) {
    throw new Error('plan55_canary_recovery_input_invalid')
  }
  return input
}

function printHelp() {
  process.stdout.write([
    'Plan 55 Production-only canary evaluator',
    '',
    '  node apps/api/scripts/kael-playbook-production-canary.mjs --plan [--service <service>]',
    '  node apps/api/scripts/kael-playbook-production-canary.mjs --preflight',
    '  node apps/api/scripts/kael-playbook-production-canary.mjs --checkpoint-status [--service <service>]',
    '  PLAN55_PRODUCTION_CANARY_OPT_IN=RUN_ONE_SYNTHETIC_ACTOR_SERVICE node apps/api/scripts/kael-playbook-production-canary.mjs --run [--service <service>]',
    '  PLAN55_PRODUCTION_CANARY_OPT_IN=RUN_ONE_SYNTHETIC_ACTOR_SERVICE node apps/api/scripts/kael-playbook-production-canary.mjs --cleanup-only --service <service> --actor-id <uuid>',
    '  PLAN55_PRODUCTION_CANARY_OPT_IN=RUN_ONE_SYNTHETIC_ACTOR_SERVICE node apps/api/scripts/kael-playbook-production-canary.mjs --recover-interrupted --service <service> < recovery-input.json',
    '',
    'Plan mode is local-only. Preflight attests source; checkpoint status reads Production health and local receipts.',
    'Run mode is Production-mutating, one synthetic actor and one service at a time; it requires the exact opt-in, exact source, and all preceding service receipts.',
    'Cleanup-only mode removes only the exact marked disposable Auth actor and that service-scoped flag, then proves cleanup; it never evaluates traffic.',
    'Interrupted recovery cleans only actors from validated start markers and revalidates persisted slice artifacts before retaining receipts.',
    'Plan, preflight, and checkpoint-status modes do not mutate account, flag, database, service, release, or Docker state.',
    '',
  ].join('\n'))
}

try {
  const result = main(process.argv.slice(2))
  if (result && typeof result.then === 'function') await result
} catch (error) {
  const code = error instanceof Error ? error.message : 'plan55_canary_failed'
  process.stderr.write(`${/^[a-z0-9_:-]{1,200}$/i.test(code) ? code : 'plan55_canary_failed'}\n`)
  process.exitCode = 1
}
