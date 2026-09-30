#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PLAN55_SERVICE_ORDER,
  buildPlan55CanaryPlan,
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
    else if (token === '--checkpoint-status') args.checkpointStatus = true
    else if (token === '--service') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('plan55_canary_service_missing')
      args.service = value
      index += 1
    } else {
      throw new Error('plan55_canary_unknown_argument')
    }
  }
  if ([args.plan, args.preflight, args.run, args.checkpointStatus].filter(Boolean).length > 1) {
    throw new Error('plan55_canary_choose_one_mode')
  }
  if (args.service && !PLAN55_SERVICE_ORDER.includes(args.service)) {
    throw new Error('plan55_canary_unsupported_service')
  }
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

  process.stdout.write(`${JSON.stringify({
    schema: 'plan55-production-checkpoint-status/v1',
    scope: 'currently_served_production_release_only',
    canary_started: false,
    eligibility: 'not_evaluated',
    deployment: {
      project_ref: deployment.project_ref,
      release_id: deployment.release_id,
      source_sha: deployment.git_sha,
    },
    services: statuses.map((status) => ({
      service: status.service,
      verified_slice_count: status.verifiedSliceIds.length,
      verified_slice_ids: status.verifiedSliceIds,
      missing_slice_count: status.missingSliceIds.length,
      missing_slice_ids: status.missingSliceIds,
      cleanup_verified: status.cleanupVerified,
      complete: status.complete,
    })),
  }, null, 2)}\n`)
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

function printHelp() {
  process.stdout.write([
    'Plan 55 Production-only canary evaluator',
    '',
    '  node apps/api/scripts/kael-playbook-production-canary.mjs --plan [--service <service>]',
    '  node apps/api/scripts/kael-playbook-production-canary.mjs --preflight',
    '  node apps/api/scripts/kael-playbook-production-canary.mjs --checkpoint-status [--service <service>]',
    '  PLAN55_PRODUCTION_CANARY_OPT_IN=RUN_ONE_SYNTHETIC_ACTOR_SERVICE node apps/api/scripts/kael-playbook-production-canary.mjs --run [--service <service>]',
    '',
    'Plan mode is local-only. Preflight attests source; checkpoint status reads Production health and local receipts.',
    'Run mode is Production-mutating, one synthetic actor and one service at a time; it requires the exact opt-in, exact source, and all preceding service receipts.',
    'No account, flag, database, service, release, or Docker mutation is performed by either mode.',
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
