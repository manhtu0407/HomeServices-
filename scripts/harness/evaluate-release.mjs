import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import {
  buildEvaluationReport as buildCanonicalEvaluationReport,
  evaluateHarnessEvidence,
} from './evaluation.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CONFIG_PATH = 'config/harness/evaluation.json'
const OUTPUT_PATH = 'artifacts/harness/evaluation-report.json'
const ASSURANCE_CASES_PATH = 'apps/api/fixtures/kael-eval/harness-assurance-cases.json'
const GOLDEN_CASES_PATH = 'apps/api/fixtures/kael-eval/golden-cases.json'
const MANIFEST_PATH = 'config/harness/manifest.json'
const RELEASE_PATH = 'artifacts/harness/release-manifest.json'
const EVIDENCE_CLASSES = new Set([
  'static',
  'deterministic',
  'simulation',
  'live_shadow',
  'production_observation',
])
const repoPath = (value) => value.split(sep).join('/')

export function validateEvaluationConfig(config) {
  const problems = []
  if (!config || typeof config !== 'object') return ['evaluation config must be an object']
  if (typeof config.suite_version !== 'string' || !config.suite_version) problems.push('suite_version is required')
  const evaluatorIds = new Set()
  for (const evaluator of config.evaluators ?? []) {
    if (!evaluator?.id || !evaluator?.kind || !evaluator?.version) problems.push('every evaluator requires id, kind, and version')
    if (evaluatorIds.has(evaluator?.id)) problems.push(`duplicate evaluator: ${evaluator.id}`)
    evaluatorIds.add(evaluator?.id)
  }
  const layerIds = new Set()
  for (const layer of config.layers ?? []) {
    if (!EVIDENCE_CLASSES.has(layer?.id)) problems.push(`invalid evaluation layer: ${layer?.id}`)
    if (layerIds.has(layer?.id)) problems.push(`duplicate evaluation layer: ${layer.id}`)
    layerIds.add(layer?.id)
    if (layer?.live === true && !['live_shadow', 'production_observation'].includes(layer.id)) {
      problems.push(`non-live layer marked live: ${layer.id}`)
    }
    if (layer?.live !== true && ['live_shadow', 'production_observation'].includes(layer?.id)) {
      problems.push(`live layer is not marked live: ${layer.id}`)
    }
  }
  if (!Number.isInteger(config.repeated_samples?.minimum) || config.repeated_samples.minimum < 2) {
    problems.push('repeated_samples.minimum must be an integer of at least 2')
  }
  if (!Array.isArray(config.critical_gates) || !config.critical_gates.length) problems.push('critical_gates must be non-empty')
  if (!Array.isArray(config.case_classes) || !config.case_classes.includes('adversarial') || !config.case_classes.includes('counterfactual')) {
    problems.push('case_classes must include adversarial and counterfactual')
  }
  return problems
}

export function evaluateAssuranceCases(input) {
  const cases = input.cases
  const capabilities = new Map(input.capabilities.entries.map((entry) => [entry.kind, entry]))
  const tools = new Set(input.manifest.entries.filter((entry) => ['runtime-tool', 'provider-adapter'].includes(entry.kind)).map((entry) => entry.id))
  const golden = new Map(input.goldenCases.map((entry) => [entry.id, entry]))
  const categories = new Set(input.goldenCases.map((entry) => entry.category))
  const results = cases.map((item) => {
    let passed = false
    if (item.assertion === 'route_requires_capability') {
      const policy = capabilities.get(item.route_kind)
      passed = Boolean(policy && !policy.public && policy.capability)
    } else if (item.assertion === 'unknown_route_denied') {
      passed = !capabilities.has(item.route_kind)
    } else if (item.assertion === 'route_requires_confirmation') {
      const policy = capabilities.get(item.route_kind)
      passed = Boolean(policy && policy.confirmationGate === item.confirmation_gate && policy.operationClass === 'money_impacting')
    } else if (item.assertion === 'golden_category_present') {
      passed = categories.has(item.category)
    } else if (item.assertion === 'counterfactual_pair') {
      const left = golden.get(item.left_case)
      const right = golden.get(item.right_case)
      passed = Boolean(left && right && left.expected?.[item.dimension] !== right.expected?.[item.dimension])
    } else if (item.assertion === 'runtime_tool_declared') {
      passed = tools.has(item.tool_id)
    }
    return { id: item.id, class: item.class, assertion: item.assertion, passed }
  })
  const byClass = Object.fromEntries([...new Set(results.map((item) => item.class))].sort().map((className) => {
    const selected = results.filter((item) => item.class === className)
    return [className, { passed: selected.filter((item) => item.passed).length, total: selected.length }]
  }))
  return {
    passed: results.every((item) => item.passed),
    failures: results.filter((item) => !item.passed),
    results,
    byClass,
    authorizationBypassFailures: results.filter((item) => item.class === 'authorization' && !item.passed).length,
    confirmationBypassFailures: results.filter((item) => item.class === 'confirmation' && !item.passed).length,
    toolCallAccuracy: ratio(
      results.filter((item) => item.class === 'tool_call' && item.passed).length,
      results.filter((item) => item.class === 'tool_call').length,
    ),
  }
}

export function aggregateEvaluationSamples(samples) {
  if (!Array.isArray(samples) || !samples.length) throw new Error('at least one evaluation sample is required')
  const metricNames = [...new Set(samples.flatMap((sample) => Object.keys(sample.metrics ?? {})))].sort()
  const metrics = Object.fromEntries(metricNames.map((name) => {
    const values = samples.map((sample) => Number(sample.metrics?.[name])).filter(Number.isFinite)
    return [name, summarize(values)]
  }))
  return {
    sampleCount: samples.length,
    passRate: ratio(samples.filter((sample) => sample.status === 'passed').length, samples.length),
    metrics,
    safetyFailures: samples.reduce((sum, sample) => sum + Number(sample.critical?.safetyFailures ?? 0), 0),
    failureCount: samples.reduce((sum, sample) => sum + Number(sample.failures ?? 0), 0),
  }
}

export function buildEvaluationReport(input) {
  const configProblems = validateEvaluationConfig(input.config)
  if (configProblems.length) throw new Error(configProblems.join('; '))
  const layer = input.config.layers.find((candidate) => candidate.id === input.evidenceClass)
  if (!layer) throw new Error(`unknown evidence class: ${input.evidenceClass}`)
  const evaluator = input.config.evaluators.find((candidate) => candidate.id === input.evaluatorId)
  if (!evaluator) throw new Error(`unknown evaluator: ${input.evaluatorId}`)
  if (layer.live === true && evaluator.kind !== 'live') throw new Error('live evidence requires a live evaluator')
  if (layer.live !== true && evaluator.kind === 'live') throw new Error('deterministic evidence cannot label itself live')

  const aggregate = aggregateEvaluationSamples(input.samples)
  const canonicalSamples = layer.live === true
    ? normalizeLiveSamples(input.liveSamples ?? [], input.release.releaseId)
    : input.samples.map((sample, index) => ({
      id: `evaluation-run-${index + 1}`,
      sampleKind: 'evaluation_run',
      success: sample.status === 'passed',
      criticalSafetyFailure: Number(sample.critical?.safetyFailures ?? 0) > 0,
      authorizationBypass: false,
      confirmationBypass: false,
      toolCallCorrect: input.assurance.toolCallAccuracy === 1,
      latencyMs: finiteNumber(sample.metrics?.latencyP95Ms),
      costUsd: finiteNumber(sample.metrics?.costPerCaseUsd),
    }))
  if (layer.live === true && canonicalSamples.length !== input.samples.length) {
    throw new Error('live provider evidence count must match executed live evaluation samples')
  }
  const liveMetrics = layer.live === true ? metricsFromLiveSamples(canonicalSamples) : null
  const metrics = {
    critical_safety_failures: liveMetrics?.critical_safety_failures ?? aggregate.safetyFailures,
    authorization_bypass_failures: liveMetrics?.authorization_bypass_failures ?? input.assurance.authorizationBypassFailures,
    confirmation_bypass_failures: liveMetrics?.confirmation_bypass_failures ?? input.assurance.confirmationBypassFailures,
    tool_call_accuracy: liveMetrics?.tool_call_accuracy ?? input.assurance.toolCallAccuracy,
    service_accuracy: aggregate.metrics.serviceAccuracy?.mean ?? 0,
    decline_precision: aggregate.metrics.declinePrecision?.mean ?? 0,
    price_band_hit_rate: aggregate.metrics.priceBandHitRate?.mean ?? 0,
    p95_latency_ms: liveMetrics?.p95_latency_ms ?? aggregate.metrics.latencyP95Ms?.mean ?? 0,
    mean_cost_usd: liveMetrics?.mean_cost_usd ?? aggregate.metrics.costPerCaseUsd?.mean ?? 0,
  }
  const modelBindings = [...new Map(canonicalSamples
    .filter((sample) => sample.provider && sample.modelResolved)
    .map((sample) => [`${sample.provider}:${sample.modelResolved}`, {
      provider: sample.provider,
      model: sample.modelResolved,
    }])).values()]
  const releaseId = input.release.releaseId
  const gitSha = input.release.gitSha
  const promptBundleSha256 = input.versions.promptBundleSha256
  const policyBundleSha256 = input.release.policyBundleSha256 ?? input.versions.policyBundleSha256
  const canonical = buildCanonicalEvaluationReport({
    reportId: input.reportId ?? randomUUID(),
    releaseId,
    gitSha,
    promptBundleSha256,
    policyBundleSha256,
    evidenceClass: input.evidenceClass,
    evaluator: { id: evaluator.id, kind: evaluator.kind, version: evaluator.version },
    modelBindings,
    samples: canonicalSamples,
    metrics,
    createdAt: new Date(input.now ?? Date.now()).toISOString(),
  })
  const baseline = input.baseline ? canonicalBaseline(input.baseline) : null
  const verdict = evaluateHarnessEvidence({
    policy: input.config,
    report: canonical,
    baseline,
    requireLive: layer.live === true,
  })
  if (!input.assurance.passed) verdict.problems.push?.('assurance cases failed')
  const assurancePassed = input.assurance.passed === true
  const passed = verdict.passed && assurancePassed
  return {
    ...canonical,
    suiteVersion: input.config.suite_version,
    generatedAt: canonical.createdAt,
    liveProviderEvidence: layer.live === true,
    release: input.release,
    versions: input.versions,
    runSamples: input.samples,
    aggregate,
    assurance: input.assurance,
    ratchetBaseline: baseline
      ? { reportId: baseline.reportId, metrics: baseline.metrics }
      : null,
    gates: {
      sampleGate: {
        minimum: layer.live === true ? input.config.repeated_samples.minimum : 1,
        actual: canonical.sampleCount,
        passed: layer.live === true
          ? canonical.sampleCount >= input.config.repeated_samples.minimum
          : canonical.sampleCount >= 1,
      },
      critical: verdict.criticalGates,
      ratchets: verdict.ratchets,
    },
    verdict: { ...verdict, passed },
    status: passed ? 'passed' : 'failed',
  }
}

export function verifyEvaluationReport(report, policy = null) {
  const config = policy ?? readJson(resolve(ROOT, CONFIG_PATH))
  const baseline = report?.ratchetBaseline
    ? { reportId: report.ratchetBaseline.reportId, metrics: report.ratchetBaseline.metrics }
    : null
  const verdict = evaluateHarnessEvidence({
    policy: config,
    report,
    baseline,
    requireLive: ['live_shadow', 'production_observation'].includes(report?.evidenceClass),
  })
  const problems = [...verdict.problems]
  if (report?.assurance?.passed !== true) problems.push('assurance cases failed')
  if (report?.status !== 'passed') problems.push('evaluation report status is not passed')
  if (report?.verdict?.verdictId && report.verdict.verdictId !== verdict.verdictId) {
    problems.push('evaluation verdict identity mismatch')
  }
  return [...new Set(problems)]
}

export function runReleaseEvaluation(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const config = readJson(resolve(root, options.configPath ?? CONFIG_PATH))
  const evidenceClass = options.evidenceClass ?? 'deterministic'
  const layer = config.layers.find((candidate) => candidate.id === evidenceClass)
  if (!layer) throw new Error(`unknown evidence class: ${evidenceClass}`)
  const evaluatorId = options.evaluatorId ?? (layer.live ? 'kael-live-provider-v1' : 'kael-deterministic-v1')
  const samplesRequested = Number(options.samples ?? (layer.live ? config.repeated_samples.minimum : 1))
  if (!Number.isInteger(samplesRequested) || samplesRequested < 1 || samplesRequested > 25) throw new Error('samples must be an integer from 1 to 25')
  const samples = []
  const tempRoot = resolve(tmpdir(), `nestscout-harness-eval-${randomUUID()}`)
  mkdirSync(tempRoot, { recursive: true })
  try {
    for (let index = 0; index < samplesRequested; index += 1) {
      const jsonOutput = resolve(tempRoot, `sample-${index}.json`)
      const markdownOutput = resolve(tempRoot, `sample-${index}.md`)
      const args = [
        resolve(root, 'apps/api/scripts/kael-eval.mjs'),
        '--mode', layer.live ? 'live' : 'deterministic',
        '--report', markdownOutput,
        '--json-output', jsonOutput,
      ]
      const result = spawnSync(process.execPath, args, {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, ...(options.env ?? {}) },
        windowsHide: true,
      })
      if (!existsSync(jsonOutput)) throw new Error(result.stderr.trim() || `evaluation sample ${index + 1} did not produce JSON evidence`)
      const sample = readJson(jsonOutput)
      sample.exitCode = result.status ?? 1
      samples.push(sample)
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
  const assurance = evaluateAssuranceCases({
    cases: readJson(resolve(root, ASSURANCE_CASES_PATH)),
    capabilities: readJson(resolve(root, 'config/harness/capabilities.json')),
    manifest: readJson(resolve(root, MANIFEST_PATH)),
    goldenCases: readJson(resolve(root, GOLDEN_CASES_PATH)),
  })
  const release = loadRelease(root, options.releasePath)
  const manifestBytes = readFileSync(resolve(root, MANIFEST_PATH))
  const promptBundleSha256 = release.promptBundleSha256 ?? digestPaths(root, [
    'packages/shared/kael/charter',
    'supabase/functions/mobile-api/_shared/kael/prompts',
  ])
  const policyBundleSha256 = release.policyBundleSha256 ?? digestPaths(root, [
    'governance/RULES.md',
    'governance/STRUCTURES.md',
    'config/harness',
    'supabase/functions/mobile-api/_shared/platform/authz',
    'supabase/functions/mobile-api/_shared/kael/kael-guardrails',
  ])
  const liveSamples = layer.live
    ? loadLiveSamples(root, options.liveSamplesPath)
    : []
  return buildEvaluationReport({
    config,
    evidenceClass,
    evaluatorId,
    samples,
    liveSamples,
    assurance,
    baseline: options.baselinePath ? readJson(resolve(root, options.baselinePath)) : null,
    release,
    versions: {
      modelVersion: layer.live ? (options.modelVersion ?? process.env.KAEL_EVAL_MODEL_VERSION ?? 'unreported') : 'deterministic-rules-v1',
      promptBundleSha256,
      policyBundleSha256,
      toolManifestVersion: readJson(resolve(root, MANIFEST_PATH)).manifestVersion,
      toolManifestSha256: sha256(manifestBytes),
      capabilityRegistryVersion: readJson(resolve(root, 'config/harness/capabilities.json')).version,
      capabilityRegistrySha256: release.capabilityRegistrySha256 ?? sha256(readFileSync(resolve(root, 'config/harness/capabilities.json'))),
    },
  })
}

function loadRelease(root, releasePath) {
  const path = resolve(root, releasePath ?? RELEASE_PATH)
  if (existsSync(path)) return readJson(path)
  return buildHarnessRelease({ root, environment: 'preview', gitSha: gitSha(root) })
}

function loadLiveSamples(root, path) {
  if (!path) {
    throw new Error('live evaluation requires --live-samples with provider, resolved-model, attempt, latency, and cost evidence')
  }
  const value = readJson(resolve(root, path))
  if (!Array.isArray(value)) throw new Error('live sample evidence must be an array')
  return value
}

function normalizeLiveSamples(samples, releaseId) {
  return samples.map((sample, index) => {
    if (sample.releaseId !== releaseId) throw new Error(`live sample ${index} does not match the selected release`)
    return {
      id: sample.id ?? `live-run-${index + 1}`,
      sampleKind: 'provider_run',
      releaseId: sample.releaseId,
      success: sample.success === true,
      criticalSafetyFailure: sample.criticalSafetyFailure === true,
      authorizationBypass: sample.authorizationBypass === true,
      confirmationBypass: sample.confirmationBypass === true,
      toolCallCorrect: sample.toolCallCorrect !== false,
      provider: sample.provider,
      modelResolved: sample.modelResolved,
      providerAttemptId: sample.providerAttemptId,
      latencyMs: requiredFiniteNumber(sample.latencyMs, `live sample ${index} latencyMs`),
      costUsd: requiredFiniteNumber(sample.costUsd, `live sample ${index} costUsd`),
      traceId: sample.traceId,
      runId: sample.runId,
    }
  })
}

function metricsFromLiveSamples(samples) {
  const latencies = samples.map((sample) => sample.latencyMs).sort((left, right) => left - right)
  const costs = samples.map((sample) => sample.costUsd)
  return {
    critical_safety_failures: samples.filter((sample) => sample.criticalSafetyFailure).length,
    authorization_bypass_failures: samples.filter((sample) => sample.authorizationBypass).length,
    confirmation_bypass_failures: samples.filter((sample) => sample.confirmationBypass).length,
    tool_call_accuracy: ratio(samples.filter((sample) => sample.toolCallCorrect).length, samples.length),
    p95_latency_ms: latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] ?? 0,
    mean_cost_usd: costs.reduce((sum, value) => sum + value, 0) / Math.max(costs.length, 1),
  }
}

function canonicalBaseline(value) {
  if (!value) return null
  return {
    reportId: value.reportId,
    metrics: value.metrics,
  }
}

function summarize(values) {
  if (!values.length) return { count: 0, mean: null, min: null, max: null, variance: null, standardDeviation: null }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return {
    count: values.length,
    mean: round(mean),
    min: Math.min(...values),
    max: Math.max(...values),
    variance: round(variance),
    standardDeviation: round(Math.sqrt(variance)),
  }
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator
}

function round(value, places = 6) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function requiredFiniteNumber(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative finite number`)
  return number
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function digestPaths(root, paths) {
  const hash = createHash('sha256')
  for (const path of paths.sort()) {
    const absolute = resolve(root, path)
    if (!existsSync(absolute)) continue
    const files = statFiles(absolute)
    for (const file of files) {
      hash.update(`${repoPath(relative(root, file))}\0`)
      hash.update(readFileSync(file))
      hash.update('\0')
    }
  }
  return hash.digest('hex')
}

function statFiles(path) {
  if (statSync(path).isFile()) return [path]
  const files = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile()) files.push(absolute)
    }
  }
  walk(path)
  return files.sort()
}

function gitSha(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true })
  return result.status === 0 ? result.stdout.trim() : '0'.repeat(40)
}

function parseArgs(values) {
  const options = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--evidence') options.evidenceClass = values[++index]
    else if (value === '--evaluator') options.evaluatorId = values[++index]
    else if (value === '--samples') options.samples = Number(values[++index])
    else if (value === '--output') options.outputPath = values[++index]
    else if (value === '--baseline') options.baselinePath = values[++index]
    else if (value === '--release') options.releasePath = values[++index]
    else if (value === '--model-version') options.modelVersion = values[++index]
    else if (value === '--live-samples') options.liveSamplesPath = values[++index]
    else if (value === '--verify') options.verifyPath = values[++index]
    else throw new Error(`unknown argument: ${value}`)
  }
  return options
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.verifyPath) {
      const report = readJson(resolve(ROOT, options.verifyPath))
      const problems = verifyEvaluationReport(report)
      if (problems.length) {
        for (const problem of problems) console.error(`  - ${problem}`)
        process.exitCode = 1
      } else console.log(`evaluation report ok: ${report.reportId}`)
    } else {
      const report = runReleaseEvaluation(options)
      const outputPath = resolve(ROOT, options.outputPath ?? OUTPUT_PATH)
      mkdirSync(dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
      console.log(`${report.status} ${repoPath(relative(ROOT, outputPath))}`)
      if (report.status !== 'passed') process.exitCode = 1
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
