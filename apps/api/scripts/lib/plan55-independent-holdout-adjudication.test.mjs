import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  PROBLEM_SLUGS_BY_SERVICE,
  SAFETY_SIGNALS_BY_SERVICE,
} from './kael-playbook-eval-core.mjs'
import { PLAN55_SOURCE_ASSETS } from './kael-playbook-production-attestation.mjs'
import { buildPlan55BlindHoldoutPackage } from './plan55-independent-holdout-package.mjs'
import {
  createPlan55IndependentHoldoutProof,
  plan55IndependentHoldoutLabelsSha256,
} from './plan55-independent-holdout-adjudication.mjs'

const services = Object.keys(PLAN55_SOURCE_ASSETS)
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`

function fixture() {
  const holdoutCasesByService = Object.fromEntries(services.map((service) => [service,
    Array.from({ length: 24 }, (_, index) => {
      const expected = service === 'hvac' && index === 0
        ? {
            scope_signal: 'in_scope',
            suggested_service: null,
            acceptable_problem_slugs: [
              PROBLEM_SLUGS_BY_SERVICE[service][0],
              PROBLEM_SLUGS_BY_SERVICE[service][1],
            ],
            needs_clarification: false,
            complexity: 'small',
            required_safety_signals: [SAFETY_SIGNALS_BY_SERVICE[service][0]],
            forbidden_safety_signals: [SAFETY_SIGNALS_BY_SERVICE[service][1]],
          }
        : {
            scope_signal: 'in_scope',
            suggested_service: null,
            problem_slug: PROBLEM_SLUGS_BY_SERVICE[service][0],
            needs_clarification: false,
            complexity: 'small',
            safety_signals: [],
          }
      return {
        id: `${service}-case-${String(index + 1).padStart(2, '0')}`,
        input_text_vi: `synthetic scenario ${service} ${index + 1}`,
        expected,
        rationale: `private rationale ${service} ${index + 1}`,
      }
    })]))
  const holdoutHashes = Object.fromEntries(services.map((service) => [service, sha256(`${service}-holdout`)]))
  const reviewPackage = buildPlan55BlindHoldoutPackage({
    reviewedHeadSha: '1'.repeat(40),
    holdoutCasesByService,
    holdoutHashes,
    corpusHashes: Object.fromEntries(services.map((service) => [service, sha256(`${service}-corpus`)])),
    playbookHashes: Object.fromEntries(services.map((service) => [service, sha256(`${service}-playbook`)])),
    actorGuardFileBlobSha: 'a'.repeat(40),
  })
  const judgmentMap = Object.fromEntries(services.map((service) => [service,
    holdoutCasesByService[service].map(({ id, expected }) => ({
      id,
      labels: {
        scope_signal: expected.scope_signal,
        suggested_service: expected.suggested_service,
        problem_slug: expected.acceptable_problem_slugs?.at(-1) ?? expected.problem_slug ?? null,
        needs_clarification: expected.needs_clarification,
        complexity: expected.complexity,
        safety_signals: expected.required_safety_signals ?? expected.safety_signals,
      },
    }))]))
  const result = (provider) => {
    const judgmentsByService = structuredClone(judgmentMap)
    const sources = provider === 'perplexity'
      ? [{ id: 'source-1', url: 'https://example.test/safety', title: 'Safety reference' }]
      : []
    if (provider === 'perplexity') {
      for (const judgments of Object.values(judgmentsByService)) {
        for (const judgment of judgments) judgment.source_ids = ['source-1']
      }
    }
    return {
      schema: 'plan55-holdout-judge-result/v1',
      provider,
      model_id: provider === 'codex' ? 'gpt-6.1-sol' : 'openai/gpt-5.6-sol',
      invocation_id: `${provider}-invocation-1`,
      source_sha: reviewPackage.reviewed_head_sha,
      package_sha256: reviewPackage.package_sha256,
      prompt_sha256: sha256(`${provider}-prompt`),
      judgments_sha256: sha256(JSON.stringify({ judgments_by_service: judgmentsByService, sources })),
      judgments_by_service: judgmentsByService,
      sources,
      execution: provider === 'codex'
        ? { mode: 'fresh_context', fork_context: false, thread_id: null }
        : { mode: 'agent_api' },
      usage: provider === 'perplexity'
        ? { cost_usd: 0.017, input_tokens: 2000, output_tokens: 1200 }
        : { cost_usd: null, input_tokens: null, output_tokens: null },
    }
  }
  return {
    reviewPackage,
    holdoutCasesByService,
    expectedHoldoutHashes: holdoutHashes,
    expectedHoldoutLabelsSha256: plan55IndependentHoldoutLabelsSha256(holdoutCasesByService),
    codex: result('codex'),
    perplexity: result('perplexity'),
  }
}

test('independent proof binds both blind judges, all frozen cases, sources, and actual API usage', () => {
  const input = fixture()
  const proof = createPlan55IndependentHoldoutProof(input)

  assert.equal(proof.schema, 'plan55-independent-holdout-proof/v6')
  assert.equal(proof.status, 'PASS')
  assert.equal(proof.source_sha, input.reviewPackage.reviewed_head_sha)
  assert.equal(proof.package_sha256, input.reviewPackage.package_sha256)
  assert.equal(proof.coverage.total_case_count, 144)
  assert.equal(proof.judges.codex.model_id, 'gpt-6.1-sol')
  assert.equal(proof.judges.perplexity.usage.cost_usd, 0.017)
  assert.ok(!JSON.stringify(proof).includes('synthetic scenario'))
  assert.ok(!JSON.stringify(proof).includes('private rationale'))
})

test('independent proof fails closed when either judge uses another source or package', () => {
  const input = fixture()
  input.codex.source_sha = '2'.repeat(40)
  assert.throws(() => createPlan55IndependentHoldoutProof(input), /plan55_independent_holdout_unverified/u)

  const stalePackage = fixture()
  stalePackage.perplexity.package_sha256 = sha256('another package')
  assert.throws(() => createPlan55IndependentHoldoutProof(stalePackage), /plan55_independent_holdout_unverified/u)
})

test('independent proof rejects unresolved safety disagreement and label mismatch', () => {
  const disagree = fixture()
  disagree.perplexity.judgments_by_service.hvac[0].labels.safety_signals = []
  disagree.perplexity.judgments_sha256 = sha256(JSON.stringify({
    judgments_by_service: disagree.perplexity.judgments_by_service,
    sources: disagree.perplexity.sources,
  }))
  assert.throws(() => createPlan55IndependentHoldoutProof(disagree), /plan55_independent_holdout_unverified/u)

  const forbiddenSafety = fixture()
  forbiddenSafety.perplexity.judgments_by_service.hvac[0].labels.safety_signals.push(
    SAFETY_SIGNALS_BY_SERVICE.hvac[1],
  )
  forbiddenSafety.perplexity.judgments_sha256 = sha256(JSON.stringify({
    judgments_by_service: forbiddenSafety.perplexity.judgments_by_service,
    sources: forbiddenSafety.perplexity.sources,
  }))
  assert.throws(() => createPlan55IndependentHoldoutProof(forbiddenSafety), /plan55_independent_holdout_unverified/u)

  const unsupportedSafety = fixture()
  unsupportedSafety.codex.judgments_by_service.hvac[0].labels.safety_signals.push('made_up_signal')
  unsupportedSafety.codex.judgments_sha256 = sha256(JSON.stringify({
    judgments_by_service: unsupportedSafety.codex.judgments_by_service,
    sources: unsupportedSafety.codex.sources,
  }))
  assert.throws(() => createPlan55IndependentHoldoutProof(unsupportedSafety), /plan55_independent_holdout_unverified/u)

  const unexpectedLabel = fixture()
  unexpectedLabel.codex.judgments_by_service.hvac[0].labels.private_rationale = 'not an output label'
  unexpectedLabel.codex.judgments_sha256 = sha256(JSON.stringify({
    judgments_by_service: unexpectedLabel.codex.judgments_by_service,
    sources: unexpectedLabel.codex.sources,
  }))
  assert.throws(() => createPlan55IndependentHoldoutProof(unexpectedLabel), /plan55_independent_holdout_unverified/u)

  const slugDisagreement = fixture()
  slugDisagreement.perplexity.judgments_by_service.hvac[0].labels.problem_slug =
    PROBLEM_SLUGS_BY_SERVICE.hvac[0]
  slugDisagreement.perplexity.judgments_sha256 = sha256(JSON.stringify({
    judgments_by_service: slugDisagreement.perplexity.judgments_by_service,
    sources: slugDisagreement.perplexity.sources,
  }))
  assert.throws(() => createPlan55IndependentHoldoutProof(slugDisagreement), /plan55_independent_holdout_unverified/u)

  const safetyDisagreement = fixture()
  safetyDisagreement.codex.judgments_by_service.hvac[0].labels.safety_signals.push(
    SAFETY_SIGNALS_BY_SERVICE.hvac[2],
  )
  safetyDisagreement.codex.judgments_sha256 = sha256(JSON.stringify({
    judgments_by_service: safetyDisagreement.codex.judgments_by_service,
    sources: safetyDisagreement.codex.sources,
  }))
  assert.throws(() => createPlan55IndependentHoldoutProof(safetyDisagreement), /plan55_independent_holdout_unverified/u)

  const wrongGold = fixture()
  wrongGold.codex.judgments_by_service.hvac[0].labels.needs_clarification = true
  wrongGold.codex.judgments_sha256 = sha256(JSON.stringify({
    judgments_by_service: wrongGold.codex.judgments_by_service,
    sources: wrongGold.codex.sources,
  }))
  assert.throws(() => createPlan55IndependentHoldoutProof(wrongGold), /plan55_independent_holdout_unverified/u)
})

test('independent proof rejects incomplete case coverage and citations not present in Agent API evidence', () => {
  const missing = fixture()
  missing.codex.judgments_by_service.hvac.pop()
  missing.codex.judgments_sha256 = sha256(JSON.stringify({
    judgments_by_service: missing.codex.judgments_by_service,
    sources: missing.codex.sources,
  }))
  assert.throws(() => createPlan55IndependentHoldoutProof(missing), /plan55_independent_holdout_unverified/u)

  const fabricated = fixture()
  fabricated.perplexity.judgments_by_service.hvac[0].source_ids = ['not-returned-by-agent-api']
  fabricated.perplexity.judgments_sha256 = sha256(JSON.stringify({
    judgments_by_service: fabricated.perplexity.judgments_by_service,
    sources: fabricated.perplexity.sources,
  }))
  assert.throws(() => createPlan55IndependentHoldoutProof(fabricated), /plan55_independent_holdout_unverified/u)
})
