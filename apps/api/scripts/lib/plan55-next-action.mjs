import { PLAN55_SERVICE_ORDER } from './plan55-production-canary-core.mjs'

export const PLAN55_NEXT_ACTIONS = Object.freeze([
  'REPAIR_LOCAL',
  'PREPARE_SOURCE',
  'DEPLOY_OFF',
  'RECOVER_CLEANUP',
  'RUN_SERVICE',
  'COLLECT_PILOT',
  'RUN_WAVE',
  'PROMOTE',
  'VERIFY_ACTIVE',
  'WAIT_EXTERNAL',
  'DONE',
])

const EVIDENCE_STATES = new Set(['PASS', 'FAIL', 'UNKNOWN'])
const SERVICE_STATES = new Set(['NOT_RUN', 'PASS', 'G5_FAILED', 'BLOCKED'])

export function parsePlan55ExecutionCheckpoint(markdown) {
  const start = '<!-- PLAN55_EXECUTION_CHECKPOINT_START -->'
  const end = '<!-- PLAN55_EXECUTION_CHECKPOINT_END -->'
  if (typeof markdown !== 'string') throw new Error('plan55_execution_checkpoint_missing')
  const startIndex = markdown.indexOf(start)
  const endIndex = markdown.indexOf(end)
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error('plan55_execution_checkpoint_missing')
  }
  try {
    const jsonStart = startIndex + start.length
    return JSON.parse(markdown.slice(jsonStart, endIndex).trim())
  } catch {
    throw new Error('plan55_execution_checkpoint_invalid')
  }
}

export function buildPlan55NextAction(checkpoint, observed = {}) {
  assertCheckpoint(checkpoint)
  const pendingCleanup = checkpoint.services.some((service) =>
    service.status !== 'NOT_RUN' && service.cleanup !== 'PASS')

  if (pendingCleanup || checkpoint.cleanupRequired === true) {
    return decision('RECOVER_CLEANUP', 'cleanup_not_verified', {
      services: checkpoint.services.filter((service) =>
        service.status !== 'NOT_RUN' && service.cleanup !== 'PASS').map(({ service }) => service),
      missingPreconditions: ['exact actor-scoped cleanup proof'],
    })
  }

  if (observed.activeEvaluatorFresh === true) {
    return decision('WAIT_EXTERNAL', 'single_writer_has_fresh_heartbeat', {
      safeParallelWork: checkpoint.safeParallelWork,
      missingPreconditions: ['current evaluator completion or heartbeat expiry'],
    })
  }

  if (observed.productionIdentityMatches === false) {
    return decision('PREPARE_SOURCE', 'production_identity_changed_since_checkpoint', {
      missingPreconditions: ['refresh target, served source, and release identity'],
    })
  }

  if (checkpoint.sourceLock !== 'PASS' || checkpoint.independentHoldout !== 'PASS' ||
      checkpoint.predeployGates !== 'PASS') {
    const missing = []
    if (checkpoint.sourceLock !== 'PASS') missing.push('final merge SHA and frozen evaluator/data fingerprints')
    if (checkpoint.independentHoldout !== 'PASS') missing.push('source-bound independent blind holdout evidence')
    if (checkpoint.predeployGates !== 'PASS') missing.push('all exact-source predeploy gate proofs')
    return decision(checkpoint.repairableLocalBlocker ? 'REPAIR_LOCAL' : 'PREPARE_SOURCE',
      'source_or_predeploy_evidence_incomplete', { missingPreconditions: missing })
  }

  if (checkpoint.guardDeployedOff !== 'PASS') {
    return decision('DEPLOY_OFF', 'guard_not_verified_deployed_off', {
      missingPreconditions: ['exact-source release, actor-scope tests, and rollback proof'],
    })
  }

  const blockedService = checkpoint.services.find(({ status }) => status === 'BLOCKED')
  if (blockedService) {
    return decision('REPAIR_LOCAL', 'service_blocked', {
      service: blockedService.service,
      missingPreconditions: ['service-specific deterministic failure resolved; cleanup PASS'],
    })
  }

  const failedService = checkpoint.services.find(({ status }) => status === 'G5_FAILED')
  for (const item of checkpoint.services) {
    if (item.status === 'NOT_RUN') {
      return decision('RUN_SERVICE', 'next_serial_service', {
        service: item.service,
        missingPreconditions: ['writer lease and immediate exact-source preflight'],
      })
    }
  }

  if (failedService) {
    return decision('REPAIR_LOCAL', 'service_local_g5_failure_kept_off', {
      service: failedService.service,
      missingPreconditions: ['repair G5 regression and rerun only invalidated slices'],
    })
  }

  if (checkpoint.services.some(({ status, cleanup }) => status !== 'PASS' || cleanup !== 'PASS')) {
    return decision('PREPARE_SOURCE', 'six_current_source_receipts_not_verified', {
      missingPreconditions: ['six complete receipts with verified cleanup'],
    })
  }

  if (checkpoint.pilot !== 'PASS') {
    return decision(checkpoint.pilot === 'FAIL' ? 'WAIT_EXTERNAL' : 'COLLECT_PILOT',
      'bounded_opt_in_pilot_not_complete', {
        missingPreconditions: ['eligible opt-in customer/worker cohort and real transaction evidence'],
      })
  }

  if (checkpoint.finalGates !== 'PASS') {
    return decision(checkpoint.finalGates === 'FAIL' ? 'REPAIR_LOCAL' : 'PREPARE_SOURCE',
      'final_gates_incomplete', { missingPreconditions: ['all remaining Plan 55 gate proofs'] })
  }

  const nextWave = checkpoint.waves.findIndex((status) => status !== 'PASS')
  if (nextWave >= 0) {
    return decision('RUN_WAVE', 'next_preregistered_paired_wave', {
      wave: nextWave + 1,
      missingPreconditions: ['wave-specific preflight and source-bound telemetry'],
    })
  }

  if (checkpoint.promotion !== 'PASS') {
    return decision(checkpoint.promotion === 'FAIL' ? 'REPAIR_LOCAL' : 'PROMOTE',
      'promotion_not_verified', { missingPreconditions: ['atomic promotion packet and gate revalidation'] })
  }

  if (checkpoint.productionActive !== 'PASS') {
    return decision('VERIFY_ACTIVE', 'active_runtime_not_yet_verified', {
      missingPreconditions: ['active pointer, six-service runtime, cleanup, and 15-minute health window'],
    })
  }

  return decision('DONE', 'all_plan55_completion_gates_passed')
}

function assertCheckpoint(checkpoint) {
  if (!checkpoint || checkpoint.schema !== 'plan55-execution-checkpoint/v1' ||
      !/^[a-f0-9]{40}$/u.test(checkpoint.production?.sourceSha ?? '') ||
      typeof checkpoint.production?.releaseId !== 'string' ||
      !/^harness-[a-f0-9]{12}-[a-f0-9]{12}$/u.test(checkpoint.production.releaseId) ||
      !['PASS', 'FAIL', 'UNKNOWN'].includes(checkpoint.sourceLock) ||
      !EVIDENCE_STATES.has(checkpoint.independentHoldout) ||
      !EVIDENCE_STATES.has(checkpoint.predeployGates) ||
      !EVIDENCE_STATES.has(checkpoint.guardDeployedOff) ||
      !EVIDENCE_STATES.has(checkpoint.pilot) || !EVIDENCE_STATES.has(checkpoint.finalGates) ||
      !EVIDENCE_STATES.has(checkpoint.promotion) || !EVIDENCE_STATES.has(checkpoint.productionActive) ||
      !Array.isArray(checkpoint.services) || checkpoint.services.length !== PLAN55_SERVICE_ORDER.length ||
      checkpoint.services.some((item, index) => item?.service !== PLAN55_SERVICE_ORDER[index] ||
        !SERVICE_STATES.has(item.status) || !EVIDENCE_STATES.has(item.cleanup)) ||
      !Array.isArray(checkpoint.waves) || checkpoint.waves.length !== 3 ||
      checkpoint.waves.some((status) => !EVIDENCE_STATES.has(status)) ||
      typeof checkpoint.cleanupRequired !== 'boolean' || typeof checkpoint.repairableLocalBlocker !== 'boolean' ||
      !Array.isArray(checkpoint.safeParallelWork) ||
      checkpoint.safeParallelWork.some((item) => typeof item !== 'string' || item.length > 240)) {
    throw new Error('plan55_execution_checkpoint_invalid')
  }
}

function decision(action, reason, details = {}) {
  return Object.freeze({
    schema: 'plan55-next-action/v1',
    action,
    reason,
    ...details,
  })
}
