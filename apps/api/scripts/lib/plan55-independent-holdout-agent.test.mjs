import assert from 'node:assert/strict'
import test from 'node:test'

import { PLAN55_SOURCE_ASSETS } from './kael-playbook-production-attestation.mjs'
import { buildPlan55BlindHoldoutPackage } from './plan55-independent-holdout-package.mjs'
import {
  buildPlan55IndependentHoldoutJudgeContract,
  buildPlan55IndependentHoldoutJudgeResult,
  buildPlan55PerplexityJudgeResult,
} from './plan55-independent-holdout-agent.mjs'
import { invokePlan55PerplexityJudge } from '../plan55-independent-holdout-perplexity.mjs'

const services = Object.keys(PLAN55_SOURCE_ASSETS)
const digest = (letter) => `sha256:${letter.repeat(64)}`

function blindPackage() {
  const holdoutCasesByService = Object.fromEntries(services.map((service) => [service,
    Array.from({ length: 24 }, (_, index) => ({
      id: `${service}-case-${String(index + 1).padStart(2, '0')}`,
      input_text_vi: `synthetic scenario ${service} ${index + 1}`,
      expected: { scoped_label: `hidden-${index + 1}` },
      rationale: `private rationale ${service} ${index + 1}`,
    }))]))
  return buildPlan55BlindHoldoutPackage({
    reviewedHeadSha: 'a'.repeat(40),
    holdoutCasesByService,
    holdoutHashes: Object.fromEntries(services.map((service, index) => [service, digest('abcdef'[index])])),
    corpusHashes: Object.fromEntries(services.map((service, index) => [service, digest('fedcba'[index])])),
    playbookHashes: Object.fromEntries(services.map((service, index) => [service, digest('123456'[index])])),
    actorGuardFileBlobSha: 'b'.repeat(40),
  })
}

test('blind judge contract binds exact source and exposes only the 144 label-free scenarios', () => {
  const reviewPackage = blindPackage()
  const codex = buildPlan55IndependentHoldoutJudgeContract(reviewPackage, 'codex')
  const perplexity = buildPlan55IndependentHoldoutJudgeContract(reviewPackage, 'perplexity')

  assert.equal(codex.schema, 'plan55-independent-holdout-judge-contract/v1')
  assert.equal(codex.reviewed_head_sha, reviewPackage.reviewed_head_sha)
  assert.equal(codex.package_sha256, reviewPackage.package_sha256)
  assert.match(codex.prompt_sha256, /^sha256:[a-f0-9]{64}$/u)
  assert.equal(codex.output_schema.properties.judgments_by_service.required.length, 6)
  assert.deepEqual(codex.output_schema.properties.judgments_by_service.properties.hvac.items.required,
    ['id', 'labels'])
  assert.deepEqual(perplexity.output_schema.properties.judgments_by_service.properties.hvac.items.required,
    ['id', 'labels', 'source_ids'])
  const perplexitySourceIds = perplexity.output_schema.properties.judgments_by_service.properties.hvac.items
    .properties.source_ids
  assert.equal(perplexitySourceIds.type, 'array')
  assert.equal(perplexitySourceIds.items.type, 'string')
  assert.match(perplexity.prompt, /For every judgment, include at least one ID from this request’s actual search results/u)
  assert.equal(perplexity.request.preset, 'pro-search')
  assert.equal(perplexity.request.response_format.type, 'json_schema')
  assert.equal(perplexity.request.input, perplexity.prompt)
  assert.ok(codex.prompt.includes('synthetic scenario hvac 1'))
  assert.ok(!codex.prompt.includes('private rationale'))
  assert.ok(!codex.prompt.includes('hidden-1'))
  assert.ok(!codex.prompt.includes('holdout_hashes'))
})

test('blind judge contract rejects tampered source identity and private package fields', () => {
  const tampered = structuredClone(blindPackage())
  tampered.cases_by_service.hvac[0].input_text_vi = 'changed after packaging'
  assert.throws(() => buildPlan55IndependentHoldoutJudgeContract(tampered, 'codex'),
    /plan55_independent_holdout_judge_input_invalid/u)

  const leaked = structuredClone(blindPackage())
  leaked.holdout_hashes = { hvac: digest('a') }
  assert.throws(() => buildPlan55IndependentHoldoutJudgeContract(leaked, 'perplexity'),
    /plan55_independent_holdout_judge_input_invalid/u)
})

function judgmentOutput(contract, provider) {
  return {
    schema: 'plan55-holdout-judge-output/v1',
    reviewed_head_sha: contract.reviewed_head_sha,
    package_sha256: contract.package_sha256,
    judgments_by_service: Object.fromEntries(services.map((service) => [service,
      contract.blind_input.cases_by_service[service].map(({ id }) => ({
        id,
        labels: {
          scope_signal: 'in_scope',
          suggested_service: null,
          problem_slug: null,
          needs_clarification: false,
          complexity: 'medium',
          safety_signals: [],
        },
        ...(provider === 'perplexity' ? { source_ids: ['1'] } : {}),
      }))])),
  }
}

test('Codex result binds the blind package and records only configured run provenance', () => {
  const contract = buildPlan55IndependentHoldoutJudgeContract(blindPackage(), 'codex')
  const result = buildPlan55IndependentHoldoutJudgeResult({
    contract,
    output: judgmentOutput(contract, 'codex'),
    provider: 'codex',
    modelId: 'gpt-6.1-sol',
    invocationId: 'run-55-attempt-1-codex',
    execution: { mode: 'fresh_context', fork_context: false, thread_id: null },
    usage: { cost_usd: null, input_tokens: null, output_tokens: null },
  })

  assert.equal(result.source_sha, contract.reviewed_head_sha)
  assert.equal(result.package_sha256, contract.package_sha256)
  assert.equal(result.execution.mode, 'fresh_context')
  assert.equal(result.sources.length, 0)
  assert.match(result.judgments_sha256, /^sha256:[a-f0-9]{64}$/u)
  assert.throws(() => buildPlan55IndependentHoldoutJudgeResult({
    contract,
    output: judgmentOutput(contract, 'perplexity'),
    provider: 'codex',
    modelId: 'gpt-6.1-sol',
    invocationId: 'run-55-attempt-1-codex',
    execution: { mode: 'fresh_context', fork_context: false, thread_id: null },
    usage: { cost_usd: null, input_tokens: null, output_tokens: null },
  }), /plan55_independent_holdout_judge_result_invalid/u)
})

test('Perplexity result uses real Agent API source results and actual usage metadata', () => {
  const contract = buildPlan55IndependentHoldoutJudgeContract(blindPackage(), 'perplexity')
  const output = judgmentOutput(contract, 'perplexity')
  const result = buildPlan55PerplexityJudgeResult({
    contract,
    response: {
      id: 'resp_plan55_1',
      model: 'openai/gpt-5.6-sol',
      status: 'completed',
      error: null,
      output: [
        { type: 'search_results', results: [{ id: 1, title: 'Official electrical safety', url: 'https://example.org/safety' }] },
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] },
      ],
      usage: { cost: { currency: 'USD', total_cost: 0.012 }, input_tokens: 100, output_tokens: 80 },
    },
    invocationId: 'resp_plan55_1',
  })

  assert.equal(result.provider, 'perplexity')
  assert.equal(result.model_id, 'openai/gpt-5.6-sol')
  assert.equal(result.invocation_id, 'resp_plan55_1')
  assert.equal(result.usage.cost_usd, 0.012)
  assert.deepEqual(result.sources, [{
    id: '1', title: 'Official electrical safety', url: 'https://example.org/safety',
  }])
  assert.throws(() => buildPlan55PerplexityJudgeResult({
    contract,
    response: {
      id: 'resp_plan55_2', model: 'openai/gpt-5.6-sol', status: 'completed', error: null,
      output: [
        { type: 'search_results', results: [{ id: 1, title: 'Official electrical safety', url: 'https://example.org/safety' }] },
        { type: 'message', content: [{
          type: 'output_text',
          text: JSON.stringify({ ...output, judgments_by_service: {
            ...output.judgments_by_service,
            hvac: output.judgments_by_service.hvac.map((judgment) => ({ ...judgment, source_ids: ['fabricated'] })),
          } }),
        }] },
      ],
    },
    invocationId: 'resp_plan55_2',
  }), /plan55_independent_holdout_judge_result_invalid/u)
  const uncited = structuredClone(output)
  uncited.judgments_by_service.hvac[0].source_ids = []
  assert.throws(() => buildPlan55PerplexityJudgeResult({
    contract,
    response: {
      id: 'resp_plan55_uncited', model: 'openai/gpt-5.6-sol', status: 'completed', error: null,
      output: [
        { type: 'search_results', results: [{ id: 1, title: 'Official source', url: 'https://example.org/source' }] },
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(uncited) }] },
      ],
    },
    invocationId: 'resp_plan55_uncited',
  }), /plan55_independent_holdout_judge_result_invalid/u)
})

test('Perplexity runner retries only explicit 429 responses and never exposes response body on failure', async () => {
  const reviewPackage = blindPackage()
  const contract = buildPlan55IndependentHoldoutJudgeContract(reviewPackage, 'perplexity')
  const judgment = judgmentOutput(contract, 'perplexity')
  const successBody = {
    id: 'resp_plan55_retry',
    model: 'openai/gpt-5.6-sol',
    status: 'completed',
    error: null,
    output: [
      { type: 'search_results', results: [{ id: 1, title: 'Official source', url: 'https://example.org/source' }] },
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(judgment) }] },
    ],
    usage: { cost: { currency: 'USD', total_cost: 0.02 }, input_tokens: 10, output_tokens: 20 },
  }
  let calls = 0
  const delays = []
  const result = await invokePlan55PerplexityJudge({
    contract,
    reviewPackage,
    apiKey: 'test-key-that-is-never-logged',
    fetchImpl: async (_url, init) => {
      calls += 1
      assert.equal(init.method, 'POST')
      assert.equal(init.headers.authorization, 'Bearer test-key-that-is-never-logged')
      assert.deepEqual(JSON.parse(init.body), contract.request)
      if (calls === 1) return new Response('', {
        status: 429,
        headers: { 'retry-after': '0.01' },
      })
      return new Response(JSON.stringify(successBody), { status: 200 })
    },
    sleep: async (delay) => delays.push(delay),
  })
  assert.equal(calls, 2)
  assert.deepEqual(delays, [10])
  assert.equal(result.invocation_id, 'resp_plan55_retry')

  await assert.rejects(invokePlan55PerplexityJudge({
    contract,
    reviewPackage,
    apiKey: 'test-key-that-is-never-logged',
    fetchImpl: async () => new Response('private response detail', { status: 500 }),
  }), (error) => {
    assert.equal(error.message, 'plan55_perplexity_server_outcome_unknown')
    assert.ok(!error.message.includes('private response detail'))
    assert.ok(!error.message.includes('test-key-that-is-never-logged'))
    return true
  })
})

test('Perplexity runner refuses a tampered request before it can reach the network', async () => {
  const reviewPackage = blindPackage()
  const contract = buildPlan55IndependentHoldoutJudgeContract(reviewPackage, 'perplexity')
  const tampered = structuredClone(contract)
  tampered.request.input = 'changed input'
  let calls = 0

  await assert.rejects(invokePlan55PerplexityJudge({
    contract: tampered,
    reviewPackage,
    apiKey: 'test-key-that-is-never-logged',
    fetchImpl: async () => { calls += 1; throw new Error('unexpected network call') },
  }), { message: 'plan55_independent_holdout_contract_invalid' })
  assert.equal(calls, 0)
})

test('Perplexity runner bounds streamed response bytes before parsing', async () => {
  const reviewPackage = blindPackage()
  const contract = buildPlan55IndependentHoldoutJudgeContract(reviewPackage, 'perplexity')
  const oversizedStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(12 * 1024 * 1024))
      controller.enqueue(new Uint8Array(1))
      controller.close()
    },
  })

  await assert.rejects(invokePlan55PerplexityJudge({
    contract,
    reviewPackage,
    apiKey: 'test-key-that-is-never-logged',
    fetchImpl: async () => new Response(oversizedStream, { status: 200 }),
  }), { message: 'plan55_perplexity_response_too_large' })
})

test('Perplexity runner caps Retry-After and never exceeds two retries', async () => {
  const reviewPackage = blindPackage()
  const contract = buildPlan55IndependentHoldoutJudgeContract(reviewPackage, 'perplexity')
  const delays = []
  let calls = 0

  await assert.rejects(invokePlan55PerplexityJudge({
    contract,
    reviewPackage,
    apiKey: 'test-key-that-is-never-logged',
    fetchImpl: async () => {
      calls += 1
      return new Response('', { status: 429, headers: { 'retry-after': '120' } })
    },
    sleep: async (delay) => delays.push(delay),
  }), { message: 'plan55_perplexity_http_429' })
  assert.equal(calls, 3)
  assert.deepEqual(delays, [10_000, 10_000])
})
