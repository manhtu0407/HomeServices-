import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkHarnessRelease } from './release-bundle.mjs'
import {
  assertPlan55GateEvidenceCoverage,
  isPlan55GateReceiptRecord,
  loadPlan55GateEvidenceSet,
  verifyPlan55GitHubArtifactProvenance,
} from './plan55-gate-receipts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CONFIG_PATH = resolve(ROOT, 'config/harness/promotion.json')
const PLAN55_POLICY_RELATIVE_PATH = 'config/harness/plan55-production-only-policy.json'
const PLAN55_POLICY_ID = 'plan55-production-only'
const PLAN55_PAIRED_WAVE_PREREGISTRATION_V2_ERROR = 'Plan 55 paired-wave preregistration must use v2 with minimum sample counts and a cost attribution source'
const PLAN55_PAIRED_WAVE_OUTCOME_THRESHOLDS = Object.freeze({
  schemaVersion: 'plan55-paired-wave-outcome-thresholds.v1',
  criticalFailureClasses: Object.freeze(['safety', 'authorization', 'confirmation']),
  criticalFailureMaximum: 0,
  errorRateMaximum: 0.02,
  p95LatencyRegressionMaximum: 0.2,
  costRegressionMaximum: 0.2,
  costAttributionRequired: true,
  missingMetricBehavior: 'block',
})
const PLAN55_PUBLICATION_PACKET_GATE = 'plan55-publication-packet'
const PLAN55_PUBLICATION_PACKET_WORKFLOW = '.github/workflows/plan55-postreceipt-finalization.yml'
const PLAN55_WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/u
const RELEASE_PATH = resolve(ROOT, 'artifacts/harness/release-manifest.json')
const EVALUATION_PATH = resolve(ROOT, 'artifacts/harness/evaluation-report.json')
const OUTPUT_PATH = resolve(ROOT, 'artifacts/harness/promotion-packet.json')
const REMOTE_STATES = new Set([
  'staging', 'shadow', 'canary', 'production', 'aborted', 'rolled_back',
  'guard_deployed_off', 'service_canary', 'service_cleanup', 'receipts_validated',
  'rollback_drill', 'paired_wave_1', 'paired_wave_2', 'paired_wave_3',
])
const ROLLBACK_BUNDLE_REQUIRED_STATES = new Set([
  'canary', 'production', 'rolled_back', 'guard_deployed_off', 'service_canary',
  'service_cleanup', 'paired_wave_1', 'paired_wave_2', 'paired_wave_3',
])
const PLAN55_PAIRED_WAVE_STATES = new Set(['paired_wave_1', 'paired_wave_2', 'paired_wave_3'])
const PLAN55_PREREGISTRATION_REQUIRED_STATES = new Set([...PLAN55_PAIRED_WAVE_STATES, 'production'])
const PLAN55_COHORT_ID = /^synthetic-plan55-[0-9a-f]{32}$/u
const PROMOTION_ENVIRONMENTS = new Set(['preview', 'staging', 'production'])
const PLAN55_STATES = Object.freeze([
  'assembled', 'verified', 'guard_deployed_off', 'service_canary', 'service_cleanup',
  'receipts_validated', 'rollback_drill', 'paired_wave_1', 'paired_wave_2', 'paired_wave_3', 'production',
  'aborted', 'rolled_back',
])
const PLAN55_TRANSITIONS = Object.freeze([
  ['assembled', 'verified'], ['verified', 'guard_deployed_off'], ['verified', 'aborted'],
  ['guard_deployed_off', 'service_canary'], ['guard_deployed_off', 'aborted'],
  ['service_canary', 'service_cleanup'], ['service_canary', 'aborted'],
  ['service_cleanup', 'service_canary'], ['service_cleanup', 'receipts_validated'], ['service_cleanup', 'aborted'],
  ['receipts_validated', 'rollback_drill'], ['receipts_validated', 'aborted'],
  ['rollback_drill', 'paired_wave_1'], ['rollback_drill', 'aborted'],
  ['paired_wave_1', 'paired_wave_2'], ['paired_wave_1', 'aborted'],
  ['paired_wave_2', 'paired_wave_3'], ['paired_wave_2', 'aborted'],
  ['paired_wave_3', 'production'], ['paired_wave_3', 'aborted'],
  ['production', 'rolled_back'], ['aborted', 'rolled_back'],
])
const PLAN55_SERVICES = Object.freeze(['hvac', 'handyman', 'cleaning', 'upholstery', 'plumbing', 'electrical'])
const PLAN55_POLICY_PHASES = Object.freeze([
  'verified', 'guard_deployed_off', 'service_canary', 'service_cleanup', 'receipts_validated',
  'rollback_drill', 'paired_wave_1', 'paired_wave_2', 'paired_wave_3', 'production',
])
const SENSITIVE_KEY = /token|secret|password|authorization|cookie|credential|api[_-]?key|service[_-]?role|email|phone|address|description|content|prompt|image|audio|transcript|latitude|longitude|cccd|bank|message|text|question|answer|query|title|name|url|uri|unit|floor|street|ward|postal|zip|otp/iu
const SENSITIVE_VALUE = /(?:bearer\s+[a-z0-9._~-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})/u

export function loadPlan55ProductionOnlyPolicy(rootInput = ROOT) {
  const root = resolve(rootInput)
  const base = JSON.parse(readFileSync(resolve(root, 'config/harness/promotion.json'), 'utf8'))
  const policyBytes = readFileSync(resolve(root, PLAN55_POLICY_RELATIVE_PATH))
  const plan55 = JSON.parse(policyBytes.toString('utf8'))
  return { ...base, ...plan55, policySha256: sha256(policyBytes) }
}

export function validatePromotionConfig(config, options = {}) {
  const problems = []
  if (!config || typeof config !== 'object') return ['promotion config must be an object']
  const root = options.root ?? ROOT
  if (!/^\d+\.\d+\.\d+$/.test(config.version ?? '')) problems.push('promotion version is invalid')
  if (!Array.isArray(config.states) || !config.states.length) problems.push('promotion states must be non-empty')
  const states = new Set(config.states ?? [])
  if (states.size !== (config.states ?? []).length) problems.push('promotion states contain duplicates')
  const plan55 = config.policyId === PLAN55_POLICY_ID
  const requiredStates = plan55
    ? PLAN55_STATES
    : ['assembled', 'verified', 'staging', 'shadow', 'canary', 'production', 'aborted', 'rolled_back']
  for (const required of requiredStates) {
    if (!states.has(required)) problems.push(`promotion state is missing: ${required}`)
  }
  const transitions = new Set()
  for (const transition of config.allowed_transitions ?? []) {
    if (!Array.isArray(transition) || transition.length !== 2) {
      problems.push('promotion transition must contain from and to')
      continue
    }
    const [from, to] = transition
    if (!states.has(from) || !states.has(to)) problems.push(`promotion transition uses unknown state: ${from}->${to}`)
    const key = `${from}->${to}`
    if (transitions.has(key)) problems.push(`duplicate promotion transition: ${key}`)
    transitions.add(key)
  }
  for (const metric of ['critical_safety_failures', 'authorization_bypass_failures', 'confirmation_bypass_failures']) {
    if (config.abort_thresholds?.[metric] !== 0) problems.push(`${metric} abort threshold must be zero`)
  }
  for (const [metric, value] of Object.entries(config.abort_thresholds ?? {})) {
    if (!Number.isFinite(value) || value < 0) problems.push(`abort threshold is invalid: ${metric}`)
  }
  const killSwitches = config.kill_switches ?? []
  if (!Array.isArray(killSwitches) || !killSwitches.length || new Set(killSwitches).size !== killSwitches.length) {
    problems.push('kill switches must be unique and non-empty')
  }
  for (const slo of config.slos ?? []) {
    if (!slo.id || !slo.owner || !slo.runbook) problems.push('every SLO requires id, owner, and runbook')
    if (!Number.isFinite(slo.target) || slo.target <= 0 || slo.target > 1) problems.push(`SLO target is invalid: ${slo.id}`)
    if (!Number.isInteger(slo.window_days) || slo.window_days < 1) problems.push(`SLO window is invalid: ${slo.id}`)
    if (options.root && slo.runbook && !existsSync(resolve(options.root, slo.runbook))) problems.push(`SLO runbook is missing: ${slo.runbook}`)
  }
  if (plan55) problems.push(...validatePlan55Policy(config, root, options.targetState))
  return problems
}

function validatePlan55Policy(policy, root, targetState) {
  const problems = []
  const validTargetState = PLAN55_POLICY_PHASES.includes(targetState) ||
    ['aborted', 'rolled_back'].includes(targetState)
  if (targetState !== undefined && !validTargetState) {
    problems.push('Plan 55 promotion target state is invalid')
  }
  try {
    const sourcePolicyPath = resolvePromotionPath(PLAN55_POLICY_RELATIVE_PATH, { root, mustExist: true })
    const policyBytes = readFileSync(sourcePolicyPath)
    const sourcePolicy = JSON.parse(policyBytes.toString('utf8'))
    if (policy.policySha256 !== sha256(policyBytes) ||
        JSON.stringify(policy.pairedWavePreregistration) !== JSON.stringify(sourcePolicy.pairedWavePreregistration)) {
      problems.push('Plan 55 policy source binding is invalid')
    }
  } catch {
    problems.push('Plan 55 policy source binding is invalid')
  }
  if (policy.schemaVersion !== 'plan55-production-only-policy.v1' ||
      policy.environment !== 'production' || policy.projectRef !== 'iwevizmsedyqozxlawwl' ||
      policy.repository !== 'manhtu0407/HomeServices-' || policy.releaseLane !== PLAN55_POLICY_ID) {
    problems.push('Plan 55 policy target or schema is invalid')
  }
  const trustedWorkflowPaths = policy.trustedEvidenceWorkflowPaths
  if (!Array.isArray(trustedWorkflowPaths) || trustedWorkflowPaths.length === 0 ||
      new Set(trustedWorkflowPaths).size !== trustedWorkflowPaths.length ||
      trustedWorkflowPaths.some((path) => typeof path !== 'string' || !PLAN55_WORKFLOW_PATH.test(path))) {
    problems.push('Plan 55 trusted evidence workflow allowlist is invalid')
  } else {
    let requiredWorkflowPaths = trustedWorkflowPaths
    const workflowTargetState = targetState ?? 'production'
    if (targetState === undefined || validTargetState) {
      const requiredGates = requiredPromotionGates(policy, workflowTargetState)
      const producerPaths = requiredGates.map((gate) => policy.trustedEvidenceWorkflowPathsByGate?.[gate])
      if (targetState !== undefined) {
        requiredWorkflowPaths = [...new Set(producerPaths.filter((path) => typeof path === 'string'))]
      }
    } else {
      requiredWorkflowPaths = []
    }
    for (const path of requiredWorkflowPaths) {
      try {
        resolvePromotionPath(path, { root, mustExist: true })
      } catch {
        problems.push('Plan 55 trusted evidence workflow is missing or outside the repository')
        break
      }
    }
  }
  const expectedEvidenceWorkflowPathsByGate = {
    'plan55-production-source-merge': '.github/workflows/ci.yml',
    'plan55-exact-production-base-ancestry': '.github/workflows/ci.yml',
    'plan55-source-lock': '.github/workflows/ci.yml',
    'hosted-drift-baseline': '.github/workflows/ci.yml',
    'compatible-rollback-target': '.github/workflows/ci.yml',
    'plan55-production-target-attestation': '.github/workflows/ci.yml',
    'plan55-rollback-preflight': '.github/workflows/ci.yml',
    'plan55-exact-binary-release-attestation': '.github/workflows/ci.yml',
    'plan55-full-production-readiness': '.github/workflows/ci.yml',
    'plan55-runtime-source-match': '.github/workflows/ci.yml',
    'plan55-guard-deployed': '.github/workflows/ci.yml',
    'plan55-all-global-flags-off': '.github/workflows/ci.yml',
    'plan55-provider-readiness': '.github/workflows/ci.yml',
    'plan55-no-migration': '.github/workflows/ci.yml',
    'workspace-typecheck': '.github/workflows/ci.yml',
    'workspace-tests': '.github/workflows/ci.yml',
    'workspace-build': '.github/workflows/ci.yml',
    'production-ui-normality': '.github/workflows/ci.yml',
    security: '.github/workflows/ci.yml',
    harness: '.github/workflows/ci.yml',
    'plan55-actor-scoped-guard-tests': '.github/workflows/ci.yml',
    'plan55-canary-runner-tests': '.github/workflows/ci.yml',
    'plan55-independent-holdout-freeze': '.github/workflows/ci.yml',
    'plan55-docker-sql-edge-gates': '.github/workflows/ci.yml',
    'edge-deno': '.github/workflows/ci.yml',
    'sql-verification': '.github/workflows/ci.yml',
    'generated-types': '.github/workflows/ci.yml',
    'plan55-auth-admin-verified': '.github/workflows/ci.yml',
    'plan55-synthetic-actor-created': '.github/workflows/ci.yml',
    'plan55-actor-scope-verified': '.github/workflows/ci.yml',
    'plan55-disposable-worker-isolated': '.github/workflows/ci.yml',
    'plan55-service-slice-integrity-pass': '.github/workflows/ci.yml',
    'plan55-service-g5-safety-pass': '.github/workflows/ci.yml',
    'plan55-service-cleanup-pass': '.github/workflows/ci.yml',
    'plan55-six-current-source-receipts': '.github/workflows/ci.yml',
    'plan55-six-cleanup-passes': '.github/workflows/ci.yml',
    'plan55-publication-packet': PLAN55_PUBLICATION_PACKET_WORKFLOW,
    'plan55-rollback-drill': '.github/workflows/plan55-rollback-drill.yml',
    'plan55-hosted-drift-pass': '.github/workflows/plan55-hosted-drift.yml',
  }
  const actualProducerEntries = policy.trustedEvidenceWorkflowPathsByGate &&
    typeof policy.trustedEvidenceWorkflowPathsByGate === 'object' &&
    !Array.isArray(policy.trustedEvidenceWorkflowPathsByGate)
    ? Object.entries(policy.trustedEvidenceWorkflowPathsByGate).sort(([left], [right]) => left.localeCompare(right))
    : null
  const expectedProducerEntries = Object.entries(expectedEvidenceWorkflowPathsByGate)
    .sort(([left], [right]) => left.localeCompare(right))
  if (!actualProducerEntries || JSON.stringify(actualProducerEntries) !== JSON.stringify(expectedProducerEntries) ||
      Object.values(expectedEvidenceWorkflowPathsByGate).some((path) => !trustedWorkflowPaths?.includes(path))) {
    problems.push('Plan 55 gate-specific evidence producer map is invalid')
  }
  const productionSourceBase = policy.productionSourceBase
  if (!productionSourceBase || typeof productionSourceBase !== 'object' ||
      Array.isArray(productionSourceBase) ||
      !/^[a-f0-9]{40}$/u.test(productionSourceBase.sha ?? '') ||
      productionSourceBase.branch !== `codex/plan55-production-base-${String(productionSourceBase.sha ?? '').slice(0, 8)}-review-v2`) {
    problems.push('Plan 55 exact Production source base is invalid')
  }
  if (JSON.stringify(policy.states) !== JSON.stringify(PLAN55_STATES)) {
    problems.push('Plan 55 state sequence is invalid')
  }
  if (JSON.stringify(policy.allowed_transitions) !== JSON.stringify(PLAN55_TRANSITIONS)) {
    problems.push('Plan 55 transition policy is invalid')
  }
  if ((policy.states ?? []).some((state) => ['staging', 'shadow'].includes(state)) ||
      (policy.allowed_transitions ?? []).some((edge) => edge?.some((state) => ['staging', 'shadow'].includes(state)))) {
    problems.push('Plan 55 policy contains a forbidden Staging transition')
  }
  if (JSON.stringify(policy.serviceOrder) !== JSON.stringify(PLAN55_SERVICES) ||
      policy.slicesPerService !== 8 || policy.casesPerSlice !== 12 || policy.serviceConcurrency !== 1 ||
      policy.globalServiceFlags !== 'absent' || policy.realCustomerTraffic !== false ||
      policy.cleanupBeforeNextService !== true || policy.stagingAllowed !== false) {
    problems.push('Plan 55 bounded-canary contract is invalid')
  }
  if (!isValidPlan55PairedWaveOutcomeThresholds(policy.pairedWaveOutcomeThresholds)) {
    problems.push('Plan 55 paired-wave outcome thresholds are invalid')
  } else if (!plan55OutcomeThresholdsMatchAbortPolicy(policy)) {
    problems.push('Plan 55 outcome thresholds do not match executable abort policy')
  }
  if (!policy.requiredGatesByTarget || typeof policy.requiredGatesByTarget !== 'object' ||
      Array.isArray(policy.requiredGatesByTarget)) {
    problems.push('Plan 55 target gates are invalid')
  } else {
    const expectedTargets = [...PLAN55_POLICY_PHASES, 'aborted', 'rolled_back'].sort()
    if (JSON.stringify(Object.keys(policy.requiredGatesByTarget).sort()) !== JSON.stringify(expectedTargets)) {
      problems.push('Plan 55 target gate inventory is invalid')
    }
    for (const [target, gates] of Object.entries(policy.requiredGatesByTarget)) {
      if (!Array.isArray(gates) || new Set(gates).size !== gates.length || gates.some((gate) => typeof gate !== 'string')) {
        problems.push(`Plan 55 target gates are invalid: ${target}`)
      }
    }
    const requiredByTarget = {
      verified: ['plan55-production-source-merge', 'plan55-exact-production-base-ancestry', 'workspace-typecheck', 'workspace-tests', 'workspace-build', 'security', 'harness', 'edge-deno', 'sql-verification', 'generated-types', 'hosted-drift-baseline', 'production-ui-normality', 'compatible-rollback-target', 'plan55-production-target-attestation', 'plan55-actor-scoped-guard-tests', 'plan55-canary-runner-tests', 'plan55-source-lock', 'plan55-rollback-preflight'],
      guard_deployed_off: ['plan55-runtime-source-match', 'plan55-guard-deployed', 'plan55-all-global-flags-off', 'plan55-provider-readiness', 'plan55-no-migration'],
      service_canary: ['plan55-independent-holdout-freeze', 'plan55-auth-admin-verified', 'plan55-synthetic-actor-created', 'plan55-actor-scope-verified', 'plan55-disposable-worker-isolated'],
      service_cleanup: ['plan55-service-slice-integrity-pass', 'plan55-service-g5-safety-pass', 'plan55-service-cleanup-pass'],
      receipts_validated: ['plan55-six-current-source-receipts', 'plan55-six-cleanup-passes'],
      rollback_drill: ['plan55-docker-sql-edge-gates', 'plan55-hosted-drift-pass', 'plan55-full-production-readiness', 'plan55-exact-binary-release-attestation', 'plan55-publication-packet', 'plan55-independent-cohort-outcome'],
      paired_wave_1: ['plan55-rollback-drill'],
      paired_wave_2: ['plan55-paired-wave-1-pass'],
      paired_wave_3: ['plan55-paired-wave-2-pass'],
      production: ['plan55-paired-wave-3-pass', 'plan55-post-rollout-cohort-pass'],
      rolled_back: ['plan55-rollback-executed'],
    }
    for (const [target, gates] of Object.entries(requiredByTarget)) {
      for (const gate of gates) {
        if (!policy.requiredGatesByTarget[target]?.includes(gate)) {
          problems.push(`Plan 55 target is missing required gate: ${target}:${gate}`)
        }
      }
      for (const gate of policy.requiredGatesByTarget[target] ?? []) {
        if (!gates.includes(gate)) {
          problems.push(`Plan 55 target has unexpected gate: ${target}:${gate}`)
        }
      }
    }
  }
  if (typeof policy.policySha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(policy.policySha256)) {
    problems.push('Plan 55 policy digest is invalid')
  }
  if (!Object.hasOwn(policy, 'pairedWavePreregistration') ||
      (policy.pairedWavePreregistration !== null && !resolvePlan55PairedWavePreregistration(policy))) {
    problems.push('Plan 55 paired-wave preregistration is invalid')
  }
  return problems
}

export function canTransition(config, from, to) {
  return (config.allowed_transitions ?? []).some(([source, target]) => source === from && target === to)
}

export function evaluateAbortThresholds(config, metrics) {
  const results = Object.entries(config.abort_thresholds ?? {}).map(([metric, threshold]) => {
    const value = metrics?.[metric]
    const actual = Number.isFinite(value) ? Number(value) : null
    return {
      metric,
      threshold,
      actual,
      status: actual === null ? 'metric_missing' : 'measured',
      passed: actual !== null && actual <= threshold,
    }
  })
  return {
    passed: results.every((result) => result.passed),
    results,
    failures: results.filter((result) => !result.passed),
  }
}

export function simulateCanaryDecision(config, metrics) {
  const abort = evaluateAbortThresholds(config, metrics)
  if (abort.passed) return Object.freeze({ action: 'continue', abort, containmentSwitches: [] })
  const critical = abort.failures.some((failure) => [
    'critical_safety_failures',
    'authorization_bypass_failures',
    'confirmation_bypass_failures',
  ].includes(failure.metric))
  return Object.freeze({
    action: 'abort',
    abort,
    containmentSwitches: critical ? ['global_ai'] : [],
  })
}

export function releaseCompatibilityProblems(selected, rollback) {
  const problems = []
  if (!rollback) return ['rollback release is missing']
  problems.push(...checkHarnessRelease(rollback).map((problem) => `rollback ${problem}`))
  if (selected.releaseId === rollback.releaseId) problems.push('rollback release must differ from selected release')
  if (selected.environment !== rollback.environment) problems.push('rollback release environment does not match selected release')
  for (const field of ['migrationInventorySha256', 'databaseTypesSha256']) {
    if (selected[field] !== rollback[field]) problems.push(`rollback release is incompatible: ${field}`)
  }
  return problems
}

export function sanitizePromotionEvidence(value, path = 'evidence', depth = 0) {
  if (depth > 4) throw new Error(`${path} exceeds the safe metadata depth`)
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`)
    return value
  }
  if (typeof value === 'string') {
    if (SENSITIVE_VALUE.test(value)) throw new Error(`${path} contains secret-shaped evidence`)
    return value.slice(0, 240)
  }
  if (Array.isArray(value)) return value.slice(0, 40).map((item, index) => sanitizePromotionEvidence(item, `${path}[${index}]`, depth + 1))
  if (!value || typeof value !== 'object') throw new Error(`${path} contains an unsupported value`)
  const safe = {}
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) throw new Error(`${path}.${key} is not allowed in promotion evidence`)
    safe[key.slice(0, 80)] = sanitizePromotionEvidence(item, `${path}.${key}`, depth + 1)
  }
  return safe
}

export function buildPromotionPacket(input) {
  const configProblems = validatePromotionConfig(input.config, {
    root: input.root,
    targetState: input.targetState,
  })
  if (configProblems.length) throw new Error(configProblems.join('; '))
  const releaseProblems = checkHarnessRelease(input.release ?? {})
  if (releaseProblems.length) throw new Error(`release bundle is invalid: ${releaseProblems.join('; ')}`)
  if (input.release.releaseLane === PLAN55_POLICY_ID && input.config.policyId !== PLAN55_POLICY_ID) {
    throw new Error('Plan 55 Production-only release requires its dedicated promotion policy')
  }
  if (input.config.policyId === PLAN55_POLICY_ID && input.release.releaseLane !== PLAN55_POLICY_ID) {
    throw new Error('Plan 55 promotion policy requires a Plan 55 Production-only release')
  }
  assertEvaluationAlignment(input.release, input.evaluation)
  if (input.environment !== input.release.environment) throw new Error('release environment does not match promotion environment')
  const humanApprovalId = normalizeApprovalId(input.humanApprovalId)
  if (REMOTE_STATES.has(input.targetState) && !humanApprovalId) throw new Error('remote promotion requires explicit human approval')
  if (!canTransition(input.config, input.currentState, input.targetState)) throw new Error(`promotion transition is not allowed: ${input.currentState}->${input.targetState}`)
  const requiresPlan55Preregistration = input.config.policyId === PLAN55_POLICY_ID &&
    PLAN55_PREREGISTRATION_REQUIRED_STATES.has(input.targetState)
  const pairedWavePreregistration = requiresPlan55Preregistration
    ? resolvePlan55PairedWavePreregistration(input.config)
    : null
  if (requiresPlan55Preregistration && (input.cohort !== undefined || input.observationWindowMinutes !== undefined)) {
    throw new Error('Plan 55 preregistered cohort values must not be supplied by the caller')
  }
  if (requiresPlan55Preregistration && !pairedWavePreregistration) {
    throw new Error('Plan 55 paired-wave preregistration is missing or invalid')
  }
  if (requiresPlan55Preregistration && pairedWavePreregistration.schemaVersion !== 'plan55-paired-wave-preregistration.v2') {
    throw new Error(PLAN55_PAIRED_WAVE_PREREGISTRATION_V2_ERROR)
  }
  const requiredGates = requiredPromotionGates(input.config, input.targetState)
  const passedGates = input.passedGates ?? []
  for (const gate of requiredGates) {
    if (!passedGates.includes(gate)) throw new Error(`missing required release gate: ${gate}`)
  }
  const plan55GateReceipts = input.config.policyId === PLAN55_POLICY_ID
    ? buildPlan55GateReceiptSet(requiredGates, input.gateReceipts, {
      policy: input.config,
      release: input.release,
      targetState: input.targetState,
    })
    : null
  const abort = evaluateAbortThresholds(input.config, input.metrics ?? input.evaluation.metrics ?? {})
  if (!abort.passed) throw new Error(`promotion abort threshold failed: ${abort.failures.map((failure) => failure.metric).join(', ')}`)

  const rollbackRelease = input.rollbackRelease ?? null
  if (ROLLBACK_BUNDLE_REQUIRED_STATES.has(input.targetState)) {
    const compatibility = releaseCompatibilityProblems(input.release, rollbackRelease)
    if (compatibility.length) throw new Error(compatibility.join('; '))
  }
  if (input.rollbackReleaseId && rollbackRelease?.releaseId !== input.rollbackReleaseId) {
    throw new Error('rollback release ID does not match rollback release bundle')
  }
  const evidence = sanitizePromotionEvidence(input.evidence ?? {})
  const packet = {
    schemaVersion: '1.0.0',
    packetId: input.packetId ?? randomUUID(),
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    releaseId: input.release.releaseId,
    releaseBundleSha256: input.release.bundleSha256,
    gitSha: input.release.gitSha,
    sourceBundleSha256: input.release.sourceBundleSha256,
    mobileBuildFingerprintSha256: input.release.mobileBuildFingerprintSha256,
    edgeBundleSha256: input.release.edgeBundleSha256,
    environment: input.environment,
    fromState: input.currentState,
    toState: input.targetState,
    evaluationReportId: input.evaluation.reportId,
    evaluationSuiteVersion: input.release.evaluationSuiteVersion,
    evaluationSuiteSha256: input.release.evaluationSuiteSha256,
    promptBundleSha256: input.release.promptBundleSha256,
    policyBundleSha256: input.release.policyBundleSha256,
    serviceIntakePolicyBundleSha256: input.release.serviceIntakePolicyBundleSha256,
    priceEvidenceBundleSha256: input.release.priceEvidenceBundleSha256,
    providerReadinessFingerprintSha256: input.release.providerReadinessFingerprintSha256,
    manifestSha256: input.release.manifestSha256,
    capabilityRegistrySha256: input.release.capabilityRegistrySha256,
    accessMatrixSha256: input.release.accessMatrixSha256,
    reliabilityPolicySha256: input.release.reliabilityPolicySha256,
    promotionPolicySha256: input.release.promotionPolicySha256,
    migrationInventorySha256: input.release.migrationInventorySha256,
    databaseTypesSha256: input.release.databaseTypesSha256,
    edgeFunctions: input.release.edgeFunctions,
    humanApprovalId,
    ...(input.config.policyId === PLAN55_POLICY_ID ? {
      policyId: PLAN55_POLICY_ID,
      policySha256: input.config.policySha256,
      projectRef: input.config.projectRef,
      passedGates: [...requiredGates].sort(),
      gateReceipts: plan55GateReceipts,
      pairedWavePreregistrationSha256: pairedWavePreregistration?.sha256 ?? null,
    } : {}),
    rollbackReleaseId: rollbackRelease?.releaseId ?? null,
    rollbackCompatibility: rollbackRelease ? {
      releaseBundleSha256: rollbackRelease.bundleSha256,
      migrationInventorySha256: rollbackRelease.migrationInventorySha256,
      databaseTypesSha256: rollbackRelease.databaseTypesSha256,
    } : null,
    cohort: pairedWavePreregistration?.cohortId ?? input.cohort ?? null,
    observationWindowMinutes: pairedWavePreregistration?.observationWindowMinutes ?? input.observationWindowMinutes ?? null,
    abortThresholds: abort.results,
    killSwitches: Object.fromEntries((input.config.kill_switches ?? []).map((id) => [id, false])),
    slos: input.config.slos,
    evidence,
    packetSha256: '',
  }
  packet.packetSha256 = sha256(JSON.stringify({ ...packet, packetSha256: undefined }))
  return Object.freeze(packet)
}

export function serializePromotionPacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    throw new Error('promotion packet is invalid')
  }
  return Buffer.from(`${JSON.stringify(packet)}\n`)
}

export function verifyPromotionPacket(packet, config) {
  const problems = []
  if (!packet || typeof packet !== 'object') return ['promotion packet is invalid']
  problems.push(...validatePromotionConfig(config, { targetState: packet.toState })
    .map((problem) => `promotion config: ${problem}`))
  if (packet.schemaVersion !== '1.0.0') problems.push('promotion packet schema is invalid')
  if (!PROMOTION_ENVIRONMENTS.has(packet.environment)) problems.push('promotion packet environment is invalid')
  if (!canTransition(config, packet.fromState, packet.toState)) problems.push('promotion packet transition is invalid')
  if (config?.policyId === PLAN55_POLICY_ID && packet.environment !== 'production') {
    problems.push('Plan 55 promotion packet target is invalid')
  }
  if (config?.policyId === PLAN55_POLICY_ID && PLAN55_PREREGISTRATION_REQUIRED_STATES.has(packet.toState)) {
    const preregistration = resolvePlan55PairedWavePreregistration(config)
    if (!preregistration) {
      problems.push('Plan 55 paired-wave preregistration is missing or invalid')
    } else if (preregistration.schemaVersion !== 'plan55-paired-wave-preregistration.v2') {
      problems.push(PLAN55_PAIRED_WAVE_PREREGISTRATION_V2_ERROR)
    } else if (packet.cohort !== preregistration.cohortId ||
      packet.observationWindowMinutes !== preregistration.observationWindowMinutes ||
      packet.pairedWavePreregistrationSha256 !== preregistration.sha256) {
      problems.push('Plan 55 paired-wave context does not match source-locked preregistration')
    }
  }
  if (!/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/.test(packet.releaseId ?? '')) problems.push('promotion release ID is invalid')
  if (REMOTE_STATES.has(packet.toState) && !normalizeApprovalId(packet.humanApprovalId)) {
    problems.push('promotion packet requires explicit human approval')
  }
  for (const field of [
    'releaseBundleSha256', 'evaluationSuiteSha256', 'promptBundleSha256',
    'policyBundleSha256', 'manifestSha256', 'capabilityRegistrySha256',
    'sourceBundleSha256', 'mobileBuildFingerprintSha256', 'edgeBundleSha256',
    'serviceIntakePolicyBundleSha256', 'priceEvidenceBundleSha256',
    'providerReadinessFingerprintSha256',
    'accessMatrixSha256', 'reliabilityPolicySha256', 'promotionPolicySha256',
    'migrationInventorySha256', 'databaseTypesSha256', 'packetSha256',
  ]) {
    if (!/^[0-9a-f]{64}$/.test(packet[field] ?? '')) problems.push(`${field} is invalid`)
  }
  const expected = sha256(JSON.stringify({ ...packet, packetSha256: undefined }))
  if (packet.packetSha256 !== expected) problems.push('promotion packet checksum mismatch')
  if (ROLLBACK_BUNDLE_REQUIRED_STATES.has(packet.toState)) {
    if (!packet.rollbackReleaseId || !packet.rollbackCompatibility) problems.push('promotion packet has no compatible rollback release')
    if (!/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/.test(packet.rollbackReleaseId ?? '')) {
      problems.push('promotion rollback release ID is invalid')
    }
    for (const field of ['releaseBundleSha256', 'migrationInventorySha256', 'databaseTypesSha256']) {
      if (!/^[0-9a-f]{64}$/.test(packet.rollbackCompatibility?.[field] ?? '')) problems.push(`rollbackCompatibility.${field} is invalid`)
    }
  }
  verifyPromotionPolicyBinding(packet, config, problems)
  try { sanitizePromotionEvidence(packet.evidence ?? {}) } catch (error) { problems.push(error.message) }
  return problems
}

export function buildRollbackPacket(input) {
  const failedProblems = checkHarnessRelease(input.failedRelease ?? {})
  if (failedProblems.length) throw new Error(`failed release bundle is invalid: ${failedProblems.join('; ')}`)
  const compatibility = releaseCompatibilityProblems(input.failedRelease, input.rollbackRelease)
  if (compatibility.length) throw new Error(compatibility.join('; '))
  const humanApprovalId = normalizeApprovalId(input.humanApprovalId)
  if (!humanApprovalId) throw new Error('rollback requires human approval')
  if (!input.reasonCode?.trim()) throw new Error('rollback requires a reason code')
  const packet = {
    schemaVersion: '1.0.0',
    rollbackId: input.rollbackId ?? randomUUID(),
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    environment: input.failedRelease.environment,
    failedReleaseId: input.failedRelease.releaseId,
    failedReleaseBundleSha256: input.failedRelease.bundleSha256,
    rollbackReleaseId: input.rollbackRelease.releaseId,
    rollbackReleaseBundleSha256: input.rollbackRelease.bundleSha256,
    migrationInventorySha256: input.rollbackRelease.migrationInventorySha256,
    databaseTypesSha256: input.rollbackRelease.databaseTypesSha256,
    reasonCode: input.reasonCode.trim().slice(0, 120),
    humanApprovalId,
    containmentSwitches: [...new Set(input.containmentSwitches ?? [])].sort(),
    evidence: sanitizePromotionEvidence(input.evidence ?? {}),
    packetSha256: '',
  }
  packet.packetSha256 = sha256(JSON.stringify({ ...packet, packetSha256: undefined }))
  return Object.freeze(packet)
}

function assertEvaluationAlignment(release, evaluation) {
  if (!evaluation?.reportId || evaluation.status !== 'passed') throw new Error('evaluation report is not passing')
  if (evaluation.release?.releaseId !== release.releaseId || evaluation.release?.bundleSha256 !== release.bundleSha256) {
    throw new Error('evaluation release does not match selected release')
  }
  const checks = [
    ['suiteVersion', evaluation.suiteVersion, release.evaluationSuiteVersion],
    ['promptBundleSha256', evaluation.versions?.promptBundleSha256, release.promptBundleSha256],
    ['policyBundleSha256', evaluation.versions?.policyBundleSha256, release.policyBundleSha256],
    ['toolManifestSha256', evaluation.versions?.toolManifestSha256, release.manifestSha256],
    ['capabilityRegistrySha256', evaluation.versions?.capabilityRegistrySha256, release.capabilityRegistrySha256],
  ]
  for (const [field, actual, expected] of checks) if (actual !== expected) throw new Error(`evaluation ${field} does not match selected release`)
}

function verifyPromotionPolicyBinding(packet, config, problems) {
  const policy = config && typeof config === 'object' ? config : {}
  if (policy.policyId === PLAN55_POLICY_ID) {
    if (packet.policyId !== PLAN55_POLICY_ID || packet.policySha256 !== policy.policySha256 ||
        packet.projectRef !== policy.projectRef) {
      problems.push('Plan 55 promotion packet policy binding is invalid')
    }
    const requiredGates = requiredPromotionGates(policy, packet.toState)
    const passedGates = Array.isArray(packet.passedGates) ? packet.passedGates : []
    const expectedGates = [...requiredGates].sort()
    if (new Set(passedGates).size !== passedGates.length ||
        JSON.stringify([...passedGates].sort()) !== JSON.stringify(expectedGates)) {
      problems.push('Plan 55 promotion packet is missing required release gates')
    }
    const gateReceipts = packet.gateReceipts && typeof packet.gateReceipts === 'object' && !Array.isArray(packet.gateReceipts)
      ? packet.gateReceipts
      : {}
    const context = {
      policy,
      release: { environment: packet.environment, releaseId: packet.releaseId, gitSha: packet.gitSha },
      targetState: packet.toState,
    }
    for (const [gate, receipt] of Object.entries(gateReceipts)) {
      if (!isPlan55GateReceiptRecord(receipt, gate, context)) {
        problems.push(`Plan 55 gate evidence receipt is invalid: ${gate}`)
      }
    }
    if (JSON.stringify(Object.keys(gateReceipts).sort()) !== JSON.stringify(expectedGates) ||
        requiredGates.some((gate) => !isPlan55GateReceiptRecord(gateReceipts[gate], gate, context))) {
      problems.push('Plan 55 promotion packet is missing a required source-bound gate receipt')
    }
  } else if (Object.hasOwn(packet, 'policyId') || Object.hasOwn(packet, 'policySha256') ||
      Object.hasOwn(packet, 'projectRef') ||
      Object.hasOwn(packet, 'gateReceipts') || Object.hasOwn(packet, 'passedGates')) {
    problems.push('promotion packet contains Plan 55-only policy fields')
  }
  const expectedSwitches = policy.kill_switches ?? []
  const packetSwitches = packet.killSwitches
  if (!packetSwitches || typeof packetSwitches !== 'object' || Array.isArray(packetSwitches)) {
    problems.push('promotion packet kill switches are invalid')
  } else {
    const actualSwitches = Object.keys(packetSwitches).sort()
    if (JSON.stringify(actualSwitches) !== JSON.stringify([...expectedSwitches].sort())) {
      problems.push('promotion packet kill switches do not match policy')
    }
    for (const id of expectedSwitches) {
      if (typeof packetSwitches[id] !== 'boolean') problems.push(`promotion packet kill switch is invalid: ${id}`)
    }
  }

  if (JSON.stringify(packet.slos ?? []) !== JSON.stringify(policy.slos ?? [])) {
    problems.push('promotion packet SLOs do not match policy')
  }

  const expectedThresholds = policy.abort_thresholds ?? {}
  const results = Array.isArray(packet.abortThresholds) ? packet.abortThresholds : []
  const byMetric = new Map(results.map((result) => [result?.metric, result]))
  if (results.length !== Object.keys(expectedThresholds).length) problems.push('promotion packet abort thresholds do not match policy')
  for (const [metric, threshold] of Object.entries(expectedThresholds)) {
    const result = byMetric.get(metric)
    if (!result || result.threshold !== threshold || result.status !== 'measured' ||
      !Number.isFinite(result.actual) || result.passed !== true || result.actual > threshold) {
      problems.push(`promotion packet abort threshold is invalid: ${metric}`)
    }
  }
}

export function requiredPromotionGates(policy, targetState) {
  if (policy?.policyId !== PLAN55_POLICY_ID) return []
  if (targetState === 'aborted') return []
  if (targetState === 'rolled_back') return [...(policy.requiredGatesByTarget?.rolled_back ?? [])]
  const targetIndex = PLAN55_POLICY_PHASES.indexOf(targetState)
  if (targetIndex < 0) return []
  return [...new Set(PLAN55_POLICY_PHASES.slice(0, targetIndex + 1)
    .flatMap((phase) => policy.requiredGatesByTarget?.[phase] ?? []))]
}

function buildPlan55GateReceiptSet(requiredGates, suppliedReceipts, context) {
  if (requiredGates.length === 0 && suppliedReceipts === undefined) return {}
  assertPlan55GateEvidenceCoverage({
    policy: context.policy,
    targetState: context.targetState,
    requiredGates,
  })
  if (!suppliedReceipts || typeof suppliedReceipts !== 'object' || Array.isArray(suppliedReceipts)) {
    throw new Error('Plan 55 promotion requires a source-bound gate evidence set')
  }
  const expectedGates = [...requiredGates].sort()
  if (JSON.stringify(Object.keys(suppliedReceipts).sort()) !== JSON.stringify(expectedGates)) {
    throw new Error('Plan 55 promotion gate evidence inventory is incomplete or unexpected')
  }
  const receiptSet = {}
  for (const gate of expectedGates) {
    const receipt = suppliedReceipts[gate]
    if (!isPlan55GateReceiptRecord(receipt, gate, context)) {
      throw new Error(`Plan 55 promotion requires a valid source-bound receipt for ${gate}`)
    }
    const safeReceipt = Object.fromEntries(Object.entries(receipt)
      .filter(([key]) => !['evidenceBytes', 'evidencePath'].includes(key)))
    receiptSet[gate] = safeReceipt
  }
  return receiptSet
}

export function buildPlan55PublicationPacketProof(input) {
  const root = resolve(input.root ?? ROOT)
  const policy = loadPlan55ProductionOnlyPolicy(root)
  const release = input.release
  const packetBytes = input.packetBytes
  const runId = String(input.runId ?? '')
  const runAttempt = input.runAttempt
  if (input.policy?.policySha256 !== policy.policySha256 ||
      input.policy?.repository !== policy.repository ||
      input.policy?.projectRef !== policy.projectRef ||
      policy.trustedEvidenceWorkflowPathsByGate?.[PLAN55_PUBLICATION_PACKET_GATE] !==
        PLAN55_PUBLICATION_PACKET_WORKFLOW ||
      !policy.trustedEvidenceWorkflowPaths.includes(PLAN55_PUBLICATION_PACKET_WORKFLOW)) {
    throw new Error('Plan 55 publication proof policy identity is invalid')
  }
  if (!release || checkHarnessRelease(release).length || release.releaseLane !== PLAN55_POLICY_ID ||
      release.environment !== 'production' || !/^[a-f0-9]{40}$/u.test(release.gitSha ?? '') ||
      !Buffer.isBuffer(packetBytes) || packetBytes.length === 0 || packetBytes.length > 16 * 1024 * 1024 ||
      !/^[1-9]\d{0,19}$/u.test(runId) || !Number.isSafeInteger(Number(runId)) ||
      !Number.isSafeInteger(runAttempt) || runAttempt < 1 ||
      input.repository !== policy.repository || input.sourceSha !== release.gitSha ||
      input.githubSha !== release.gitSha || input.githubRef !== 'refs/heads/main' ||
      input.eventName !== 'workflow_dispatch') {
    throw new Error('Plan 55 publication proof producer identity is invalid')
  }

  let packet
  try {
    packet = JSON.parse(packetBytes.toString('utf8'))
  } catch {
    throw new Error('Plan 55 publication packet is invalid JSON')
  }
  if (!packetBytes.equals(Buffer.from(`${JSON.stringify(packet)}\n`)) ||
      packet.environment !== 'production' || packet.fromState !== 'service_cleanup' ||
      packet.toState !== 'receipts_validated' || packet.policyId !== policy.policyId ||
      packet.policySha256 !== policy.policySha256 || packet.projectRef !== policy.projectRef ||
      packet.releaseId !== release.releaseId || packet.gitSha !== release.gitSha ||
      packet.releaseBundleSha256 !== release.bundleSha256 ||
      packet.sourceBundleSha256 !== release.sourceBundleSha256) {
    throw new Error('Plan 55 publication packet identity is invalid')
  }
  const policyProblems = validatePromotionConfig(policy, { root, targetState: 'receipts_validated' })
  const requiredGates = [...requiredPromotionGates(policy, 'receipts_validated')].sort()
  const passedGates = Array.isArray(packet.passedGates) ? [...packet.passedGates].sort() : []
  const gateReceipts = packet.gateReceipts && typeof packet.gateReceipts === 'object' &&
    !Array.isArray(packet.gateReceipts) ? Object.keys(packet.gateReceipts).sort() : []
  if (policyProblems.length ||
      !/^[a-f0-9]{64}$/u.test(packet.packetSha256 ?? '') ||
      packet.packetSha256 !== sha256(JSON.stringify({ ...packet, packetSha256: undefined })) ||
      JSON.stringify(passedGates) !== JSON.stringify(requiredGates) ||
      JSON.stringify(gateReceipts) !== JSON.stringify(requiredGates) ||
      requiredGates.some((gate) => {
        const record = packet.gateReceipts[gate]
        const receipt = record?.receipt
        const receiptJson = receipt && typeof receipt === 'object' && !Array.isArray(receipt)
          ? JSON.stringify(receipt)
          : ''
        return !receiptJson ||
          !/^[a-f0-9]{64}$/u.test(record?.receiptSha256 ?? '') ||
          !/^[a-f0-9]{64}$/u.test(record?.receiptFileSha256 ?? '') ||
          !/^[a-f0-9]{64}$/u.test(record?.evidenceSha256 ?? '') ||
          record.receiptSha256 !== sha256(receiptJson) ||
          record.receiptFileSha256 !== sha256(`${receiptJson}\n`) ||
          record.evidenceSha256 !== receipt.evidence?.sha256 ||
          receipt?.gate !== gate || receipt?.status !== 'PASS' ||
          receipt?.environment !== 'production' || receipt?.projectRef !== policy.projectRef ||
          receipt?.policyId !== policy.policyId || receipt?.policySha256 !== policy.policySha256 ||
          receipt?.releaseId !== release.releaseId || receipt?.sourceSha !== release.gitSha ||
          receipt?.targetState !== 'receipts_validated'
      })) {
    throw new Error('Plan 55 publication packet failed exact-source or gate-inventory verification')
  }

  return Object.freeze({
    schemaVersion: 'plan55-publication-packet-proof.v1',
    gate: PLAN55_PUBLICATION_PACKET_GATE,
    status: 'PASS',
    environment: 'production',
    projectRef: policy.projectRef,
    policyId: policy.policyId,
    policySha256: policy.policySha256,
    releaseId: release.releaseId,
    sourceSha: release.gitSha,
    packetTargetState: packet.toState,
    packetSha256: packet.packetSha256,
    packetFileSha256: sha256(packetBytes),
    producerWorkflowPath: PLAN55_PUBLICATION_PACKET_WORKFLOW,
    producerRunId: runId,
    producerRunAttempt: runAttempt,
    producerGithubRef: input.githubRef,
    producerEvent: input.eventName,
    repository: input.repository,
  })
}

function normalizeApprovalId(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= 120 ? normalized : null
}

export function resolvePlan55PairedWavePreregistration(policy) {
  const preregistration = policy?.pairedWavePreregistration
  if (!preregistration || typeof preregistration !== 'object' || Array.isArray(preregistration)) return null
  const versionOneKeys = ['cohortId', 'observationWindowMinutes', 'schemaVersion']
  const versionTwoKeys = [
    ...versionOneKeys, 'minimumSampleCounts', 'costAttributionSourceId',
  ].sort()
  const expectedKeys = preregistration.schemaVersion === 'plan55-paired-wave-preregistration.v2'
    ? versionTwoKeys
    : versionOneKeys
  if (JSON.stringify(Object.keys(preregistration).sort()) !== JSON.stringify(expectedKeys) ||
      !['plan55-paired-wave-preregistration.v1', 'plan55-paired-wave-preregistration.v2']
        .includes(preregistration.schemaVersion) ||
      typeof preregistration.cohortId !== 'string' || !PLAN55_COHORT_ID.test(preregistration.cohortId) ||
      !Number.isSafeInteger(preregistration.observationWindowMinutes) ||
      preregistration.observationWindowMinutes <= 0) {
    return null
  }
  const normalized = {
    schemaVersion: preregistration.schemaVersion,
    cohortId: preregistration.cohortId,
    observationWindowMinutes: preregistration.observationWindowMinutes,
  }
  if (preregistration.schemaVersion === 'plan55-paired-wave-preregistration.v2') {
    const sampleCountKeys = [
      'eligibleActors', 'requests', 'completedCases', 'latencyObservations', 'costObservations',
    ].sort()
    const sampleCounts = preregistration.minimumSampleCounts
    if (!sampleCounts || typeof sampleCounts !== 'object' || Array.isArray(sampleCounts) ||
        JSON.stringify(Object.keys(sampleCounts).sort()) !== JSON.stringify(sampleCountKeys) ||
        sampleCountKeys.some((key) => !Number.isSafeInteger(sampleCounts[key]) || sampleCounts[key] <= 0) ||
        typeof preregistration.costAttributionSourceId !== 'string' ||
        !/^[a-z][a-z0-9._-]{2,63}$/u.test(preregistration.costAttributionSourceId)) {
      return null
    }
    normalized.minimumSampleCounts = Object.fromEntries(sampleCountKeys.map((key) => [key, sampleCounts[key]]))
    normalized.costAttributionSourceId = preregistration.costAttributionSourceId
  }
  return Object.freeze({ ...normalized, sha256: sha256(JSON.stringify(normalized)) })
}

export function isValidPlan55PairedWaveOutcomeThresholds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !==
        JSON.stringify(Object.keys(PLAN55_PAIRED_WAVE_OUTCOME_THRESHOLDS).sort())) return false
  return value.schemaVersion === PLAN55_PAIRED_WAVE_OUTCOME_THRESHOLDS.schemaVersion &&
    Array.isArray(value.criticalFailureClasses) &&
    JSON.stringify(value.criticalFailureClasses) ===
      JSON.stringify(PLAN55_PAIRED_WAVE_OUTCOME_THRESHOLDS.criticalFailureClasses) &&
    value.criticalFailureMaximum === PLAN55_PAIRED_WAVE_OUTCOME_THRESHOLDS.criticalFailureMaximum &&
    value.errorRateMaximum === PLAN55_PAIRED_WAVE_OUTCOME_THRESHOLDS.errorRateMaximum &&
    value.p95LatencyRegressionMaximum === PLAN55_PAIRED_WAVE_OUTCOME_THRESHOLDS.p95LatencyRegressionMaximum &&
    value.costRegressionMaximum === PLAN55_PAIRED_WAVE_OUTCOME_THRESHOLDS.costRegressionMaximum &&
    value.costAttributionRequired === PLAN55_PAIRED_WAVE_OUTCOME_THRESHOLDS.costAttributionRequired &&
    value.missingMetricBehavior === PLAN55_PAIRED_WAVE_OUTCOME_THRESHOLDS.missingMetricBehavior
}

function plan55OutcomeThresholdsMatchAbortPolicy(policy) {
  const thresholds = policy?.pairedWaveOutcomeThresholds
  const abortThresholds = policy?.abort_thresholds
  const metricByClass = {
    safety: 'critical_safety_failures',
    authorization: 'authorization_bypass_failures',
    confirmation: 'confirmation_bypass_failures',
  }
  const expected = Object.fromEntries([
    ...thresholds.criticalFailureClasses.map((failureClass) => [
      metricByClass[failureClass], thresholds.criticalFailureMaximum,
    ]),
    ['error_rate', thresholds.errorRateMaximum],
    ['p95_latency_regression', thresholds.p95LatencyRegressionMaximum],
    ['cost_regression', thresholds.costRegressionMaximum],
  ])
  if (!abortThresholds || typeof abortThresholds !== 'object' || Array.isArray(abortThresholds) ||
      JSON.stringify(Object.keys(abortThresholds).sort()) !== JSON.stringify(Object.keys(expected).sort())) {
    return false
  }
  return Object.entries(expected).every(([metric, threshold]) => abortThresholds[metric] === threshold)
}

function optionalArgument(name) {
  const indexes = process.argv.flatMap((argument, index) => argument === name ? [index] : [])
  if (indexes.length > 1) throw new Error(`promotion command accepts ${name} only once`)
  if (indexes.length === 0) return undefined
  const value = process.argv[indexes[0] + 1]
  if (typeof value !== 'string' || !value || value.startsWith('--')) {
    throw new Error(`promotion command requires a value after ${name}`)
  }
  return value
}

function optionalPositiveSafeIntegerArgument(name) {
  const value = optionalArgument(name)
  if (value === undefined) return undefined
  if (!/^[1-9]\d*$/u.test(value)) throw new Error(`promotion command requires a positive integer after ${name}`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`promotion command requires a positive integer after ${name}`)
  return parsed
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan55Mode = process.argv.includes('--plan55') || process.argv.includes('--check-plan55')
  const config = plan55Mode
    ? loadPlan55ProductionOnlyPolicy(ROOT)
    : JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  const checkOnly = process.argv.includes('--check') || process.argv.includes('--check-plan55')
  if (checkOnly) {
    const problems = validatePromotionConfig(config, { root: ROOT })
    if (problems.length) {
      for (const problem of problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    } else console.log(`${config.policyId ?? 'standard'} promotion policy ok: ${config.states.length} states, ${config.kill_switches.length} kill switches, ${config.slos.length} SLOs`)
  } else {
    const releasePath = argumentPath('--release', RELEASE_PATH)
    const evaluationPath = argumentPath('--evaluation', EVALUATION_PATH)
    const outputPath = argumentPath('--output', OUTPUT_PATH, { mustExist: false })
    const release = readJson(releasePath, 'release bundle')
    const evaluation = readJson(evaluationPath, 'evaluation report')
    const fromIndex = process.argv.indexOf('--from')
    const toIndex = process.argv.indexOf('--to')
    const approvalIndex = process.argv.indexOf('--approval')
    const rollbackIndex = process.argv.indexOf('--rollback-release')
    const rollbackRelease = rollbackIndex >= 0
      ? readJson(argumentPath('--rollback-release'), 'rollback release bundle')
      : null
    const passedGatesIndex = process.argv.indexOf('--passed-gates')
    const gateReceiptsIndex = process.argv.indexOf('--gate-receipts')
    let passedGates = passedGatesIndex >= 0
      ? readJson(argumentPath('--passed-gates'), 'passed-gates list')
      : undefined
    const currentState = fromIndex >= 0 ? process.argv[fromIndex + 1] : 'assembled'
    const targetState = toIndex >= 0 ? process.argv[toIndex + 1] : 'verified'
    const cohort = optionalArgument('--cohort')
    const observationWindowMinutes = optionalPositiveSafeIntegerArgument('--observation-window-minutes')
    if ((plan55Mode && (cohort !== undefined || observationWindowMinutes !== undefined)) ||
        (!plan55Mode || !PLAN55_PAIRED_WAVE_STATES.has(targetState)) &&
        (cohort !== undefined || observationWindowMinutes !== undefined)) {
      throw new Error(plan55Mode
        ? 'Plan 55 paired-wave values must not be supplied by the caller'
        : 'paired-wave context is only accepted for Plan 55 paired-wave targets')
    }
    const requiredGates = requiredPromotionGates(config, targetState)
    let gateReceipts
    if (plan55Mode) {
      if (requiredGates.length === 0) gateReceipts = {}
      else {
        if (gateReceiptsIndex < 0 || !process.argv[gateReceiptsIndex + 1]) {
          throw new Error('Plan 55 promotion requires --gate-receipts evidence manifest')
        }
        gateReceipts = loadPlan55GateEvidenceSet(argumentPath('--gate-receipts'), {
          policy: config,
          release,
          targetState,
          requiredGates,
        })
        await verifyPlan55GitHubArtifactProvenance(gateReceipts, {
          repository: config.repository,
          trustedEvidenceWorkflowPaths: config.trustedEvidenceWorkflowPaths,
          trustedEvidenceWorkflowPathsByGate: config.trustedEvidenceWorkflowPathsByGate,
          sourceSha: release.gitSha,
          token: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN,
        })
      }
      passedGates ??= Object.keys(gateReceipts)
    } else {
      gateReceipts = gateReceiptsIndex >= 0
        ? readJson(argumentPath('--gate-receipts'), 'gate receipts')
        : undefined
    }
    const packet = buildPromotionPacket({
      root: ROOT,
      config,
      release,
      evaluation,
      environment: release.environment,
      currentState,
      targetState,
      humanApprovalId: approvalIndex >= 0 ? process.argv[approvalIndex + 1] : null,
      rollbackRelease,
      passedGates,
      gateReceipts,
      cohort,
      observationWindowMinutes,
    })
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, serializePromotionPacket(packet))
    console.log(`${packet.packetId} ${outputPath}`)
  }
}

function argumentPath(name, fallback, { mustExist = true } = {}) {
  const index = process.argv.indexOf(name)
  if (index < 0 && fallback) return resolvePromotionPath(fallback, { mustExist })
  const value = index >= 0 ? process.argv[index + 1] : null
  if (typeof value !== 'string' || !value || value.startsWith('--')) {
    throw new Error(`promotion command requires a path after ${name}`)
  }
  try {
    return resolvePromotionPath(value, { mustExist })
  } catch {
    throw new Error(`promotion path is missing, invalid, or outside the repository: ${name}`)
  }
}

export function resolvePromotionPath(value, { root = ROOT, mustExist = true } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('promotion path is invalid')
  }
  const repositoryRoot = realpathSync(root)
  const candidate = resolve(repositoryRoot, value)
  assertPromotionPathWithin(repositoryRoot, candidate)

  if (mustExist) {
    const canonical = realpathSync(candidate)
    assertPromotionPathWithin(repositoryRoot, canonical)
    if (!statSync(canonical).isFile()) throw new Error('promotion input is not a file')
    return canonical
  }

  let parent = dirname(candidate)
  const missingParts = []
  while (true) {
    let parentEntry
    try {
      parentEntry = lstatSync(parent)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const nextParent = dirname(parent)
      if (nextParent === parent) throw new Error('promotion output parent is invalid')
      missingParts.unshift(parent.slice(nextParent.length + 1))
      parent = nextParent
      continue
    }
    const canonicalParent = realpathSync(parent)
    assertPromotionPathWithin(repositoryRoot, canonicalParent)
    if (!parentEntry.isDirectory() && !statSync(canonicalParent).isDirectory()) {
      throw new Error('promotion output parent is not a directory')
    }
    const resolvedParent = resolve(canonicalParent, ...missingParts)
    const outputPath = resolve(resolvedParent, candidate.slice(dirname(candidate).length + 1))
    try {
      const outputEntry = lstatSync(outputPath)
      if (outputEntry.isSymbolicLink()) throw new Error('promotion output must not be a symbolic link')
      const canonicalOutput = realpathSync(outputPath)
      assertPromotionPathWithin(repositoryRoot, canonicalOutput)
      if (!statSync(canonicalOutput).isFile()) throw new Error('promotion output is not a file')
      return canonicalOutput
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      return outputPath
    }
  }
}

function assertPromotionPathWithin(root, candidate) {
  const fromRoot = relative(root, candidate)
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error('promotion path is outside the repository')
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`promotion ${label} is missing or invalid JSON`)
  }
}
