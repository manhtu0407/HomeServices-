import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PLAN55_SERVICE_ORDER,
  assertPlan55IndependentHoldoutProof,
  assertPlan55CanaryPreflight,
  assertPlan55Cleanup,
  assertPlan55ReusableServiceAttempt,
  buildPlan55CanaryPlan,
  buildPlan55CheckpointStatus,
  buildPlan55ProductionClientHeaders,
  buildPlan55ServiceSlices,
  evaluatePlan55G5,
  isSafeArtifactReceipt,
} from './plan55-production-canary-core.mjs'
import {
  PLAN55_PRODUCTION_SOURCE_BASE,
  PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH,
} from './plan55-independent-holdout-review.mjs'
import {
  PLAN55_EVALUATOR_PATHS,
  PLAN55_RUNTIME_SOURCE_PATHS,
  PLAN55_SOURCE_ASSETS,
  PRODUCTION_MOBILE_API_URL,
  PRODUCTION_PROJECT_REF,
} from './kael-playbook-production-attestation.mjs'
import {
  PLAN55_ACTOR_GUARD_CHECK_NAME,
  PLAN55_ACTOR_GUARD_VERIFICATION,
  PLAN55_GITHUB_REVIEW_VERIFICATION,
} from './plan55-independent-holdout-review.mjs'
import { createRunManifest } from './kael-playbook-eval-core.mjs'

const productionHealth = {
  service: 'mobile-api',
  status: 'ok',
  environment: {
    project_ref: PRODUCTION_PROJECT_REF,
    provider_configuration_class: 'production-locked',
    webhook_configuration_class: 'production-signed',
  },
  release: {
    registered: true,
    git_sha: 'a'.repeat(40),
    release_id: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    deployment_id: `${PRODUCTION_PROJECT_REF}_mobile-api_1`,
    manifest_sha256: 'c'.repeat(64),
    bundle_sha256: 'd'.repeat(64),
    source_bundle_sha256: 'e'.repeat(64),
    edge_bundle_sha256: 'f'.repeat(64),
    client_compatibility: {
      gitSha: PLAN55_PRODUCTION_SOURCE_BASE.sha,
      releaseId: PLAN55_PRODUCTION_SOURCE_BASE.releaseId,
      contractEpoch: 2,
      ios: {
        applicationId: 'com.phanmanhtu.homeservices',
        minimumBuildNumber: 730,
        easBuildId: '123e4567-e89b-42d3-a456-426614174000',
        runtimeVersion: '4.9.0',
      },
    },
  },
}

test('the canary uses the pinned active client identity while attesting the newly deployed backend SHA', () => {
  const deployment = {
    git_sha: productionHealth.release.git_sha,
    release_id: productionHealth.release.release_id,
  }
  const headers = buildPlan55ProductionClientHeaders(productionHealth, deployment)
  assert.equal(headers['x-client-git-sha'], PLAN55_PRODUCTION_SOURCE_BASE.sha)
  assert.equal(headers['x-client-release-id'], PLAN55_PRODUCTION_SOURCE_BASE.releaseId)
  assert.notEqual(headers['x-client-git-sha'], deployment.git_sha)
  assert.throws(() => buildPlan55ProductionClientHeaders({
    ...productionHealth,
    release: {
      ...productionHealth.release,
      client_compatibility: {
        ...productionHealth.release.client_compatibility,
        gitSha: '0'.repeat(40),
      },
    },
  }, deployment), /preflight_client_identity_unverified/u)
})

test('canary plan is the six approved services with eight 12-case slices each', () => {
  const plan = buildPlan55CanaryPlan()
  assert.deepEqual(plan.map(({ service }) => service), PLAN55_SERVICE_ORDER)
  for (const service of plan) {
    assert.equal(service.slices.length, 8)
    assert.ok(service.slices.every((slice) => slice.limit === 12))
  }
})

test('checkpoint status separates observed case receipts from unknown or cleaned attempts', () => {
  const deployment = {
    project_ref: PRODUCTION_PROJECT_REF,
    release_id: productionHealth.release.release_id,
    git_sha: productionHealth.release.git_sha,
  }
  const sliceIds = buildPlan55ServiceSlices('hvac').map(({ id }) => id)
  const missing = buildPlan55CheckpointStatus({
    deployment,
    statuses: [{
      service: 'hvac', verifiedSliceIds: [], missingSliceIds: sliceIds,
      cleanupVerified: false, complete: false,
    }],
  })
  assert.equal(missing.schema, 'plan55-production-checkpoint-status/v2')
  assert.equal(missing.canary_started, null)
  assert.equal(missing.canary_attempt_cleaned, false)
  assert.equal(missing.canary_start_evidence, 'not_proven_by_local_checkpoints')
  assert.equal(missing.verified_slice_count, 0)

  const recorded = buildPlan55CheckpointStatus({
    deployment,
    statuses: [{
      service: 'hvac', verifiedSliceIds: [sliceIds[0]], missingSliceIds: sliceIds.slice(1),
      cleanupVerified: true, complete: false,
    }],
  })
  assert.equal(recorded.canary_started, true)
  assert.equal(recorded.canary_attempt_cleaned, true)
  assert.equal(recorded.canary_start_evidence, 'clean_verified_slice_receipt_present')
  assert.equal(recorded.verified_slice_count, 1)

  const cleanedWithoutSlices = buildPlan55CheckpointStatus({
    deployment,
    statuses: [{
      service: 'hvac', verifiedSliceIds: [], missingSliceIds: sliceIds,
      cleanupVerified: true, complete: false,
    }],
  })
  assert.equal(cleanedWithoutSlices.canary_started, null)
  assert.equal(cleanedWithoutSlices.canary_attempt_cleaned, true)
  assert.equal(cleanedWithoutSlices.canary_start_evidence, 'cleaned_service_attempt_present')
  assert.throws(() => buildPlan55CheckpointStatus({
    deployment,
    statuses: [{
      service: 'hvac', verifiedSliceIds: [sliceIds[0]], missingSliceIds: sliceIds.slice(1),
      cleanupVerified: false, complete: false,
    }],
  }), /checkpoint_status_invalid/u)
})

test('service retry reuses only exact-source slices with proven cleanup', () => {
  const service = 'hvac'
  const sourceSha = 'a'.repeat(40)
  const releaseId = `harness-${sourceSha.slice(0, 12)}-${'b'.repeat(12)}`
  const slices = buildPlan55ServiceSlices(service)
  const checkpointStatus = buildPlan55CheckpointStatus({
    deployment: { project_ref: PRODUCTION_PROJECT_REF, release_id: releaseId, git_sha: sourceSha },
    statuses: [{
      service,
      verifiedSliceIds: slices.slice(0, 3).map(({ id }) => id),
      missingSliceIds: slices.slice(3).map(({ id }) => id),
      cleanupVerified: true,
      complete: false,
    }],
  })
  const interruptedAttempt = {
    schema: 'plan55-service-attempt/v1',
    source_sha: sourceSha,
    service,
    status: 'BLOCKED_UNVERIFIED',
    error_code: 'plan55_canary_chat_request_failed_503',
    exit_code: 1,
  }
  const recovery = {
    schema: 'plan55-interrupted-service-recovery/v1',
    service,
    project_ref: PRODUCTION_PROJECT_REF,
    release_id: releaseId,
    source_sha: sourceSha,
    status: 'RECOVERY_PASS',
    cleaned_actor_count: 1,
    cleaned_actor_sha256: ['d'.repeat(64)],
    retained_slice_count: 3,
    invalidated_slice_ids: [slices[3].id],
    source_identity_verified: true,
    cleanup: {
      globalFlags: 'absent', canaryFlag: 'absent', canaryActorId: 'absent', authStatus: 404,
      orphanWorkers: 0,
      rows: {
        profiles: 0, customer_profiles: 0, customer_account_deletion_requests: 0,
        kael_chat_sessions: 0, kael_chat_turns: 0, worker_profiles: 0, jobs_as_customer: 0,
        jobs_as_worker: 0, job_broadcasts_as_worker: 0, job_events_as_actor: 0,
        chat_messages_as_sender: 0, notifications_as_user: 0,
      },
    },
  }
  assert.throws(() => assertPlan55ReusableServiceAttempt({
    attempt: interruptedAttempt, checkpointStatus, service, sourceSha, releaseId,
  }), /resume_prior_attempt_not_reusable/u)
  assert.equal(assertPlan55ReusableServiceAttempt({
    attempt: interruptedAttempt, checkpointStatus, service, sourceSha, releaseId, recovery,
  }), 'cleaned_partial_receipt_reusable')
  assert.equal(assertPlan55ReusableServiceAttempt({
    attempt: { ...interruptedAttempt, error_code: 'plan55_canary_cleanup_mutation_failed' },
    checkpointStatus, service, sourceSha, releaseId, recovery,
  }), 'cleaned_partial_receipt_reusable')
  assert.throws(() => assertPlan55ReusableServiceAttempt({
    attempt: { ...interruptedAttempt, error_code: 'plan55_canary_production_source_drift' },
    checkpointStatus, service, sourceSha, releaseId, recovery,
  }), /resume_prior_attempt_not_reusable/u)
  assert.throws(() => assertPlan55ReusableServiceAttempt({
    attempt: interruptedAttempt,
    checkpointStatus,
    service,
    sourceSha,
    releaseId,
    recovery: { ...recovery, cleanup: { ...recovery.cleanup, authStatus: 200 } },
  }), /resume_prior_attempt_not_reusable/u)
  assert.equal(assertPlan55ReusableServiceAttempt({
    attempt: null, checkpointStatus, service, sourceSha, releaseId,
  }), 'clean_checkpoint_reusable')
  assert.equal(assertPlan55ReusableServiceAttempt({
    attempt: null, checkpointStatus, service, sourceSha, releaseId, recovery,
  }), 'cleaned_checkpoint_reusable_after_recovery')
  assert.throws(() => assertPlan55ReusableServiceAttempt({
    attempt: null,
    checkpointStatus,
    service,
    sourceSha,
    releaseId,
    recovery: { ...recovery, source_identity_verified: false },
  }), /resume_prior_attempt_not_reusable/u)
  assert.throws(() => assertPlan55ReusableServiceAttempt({
    attempt: interruptedAttempt,
    checkpointStatus: {
      ...checkpointStatus,
      deployment: { ...checkpointStatus.deployment, source_sha: 'c'.repeat(40) },
    },
    service,
    sourceSha,
    releaseId,
  }), /resume_prior_attempt_not_reusable/u)
  for (const errorCode of [
    'plan55_canary_case_failed',
    'plan55_canary_production_source_drift',
    'plan55_canary_actor_session_refresh_failed',
    'plan55_canary_chat_request_failed_426',
  ]) {
    assert.throws(() => assertPlan55ReusableServiceAttempt({
      attempt: { ...interruptedAttempt, error_code: errorCode },
      checkpointStatus,
      service,
      sourceSha,
      releaseId,
    }), /resume_prior_attempt_not_reusable/u)
  }
  assert.throws(() => assertPlan55ReusableServiceAttempt({
    attempt: { ...interruptedAttempt, error_code: 'plan55_canary_chat_request_failed' },
    checkpointStatus, service, sourceSha, releaseId,
  }), /resume_prior_attempt_not_reusable/u)
  assert.equal(assertPlan55ReusableServiceAttempt({
    attempt: { ...interruptedAttempt, error_code: 'plan55_canary_chat_request_failed' },
    checkpointStatus, service, sourceSha, releaseId, recovery,
  }), 'cleaned_partial_receipt_reusable')
  assert.throws(() => assertPlan55ReusableServiceAttempt({
    attempt: interruptedAttempt,
    checkpointStatus: {
      ...checkpointStatus,
      services: [{ ...checkpointStatus.services[0], cleanup_verified: false }],
    },
    service,
    sourceSha,
    releaseId,
  }), /resume_prior_attempt_not_reusable/u)
})

test('G5 rejects a problem-slug regression even when scope and safety are unchanged', () => {
  const service = 'upholstery'
  const slices = buildPlan55ServiceSlices(service).map((slice) => ({
    sliceId: slice.id,
    caseCount: 12,
    errorCount: 0,
    artifactIntegrity: 'pass',
    metrics: {
      by_field: {
        scope_signal: { gated_cases: 12, passed: 10 },
        problem_slug: { gated_cases: 12, passed: slice.arm === 'after' ? 8 : 10 },
      },
      safety: { expected_required_signals: 12, observed_required_signals: 10 },
      provider_fallback: { fallback_runs: 0, total_runs: 12 },
    },
  }))

  assert.equal(evaluatePlan55G5({ service, slices }).passed, false)
})

test('G5 hard-fails when deterministic fallback share shifts by more than 20 percentage points', () => {
  const service = 'cleaning'
  const slices = buildPlan55ServiceSlices(service).map((slice) => ({
    sliceId: slice.id,
    caseCount: 12,
    errorCount: 0,
    artifactIntegrity: 'pass',
    metrics: {
      by_field: {
        scope_signal: { gated_cases: 12, passed: 12 },
        problem_slug: { gated_cases: 12, passed: 12 },
      },
      safety: { expected_required_signals: 12, observed_required_signals: 12 },
      provider_fallback: {
        fallback_runs: slice.arm === 'after' ? 3 : 0,
        total_runs: 12,
      },
    },
  }))

  const result = evaluatePlan55G5({ service, slices })
  assert.equal(result.passed, false)
  assert.ok(Object.values(result.deltas).every((delta) => delta.provider_fallback.within_20pp === false))
})

test('independent holdout proof requires blinded non-author reviewers and the frozen six holdouts', () => {
  const sourceSha = 'a'.repeat(40)
  const digest = (char) => `sha256:${char.repeat(64)}`
  const proof = {
    schema: 'plan55-independent-holdout-proof/v4',
    status: 'PASS',
    blinded: true,
    reviewed_by_author: false,
    source_sha: sourceSha,
    holdout_labels_sha256: digest('7'),
    author_id_sha256: digest('1'),
    review_evidence: {
      repository: 'manhtu0407/HomeServices-',
      pull_request_number: 55,
      reviewed_head_sha: 'b'.repeat(40),
      production_source_base_branch: PLAN55_PRODUCTION_SOURCE_BASE.branch,
      production_source_base_sha: PLAN55_PRODUCTION_SOURCE_BASE.sha,
      production_source_target_branch: PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH,
      production_source_target_branch_tip_sha: 'd'.repeat(40),
      production_source_target_branch_ancestry_status: 'ahead',
      production_source_base_ancestry_status: 'ahead',
      review_ids: [101, 102],
    },
    reviewer_attestations: [
      { review_id: 101, reviewer_id_sha256: digest('2'), labels_sha256: digest('7') },
      { review_id: 102, reviewer_id_sha256: digest('4'), labels_sha256: digest('7') },
    ],
    github_review_verification: {
      method: 'github-pull-request-review-api/v1',
      repository: 'manhtu0407/HomeServices-',
      pull_request_number: 55,
      reviewed_head_sha: 'b'.repeat(40),
      merge_sha: sourceSha,
      production_source_base_branch: PLAN55_PRODUCTION_SOURCE_BASE.branch,
      production_source_base_sha: PLAN55_PRODUCTION_SOURCE_BASE.sha,
      production_source_target_branch: PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH,
      production_source_target_branch_tip_sha: 'd'.repeat(40),
      production_source_target_branch_ancestry_status: 'ahead',
      production_source_base_ancestry_status: 'ahead',
      holdout_labels_sha256: digest('7'),
      review_ids: [101, 102],
    },
    holdouts: Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service, {
      path: PLAN55_SOURCE_ASSETS[service].holdout,
      sha256: digest('6'),
      case_count: 24,
    }])),
  }
  const expectedHoldoutHashes = Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service, digest('6')]))
  assert.equal(assertPlan55IndependentHoldoutProof(proof, sourceSha, expectedHoldoutHashes, digest('7')), true)
  assert.throws(() => assertPlan55IndependentHoldoutProof({ ...proof, reviewed_by_author: true }, sourceSha))
  assert.throws(() => assertPlan55IndependentHoldoutProof({
    ...proof,
    github_review_verification: { ...proof.github_review_verification, merge_sha: 'c'.repeat(40) },
  }, sourceSha))
  assert.throws(() => assertPlan55IndependentHoldoutProof({
    ...proof,
    reviewer_attestations: [
      proof.reviewer_attestations[0],
      { reviewer_id_sha256: proof.author_id_sha256, labels_sha256: digest('7') },
    ],
  }, sourceSha))
})

test('slice artifacts must be confined to the exact release/service/slice folder', () => {
  const slice = buildPlan55ServiceSlices('hvac')[0]
  const deployment = { git_sha: 'a'.repeat(40) }
  const names = ['slice.json', 'slice.raw.json', 'slice.md', 'source-attestation.json']
  const files = Object.fromEntries(names.map((name) => [
    name,
    `docs/test-logs/plan55/${deployment.git_sha}/${slice.service}/${slice.id}/run-1/${name}`,
  ]))
  const hashes = Object.fromEntries(names.map((name) => [name, 'b'.repeat(64)]))
  assert.equal(isSafeArtifactReceipt(files, hashes, slice, deployment), true)
  assert.equal(isSafeArtifactReceipt({ ...files, 'slice.md': files['slice.md'].replace('run-1', '../escape') }, hashes, slice, deployment), false)
  assert.equal(isSafeArtifactReceipt({ ...files, 'slice.md': files['slice.md'].replace(deployment.git_sha, 'c'.repeat(40)) }, hashes, slice, deployment), false)
})

test('live Plan 55 manifests require deployed-source provenance and an attestation digest', () => {
  const sha = 'a'.repeat(40)
  const digest = `sha256:${'b'.repeat(64)}`
  const input = {
    git_sha: sha,
    git_sha_scope: 'deployed_production_release',
    deployment_version: `harness-${sha.slice(0, 12)}-abcdef`,
    deployment_version_source: 'production_health_payload',
    deployment_attestation: 'production_runtime_source_attestation',
    source_attestation_sha256: digest,
    model_id: 'model-test-v1',
    model_ids: ['model-test-v1'],
    provider: 'unobserved',
    sampling_config: null,
    prompt_version: 'prompt-test-v1',
    playbook_version: 'playbook-test-v1',
    observed_playbook_state: 'off',
    playbook_hash: digest,
    playbook_hash_scope: 'full_local_source_file',
    playbook_source_path: PLAN55_SOURCE_ASSETS.hvac.playbook,
    source_tree_hash: digest,
    source_scope: 'production_attested_runtime_and_local_slice_source',
    source_files: [PLAN55_SOURCE_ASSETS.hvac.playbook],
    source_hash_algorithm: 'sha256_path_and_file_sha256_v1',
    source_state: 'clean_commit',
    fixture_hash: null,
    selected_case_hash: digest,
    corpus_path: PLAN55_SOURCE_ASSETS.hvac.corpus,
    feature_flags: { hvac_playbook: false },
    corpus_version: digest,
    run_mode: 'live',
    started_at: '2026-09-30T00:00:00.000Z',
    repetitions: 1,
    repetition_strategy: 'independent_live_sessions',
    run_config: {
      offset: 0,
      limit: 12,
      max_turns: 3,
      retry_wait_seconds: 190,
      timeout_seconds: 45,
      district: 'q7',
      allow_failures: false,
    },
  }
  const manifest = createRunManifest(input)
  assert.equal(manifest.source_attestation_sha256, digest)
  assert.equal(manifest.git_sha_scope, 'deployed_production_release')
  assert.throws(() => createRunManifest({
    ...input,
    source_attestation_sha256: undefined,
  }), /invalid manifest.production_source_attestation/u)
  assert.throws(() => createRunManifest({
    ...input,
    git_sha_scope: 'local_base_commit',
  }), /invalid manifest.production_source_attestation/u)
})

test('canary preflight accepts only the dedicated Production-only release lane', () => {
  const base = {
    mobileApiUrl: PRODUCTION_MOBILE_API_URL,
    supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    productionCanaryOptIn: true,
    healthPayload: productionHealth,
    releaseLane: 'plan55-production-only',
  }
  assert.throws(() => assertPlan55CanaryPreflight(base), /invalid_plan55_source_attestation/u)
  assert.throws(
    () => assertPlan55CanaryPreflight({ ...base, releaseLane: 'verification' }),
    /plan55_preflight_wrong_target_or_lane/u,
  )
  assert.throws(() => assertPlan55CanaryPreflight({
    ...base,
    healthPayload: { ...productionHealth, release: {
      ...productionHealth.release,
      client_compatibility: null,
    } },
  }), /plan55_preflight_client_identity_unverified/u)
})

test('canary preflight requires source-bound GitHub proof for both guard tests and holdout review', () => {
  const sourceSha = productionHealth.release.git_sha
  const digest = (char) => `sha256:${char.repeat(64)}`
  const gitBlobSha = '1'.repeat(40)
  const runtimeDigest = digest('2')
  const functionId = '123e4567-e89b-42d3-a456-426614174001'
  const releaseId = `harness-${sourceSha.slice(0, 12)}-abcdef`
  const sourceAttestation = {
    schema: 'plan55-production-source-attestation/v1',
    observed_at: '2026-09-30T00:00:00.000Z',
    endpoint: `${PRODUCTION_MOBILE_API_URL}/harness/health`,
    deployment: {
      source: 'public_harness_health',
      project_ref: PRODUCTION_PROJECT_REF,
      status: 'ok',
      provider_configuration_class: 'production-locked',
      webhook_configuration_class: 'production-signed',
      release_id: releaseId,
      deployment_id: `${PRODUCTION_PROJECT_REF}_mobile-api_1`,
      git_sha: sourceSha,
      manifest_sha256: digest('b'),
      bundle_sha256: digest('c'),
      source_bundle_sha256: digest('d'),
      edge_bundle_sha256: digest('e'),
    },
    deployed_source: {
      schema: 'plan55-deployed-edge-source-attestation/v1',
      environment: 'production',
      project_ref: PRODUCTION_PROJECT_REF,
      release_id: releaseId,
      deployment_id: `${PRODUCTION_PROJECT_REF}_${functionId}_1`,
      function_id: functionId,
      edge_version: 1,
      git_sha: sourceSha,
      source_sha256: digest('6'),
      hosted_bundle_sha256: digest('7'),
      runtime_configuration_sha256: digest('8'),
      verify_jwt: false,
      import_map: false,
      entrypoint_path: 'supabase/functions/mobile-api/index.ts',
      import_map_path: null,
      proof_sha256: digest('9'),
    },
    runtime_files: PLAN55_RUNTIME_SOURCE_PATHS.map((path) => ({
      path,
      git_blob_sha1: gitBlobSha,
      deployed_sha256: runtimeDigest,
      working_tree_sha256: runtimeDigest,
      working_tree_matches_release_after_git_clean_filter: true,
    })),
    evaluator: { files: PLAN55_EVALUATOR_PATHS, sha256: digest('3') },
    services: Object.fromEntries(Object.entries(PLAN55_SOURCE_ASSETS).map(([service, assets]) => [
      service,
      Object.fromEntries(Object.entries(assets).map(([kind, path]) => [kind, {
        path,
        git_blob_sha1: gitBlobSha,
        deployed_sha256: digest('4'),
        working_tree_sha256: digest('4'),
        working_tree_matches_release_after_git_clean_filter: true,
      }])),
    ])),
  }
  const holdoutHashes = Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service, digest('5')]))
  const pullRequestNumber = 55
  const reviewedHeadSha = 'b'.repeat(40)
  const reviewIds = [101, 102]
  const holdoutProof = {
    schema: 'plan55-independent-holdout-proof/v4',
    status: 'PASS',
    blinded: true,
    reviewed_by_author: false,
    source_sha: sourceSha,
    holdout_labels_sha256: digest('a'),
    author_id_sha256: digest('6'),
    review_evidence: {
      repository: 'manhtu0407/HomeServices-',
      pull_request_number: pullRequestNumber,
      reviewed_head_sha: reviewedHeadSha,
      production_source_base_branch: PLAN55_PRODUCTION_SOURCE_BASE.branch,
      production_source_base_sha: PLAN55_PRODUCTION_SOURCE_BASE.sha,
      production_source_target_branch: PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH,
      production_source_target_branch_tip_sha: 'd'.repeat(40),
      production_source_target_branch_ancestry_status: 'ahead',
      production_source_base_ancestry_status: 'ahead',
      actor_guard_file_blob_sha1: gitBlobSha,
      review_ids: reviewIds,
    },
    reviewer_attestations: [
      { review_id: reviewIds[0], reviewer_id_sha256: digest('7'), labels_sha256: digest('a') },
      { review_id: reviewIds[1], reviewer_id_sha256: digest('9'), labels_sha256: digest('a') },
    ],
    github_review_verification: {
      method: PLAN55_GITHUB_REVIEW_VERIFICATION,
      repository: 'manhtu0407/HomeServices-',
      pull_request_number: pullRequestNumber,
      reviewed_head_sha: reviewedHeadSha,
      merge_sha: sourceSha,
      production_source_base_branch: PLAN55_PRODUCTION_SOURCE_BASE.branch,
      production_source_base_sha: PLAN55_PRODUCTION_SOURCE_BASE.sha,
      production_source_target_branch: PLAN55_PRODUCTION_SOURCE_TARGET_BRANCH,
      production_source_target_branch_tip_sha: 'd'.repeat(40),
      production_source_target_branch_ancestry_status: 'ahead',
      production_source_base_ancestry_status: 'ahead',
      holdout_labels_sha256: digest('a'),
      review_ids: reviewIds,
    },
    holdouts: Object.fromEntries(PLAN55_SERVICE_ORDER.map((service) => [service, {
      path: PLAN55_SOURCE_ASSETS[service].holdout,
      sha256: holdoutHashes[service],
      case_count: 24,
    }])),
  }
  const actorGuardProof = {
    source_sha: sourceSha,
    runtime_file_path: PLAN55_RUNTIME_SOURCE_PATHS[0],
    runtime_file_sha256: runtimeDigest,
    verified_auth_context: true,
    ignores_request_body_id: true,
    canary_precedes_legacy_global: true,
    regression_tests_pass: true,
    verification: {
      method: PLAN55_ACTOR_GUARD_VERIFICATION,
      repository: 'manhtu0407/HomeServices-',
      pull_request_number: pullRequestNumber,
      reviewed_head_sha: reviewedHeadSha,
      source_sha: sourceSha,
      check_run_id: 9001,
      check_run_name: PLAN55_ACTOR_GUARD_CHECK_NAME,
      check_run_conclusion: 'success',
      runtime_file_blob_sha1: gitBlobSha,
    },
  }
  const flagNames = [
    ...PLAN55_SERVICE_ORDER.map((service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_ENABLED`),
    ...PLAN55_SERVICE_ORDER.map((service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_ENABLED`),
    ...PLAN55_SERVICE_ORDER.map((service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_USER_ID`),
    'KAEL_INTAKE_EVAL_OBSERVATION_ENABLED',
  ]
  const input = {
    mobileApiUrl: PRODUCTION_MOBILE_API_URL,
    supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    productionCanaryOptIn: true,
    healthPayload: { ...productionHealth, release: {
      ...productionHealth.release,
      release_lane: 'plan55-production-only',
    } },
    releaseLane: 'plan55-production-only',
    sourceAttestation,
    independentHoldoutProof: holdoutProof,
    holdoutAssetHashes: holdoutHashes,
    holdoutLabelsSha256: digest('a'),
    actorGuardProof,
    flagStates: Object.fromEntries(flagNames.map((name) => [name, 'absent'])),
    verificationProviders: {
      required: ['anthropic', 'global_ai_enabled', 'durable_guards'],
      status: { anthropic: true, global_ai_enabled: true, durable_guards: true },
    },
  }

  const preflight = assertPlan55CanaryPreflight(input)
  assert.equal(preflight.deployment.git_sha, sourceSha)
  assert.match(preflight.sourceAttestationSha256, /^[a-f0-9]{64}$/u)
  assert.equal(
    assertPlan55CanaryPreflight({
      ...input,
      sourceAttestation: { ...sourceAttestation, observed_at: '2099-01-01T00:00:00.000Z' },
    }).sourceAttestationSha256,
    preflight.sourceAttestationSha256,
  )
  assert.throws(() => assertPlan55CanaryPreflight({
    ...input,
    actorGuardProof: { ...actorGuardProof, verification: undefined },
  }), /plan55_preflight_actor_guard_unverified/u)
  assert.throws(() => assertPlan55CanaryPreflight({
    ...input,
    sourceAttestation: { ...sourceAttestation, credential: 'must-not-be-accepted' },
  }), /invalid_plan55_source_attestation_fields/u)
})

test('service cleanup requires absent global and scoped flags, deleted Auth actor, zero residual rows and no worker', () => {
  const clean = {
    globalFlags: 'absent',
    canaryFlag: 'absent',
    canaryActorId: 'absent',
    authStatus: 404,
    orphanWorkers: 0,
    rows: {
      profiles: 0,
      customer_profiles: 0,
      customer_account_deletion_requests: 0,
      kael_chat_sessions: 0,
      kael_chat_turns: 0,
      worker_profiles: 0,
      jobs_as_customer: 0,
      jobs_as_worker: 0,
      job_broadcasts_as_worker: 0,
      job_events_as_actor: 0,
      chat_messages_as_sender: 0,
      notifications_as_user: 0,
    },
  }
  assert.equal(assertPlan55Cleanup(clean), true)
  for (const invalid of [
    { ...clean, globalFlags: 'present' },
    { ...clean, globalFlags: undefined },
    { ...clean, canaryFlag: 'enabled' },
    { ...clean, canaryActorId: 'configured' },
    { ...clean, authStatus: 200 },
    { ...clean, orphanWorkers: undefined },
    { ...clean, orphanWorkers: 1 },
    { ...clean, rows: { ...clean.rows, kael_chat_turns: 1 } },
    { ...clean, rows: { ...clean.rows, worker_profiles: 1 } },
  ]) assert.throws(() => assertPlan55Cleanup(invalid))
})
