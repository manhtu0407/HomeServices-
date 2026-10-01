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
  createPlan55GithubIndependentHoldoutPreflightProvider,
  plan55HoldoutLabelsSha256,
  verifyPlan55IndependentHoldoutReviewEvidence,
} from './plan55-independent-holdout-review.mjs'

const repository = 'manhtu0407/HomeServices-'
const sourceSha = 'a'.repeat(40)
const reviewedHeadSha = 'b'.repeat(40)
const productionBaseSha = '891b1e26dd9a785f05671002c5e74cb270678be4'
const productionBaseBranch = 'codex/plan55-production-base-891b1e26-review-v2'
const productionTargetBranch = 'main'
const productionMergeBaseSha = 'c'.repeat(40)
const productionTargetBranchTipSha = 'd'.repeat(40)
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
  const casesByService = Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service,
    Array.from({ length: 24 }, (_, index) => ({
      id: `${service}-holdout-${String(index + 1).padStart(2, '0')}`,
      expected: { scope_signal: 'in_scope', suggested_service: service },
    })),
  ]))
  const holdoutLabelsSha256 = plan55HoldoutLabelsSha256(casesByService)
  const labelsHashes = [holdoutLabelsSha256, holdoutLabelsSha256]
  const reviewIds = [1101, 1102]
  const proof = {
    schema: 'plan55-independent-holdout-proof/v4',
    status: 'PASS',
    blinded: true,
    reviewed_by_author: false,
    source_sha: sourceSha,
    holdout_labels_sha256: holdoutLabelsSha256,
    author_id_sha256: identityHash(authorId),
    review_evidence: {
      repository,
      pull_request_number: 55,
      reviewed_head_sha: reviewedHeadSha,
      production_source_base_branch: productionBaseBranch,
      production_source_base_sha: productionBaseSha,
      production_source_target_branch: productionTargetBranch,
      production_source_target_branch_tip_sha: productionTargetBranchTipSha,
      production_source_target_branch_ancestry_status: 'ahead',
      production_source_base_ancestry_status: 'ahead',
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
    base: { ref: productionTargetBranch, sha: productionTargetBranchTipSha, repo: { full_name: repository } },
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
    parents: [{ sha: productionMergeBaseSha }],
    plan55ProductionBaseComparison: {
      status: 'ahead',
      base_commit: { sha: productionBaseSha },
      head_commit: { sha: sourceSha },
    },
    plan55TargetBranchComparison: {
      status: 'ahead',
      base_commit: { sha: sourceSha },
      head_commit: { sha: productionTargetBranchTipSha },
    },
  }
  return {
    proof, pullRequest, mergeCommit, reviews, holdoutHashes, holdoutLabelsSha256, casesByService,
    authorId, reviewerIds, reviewIds,
  }
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
      "    if: ${{ !cancelled() && github.event_name == 'pull_request' && needs.controls.outputs.kael == 'true' }}",
      '    steps:',
      '      - name: Run actor-scoped Production guard tests',
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
    details_url: `https://github.com/${repository}/actions/runs/8000/job/9001`,
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-09-29T10:00:00Z',
    completed_at: '2026-09-29T10:10:00Z',
    app: { slug: 'github-actions' },
  }
  const workflowRun = {
    id: 8000,
    run_attempt: 1,
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    head_sha: reviewedHeadSha,
    status: 'completed',
    conclusion: 'success',
  }
  const workflowJob = {
    id: 9001,
    run_id: workflowRun.id,
    run_attempt: workflowRun.run_attempt,
    head_sha: reviewedHeadSha,
    name: 'plan55-actor-guard',
    status: 'completed',
    conclusion: 'success',
    steps: [{
      name: 'Run actor-scoped Production guard tests',
      status: 'completed',
      conclusion: 'success',
    }],
  }
  return {
    ...fixture,
    guardPath,
    sourceAttestation,
    blobs,
    fileContents,
    checkRun,
    workflowRun,
    workflowJob,
    overrides,
  }
}

test('independent holdout proof is tied to the merged Production source and current non-author PR approval', () => {
  const fixture = buildFixture()
  const verified = verifyPlan55IndependentHoldoutReviewEvidence({
    proof: fixture.proof,
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: fixture.holdoutHashes,
    expectedHoldoutLabelsSha256: fixture.holdoutLabelsSha256,
    pullRequest: fixture.pullRequest,
    mergeCommit: fixture.mergeCommit,
    reviews: fixture.reviews,
  })

  assert.equal(assertPlan55IndependentHoldoutProof(
    verified, sourceSha, fixture.holdoutHashes, fixture.holdoutLabelsSha256,
  ), true)
  assert.deepEqual(verified.github_review_verification.review_ids, fixture.reviewIds)
})

test('one current non-author reviewer can independently attest the frozen holdout labels', () => {
  const fixture = buildFixture()
  const reviewId = fixture.reviewIds[0]
  const proof = {
    ...fixture.proof,
    review_evidence: {
      ...fixture.proof.review_evidence,
      review_ids: [reviewId],
    },
    reviewer_attestations: fixture.proof.reviewer_attestations.filter((item) => item.review_id === reviewId),
  }
  const verified = verifyPlan55IndependentHoldoutReviewEvidence({
    proof,
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: fixture.holdoutHashes,
    expectedHoldoutLabelsSha256: fixture.holdoutLabelsSha256,
    pullRequest: fixture.pullRequest,
    mergeCommit: fixture.mergeCommit,
    reviews: fixture.reviews.filter((review) => review.id === reviewId),
  })

  assert.equal(verified.status, 'PASS')
  assert.deepEqual(verified.github_review_verification.review_ids, [reviewId])
  assert.equal(assertPlan55IndependentHoldoutProof(
    verified, sourceSha, fixture.holdoutHashes, fixture.holdoutLabelsSha256,
  ), true)

  assert.throws(() => verifyPlan55IndependentHoldoutReviewEvidence({
    proof: {
      ...proof,
      review_evidence: { ...proof.review_evidence, review_ids: [] },
      reviewer_attestations: [],
    },
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: fixture.holdoutHashes,
    expectedHoldoutLabelsSha256: fixture.holdoutLabelsSha256,
    pullRequest: fixture.pullRequest,
    mergeCommit: fixture.mergeCommit,
    reviews: [],
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
})

test('holdout label digest is deterministic and bound to the expected labels', () => {
  const fixture = buildFixture()
  const reversedServices = Object.fromEntries(Object.entries(fixture.casesByService).reverse())
  const reversedCases = Object.fromEntries(Object.entries(fixture.casesByService).map(([service, cases]) => [
    service,
    [...cases].reverse(),
  ]))
  assert.equal(plan55HoldoutLabelsSha256(reversedServices), fixture.holdoutLabelsSha256)
  assert.equal(plan55HoldoutLabelsSha256(reversedCases), fixture.holdoutLabelsSha256)

  const changedLabels = structuredClone(fixture.casesByService)
  changedLabels[PLAN55_SERVICE_ORDER[0]][0].expected.suggested_service = 'other'
  assert.notEqual(plan55HoldoutLabelsSha256(changedLabels), fixture.holdoutLabelsSha256)
})

test('independent holdout proof rejects fabricated, stale, author, and untrusted review evidence', () => {
  const fixture = buildFixture()
  const verify = (overrides = {}) => verifyPlan55IndependentHoldoutReviewEvidence({
    proof: fixture.proof,
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: fixture.holdoutHashes,
    expectedHoldoutLabelsSha256: fixture.holdoutLabelsSha256,
    pullRequest: fixture.pullRequest,
    mergeCommit: fixture.mergeCommit,
    reviews: fixture.reviews,
    ...overrides,
  })

  const verified = verify()
  assert.throws(() => assertPlan55IndependentHoldoutProof({
    ...verified,
    github_review_verification: null,
  }, sourceSha, fixture.holdoutHashes, fixture.holdoutLabelsSha256), {
    message: 'plan55_preflight_independent_holdout_unverified',
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
  for (const parents of [
    [{ sha: productionMergeBaseSha }],
    [{ sha: productionMergeBaseSha }, { sha: reviewedHeadSha }],
    [{ sha: reviewedHeadSha }],
  ]) assert.equal(verify({ mergeCommit: { ...fixture.mergeCommit, parents } }).status, 'PASS')
  assert.throws(() => verify({
    mergeCommit: { ...fixture.mergeCommit, parents: [{ sha: 'not-a-git-sha' }] },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    proof: {
      ...fixture.proof,
      review_evidence: { ...fixture.proof.review_evidence, production_source_base_sha: '0'.repeat(40) },
    },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    proof: {
      ...fixture.proof,
      review_evidence: { ...fixture.proof.review_evidence, production_source_target_branch: 'release/other' },
    },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    proof: {
      ...fixture.proof,
      review_evidence: { ...fixture.proof.review_evidence, production_source_base_ancestry_status: 'diverged' },
    },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    expectedHoldoutLabelsSha256: `sha256:${'0'.repeat(64)}`,
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    reviews: fixture.reviews.map((review) => ({
      ...review,
      body: review.body.replace(
        `labels_sha256=${fixture.holdoutLabelsSha256.slice('sha256:'.length)}`,
        `labels_sha256=${'0'.repeat(64)}`,
      ),
    })),
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    pullRequest: { ...fixture.pullRequest, base: { ...fixture.pullRequest.base, ref: 'release/other' } },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    mergeCommit: {
      ...fixture.mergeCommit,
      plan55TargetBranchComparison: {
        ...fixture.mergeCommit.plan55TargetBranchComparison,
        head_commit: { sha: 'e'.repeat(40) },
      },
    },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    mergeCommit: {
      ...fixture.mergeCommit,
      plan55ProductionBaseComparison: {
        ...fixture.mergeCommit.plan55ProductionBaseComparison,
        status: 'diverged',
      },
    },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  assert.throws(() => verify({
    mergeCommit: {
      ...fixture.mergeCommit,
      plan55ProductionBaseComparison: {
        ...fixture.mergeCommit.plan55ProductionBaseComparison,
        head_commit: { sha: 'd'.repeat(40) },
      },
    },
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
      if (endpoint === `repos/${repository}/branches/${productionTargetBranch}`) {
        return JSON.stringify({ commit: { sha: productionTargetBranchTipSha } })
      }
      if (endpoint === `repos/${repository}/compare/${productionBaseSha}...${sourceSha}`) {
        return JSON.stringify(fixture.mergeCommit.plan55ProductionBaseComparison)
      }
      if (endpoint === `repos/${repository}/compare/${sourceSha}...${productionTargetBranchTipSha}`) {
        return JSON.stringify(fixture.mergeCommit.plan55TargetBranchComparison)
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
      if (endpoint === `repos/${repository}/actions/runs/8000`) {
        return JSON.stringify(fixture.workflowRun)
      }
      if (endpoint === `repos/${repository}/actions/jobs/9001`) {
        return JSON.stringify(fixture.workflowJob)
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
    expectedHoldoutLabelsSha256: fixture.holdoutLabelsSha256,
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

  fixture.reviews = [fixture.reviews[0]]
  const singleReviewerResult = await provider({
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: fixture.holdoutHashes,
    expectedHoldoutLabelsSha256: fixture.holdoutLabelsSha256,
    expectedHoldoutCaseCounts: Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service, 24])),
    sourceAttestation: fixture.sourceAttestation,
  })
  assert.equal(singleReviewerResult.proof.github_review_verification.review_ids.length, 1)
  assert.deepEqual(singleReviewerResult.reviews, fixture.reviews)
})

test('GitHub provider fails closed when the deployed guard, merge source, latest approvals, or CI check drift', async () => {
  const fixture = buildGithubProviderFixture()
  const runProvider = async (overrides = {}) => {
    const calls = []
    const targetBranchTipSha = overrides.targetBranchTipSha ?? productionTargetBranchTipSha
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
        if (endpoint === `repos/${repository}/branches/${productionTargetBranch}`) {
          return JSON.stringify({ commit: { sha: targetBranchTipSha } })
        }
        if (endpoint === `repos/${repository}/compare/${productionBaseSha}...${sourceSha}`) {
          return JSON.stringify(overrides.productionBaseComparison ?? fixture.mergeCommit.plan55ProductionBaseComparison)
        }
        if (endpoint === `repos/${repository}/compare/${sourceSha}...${targetBranchTipSha}`) {
          return JSON.stringify(overrides.targetBranchComparison ?? fixture.mergeCommit.plan55TargetBranchComparison)
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
        if (endpoint === `repos/${repository}/actions/runs/8000`) {
          return JSON.stringify(overrides.workflowRun ?? fixture.workflowRun)
        }
        if (endpoint === `repos/${repository}/actions/jobs/9001`) {
          return JSON.stringify(overrides.workflowJob ?? fixture.workflowJob)
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
      expectedHoldoutLabelsSha256: fixture.holdoutLabelsSha256,
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
    pullRequest: { ...fixture.pullRequest, base: { ...fixture.pullRequest.base, ref: 'release/other' } },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  await runProvider({
    pullRequest: { ...fixture.pullRequest, base: { ...fixture.pullRequest.base, sha: 'e'.repeat(40) } },
  })
  await assert.rejects(runProvider({
    productionBaseComparison: {
      ...fixture.mergeCommit.plan55ProductionBaseComparison,
      status: 'behind',
    },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  await assert.rejects(runProvider({
    targetBranchComparison: {
      ...fixture.mergeCommit.plan55TargetBranchComparison,
      status: 'behind',
    },
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  await assert.rejects(runProvider({ targetBranchTipSha: 'not-a-git-sha' }), {
    message: 'plan55_preflight_independent_holdout_unverified',
  })
  for (const parents of [
    [{ sha: productionMergeBaseSha }],
    [{ sha: productionMergeBaseSha }, { sha: reviewedHeadSha }],
    [{ sha: reviewedHeadSha }],
  ]) await runProvider({ mergeCommit: { ...fixture.mergeCommit, parents } })
  await assert.rejects(runProvider({
    checkRuns: [{ ...fixture.checkRun, conclusion: 'failure' }],
  }), { message: 'plan55_preflight_actor_guard_unverified' })
  await assert.rejects(runProvider({
    checkRuns: [{ ...fixture.checkRun, head_sha: 'c'.repeat(40) }],
  }), { message: 'plan55_preflight_actor_guard_unverified' })
  await assert.rejects(runProvider({
    workflowRun: { ...fixture.workflowRun, path: '.github/workflows/unrelated.yml' },
  }), { message: 'plan55_preflight_actor_guard_unverified' })
  await assert.rejects(runProvider({
    workflowJob: {
      ...fixture.workflowJob,
      steps: [{ name: 'Another successful step', status: 'completed', conclusion: 'success' }],
    },
  }), { message: 'plan55_preflight_actor_guard_unverified' })
  await assert.rejects(runProvider({
    reviews: fixture.reviews.map((review) => ({ ...review, state: 'COMMENTED' })),
  }), { message: 'plan55_preflight_independent_holdout_unverified' })
  await assert.rejects(runProvider({ contentBlobRef: sourceSha }), {
    message: 'plan55_preflight_actor_guard_unverified',
  })
})

function createGithubReviewApiFixture(fixture, { reviews = fixture.reviews, checkRuns = [fixture.checkRun] } = {}) {
  const calls = []
  const execFileSyncImpl = (command, args, options) => {
    calls.push({ command, args, options })
    const endpoint = args[1]
    if (endpoint === `repos/${repository}/commits/${sourceSha}/pulls?per_page=100&page=1`) {
      return JSON.stringify([{ number: 55, merge_commit_sha: sourceSha }])
    }
    if (endpoint === `repos/${repository}/commits/${sourceSha}`) {
      return JSON.stringify(fixture.mergeCommit)
    }
    if (endpoint === `repos/${repository}/branches/${productionTargetBranch}`) {
      return JSON.stringify({ commit: { sha: productionTargetBranchTipSha } })
    }
    if (endpoint === `repos/${repository}/compare/${productionBaseSha}...${sourceSha}`) {
      return JSON.stringify(fixture.mergeCommit.plan55ProductionBaseComparison)
    }
    if (endpoint === `repos/${repository}/compare/${sourceSha}...${productionTargetBranchTipSha}`) {
      return JSON.stringify(fixture.mergeCommit.plan55TargetBranchComparison)
    }
    if (endpoint === `repos/${repository}/pulls/55`) {
      return JSON.stringify(fixture.pullRequest)
    }
    if (endpoint === `repos/${repository}/pulls/55/reviews?per_page=100&page=1`) {
      return JSON.stringify(reviews)
    }
    if (endpoint === `repos/${repository}/commits/${reviewedHeadSha}/check-runs?per_page=100&page=1`) {
      return JSON.stringify({ check_runs: checkRuns })
    }
    if (endpoint === `repos/${repository}/actions/runs/8000`) {
      return JSON.stringify(fixture.workflowRun)
    }
    if (endpoint === `repos/${repository}/actions/jobs/9001`) {
      return JSON.stringify(fixture.workflowJob)
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
  }
  return { calls, execFileSyncImpl }
}

test('pre-deployment holdout gate proves exact independent approvals and guard CI without deployment attestation', async () => {
  const fixture = buildGithubProviderFixture()
  const api = createGithubReviewApiFixture(fixture)
  const provider = createPlan55GithubIndependentHoldoutPreflightProvider({
    cwd: 'C:/repo',
    execFileSyncImpl: api.execFileSyncImpl,
  })
  const evidence = await provider({
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: fixture.holdoutHashes,
    expectedHoldoutCaseCounts: Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service, 24])),
    expectedHoldoutLabelsSha256: fixture.holdoutLabelsSha256,
  })

  assert.deepEqual(evidence, {
    schema: 'plan55-predeployment-holdout-review/v1',
    status: 'PASS',
    source_sha: sourceSha,
    pull_request_number: 55,
    reviewed_head_sha: reviewedHeadSha,
    review_count: 2,
    actor_guard_check_run_id: fixture.checkRun.id,
    production_source_target_branch: productionTargetBranch,
    production_source_target_branch_tip_sha: productionTargetBranchTipSha,
    production_source_target_branch_ancestry_status: 'ahead',
    production_source_base_ancestry_status: 'ahead',
    holdout_root_sha256: createHash('sha256')
      .update(Object.keys(fixture.holdoutHashes).sort()
        .map((service) => `${service}=${fixture.holdoutHashes[service].slice('sha256:'.length)}`)
        .join('\n'))
      .digest('hex'),
  })
  assert.ok(api.calls.length > 0)
  assert.ok(api.calls.every((call) => call.command === 'gh' && call.options.shell === false))
  assert.ok(api.calls.every((call) => call.args.length === 2 && call.args[0] === 'api'))
  assert.doesNotMatch(JSON.stringify(evidence), /reviewer_id|401|402/u)

  const missingApprovals = createGithubReviewApiFixture(fixture, {
    reviews: fixture.reviews.map((review) => ({ ...review, state: 'COMMENTED' })),
  })
  const blockedProvider = createPlan55GithubIndependentHoldoutPreflightProvider({
    cwd: 'C:/repo',
    execFileSyncImpl: missingApprovals.execFileSyncImpl,
  })
  await assert.rejects(blockedProvider({
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: fixture.holdoutHashes,
    expectedHoldoutCaseCounts: Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service, 24])),
    expectedHoldoutLabelsSha256: fixture.holdoutLabelsSha256,
  }), { message: 'plan55_preflight_independent_holdout_unverified' })

  const failedGuardChecks = createGithubReviewApiFixture(fixture, {
    checkRuns: [{ ...fixture.checkRun, conclusion: 'failure' }],
  })
  const failedCheckProvider = createPlan55GithubIndependentHoldoutPreflightProvider({
    cwd: 'C:/repo',
    execFileSyncImpl: failedGuardChecks.execFileSyncImpl,
  })
  await assert.rejects(failedCheckProvider({
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes: fixture.holdoutHashes,
    expectedHoldoutCaseCounts: Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service, 24])),
    expectedHoldoutLabelsSha256: fixture.holdoutLabelsSha256,
  }), { message: 'plan55_preflight_actor_guard_unverified' })
})
