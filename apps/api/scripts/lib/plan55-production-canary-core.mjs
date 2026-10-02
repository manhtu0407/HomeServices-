import {
  PLAN55_RUNTIME_SOURCE_PATHS,
  PLAN55_SOURCE_ASSETS,
  PRODUCTION_MOBILE_API_URL,
  PRODUCTION_PROJECT_REF,
  assertPlan55SourceAttestation,
  plan55SourceAttestationSha256,
  validateProductionEvalTargets,
  validateProductionHealthPayload,
} from './kael-playbook-production-attestation.mjs'
import {
  PLAN55_ACTOR_GUARD_CHECK_NAME,
  PLAN55_ACTOR_GUARD_VERIFICATION,
  PLAN55_GITHUB_REPOSITORY,
  PLAN55_GITHUB_REVIEW_VERIFICATION,
  PLAN55_MINIMUM_INDEPENDENT_HOLDOUT_REVIEWERS,
  PLAN55_PRODUCTION_SOURCE_BASE,
  PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH,
} from './plan55-independent-holdout-review.mjs'

export const PLAN55_SERVICE_ORDER = Object.freeze([
  'hvac', 'handyman', 'cleaning', 'upholstery', 'plumbing', 'electrical',
])

const DATASETS = Object.freeze(['corpus', 'holdout'])
const ARMS = Object.freeze(['baseline', 'after'])
const REPETITIONS = Object.freeze([1, 2])
const CASES_PER_SLICE = 12
const GLOBAL_FLAG_NAMES = Object.freeze(PLAN55_SERVICE_ORDER.map(
  (service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_ENABLED`,
))
const CANARY_FLAG_NAMES = Object.freeze(PLAN55_SERVICE_ORDER.map(
  (service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_ENABLED`,
))
const CANARY_ACTOR_NAMES = Object.freeze(PLAN55_SERVICE_ORDER.map(
  (service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_USER_ID`,
))
const CLEANUP_TABLES = Object.freeze([
  'profiles',
  'customer_profiles',
  'customer_account_deletion_requests',
  'kael_chat_sessions',
  'kael_chat_turns',
  'worker_profiles',
  'jobs_as_customer',
  'jobs_as_worker',
  'job_broadcasts_as_worker',
  'job_events_as_actor',
  'chat_messages_as_sender',
  'notifications_as_user',
])
const ACTOR_GUARD_RUNTIME_PATH = PLAN55_RUNTIME_SOURCE_PATHS[0]
const POSITIVE_INTEGER = Number.isSafeInteger
const CLIENT_IDENTITY_HEADER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u
const EAS_BUILD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export function buildPlan55ServiceSlices(service) {
  if (!PLAN55_SERVICE_ORDER.includes(service)) {
    throw new Error('plan55_canary_unsupported_service')
  }
  const paths = PLAN55_SOURCE_ASSETS[service]
  return Object.freeze(ARMS.flatMap((arm) => DATASETS.flatMap((dataset) =>
    REPETITIONS.map((repetition) => {
      const offset = (repetition - 1) * CASES_PER_SLICE
      const corpusPath = paths[dataset]
      return Object.freeze({
        id: `${service}-${arm}-${dataset}-p${repetition}`,
        service,
        arm,
        dataset,
        repetition,
        offset,
        limit: CASES_PER_SLICE,
        playbookEnabled: arm === 'after',
        corpusPath,
        playbookPath: paths.playbook,
      })
    }),
  )))
}

export function buildPlan55CanaryPlan(services = PLAN55_SERVICE_ORDER) {
  assertOrderedServiceSubset(services)
  return Object.freeze(services.map((service) => Object.freeze({
    service,
    slices: buildPlan55ServiceSlices(service),
  })))
}

export function buildPlan55CheckpointStatus({ deployment, statuses }) {
  if (!deployment || typeof deployment.project_ref !== 'string' ||
      deployment.project_ref !== PRODUCTION_PROJECT_REF ||
      typeof deployment.release_id !== 'string' || !/^[a-f0-9]{40}$/iu.test(deployment.git_sha ?? '') ||
      !new RegExp(`^harness-${String(deployment.git_sha).slice(0, 12)}-[a-f0-9]{12}$`, 'iu')
        .test(deployment.release_id) ||
      !Array.isArray(statuses) || statuses.some((status) =>
        !PLAN55_SERVICE_ORDER.includes(status?.service) || !Array.isArray(status.verifiedSliceIds) ||
        !Array.isArray(status.missingSliceIds) || typeof status.cleanupVerified !== 'boolean' ||
        typeof status.complete !== 'boolean')) {
    throw new Error('plan55_checkpoint_status_invalid')
  }
  assertOrderedServiceSubset(statuses.map(({ service }) => service))
  for (const status of statuses) {
    const expectedIds = new Set(buildPlan55ServiceSlices(status.service).map(({ id }) => id))
    const allIds = [...status.verifiedSliceIds, ...status.missingSliceIds]
    if (allIds.length !== expectedIds.size || new Set(allIds).size !== expectedIds.size ||
        allIds.some((id) => !expectedIds.has(id)) ||
        (status.verifiedSliceIds.length > 0 && !status.cleanupVerified) ||
        status.complete !== (status.missingSliceIds.length === 0 && status.cleanupVerified)) {
      throw new Error('plan55_checkpoint_status_invalid')
    }
  }

  const verifiedSliceCount = statuses.reduce((sum, status) => sum + status.verifiedSliceIds.length, 0)
  const cleanedAttemptObserved = statuses.some((status) => status.cleanupVerified)
  return Object.freeze({
    schema: 'plan55-production-checkpoint-status/v2',
    scope: 'currently_served_production_release_only',
    // A missing cleaned receipt cannot prove that a previous attempt never started: an
    // interrupted attempt may have failed before it could persist its cleanup receipt.
    canary_started: verifiedSliceCount > 0 ? true : null,
    canary_attempt_cleaned: cleanedAttemptObserved,
    canary_start_evidence: verifiedSliceCount > 0
      ? 'clean_verified_slice_receipt_present'
      : cleanedAttemptObserved
        ? 'cleaned_service_attempt_present'
        : 'not_proven_by_local_checkpoints',
    eligibility: 'not_evaluated',
    deployment: {
      project_ref: deployment.project_ref,
      release_id: deployment.release_id,
      source_sha: deployment.git_sha,
    },
    verified_slice_count: verifiedSliceCount,
    services: statuses.map((status) => ({
      service: status.service,
      verified_slice_count: status.verifiedSliceIds.length,
      verified_slice_ids: status.verifiedSliceIds,
      missing_slice_count: status.missingSliceIds.length,
      missing_slice_ids: status.missingSliceIds,
      cleanup_verified: status.cleanupVerified,
      complete: status.complete,
    })),
  })
}

export function assertPlan55ReusableServiceAttempt({ attempt, checkpointStatus, service, sourceSha, releaseId, recovery = null }) {
  const fail = () => { throw new Error('plan55_resume_prior_attempt_not_reusable') }
  const expectedSourceSha = String(sourceSha ?? '').toLowerCase()
  if (!PLAN55_SERVICE_ORDER.includes(service) || !/^[a-f0-9]{40}$/iu.test(expectedSourceSha) ||
      typeof releaseId !== 'string' ||
      !new RegExp(`^harness-${expectedSourceSha.slice(0, 12)}-[a-f0-9]{12}$`, 'iu').test(releaseId)) fail()

  const serviceStatus = checkpointStatus?.services?.[0]
  const expectedIds = new Set(buildPlan55ServiceSlices(service).map(({ id }) => id))
  const verifiedIds = serviceStatus?.verified_slice_ids
  const missingIds = serviceStatus?.missing_slice_ids
  if (checkpointStatus?.schema !== 'plan55-production-checkpoint-status/v2' ||
      checkpointStatus.scope !== 'currently_served_production_release_only' ||
      checkpointStatus.canary_attempt_cleaned !== true ||
      checkpointStatus.deployment?.project_ref !== PRODUCTION_PROJECT_REF ||
      checkpointStatus.deployment?.release_id !== releaseId ||
      String(checkpointStatus.deployment?.source_sha ?? '').toLowerCase() !== expectedSourceSha ||
      !Array.isArray(checkpointStatus.services) || checkpointStatus.services.length !== 1 ||
      serviceStatus?.service !== service ||
      serviceStatus.cleanup_verified !== true || !Array.isArray(verifiedIds) || !Array.isArray(missingIds)) fail()

  const allIds = [...verifiedIds, ...missingIds]
  if (allIds.length !== expectedIds.size || new Set(allIds).size !== expectedIds.size ||
      allIds.some((id) => !expectedIds.has(id)) ||
      serviceStatus.verified_slice_count !== verifiedIds.length ||
      serviceStatus.missing_slice_count !== missingIds.length ||
      serviceStatus.complete !== (missingIds.length === 0) ||
      checkpointStatus.verified_slice_count !== verifiedIds.length) fail()

  const recovered = recovery === null ? false : assertReusableRecoveryProof({
    recovery, service, sourceSha: expectedSourceSha, releaseId,
    verifiedSliceCount: verifiedIds.length, missingSliceIds: missingIds,
  })

  if (attempt === null || attempt === undefined) {
    return recovered ? 'cleaned_checkpoint_reusable_after_recovery' : 'clean_checkpoint_reusable'
  }
  if (!attempt || attempt.schema !== 'plan55-service-attempt/v1' ||
      String(attempt.source_sha ?? '').toLowerCase() !== expectedSourceSha ||
      attempt.service !== service || !Number.isSafeInteger(attempt.exit_code)) fail()

  if (attempt.status === 'RECEIPT_RECORDED' && attempt.exit_code === 0) {
    const result = attempt.result
    const serviceResult = result?.services?.[0]
    try {
      assertPlan55Cleanup(serviceResult?.cleanup)
    } catch {
      fail()
    }
    if (result?.schema !== 'plan55-production-canary-sequence/v1' ||
        result.project_ref !== PRODUCTION_PROJECT_REF || result.services?.length !== 1 ||
        serviceResult?.service !== service ||
        !['G5_PASSED', 'G5_FAILED_SERVICE_OFF'].includes(serviceResult.status) ||
        serviceResult.slice_count !== 8 || serviceResult.case_count !== 96 || serviceResult.error_count !== 0 ||
        String(serviceResult.source_sha ?? '').toLowerCase() !== expectedSourceSha ||
        serviceResult.release_id !== releaseId || !serviceStatus.complete || verifiedIds.length !== 8) fail()
    return 'complete_receipt_reusable'
  }

  if (attempt.status === 'BLOCKED_UNVERIFIED' && attempt.exit_code > 0 &&
      recovered && (isRetryablePlan55AttemptError(attempt.error_code) ||
        isRetryableRecoveredCleanupError(attempt.error_code)) &&
      (attempt.result === null || attempt.result === undefined)) {
    return serviceStatus.complete ? 'cleaned_receipt_reusable_after_interruption' : 'cleaned_partial_receipt_reusable'
  }
  fail()
}

function assertReusableRecoveryProof({ recovery, service, sourceSha, releaseId, verifiedSliceCount, missingSliceIds }) {
  const fail = () => { throw new Error('plan55_resume_prior_attempt_not_reusable') }
  const actorHashes = recovery?.cleaned_actor_sha256
  const invalidatedIds = recovery?.invalidated_slice_ids
  if (recovery?.schema !== 'plan55-interrupted-service-recovery/v1' ||
      !['RECOVERY_PASS', 'CLEANUP_ONLY_PASS'].includes(recovery.status) ||
      recovery.service !== service || recovery.project_ref !== PRODUCTION_PROJECT_REF ||
      recovery.release_id !== releaseId || String(recovery.source_sha ?? '').toLowerCase() !== sourceSha ||
      recovery.source_identity_verified !== true ||
      !Number.isSafeInteger(recovery.cleaned_actor_count) || recovery.cleaned_actor_count < 1 ||
      !Array.isArray(actorHashes) || actorHashes.length !== recovery.cleaned_actor_count ||
      actorHashes.some((value) => !/^[a-f0-9]{64}$/iu.test(value)) ||
      new Set(actorHashes).size !== actorHashes.length ||
      !Array.isArray(invalidatedIds) || new Set(invalidatedIds).size !== invalidatedIds.length ||
      invalidatedIds.some((id) => !missingSliceIds.includes(id)) ||
      recovery.retained_slice_count !== verifiedSliceCount) fail()
  try {
    assertPlan55Cleanup(recovery.cleanup)
  } catch {
    fail()
  }
  return true
}

function isRetryablePlan55AttemptError(errorCode) {
  return errorCode === 'plan55_canary_chat_request_failed' ||
    /^plan55_canary_chat_request_failed_(408|425|429|500|502|503|504)$/u.test(errorCode ?? '')
}

function isRetryableRecoveredCleanupError(errorCode) {
  return new Set([
    'plan55_canary_auth_cleanup_unverified',
    'plan55_canary_auth_delete_failed',
    'plan55_canary_cleanup_mutation_failed',
    'plan55_canary_cleanup_rows_pending',
    'plan55_canary_cleanup_unverified',
    'plan55_canary_flag_cleanup_unverified',
    'plan55_canary_orphan_worker_unverified',
    'plan55_canary_scoped_flag_cleanup_failed',
  ]).has(errorCode)
}

export function buildPlan55ProductionClientHeaders(healthPayload, deployment) {
  const release = healthPayload?.release
  const compatibility = release?.client_compatibility
  const ios = compatibility?.ios
  const activeClientGitSha = String(compatibility?.gitSha ?? '').toLowerCase()
  const activeClientReleaseId = compatibility?.releaseId
  const fail = () => { throw new Error('plan55_preflight_client_identity_unverified') }
  if (!deployment || !/^[a-f0-9]{40}$/iu.test(deployment.git_sha ?? '') ||
      typeof deployment.release_id !== 'string' ||
      String(release?.git_sha ?? '').toLowerCase() !== deployment.git_sha.toLowerCase() ||
      release?.release_id !== deployment.release_id ||
      !POSITIVE_INTEGER(compatibility?.contractEpoch) || compatibility.contractEpoch < 1 ||
      !POSITIVE_INTEGER(ios?.minimumBuildNumber) || ios.minimumBuildNumber < 1 ||
      typeof ios?.applicationId !== 'string' ||
      ios.applicationId.length > 160 || !CLIENT_IDENTITY_HEADER_PATTERN.test(ios.applicationId) ||
      !EAS_BUILD_ID_PATTERN.test(ios?.easBuildId ?? '') ||
      typeof ios?.runtimeVersion !== 'string' ||
      ios.runtimeVersion.length > 80 || !CLIENT_IDENTITY_HEADER_PATTERN.test(ios.runtimeVersion) ||
      activeClientGitSha !== PLAN55_PRODUCTION_SOURCE_BASE.sha ||
      activeClientReleaseId !== PLAN55_PRODUCTION_SOURCE_BASE.releaseId) fail()

  return Object.freeze({
    'x-client-platform': 'ios',
    'x-client-application-id': ios.applicationId,
    'x-client-build-number': String(ios.minimumBuildNumber),
    'x-client-contract-epoch': String(compatibility.contractEpoch),
    'x-client-eas-build-id': ios.easBuildId.toLowerCase(),
    'x-client-runtime-version': ios.runtimeVersion,
    'x-client-git-sha': activeClientGitSha,
    'x-client-release-id': activeClientReleaseId,
  })
}

export function assertPlan55CanaryPreflight(input) {
  if (!input || typeof input !== 'object') throw new Error('plan55_preflight_invalid')
  const target = validateProductionEvalTargets(
    input.mobileApiUrl,
    input.supabaseUrl,
    input.productionCanaryOptIn,
  )
  const deployment = validateProductionHealthPayload(input.healthPayload)
  const clientHeaders = buildPlan55ProductionClientHeaders(input.healthPayload, deployment)
  if (target.mobileApiUrl !== PRODUCTION_MOBILE_API_URL ||
      input.releaseLane !== 'plan55-production-only') {
    throw new Error('plan55_preflight_wrong_target_or_lane')
  }
  const source = assertPlan55SourceAttestation(input.sourceAttestation, deployment.git_sha)
  const sourceAttestationSha256 = plan55SourceAttestationSha256(input.sourceAttestation, deployment.git_sha)
  assertPlan55IndependentHoldoutProof(
    input.independentHoldoutProof,
    source.sourceSha,
    input.holdoutAssetHashes,
    input.holdoutLabelsSha256,
  )
  const guard = input.actorGuardProof
  const guardVerification = guard?.verification
  const attestedGuardFile = input.sourceAttestation.runtime_files.find(
    (file) => file.path === ACTOR_GUARD_RUNTIME_PATH,
  )
  if (!guard || typeof guard.source_sha !== 'string' ||
      guard.source_sha.toLowerCase() !== deployment.git_sha ||
      guard.runtime_file_path !== ACTOR_GUARD_RUNTIME_PATH ||
      typeof guard.runtime_file_sha256 !== 'string' ||
      guard.runtime_file_sha256.toLowerCase() !== attestedGuardFile.deployed_sha256.toLowerCase() ||
      guard.verified_auth_context !== true ||
      guard.ignores_request_body_id !== true ||
      guard.canary_precedes_legacy_global !== true ||
      guard.regression_tests_pass !== true ||
      guardVerification?.method !== PLAN55_ACTOR_GUARD_VERIFICATION ||
      guardVerification.repository !== PLAN55_GITHUB_REPOSITORY ||
      typeof guardVerification.source_sha !== 'string' ||
      guardVerification.source_sha.toLowerCase() !== deployment.git_sha ||
      typeof guardVerification.runtime_file_blob_sha1 !== 'string' ||
      guardVerification.runtime_file_blob_sha1.toLowerCase() !== attestedGuardFile.git_blob_sha1.toLowerCase() ||
      !Number.isSafeInteger(guardVerification.pull_request_number) || guardVerification.pull_request_number < 1 ||
      !/^[a-f0-9]{40}$/iu.test(guardVerification.reviewed_head_sha ?? '') ||
      !Number.isSafeInteger(guardVerification.check_run_id) || guardVerification.check_run_id < 1 ||
      guardVerification.check_run_name !== PLAN55_ACTOR_GUARD_CHECK_NAME ||
      guardVerification.check_run_conclusion !== 'success') {
    throw new Error('plan55_preflight_actor_guard_unverified')
  }

  assertFlagsFailClosed(input.flagStates)
  assertVerificationProviders(input.verificationProviders)
  return Object.freeze({
    target,
    deployment,
    source,
    sourceAttestation: input.sourceAttestation,
    sourceAttestationSha256,
    clientHeaders,
    serviceCanaryFlagName(service) {
      if (!PLAN55_SERVICE_ORDER.includes(service)) {
        throw new Error('plan55_canary_unsupported_service')
      }
      return `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_ENABLED`
    },
  })
}

export function assertPlan55IndependentHoldoutProof(
  proof,
  expectedSourceSha,
  expectedHoldoutHashes,
  expectedHoldoutLabelsSha256,
) {
  const fail = () => { throw new Error('plan55_preflight_independent_holdout_unverified') }
  const evidence = proof?.review_evidence
  const verification = proof?.github_review_verification
  if (!proof || proof.schema !== 'plan55-independent-holdout-proof/v4' ||
      proof.status !== 'PASS' || proof.blinded !== true ||
      proof.reviewed_by_author !== false ||
      typeof proof.source_sha !== 'string' ||
      proof.source_sha.toLowerCase() !== String(expectedSourceSha).toLowerCase() ||
      proof.holdout_labels_sha256 !== expectedHoldoutLabelsSha256 ||
      !/^sha256:[a-f0-9]{64}$/iu.test(expectedHoldoutLabelsSha256 ?? '') ||
      typeof proof.author_id_sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/iu.test(proof.author_id_sha256) ||
      !evidence || evidence.repository !== PLAN55_GITHUB_REPOSITORY ||
      !Number.isSafeInteger(evidence.pull_request_number) || evidence.pull_request_number < 1 ||
      typeof evidence.reviewed_head_sha !== 'string' || !/^[a-f0-9]{40}$/iu.test(evidence.reviewed_head_sha) ||
      !verification || typeof verification !== 'object' || Array.isArray(verification) ||
      evidence.production_source_base_branch !== PLAN55_PRODUCTION_SOURCE_BASE.branch ||
      String(evidence.production_source_base_sha ?? '').toLowerCase() !== PLAN55_PRODUCTION_SOURCE_BASE.sha ||
      evidence.production_source_target_branch !== PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH ||
      String(evidence.production_source_target_branch_tip_sha ?? '').toLowerCase() !==
        String(verification.production_source_target_branch_tip_sha ?? '').toLowerCase() ||
      !/^[a-f0-9]{40}$/iu.test(evidence.production_source_target_branch_tip_sha ?? '') ||
      !['ahead', 'identical'].includes(evidence.production_source_base_ancestry_status) ||
      !['ahead', 'identical'].includes(evidence.production_source_target_branch_ancestry_status) ||
      !Array.isArray(proof.reviewer_attestations) ||
      proof.reviewer_attestations.length < PLAN55_MINIMUM_INDEPENDENT_HOLDOUT_REVIEWERS ||
      verification.method !== PLAN55_GITHUB_REVIEW_VERIFICATION ||
      verification.repository !== PLAN55_GITHUB_REPOSITORY ||
      verification.pull_request_number !== evidence.pull_request_number ||
      String(verification.reviewed_head_sha ?? '').toLowerCase() !== evidence.reviewed_head_sha.toLowerCase() ||
      String(verification.merge_sha ?? '').toLowerCase() !== String(expectedSourceSha).toLowerCase() ||
      verification.production_source_base_branch !== PLAN55_PRODUCTION_SOURCE_BASE.branch ||
      String(verification.production_source_base_sha ?? '').toLowerCase() !== PLAN55_PRODUCTION_SOURCE_BASE.sha ||
      verification.production_source_target_branch !== PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH ||
      verification.production_source_base_ancestry_status !== evidence.production_source_base_ancestry_status ||
      verification.production_source_target_branch_ancestry_status !==
        evidence.production_source_target_branch_ancestry_status ||
      !['ahead', 'identical'].includes(verification.production_source_base_ancestry_status) ||
      !['ahead', 'identical'].includes(verification.production_source_target_branch_ancestry_status) ||
       verification.holdout_labels_sha256 !== expectedHoldoutLabelsSha256 ||
      !Array.isArray(verification.review_ids) ||
      verification.review_ids.length < PLAN55_MINIMUM_INDEPENDENT_HOLDOUT_REVIEWERS ||
      !Array.isArray(evidence.review_ids) ||
      evidence.review_ids.length < PLAN55_MINIMUM_INDEPENDENT_HOLDOUT_REVIEWERS) fail()

  const reviewers = new Set()
  const reviewIds = new Set()
  for (const attestation of proof.reviewer_attestations) {
    if (!attestation || !Number.isSafeInteger(attestation.review_id) || attestation.review_id < 1 ||
        typeof attestation.reviewer_id_sha256 !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/iu.test(attestation.reviewer_id_sha256) ||
        attestation.labels_sha256 !== expectedHoldoutLabelsSha256 ||
        !/^sha256:[a-f0-9]{64}$/iu.test(attestation.labels_sha256 ?? '') ||
        reviewers.has(attestation.reviewer_id_sha256) ||
        reviewIds.has(attestation.review_id) ||
        attestation.reviewer_id_sha256 === proof.author_id_sha256) fail()
    reviewers.add(attestation.reviewer_id_sha256)
    reviewIds.add(attestation.review_id)
  }
  const sortIds = (values) => [...values].sort((left, right) => left - right).join(',')
  if (sortIds(evidence.review_ids) !== sortIds(reviewIds) ||
      sortIds(verification.review_ids) !== sortIds(reviewIds)) fail()

  if (!expectedHoldoutHashes || typeof expectedHoldoutHashes !== 'object' ||
      !proof.holdouts || typeof proof.holdouts !== 'object' || Array.isArray(proof.holdouts) ||
      Object.keys(proof.holdouts).length !== PLAN55_SERVICE_ORDER.length) fail()
  for (const service of PLAN55_SERVICE_ORDER) {
    const holdout = proof.holdouts[service]
    if (!holdout || holdout.path !== PLAN55_SOURCE_ASSETS[service].holdout ||
        !/^sha256:[a-f0-9]{64}$/iu.test(holdout.sha256 ?? '') ||
        holdout.sha256.toLowerCase() !== String(expectedHoldoutHashes[service] ?? '').toLowerCase() ||
        !Number.isSafeInteger(holdout.case_count) || holdout.case_count < CASES_PER_SLICE * 2) fail()
  }
  return true
}

export function assertPlan55Cleanup(value) {
  if (!value || typeof value !== 'object') throw new Error('plan55_cleanup_receipt_missing')
  if (value.globalFlags !== 'absent') {
    throw new Error('plan55_cleanup_global_flags_remain')
  }
  if (value.canaryFlag !== 'absent') {
    throw new Error('plan55_cleanup_canary_flag_still_enabled')
  }
  if (value.canaryActorId !== 'absent') {
    throw new Error('plan55_cleanup_canary_actor_still_configured')
  }
  if (value.authStatus !== 404) {
    throw new Error('plan55_cleanup_auth_actor_still_exists')
  }
  if (!value.rows || CLEANUP_TABLES.some((table) => value.rows[table] !== 0)) {
    throw new Error('plan55_cleanup_residual_rows_detected')
  }
  if (value.orphanWorkers !== 0) {
    throw new Error('plan55_cleanup_orphan_worker_detected')
  }
  return true
}

export function evaluatePlan55G5({ service, slices }) {
  const plan = buildPlan55ServiceSlices(service)
  if (!Array.isArray(slices) || slices.length !== plan.length) {
    throw new Error('plan55_canary_g5_receipt_invalid')
  }

  const receipts = new Map()
  for (const receipt of slices) {
    if (!receipt || typeof receipt.sliceId !== 'string' || receipts.has(receipt.sliceId)) {
      throw new Error('plan55_canary_g5_receipt_invalid')
    }
    receipts.set(receipt.sliceId, receipt)
  }
  if (plan.some(({ id }) => !receipts.has(id)) || receipts.size !== plan.length) {
    throw new Error('plan55_canary_g5_receipt_invalid')
  }

  const deltas = {}
  let passed = true
  for (const dataset of DATASETS) {
    const beforeSlices = plan.filter((slice) =>
      slice.arm === 'baseline' && slice.dataset === dataset)
    const afterSlices = plan.filter((slice) => slice.arm === 'after' && slice.dataset === dataset)
    for (let index = 0; index < REPETITIONS.length; index += 1) {
      const beforeMetrics = readG5SliceMetrics(receipts.get(beforeSlices[index].id))
      const afterMetrics = readG5SliceMetrics(receipts.get(afterSlices[index].id))
      if (beforeMetrics.safety.expected !== afterMetrics.safety.expected) {
        throw new Error('plan55_canary_g5_expected_denominator_mismatch')
      }
    }
    const before = sumG5Metrics(beforeSlices.map((slice) => receipts.get(slice.id)))
    const after = sumG5Metrics(afterSlices.map((slice) => receipts.get(slice.id)))

    if (before.scopeSignal.total !== after.scopeSignal.total ||
        before.problemSlug.total !== after.problemSlug.total ||
        before.safety.expected !== after.safety.expected) {
      throw new Error('plan55_canary_g5_expected_denominator_mismatch')
    }

    const scopeSignalPassed = after.scopeSignal.passed * before.scopeSignal.total >=
      before.scopeSignal.passed * after.scopeSignal.total
    const problemSlugPassed = after.problemSlug.passed * before.problemSlug.total >=
      before.problemSlug.passed * after.problemSlug.total
    const safetyRecallPassed = after.safety.observed * before.safety.expected >=
      before.safety.observed * after.safety.expected
    const fallbackShareDifferenceNumerator = Math.abs(
      after.providerFallback.runs * before.providerFallback.total -
      before.providerFallback.runs * after.providerFallback.total,
    )
    const fallbackSharePassed = fallbackShareDifferenceNumerator * 100 <=
      20 * before.providerFallback.total * after.providerFallback.total
    passed &&= scopeSignalPassed && problemSlugPassed && safetyRecallPassed && fallbackSharePassed
    deltas[dataset] = Object.freeze({
      scope_signal: Object.freeze({
        baseline: before.scopeSignal,
        after: after.scopeSignal,
        delta: roundMetric(
          (after.scopeSignal.passed / after.scopeSignal.total) -
          (before.scopeSignal.passed / before.scopeSignal.total),
        ),
        non_decreasing: scopeSignalPassed,
      }),
      problem_slug: Object.freeze({
        baseline: before.problemSlug,
        after: after.problemSlug,
        delta: roundMetric(
          (after.problemSlug.passed / after.problemSlug.total) -
          (before.problemSlug.passed / before.problemSlug.total),
        ),
        non_decreasing: problemSlugPassed,
      }),
      required_safety_recall: Object.freeze({
        baseline: before.safety,
        after: after.safety,
        delta: roundMetric(
          (after.safety.observed / after.safety.expected) -
          (before.safety.observed / before.safety.expected),
        ),
        non_decreasing: safetyRecallPassed,
      }),
      provider_fallback: Object.freeze({
        baseline: before.providerFallback,
        after: after.providerFallback,
        delta: roundMetric(
          (after.providerFallback.runs / after.providerFallback.total) -
          (before.providerFallback.runs / before.providerFallback.total),
        ),
        within_20pp: fallbackSharePassed,
      }),
    })
  }

  return Object.freeze({ passed, deltas: Object.freeze(deltas) })
}

export function validatePlan55SliceArtifacts({ receipt, slice, deployment, expectedCaseIds, sourceAttestation }) {
  const fail = () => { throw new Error('plan55_canary_slice_artifact_integrity_failed') }
  if (!receipt || !slice || !deployment || !Array.isArray(expectedCaseIds) ||
      expectedCaseIds.length !== CASES_PER_SLICE) fail()
  const { json, raw, markdown, summary } = receipt
  const manifest = json?.manifest
  if (!manifest || !raw?.manifest || !Array.isArray(json.runs) ||
      !Array.isArray(raw.observations) || typeof markdown !== 'string' || !summary) fail()
  if (!isDeepStrictEqual(manifest, raw.manifest) ||
      !isDeepStrictEqual(receipt.sourceAttestation, sourceAttestation)) fail()

  const markdownManifest = markdown.match(/## Run manifest\s*\r?\n+\s*```json\s*\r?\n([\s\S]*?)\r?\n```/u)
  if (!markdownManifest || !isDeepStrictEqual(JSON.parse(markdownManifest[1]), manifest)) fail()
  const metrics = json.metrics
  if (!metrics || !isDeepStrictEqual(metrics, summary.metrics) || metrics.total !== CASES_PER_SLICE ||
      summary.cases !== CASES_PER_SLICE || summary.mode !== 'live') fail()
  const metricDigest = createHash('sha256').update(JSON.stringify(metrics)).digest('hex')
  if (!markdown.includes(`<!-- plan55-eval-metrics-sha256:${metricDigest} -->`)) fail()

  let sourceAttestationSha256
  try {
    sourceAttestationSha256 = plan55SourceAttestationSha256(sourceAttestation, deployment.git_sha)
  } catch {
    fail()
  }

  const stability = json.stability
  const matrix = metrics.routing?.confusion_matrix
  if (!stability || !matrix) fail()
  const pct = (value) => value == null ? 'n/a' : `${Math.round(value * 1000) / 10}%`
  const renderedMetrics = [
    ['- Overall:', `- Overall: ${pct(metrics.overall_pass_rate)} (${metrics.passed}/${metrics.total})`],
    ['- Routing accuracy:', `- Routing accuracy: ${pct(metrics.routing.accuracy)} (${metrics.total - metrics.routing.unclassified}/${metrics.total} classified runs)`],
    ['- Routing macro-F1:', `- Routing macro-F1: ${metrics.routing.macro_f1 ?? 'n/a'}`],
    ['- False-decline rate:', `- False-decline rate: ${pct(metrics.routing.false_decline_rate)} (${metrics.routing.false_declines}/${metrics.routing.valid_jobs})`],
    ['- Suggested-service accuracy:', `- Suggested-service accuracy: ${pct(metrics.by_field.suggested_service.rate)}`],
    ['- Clarification accuracy:', `- Clarification accuracy: ${pct(metrics.by_field.needs_clarification.rate)}`],
    ['- Observed clarification rate:', `- Observed clarification rate: ${pct(metrics.conversation.clarification_rate)}`],
    ['- Problem-slug accuracy:', `- Problem-slug accuracy: ${pct(metrics.by_field.problem_slug.rate)}`],
    ['- Deterministic fallback share:', `- Deterministic fallback share: ${pct(metrics.provider_fallback.fallback_runs / metrics.provider_fallback.total_runs)} (${metrics.provider_fallback.fallback_runs}/${metrics.provider_fallback.total_runs})`],
    ['- Required-safety recall:', `- Required-safety recall: ${pct(metrics.safety.required_signal_recall)} (${metrics.safety.observed_required_signals}/${metrics.safety.expected_required_signals}); misses: ${metrics.safety.required_signal_misses}`],
    ['- Immediate-critical recall:', `- Immediate-critical recall: ${pct(metrics.safety.immediate_critical_recall)} (${metrics.safety.observed_immediate_critical_signals}/${metrics.safety.expected_immediate_critical_signals}); misses: ${metrics.safety.immediate_critical_misses}`],
    ['- Capability-signal recall:', `- Capability-signal recall: ${pct(metrics.safety.capability_recall)} (${metrics.safety.observed_capability_signals}/${metrics.safety.expected_capability_signals}); misses: ${metrics.safety.capability_misses}`],
    ['- Safety false-positive rate:', `- Safety false-positive rate: ${pct(metrics.safety.false_positive_rate)} (${metrics.safety.false_positives}/${metrics.safety.forbidden_signal_checks})`],
    ['- Average turns:', `- Average turns: ${metrics.conversation.average_turns ?? 'n/a'}`],
    ['- Latency p50 / p95:', `- Latency p50 / p95: ${metrics.conversation.latency_ms_p50 ?? 'n/a'} / ${metrics.conversation.latency_ms_p95 ?? 'n/a'} ms`],
    ['- Repeated-run fully-consistent rate (error-aware):', `- Repeated-run fully-consistent rate (error-aware): ${pct(stability.fully_consistent_rate)}`],
    ['- Outcome-mode agreement (diagnostic; errored outcomes can agree):', `- Outcome-mode agreement (diagnostic; errored outcomes can agree): ${pct(stability.consistency_rate)}`],
    ['- Errored case groups / runs:', `- Errored case groups / runs: ${stability.errored_cases} / ${stability.errored_runs}`],
    ['- Release gate:', `- Release gate: ${manifest.run_config?.allow_failures ? 'diagnostic override enabled' : 'strict'}`],
  ]
  const markdownLines = markdown.split(/\r?\n/u)
  for (const [prefix, expectedLine] of renderedMetrics) {
    const actualLines = markdownLines.filter((line) => line.startsWith(prefix))
    if (actualLines.length !== 1 || actualLines[0] !== expectedLine) fail()
  }

  const matrixSection = markdown.split(/## Routing confusion matrix\s*\r?\n/u)[1]?.split(/\r?\n## /u)[0] ?? ''
  const matrixRows = matrixSection.split(/\r?\n/u)
    .filter((line) => /^\|\s*(in_scope|out_of_scope|service_mismatch)\s*\|/u.test(line))
  const expectedMatrixRows = ['in_scope', 'out_of_scope', 'service_mismatch'].map((expected) =>
    `| ${expected} | ${matrix[expected].in_scope} | ${matrix[expected].out_of_scope} | ${matrix[expected].service_mismatch} |`
  )
  const expectedRunCount = `Run-level counts: ${stability.cases} unique cases x ${manifest.repetitions} repetition(s).`
  if (!matrixSection ||
      matrixRows.length !== expectedMatrixRows.length ||
      !isDeepStrictEqual(matrixRows, expectedMatrixRows) ||
      matrixSection.split(expectedRunCount).length !== 2) fail()

  const expectedState = slice.playbookEnabled ? 'on' : 'off'
  const featureFlag = `${slice.service}_playbook`
  const runConfig = manifest.run_config
  if (manifest.run_mode !== 'live' || manifest.deployment_version !== deployment.release_id ||
      manifest.git_sha?.toLowerCase() !== deployment.git_sha.toLowerCase() ||
      manifest.git_sha_scope !== 'deployed_production_release' ||
      manifest.deployment_version_source !== 'production_health_payload' ||
      manifest.deployment_attestation !== 'production_runtime_source_attestation' ||
      manifest.source_attestation_sha256 !== `sha256:${sourceAttestationSha256}` ||
      manifest.observed_playbook_state !== expectedState ||
      manifest.feature_flags?.[featureFlag] !== slice.playbookEnabled ||
      manifest.corpus_path !== slice.corpusPath ||
      manifest.playbook_source_path !== slice.playbookPath ||
      manifest.source_scope !== 'production_attested_runtime_and_local_slice_source' ||
      runConfig?.offset !== slice.offset || runConfig?.limit !== CASES_PER_SLICE ||
      runConfig?.allow_failures !== false || manifest.repetitions !== 1) fail()

  const jsonIds = json.runs.map((run) => run.id)
  const rawIds = raw.observations.map((observation) => observation.id)
  if (json.runs.length !== raw.observations.length || json.runs.some((run, index) => {
    const observation = raw.observations[index]
    return run.repetition !== observation.repetition ||
      run.error_code !== observation.error_code ||
      !isDeepStrictEqual(run.observed, observation.observation)
  })) fail()
  let recomputedMetrics
  let recomputedStability
  try {
    const scored = json.runs.map((run, index) => {
      const observation = raw.observations[index]
      const recomputedScore = scorePlaybookCase(run.expected, observation.observation, observation.error_code)
      if (!isDeepStrictEqual(run.score, recomputedScore)) fail()
      return {
        id: run.id,
        repetition: run.repetition,
        expected: run.expected,
        observed: observation.observation,
        score: recomputedScore,
        turns: observation.turns,
        clarificationTurns: observation.clarification_turns,
        latency_ms: observation.latency_ms,
      }
    })
    recomputedMetrics = aggregatePlaybookResults(scored)
    recomputedStability = aggregateRepetitionStability(scored)
  } catch {
    fail()
  }
  const actualFallbackRuns = raw.observations.filter((item) =>
    item.observation?.model_id === 'deterministic-fallback').length
  const aggregateMetrics = { ...metrics }
  delete aggregateMetrics.provider_fallback
  if (!isDeepStrictEqual(metrics.provider_fallback, {
    fallback_runs: actualFallbackRuns,
    total_runs: expectedCaseIds.length,
  }) || !isDeepStrictEqual(aggregateMetrics, recomputedMetrics) ||
      !isDeepStrictEqual(stability, recomputedStability)) fail()
  const markdownRuns = markdown.split(/## Runs\s*\r?\n/u)[1]?.split(/\r?\n## /u)[0] ?? ''
  const markdownIds = [...markdownRuns.matchAll(/^\|\s*([^|]+?)\s*\|\s*\d+\s*\|/gmu)]
    .map((match) => match[1].trim())
  if (!isDeepStrictEqual(jsonIds, expectedCaseIds) ||
      !isDeepStrictEqual(rawIds, expectedCaseIds) ||
      !isDeepStrictEqual(markdownIds, expectedCaseIds) ||
      raw.observations.some((item) => item.error_code !== null) ||
      json.runs.some((item) => item.error_code !== null || item.score?.error)) fail()
  return Object.freeze({
    sliceId: slice.id,
    caseCount: CASES_PER_SLICE,
    errorCount: 0,
    artifactIntegrity: 'pass',
    sourceSha: deployment.git_sha,
    sourceAttestationSha256: sourceAttestationSha256,
    corpusPath: slice.corpusPath,
    playbookPath: slice.playbookPath,
    playbookEnabled: slice.playbookEnabled,
    metrics,
    runId: manifest.started_at,
  })
}

export async function runPlan55ServiceSequence({ services = PLAN55_SERVICE_ORDER, operations }) {
  assertOrderedServiceSubset(services)
  assertOperations(operations)
  const results = []

  for (const service of services) {
    const preflight = assertPlan55CanaryPreflight(await operations.preflight(service))
    const plan = buildPlan55ServiceSlices(service)
    const slicesById = new Map()
    // The store must expose staged slices only after the exact deployment and a prior
    // verified service-cleanup marker match; an interrupted, uncleaned run is not reusable.
    if (operations.loadVerifiedSliceReceipt) {
      for (const slice of plan) {
        const receipt = await operations.loadVerifiedSliceReceipt({
          service,
          slice,
          deployment: preflight.deployment,
        })
        if (receipt !== null && receipt !== undefined) {
          assertPlan55SliceReceipt(receipt, slice, preflight.deployment, preflight.sourceAttestationSha256)
          slicesById.set(slice.id, receipt)
        }
      }
    }

    const missingSlices = plan.filter((slice) => !slicesById.has(slice.id))
    let checkpoint = null
    if (missingSlices.length > 0) {
      checkpoint = await operations.beginServiceCheckpoint({
        service,
        deployment: preflight.deployment,
        slices: missingSlices,
      })
      if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
        throw new Error('plan55_canary_checkpoint_invalid')
      }
    }
    let actor = null
    let flagMayBeEnabled = false
    let evaluationError = null

    try {
      if (missingSlices.length > 0) {
        actor = await operations.createSyntheticActor(service)
        if (!actor || actor.synthetic !== true || !isUuid(actor.id)) {
          throw new Error('plan55_canary_actor_not_synthetic')
        }

        for (const slice of missingSlices.filter((item) => item.arm === 'baseline')) {
          slicesById.set(slice.id, await runAndCheckSlice(
            operations, service, actor, slice, preflight, checkpoint,
          ))
        }

        const missingAfterSlices = missingSlices.filter((item) => item.arm === 'after')
        if (missingAfterSlices.length > 0) {
          flagMayBeEnabled = true
          await operations.enableActorCanary(service, actor)
          for (const slice of missingAfterSlices) {
            slicesById.set(slice.id, await runAndCheckSlice(
              operations, service, actor, slice, preflight, checkpoint,
            ))
          }
        }
      }
    } catch (error) {
      evaluationError = safeCode(error, 'plan55_canary_evaluation_failed')
    }

    let cleanup = { passed: true, reused: missingSlices.length === 0 }
    if (checkpoint !== null) {
      try {
        const cleanupReceipt = await operations.cleanupService({
          service,
          actor,
          flagMayBeEnabled,
          checkpoint,
        })
        assertPlan55Cleanup(cleanupReceipt)
        await operations.persistVerifiedServiceCleanup({
          service,
          deployment: preflight.deployment,
          slices: [...slicesById.values()],
          cleanup: cleanupReceipt,
          checkpoint,
        })
      } catch (error) {
        throw new Error(safeCode(error, 'plan55_canary_cleanup_failed'))
      }
    }
    if (evaluationError) throw new Error(evaluationError)
    const slices = plan.map((slice) => slicesById.get(slice.id))
    if (slices.length !== 8 || slices.some((receipt) => !receipt)) {
      throw new Error('plan55_canary_incomplete_slice_set')
    }

    const g5 = evaluatePlan55G5({ service, slices })
    results.push(Object.freeze({
      service,
      status: g5.passed ? 'G5_PASSED' : 'G5_FAILED_SERVICE_OFF',
      slices: slices.map(({ sliceId, caseCount, errorCount }) => ({
        sliceId,
        caseCount,
        errorCount,
      })),
      g5: g5.deltas,
      cleanup: Object.freeze(cleanup),
      releaseId: preflight.deployment.release_id,
      sourceSha: preflight.deployment.git_sha,
    }))
  }

  return Object.freeze({
    schema: 'plan55-production-canary-sequence/v1',
    projectRef: PRODUCTION_PROJECT_REF,
    services: Object.freeze(results),
  })
}

async function runAndCheckSlice(operations, service, actor, slice, preflight, checkpoint) {
  const receipt = await operations.runSlice({
    service,
    actor,
    slice,
    deployment: preflight.deployment,
    sourceAttestation: preflight.sourceAttestation,
    sourceAttestationSha256: preflight.sourceAttestationSha256,
    clientHeaders: preflight.clientHeaders,
  })
  assertPlan55SliceReceipt(receipt, slice, preflight.deployment, preflight.sourceAttestationSha256)
  await operations.persistVerifiedSliceReceipt({
    service,
    slice,
    deployment: preflight.deployment,
    receipt,
    checkpoint,
  })
  return receipt
}

function assertPlan55SliceReceipt(receipt, slice, deployment, sourceAttestationSha256) {
  if (!receipt || receipt.sliceId !== slice.id || receipt.caseCount !== CASES_PER_SLICE ||
      receipt.errorCount !== 0 || receipt.artifactIntegrity !== 'pass' ||
      !/^[a-f0-9]{64}$/iu.test(sourceAttestationSha256 ?? '') ||
      receipt.sourceSha !== deployment.git_sha ||
      receipt.sourceAttestationSha256 !== sourceAttestationSha256 ||
      receipt.corpusPath !== slice.corpusPath || receipt.playbookPath !== slice.playbookPath ||
      receipt.playbookEnabled !== slice.playbookEnabled ||
      !isSafeArtifactReceipt(receipt.artifactFiles, receipt.artifactSha256, slice, deployment)) {
    throw new Error('plan55_canary_slice_receipt_invalid')
  }
}

export function isSafeArtifactReceipt(files, hashes, slice, deployment) {
  const names = ['slice.json', 'slice.raw.json', 'slice.md', 'source-attestation.json']
  if (!files || typeof files !== 'object' || Array.isArray(files) ||
      !hashes || typeof hashes !== 'object' || Array.isArray(hashes) || !slice || !deployment ||
      Object.keys(files).length !== names.length || Object.keys(hashes).length !== names.length) return false
  const prefix = `docs/test-logs/plan55/${deployment.git_sha}/${slice.service}/${slice.id}/`
  return names.every((name) => {
    const path = files[name]
    if (typeof path !== 'string' || !path.startsWith(prefix) || path.includes('\\') ||
        path.split('/').some((segment) => segment === '.' || segment === '..') ||
        !/^([a-f0-9]{64})$/iu.test(hashes[name] ?? '')) return false
    const remainder = path.slice(prefix.length).split('/')
    return remainder.length === 2 && /^[a-z0-9-]{1,120}$/iu.test(remainder[0]) && remainder[1] === name
  })
}

function assertFlagsFailClosed(flagStates) {
  if (!flagStates || typeof flagStates !== 'object') throw new Error('plan55_preflight_flag_inventory_missing')
  const expected = [
    ...GLOBAL_FLAG_NAMES,
    ...CANARY_FLAG_NAMES,
    ...CANARY_ACTOR_NAMES,
    'KAEL_INTAKE_EVAL_OBSERVATION_ENABLED',
  ]
  for (const name of expected) {
    if (!Object.hasOwn(flagStates, name)) throw new Error('plan55_preflight_flag_inventory_incomplete')
    const value = flagStates[name]
    const absent = value === 'absent' || value === null
    const off = value === 'off' || value === false ||
      (typeof value === 'string' && ['0', 'false', 'no'].includes(value.trim().toLowerCase()))
    const isActorId = CANARY_ACTOR_NAMES.includes(name)
    if (isActorId ? !absent : !(absent || off)) {
      throw new Error('plan55_preflight_existing_flag_must_remain_off')
    }
  }
}

function assertVerificationProviders(input) {
  if (!input || !Array.isArray(input.required) || input.required.length === 0 ||
      !input.status || typeof input.status !== 'object') {
    throw new Error('plan55_preflight_provider_inventory_missing')
  }
  for (const provider of input.required) {
    if (typeof provider !== 'string' || input.status[provider] !== true) {
      throw new Error('plan55_preflight_verification_provider_not_ready')
    }
  }
}

function assertOperations(operations) {
  const required = [
    'preflight', 'createSyntheticActor', 'enableActorCanary',
    'runSlice', 'cleanupService', 'beginServiceCheckpoint',
  ]
  if (!operations || required.some((key) => typeof operations[key] !== 'function')) {
    throw new Error('plan55_canary_operations_incomplete')
  }
  const checkpointOperations = [
    'loadVerifiedSliceReceipt',
    'persistVerifiedSliceReceipt',
    'persistVerifiedServiceCleanup',
  ]
  const configuredCheckpointOperations = checkpointOperations.filter(
    (key) => typeof operations[key] === 'function',
  )
  if (configuredCheckpointOperations.length !== checkpointOperations.length) {
    throw new Error('plan55_canary_checkpoint_operations_incomplete')
  }
}

function assertOrderedServiceSubset(services) {
  if (!Array.isArray(services) || services.length === 0 ||
      services.some((service, index) => !PLAN55_SERVICE_ORDER.includes(service) ||
        (index > 0 && PLAN55_SERVICE_ORDER.indexOf(services[index - 1]) >= PLAN55_SERVICE_ORDER.indexOf(service))) ||
      new Set(services).size !== services.length) {
    throw new Error('plan55_canary_service_order_invalid')
  }
}

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function sumG5Metrics(receipts) {
  if (!Array.isArray(receipts) || receipts.length !== REPETITIONS.length) {
    throw new Error('plan55_canary_g5_receipt_invalid')
  }
  const total = {
    scopePassed: 0,
    scopeCases: 0,
    problemSlugPassed: 0,
    problemSlugCases: 0,
    safetyObserved: 0,
    safetyExpected: 0,
    fallbackRuns: 0,
    fallbackTotal: 0,
  }
  for (const receipt of receipts) {
    const metrics = readG5SliceMetrics(receipt)
    total.scopePassed += metrics.scopeSignal.passed
    total.scopeCases += metrics.scopeSignal.total
    total.problemSlugPassed += metrics.problemSlug.passed
    total.problemSlugCases += metrics.problemSlug.total
    total.safetyObserved += metrics.safety.observed
    total.safetyExpected += metrics.safety.expected
    total.fallbackRuns += metrics.providerFallback.runs
    total.fallbackTotal += metrics.providerFallback.total
  }
  return Object.freeze({
    scopeSignal: Object.freeze({
      passed: total.scopePassed,
      total: total.scopeCases,
      rate: roundMetric(total.scopePassed / total.scopeCases),
    }),
    problemSlug: Object.freeze({
      passed: total.problemSlugPassed,
      total: total.problemSlugCases,
      rate: roundMetric(total.problemSlugPassed / total.problemSlugCases),
    }),
    safety: Object.freeze({
      observed: total.safetyObserved,
      expected: total.safetyExpected,
      recall: roundMetric(total.safetyObserved / total.safetyExpected),
    }),
    providerFallback: Object.freeze({ runs: total.fallbackRuns, total: total.fallbackTotal }),
  })
}

function readG5SliceMetrics(receipt) {
  const scope = receipt?.metrics?.by_field?.scope_signal
  const problemSlug = receipt?.metrics?.by_field?.problem_slug
  const safety = receipt?.metrics?.safety
  const providerFallback = receipt?.metrics?.provider_fallback
  if (receipt?.caseCount !== CASES_PER_SLICE || receipt.errorCount !== 0 ||
      receipt.artifactIntegrity !== 'pass' ||
      !isCount(scope?.gated_cases) || scope.gated_cases !== CASES_PER_SLICE ||
      !isCount(scope?.passed) || scope.passed > scope.gated_cases ||
      !isCount(problemSlug?.gated_cases) || problemSlug.gated_cases !== CASES_PER_SLICE ||
      !isCount(problemSlug?.passed) || problemSlug.passed > problemSlug.gated_cases ||
      !isCount(safety?.expected_required_signals) || safety.expected_required_signals === 0 ||
      !isCount(safety?.observed_required_signals) ||
      safety.observed_required_signals > safety.expected_required_signals ||
      !isCount(providerFallback?.fallback_runs) || providerFallback.fallback_runs > CASES_PER_SLICE ||
      providerFallback?.total_runs !== CASES_PER_SLICE) {
    throw new Error('plan55_canary_g5_receipt_invalid')
  }
  return Object.freeze({
    scopeSignal: Object.freeze({ passed: scope.passed, total: scope.gated_cases }),
    problemSlug: Object.freeze({ passed: problemSlug.passed, total: problemSlug.gated_cases }),
    safety: Object.freeze({
      observed: safety.observed_required_signals,
      expected: safety.expected_required_signals,
    }),
    providerFallback: Object.freeze({ runs: providerFallback.fallback_runs, total: providerFallback.total_runs }),
  })
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function roundMetric(value) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000
}

function safeCode(error, fallback) {
  const code = error instanceof Error ? error.message : ''
  return /^[a-z0-9_:-]{1,100}$/i.test(code) ? code : fallback
}
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  aggregatePlaybookResults,
  aggregateRepetitionStability,
  scorePlaybookCase,
} from './kael-playbook-eval-core.mjs'
