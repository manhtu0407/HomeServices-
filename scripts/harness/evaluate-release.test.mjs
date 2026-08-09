import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  aggregateEvaluationSamples,
  buildEvaluationReport,
  evaluateAssuranceCases,
  parseReleaseEvaluationArgs,
  resolveEvaluationRepositoryPath,
  runReleaseEvaluation,
  validateEvaluationConfig,
  verifyEvaluationReport,
} from './evaluate-release.mjs'

const root = resolve(import.meta.dirname, '../..')
const config = JSON.parse(readFileSync(resolve(root, 'config/harness/evaluation.json'), 'utf8'))
const assurance = {
  passed: true,
  authorizationBypassFailures: 0,
  confirmationBypassFailures: 0,
  toolCallAccuracy: 1,
  results: [],
  failures: [],
  byClass: {},
}
const sample = {
  status: 'passed',
  failures: 0,
  critical: { safetyFailures: 0 },
  metrics: {
    serviceAccuracy: 1,
    declinePrecision: 1,
    priceBandHitRate: 1,
    latencyP95Ms: 10,
    costPerCaseUsd: 0.01,
  },
}
const versions = {
  modelVersion: 'deterministic-rules-v1',
  promptBundleSha256: 'a'.repeat(64),
  toolManifestVersion: '1.0.0',
  toolManifestSha256: 'b'.repeat(64),
  capabilityRegistryVersion: '1.0.0',
}
const release = { releaseId: 'harness-test', gitSha: 'c'.repeat(40) }

test('evaluation config separates deterministic and live evidence layers', () => {
  assert.deepEqual(validateEvaluationConfig(config), [])
  assert.throws(() => buildEvaluationReport({
    config,
    evidenceClass: 'deterministic',
    evaluatorId: 'kael-live-provider-v1',
    samples: [sample],
    assurance,
    release,
    versions,
  }), /cannot label itself live/)
})

test('a failing critical case blocks release evidence', () => {
  const report = buildEvaluationReport({
    config,
    evidenceClass: 'deterministic',
    evaluatorId: 'kael-deterministic-v1',
    samples: [{ ...sample, critical: { safetyFailures: 1 } }],
    assurance,
    release,
    versions,
  })
  assert.equal(report.status, 'failed')
  assert.ok(verifyEvaluationReport(report).some((problem) => problem.includes('critical_safety_failures')))
})

test('repeated samples expose mean and variance', () => {
  const aggregate = aggregateEvaluationSamples([
    sample,
    { ...sample, metrics: { ...sample.metrics, latencyP95Ms: 30 } },
  ])
  assert.equal(aggregate.sampleCount, 2)
  assert.equal(aggregate.metrics.latencyP95Ms.mean, 20)
  assert.equal(aggregate.metrics.latencyP95Ms.variance, 100)
})

test('assurance cases measure authorization, confirmation, counterfactual, and tool declarations', () => {
  const result = evaluateAssuranceCases({
    cases: JSON.parse(readFileSync(resolve(root, 'apps/api/fixtures/kael-eval/harness-assurance-cases.json'), 'utf8')),
    capabilities: JSON.parse(readFileSync(resolve(root, 'config/harness/capabilities.json'), 'utf8')),
    manifest: JSON.parse(readFileSync(resolve(root, 'config/harness/manifest.json'), 'utf8')),
    goldenCases: JSON.parse(readFileSync(resolve(root, 'apps/api/fixtures/kael-eval/golden-cases.json'), 'utf8')),
  })
  assert.equal(result.passed, true)
  assert.equal(result.authorizationBypassFailures, 0)
  assert.equal(result.confirmationBypassFailures, 0)
  assert.equal(result.toolCallAccuracy, 1)
})


test('live evidence must match the executed sample count and selected release', () => {
  const liveSample = {
    releaseId: release.releaseId,
    success: true,
    provider: 'anthropic',
    modelResolved: 'claude-test',
    providerAttemptId: '01234567-89ab-4cde-8fab-0123456789ab',
    traceId: '11234567-89ab-4cde-8fab-0123456789ab',
    runId: '21234567-89ab-4cde-8fab-0123456789ab',
    latencyMs: 100,
    costUsd: 0.01,
  }
  assert.throws(() => buildEvaluationReport({
    config,
    evidenceClass: 'live_shadow',
    evaluatorId: 'kael-live-provider-v1',
    samples: [sample, sample],
    liveSamples: [liveSample],
    assurance,
    release,
    versions,
  }), /count must match/)
  assert.throws(() => buildEvaluationReport({
    config,
    evidenceClass: 'live_shadow',
    evaluatorId: 'kael-live-provider-v1',
    samples: [sample],
    liveSamples: [{ ...liveSample, releaseId: 'harness-other' }],
    assurance,
    release,
    versions,
  }), /selected release/)
})

test('live evidence rejects missing cost and latency instead of coercing them to zero', () => {
  const liveSample = {
    releaseId: release.releaseId,
    success: true,
    provider: 'anthropic',
    modelResolved: 'claude-test',
    providerAttemptId: '01234567-89ab-4cde-8fab-0123456789ab',
    traceId: '11234567-89ab-4cde-8fab-0123456789ab',
    runId: '21234567-89ab-4cde-8fab-0123456789ab',
  }
  assert.throws(() => buildEvaluationReport({
    config,
    evidenceClass: 'live_shadow',
    evaluatorId: 'kael-live-provider-v1',
    samples: [sample],
    liveSamples: [liveSample],
    assurance,
    release,
    versions,
  }), /latencyMs/)
})

test('deterministic evaluation produces honest non-live release evidence', () => {
  const report = runReleaseEvaluation({ root, evidenceClass: 'deterministic', samples: 1 })
  assert.equal(report.status, 'passed')
  assert.equal(report.liveProviderEvidence, false)
  assert.equal(report.evaluator.kind, 'deterministic')
  assert.deepEqual(verifyEvaluationReport(report), [])
})

test('rejects missing CLI values and repository-escaping release paths', () => {
  assert.throws(() => parseReleaseEvaluationArgs(['--output']), /--output requires a value/)
  assert.throws(
    () => resolveEvaluationRepositoryPath(root, '../outside.json', 'evaluation output'),
    /must stay inside the repository root/,
  )
})
