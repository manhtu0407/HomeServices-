import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkHarnessRelease } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CONFIG_PATH = resolve(ROOT, 'config/harness/promotion.json')
const RELEASE_PATH = resolve(ROOT, 'artifacts/harness/release-manifest.json')
const EVALUATION_PATH = resolve(ROOT, 'artifacts/harness/evaluation-report.json')
const OUTPUT_PATH = resolve(ROOT, 'artifacts/harness/promotion-packet.json')
const REMOTE_STATES = new Set(['staging', 'shadow', 'canary', 'production', 'aborted', 'rolled_back'])
const ROLLBACK_REQUIRED_STATES = new Set(['canary', 'production', 'rolled_back'])
const SENSITIVE_KEY = /token|secret|password|authorization|cookie|credential|api[_-]?key|service[_-]?role|email|phone|address|description|content|prompt|image|audio|transcript|latitude|longitude|cccd|bank/iu
const SENSITIVE_VALUE = /(?:bearer\s+[a-z0-9._~-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})/u

export function validatePromotionConfig(config, options = {}) {
  const problems = []
  if (!config || typeof config !== 'object') return ['promotion config must be an object']
  if (!/^\d+\.\d+\.\d+$/.test(config.version ?? '')) problems.push('promotion version is invalid')
  if (!Array.isArray(config.states) || !config.states.length) problems.push('promotion states must be non-empty')
  const states = new Set(config.states ?? [])
  if (states.size !== (config.states ?? []).length) problems.push('promotion states contain duplicates')
  for (const required of ['assembled', 'verified', 'staging', 'shadow', 'canary', 'production', 'aborted', 'rolled_back']) {
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
  assertEvaluationAlignment(input.release, input.evaluation)
  if (input.environment !== input.release.environment) throw new Error('release environment does not match promotion environment')
  if (REMOTE_STATES.has(input.targetState) && !input.humanApprovalId) throw new Error('remote promotion requires explicit human approval')
  if (!canTransition(input.config, input.currentState, input.targetState)) throw new Error(`promotion transition is not allowed: ${input.currentState}->${input.targetState}`)
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
    environment: input.environment,
    fromState: input.currentState,
    toState: input.targetState,
    evaluationReportId: input.evaluation.reportId,
    evaluationSuiteVersion: input.release.evaluationSuiteVersion,
    evaluationSuiteSha256: input.release.evaluationSuiteSha256,
    promptBundleSha256: input.release.promptBundleSha256,
    policyBundleSha256: input.release.policyBundleSha256,
    manifestSha256: input.release.manifestSha256,
    capabilityRegistrySha256: input.release.capabilityRegistrySha256,
    accessMatrixSha256: input.release.accessMatrixSha256,
    reliabilityPolicySha256: input.release.reliabilityPolicySha256,
    promotionPolicySha256: input.release.promotionPolicySha256,
    migrationInventorySha256: input.release.migrationInventorySha256,
    databaseTypesSha256: input.release.databaseTypesSha256,
    edgeFunctions: input.release.edgeFunctions,
    humanApprovalId: input.humanApprovalId ?? null,
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
  if (packet.schemaVersion !== '1.0.0') problems.push('promotion packet schema is invalid')
  if (!canTransition(config, packet.fromState, packet.toState)) problems.push('promotion packet transition is invalid')
  if (!/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/.test(packet.releaseId ?? '')) problems.push('promotion release ID is invalid')
  for (const field of [
    'releaseBundleSha256', 'evaluationSuiteSha256', 'promptBundleSha256',
    'policyBundleSha256', 'manifestSha256', 'capabilityRegistrySha256',
    'accessMatrixSha256', 'reliabilityPolicySha256', 'promotionPolicySha256',
    'migrationInventorySha256', 'databaseTypesSha256', 'packetSha256',
  ]) {
    if (!/^[0-9a-f]{64}$/.test(packet[field] ?? '')) problems.push(`${field} is invalid`)
  }
  const expected = sha256(JSON.stringify({ ...packet, packetSha256: undefined }))
  if (packet.packetSha256 !== expected) problems.push('promotion packet checksum mismatch')
  if (ROLLBACK_REQUIRED_STATES.has(packet.toState)) {
    if (!packet.rollbackReleaseId || !packet.rollbackCompatibility) problems.push('promotion packet has no compatible rollback release')
    for (const field of ['releaseBundleSha256', 'migrationInventorySha256', 'databaseTypesSha256']) {
      if (!/^[0-9a-f]{64}$/.test(packet.rollbackCompatibility?.[field] ?? '')) problems.push(`rollbackCompatibility.${field} is invalid`)
    }
  }
  if ((packet.abortThresholds ?? []).some((result) => result.passed !== true)) problems.push('promotion packet contains a failed abort threshold')
  try { sanitizePromotionEvidence(packet.evidence ?? {}) } catch (error) { problems.push(error.message) }
  return problems
}

export function buildRollbackPacket(input) {
  const failedProblems = checkHarnessRelease(input.failedRelease ?? {})
  if (failedProblems.length) throw new Error(`failed release bundle is invalid: ${failedProblems.join('; ')}`)
  const compatibility = releaseCompatibilityProblems(input.failedRelease, input.rollbackRelease)
  if (compatibility.length) throw new Error(compatibility.join('; '))
  if (!input.humanApprovalId) throw new Error('rollback requires human approval')
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
    humanApprovalId: input.humanApprovalId,
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  const checkOnly = process.argv.includes('--check')
  if (checkOnly) {
    const problems = validatePromotionConfig(config, { root: ROOT })
    if (problems.length) {
      for (const problem of problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    } else console.log(`promotion policy ok: ${config.states.length} states, ${config.kill_switches.length} kill switches, ${config.slos.length} SLOs`)
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
    })
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(packet, null, 2)}\n`)
    console.log(`${packet.packetId} ${OUTPUT_PATH}`)
  }
}
