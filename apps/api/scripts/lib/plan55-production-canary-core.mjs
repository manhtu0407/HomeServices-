import {
  PLAN55_SOURCE_ASSETS,
  PRODUCTION_MOBILE_API_URL,
  PRODUCTION_PROJECT_REF,
  assertPlan55SourceAttestation,
  validateProductionEvalTargets,
  validateProductionHealthPayload,
} from './kael-playbook-production-attestation.mjs'

export const PLAN55_SERVICE_ORDER = Object.freeze([
  'hvac', 'handyman', 'cleaning', 'upholstery', 'plumbing', 'electrical',
])

const DATASETS = Object.freeze(['corpus', 'holdout'])
const ARMS = Object.freeze(['baseline', 'after'])
const REPETITIONS = Object.freeze([1, 2])
const CASES_PER_SLICE = 12
const GLOBAL_FLAG_NAMES = Object.freeze(PLAN55_SERVICE_ORDER.map(
  (service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_ENABLED`,
))
const CANARY_FLAG_NAMES = Object.freeze(PLAN55_SERVICE_ORDER.map(
  (service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_ENABLED`,
))
const CANARY_ACTOR_NAMES = Object.freeze(PLAN55_SERVICE_ORDER.map(
  (service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_USER_ID`,
))
const CLEANUP_TABLES = Object.freeze([
  'profiles',
  'customer_profiles',
  'customer_account_deletion_requests',
  'kael_chat_sessions',
  'kael_chat_turns',
])

export function buildPlan55ServiceSlices(service) {
  if (!PLAN55_SERVICE_ORDER.includes(service)) {
    throw new Error('plan55_canary_unsupported_service')
  }
  const paths = PLAN55_SOURCE_ASSETS[service]
  return Object.freeze(ARMS.flatMap((arm) => DATASETS.flatMap((dataset) =>
    REPETITIONS.map((repetition) => {
      const offset = (repetition - 1) * CASES_PER_SLICE
      const corpusPath = paths[dataset]
      return Object.freeze({
        id: `${service}-${arm}-${dataset}-p${repetition}`,
        service,
        arm,
        dataset,
        repetition,
        offset,
        limit: CASES_PER_SLICE,
        playbookEnabled: arm === 'after',
        corpusPath,
        playbookPath: paths.playbook,
      })
    }),
  )))
}

export function buildPlan55CanaryPlan(services = PLAN55_SERVICE_ORDER) {
  assertOrderedServiceSubset(services)
  return Object.freeze(services.map((service) => Object.freeze({
    service,
    slices: buildPlan55ServiceSlices(service),
  })))
}

export function assertPlan55CanaryPreflight(input) {
  if (!input || typeof input !== 'object') throw new Error('plan55_preflight_invalid')
  const target = validateProductionEvalTargets(
    input.mobileApiUrl,
    input.supabaseUrl,
    input.productionCanaryOptIn,
  )
  const deployment = validateProductionHealthPayload(input.healthPayload)
  if (target.mobileApiUrl !== PRODUCTION_MOBILE_API_URL ||
      input.releaseLane !== 'verification') {
    throw new Error('plan55_preflight_wrong_target_or_lane')
  }
  const source = assertPlan55SourceAttestation(input.sourceAttestation, deployment.git_sha)
  const guard = input.actorGuardProof
  if (!guard || guard.source_sha?.toLowerCase() !== deployment.git_sha ||
      guard.verified_auth_context !== true ||
      guard.ignores_request_body_id !== true ||
      guard.canary_precedes_legacy_global !== true ||
      guard.regression_tests_pass !== true) {
    throw new Error('plan55_preflight_actor_guard_unverified')
  }

  assertFlagsFailClosed(input.flagStates)
  assertVerificationProviders(input.verificationProviders)
  return Object.freeze({
    target,
    deployment,
    source,
    serviceCanaryFlagName(service) {
      if (!PLAN55_SERVICE_ORDER.includes(service)) {
        throw new Error('plan55_canary_unsupported_service')
      }
      return `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_ENABLED`
    },
  })
}

export function assertPlan55Cleanup(value) {
  if (!value || typeof value !== 'object') throw new Error('plan55_cleanup_receipt_missing')
  if (value.canaryFlag !== 'absent') {
    throw new Error('plan55_cleanup_canary_flag_still_enabled')
  }
  if (value.canaryActorId !== 'absent') {
    throw new Error('plan55_cleanup_canary_actor_still_configured')
  }
  if (value.authStatus !== 404) {
    throw new Error('plan55_cleanup_auth_actor_still_exists')
  }
  if (!value.rows || CLEANUP_TABLES.some((table) => value.rows[table] !== 0)) {
    throw new Error('plan55_cleanup_residual_rows_detected')
  }
  if (value.orphanWorkers !== 0) {
    throw new Error('plan55_cleanup_orphan_worker_detected')
  }
  return true
}

export function validatePlan55SliceArtifacts({ receipt, slice, deployment, expectedCaseIds }) {
  const fail = () => { throw new Error('plan55_canary_slice_artifact_integrity_failed') }
  if (!receipt || !slice || !deployment || !Array.isArray(expectedCaseIds) ||
      expectedCaseIds.length !== CASES_PER_SLICE) fail()
  const { json, raw, markdown, summary } = receipt
  const manifest = json?.manifest
  if (!manifest || !raw?.manifest || !Array.isArray(json.runs) ||
      !Array.isArray(raw.observations) || typeof markdown !== 'string' || !summary) fail()
  if (!isDeepStrictEqual(manifest, raw.manifest)) fail()

  const markdownManifest = markdown.match(/## Run manifest\s*\r?\n+\s*```json\s*\r?\n([\s\S]*?)\r?\n```/u)
  if (!markdownManifest || !isDeepStrictEqual(JSON.parse(markdownManifest[1]), manifest)) fail()
  const metrics = json.metrics
  if (!metrics || !isDeepStrictEqual(metrics, summary.metrics) || metrics.total !== CASES_PER_SLICE ||
      summary.cases !== CASES_PER_SLICE || summary.mode !== 'live') fail()
  const metricDigest = createHash('sha256').update(JSON.stringify(metrics)).digest('hex')
  if (!markdown.includes(`<!-- plan55-eval-metrics-sha256:${metricDigest} -->`)) fail()

  const stability = json.stability
  const matrix = metrics.routing?.confusion_matrix
  if (!stability || !matrix) fail()
  const pct = (value) => value == null ? 'n/a' : `${Math.round(value * 1000) / 10}%`
  const renderedMetrics = [
    ['- Overall:', `- Overall: ${pct(metrics.overall_pass_rate)} (${metrics.passed}/${metrics.total})`],
    ['- Routing accuracy:', `- Routing accuracy: ${pct(metrics.routing.accuracy)} (${metrics.total - metrics.routing.unclassified}/${metrics.total} classified runs)`],
    ['- Routing macro-F1:', `- Routing macro-F1: ${metrics.routing.macro_f1 ?? 'n/a'}`],
    ['- False-decline rate:', `- False-decline rate: ${pct(metrics.routing.false_decline_rate)} (${metrics.routing.false_declines}/${metrics.routing.valid_jobs})`],
    ['- Suggested-service accuracy:', `- Suggested-service accuracy: ${pct(metrics.by_field.suggested_service.rate)}`],
    ['- Clarification accuracy:', `- Clarification accuracy: ${pct(metrics.by_field.needs_clarification.rate)}`],
    ['- Observed clarification rate:', `- Observed clarification rate: ${pct(metrics.conversation.clarification_rate)}`],
    ['- Problem-slug accuracy:', `- Problem-slug accuracy: ${pct(metrics.by_field.problem_slug.rate)}`],
    ['- Required-safety recall:', `- Required-safety recall: ${pct(metrics.safety.required_signal_recall)} (${metrics.safety.observed_required_signals}/${metrics.safety.expected_required_signals}); misses: ${metrics.safety.required_signal_misses}`],
    ['- Immediate-critical recall:', `- Immediate-critical recall: ${pct(metrics.safety.immediate_critical_recall)} (${metrics.safety.observed_immediate_critical_signals}/${metrics.safety.expected_immediate_critical_signals}); misses: ${metrics.safety.immediate_critical_misses}`],
    ['- Capability-signal recall:', `- Capability-signal recall: ${pct(metrics.safety.capability_recall)} (${metrics.safety.observed_capability_signals}/${metrics.safety.expected_capability_signals}); misses: ${metrics.safety.capability_misses}`],
    ['- Safety false-positive rate:', `- Safety false-positive rate: ${pct(metrics.safety.false_positive_rate)} (${metrics.safety.false_positives}/${metrics.safety.forbidden_signal_checks})`],
    ['- Average turns:', `- Average turns: ${metrics.conversation.average_turns ?? 'n/a'}`],
    ['- Latency p50 / p95:', `- Latency p50 / p95: ${metrics.conversation.latency_ms_p50 ?? 'n/a'} / ${metrics.conversation.latency_ms_p95 ?? 'n/a'} ms`],
    ['- Repeated-run fully-consistent rate (error-aware):', `- Repeated-run fully-consistent rate (error-aware): ${pct(stability.fully_consistent_rate)}`],
    ['- Outcome-mode agreement (diagnostic; errored outcomes can agree):', `- Outcome-mode agreement (diagnostic; errored outcomes can agree): ${pct(stability.consistency_rate)}`],
    ['- Errored case groups / runs:', `- Errored case groups / runs: ${stability.errored_cases} / ${stability.errored_runs}`],
    ['- Release gate:', `- Release gate: ${manifest.run_config?.allow_failures ? 'diagnostic override enabled' : 'strict'}`],
  ]
  const markdownLines = markdown.split(/\r?\n/u)
  for (const [prefix, expectedLine] of renderedMetrics) {
    const actualLines = markdownLines.filter((line) => line.startsWith(prefix))
    if (actualLines.length !== 1 || actualLines[0] !== expectedLine) fail()
  }

  const matrixSection = markdown.split(/## Routing confusion matrix\s*\r?\n/u)[1]?.split(/\r?\n## /u)[0] ?? ''
  const matrixRows = matrixSection.split(/\r?\n/u)
    .filter((line) => /^\|\s*(in_scope|out_of_scope|service_mismatch)\s*\|/u.test(line))
  const expectedMatrixRows = ['in_scope', 'out_of_scope', 'service_mismatch'].map((expected) =>
    `| ${expected} | ${matrix[expected].in_scope} | ${matrix[expected].out_of_scope} | ${matrix[expected].service_mismatch} |`
  )
  const expectedRunCount = `Run-level counts: ${stability.cases} unique cases x ${manifest.repetitions} repetition(s).`
  if (!matrixSection ||
      matrixRows.length !== expectedMatrixRows.length ||
      !isDeepStrictEqual(matrixRows, expectedMatrixRows) ||
      matrixSection.split(expectedRunCount).length !== 2) fail()

  const expectedState = slice.playbookEnabled ? 'on' : 'off'
  const featureFlag = `${slice.service}_playbook`
  const runConfig = manifest.run_config
  if (manifest.run_mode !== 'live' || manifest.deployment_version !== deployment.release_id ||
      manifest.observed_playbook_state !== expectedState ||
      manifest.feature_flags?.[featureFlag] !== slice.playbookEnabled ||
      manifest.corpus_path !== slice.corpusPath ||
      manifest.playbook_source_path !== slice.playbookPath ||
      runConfig?.offset !== slice.offset || runConfig?.limit !== CASES_PER_SLICE ||
      runConfig?.allow_failures !== false || manifest.repetitions !== 1) fail()

  const jsonIds = json.runs.map((run) => run.id)
  const rawIds = raw.observations.map((observation) => observation.id)
  if (json.runs.length !== raw.observations.length || json.runs.some((run, index) => {
    const observation = raw.observations[index]
    return run.repetition !== observation.repetition ||
      run.error_code !== observation.error_code ||
      !isDeepStrictEqual(run.observed, observation.observation)
  })) fail()
  let recomputedMetrics
  let recomputedStability
  try {
    const scored = json.runs.map((run, index) => {
      const observation = raw.observations[index]
      const recomputedScore = scorePlaybookCase(run.expected, observation.observation, observation.error_code)
      if (!isDeepStrictEqual(run.score, recomputedScore)) fail()
      return {
        id: run.id,
        repetition: run.repetition,
        expected: run.expected,
        observed: observation.observation,
        score: recomputedScore,
        turns: observation.turns,
        clarificationTurns: observation.clarification_turns,
        latency_ms: observation.latency_ms,
      }
    })
    recomputedMetrics = aggregatePlaybookResults(scored)
    recomputedStability = aggregateRepetitionStability(scored)
  } catch {
    fail()
  }
  if (!isDeepStrictEqual(metrics, recomputedMetrics) ||
      !isDeepStrictEqual(stability, recomputedStability)) fail()
  const markdownRuns = markdown.split(/## Runs\s*\r?\n/u)[1]?.split(/\r?\n## /u)[0] ?? ''
  const markdownIds = [...markdownRuns.matchAll(/^\|\s*([^|]+?)\s*\|\s*\d+\s*\|/gmu)]
    .map((match) => match[1].trim())
  if (!isDeepStrictEqual(jsonIds, expectedCaseIds) ||
      !isDeepStrictEqual(rawIds, expectedCaseIds) ||
      !isDeepStrictEqual(markdownIds, expectedCaseIds) ||
      raw.observations.some((item) => item.error_code !== null) ||
      json.runs.some((item) => item.error_code !== null || item.score?.error)) fail()
  return Object.freeze({
    sliceId: slice.id,
    caseCount: CASES_PER_SLICE,
    errorCount: 0,
    artifactIntegrity: 'pass',
    sourceSha: deployment.git_sha,
    corpusPath: slice.corpusPath,
    playbookPath: slice.playbookPath,
    playbookEnabled: slice.playbookEnabled,
    metrics,
    runId: manifest.started_at,
  })
}

export async function runPlan55ServiceSequence({ services = PLAN55_SERVICE_ORDER, operations }) {
  assertOrderedServiceSubset(services)
  assertOperations(operations)
  const results = []

  for (const service of services) {
    const preflight = assertPlan55CanaryPreflight(await operations.preflight(service))
    let actor = null
    let flagMayBeEnabled = false
    let evaluationError = null
    const slices = []

    try {
      actor = await operations.createSyntheticActor(service)
      if (!actor || actor.synthetic !== true || !isUuid(actor.id)) {
        throw new Error('plan55_canary_actor_not_synthetic')
      }

      const plan = buildPlan55ServiceSlices(service)
      for (const slice of plan.filter((item) => item.arm === 'baseline')) {
        slices.push(await runAndCheckSlice(operations, service, actor, slice, preflight))
      }

      flagMayBeEnabled = true
      await operations.enableActorCanary(service, actor)
      for (const slice of plan.filter((item) => item.arm === 'after')) {
        slices.push(await runAndCheckSlice(operations, service, actor, slice, preflight))
      }
    } catch (error) {
      evaluationError = safeCode(error, 'plan55_canary_evaluation_failed')
    }

    let cleanup
    try {
      cleanup = await operations.cleanupService({ service, actor, flagMayBeEnabled })
      assertPlan55Cleanup(cleanup)
    } catch (error) {
      throw new Error(safeCode(error, 'plan55_canary_cleanup_failed'))
    }
    if (evaluationError) throw new Error(evaluationError)
    if (slices.length !== 8) throw new Error('plan55_canary_incomplete_slice_set')

    const g5 = await operations.evaluateG5({ service, slices, deployment: preflight.deployment })
    if (!g5 || typeof g5.passed !== 'boolean' || !g5.deltas || typeof g5.deltas !== 'object') {
      throw new Error('plan55_canary_g5_receipt_invalid')
    }
    results.push(Object.freeze({
      service,
      status: g5.passed ? 'G5_PASSED' : 'G5_FAILED_SERVICE_OFF',
      slices: slices.map(({ sliceId, caseCount, errorCount }) => ({
        sliceId,
        caseCount,
        errorCount,
      })),
      g5: g5.deltas,
      cleanup: Object.freeze({ passed: true }),
      releaseId: preflight.deployment.release_id,
      sourceSha: preflight.deployment.git_sha,
    }))
  }

  return Object.freeze({
    schema: 'plan55-production-canary-sequence/v1',
    projectRef: PRODUCTION_PROJECT_REF,
    services: Object.freeze(results),
  })
}

async function runAndCheckSlice(operations, service, actor, slice, preflight) {
  const receipt = await operations.runSlice({ service, actor, slice, deployment: preflight.deployment })
  if (!receipt || receipt.sliceId !== slice.id || receipt.caseCount !== CASES_PER_SLICE ||
      receipt.errorCount !== 0 || receipt.artifactIntegrity !== 'pass' ||
      receipt.sourceSha !== preflight.deployment.git_sha ||
      receipt.corpusPath !== slice.corpusPath || receipt.playbookPath !== slice.playbookPath ||
      receipt.playbookEnabled !== slice.playbookEnabled) {
    throw new Error('plan55_canary_slice_receipt_invalid')
  }
  return receipt
}

function assertFlagsFailClosed(flagStates) {
  if (!flagStates || typeof flagStates !== 'object') throw new Error('plan55_preflight_flag_inventory_missing')
  const expected = [
    ...GLOBAL_FLAG_NAMES,
    ...CANARY_FLAG_NAMES,
    ...CANARY_ACTOR_NAMES,
    'KAEL_INTAKE_EVAL_OBSERVATION_ENABLED',
  ]
  for (const name of expected) {
    if (!Object.hasOwn(flagStates, name)) throw new Error('plan55_preflight_flag_inventory_incomplete')
    const value = flagStates[name]
    const absent = value === 'absent' || value === null
    const off = value === 'off' || value === false ||
      (typeof value === 'string' && ['0', 'false', 'no'].includes(value.trim().toLowerCase()))
    const isActorId = CANARY_ACTOR_NAMES.includes(name)
    if (isActorId ? !absent : !(absent || off)) {
      throw new Error('plan55_preflight_existing_flag_must_remain_off')
    }
  }
}

function assertVerificationProviders(input) {
  if (!input || !Array.isArray(input.required) || input.required.length === 0 ||
      !input.status || typeof input.status !== 'object') {
    throw new Error('plan55_preflight_provider_inventory_missing')
  }
  for (const provider of input.required) {
    if (typeof provider !== 'string' || input.status[provider] !== true) {
      throw new Error('plan55_preflight_verification_provider_not_ready')
    }
  }
}

function assertOperations(operations) {
  const required = [
    'preflight', 'createSyntheticActor', 'enableActorCanary',
    'runSlice', 'cleanupService', 'evaluateG5',
  ]
  if (!operations || required.some((key) => typeof operations[key] !== 'function')) {
    throw new Error('plan55_canary_operations_incomplete')
  }
}

function assertOrderedServiceSubset(services) {
  if (!Array.isArray(services) || services.length === 0 ||
      services.some((service, index) => !PLAN55_SERVICE_ORDER.includes(service) ||
        (index > 0 && PLAN55_SERVICE_ORDER.indexOf(services[index - 1]) >= PLAN55_SERVICE_ORDER.indexOf(service))) ||
      new Set(services).size !== services.length) {
    throw new Error('plan55_canary_service_order_invalid')
  }
}

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function safeCode(error, fallback) {
  const code = error instanceof Error ? error.message : ''
  return /^[a-z0-9_:-]{1,100}$/i.test(code) ? code : fallback
}
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  aggregatePlaybookResults,
  aggregateRepetitionStability,
  scorePlaybookCase,
} from './kael-playbook-eval-core.mjs'
