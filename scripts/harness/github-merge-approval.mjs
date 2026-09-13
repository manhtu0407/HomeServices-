import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SHA = /^[0-9a-f]{40}$/u
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u
const LOGIN = /^[A-Za-z0-9-]{1,39}$/u
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u
const API_ROOT = 'https://api.github.com'

export async function resolveReviewedMainMerge(input, fetchImpl = fetch) {
  assertRequest(input)
  const request = (path) => fetchAllJson(`${API_ROOT}/repos/${input.repository}${path}`, input.token, fetchImpl)
  const pullRequests = await request(`/commits/${input.mergeCommitSha}/pulls`)
  const matching = pullRequests.filter((pull) =>
    pull?.state === 'closed' && pull?.merged_at && pull?.base?.ref === 'main' &&
    pull?.merge_commit_sha === input.mergeCommitSha && Number.isSafeInteger(pull?.number),
  )
  if (matching.length !== 1) {
    throw new Error('release SHA must resolve to exactly one merged pull request targeting main')
  }
  const pull = matching[0]
  const reviews = await request(`/pulls/${pull.number}/reviews`)
  const latestByActor = new Map()
  for (const review of reviews) {
    const actor = review?.user?.login
    if (!LOGIN.test(actor ?? '') || !Number.isSafeInteger(review?.id)) continue
    const current = latestByActor.get(actor)
    if (!current || review.id > current.id) latestByActor.set(actor, review)
  }
  const approvals = [...latestByActor.values()].filter((review) =>
    review?.state === 'APPROVED' && review?.commit_id === pull?.head?.sha &&
    review?.user?.type === 'User' && !review.user.login.endsWith('[bot]') &&
    review.user.login !== pull?.user?.login && review.user.login === input.requiredReviewer &&
    ISO.test(review?.submitted_at ?? ''),
  ).sort((left, right) => left.id - right.id)
  if (approvals.length === 0) {
    throw new Error(`merged pull request has no current approval by ${input.requiredReviewer} on its exact head SHA`)
  }
  const review = approvals[0]
  return buildReviewedMainMergeReceipt({
    repository: input.repository,
    requiredReviewer: input.requiredReviewer,
    mergeCommitSha: input.mergeCommitSha,
    pullRequest: {
      number: pull.number,
      url: pull.html_url,
      author: pull.user.login,
      headSha: pull.head.sha,
      mergedAt: pull.merged_at,
      mergedBy: pull.merged_by?.login ?? null,
    },
    review: {
      id: review.id,
      actor: review.user.login,
      commitSha: review.commit_id,
      submittedAt: review.submitted_at,
    },
  })
}

export function buildReviewedMainMergeReceipt(input) {
  const receipt = {
    schemaVersion: 'github-reviewed-main-merge.v2',
    repository: input.repository,
    requiredReviewer: input.requiredReviewer,
    mergeCommitSha: input.mergeCommitSha,
    baseRef: 'main',
    pullRequest: input.pullRequest,
    review: {
      ...input.review,
      state: 'APPROVED',
    },
    source: 'github-rest-api',
    receiptSha256: '',
  }
  receipt.receiptSha256 = receiptSha256(receipt)
  const problems = verifyReviewedMainMergeReceipt(receipt)
  if (problems.length > 0) throw new Error(problems.join('; '))
  return Object.freeze(receipt)
}

export function verifyReviewedMainMergeReceipt(receipt) {
  const problems = []
  if (receipt?.schemaVersion !== 'github-reviewed-main-merge.v2' || receipt?.source !== 'github-rest-api') {
    problems.push('merge approval receipt schema is invalid')
  }
  if (!REPOSITORY.test(receipt?.repository ?? '') || !SHA.test(receipt?.mergeCommitSha ?? '') ||
      receipt?.baseRef !== 'main') problems.push('merge approval target is invalid')
  const pull = receipt?.pullRequest
  if (!Number.isSafeInteger(pull?.number) || pull.number < 1 ||
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/u.test(pull?.url ?? '') ||
      !LOGIN.test(pull?.author ?? '') || !SHA.test(pull?.headSha ?? '') ||
      !ISO.test(pull?.mergedAt ?? '') || (pull?.mergedBy !== null && !LOGIN.test(pull?.mergedBy ?? ''))) {
    problems.push('merge approval pull request identity is invalid')
  }
  const review = receipt?.review
  if (!LOGIN.test(receipt?.requiredReviewer ?? '') || !Number.isSafeInteger(review?.id) || review.id < 1 ||
      !LOGIN.test(review?.actor ?? '') || review?.actor !== receipt.requiredReviewer ||
      review?.state !== 'APPROVED' || !ISO.test(review?.submittedAt ?? '') ||
      review?.commitSha !== pull?.headSha || review?.actor === pull?.author) {
    problems.push('merge approval review identity is invalid')
  }
  if (!/^[0-9a-f]{64}$/u.test(receipt?.receiptSha256 ?? '') ||
      receipt.receiptSha256 !== receiptSha256(receipt)) {
    problems.push('merge approval receipt checksum mismatch')
  }
  return [...new Set(problems)]
}

function receiptSha256(receipt) {
  return createHash('sha256').update(canonicalJson({ ...receipt, receiptSha256: undefined })).digest('hex')
}

async function fetchAllJson(baseUrl, token, fetchImpl) {
  const values = []
  for (let page = 1; page <= 10; page += 1) {
    const separator = baseUrl.includes('?') ? '&' : '?'
    const response = await fetchImpl(`${baseUrl}${separator}per_page=100&page=${page}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!response?.ok) throw new Error(`GitHub merge approval lookup failed with HTTP ${response?.status ?? 'unknown'}`)
    const pageValues = await response.json()
    if (!Array.isArray(pageValues)) throw new Error('GitHub merge approval lookup returned an invalid collection')
    values.push(...pageValues)
    if (pageValues.length < 100) return values
  }
  throw new Error('GitHub merge approval lookup exceeded the bounded pagination limit')
}

function assertRequest(input) {
  if (!REPOSITORY.test(input?.repository ?? '') || !SHA.test(input?.mergeCommitSha ?? '') ||
      !LOGIN.test(input?.requiredReviewer ?? '') ||
      typeof input?.token !== 'string' || input.token.length < 20) {
    throw new Error('GitHub merge approval request identity is invalid')
  }
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

function parseArgs(args) {
  const parsed = {}
  const allowed = new Set(['--repository', '--merge-sha', '--reviewer', '--output'])
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!allowed.has(key)) throw new Error(`unknown argument: ${key}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    parsed[key] = value
  }
  for (const key of allowed) if (!parsed[key]) throw new Error(`${key} is required`)
  return parsed
}

function resolveInsideRoot(path) {
  const absolute = resolve(ROOT, path)
  const local = relative(ROOT, absolute)
  if (!local || local.startsWith('..')) throw new Error(`merge approval output escapes repository root: ${path}`)
  return absolute
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const receipt = await resolveReviewedMainMerge({
    repository: args['--repository'],
    mergeCommitSha: args['--merge-sha'],
    requiredReviewer: args['--reviewer'],
    token: process.env.GITHUB_TOKEN,
  })
  const output = resolveInsideRoot(args['--output'])
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`)
  process.stdout.write(`Reviewed main merge receipt written: ${relative(ROOT, output).replaceAll('\\', '/')}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`github-merge-approval failed: ${error.message}\n`)
    process.exitCode = 1
  })
}
