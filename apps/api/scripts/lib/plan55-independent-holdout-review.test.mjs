import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  PLAN55_SERVICE_ORDER,
  assertPlan55IndependentHoldoutProof,
} from './plan55-production-canary-core.mjs'
import { PLAN55_SOURCE_ASSETS } from './kael-playbook-production-attestation.mjs'
import {
  buildPlan55HoldoutReviewBody,
  createPlan55GithubReviewEvidenceProvider,
  verifyPlan55IndependentHoldoutReviewEvidence,
} from './plan55-independent-holdout-review.mjs'

const repository = 'manhtu0407/HomeServices-'
const sourceSha = 'a'.repeat(40)
const reviewedHeadSha = 'b'.repeat(40)
const productionBaseSha = '645c907e178f21ddde24a72501e6c8449d6720f9'
const productionBaseBranch = 'codex/plan55-production-base-645c907e-review'
const hash = (value) => createHash('sha256').update(value).digest('hex')
const identityHash = (id) => `sha256:${hash(String(id))}`
const guardPath = 'supabase/functions/mobile-api/_shared/kael/learning/playbooks/flags.ts'
const guardSource = 'export function isKaelPlaybookEnabled() { return false }'
const gitBlobSha = (value) => createHash('sha1')
  .update(`blob ${Buffer.byteLength(value)}\0`, 'utf8')
  .update(value)
  .digest('hex')
const guardBlobSha = gitBlobSha(guardSource)

function buildFixture() {
  const holdoutHashes = Object.fromEntries(PLAN55_SERVICE_ORDER.map((service, index) => [
    service,
    `sha256:${String(index + 1).repeat(64)}`,
  ]))
  const authorId = 400
  const reviewerIds = [401, 402]
  const labelsHashes = [`sha256:${'c'.repeat(64)}`, `sha256:${'d'.repeat(64)}`]
  const reviewIds = [1101, 1102]
  const proof = {
    schema: 'plan55-independent-holdout-proof/v2',
    status: 'PASS',
    blinded: true,
    reviewed_by_author: false,
    source_sha: sourceSha,
    author_id_sha256: identityHash(authorId),
    review_evidence: {
      repository,
      pull_request_number: 55,
      reviewed_head_sha: reviewedHeadSha,
      production_source_base_branch: productionBaseBranch,
      production_source_base_sha: productionBaseSha,
      actor_guard_file_blob_sha1: guardBlobSha,
      review_ids: reviewIds,
    },
    reviewer_attestations: reviewerIds.map((reviewerId, index) => ({
      review_id: reviewIds[index],
      reviewer_id_sha256: identityHash(reviewerId),
      labels_sha256: labelsHashes[index],
    })),
    holdouts: Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service, {
      path: PLAN55_SOURCE_ASSETS[service].holdout,
      sha256: holdoutHashes[service],
      case_count: 24,
    }])),
  }
  const pullRequest = {
    number: 55,
    state: 'closed',
    merged: true,
    merged_at: '2026-09-30T00:00:00Z',
    merge_commit_sha: sourceSha,
    base: { ref: productionBaseBranch, repo: { full_name: repository } },
    head: { sha: reviewedHeadSha, repo: { full_name: repository } },
    user: { id: authorId },
  }
  const reviews = reviewerIds.map((reviewerId, index) => ({
    id: reviewIds[index],
    user: { id: reviewerId },
    author_association: 'COLLABORATOR',
    state: 'APPROVED',
    commit_id: reviewedHeadSha,
    submitted_at: `2026-09-29T0${index + 1}:00:00Z`,
    body: buildPlan55HoldoutReviewBody({
      reviewedHeadSha,
      holdoutHashes,
      labelsSha256: labelsHashes[index],
      actorGuardFileBlobSha: guardBlobSha,
    }),
  }))
  const mergeCommit = {
    sha: sourceSha,
    parents: [{ sha: productionBaseSha }, { sha: reviewedHeadSha }],
  }
  return { proof, pullRequest, mergeCommit, reviews, holdoutHashes, authorId, reviewerIds, reviewIds }
}

function buildGithubProviderFixture(overrides = {}) {
  const fixture = buildFixture()
  const guardTestPath = 'apps/api/src/__tests__/unit/kael-playbook-registry-pillar.test.ts'
  const apiPackagePath = 'apps/api/package.json'
  const workflowPath = '.github/workflows/ci.yml'
  const fileContents = {
    [guardPath]: guardSource,
    [guardTestPath]: [
      'narrows an enabled canary to its configured authenticated actor',
      'expect(isKaelPlaybookEnabled("plumbing", allowedActorId)).toBe(true)',
      'expect(isKaelPlaybookEnabled("plumbing", otherActorId)).toBe(false)',
      'fails closed on an invalid canary flag instead of falling back to a legacy global flag',
    ].join('\n'),
    [apiPackagePath]: JSON.stringify({ devDependencies: { vitest: '^3.0.0' } }),
    [workflowPath]: [
      'name: ci',
      'jobs:',
      '  plan55-actor-guard:',
      '    name: plan55-actor-scoped-guard-tests',
      '    steps:',
      '      - name: Actor-scoped guard tests',
      '        run: pnpm --filter @nestscout/api exec vitest run src/__tests__/unit/kael-playbook-registry-pillar.test.ts --passWithNoTests=false',
    ].join('\n'),
  }
  const blobs = Object.fromEntries(Object.entries(fileContents).map(([path, content]) => [path, gitBlobSha(content)]))
  assert.equal(blobs[guardPath], guardBlobSha)
  const sourceAttestation = {
    schema: 'plan55-production-source-attestation/v1',
    deployment: { project_ref: 'iwevizmsedyqozxlawwl', git_sha: sourceSha },
    runtime_files: [{
      path: guardPath,
      git_blob_sha1: guardBlobSha,
      deployed_sha256: `sha256:${'9'.repeat(64)}`,
      working_tree_sha256: `sha256:${'9'.repeat(64)}`,
      working_tree_matches_release_after_git_clean_filter: true,
    }],
  }
  const checkRun = {
    id: 9001,
    name: 'plan55-actor-scoped-guard-tests',
    head_sha: reviewedHeadSha,
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-09-29T10:00:00Z',
    completed_at: '2026-09-29T10:10:00Z',
    app: { slug: 'github-actions' },
  }
  return {
    ...fixture,
    guardPath,
    sourceAttestation,
    blobs,
    fileContents,
    checkRun,
    overrides,
  }
}

test('independent holdout proof is tied to the merged Production source and two real PR approvals', () => {
  const fixture = buildFixture()
  const verified = verifyPlan55IndependentHoldoutReviewEvidence({
    proof: fixture.proof,
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: fixture.holdoutHashes,
    pullRequest: fixture.pullRequest,
    mergeCommit: fixture.mergeCommit,
    reviews: fixture.reviews,
  })

  assert.equal(assertPlan55IndependentHoldoutProof(verified, sourceSha, fixture.holdoutHashes), true)
  assert.deepEqual(verified.github_review_verification.review_ids, fixture.reviewIds)
})

test('independent holdout proof rejects fabricated, stale, author, and untrusted review evidence', () => {
  const fixture = buildFixture()
  const verify = (overrides = {}) => verifyPlan55IndependentHoldoutReviewEvidence({
    proof: fixture.proof,
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: fixture.holdoutHashes,
    pullRequest: fixture.pullRequest,
    mergeCommit: fixture.mergeCommit,
    reviews: fixture.reviews,
    ...overrides,
  })

  assert.throws(() => verify({
    proof: {
      ...fixture.proof,
      reviewer_attestations: fixture.proof.reviewer_attestations.map((review) => ({
        ...review,
        reviewer_id_sha256: identityHash(fixture.authorId),
      })),
    },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    pullRequest: { ...fixture.pullRequest, merge_commit_sha: 'e'.repeat(40) },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    mergeCommit: { ...fixture.mergeCommit, parents: [{ sha: 'c'.repeat(40) }, { sha: reviewedHeadSha }] },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    mergeCommit: { ...fixture.mergeCommit, parents: [{ sha: productionBaseSha }, { sha: 'c'.repeat(40) }] },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    proof: {
      ...fixture.proof,
      review_evidence: { ...fixture.proof.review_evidence, production_source_base_sha: '0'.repeat(40) },
    },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    pullRequest: { ...fixture.pullRequest, base: { ...fixture.pullRequest.base, ref: 'main' } },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    pullRequest: {
      ...fixture.pullRequest,
      base: { ...fixture.pullRequest.base, ref: 'codex/plan55-production-base-645c907e' },
    },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    reviews: fixture.reviews.map((review, index) => index === 1
      ? { ...review, commit_id: 'f'.repeat(40) }
      : review),
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    reviews: fixture.reviews.map((review) => ({
      ...review,
      body: review.body.replace(`production_source_base_sha=${productionBaseSha}`, `production_source_base_sha=${'0'.repeat(40)}`),
    })),
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    reviews: fixture.reviews.map((review) => ({ ...review, author_association: 'CONTRIBUTOR' })),
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
})

test('GitHub provider discovers the exact merged source, derives independent reviews, and proves guard checks', async () => {
  const fixture = buildGithubProviderFixture()
  const calls = []
  const provider = createPlan55GithubReviewEvidenceProvider({
    cwd: 'C:/repo',
    execFileSyncImpl(command, args, options) {
      calls.push({ command, args, options })
      const endpoint = args[1]
      if (endpoint === `repos/${repository}/commits/${sourceSha}/pulls?per_page=100&page=1`) {
        return JSON.stringify([{ number: 55, merge_commit_sha: sourceSha }])
      }
      if (endpoint === `repos/${repository}/commits/${sourceSha}`) {
        return JSON.stringify(fixture.mergeCommit)
      }
      if (args[1] === 'repos/manhtu0407/HomeServices-/pulls/55') {
        return JSON.stringify(fixture.pullRequest)
      }
      if (args[1].endsWith('/reviews?per_page=100&page=1')) {
        return JSON.stringify(fixture.reviews)
      }
      if (args[1] === `repos/${repository}/commits/${reviewedHeadSha}/check-runs?per_page=100&page=1`) {
        return JSON.stringify({ check_runs: [fixture.checkRun] })
      }
      if (endpoint.startsWith(`repos/${repository}/contents/`)) {
        const [path, query] = endpoint
          .slice(`repos/${repository}/contents/`.length)
          .split('?ref=')
        assert.ok([sourceSha, reviewedHeadSha].includes(query))
        return JSON.stringify({
          sha: fixture.blobs[path],
          encoding: 'base64',
          content: Buffer.from(fixture.fileContents[path]).toString('base64'),
        })
      }
      throw new Error('unexpected_github_request')
    },
  })

  const result = await provider({
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: fixture.holdoutHashes,
    expectedHoldoutCaseCounts: Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service, 24])),
    sourceAttestation: fixture.sourceAttestation,
  })
  assert.equal(result.proof.review_evidence.pull_request_number, 55)
  assert.deepEqual(result.proof.review_evidence.review_ids, fixture.reviewIds)
  assert.deepEqual(result.proof.github_review_verification.review_ids, fixture.reviewIds)
  assert.equal(result.actorGuardProof.source_sha, sourceSha)
  assert.equal(result.actorGuardProof.runtime_file_path, fixture.guardPath)
  assert.equal(result.actorGuardProof.runtime_file_sha256, fixture.sourceAttestation.runtime_files[0].deployed_sha256)
  assert.equal(result.actorGuardProof.regression_tests_pass, true)
  assert.equal(result.actorGuardProof.verification.check_run_id, fixture.checkRun.id)
  assert.equal(result.pullRequest.number, 55)
  assert.deepEqual(result.reviews, fixture.reviews)
  assert.ok(calls.some((call) => call.args[1].includes(`/commits/${sourceSha}/pulls?`)))
  assert.ok(calls.some((call) => call.args[1].includes(`/commits/${reviewedHeadSha}/check-runs?`)))
  assert.ok(calls.every((call) => call.command === 'gh' && call.options.shell === false))
  assert.ok(calls.every((call) => call.args[1].startsWith('repos/manhtu0407/HomeServices-/')))
})

test('GitHub provider fails closed when the deployed guard, merge source, latest approvals, or CI check drift', async () => {
  const fixture = buildGithubProviderFixture()
  const runProvider = async (overrides = {}) => {
    const calls = []
    const provider = createPlan55GithubReviewEvidenceProvider({
      cwd: 'C:/repo',
      execFileSyncImpl(command, args, options) {
        calls.push({ command, args, options })
        const endpoint = args[1]
        if (endpoint === `repos/${repository}/commits/${sourceSha}/pulls?per_page=100&page=1`) {
          return JSON.stringify(overrides.pullRequests ?? [{ number: 55, merge_commit_sha: sourceSha }])
        }
        if (endpoint === `repos/${repository}/commits/${sourceSha}`) {
          return JSON.stringify(overrides.mergeCommit ?? fixture.mergeCommit)
        }
        if (endpoint === `repos/${repository}/pulls/55`) {
          return JSON.stringify(overrides.pullRequest ?? fixture.pullRequest)
        }
        if (endpoint.endsWith('/reviews?per_page=100&page=1')) {
          return JSON.stringify(overrides.reviews ?? fixture.reviews)
        }
        if (endpoint === `repos/${repository}/commits/${reviewedHeadSha}/check-runs?per_page=100&page=1`) {
          return JSON.stringify({ check_runs: overrides.checkRuns ?? [fixture.checkRun] })
        }
        if (endpoint.startsWith(`repos/${repository}/contents/`)) {
          const [path, query] = endpoint
            .slice(`repos/${repository}/contents/`.length)
            .split('?ref=')
          const refOverride = overrides.contentBlobRef === query && path === fixture.guardPath
          return JSON.stringify({
            sha: refOverride ? '0'.repeat(40) : fixture.blobs[path],
            encoding: 'base64',
            content: Buffer.from(fixture.fileContents[path]).toString('base64'),
          })
        }
        throw new Error('unexpected_github_request')
      },
    })
    return provider({
      expectedSourceSha: sourceSha,
      expectedHoldoutHashes: fixture.holdoutHashes,
      expectedHoldoutCaseCounts: Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service, 24])),
      sourceAttestation: fixture.sourceAttestation,
    })
  }

  await assert.rejects(runProvider({ pullRequests: [] }), {
    message: 'plan55_preflight_independent_holdout_unverified',
  })
  await assert.rejects(runProvider({ pullRequests: [
    { number: 55, merge_commit_sha: sourceSha }, { number: 56, merge_commit_sha: sourceSha },
  ] }), { message: 'plan55_preflight_independent_holdout_unverified' })
  await assert.rejects(runProvider({
    mergeCommit: { ...fixture.mergeCommit, parents: [{ sha: 'c'.repeat(40) }] },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  await assert.rejects(runProvider({
    pullRequest: { ...fixture.pullRequest, base: { ...fixture.pullRequest.base, ref: 'main' } },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  await assert.rejects(runProvider({
    checkRuns: [{ ...fixture.checkRun, conclusion: 'failure' }],
  }), { message: 'plan55_preflight_actor_guard_unverified' })
  await assert.rejects(runProvider({
    checkRuns: [{ ...fixture.checkRun, head_sha: 'c'.repeat(40) }],
  }), { message: 'plan55_preflight_actor_guard_unverified' })
  await assert.rejects(runProvider({
    reviews: fixture.reviews.map((review) => ({ ...review, state: 'COMMENTED' })),
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  await assert.rejects(runProvider({ contentBlobRef: sourceSha }), {
    message: 'plan55_preflight_actor_guard_unverified',
  })
})
