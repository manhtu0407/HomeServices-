import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const POLICY_PATH = 'config/harness/evaluation.json'
const LIVE_CLASSES = new Set(['live_shadow', 'production_observation'])
const ALL_CLASSES = new Set(['static', 'deterministic', 'simulation', ...LIVE_CLASSES])
const repoPath = (value) => value.split(sep).join('/')

export function resolveHarnessEvaluationPath(rootInput, pathInput, label) {
  if (typeof pathInput !== 'string' || !pathInput.trim()) throw new Error(`${label} requires a path`)
  const root = resolve(rootInput)
  const target = resolve(root, pathInput)
  const relativePath = relative(root, target)
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`${label} must stay inside the repository root`)
  }
  return target
}

export function evaluateHarnessEvidence(input) {
  const policy = input.policy
  const report = input.report
  const baseline = input.baseline ?? null
  const problems = validateReport(policy, report)
  const metrics = normalizeMetrics(report.metrics)
  const critical = evaluateCriticalGates(policy, metrics)
  const ratchets = evaluateRatchets(policy, metrics, baseline?.metrics ?? null)
  problems.push(...critical.filter((gate) => !gate.passed).map((gate) => `critical gate failed: ${gate.metric}`))
  problems.push(...ratchets.filter((gate) => !gate.passed).map((gate) => `ratchet failed: ${gate.metric}`))
  if (input.requireLive === true && !LIVE_CLASSES.has(report.evidenceClass)) {
    problems.push('live evidence is required for this release')
  }
  const verdict = {
    schemaVersion: '1.0.0',
    verdictId: stableId('eval-verdict', {
      reportId: report.reportId,
      policyVersion: policy.suite_version,
      baselineId: baseline?.reportId ?? null,
    }),
    reportId: report.reportId,
    baselineReportId: baseline?.reportId ?? null,
    releaseId: report.releaseId,
    gitSha: report.gitSha,
    policyVersion: policy.suite_version,
    evaluator: report.evaluator,
    evidenceClass: report.evidenceClass,
    liveEvidence: LIVE_CLASSES.has(report.evidenceClass),
    sampleCount: report.sampleCount,
    metrics,
    criticalGates: critical,
    ratchets,
    passed: problems.length === 0,
    problems,
  }
  return Object.freeze(verdict)
}

export function buildEvaluationReport(input) {
  const samples = input.samples ?? []
  const metrics = input.metrics ?? deriveMetrics(samples)
  return {
    schemaVersion: '1.0.0',
    reportId: input.reportId ?? randomUUID(),
    releaseId: input.releaseId,
    gitSha: input.gitSha,
    promptBundleSha256: input.promptBundleSha256,
    policyBundleSha256: input.policyBundleSha256,
    evidenceClass: input.evidenceClass,
    evaluator: input.evaluator,
    modelBindings: input.modelBindings ?? [],
    sampleCount: samples.length || input.sampleCount || 0,
    samples,
    metrics,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

export function deriveMetrics(samples) {
  if (!samples.length) return {}
  const success = samples.filter((sample) => sample.success === true).length
  const safety = samples.filter((sample) => sample.criticalSafetyFailure !== true).length
  const toolCorrect = samples.filter((sample) => sample.toolCallCorrect !== false).length
  const authorizationFailures = samples.filter((sample) => sample.authorizationBypass === true).length
  const confirmationFailures = samples.filter((sample) => sample.confirmationBypass === true).length
  const latencies = samples.map((sample) => Number(sample.latencyMs ?? 0)).filter(Number.isFinite).sort((a, b) => a - b)
  const costs = samples.map((sample) => Number(sample.costUsd ?? 0)).filter(Number.isFinite)
  return {
    success_rate: success / samples.length,
    safety_rate: safety / samples.length,
    tool_call_accuracy: toolCorrect / samples.length,
    critical_safety_failures: samples.length - safety,
    authorization_bypass_failures: authorizationFailures,
    confirmation_bypass_failures: confirmationFailures,
    p95_latency_ms: percentile(latencies, 0.95),
    mean_cost_usd: costs.reduce((sum, value) => sum + value, 0) / Math.max(costs.length, 1),
  }
}

export function requiresLiveEvaluation(changedPaths) {
  const sensitivePrefixes = [
    'packages/shared/kael/charter/',
    'supabase/functions/mobile-api/_shared/kael/prompts/',
    'supabase/functions/mobile-api/_shared/kael/kael-providers/',
    'supabase/functions/mobile-api/_shared/kael/tools/',
    'config/harness/manifest.json',
  ]
  return changedPaths.some((path) => sensitivePrefixes.some((prefix) => path === prefix || path.startsWith(prefix)))
}

function validateReport(policy, report) {
  const problems = []
  if (!report || typeof report !== 'object') return ['evaluation report must be an object']
  if (report.schemaVersion !== '1.0.0') problems.push('evaluation report schema version is invalid')
  if (!isUuid(report.reportId)) problems.push('evaluation report ID is invalid')
  if (!/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(report.releaseId ?? '')) problems.push('evaluation release ID is invalid')
  if (!/^[0-9a-f]{40}$/u.test(report.gitSha ?? '')) problems.push('evaluation git SHA is invalid')
  for (const field of ['promptBundleSha256', 'policyBundleSha256']) {
    if (!/^[0-9a-f]{64}$/u.test(report[field] ?? '')) problems.push(`${field} is invalid`)
  }
  if (!ALL_CLASSES.has(report.evidenceClass)) problems.push('evaluation evidence class is invalid')
  const evaluator = policy.evaluators.find((candidate) => candidate.id === report.evaluator?.id)
  if (!evaluator || evaluator.version !== report.evaluator?.version || evaluator.kind !== report.evaluator?.kind) {
    problems.push('evaluation evaluator identity is not registered')
  }
  const isLive = LIVE_CLASSES.has(report.evidenceClass)
  if (isLive && report.evaluator?.kind !== 'live') problems.push('live evidence must use a live evaluator')
  if (!isLive && report.evaluator?.kind === 'live') problems.push('deterministic evidence cannot label itself live')
  if (!Number.isInteger(report.sampleCount) || report.sampleCount < 0) problems.push('evaluation sample count is invalid')
  if (!Array.isArray(report.samples)) problems.push('evaluation samples must be an array')
  else if (report.samples.length !== report.sampleCount) problems.push('evaluation sample count does not match samples')
  if (isLive && report.sampleCount < policy.repeated_samples.minimum) problems.push('live evaluation has too few repeated samples')
  if (isLive && Array.isArray(report.samples)) {
    for (const [index, sample] of report.samples.entries()) {
      if (!sample.provider || !sample.modelResolved || !isUuid(sample.providerAttemptId)) problems.push(`live sample ${index} is missing provider identity`)
      if (!isUuid(sample.traceId) || !isUuid(sample.runId)) problems.push(`live sample ${index} is missing trace lineage`)
      if (sample.releaseId !== report.releaseId) problems.push(`live sample ${index} release does not match report`)
      if (!Number.isFinite(sample.latencyMs) || sample.latencyMs < 0 || !Number.isFinite(sample.costUsd) || sample.costUsd < 0) problems.push(`live sample ${index} is missing latency or cost`)
    }
  }
  if (!Array.isArray(report.modelBindings)) problems.push('evaluation model bindings must be an array')
  if (!Number.isFinite(Date.parse(report.createdAt ?? ''))) problems.push('evaluation createdAt is invalid')
  return problems
}

function evaluateCriticalGates(policy, metrics) {
  return policy.critical_gates.map((gate) => ({
    ...gate,
    actual: metrics[gate.metric] ?? null,
    passed: compare(metrics[gate.metric], gate.operator, gate.value),
  }))
}

function evaluateRatchets(policy, metrics, baselineMetrics) {
  return policy.ratchets.map((ratchet) => {
    const actual = metrics[ratchet.metric]
    if (!baselineMetrics) {
      return {
        ...ratchet,
        actual: Number.isFinite(actual) ? actual : null,
        baseline: null,
        regression: null,
        passed: Number.isFinite(actual),
        status: 'initial_baseline',
      }
    }
    const baseline = baselineMetrics[ratchet.metric]
    if (!Number.isFinite(actual) || !Number.isFinite(baseline)) {
      return {
        ...ratchet,
        actual: Number.isFinite(actual) ? actual : null,
        baseline: Number.isFinite(baseline) ? baseline : null,
        passed: false,
        status: 'metric_missing',
      }
    }
    const lowerIsBetter = /latency|cost|failure|error/u.test(ratchet.metric)
    const denominator = Math.max(Math.abs(baseline), 1e-9)
    const regression = lowerIsBetter ? (actual - baseline) / denominator : (baseline - actual) / denominator
    return {
      ...ratchet,
      actual,
      baseline,
      regression,
      passed: regression <= ratchet.max_regression,
      status: 'measured',
    }
  })
}

function normalizeMetrics(metrics) {
  const result = {}
  for (const [key, value] of Object.entries(metrics ?? {})) if (Number.isFinite(value)) result[key] = Number(value)
  return result
}

function compare(actual, operator, expected) {
  if (!Number.isFinite(actual)) return false
  if (operator === 'eq') return actual === expected
  if (operator === 'gte') return actual >= expected
  if (operator === 'lte') return actual <= expected
  return false
}

function percentile(values, fraction) {
  if (!values.length) return 0
  return values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]
}

function stableId(prefix, value) {
  return `${prefix}-${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24)}`
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value ?? '')
}

export function parseHarnessEvaluationArgs(values) {
  const options = { requireLive: false }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    const readValue = () => {
      const next = values[index + 1]
      if (typeof next !== 'string' || !next.trim() || next.startsWith('--')) {
        throw new Error(`${value} requires a value`)
      }
      index += 1
      return next
    }
    if (value === '--report') options.reportPath = readValue()
    else if (value === '--baseline') options.baselinePath = readValue()
    else if (value === '--output') options.outputPath = readValue()
    else if (value === '--require-live') options.requireLive = true
    else throw new Error(`unknown argument: ${value}`)
  }
  return options
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseHarnessEvaluationArgs(process.argv.slice(2))
    if (!options.reportPath) throw new Error('--report is required')
    const policy = JSON.parse(readFileSync(resolve(ROOT, POLICY_PATH), 'utf8'))
    const report = JSON.parse(readFileSync(resolveHarnessEvaluationPath(ROOT, options.reportPath, 'evaluation report'), 'utf8'))
    const baselinePath = options.baselinePath
      ? resolveHarnessEvaluationPath(ROOT, options.baselinePath, 'evaluation baseline')
      : null
    const baseline = baselinePath && existsSync(baselinePath)
      ? JSON.parse(readFileSync(baselinePath, 'utf8'))
      : null
    const verdict = evaluateHarnessEvidence({ policy, report, baseline, requireLive: options.requireLive })
    if (options.outputPath) {
      const output = resolveHarnessEvaluationPath(ROOT, options.outputPath, 'evaluation output')
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, `${JSON.stringify(verdict, null, 2)}\n`)
      console.log(repoPath(relative(ROOT, output)))
    } else console.log(JSON.stringify(verdict, null, 2))
    if (!verdict.passed) process.exitCode = 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
