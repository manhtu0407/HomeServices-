import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import {
  PLAN55_RUNTIME_SOURCE_PATHS,
  PLAN55_SOURCE_ASSETS,
  PRODUCTION_PROJECT_REF,
} from './kael-playbook-production-attestation.mjs'

export const PLAN55_GITHUB_REPOSITORY = 'manhtu0407/HomeServices-'
export const PLAN55_GITHUB_REVIEW_VERIFICATION = 'github-pull-request-review-api/v1'
export const PLAN55_ACTOR_GUARD_VERIFICATION = 'github-check-run-and-release-source/v1'
export const PLAN55_ACTOR_GUARD_CHECK_NAME = 'plan55-actor-scoped-guard-tests'

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const APPROVED_ASSOCIATIONS = new Set(['COLLABORATOR', 'MEMBER', 'OWNER'])
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/iu
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/iu
const PLAN55_POLICY = JSON.parse(readFileSync(
  resolve(REPO_ROOT, 'config/harness/plan55-production-only-policy.json'),
  'utf8',
))
export const PLAN55_MINIMUM_INDEPENDENT_HOLDOUT_REVIEWERS = PLAN55_POLICY.minimumIndependentHoldoutReviewers
export const PLAN55_PRODUCTION_SOURCE_BASE = Object.freeze(PLAN55_POLICY.productionSourceBase ?? {})
export const PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH = PLAN55_POLICY.productionSourceTargetBranch
if (!Number.isSafeInteger(PLAN55_MINIMUM_INDEPENDENT_HOLDOUT_REVIEWERS) ||
    PLAN55_MINIMUM_INDEPENDENT_HOLDOUT_REVIEWERS < 1) {
  throw new Error('plan55_policy_minimum_independent_reviewers_invalid')
}
const GUARD_RUNTIME_PATH = PLAN55_RUNTIME_SOURCE_PATHS[0]
const GUARD_TEST_PATH = 'apps/api/src/__tests__/unit/kael-playbook-registry-pillar.test.ts'
const GUARD_EVIDENCE_PATHS = Object.freeze([
  GUARD_RUNTIME_PATH,
  GUARD_TEST_PATH,
  'apps/api/package.json',
  '.github/workflows/ci.yml',
])

export function plan55HoldoutLabelsSha256(casesByService) {
  const services = Object.keys(PLAN55_SOURCE_ASSETS).sort()
  if (!isRecord(casesByService) || Array.isArray(casesByService) ||
      Object.keys(casesByService).sort().join('\n') !== services.join('\n')) {
    throw new Error('plan55_preflight_independent_holdout_unverified')
  }
  const projection = Object.fromEntries(services.map((service) => {
    const cases = casesByService[service]
    if (!Array.isArray(cases) || cases.length < 24 || cases.some((item) =>
      !isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || !isRecord(item.expected))) {
      throw new Error('plan55_preflight_independent_holdout_unverified')
    }
    const ids = cases.map(({ id }) => id)
    if (new Set(ids).size !== ids.length) throw new Error('plan55_preflight_independent_holdout_unverified')
    return [service, cases.map(({ id, expected }) => ({ id, labels: expected }))
      .sort((left, right) => left.id.localeCompare(right.id))]
  }))
  return `sha256:${createHash('sha256').update(canonicalJson(projection)).digest('hex')}`
}

export function buildPlan55HoldoutReviewBody({
  reviewedHeadSha,
  holdoutHashes,
  labelsSha256,
  actorGuardFileBlobSha,
}) {
  if (!isExpectedProductionSourceBase() ||
      !GIT_SHA_PATTERN.test(reviewedHeadSha ?? '') || !SHA256_PATTERN.test(labelsSha256 ?? '') ||
      !GIT_SHA_PATTERN.test(actorGuardFileBlobSha ?? '')) {
    throw new Error('plan55_preflight_independent_holdout_unverified')
  }
  return [
    'PLAN55-HOLDOUT-ATTEST v1',
    `reviewed_head_sha=${reviewedHeadSha.toLowerCase()}`,
    `production_source_base_branch=${PLAN55_PRODUCTION_SOURCE_BASE.branch}`,
    `production_source_base_sha=${PLAN55_PRODUCTION_SOURCE_BASE.sha}`,
    `holdout_root_sha256=${holdoutRootSha256(holdoutHashes)}`,
    `labels_sha256=${labelsSha256.slice('sha256:'.length).toLowerCase()}`,
    `actor_guard_flags_blob_sha1=${actorGuardFileBlobSha.toLowerCase()}`,
    'actor_guard_authenticated_actor_only=true',
    'actor_guard_ignores_request_body_id=true',
    'actor_guard_precedes_legacy_global=true',
    'actor_guard_regression_tests_pass=true',
    'blinded=true',
    'reviewed_by_author=false',
  ].join('\n')
}

export function createPlan55GithubReviewEvidenceProvider({
  cwd = REPO_ROOT,
  execFileSyncImpl = execFileSync,
} = {}) {
  return async ({
    expectedSourceSha,
    expectedHoldoutHashes,
    expectedHoldoutCaseCounts,
    expectedHoldoutLabelsSha256,
    sourceAttestation,
  } = {}) => {
    const evidence = await readVerifiedPlan55GithubReviewEvidence({
      cwd,
      execFileSyncImpl,
      expectedSourceSha,
      expectedHoldoutHashes,
      expectedHoldoutCaseCounts,
      expectedHoldoutLabelsSha256,
    })
    const actorGuardProof = buildVerifiedActorGuardProof({
      expectedSourceSha: evidence.sourceSha,
      pullRequest: evidence.pullRequest,
      checkRuns: evidence.checkRuns,
      actorGuardWorkflow: evidence.actorGuardWorkflow,
      sourceAttestation,
      sourceFiles: evidence.sourceFiles,
    })
    return Object.freeze({
      proof: evidence.verifiedProof,
      pullRequest: evidence.pullRequest,
      mergeCommit: evidence.mergeCommit,
      reviews: Object.freeze(evidence.reviews),
      actorGuardProof,
    })
  }
}

export function createPlan55GithubIndependentHoldoutPreflightProvider({
  cwd = REPO_ROOT,
  execFileSyncImpl = execFileSync,
} = {}) {
  return async ({
    expectedSourceSha,
    expectedHoldoutHashes,
    expectedHoldoutCaseCounts,
    expectedHoldoutLabelsSha256,
  } = {}) => {
    const evidence = await readVerifiedPlan55GithubReviewEvidence({
      cwd,
      execFileSyncImpl,
      expectedSourceSha,
      expectedHoldoutHashes,
      expectedHoldoutCaseCounts,
      expectedHoldoutLabelsSha256,
    })
    const reviewVerification = evidence.verifiedProof.github_review_verification
    return Object.freeze({
      schema: 'plan55-predeployment-holdout-review/v1',
      status: 'PASS',
      source_sha: evidence.sourceSha,
      pull_request_number: evidence.pullRequest.number,
      reviewed_head_sha: reviewVerification.reviewed_head_sha,
      review_count: reviewVerification.review_ids.length,
      actor_guard_check_run_id: evidence.actorGuardWorkflow.checkRun.id,
      holdout_root_sha256: reviewVerification.holdout_root_sha256,
      production_source_target_branch: reviewVerification.production_source_target_branch,
      production_source_target_branch_tip_sha: reviewVerification.production_source_target_branch_tip_sha,
      production_source_target_branch_ancestry_status:
        reviewVerification.production_source_target_branch_ancestry_status,
      production_source_base_ancestry_status: reviewVerification.production_source_base_ancestry_status,
    })
  }
}

async function readVerifiedPlan55GithubReviewEvidence({
  cwd,
  execFileSyncImpl,
  expectedSourceSha,
  expectedHoldoutHashes,
  expectedHoldoutCaseCounts,
  expectedHoldoutLabelsSha256,
}) {
  const sourceSha = String(expectedSourceSha ?? '').toLowerCase()
  if (!GIT_SHA_PATTERN.test(sourceSha) || !isRecord(expectedHoldoutHashes) ||
      !isRecord(expectedHoldoutCaseCounts) || !SHA256_PATTERN.test(expectedHoldoutLabelsSha256 ?? '')) {
    throw new Error('plan55_preflight_independent_holdout_unverified')
  }
  const associatedPullRequests = await readGithubPages(
    execFileSyncImpl,
    cwd,
    `repos/${PLAN55_GITHUB_REPOSITORY}/commits/${sourceSha}/pulls`,
  )
  const matchingPullRequests = associatedPullRequests.filter((pullRequest) =>
    String(pullRequest?.merge_commit_sha ?? '').toLowerCase() === sourceSha)
  if (matchingPullRequests.length !== 1 || !Number.isSafeInteger(matchingPullRequests[0]?.number)) {
    throw new Error('plan55_preflight_independent_holdout_unverified')
  }
  const pullRequestNumber = matchingPullRequests[0].number
  const pullPath = `repos/${PLAN55_GITHUB_REPOSITORY}/pulls/${pullRequestNumber}`
  const pullRequest = readGithubJson(execFileSyncImpl, cwd, pullPath)
  const sourceMergeCommit = readGithubJson(
    execFileSyncImpl,
    cwd,
    `repos/${PLAN55_GITHUB_REPOSITORY}/commits/${sourceSha}`,
  )
  const targetBranch = readGithubJson(
    execFileSyncImpl,
    cwd,
    `repos/${PLAN55_GITHUB_REPOSITORY}/branches/${PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH}`,
  )
  const targetBranchTipSha = String(targetBranch?.commit?.sha ?? '').toLowerCase()
  if (!GIT_SHA_PATTERN.test(targetBranchTipSha)) {
    throw new Error('plan55_preflight_independent_holdout_unverified')
  }
  const productionBaseComparison = readGithubJson(
    execFileSyncImpl,
    cwd,
    `repos/${PLAN55_GITHUB_REPOSITORY}/compare/${PLAN55_PRODUCTION_SOURCE_BASE.sha}...${sourceSha}`,
  )
  const targetBranchComparison = readGithubJson(
    execFileSyncImpl,
    cwd,
    `repos/${PLAN55_GITHUB_REPOSITORY}/compare/${sourceSha}...${targetBranchTipSha}`,
  )
  const mergeCommit = Object.freeze({
    ...sourceMergeCommit,
    plan55ProductionBaseComparison: productionBaseComparison,
    plan55TargetBranchComparison: targetBranchComparison,
  })
  if (!isVerifiedMergedProductionPullRequest(pullRequest, pullRequestNumber, sourceSha, mergeCommit)) {
    throw new Error('plan55_preflight_independent_holdout_unverified')
  }
  const [reviews, checkRuns, sourceFiles] = await Promise.all([
    readGithubPages(execFileSyncImpl, cwd, `${pullPath}/reviews`),
    readGithubCheckRuns(execFileSyncImpl, cwd, pullRequest.head.sha),
    readGuardSourceFiles(execFileSyncImpl, cwd, pullRequest.head.sha, sourceSha),
  ])
  const proof = buildProofFromGithubReviews({
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes,
    expectedHoldoutCaseCounts,
    expectedHoldoutLabelsSha256,
    pullRequest,
    mergeCommit,
    reviews,
    actorGuardFileBlobSha: sourceFiles[GUARD_RUNTIME_PATH].headSha,
  })
  const verifiedProof = verifyPlan55IndependentHoldoutReviewEvidence({
    proof,
    expectedSourceSha: sourceSha,
    expectedHoldoutHashes,
    expectedHoldoutLabelsSha256,
    pullRequest,
    mergeCommit,
    reviews,
  })
  const actorGuardWorkflow = await readActorGuardWorkflowEvidence(
    execFileSyncImpl,
    cwd,
    checkRuns,
    pullRequest.head.sha,
  )
  assertVerifiedActorGuardWorkflow({ pullRequest, checkRuns, actorGuardWorkflow })
  return Object.freeze({
    sourceSha,
    pullRequest,
    mergeCommit,
    reviews: Object.freeze(reviews),
    checkRuns: Object.freeze(checkRuns),
    sourceFiles: Object.freeze(sourceFiles),
    verifiedProof,
    actorGuardWorkflow,
  })
}

function buildProofFromGithubReviews({
  expectedSourceSha,
  expectedHoldoutHashes,
  expectedHoldoutCaseCounts,
  expectedHoldoutLabelsSha256,
  pullRequest,
  mergeCommit,
  reviews,
  actorGuardFileBlobSha,
}) {
  const fail = () => { throw new Error('plan55_preflight_independent_holdout_unverified') }
  const pullAuthorId = githubId(pullRequest?.user?.id)
  const reviewedHeadSha = String(pullRequest?.head?.sha ?? '').toLowerCase()
  if (!isExpectedProductionSourceBase() ||
      !isVerifiedMergedProductionPullRequest(
        pullRequest,
        pullRequest?.number,
        String(expectedSourceSha ?? '').toLowerCase(),
        mergeCommit,
      ) || !pullAuthorId || !GIT_SHA_PATTERN.test(reviewedHeadSha) ||
      !GIT_SHA_PATTERN.test(actorGuardFileBlobSha ?? '') ||
      !SHA256_PATTERN.test(expectedHoldoutLabelsSha256 ?? '') || !Array.isArray(reviews)) fail()
  const holdoutRoot = holdoutRootSha256(expectedHoldoutHashes)
  const latestByReviewer = new Map()
  for (const review of reviews) {
    const reviewerId = githubId(review?.user?.id)
    const submitted = Date.parse(review?.submitted_at ?? '')
    if (!isRecord(review) || !Number.isSafeInteger(review.id) || review.id < 1 ||
        !reviewerId || !Number.isFinite(submitted) ||
        String(review.commit_id ?? '').toLowerCase() !== reviewedHeadSha) continue
    const previous = latestByReviewer.get(reviewerId)
    if (!previous || Date.parse(previous.submitted_at) < submitted ||
        (Date.parse(previous.submitted_at) === submitted && previous.id < review.id)) {
      latestByReviewer.set(reviewerId, review)
    }
  }

  const reviewerAttestations = []
  for (const [reviewerId, review] of latestByReviewer) {
    if (review.state !== 'APPROVED' || !APPROVED_ASSOCIATIONS.has(review.author_association) ||
        reviewerId === pullAuthorId) continue
    const normalizedLines = typeof review.body === 'string'
      ? review.body.replace(/\r\n/gu, '\n').split('\n')
      : []
    const labelsMatch = normalizedLines[5]?.match(/^labels_sha256=([a-f0-9]{64})$/u) ?? null
    const labelsSha256 = labelsMatch ? `sha256:${labelsMatch[1].toLowerCase()}` : null
    if (labelsSha256 !== expectedHoldoutLabelsSha256 || !isAttestationBody(review.body, {
      reviewedHeadSha,
      holdoutRoot,
      labelsSha256,
      actorGuardFileBlobSha,
    })) continue
    reviewerAttestations.push({
      review_id: review.id,
      reviewer_id_sha256: hashIdentity(reviewerId),
      labels_sha256: labelsSha256,
    })
  }
  reviewerAttestations.sort((left, right) => left.review_id - right.review_id)
  if (reviewerAttestations.length < PLAN55_MINIMUM_INDEPENDENT_HOLDOUT_REVIEWERS) fail()

  const holdoutServices = Object.keys(expectedHoldoutHashes ?? {}).sort()
  if (!isRecord(expectedHoldoutCaseCounts) ||
      JSON.stringify(Object.keys(expectedHoldoutCaseCounts).sort()) !== JSON.stringify(holdoutServices)) fail()
  const holdouts = Object.fromEntries(holdoutServices.map((service) => {
    const caseCount = expectedHoldoutCaseCounts[service]
    if (!Number.isSafeInteger(caseCount) || caseCount < 24 ||
        !expectedHoldoutHashes[service] || !SHA256_PATTERN.test(expectedHoldoutHashes[service])) fail()
    return [service, {
      path: PLAN55_SOURCE_ASSETS[service]?.holdout,
      sha256: expectedHoldoutHashes[service].toLowerCase(),
      case_count: caseCount,
    }]
  }))
  if (holdoutServices.some((service) => !holdouts[service]?.path)) fail()

  return {
    schema: 'plan55-independent-holdout-proof/v4',
    status: 'PASS',
    blinded: true,
    reviewed_by_author: false,
    source_sha: String(expectedSourceSha).toLowerCase(),
    holdout_labels_sha256: expectedHoldoutLabelsSha256.toLowerCase(),
    author_id_sha256: hashIdentity(pullAuthorId),
    review_evidence: {
      repository: PLAN55_GITHUB_REPOSITORY,
      pull_request_number: pullRequest.number,
      reviewed_head_sha: reviewedHeadSha,
      production_source_base_branch: PLAN55_PRODUCTION_SOURCE_BASE.branch,
      production_source_base_sha: PLAN55_PRODUCTION_SOURCE_BASE.sha,
      production_source_target_branch: PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH,
      production_source_target_branch_tip_sha:
        String(mergeCommit.plan55TargetBranchComparison.head_commit.sha).toLowerCase(),
      production_source_target_branch_ancestry_status: mergeCommit.plan55TargetBranchComparison.status,
      production_source_base_ancestry_status: mergeCommit.plan55ProductionBaseComparison.status,
      actor_guard_file_blob_sha1: actorGuardFileBlobSha.toLowerCase(),
      review_ids: reviewerAttestations.map(({ review_id }) => review_id),
    },
    reviewer_attestations: reviewerAttestations,
    holdouts,
  }
}

function buildVerifiedActorGuardProof({
  expectedSourceSha,
  pullRequest,
  checkRuns,
  actorGuardWorkflow,
  sourceAttestation,
  sourceFiles,
}) {
  const fail = () => { throw new Error('plan55_preflight_actor_guard_unverified') }
  const sourceSha = String(expectedSourceSha ?? '').toLowerCase()
  const reviewedHeadSha = String(pullRequest?.head?.sha ?? '').toLowerCase()
  const attestedGuardFile = sourceAttestation?.runtime_files?.find((file) => file?.path === GUARD_RUNTIME_PATH)
  if (!GIT_SHA_PATTERN.test(sourceSha) || !GIT_SHA_PATTERN.test(reviewedHeadSha) ||
      sourceAttestation?.schema !== 'plan55-production-source-attestation/v1' ||
      sourceAttestation?.deployment?.project_ref !== PRODUCTION_PROJECT_REF ||
      String(sourceAttestation?.deployment?.git_sha ?? '').toLowerCase() !== sourceSha ||
      !attestedGuardFile || !GIT_SHA_PATTERN.test(attestedGuardFile.git_blob_sha1 ?? '') ||
      !SHA256_PATTERN.test(attestedGuardFile.deployed_sha256 ?? '') ||
      attestedGuardFile.working_tree_matches_release_after_git_clean_filter !== true) fail()

  const guardFile = sourceFiles?.[GUARD_RUNTIME_PATH]
  if (!guardFile || guardFile.headSha !== guardFile.mergeSha ||
      guardFile.mergeSha.toLowerCase() !== attestedGuardFile.git_blob_sha1.toLowerCase()) fail()
  assertGuardTestWiring(sourceFiles)

  const { latestRun, workflowRun, workflowJob, successfulTestStep } = assertVerifiedActorGuardWorkflow({
    pullRequest,
    checkRuns,
    actorGuardWorkflow,
  })

  return Object.freeze({
    source_sha: sourceSha,
    runtime_file_path: GUARD_RUNTIME_PATH,
    runtime_file_sha256: attestedGuardFile.deployed_sha256.toLowerCase(),
    verified_auth_context: true,
    ignores_request_body_id: true,
    canary_precedes_legacy_global: true,
    regression_tests_pass: true,
    verification: Object.freeze({
      method: PLAN55_ACTOR_GUARD_VERIFICATION,
      repository: PLAN55_GITHUB_REPOSITORY,
      pull_request_number: pullRequest.number,
      reviewed_head_sha: reviewedHeadSha,
      source_sha: sourceSha,
      check_run_id: latestRun.id,
      check_run_name: latestRun.name,
      check_run_conclusion: latestRun.conclusion,
      workflow_run_id: workflowRun.id,
      workflow_run_attempt: workflowRun.run_attempt,
      workflow_path: workflowRun.path,
      workflow_event: workflowRun.event,
      workflow_job_id: workflowJob.id,
      workflow_job_name: workflowJob.name,
      workflow_job_conclusion: workflowJob.conclusion,
      workflow_step_name: successfulTestStep.name,
      workflow_step_conclusion: successfulTestStep.conclusion,
      runtime_file_blob_sha1: guardFile.mergeSha.toLowerCase(),
    }),
  })
}

function assertVerifiedActorGuardWorkflow({ pullRequest, checkRuns, actorGuardWorkflow }) {
  const fail = () => { throw new Error('plan55_preflight_actor_guard_unverified') }
  const reviewedHeadSha = String(pullRequest?.head?.sha ?? '').toLowerCase()
  const matchingRuns = (Array.isArray(checkRuns) ? checkRuns : [])
    .filter((run) => run?.name === PLAN55_ACTOR_GUARD_CHECK_NAME &&
      String(run.head_sha ?? '').toLowerCase() === reviewedHeadSha &&
      run.app?.slug === 'github-actions')
    .sort((left, right) => {
      const leftStarted = Date.parse(left.started_at ?? '')
      const rightStarted = Date.parse(right.started_at ?? '')
      if (leftStarted !== rightStarted) return leftStarted - rightStarted
      return Number(left.id ?? 0) - Number(right.id ?? 0)
    })
  const latestRun = matchingRuns.at(-1)
  const workflowRun = actorGuardWorkflow?.workflowRun
  const workflowJob = actorGuardWorkflow?.workflowJob
  const successfulTestStep = workflowJob?.steps?.find((step) =>
    step?.name === 'Run actor-scoped Production guard tests')
  if (!latestRun || !Number.isSafeInteger(latestRun.id) || latestRun.id < 1 ||
      latestRun.status !== 'completed' || latestRun.conclusion !== 'success' ||
      !Number.isFinite(Date.parse(latestRun.started_at ?? '')) ||
      latestRun.id !== actorGuardWorkflow.checkRun?.id ||
      workflowRun?.id !== actorGuardWorkflow.runId || workflowRun?.path !== '.github/workflows/ci.yml' ||
      workflowRun?.event !== 'pull_request' ||
      String(workflowRun?.head_sha ?? '').toLowerCase() !== reviewedHeadSha ||
      workflowRun?.status !== 'completed' || workflowRun?.conclusion !== 'success' ||
      !Number.isSafeInteger(workflowRun?.run_attempt) || workflowRun.run_attempt < 1 ||
      workflowJob?.id !== actorGuardWorkflow.jobId || workflowJob?.run_id !== workflowRun.id ||
      workflowJob?.run_attempt !== workflowRun.run_attempt ||
      String(workflowJob?.head_sha ?? '').toLowerCase() !== reviewedHeadSha ||
      workflowJob?.name !== 'plan55-actor-guard' || workflowJob?.status !== 'completed' ||
      workflowJob?.conclusion !== 'success' || successfulTestStep?.status !== 'completed' ||
      successfulTestStep?.conclusion !== 'success') fail()
  return Object.freeze({ latestRun, workflowRun, workflowJob, successfulTestStep })
}

function assertGuardTestWiring(sourceFiles) {
  const fail = () => { throw new Error('plan55_preflight_actor_guard_unverified') }
  const guardTests = sourceFiles?.[GUARD_TEST_PATH]?.content
  const apiPackage = parseJsonFile(sourceFiles?.['apps/api/package.json']?.content)
  const ciWorkflow = sourceFiles?.['.github/workflows/ci.yml']?.content
  const jobHeader = /^  plan55-actor-guard:\r?\n/mu.exec(ciWorkflow ?? '')
  const jobRest = jobHeader ? (ciWorkflow ?? '').slice(jobHeader.index + jobHeader[0].length) : ''
  const nextJob = /^  [A-Za-z0-9_-]+:/mu.exec(jobRest)
  const job = nextJob ? jobRest.slice(0, nextJob.index) : jobRest
  const step = /^      - name: Run actor-scoped Production guard tests\r?\n        run: (.+)$/mu.exec(job)
  if (typeof guardTests !== 'string' ||
      !guardTests.includes('narrows an enabled canary to its configured authenticated actor') ||
      !guardTests.includes('fails closed on an invalid canary flag instead of falling back to a legacy global flag') ||
      !guardTests.includes('isKaelPlaybookEnabled("plumbing", allowedActorId)).toBe(true)') ||
      !guardTests.includes('isKaelPlaybookEnabled("plumbing", otherActorId)).toBe(false)') ||
      !(apiPackage?.devDependencies?.vitest || apiPackage?.dependencies?.vitest) ||
      typeof ciWorkflow !== 'string' ||
      !/^    name: plan55-actor-scoped-guard-tests\r?\n/mu.test(job) ||
      !/^    if: \$\{\{ !cancelled\(\) && github\.event_name == 'pull_request' && needs\.controls\.outputs\.kael == 'true' \}\}$/mu.test(job) ||
      step?.[1] !== 'pnpm --filter @nestscout/api exec vitest run src/__tests__/unit/kael-playbook-registry-pillar.test.ts --passWithNoTests=false' ||
      PLAN55_ACTOR_GUARD_CHECK_NAME !== 'plan55-actor-scoped-guard-tests') fail()
}

async function readActorGuardWorkflowEvidence(execFileSyncImpl, cwd, checkRuns, reviewedHeadSha) {
  const fail = () => { throw new Error('plan55_preflight_actor_guard_unverified') }
  const matchingRuns = (Array.isArray(checkRuns) ? checkRuns : [])
    .filter((run) => run?.name === PLAN55_ACTOR_GUARD_CHECK_NAME &&
      String(run.head_sha ?? '').toLowerCase() === String(reviewedHeadSha).toLowerCase() &&
      run.app?.slug === 'github-actions')
    .sort((left, right) => {
      const leftStarted = Date.parse(left.started_at ?? '')
      const rightStarted = Date.parse(right.started_at ?? '')
      if (leftStarted !== rightStarted) return leftStarted - rightStarted
      return Number(left.id ?? 0) - Number(right.id ?? 0)
    })
  const checkRun = matchingRuns.at(-1)
  let parsedUrl
  try {
    parsedUrl = new URL(checkRun?.details_url)
  } catch {
    fail()
  }
  const urlMatch = parsedUrl.hostname === 'github.com'
    ? /^\/manhtu0407\/HomeServices-\/actions\/runs\/(\d+)\/job\/(\d+)$/u.exec(parsedUrl.pathname)
    : null
  if (!urlMatch || parsedUrl.search || parsedUrl.hash) fail()
  const runId = Number(urlMatch[1])
  const jobId = Number(urlMatch[2])
  if (!Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(jobId) || jobId < 1) fail()
  const [workflowRun, workflowJob] = await Promise.all([
    readGithubJson(execFileSyncImpl, cwd, `repos/${PLAN55_GITHUB_REPOSITORY}/actions/runs/${runId}`),
    readGithubJson(execFileSyncImpl, cwd, `repos/${PLAN55_GITHUB_REPOSITORY}/actions/jobs/${jobId}`),
  ])
  return Object.freeze({ checkRun, runId, jobId, workflowRun, workflowJob })
}

async function readGuardSourceFiles(execFileSyncImpl, cwd, reviewedHeadSha, sourceSha) {
  const sourceFiles = Object.create(null)
  await Promise.all(GUARD_EVIDENCE_PATHS.map(async (path) => {
    const [headFile, mergeFile] = await Promise.all([
      readGithubContentFile(execFileSyncImpl, cwd, path, reviewedHeadSha),
      readGithubContentFile(execFileSyncImpl, cwd, path, sourceSha),
    ])
    if (headFile.sha !== mergeFile.sha) {
      throw new Error('plan55_preflight_actor_guard_unverified')
    }
    sourceFiles[path] = Object.freeze({
      headSha: headFile.sha,
      mergeSha: mergeFile.sha,
      content: mergeFile.content,
    })
  }))
  return sourceFiles
}

async function readGithubContentFile(execFileSyncImpl, cwd, path, ref) {
  const file = readGithubJson(
    execFileSyncImpl,
    cwd,
    `repos/${PLAN55_GITHUB_REPOSITORY}/contents/${path}?ref=${ref}`,
  )
  if (!GIT_SHA_PATTERN.test(file?.sha ?? '') || file.encoding !== 'base64' ||
      typeof file.content !== 'string') {
    throw new Error('plan55_preflight_actor_guard_unverified')
  }
  const bytes = Buffer.from(file.content.replace(/\s/gu, ''), 'base64')
  if (gitBlobSha1(bytes) !== file.sha.toLowerCase()) {
    throw new Error('plan55_preflight_actor_guard_unverified')
  }
  return { sha: file.sha.toLowerCase(), content: bytes.toString('utf8') }
}

async function readGithubPages(execFileSyncImpl, cwd, endpoint) {
  const values = []
  for (let page = 1; page <= 10; page += 1) {
    const response = readGithubJson(execFileSyncImpl, cwd, `${endpoint}?per_page=100&page=${page}`)
    const items = Array.isArray(response) ? response : null
    if (!items) throw new Error('plan55_preflight_independent_holdout_unverified')
    values.push(...items)
    if (items.length < 100) return values
  }
  throw new Error('plan55_preflight_independent_holdout_unverified')
}

async function readGithubCheckRuns(execFileSyncImpl, cwd, commitSha) {
  if (!GIT_SHA_PATTERN.test(commitSha ?? '')) {
    throw new Error('plan55_preflight_actor_guard_unverified')
  }
  const checkRuns = []
  for (let page = 1; page <= 10; page += 1) {
    const response = readGithubJson(
      execFileSyncImpl,
      cwd,
      `repos/${PLAN55_GITHUB_REPOSITORY}/commits/${commitSha}/check-runs?per_page=100&page=${page}`,
    )
    if (!Array.isArray(response?.check_runs)) {
      throw new Error('plan55_preflight_actor_guard_unverified')
    }
    checkRuns.push(...response.check_runs)
    if (response.check_runs.length < 100) return checkRuns
  }
  throw new Error('plan55_preflight_actor_guard_unverified')
}

function isExpectedProductionSourceBase() {
  const { branch, sha, releaseId } = PLAN55_PRODUCTION_SOURCE_BASE
  return GIT_SHA_PATTERN.test(sha ?? '') &&
    branch === `codex/plan55-production-base-${String(sha).slice(0, 8)}-review-v2` &&
    new RegExp(`^harness-${String(sha).slice(0, 12)}-[a-f0-9]{12}$`, 'u').test(releaseId ?? '') &&
    PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH === 'main'
}

function isVerifiedMergedProductionPullRequest(pullRequest, number, sourceSha, mergeCommit) {
  const reviewedHeadSha = String(pullRequest?.head?.sha ?? '').toLowerCase()
  const comparison = mergeCommit?.plan55ProductionBaseComparison
  const targetComparison = mergeCommit?.plan55TargetBranchComparison
  return pullRequest?.number === number && pullRequest.state === 'closed' && pullRequest.merged === true &&
    Number.isFinite(Date.parse(pullRequest.merged_at ?? '')) &&
    String(pullRequest.merge_commit_sha ?? '').toLowerCase() === sourceSha &&
    isExpectedProductionSourceBase() &&
    pullRequest.base?.ref === PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH &&
    pullRequest.base?.repo?.full_name === PLAN55_GITHUB_REPOSITORY &&
    pullRequest.head?.repo?.full_name === PLAN55_GITHUB_REPOSITORY &&
    GIT_SHA_PATTERN.test(reviewedHeadSha) &&
    String(mergeCommit?.sha ?? '').toLowerCase() === sourceSha &&
    Array.isArray(mergeCommit?.parents) &&
    mergeCommit.parents.length >= 1 &&
    mergeCommit.parents.every((parent) => GIT_SHA_PATTERN.test(String(parent?.sha ?? ''))) &&
    isRecord(comparison) &&
    ['ahead', 'identical'].includes(comparison.status) &&
    String(comparison.base_commit?.sha ?? '').toLowerCase() === PLAN55_PRODUCTION_SOURCE_BASE.sha &&
    String(comparison.head_commit?.sha ?? '').toLowerCase() === sourceSha &&
    isRecord(targetComparison) &&
    ['ahead', 'identical'].includes(targetComparison.status) &&
    String(targetComparison.base_commit?.sha ?? '').toLowerCase() === sourceSha &&
    GIT_SHA_PATTERN.test(String(targetComparison.head_commit?.sha ?? ''))
}

function parseJsonFile(value) {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function gitBlobSha1(bytes) {
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`, 'utf8')
    .update(bytes)
    .digest('hex')
}

export function verifyPlan55IndependentHoldoutReviewEvidence({
  proof,
  expectedSourceSha,
  expectedHoldoutHashes,
  expectedHoldoutLabelsSha256,
  pullRequest,
  mergeCommit,
  reviews,
}) {
  const fail = () => { throw new Error('plan55_preflight_independent_holdout_unverified') }
  const evidence = proof?.review_evidence
  const expectedSource = String(expectedSourceSha ?? '').toLowerCase()
  if (!proof || proof.schema !== 'plan55-independent-holdout-proof/v4' ||
      proof.status !== 'PASS' || proof.blinded !== true || proof.reviewed_by_author !== false ||
      !GIT_SHA_PATTERN.test(expectedSource) ||
      typeof proof.source_sha !== 'string' || proof.source_sha.toLowerCase() !== expectedSource ||
      proof.holdout_labels_sha256 !== expectedHoldoutLabelsSha256 ||
      evidence?.repository !== PLAN55_GITHUB_REPOSITORY ||
      !Number.isSafeInteger(evidence.pull_request_number) || evidence.pull_request_number < 1 ||
      !GIT_SHA_PATTERN.test(evidence.reviewed_head_sha ?? '') ||
      evidence.production_source_base_branch !== PLAN55_PRODUCTION_SOURCE_BASE.branch ||
      String(evidence.production_source_base_sha ?? '').toLowerCase() !== PLAN55_PRODUCTION_SOURCE_BASE.sha ||
      evidence.production_source_target_branch !== PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH ||
      evidence.production_source_base_ancestry_status !== mergeCommit?.plan55ProductionBaseComparison?.status ||
      String(evidence.production_source_target_branch_tip_sha ?? '').toLowerCase() !==
        String(mergeCommit?.plan55TargetBranchComparison?.head_commit?.sha ?? '').toLowerCase() ||
      evidence.production_source_target_branch_ancestry_status !==
        mergeCommit?.plan55TargetBranchComparison?.status ||
      String(mergeCommit?.plan55ProductionBaseComparison?.head_commit?.sha ?? '').toLowerCase() !== expectedSource ||
      String(mergeCommit?.plan55TargetBranchComparison?.base_commit?.sha ?? '').toLowerCase() !== expectedSource ||
      !GIT_SHA_PATTERN.test(evidence.actor_guard_file_blob_sha1 ?? '') ||
      !Array.isArray(evidence.review_ids) ||
      evidence.review_ids.length < PLAN55_MINIMUM_INDEPENDENT_HOLDOUT_REVIEWERS ||
      !Array.isArray(proof.reviewer_attestations) ||
      proof.reviewer_attestations.length < PLAN55_MINIMUM_INDEPENDENT_HOLDOUT_REVIEWERS ||
      !Array.isArray(reviews) || !isRecord(pullRequest)) fail()

  if (!isRecord(expectedHoldoutHashes) || Array.isArray(expectedHoldoutHashes) ||
      Object.keys(expectedHoldoutHashes).length === 0 ||
      Object.values(expectedHoldoutHashes).some((value) => !SHA256_PATTERN.test(value ?? '')) ||
      !SHA256_PATTERN.test(expectedHoldoutLabelsSha256 ?? '')) fail()
  const expectedHoldoutKeys = Object.keys(expectedHoldoutHashes).sort()
  if (!isRecord(proof.holdouts) || Array.isArray(proof.holdouts) ||
      Object.keys(proof.holdouts).sort().join('\n') !== expectedHoldoutKeys.join('\n')) fail()
  for (const service of expectedHoldoutKeys) {
    const holdout = proof.holdouts[service]
    if (!isRecord(holdout) ||
        String(holdout.sha256 ?? '').toLowerCase() !== expectedHoldoutHashes[service].toLowerCase()) fail()
  }

  const pullAuthorId = githubId(pullRequest.user?.id)
  const pullHeadSha = String(pullRequest.head?.sha ?? '').toLowerCase()
  if (!isVerifiedMergedProductionPullRequest(
        pullRequest,
        evidence.pull_request_number,
        expectedSource,
        mergeCommit,
      ) ||
      pullHeadSha !== evidence.reviewed_head_sha.toLowerCase() ||
      !pullAuthorId ||
      proof.author_id_sha256 !== hashIdentity(pullAuthorId)) fail()

  const attestations = new Map()
  for (const attestation of proof.reviewer_attestations) {
    if (!isRecord(attestation) || !Number.isSafeInteger(attestation.review_id) || attestation.review_id < 1 ||
        !SHA256_PATTERN.test(attestation.reviewer_id_sha256 ?? '') ||
        !SHA256_PATTERN.test(attestation.labels_sha256 ?? '') || attestations.has(attestation.review_id)) fail()
    attestations.set(attestation.review_id, attestation)
  }
  const evidenceReviewIds = uniqueSortedIds(evidence.review_ids)
  const attestedReviewIds = uniqueSortedIds([...attestations.keys()])
  if (evidenceReviewIds.length !== evidence.review_ids.length ||
      evidenceReviewIds.length !== attestedReviewIds.length ||
      evidenceReviewIds.join(',') !== attestedReviewIds.join(',')) fail()

  const reviewsById = new Map()
  const latestByReviewer = new Map()
  for (const review of reviews) {
    const reviewerId = githubId(review?.user?.id)
    const submitted = Date.parse(review?.submitted_at ?? '')
    if (!isRecord(review) || !Number.isSafeInteger(review.id) || review.id < 1 ||
        !reviewerId || !Number.isFinite(submitted)) continue
    reviewsById.set(review.id, review)
    if (String(review.commit_id ?? '').toLowerCase() !== pullHeadSha) continue
    const previous = latestByReviewer.get(reviewerId)
    if (!previous || Date.parse(previous.submitted_at) < submitted ||
        (Date.parse(previous.submitted_at) === submitted && previous.id < review.id)) {
      latestByReviewer.set(reviewerId, review)
    }
  }

  const reviewerHashes = new Set()
  const verifiedReviewIds = []
  const holdoutRoot = holdoutRootSha256(expectedHoldoutHashes)
  for (const reviewId of evidenceReviewIds) {
    const attestation = attestations.get(reviewId)
    const review = reviewsById.get(reviewId)
    const reviewerId = githubId(review?.user?.id)
    if (!review || !reviewerId || latestByReviewer.get(reviewerId)?.id !== reviewId ||
        review.state !== 'APPROVED' ||
        String(review.commit_id ?? '').toLowerCase() !== pullHeadSha ||
        !APPROVED_ASSOCIATIONS.has(review.author_association) ||
        reviewerId === pullAuthorId ||
        hashIdentity(reviewerId) !== attestation.reviewer_id_sha256 ||
        reviewerHashes.has(attestation.reviewer_id_sha256) ||
         attestation.labels_sha256 !== expectedHoldoutLabelsSha256 ||
        !isAttestationBody(review.body, {
          reviewedHeadSha: pullHeadSha,
          holdoutRoot,
          labelsSha256: attestation.labels_sha256,
          actorGuardFileBlobSha: evidence.actor_guard_file_blob_sha1,
        })) fail()
    reviewerHashes.add(attestation.reviewer_id_sha256)
    verifiedReviewIds.push(reviewId)
  }
  if (verifiedReviewIds.length < PLAN55_MINIMUM_INDEPENDENT_HOLDOUT_REVIEWERS) fail()

  return Object.freeze({
    ...proof,
    github_review_verification: Object.freeze({
      method: PLAN55_GITHUB_REVIEW_VERIFICATION,
      repository: PLAN55_GITHUB_REPOSITORY,
      pull_request_number: evidence.pull_request_number,
      reviewed_head_sha: pullHeadSha,
      merge_sha: expectedSource,
      production_source_base_branch: PLAN55_PRODUCTION_SOURCE_BASE.branch,
      production_source_base_sha: PLAN55_PRODUCTION_SOURCE_BASE.sha,
      production_source_target_branch: PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH,
      production_source_target_branch_tip_sha:
        String(mergeCommit.plan55TargetBranchComparison.head_commit.sha).toLowerCase(),
      production_source_target_branch_ancestry_status: mergeCommit.plan55TargetBranchComparison.status,
      production_source_base_ancestry_status: mergeCommit.plan55ProductionBaseComparison.status,
      holdout_root_sha256: holdoutRoot,
      holdout_labels_sha256: expectedHoldoutLabelsSha256,
      review_ids: Object.freeze(verifiedReviewIds.sort((left, right) => left - right)),
    }),
  })
}

function readGithubJson(execFileSyncImpl, cwd, endpoint) {
  try {
    const output = execFileSyncImpl('gh', ['api', endpoint], {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
      shell: false,
      windowsHide: true,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' },
    })
    return JSON.parse(String(output))
  } catch {
    throw new Error('plan55_preflight_independent_holdout_review_api_unavailable')
  }
}

function holdoutRootSha256(holdoutHashes) {
  if (!isRecord(holdoutHashes) || Array.isArray(holdoutHashes) ||
      Object.keys(holdoutHashes).length === 0) {
    throw new Error('plan55_preflight_independent_holdout_unverified')
  }
  const entries = Object.keys(holdoutHashes).sort().map((service) => {
    const digest = holdoutHashes[service]
    if (!SHA256_PATTERN.test(digest ?? '')) {
      throw new Error('plan55_preflight_independent_holdout_unverified')
    }
    return `${service}=${digest.slice('sha256:'.length).toLowerCase()}`
  })
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

function isAttestationBody(body, {
  reviewedHeadSha,
  holdoutRoot,
  labelsSha256,
  actorGuardFileBlobSha,
}) {
  if (typeof body !== 'string') return false
  const expected = [
    'PLAN55-HOLDOUT-ATTEST v1',
    `reviewed_head_sha=${reviewedHeadSha}`,
    `production_source_base_branch=${PLAN55_PRODUCTION_SOURCE_BASE.branch}`,
    `production_source_base_sha=${PLAN55_PRODUCTION_SOURCE_BASE.sha}`,
    `holdout_root_sha256=${holdoutRoot}`,
    `labels_sha256=${labelsSha256.slice('sha256:'.length).toLowerCase()}`,
    `actor_guard_flags_blob_sha1=${actorGuardFileBlobSha.toLowerCase()}`,
    'actor_guard_authenticated_actor_only=true',
    'actor_guard_ignores_request_body_id=true',
    'actor_guard_precedes_legacy_global=true',
    'actor_guard_regression_tests_pass=true',
    'blinded=true',
    'reviewed_by_author=false',
  ].join('\n')
  return body.replace(/\r\n/gu, '\n').trim() === expected
}

function hashIdentity(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`
}

function githubId(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function uniqueSortedIds(values) {
  if (!Array.isArray(values) || values.some((value) => !Number.isSafeInteger(value) || value < 1)) return []
  return [...new Set(values)].sort((left, right) => left - right)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
