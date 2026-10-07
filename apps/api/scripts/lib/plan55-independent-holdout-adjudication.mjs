import { createHash } from 'node:crypto'

import {
  PROBLEM_SLUGS_BY_SERVICE,
  SAFETY_SIGNALS_BY_SERVICE,
  validatePlan55HoldoutExpected,
} from './kael-playbook-eval-core.mjs'
import {
  PLAN55_SOURCE_ASSETS,
} from './kael-playbook-production-attestation.mjs'
import {
  PLAN55_HOLDOUT_RUBRIC_SHA256,
  PLAN55_HOLDOUT_RUBRIC_VERSION,
} from './plan55-independent-holdout-package.mjs'

const SERVICES = Object.freeze(Object.keys(PLAN55_SOURCE_ASSETS))
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,199}$/iu

export function plan55IndependentHoldoutLabelsSha256(holdoutCasesByService) {
  const normalized = normalizePrivateCases(holdoutCasesByService)
  const projection = Object.fromEntries(SERVICES.map((service) => [service,
    normalized[service].map(({ id, expected }) => ({ id, labels: expected }))
      .sort((left, right) => left.id.localeCompare(right.id))]))
  return sha256(canonicalJson(projection))
}

export function createPlan55IndependentHoldoutProof({
  reviewPackage,
  holdoutCasesByService,
  expectedHoldoutHashes,
  expectedHoldoutLabelsSha256,
  codex,
  perplexity,
} = {}) {
  try {
    return buildProof({
      reviewPackage,
      holdoutCasesByService,
      expectedHoldoutHashes,
      expectedHoldoutLabelsSha256,
      codex,
      perplexity,
    })
  } catch {
    throw new Error('plan55_independent_holdout_unverified')
  }
}

function buildProof({
  reviewPackage,
  holdoutCasesByService,
  expectedHoldoutHashes,
  expectedHoldoutLabelsSha256,
  codex,
  perplexity,
}) {
  const fail = () => { throw new Error('invalid') }
  assertReviewPackage(reviewPackage, fail)
  const privateCases = normalizePrivateCases(holdoutCasesByService, fail)
  const holdoutHashes = validateDigestMap(expectedHoldoutHashes, fail)
  const labelsSha256 = plan55IndependentHoldoutLabelsSha256(privateCases)
  if (!SHA256_PATTERN.test(expectedHoldoutLabelsSha256 ?? '') ||
      labelsSha256 !== expectedHoldoutLabelsSha256) fail()

  const codexEvidence = validateJudge(codex, 'codex', reviewPackage, fail)
  const perplexityEvidence = validateJudge(perplexity, 'perplexity', reviewPackage, fail)
  const inputRoot = assertPackageMatchesCases(reviewPackage, privateCases, fail)

  const agreementByService = Object.fromEntries(SERVICES.map((service) => {
    const expected = privateCases[service]
    const codexJudgments = codexEvidence.judgments[service]
    const perplexityJudgments = perplexityEvidence.judgments[service]
    for (let index = 0; index < expected.length; index += 1) {
      const gold = expected[index]
      const codexJudgment = codexJudgments[index]
      const perplexityJudgment = perplexityJudgments[index]
      if (codexJudgment.id !== gold.id || perplexityJudgment.id !== gold.id ||
          !labelsMatchExpected(codexJudgment.labels, gold.expected, service) ||
          !labelsMatchExpected(perplexityJudgment.labels, gold.expected, service) ||
          !judgesAgree(codexJudgment.labels, perplexityJudgment.labels)) fail()
      assertSources(codexJudgment, codexEvidence.sourcesById, 'codex', fail)
      assertSources(perplexityJudgment, perplexityEvidence.sourcesById, 'perplexity', fail)
    }
    return [service, { case_count: expected.length, mismatches: 0, unresolved_safety_disagreements: 0 }]
  }))

  const proof = {
    schema: 'plan55-independent-holdout-proof/v6',
    status: 'PASS',
    blinded: true,
    reviewed_by_author: false,
    source_sha: reviewPackage.reviewed_head_sha,
    package_sha256: reviewPackage.package_sha256,
    rubric_version: reviewPackage.rubric_version,
    rubric_sha256: reviewPackage.rubric_sha256,
    holdout_root_sha256: reviewPackage.holdout_root_sha256,
    holdout_asset_hashes: holdoutHashes,
    holdout_labels_sha256: labelsSha256,
    coverage: {
      service_count: SERVICES.length,
      case_count_per_service: 24,
      total_case_count: SERVICES.length * 24,
      agreement_by_service: agreementByService,
      mismatch_count: 0,
      unresolved_safety_disagreement_count: 0,
    },
    judges: {
      codex: codexEvidence.metadata,
      perplexity: perplexityEvidence.metadata,
    },
    source_evidence: perplexityEvidence.sources,
    verified_at_utc: new Date().toISOString(),
    input_root_sha256: inputRoot,
  }
  return Object.freeze({ ...proof, proof_sha256: sha256(canonicalJson(proof)) })
}

function assertReviewPackage(reviewPackage, fail) {
  if (!isRecord(reviewPackage) ||
      reviewPackage.schema !== 'plan55-independent-blind-holdout-package/v3' ||
      !GIT_SHA_PATTERN.test(reviewPackage.reviewed_head_sha ?? '') ||
      reviewPackage.rubric_version !== PLAN55_HOLDOUT_RUBRIC_VERSION ||
      reviewPackage.rubric_sha256 !== PLAN55_HOLDOUT_RUBRIC_SHA256 ||
      !isRecord(reviewPackage.coverage) || reviewPackage.coverage.service_count !== SERVICES.length ||
      reviewPackage.coverage.case_count_per_service !== 24 ||
      reviewPackage.coverage.total_case_count !== SERVICES.length * 24 ||
      !SHA256_PATTERN.test(reviewPackage.rubric_sha256) ||
      !/^[a-f0-9]{64}$/u.test(reviewPackage.holdout_root_sha256 ?? '') ||
      !GIT_SHA_PATTERN.test(reviewPackage.actor_guard_file_blob_sha1 ?? '') ||
      !isDigestMap(reviewPackage.corpus_hashes) || !isDigestMap(reviewPackage.playbook_hashes) ||
      !isRecord(reviewPackage.cases_by_service) || !isRecord(reviewPackage.input_hashes_by_service) ||
      !SHA256_PATTERN.test(reviewPackage.package_sha256 ?? '') ||
      Object.hasOwn(reviewPackage, 'holdout_hashes') || Object.hasOwn(reviewPackage, 'labels_sha256') ||
      Object.hasOwn(reviewPackage, 'independent_attestation_comment_body')) fail()

  const { package_sha256: packageSha256, ...payload } = reviewPackage
  if (sha256(canonicalJson(payload)) !== packageSha256) fail()
}

function assertPackageMatchesCases(reviewPackage, privateCases, fail) {
  if (Object.keys(reviewPackage.cases_by_service).join('\n') !== SERVICES.join('\n') ||
      Object.keys(reviewPackage.input_hashes_by_service).join('\n') !== SERVICES.join('\n')) fail()
  const roots = []
  for (const service of SERVICES) {
    const packaged = reviewPackage.cases_by_service[service]
    const hashes = reviewPackage.input_hashes_by_service[service]
    const privateServiceCases = privateCases[service]
    if (!Array.isArray(packaged) || packaged.length !== 24 ||
        !Array.isArray(hashes) || hashes.length !== 24) fail()
    for (let index = 0; index < 24; index += 1) {
      const source = privateServiceCases[index]
      const blinded = packaged[index]
      const hash = hashes[index]
      if (blinded?.id !== source.id || blinded?.input_text_vi !== source.input_text_vi ||
          Object.keys(blinded).sort().join('\n') !== ['id', 'input_text_vi'].sort().join('\n') ||
          hash?.id !== source.id || hash.input_sha256 !== sha256(`${source.id}\n${source.input_text_vi}`)) fail()
      roots.push(`${service}/${source.id}=${hash.input_sha256}`)
    }
  }
  const inputRoot = createHash('sha256').update(roots.join('\n')).digest('hex')
  if (inputRoot !== reviewPackage.holdout_root_sha256) fail()
  return inputRoot
}

function normalizePrivateCases(value, fail = () => { throw new Error('invalid') }) {
  if (!isRecord(value) || Object.keys(value).join('\n') !== SERVICES.join('\n')) fail()
  const allIds = new Set()
  return Object.fromEntries(SERVICES.map((service) => {
    const cases = value[service]
    if (!Array.isArray(cases) || cases.length !== 24) fail()
    const normalized = cases.map((item) => {
      if (!isRecord(item) || !SAFE_ID_PATTERN.test(item.id ?? '') ||
          typeof item.input_text_vi !== 'string' || !item.input_text_vi.trim() ||
          item.input_text_vi.length > 8000 || !isRecord(item.expected)) fail()
      if (allIds.has(item.id)) fail()
      allIds.add(item.id)
      try {
        validatePlan55HoldoutExpected(item.expected, item.id, service)
      } catch {
        fail()
      }
      return { id: item.id, input_text_vi: item.input_text_vi, expected: item.expected }
    })
    return [service, normalized]
  }))
}

function validateJudge(result, provider, reviewPackage, fail) {
  const expectedExecution = provider === 'codex'
    ? result?.execution?.mode === 'fresh_context' && result.execution.fork_context === false &&
      result.execution.thread_id === null
    : result?.execution?.mode === 'agent_api'
  if (!isRecord(result) || result.schema !== 'plan55-holdout-judge-result/v1' ||
      result.provider !== provider || !safeText(result.model_id, 160) ||
      !safeText(result.invocation_id, 180) || !expectedExecution ||
      result.source_sha !== reviewPackage.reviewed_head_sha ||
      result.package_sha256 !== reviewPackage.package_sha256 ||
      !SHA256_PATTERN.test(result.prompt_sha256 ?? '') ||
      !isRecord(result.judgments_by_service) ||
      Object.keys(result.judgments_by_service).join('\n') !== SERVICES.join('\n') ||
      !Array.isArray(result.sources)) fail()

  const sourcesById = new Map()
  const sources = result.sources.map((source) => {
    if (!isRecord(source) || !safeText(source.id, 160) || !safeText(source.title, 300) ||
        typeof source.url !== 'string') fail()
    let url
    try {
      url = new URL(source.url)
    } catch {
      fail()
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
        sourcesById.has(source.id)) fail()
    const normalized = Object.freeze({ id: source.id, url: url.toString(), title: source.title })
    sourcesById.set(source.id, normalized)
    return normalized
  })
  if ((provider === 'perplexity' && sources.length === 0) ||
      (provider === 'codex' && sources.length !== 0)) fail()

  const judgments = Object.fromEntries(SERVICES.map((service) => {
    const items = result.judgments_by_service[service]
    if (!Array.isArray(items) || items.length !== 24) fail()
    return [service, items.map((item) => {
      if (!isRecord(item) || !SAFE_ID_PATTERN.test(item.id ?? '') || !isRecord(item.labels) ||
          (provider === 'perplexity' && !Array.isArray(item.source_ids)) ||
          (provider === 'codex' && Object.hasOwn(item, 'source_ids'))) fail()
      const allowedKeys = provider === 'perplexity' ? ['id', 'labels', 'source_ids'] : ['id', 'labels']
      if (Object.keys(item).sort().join('\n') !== allowedKeys.sort().join('\n')) fail()
      return Object.freeze({
        id: item.id,
        labels: item.labels,
        ...(provider === 'perplexity' ? { source_ids: item.source_ids } : {}),
      })
    })]
  }))

  const expectedDigest = sha256(JSON.stringify({ judgments_by_service: judgments, sources }))
  if (result.judgments_sha256 !== expectedDigest) fail()
  const usage = normalizeUsage(result.usage, fail)
  return {
    judgments,
    sources,
    sourcesById,
    metadata: Object.freeze({
      provider,
      model_id: result.model_id,
      invocation_id: result.invocation_id,
      prompt_sha256: result.prompt_sha256,
      judgments_sha256: result.judgments_sha256,
      usage,
      ...(provider === 'codex' ? { context: 'fresh', fork_context: false } : {}),
    }),
  }
}

function assertSources(judgment, sourcesById, provider, fail) {
  if (provider === 'codex') return
  const sourceIds = judgment.source_ids
  if (!Array.isArray(sourceIds) || sourceIds.length === 0 ||
      new Set(sourceIds).size !== sourceIds.length ||
      sourceIds.some((sourceId) => typeof sourceId !== 'string' || !sourcesById.has(sourceId))) fail()
}

function labelsMatchExpected(labels, expected, service) {
  const labelKeys = [
    'scope_signal',
    'suggested_service',
    'problem_slug',
    'needs_clarification',
    'complexity',
    'safety_signals',
  ]
  if (!isRecord(labels) || Object.keys(labels).sort().join('\n') !== [...labelKeys].sort().join('\n')) {
    return false
  }

  const acceptedSlugs = Array.isArray(expected.acceptable_problem_slugs)
    ? expected.acceptable_problem_slugs
    : expected.problem_slug === null
      ? [null]
      : [expected.problem_slug]
  const requiredSafety = Array.isArray(expected.required_safety_signals)
    ? expected.required_safety_signals
    : expected.safety_signals
  const allowedSafety = new Set(SAFETY_SIGNALS_BY_SERVICE[service])
  const observedSafety = labels.safety_signals

  return labels.scope_signal === expected.scope_signal &&
    labels.suggested_service === expected.suggested_service &&
    acceptedSlugs.includes(labels.problem_slug) &&
    labels.needs_clarification === expected.needs_clarification &&
    labels.complexity === expected.complexity &&
    Array.isArray(observedSafety) &&
    new Set(observedSafety).size === observedSafety.length &&
    observedSafety.every((signal) => allowedSafety.has(signal)) &&
    requiredSafety.every((signal) => observedSafety.includes(signal)) &&
    (expected.forbidden_safety_signals ?? []).every((signal) => !observedSafety.includes(signal)) &&
    (labels.problem_slug === null || PROBLEM_SLUGS_BY_SERVICE[service].includes(labels.problem_slug))
}

function judgesAgree(left, right) {
  const { safety_signals: leftSafety, ...leftLabels } = left
  const { safety_signals: rightSafety, ...rightLabels } = right
  return canonicalJson(leftLabels) === canonicalJson(rightLabels) &&
    canonicalJson([...leftSafety].sort()) === canonicalJson([...rightSafety].sort())
}

function normalizeUsage(value, fail) {
  if (!isRecord(value)) fail()
  const costUsd = value.cost_usd
  const inputTokens = value.input_tokens
  const outputTokens = value.output_tokens
  if (!(costUsd === null || (typeof costUsd === 'number' && Number.isFinite(costUsd) && costUsd >= 0)) ||
      !(inputTokens === null || (Number.isSafeInteger(inputTokens) && inputTokens >= 0)) ||
      !(outputTokens === null || (Number.isSafeInteger(outputTokens) && outputTokens >= 0))) fail()
  return Object.freeze({ cost_usd: costUsd, input_tokens: inputTokens, output_tokens: outputTokens })
}

function validateDigestMap(value, fail) {
  if (!isDigestMap(value)) fail()
  return Object.freeze(Object.fromEntries(SERVICES.map((service) => [service, value[service]])))
}

function isDigestMap(value) {
  return isRecord(value) && Object.keys(value).sort().join('\n') === [...SERVICES].sort().join('\n') &&
    Object.values(value).every((digest) => SHA256_PATTERN.test(digest))
}

function safeText(value, maximum) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum &&
    !/[\r\n]/u.test(value)
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value))
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
