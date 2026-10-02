import { createHash } from 'node:crypto'

import {
  PLAN55_SOURCE_ASSETS,
} from './kael-playbook-production-attestation.mjs'
import {
  buildPlan55HoldoutReviewBody,
  PLAN55_GITHUB_REPOSITORY,
  plan55HoldoutLabelsSha256,
} from './plan55-independent-holdout-review.mjs'

const SERVICES = Object.freeze(Object.keys(PLAN55_SOURCE_ASSETS))
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/iu
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/iu
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu
const PHONE_PATTERN = /(?:\+?84|0)(?:[ .()-]?\d){8,10}/u
const LONG_NUMBER_PATTERN = /\b\d{9,}\b/u
const URL_PATTERN = /(?:https?:\/\/|www\.)/iu
const SECRET_PATTERN = /(?:api[_-]?key|secret|password|token)\s*[:=]\s*\S+|\bbearer\s+\S+|\b(?:sk|pk)_[A-Z0-9_-]{16,}/iu

export function assertPlan55BlindPackageContext({
  githubActions,
  eventName,
  repository,
  githubRef,
  githubBaseRef,
  event,
  reviewedHeadSha,
  pullRequestNumber,
  checkoutHeadSha,
  workingTreeClean,
  productionBaseAncestor,
  dispatchReviewedHeadSha,
  dispatchPullRequestNumber,
} = {}) {
  const headSha = String(reviewedHeadSha ?? '').toLowerCase()
  const sameRepositoryPullRequest = eventName === 'pull_request' &&
    githubBaseRef === 'main' &&
    event?.repository?.full_name === PLAN55_GITHUB_REPOSITORY &&
    event?.pull_request?.base?.ref === 'main' &&
    event?.pull_request?.head?.repo?.full_name === PLAN55_GITHUB_REPOSITORY &&
    event?.pull_request?.number === pullRequestNumber &&
    String(event?.pull_request?.head?.sha ?? '').toLowerCase() === headSha
  const exactMainDispatch = eventName === 'workflow_dispatch' &&
    githubRef === 'refs/heads/main' &&
    String(dispatchReviewedHeadSha ?? '').toLowerCase() === headSha &&
    String(dispatchPullRequestNumber ?? '') === String(pullRequestNumber)
  if (githubActions !== 'true' || repository !== PLAN55_GITHUB_REPOSITORY ||
      !GIT_SHA_PATTERN.test(headSha) || !Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1 ||
      !(sameRepositoryPullRequest || exactMainDispatch) ||
      String(checkoutHeadSha ?? '').toLowerCase() !== headSha ||
      workingTreeClean !== true || productionBaseAncestor !== true) {
    throw new Error('plan55_blind_holdout_context_invalid')
  }
  return Object.freeze({ reviewedHeadSha: headSha, pullRequestNumber })
}

export function buildPlan55BlindHoldoutPackage({
  reviewedHeadSha,
  holdoutCasesByService,
  holdoutHashes,
  corpusHashes,
  playbookHashes,
  actorGuardFileBlobSha,
} = {}) {
  const headSha = String(reviewedHeadSha ?? '').toLowerCase()
  const guardBlobSha = String(actorGuardFileBlobSha ?? '').toLowerCase()
  if (!GIT_SHA_PATTERN.test(headSha) || !GIT_SHA_PATTERN.test(guardBlobSha)) fail()

  const normalizedHoldoutHashes = validateDigestMap(holdoutHashes)
  const normalizedCorpusHashes = validateDigestMap(corpusHashes)
  const normalizedPlaybookHashes = validateDigestMap(playbookHashes)
  const normalizedCases = validateCases(holdoutCasesByService)
  const labelsSha256 = plan55HoldoutLabelsSha256(holdoutCasesByService)
  const holdoutRootSha256 = hashHoldoutRoot(normalizedHoldoutHashes)
  const independentReviewBody = buildPlan55HoldoutReviewBody({
    reviewedHeadSha: headSha,
    holdoutHashes: normalizedHoldoutHashes,
    labelsSha256,
    actorGuardFileBlobSha: guardBlobSha,
  })

  const payload = {
    schema: 'plan55-independent-blind-holdout-package/v1',
    reviewed_head_sha: headSha,
    coverage: {
      service_count: SERVICES.length,
      case_count_per_service: 24,
      total_case_count: SERVICES.length * 24,
    },
    holdout_hashes: normalizedHoldoutHashes,
    corpus_hashes: normalizedCorpusHashes,
    playbook_hashes: normalizedPlaybookHashes,
    holdout_root_sha256: holdoutRootSha256,
    labels_sha256: labelsSha256,
    actor_guard_file_blob_sha1: guardBlobSha,
    cases_by_service: normalizedCases,
    independent_review_body: independentReviewBody,
  }
  const packageSha256 = `sha256:${createHash('sha256').update(canonicalJson(payload)).digest('hex')}`
  return Object.freeze({ ...payload, package_sha256: packageSha256 })
}

function validateDigestMap(value) {
  if (!isRecord(value) || Object.keys(value).sort().join('\n') !== [...SERVICES].sort().join('\n')) fail()
  return Object.fromEntries(SERVICES.map((service) => {
    const digest = String(value[service] ?? '').toLowerCase()
    if (!SHA256_PATTERN.test(digest)) fail()
    return [service, digest]
  }))
}

function validateCases(value) {
  if (!isRecord(value) || Object.keys(value).sort().join('\n') !== [...SERVICES].sort().join('\n')) fail()
  return Object.fromEntries(SERVICES.map((service) => {
    const cases = value[service]
    if (!Array.isArray(cases) || cases.length !== 24) fail()
    const ids = new Set()
    const blindedCases = cases.map((item) => {
      if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 200 ||
          !isRecord(item.expected) || Object.keys(item.expected).length === 0 ||
          typeof item.input_text_vi !== 'string' || !item.input_text_vi.trim() || item.input_text_vi.length > 8000) fail()
      if (ids.has(item.id) || containsSensitiveContent(`${item.id}\n${item.input_text_vi}`)) fail()
      ids.add(item.id)
      return Object.freeze({ id: item.id, input_text_vi: item.input_text_vi })
    })
    return [service, Object.freeze(blindedCases)]
  }))
}

function hashHoldoutRoot(holdoutHashes) {
  const entries = Object.keys(holdoutHashes).sort().map((service) =>
    `${service}=${holdoutHashes[service].slice('sha256:'.length)}`)
  return createHash('sha256').update(entries.join('\n')).digest('hex')
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value))
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

function containsSensitiveContent(value) {
  return EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value) || LONG_NUMBER_PATTERN.test(value) ||
    URL_PATTERN.test(value) || SECRET_PATTERN.test(value)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail() {
  throw new Error('plan55_blind_holdout_package_invalid')
}
