import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkHarnessRelease } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CONFIG_PATH = resolve(ROOT, 'config/harness/promotion.json')
const PLAN55_POLICY_RELATIVE_PATH = 'config/harness/plan55-production-only-policy.json'
const PLAN55_POLICY_ID = 'plan55-production-only'
const RELEASE_PATH = resolve(ROOT, 'artifacts/harness/release-manifest.json')
const EVALUATION_PATH = resolve(ROOT, 'artifacts/harness/evaluation-report.json')
const OUTPUT_PATH = resolve(ROOT, 'artifacts/harness/promotion-packet.json')
const REMOTE_STATES = new Set([
  'staging', 'shadow', 'canary', 'production', 'aborted', 'rolled_back',
  'guard_deployed_off', 'service_canary', 'service_cleanup', 'receipts_validated',
  'paired_wave_1', 'paired_wave_2', 'paired_wave_3',
])
const ROLLBACK_REQUIRED_STATES = new Set([
  'canary', 'production', 'rolled_back', 'guard_deployed_off', 'service_canary',
  'service_cleanup', 'receipts_validated', 'paired_wave_1', 'paired_wave_2', 'paired_wave_3',
])
const PROMOTION_ENVIRONMENTS = new Set(['preview', 'staging', 'production'])
const PLAN55_STATES = Object.freeze([
  'assembled', 'verified', 'guard_deployed_off', 'service_canary', 'service_cleanup',
  'receipts_validated', 'paired_wave_1', 'paired_wave_2', 'paired_wave_3', 'production',
  'aborted', 'rolled_back',
])
const PLAN55_TRANSITIONS = Object.freeze([
  ['assembled', 'verified'], ['verified', 'guard_deployed_off'], ['verified', 'aborted'],
  ['guard_deployed_off', 'service_canary'], ['guard_deployed_off', 'aborted'],
  ['service_canary', 'service_cleanup'], ['service_canary', 'aborted'],
  ['service_cleanup', 'service_canary'], ['service_cleanup', 'receipts_validated'], ['service_cleanup', 'aborted'],
  ['receipts_validated', 'paired_wave_1'], ['receipts_validated', 'aborted'],
  ['paired_wave_1', 'paired_wave_2'], ['paired_wave_1', 'aborted'],
  ['paired_wave_2', 'paired_wave_3'], ['paired_wave_2', 'aborted'],
  ['paired_wave_3', 'production'], ['paired_wave_3', 'aborted'],
  ['production', 'rolled_back'], ['aborted', 'rolled_back'],
])
const PLAN55_SERVICES = Object.freeze(['hvac', 'handyman', 'cleaning', 'upholstery', 'plumbing', 'electrical'])
const PLAN55_POLICY_PHASES = Object.freeze([
  'verified', 'guard_deployed_off', 'service_canary', 'service_cleanup', 'receipts_validated',
  'paired_wave_1', 'paired_wave_2', 'paired_wave_3', 'production',
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
  if (plan55) problems.push(...validatePlan55Policy(config))
  return problems
}

function validatePlan55Policy(policy) {
  const problems = []
  if (policy.schemaVersion !== 'plan55-production-only-policy.v1' ||
      policy.environment !== 'production' || policy.projectRef !== 'iwevizmsedyqozxlawwl' ||
      policy.releaseLane !== PLAN55_POLICY_ID) {
    problems.push('Plan 55 policy target or schema is invalid')
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
      verified: ['plan55-production-source-merge', 'plan55-exact-production-base-ancestry', 'workspace-typecheck', 'workspace-tests', 'workspace-build', 'security', 'harness', 'edge-deno', 'sql-verification', 'generated-types', 'hosted-drift-baseline', 'production-ui-normality', 'compatible-rollback-target', 'plan55-production-target-attestation', 'plan55-actor-scoped-guard-tests', 'plan55-canary-runner-tests', 'plan55-source-lock', 'plan55-independent-holdout-freeze', 'plan55-rollback-preflight'],
      guard_deployed_off: ['plan55-runtime-source-match', 'plan55-guard-deployed', 'plan55-all-global-flags-off', 'plan55-provider-readiness', 'plan55-no-migration'],
      service_canary: ['plan55-auth-admin-verified', 'plan55-synthetic-actor-created', 'plan55-actor-scope-verified', 'plan55-disposable-worker-isolated'],
      service_cleanup: ['plan55-service-slice-integrity-pass', 'plan55-service-g5-safety-pass', 'plan55-service-cleanup-pass'],
      receipts_validated: ['plan55-six-current-source-receipts', 'plan55-six-cleanup-passes', 'plan55-independent-cohort-outcome'],
      paired_wave_1: ['plan55-docker-sql-edge-gates', 'plan55-hosted-drift-pass', 'plan55-full-production-readiness', 'plan55-exact-binary-release-attestation', 'plan55-publication-packet', 'plan55-rollback-drill'],
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
    }
  }
  if (typeof policy.policySha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(policy.policySha256)) {
    problems.push('Plan 55 policy digest is invalid')
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
  const configProblems = validatePromotionConfig(input.config, { root: input.root })
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
  const requiredGates = requiredPromotionGates(input.config, input.targetState)
  const passedGates = input.passedGates ?? []
  for (const gate of requiredGates) {
    if (!passedGates.includes(gate)) throw new Error(`missing required release gate: ${gate}`)
  }
  const plan55GateReceipts = input.config.policyId === PLAN55_POLICY_ID
    ? buildPlan55GateReceiptSet(requiredGates, input.gateReceipts)
    : null
  const abort = evaluateAbortThresholds(input.config, input.metrics ?? input.evaluation.metrics ?? {})
  if (!abort.passed) throw new Error(`promotion abort threshold failed: ${abort.failures.map((failure) => failure.metric).join(', ')}`)

  const rollbackRelease = input.rollbackRelease ?? null
  if (ROLLBACK_REQUIRED_STATES.has(input.targetState)) {
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
      passedGates: [...requiredGates].sort(),
      gateReceipts: plan55GateReceipts,
    } : {}),
    rollbackReleaseId: rollbackRelease?.releaseId ?? null,
    rollbackCompatibility: rollbackRelease ? {
      releaseBundleSha256: rollbackRelease.bundleSha256,
      migrationInventorySha256: rollbackRelease.migrationInventorySha256,
      databaseTypesSha256: rollbackRelease.databaseTypesSha256,
    } : null,
    cohort: input.cohort ?? null,
    observationWindowMinutes: input.observationWindowMinutes ?? null,
    abortThresholds: abort.results,
    killSwitches: Object.fromEntries((input.config.kill_switches ?? []).map((id) => [id, false])),
    slos: input.config.slos,
    evidence,
    packetSha256: '',
  }
  packet.packetSha256 = sha256(JSON.stringify({ ...packet, packetSha256: undefined }))
  return Object.freeze(packet)
}

export function verifyPromotionPacket(packet, config) {
  const problems = []
  if (!packet || typeof packet !== 'object') return ['promotion packet is invalid']
  problems.push(...validatePromotionConfig(config).map((problem) => `promotion config: ${problem}`))
  if (packet.schemaVersion !== '1.0.0') problems.push('promotion packet schema is invalid')
  if (!PROMOTION_ENVIRONMENTS.has(packet.environment)) problems.push('promotion packet environment is invalid')
  if (!canTransition(config, packet.fromState, packet.toState)) problems.push('promotion packet transition is invalid')
  if (config?.policyId === PLAN55_POLICY_ID && packet.environment !== 'production') {
    problems.push('Plan 55 promotion packet target is invalid')
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
  if (ROLLBACK_REQUIRED_STATES.has(packet.toState)) {
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
    if (packet.policyId !== PLAN55_POLICY_ID || packet.policySha256 !== policy.policySha256) {
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
    for (const [gate, digest] of Object.entries(gateReceipts)) {
      if (!/^[0-9a-f]{64}$/u.test(digest ?? '')) problems.push(`Plan 55 gate receipt digest is invalid: ${gate}`)
    }
    if (JSON.stringify(Object.keys(gateReceipts).sort()) !== JSON.stringify(expectedGates) ||
        requiredGates.some((gate) => !/^[0-9a-f]{64}$/u.test(gateReceipts[gate] ?? ''))) {
      problems.push('Plan 55 promotion packet is missing a required gate receipt digest')
    }
  } else if (Object.hasOwn(packet, 'policyId') || Object.hasOwn(packet, 'policySha256') ||
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

function requiredPromotionGates(policy, targetState) {
  if (policy?.policyId !== PLAN55_POLICY_ID) return []
  if (targetState === 'aborted') return []
  if (targetState === 'rolled_back') return [...(policy.requiredGatesByTarget?.rolled_back ?? [])]
  const targetIndex = PLAN55_POLICY_PHASES.indexOf(targetState)
  if (targetIndex < 0) return []
  return [...new Set(PLAN55_POLICY_PHASES.slice(0, targetIndex + 1)
    .flatMap((phase) => policy.requiredGatesByTarget?.[phase] ?? []))]
}

function buildPlan55GateReceiptSet(requiredGates, suppliedReceipts) {
  if (!suppliedReceipts || typeof suppliedReceipts !== 'object' || Array.isArray(suppliedReceipts)) {
    throw new Error('Plan 55 promotion requires checksum-bound gate receipts')
  }
  const receiptSet = {}
  for (const gate of requiredGates) {
    const digest = suppliedReceipts[gate]
    if (!/^[0-9a-f]{64}$/u.test(digest ?? '')) {
      throw new Error(`Plan 55 promotion requires a valid receipt digest for ${gate}`)
    }
    receiptSet[gate] = digest
  }
  return receiptSet
}

function normalizeApprovalId(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= 120 ? normalized : null
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
    const release = JSON.parse(readFileSync(RELEASE_PATH, 'utf8'))
    const evaluation = JSON.parse(readFileSync(EVALUATION_PATH, 'utf8'))
    const fromIndex = process.argv.indexOf('--from')
    const toIndex = process.argv.indexOf('--to')
    const approvalIndex = process.argv.indexOf('--approval')
    const rollbackIndex = process.argv.indexOf('--rollback-release')
    const rollbackRelease = rollbackIndex >= 0
      ? JSON.parse(readFileSync(resolve(ROOT, process.argv[rollbackIndex + 1]), 'utf8'))
      : null
    const passedGatesIndex = process.argv.indexOf('--passed-gates')
    const gateReceiptsIndex = process.argv.indexOf('--gate-receipts')
    const passedGates = passedGatesIndex >= 0
      ? JSON.parse(readFileSync(resolve(ROOT, process.argv[passedGatesIndex + 1]), 'utf8'))
      : undefined
    const gateReceipts = gateReceiptsIndex >= 0
      ? JSON.parse(readFileSync(resolve(ROOT, process.argv[gateReceiptsIndex + 1]), 'utf8'))
      : undefined
    const packet = buildPromotionPacket({
      root: ROOT,
      config,
      release,
      evaluation,
      environment: release.environment,
      currentState: fromIndex >= 0 ? process.argv[fromIndex + 1] : 'assembled',
      targetState: toIndex >= 0 ? process.argv[toIndex + 1] : 'verified',
      humanApprovalId: approvalIndex >= 0 ? process.argv[approvalIndex + 1] : null,
      rollbackRelease,
      passedGates,
      gateReceipts,
    })
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(packet, null, 2)}\n`)
    console.log(`${packet.packetId} ${OUTPUT_PATH}`)
  }
}
