import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import {
  buildEvaluationReport,
  evaluateHarnessEvidence,
  parseHarnessEvaluationArgs,
  requiresLiveEvaluation,
  resolveHarnessEvaluationPath,
} from './evaluation.mjs'

const policy = JSON.parse(readFileSync(new URL('../../config/harness/evaluation.json', import.meta.url), 'utf8'))
const root = resolve(import.meta.dirname, '../..')
const release = {
  releaseId: 'harness-0123456789ab-fedcba987654',
  gitSha: 'a'.repeat(40),
  promptBundleSha256: 'b'.repeat(64),
  policyBundleSha256: 'c'.repeat(64),
}

function sample(index, overrides = {}) {
  return {
    id: `sample-${index}`,
    success: true,
    criticalSafetyFailure: false,
    authorizationBypass: false,
    confirmationBypass: false,
    toolCallCorrect: true,
    provider: 'anthropic',
    modelResolved: 'claude-test',
    providerAttemptId: randomUUID(),
    traceId: randomUUID(),
    runId: randomUUID(),
    releaseId: release.releaseId,
    latencyMs: 100 + index,
    costUsd: 0.01,
    ...overrides,
  }
}

function liveReport(overrides = {}) {
  return buildEvaluationReport({
    ...release,
    reportId: randomUUID(),
    evidenceClass: 'live_shadow',
    evaluator: { id: 'kael-live-provider-v1', kind: 'live', version: '1.0.0' },
    modelBindings: [{ provider: 'anthropic', model: 'claude-test' }],
    samples: Array.from({ length: 5 }, (_, index) => sample(index)),
    metrics: {
      critical_safety_failures: 0,
      authorization_bypass_failures: 0,
      confirmation_bypass_failures: 0,
      tool_call_accuracy: 1,
      service_accuracy: 0.95,
      decline_precision: 0.95,
      price_band_hit_rate: 0.9,
      p95_latency_ms: 104,
      mean_cost_usd: 0.01,
    },
    ...overrides,
  })
}

test('accepts repeated live evidence with registered evaluator identity', () => {
  const report = liveReport()
  const verdict = evaluateHarnessEvidence({ policy, report, baseline: report, requireLive: true })
  assert.equal(verdict.passed, true, verdict.problems.join('\n'))
  assert.equal(verdict.liveEvidence, true)
})

test('does not allow a deterministic evaluator to label itself live', () => {
  const report = liveReport({ evaluator: { id: 'kael-deterministic-v1', kind: 'deterministic', version: '1.0.0' } })
  const verdict = evaluateHarnessEvidence({ policy, report, baseline: report })
  assert.equal(verdict.passed, false)
  assert.ok(verdict.problems.includes('live evidence must use a live evaluator'))
})


test('rejects live evidence without complete trace lineage or matching release', () => {
  const noTrace = liveReport({ samples: Array.from({ length: 5 }, (_, index) => sample(index, { traceId: null })) })
  const traceVerdict = evaluateHarnessEvidence({ policy, report: noTrace, baseline: noTrace })
  assert.equal(traceVerdict.passed, false)
  assert.ok(traceVerdict.problems.includes('live sample 0 is missing trace lineage'))

  const wrongRelease = liveReport({ samples: Array.from({ length: 5 }, (_, index) => sample(index, { releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb' })) })
  const releaseVerdict = evaluateHarnessEvidence({ policy, report: wrongRelease, baseline: wrongRelease })
  assert.equal(releaseVerdict.passed, false)
  assert.ok(releaseVerdict.problems.includes('live sample 0 release does not match report'))
})

test('blocks a critical confirmation bypass even when aggregate quality is high', () => {
  const report = liveReport({
    metrics: { ...liveReport().metrics, confirmation_bypass_failures: 1 },
  })
  const verdict = evaluateHarnessEvidence({ policy, report, baseline: report })
  assert.equal(verdict.passed, false)
  assert.ok(verdict.problems.includes('critical gate failed: confirmation_bypass_failures'))
})

test('enforces minimum repeated samples for probabilistic evidence', () => {
  const report = liveReport({ samples: [sample(1)], sampleCount: 1 })
  const verdict = evaluateHarnessEvidence({ policy, report, baseline: report })
  assert.equal(verdict.passed, false)
  assert.ok(verdict.problems.includes('live evaluation has too few repeated samples'))
})

test('detects quality and cost regressions against the selected baseline', () => {
  const baseline = liveReport()
  const report = liveReport({
    reportId: randomUUID(),
    metrics: {
      ...baseline.metrics,
      service_accuracy: 0.8,
      mean_cost_usd: 0.02,
    },
  })
  const verdict = evaluateHarnessEvidence({ policy, report, baseline })
  assert.equal(verdict.passed, false)
  assert.ok(verdict.problems.includes('ratchet failed: service_accuracy'))
  assert.ok(verdict.problems.includes('ratchet failed: mean_cost_usd'))
})

test('requires live evaluation for prompt, provider, and runtime-tool changes', () => {
  assert.equal(requiresLiveEvaluation(['docs/INDEX.md']), false)
  assert.equal(requiresLiveEvaluation(['supabase/functions/mobile-api/_shared/kael/prompts/system-prompt.ts']), true)
  assert.equal(requiresLiveEvaluation(['supabase/functions/mobile-api/_shared/kael/tools/market.ts']), true)
})

test('rejects missing CLI values and repository-escaping evaluation paths', () => {
  assert.throws(() => parseHarnessEvaluationArgs(['--report']), /--report requires a value/)
  assert.throws(
    () => resolveHarnessEvaluationPath(root, '../outside.json', 'evaluation report'),
    /must stay inside the repository root/,
  )
})
