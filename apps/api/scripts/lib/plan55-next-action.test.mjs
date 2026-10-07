import test from 'node:test'
import assert from 'node:assert/strict'

import { PLAN55_SERVICE_ORDER } from './plan55-production-canary-core.mjs'
import { buildPlan55NextAction, parsePlan55ExecutionCheckpoint } from './plan55-next-action.mjs'

const base = () => ({
  schema: 'plan55-execution-checkpoint/v1',
  production: {
    sourceSha: 'a'.repeat(40),
    releaseId: `harness-${'a'.repeat(12)}-${'b'.repeat(12)}`,
  },
  sourceLock: 'PASS',
  independentHoldout: 'PASS',
  predeployGates: 'PASS',
  guardDeployedOff: 'PASS',
  services: PLAN55_SERVICE_ORDER.map((service) => ({ service, status: 'PASS', cleanup: 'PASS' })),
  pilot: 'PASS',
  finalGates: 'PASS',
  waves: ['PASS', 'PASS', 'PASS'],
  promotion: 'PASS',
  productionActive: 'PASS',
  cleanupRequired: false,
  repairableLocalBlocker: false,
  safeParallelWork: [],
})

test('Plan 55 next-action fails closed on malformed checkpoints', () => {
  assert.throws(() => buildPlan55NextAction({}), {
    message: 'plan55_execution_checkpoint_invalid',
  })
})

test('execution checkpoint parser reads only the bounded Plan.md block', () => {
  const checkpoint = base()
  const document = `prefix\n<!-- PLAN55_EXECUTION_CHECKPOINT_START -->\n${JSON.stringify(checkpoint)}\n<!-- PLAN55_EXECUTION_CHECKPOINT_END -->\nsuffix`
  assert.deepEqual(parsePlan55ExecutionCheckpoint(document), checkpoint)
  assert.throws(() => parsePlan55ExecutionCheckpoint('no checkpoint'), {
    message: 'plan55_execution_checkpoint_missing',
  })
  assert.throws(() => parsePlan55ExecutionCheckpoint('<!-- PLAN55_EXECUTION_CHECKPOINT_START -->{oops}<!-- PLAN55_EXECUTION_CHECKPOINT_END -->'), {
    message: 'plan55_execution_checkpoint_invalid',
  })
})

test('cleanup takes priority over every later phase', () => {
  const checkpoint = base()
  checkpoint.services[0] = { service: 'hvac', status: 'BLOCKED', cleanup: 'FAIL' }
  assert.equal(buildPlan55NextAction(checkpoint).action, 'RECOVER_CLEANUP')
})

test('fresh evaluator prevents a duplicate and exposes only safe parallel work', () => {
  const checkpoint = base()
  checkpoint.safeParallelWork = ['verify local promotion contracts']
  checkpoint.services[0] = { service: 'hvac', status: 'NOT_RUN', cleanup: 'UNKNOWN' }
  const result = buildPlan55NextAction(checkpoint, { activeEvaluatorFresh: true })
  assert.equal(result.action, 'WAIT_EXTERNAL')
  assert.deepEqual(result.safeParallelWork, ['verify local promotion contracts'])
})

test('deployment drift sends execution back to identity preparation', () => {
  assert.equal(buildPlan55NextAction(base(), { productionIdentityMatches: false }).action, 'PREPARE_SOURCE')
})

test('source and independent holdout gates must pass before guard deployment', () => {
  const checkpoint = base()
  checkpoint.sourceLock = 'PASS'
  checkpoint.independentHoldout = 'FAIL'
  checkpoint.guardDeployedOff = 'UNKNOWN'
  const result = buildPlan55NextAction(checkpoint)
  assert.equal(result.action, 'PREPARE_SOURCE')
  assert.match(result.missingPreconditions.join(' '), /independent blind holdout/u)
})

test('service order is fixed and service-local G5 failure stays off while later services run', () => {
  const checkpoint = base()
  checkpoint.services[0] = { service: 'hvac', status: 'G5_FAILED', cleanup: 'PASS' }
  checkpoint.services[1] = { service: 'handyman', status: 'NOT_RUN', cleanup: 'UNKNOWN' }
  const result = buildPlan55NextAction(checkpoint)
  assert.equal(result.action, 'RUN_SERVICE')
  assert.equal(result.service, 'handyman')
})

test('a service-local G5 failure is repaired only after later services finish', () => {
  const checkpoint = base()
  checkpoint.services[0] = { service: 'hvac', status: 'G5_FAILED', cleanup: 'PASS' }
  const result = buildPlan55NextAction(checkpoint)
  assert.equal(result.action, 'REPAIR_LOCAL')
  assert.equal(result.service, 'hvac')
})

test('a later shared blocker prevents advancing to an earlier not-run service', () => {
  const checkpoint = base()
  checkpoint.services[0] = { service: 'hvac', status: 'G5_FAILED', cleanup: 'PASS' }
  checkpoint.services[1] = { service: 'handyman', status: 'NOT_RUN', cleanup: 'UNKNOWN' }
  checkpoint.services[4] = { service: 'plumbing', status: 'BLOCKED', cleanup: 'PASS' }
  const result = buildPlan55NextAction(checkpoint)
  assert.equal(result.action, 'REPAIR_LOCAL')
  assert.equal(result.service, 'plumbing')
})

test('later phases advance in order and DONE requires all final evidence', () => {
  const checkpoint = base()
  checkpoint.pilot = 'UNKNOWN'
  assert.equal(buildPlan55NextAction(checkpoint).action, 'COLLECT_PILOT')

  checkpoint.pilot = 'PASS'
  checkpoint.finalGates = 'PASS'
  checkpoint.waves = ['PASS', 'UNKNOWN', 'UNKNOWN']
  const wave = buildPlan55NextAction(checkpoint)
  assert.equal(wave.action, 'RUN_WAVE')
  assert.equal(wave.wave, 2)

  checkpoint.waves = ['PASS', 'PASS', 'PASS']
  checkpoint.productionActive = 'UNKNOWN'
  assert.equal(buildPlan55NextAction(checkpoint).action, 'VERIFY_ACTIVE')

  checkpoint.productionActive = 'PASS'
  assert.equal(buildPlan55NextAction(checkpoint).action, 'DONE')
})
