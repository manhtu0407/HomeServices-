import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolveReviewedMainMerge, verifyReviewedMainMergeReceipt } from './github-merge-approval.mjs'

const mergeSha = 'a'.repeat(40)
const headSha = 'b'.repeat(40)
const pull = {
  number: 205,
  state: 'closed',
  merged_at: '2026-08-23T01:02:03Z',
  merge_commit_sha: mergeSha,
  html_url: 'https://github.com/nestscout/app/pull/205',
  base: { ref: 'main' },
  head: { sha: headSha },
  user: { login: 'feature-author' },
  merged_by: { login: 'merge-owner' },
}

function githubFetch({ pulls = [pull], reviews = [] } = {}) {
  return async (url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${'t'.repeat(40)}`)
    if (url.includes('/commits/')) return response(pulls)
    if (url.includes('/reviews')) return response(reviews)
    return response([], 404)
  }
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

test('Production release workflow has no GitHub reviewer gate', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/release-production.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(workflow, /github-merge-approval\.mjs/u)
  assert.doesNotMatch(workflow, /--reviewer\b/u)
  assert.doesNotMatch(workflow, /merge-approval/u)
})

test('resolves one exact merged-main PR and separate approval on its current head', async () => {
  const receipt = await resolveReviewedMainMerge({
    repository: 'nestscout/app', mergeCommitSha: mergeSha, requiredReviewer: 'kouuuuuu', token: 't'.repeat(40),
  }, githubFetch({
    reviews: [{
      id: 88,
      state: 'APPROVED',
      commit_id: headSha,
      submitted_at: '2026-08-23T00:59:00Z',
      user: { login: 'kouuuuuu', type: 'User' },
    }],
  }))
  assert.equal(receipt.pullRequest.number, 205)
  assert.equal(receipt.requiredReviewer, 'kouuuuuu')
  assert.equal(receipt.review.actor, 'kouuuuuu')
  assert.deepEqual(verifyReviewedMainMergeReceipt(receipt), [])
})

test('rejects direct pushes, stale-head approvals, self-approval, and a later non-approval', async () => {
  const input = {
    repository: 'nestscout/app', mergeCommitSha: mergeSha, requiredReviewer: 'kouuuuuu', token: 't'.repeat(40),
  }
  await assert.rejects(resolveReviewedMainMerge(input, githubFetch({ pulls: [] })), /exactly one merged pull request/u)
  await assert.rejects(resolveReviewedMainMerge(input, githubFetch({ reviews: [{
    id: 1, state: 'APPROVED', commit_id: 'c'.repeat(40), submitted_at: '2026-08-23T00:59:00Z',
    user: { login: 'kouuuuuu', type: 'User' },
  }] })), /no current approval by kouuuuuu/u)
  await assert.rejects(resolveReviewedMainMerge(input, githubFetch({ reviews: [{
    id: 1, state: 'APPROVED', commit_id: headSha, submitted_at: '2026-08-23T00:59:00Z',
    user: { login: 'feature-author', type: 'User' },
  }] })), /no current approval by kouuuuuu/u)
  await assert.rejects(resolveReviewedMainMerge(input, githubFetch({ reviews: [
    { id: 1, state: 'APPROVED', commit_id: headSha, submitted_at: '2026-08-23T00:58:00Z', user: { login: 'kouuuuuu', type: 'User' } },
    { id: 2, state: 'CHANGES_REQUESTED', commit_id: headSha, submitted_at: '2026-08-23T00:59:00Z', user: { login: 'kouuuuuu', type: 'User' } },
  ] })), /no current approval by kouuuuuu/u)
})

test('checksum rejects any post-resolution PR or review mutation', async () => {
  const receipt = await resolveReviewedMainMerge({
    repository: 'nestscout/app', mergeCommitSha: mergeSha, requiredReviewer: 'kouuuuuu', token: 't'.repeat(40),
  }, githubFetch({ reviews: [{
    id: 88, state: 'APPROVED', commit_id: headSha, submitted_at: '2026-08-23T00:59:00Z',
    user: { login: 'kouuuuuu', type: 'User' },
  }] }))
  assert.match(verifyReviewedMainMergeReceipt({
    ...receipt, review: { ...receipt.review, actor: 'another-reviewer' },
  }).join('; '), /checksum/u)
})
