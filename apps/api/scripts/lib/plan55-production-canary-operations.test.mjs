import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  assertPlan55ProductionCanaryEnvironment,
  createPlan55ProductionCanaryOperations,
} from './plan55-production-canary-operations.mjs'
import {
  PLAN55_EVALUATOR_PATHS,
  PLAN55_RUNTIME_SOURCE_PATHS,
  PLAN55_SOURCE_ASSETS,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_MOBILE_API_URL,
} from './kael-playbook-production-attestation.mjs'
import {
  PLAN55_PRODUCTION_SOURCE_BASE,
  PLAN55_ACTOR_GUARD_CHECK_NAME,
  PLAN55_ACTOR_GUARD_VERIFICATION,
  buildPlan55HoldoutReviewBody,
} from './plan55-independent-holdout-review.mjs'
import { buildPlan55ServiceSlices } from './plan55-production-canary-core.mjs'

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const CLI_PATH = resolve(REPO_ROOT, 'apps/api/scripts/kael-playbook-production-canary.mjs')

function validEnvironment() {
  return {
    PLAN55_PRODUCTION_CANARY_OPT_IN: 'RUN_ONE_SYNTHETIC_ACTOR_SERVICE',
    PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: 'test-service-key-not-a-credential',
    PRODUCTION_SUPABASE_ANON_KEY: 'test-anon-key-not-a-credential',
    SUPABASE_ACCESS_TOKEN: 'test-management-token-not-a-credential',
    SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
  }
}

function identityHash(id) {
  return `sha256:${createHash('sha256').update(String(id)).digest('hex')}`
}

function buildSourceAttestation(sourceSha) {
  const gitBlobSha = '1'.repeat(40)
  const digest = `sha256:${'2'.repeat(64)}`
  return {
    schema: 'plan55-production-source-attestation/v1',
    observed_at: '2026-09-30T00:00:00.000Z',
    endpoint: `${PRODUCTION_MOBILE_API_URL}/harness/health`,
    deployment: {
      source: 'public_harness_health',
      project_ref: PRODUCTION_PROJECT_REF,
      status: 'ok',
      provider_configuration_class: 'production-locked',
      webhook_configuration_class: 'production-signed',
      release_id: `harness-${sourceSha.slice(0, 12)}-abcdef`,
      deployment_id: `${PRODUCTION_PROJECT_REF}_mobile-api_1`,
      git_sha: sourceSha,
      manifest_sha256: `sha256:${'b'.repeat(64)}`,
      bundle_sha256: `sha256:${'c'.repeat(64)}`,
      source_bundle_sha256: `sha256:${'d'.repeat(64)}`,
      edge_bundle_sha256: `sha256:${'e'.repeat(64)}`,
    },
    runtime_files: PLAN55_RUNTIME_SOURCE_PATHS.map((path) => ({
      path,
      git_blob_sha1: gitBlobSha,
      deployed_sha256: digest,
      working_tree_sha256: digest,
      working_tree_matches_release_after_git_clean_filter: true,
    })),
    evaluator: { files: PLAN55_EVALUATOR_PATHS, sha256: digest },
    services: Object.fromEntries(Object.entries(PLAN55_SOURCE_ASSETS).map(([service, assets]) => [
      service,
      Object.fromEntries(Object.entries(assets).map(([kind, path]) => [kind, {
        path,
        git_blob_sha1: gitBlobSha,
        deployed_sha256: digest,
        working_tree_sha256: digest,
        working_tree_matches_release_after_git_clean_filter: true,
      }])),
    ])),
  }
}

function buildReviewEvidence({
  expectedSourceSha: sourceSha,
  expectedHoldoutHashes: holdoutHashes,
  expectedHoldoutCaseCounts: holdoutCaseCounts,
  sourceAttestation,
}) {
  const pullRequestNumber = 55
  const reviewedHeadSha = 'b'.repeat(40)
  const authorId = 400
  const reviewerIds = [401, 402]
  const reviewIds = [1101, 1102]
  const labelsHashes = [`sha256:${'c'.repeat(64)}`, `sha256:${'d'.repeat(64)}`]
  const guardFile = sourceAttestation.runtime_files.find((file) => file.path === PLAN55_RUNTIME_SOURCE_PATHS[0])
  const actorGuardFileBlobSha = guardFile.git_blob_sha1
  const pullRequest = {
    number: pullRequestNumber,
    state: 'closed',
    merged: true,
    merged_at: '2026-09-29T00:00:00Z',
    merge_commit_sha: sourceSha,
    base: { ref: PLAN55_PRODUCTION_SOURCE_BASE.branch, repo: { full_name: 'manhtu0407/HomeServices-' } },
    head: { sha: reviewedHeadSha, repo: { full_name: 'manhtu0407/HomeServices-' } },
    user: { id: authorId },
  }
  const mergeCommit = {
    sha: sourceSha,
    parents: [{ sha: PLAN55_PRODUCTION_SOURCE_BASE.sha }, { sha: reviewedHeadSha }],
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
      actorGuardFileBlobSha,
    }),
  }))
  return {
    proof: {
      schema: 'plan55-independent-holdout-proof/v2',
      status: 'PASS',
      blinded: true,
      reviewed_by_author: false,
      source_sha: sourceSha,
      author_id_sha256: identityHash(authorId),
      review_evidence: {
        repository: 'manhtu0407/HomeServices-',
        pull_request_number: pullRequestNumber,
        reviewed_head_sha: reviewedHeadSha,
        production_source_base_branch: PLAN55_PRODUCTION_SOURCE_BASE.branch,
        production_source_base_sha: PLAN55_PRODUCTION_SOURCE_BASE.sha,
        actor_guard_file_blob_sha1: actorGuardFileBlobSha,
        review_ids: reviewIds,
      },
      reviewer_attestations: reviewerIds.map((reviewerId, index) => ({
        review_id: reviewIds[index],
        reviewer_id_sha256: identityHash(reviewerId),
        labels_sha256: labelsHashes[index],
      })),
      holdouts: Object.fromEntries(Object.keys(holdoutHashes).map((service) => [service, {
        path: PLAN55_SOURCE_ASSETS[service].holdout,
        sha256: holdoutHashes[service],
        case_count: holdoutCaseCounts[service],
      }])),
    },
    pullRequest,
    mergeCommit,
    reviews,
    actorGuardProof: {
      source_sha: sourceSha,
      runtime_file_path: PLAN55_RUNTIME_SOURCE_PATHS[0],
      runtime_file_sha256: guardFile.deployed_sha256,
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
        runtime_file_blob_sha1: actorGuardFileBlobSha,
      },
    },
  }
}

test('Production canary environment fails closed on missing opt-in, credentials, or wrong target', () => {
  assert.throws(
    () => assertPlan55ProductionCanaryEnvironment({}),
    { message: 'plan55_canary_explicit_opt_in_required' },
  )
  assert.throws(
    () => assertPlan55ProductionCanaryEnvironment({
      ...validEnvironment(),
      PLAN55_PRODUCTION_CANARY_OPT_IN: 'true',
    }),
    { message: 'plan55_canary_explicit_opt_in_required' },
  )
  assert.throws(
    () => assertPlan55ProductionCanaryEnvironment({
      ...validEnvironment(),
      SUPABASE_URL: 'https://staging.supabase.co',
    }),
    { message: 'plan55_canary_wrong_supabase_url' },
  )
  const missingCredential = validEnvironment()
  delete missingCredential.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
  assert.throws(
    () => assertPlan55ProductionCanaryEnvironment(missingCredential),
    { message: 'plan55_canary_required_credentials_missing' },
  )
})

test('Operations construct clients only for the pinned Production project', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-production-ops-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const clientUrls = []
  const operations = await createPlan55ProductionCanaryOperations({
    env: validEnvironment(),
    checkpointRoot: rootDir,
    clientFactory(url) {
      clientUrls.push(url)
      return { auth: {} }
    },
  })
  assert.deepEqual(clientUrls, [
    `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
  ])
  assert.equal(typeof operations.preflight, 'function')
  assert.equal(typeof operations.createSyntheticActor, 'function')
  assert.equal(typeof operations.cleanupService, 'function')
})

test('preflight derives source-bound proofs without a plan55 field on public Production health', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-preflight-proof-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const sourceSha = 'a'.repeat(40)
  const sourceAttestation = buildSourceAttestation(sourceSha)
  const health = {
    service: 'mobile-api',
    status: 'ok',
    environment: {
      project_ref: PRODUCTION_PROJECT_REF,
      provider_configuration_class: 'production-locked',
      webhook_configuration_class: 'production-signed',
    },
    release: {
      registered: true,
      git_sha: sourceSha,
      release_id: `harness-${sourceSha.slice(0, 12)}-abcdef`,
      deployment_id: `${PRODUCTION_PROJECT_REF}_mobile-api_1`,
      manifest_sha256: 'b'.repeat(64),
      bundle_sha256: 'c'.repeat(64),
      source_bundle_sha256: 'd'.repeat(64),
      edge_bundle_sha256: 'e'.repeat(64),
      release_lane: 'plan55-production-only',
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
        android: {
          applicationId: 'com.phanmanhtu.nestscout',
          minimumBuildNumber: 730,
          easBuildId: '223e4567-e89b-42d3-a456-426614174000',
          runtimeVersion: '4.9.0',
        },
      },
      provider_readiness: {
        anthropic: true,
        global_ai_enabled: true,
        durable_guards: true,
      },
    },
  }
  let providerInput
  let secretInventoryReads = 0
  let sourceAttestationReads = 0
  const fetchImpl = async (url, init = {}) => {
    const target = String(url)
    if (target === `${PRODUCTION_MOBILE_API_URL}/harness/health`) {
      return new Response(JSON.stringify(health), { status: 200 })
    }
    if (target.endsWith(`/projects/${PRODUCTION_PROJECT_REF}/secrets`) && init.method === 'GET') {
      secretInventoryReads += 1
      return new Response('[]', { status: 200 })
    }
    throw new Error('unexpected_test_request')
  }
  const operations = await createPlan55ProductionCanaryOperations({
    env: validEnvironment(),
    fetchImpl,
    checkpointRoot: rootDir,
    clientFactory: () => ({ auth: {} }),
    sourceAttestationProvider: async () => {
      sourceAttestationReads += 1
      return sourceAttestation
    },
    holdoutReviewEvidenceProvider: async (input) => {
      providerInput = input
      return buildReviewEvidence(input)
    },
  })

  const preflight = await operations.preflight()
  assert.equal(Object.hasOwn(health, 'plan55'), false)
  assert.equal(providerInput.expectedSourceSha, sourceSha)
  assert.equal(Object.keys(providerInput.expectedHoldoutHashes).length, 6)
  assert.ok(Object.values(providerInput.expectedHoldoutCaseCounts).every((count) => count === 24))
  assert.equal(preflight.actorGuardProof.source_sha, sourceSha)
  assert.equal(preflight.independentHoldoutProof.source_sha, sourceSha)
  assert.equal(preflight.independentHoldoutProof.github_review_verification.merge_sha, sourceSha)
  assert.equal(preflight.releaseLane, 'plan55-production-only')
  assert.deepEqual(preflight.clientHeaders, {
    'x-client-platform': 'ios',
    'x-client-application-id': 'com.phanmanhtu.homeservices',
    'x-client-build-number': '730',
    'x-client-contract-epoch': '2',
    'x-client-eas-build-id': '123e4567-e89b-42d3-a456-426614174000',
    'x-client-runtime-version': '4.9.0',
    'x-client-git-sha': PLAN55_PRODUCTION_SOURCE_BASE.sha,
    'x-client-release-id': PLAN55_PRODUCTION_SOURCE_BASE.releaseId,
  })
  await assert.rejects(
    operations.preflight('cleaning'),
    { message: 'plan55_canary_prior_service_incomplete' },
  )
  assert.equal(secretInventoryReads, 1)
  assert.equal(sourceAttestationReads, 1)
})

test('live chat requests retain the current Production client identity while attesting the new backend source', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-client-headers-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const sourceSha = 'a'.repeat(40)
  const health = {
    service: 'mobile-api',
    status: 'ok',
    environment: {
      project_ref: PRODUCTION_PROJECT_REF,
      provider_configuration_class: 'production-locked',
      webhook_configuration_class: 'production-signed',
    },
    release: {
      registered: true,
      git_sha: sourceSha,
      release_id: `harness-${sourceSha.slice(0, 12)}-abcdef`,
      deployment_id: `${PRODUCTION_PROJECT_REF}_mobile-api_1`,
      manifest_sha256: 'b'.repeat(64),
      bundle_sha256: 'c'.repeat(64),
      source_bundle_sha256: 'd'.repeat(64),
      edge_bundle_sha256: 'e'.repeat(64),
      release_lane: 'plan55-production-only',
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
      provider_readiness: {
        anthropic: true,
        global_ai_enabled: true,
        durable_guards: true,
      },
    },
  }
  let chatHeaders
  let sourceDrift = false
  const fetchImpl = async (url, init = {}) => {
    const target = String(url)
    if (target === `${PRODUCTION_MOBILE_API_URL}/harness/health`) {
      const payload = sourceDrift
        ? { ...health, release: {
          ...health.release,
          release_id: `harness-${sourceSha.slice(0, 12)}-drift00`,
        } }
        : health
      return new Response(JSON.stringify(payload), { status: 200 })
    }
    if (target.endsWith(`/projects/${PRODUCTION_PROJECT_REF}/secrets`) && init.method === 'GET') {
      return new Response('[]', { status: 200 })
    }
    if (target === `${PRODUCTION_MOBILE_API_URL}/kael/chat`) {
      chatHeaders = new Headers(init.headers)
      return new Response(JSON.stringify({ error: 'synthetic_test_stop' }), { status: 503 })
    }
    throw new Error('unexpected_test_request')
  }
  const operations = await createPlan55ProductionCanaryOperations({
    env: validEnvironment(),
    fetchImpl,
    checkpointRoot: rootDir,
    sleep: async () => {},
    clientFactory: () => ({ auth: {} }),
    sourceAttestationProvider: async () => buildSourceAttestation(sourceSha),
    holdoutReviewEvidenceProvider: async (input) => buildReviewEvidence(input),
  })
  const preflight = await operations.preflight()
  const slice = buildPlan55ServiceSlices('hvac')[0]

  await assert.rejects(operations.runSlice({
    service: 'hvac',
    actor: {
      id: '123e4567-e89b-42d3-a456-426614174000',
      synthetic: true,
      accessToken: 'synthetic-test-token',
    },
    slice,
    deployment: preflight.deployment,
    clientHeaders: preflight.clientHeaders,
    sourceAttestation: preflight.sourceAttestation,
    sourceAttestationSha256: 'f'.repeat(64),
  }), { message: 'plan55_canary_slice_actor_or_target_invalid' })
  assert.equal(chatHeaders, undefined)

  sourceDrift = true
  await assert.rejects(operations.runSlice({
    service: 'hvac',
    actor: {
      id: '123e4567-e89b-42d3-a456-426614174000',
      synthetic: true,
      accessToken: 'synthetic-test-token',
    },
    slice,
    deployment: preflight.deployment,
    clientHeaders: preflight.clientHeaders,
    sourceAttestation: preflight.sourceAttestation,
    sourceAttestationSha256: preflight.sourceAttestationSha256,
  }), { message: 'plan55_canary_production_source_drift' })
  assert.equal(chatHeaders, undefined)
  sourceDrift = false

  await assert.rejects(operations.runSlice({
    service: 'hvac',
    actor: {
      id: '123e4567-e89b-42d3-a456-426614174000',
      synthetic: true,
      accessToken: 'synthetic-test-token',
    },
    slice,
    deployment: preflight.deployment,
    clientHeaders: preflight.clientHeaders,
    sourceAttestation: preflight.sourceAttestation,
    sourceAttestationSha256: preflight.sourceAttestationSha256,
  }), { message: 'plan55_canary_chat_request_failed_503' })

  for (const [name, value] of Object.entries(preflight.clientHeaders)) {
    assert.equal(chatHeaders?.get(name), value, name)
  }
  assert.equal(chatHeaders?.get('authorization'), 'Bearer synthetic-test-token')
})

test('cleanup retries transient deletion visibility and proves scoped flags, Auth, rows, and workers are clear', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-cleanup-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const actorId = '123e4567-e89b-42d3-a456-426614174000'
  let deleteFlagAttempts = 0
  let authReads = 0
  const managementDeletes = []
  const health = {
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
      release_id: `harness-${'a'.repeat(12)}-abcdef`,
      deployment_id: `${PRODUCTION_PROJECT_REF}_mobile-api_1`,
      manifest_sha256: 'b'.repeat(64),
      bundle_sha256: 'c'.repeat(64),
      source_bundle_sha256: 'd'.repeat(64),
      edge_bundle_sha256: 'e'.repeat(64),
    },
    plan55: { cleanup: { orphan_workers: 0 } },
  }
  const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
  const fetchImpl = async (url, init = {}) => {
    const target = String(url)
    if (target === `${PRODUCTION_MOBILE_API_URL}/harness/health`) return jsonResponse(health)
    if (target.endsWith(`/projects/${PRODUCTION_PROJECT_REF}/secrets`)) {
      if (init.method === 'GET') return jsonResponse([])
      if (init.method === 'POST') return jsonResponse({ created: true })
      if (init.method === 'DELETE') {
        managementDeletes.push(JSON.parse(init.body))
        deleteFlagAttempts += 1
        return deleteFlagAttempts === 1
          ? jsonResponse({ message: 'temporary' }, 503)
          : jsonResponse({ deleted: true })
      }
    }
    throw new Error('unexpected_test_request')
  }
  const admin = {
    auth: {
      admin: {
        deleteUser: async () => ({ error: null }),
        getUserById: async () => {
          authReads += 1
          return authReads === 1
            ? { data: { user: { id: actorId } }, error: null }
            : { data: { user: null }, error: { status: 404, code: 'user_not_found' } }
        },
      },
    },
    from(table) {
      return {
        select(column, options) {
          return {
            eq: async () => options?.head
              ? { count: 0, error: null }
              : { data: [], error: null },
          }
        },
      }
    },
  }
  const operations = await createPlan55ProductionCanaryOperations({
    env: validEnvironment(),
    fetchImpl,
    sleep: async () => {},
    checkpointRoot: rootDir,
    clientFactory: (_url, key) => key.includes('service-role') || key.startsWith('test-service')
      ? admin
      : { auth: {} },
  })
  await operations.enableActorCanary('hvac', { id: actorId, synthetic: true })
  const proof = await operations.cleanupService({
    service: 'hvac',
    actor: { id: actorId, synthetic: true },
    flagMayBeEnabled: true,
  })
  assert.deepEqual(proof, {
    canaryFlag: 'absent',
    canaryActorId: 'absent',
    authStatus: 404,
    rows: {
      profiles: 0,
      customer_profiles: 0,
      customer_account_deletion_requests: 0,
      kael_chat_sessions: 0,
      kael_chat_turns: 0,
    },
    orphanWorkers: 0,
  })
  assert.equal(deleteFlagAttempts, 2)
  assert.ok(authReads >= 2)
  assert.deepEqual(managementDeletes, Array.from({ length: 2 }, () => [
    'KAEL_PLAYBOOK_HVAC_CANARY_ENABLED',
    'KAEL_PLAYBOOK_HVAC_CANARY_USER_ID',
  ]))
})

test('CLI accepts a single ordered service and rejects an unknown service before network access', () => {
  const missingCredentials = spawnSync(process.execPath, [CLI_PATH, '--run'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { PLAN55_PRODUCTION_CANARY_OPT_IN: 'RUN_ONE_SYNTHETIC_ACTOR_SERVICE' },
    timeout: 30000,
  })
  assert.equal(missingCredentials.status, 1)
  assert.equal(missingCredentials.stderr.trim(), 'plan55_canary_required_credentials_missing')

  const singleService = spawnSync(process.execPath, [CLI_PATH, '--run', '--service', 'hvac'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { PLAN55_PRODUCTION_CANARY_OPT_IN: 'RUN_ONE_SYNTHETIC_ACTOR_SERVICE' },
    timeout: 30000,
  })
  assert.equal(singleService.status, 1)
  assert.equal(singleService.stderr.trim(), 'plan55_canary_required_credentials_missing')

  const unknownService = spawnSync(process.execPath, [CLI_PATH, '--run', '--service', 'appliance'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {},
    timeout: 30000,
  })
  assert.equal(unknownService.status, 1)
  assert.equal(unknownService.stderr.trim(), 'plan55_canary_unsupported_service')
})
