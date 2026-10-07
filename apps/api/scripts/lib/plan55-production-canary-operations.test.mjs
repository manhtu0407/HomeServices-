import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  assertPlan55ProductionCanaryEnvironment,
  buildPlan55CanaryRunConfig,
  createPlan55BoundedFetch,
  createPlan55ProductionCanaryOperations as createProductionCanaryOperations,
  countCurrentPlan55CanaryProcesses,
  readPlan55CleanupStartMarker,
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
} from './plan55-independent-holdout-review.mjs'
import { buildPlan55ServiceSlices } from './plan55-production-canary-core.mjs'

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const CLI_PATH = resolve(REPO_ROOT, 'apps/api/scripts/kael-playbook-production-canary.mjs')

function createPlan55ProductionCanaryOperations(options) {
  return createProductionCanaryOperations({
    ...options,
    processTableReader: options.processTableReader ?? (() => `${process.pid} node --test`),
  })
}

function validEnvironment() {
  return {
    PLAN55_PRODUCTION_CANARY_OPT_IN: 'RUN_ONE_SYNTHETIC_ACTOR_SERVICE',
    PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: 'test-service-key-not-a-credential',
    PRODUCTION_SUPABASE_ANON_KEY: 'test-anon-key-not-a-credential',
    SUPABASE_ACCESS_TOKEN: 'test-management-token-not-a-credential',
    SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    PLAN55_CANARY_ACTOR_ID: '123e4567-e89b-42d3-a456-426614174000',
  }
}

test('Linux process snapshot uses the runner process table and sees no extra canary CLI', {
  skip: process.platform !== 'linux',
}, () => {
  assert.equal(countCurrentPlan55CanaryProcesses(), 0)
})

function buildSourceAttestation(sourceSha) {
  const gitBlobSha = '1'.repeat(40)
  const digest = `sha256:${'2'.repeat(64)}`
  const functionId = '123e4567-e89b-42d3-a456-426614174001'
  const releaseId = `harness-${sourceSha.slice(0, 12)}-abcdef`
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
      release_id: releaseId,
      deployment_id: `${PRODUCTION_PROJECT_REF}_mobile-api_1`,
      git_sha: sourceSha,
      manifest_sha256: `sha256:${'b'.repeat(64)}`,
      bundle_sha256: `sha256:${'c'.repeat(64)}`,
      source_bundle_sha256: `sha256:${'d'.repeat(64)}`,
      edge_bundle_sha256: `sha256:${'e'.repeat(64)}`,
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
      source_sha256: digest,
      hosted_bundle_sha256: digest,
      runtime_configuration_sha256: digest,
      verify_jwt: false,
      import_map: false,
      entrypoint_path: 'supabase/functions/mobile-api/index.ts',
      import_map_path: null,
      proof_sha256: digest,
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

function buildHoldoutAttestationEvidence({
  expectedSourceSha: sourceSha,
  expectedHoldoutHashes: holdoutHashes,
  expectedHoldoutLabelsSha256,
  sourceAttestation,
}) {
  const reviewedHeadSha = 'b'.repeat(40)
  const pullRequestNumber = 55
  const guardFile = sourceAttestation.runtime_files.find((file) => file.path === PLAN55_RUNTIME_SOURCE_PATHS[0])
  const actorGuardFileBlobSha = guardFile.git_blob_sha1
  const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`
  const canonicalize = (value) => {
    if (Array.isArray(value)) return value.map(canonicalize)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  const proof = {
    schema: 'plan55-independent-holdout-proof/v6',
    status: 'PASS',
    blinded: true,
    reviewed_by_author: false,
    source_sha: sourceSha,
    package_sha256: digest('structural-test-package'),
    rubric_version: 'structural-test-rubric/v1',
    rubric_sha256: digest('structural-test-rubric'),
    holdout_root_sha256: createHash('sha256').update('structural-test-holdout-root').digest('hex'),
    holdout_asset_hashes: holdoutHashes,
    holdout_labels_sha256: expectedHoldoutLabelsSha256,
    coverage: {
      service_count: Object.keys(holdoutHashes).length,
      case_count_per_service: 24,
      total_case_count: Object.keys(holdoutHashes).length * 24,
      agreement_by_service: Object.fromEntries(Object.keys(holdoutHashes).map((service) => [service, {
        case_count: 24,
        mismatches: 0,
        unresolved_safety_disagreements: 0,
      }])),
      mismatch_count: 0,
      unresolved_safety_disagreement_count: 0,
    },
    judges: {
      codex: {
        provider: 'codex',
        model_id: 'gpt-6.1-sol-test-fixture',
        invocation_id: 'codex-test-fixture',
        prompt_sha256: digest('codex-test-prompt'),
        judgments_sha256: digest('codex-test-judgments'),
        usage: { cost_usd: null, input_tokens: null, output_tokens: null },
        context: 'fresh',
        fork_context: false,
      },
      perplexity: {
        provider: 'perplexity',
        model_id: 'perplexity-test-fixture',
        invocation_id: 'perplexity-test-fixture',
        prompt_sha256: digest('perplexity-test-prompt'),
        judgments_sha256: digest('perplexity-test-judgments'),
        usage: { cost_usd: null, input_tokens: null, output_tokens: null },
      },
    },
    source_evidence: [{ id: 'source-fixture', title: 'Test fixture source', url: 'https://example.test/source' }],
    verified_at_utc: '2026-10-07T00:00:00.000Z',
    input_root_sha256: createHash('sha256').update('structural-test-input-root').digest('hex'),
  }
  proof.proof_sha256 = digest(JSON.stringify(canonicalize(proof)))
  return {
    proof,
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

test('canary request manifest timeout is the bounded-fetch deadline', () => {
  const slice = buildPlan55ServiceSlices('hvac')[0]
  const config = buildPlan55CanaryRunConfig(slice)
  assert.equal(config.timeout_seconds, 20)
  assert.deepEqual(config, {
    offset: slice.offset,
    limit: slice.limit,
    max_turns: 3,
    retry_wait_seconds: 190,
    timeout_seconds: 20,
    district: 'q7',
    allow_failures: false,
  })
})

test('cleanup start marker is loaded only from and must match its exact run identity', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-cleanup-marker-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const sourceSha = 'a'.repeat(40)
  const releaseId = `harness-${sourceSha.slice(0, 12)}-${'c'.repeat(12)}`
  const actorId = validEnvironment().PLAN55_CANARY_ACTOR_ID
  const runId = '12345'
  const attempt = 2
  const env = {
    PLAN55_SOURCE_SHA: sourceSha,
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: String(attempt),
  }
  const markerPath = join(rootDir, '.scratch', 'plan55-production-canary', 'attempts', sourceSha,
    'hvac', `started-${runId}-${attempt}.json`)
  const releasePath = join(rootDir, 'artifacts', 'release', 'release.json')
  await mkdir(join(rootDir, '.scratch', 'plan55-production-canary', 'attempts', sourceSha, 'hvac'), { recursive: true })
  await mkdir(join(rootDir, 'artifacts', 'release'), { recursive: true })
  await writeFile(releasePath, JSON.stringify({
    releaseLane: 'plan55-production-only', gitSha: sourceSha, releaseId,
  }))
  const marker = {
    schema: 'plan55-service-start/v1',
    service: 'hvac',
    source_sha: sourceSha,
    release_id: releaseId,
    run_id: runId,
    attempt,
    actor_id: actorId,
  }
  await writeFile(markerPath, JSON.stringify(marker))
  assert.deepEqual(readPlan55CleanupStartMarker({ repoRoot: rootDir, env, service: 'hvac', actorId }), marker)

  for (const invalidMarker of [
    { ...marker, service: 'plumbing' },
    { ...marker, source_sha: 'b'.repeat(40) },
    { ...marker, release_id: `harness-${sourceSha.slice(0, 12)}-bbbbbb` },
    { ...marker, run_id: '54321' },
    { ...marker, attempt: 1 },
    { ...marker, actor_id: '123e4567-e89b-42d3-a456-426614174099' },
    { ...marker, extra: 'not-allowed' },
  ]) {
    await writeFile(markerPath, JSON.stringify(invalidMarker))
    assert.throws(
      () => readPlan55CleanupStartMarker({ repoRoot: rootDir, env, service: 'hvac', actorId }),
      { message: 'plan55_canary_cleanup_marker_invalid' },
    )
  }
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

test('bounded fetch enforces its deadline and preserves a caller abort signal', async () => {
  const timeoutFetch = createPlan55BoundedFetch((_input, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }), 5)
  await assert.rejects(timeoutFetch('https://example.invalid'), (error) => error.name === 'TimeoutError')

  const controller = new AbortController()
  const callerReason = new Error('caller cancelled')
  const callerFetch = createPlan55BoundedFetch((_input, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }), 1_000)
  const pending = callerFetch('https://example.invalid', { signal: controller.signal })
  controller.abort(callerReason)
  await assert.rejects(pending, (error) => error === callerReason)

  const bodyTimeoutFetch = createPlan55BoundedFetch(async (_input, { signal }) => new Response(
    new ReadableStream({
      start(stream) {
        const delayedBody = setTimeout(() => {
          stream.enqueue(new TextEncoder().encode('{"late":true}'))
          stream.close()
        }, 100)
        signal.addEventListener('abort', () => {
          clearTimeout(delayedBody)
          stream.error(signal.reason)
        }, { once: true })
      },
    }),
    { headers: { 'content-type': 'application/json' } },
  ), 5)
  const response = await bodyTimeoutFetch('https://example.invalid')
  await assert.rejects(response.json(), (error) => error.name === 'TimeoutError')

  const trackedFetch = createPlan55BoundedFetch(async () => new Response('{"ok":true}', {
    headers: { 'content-type': 'application/json' },
  }), 100)
  const trackedResponse = await trackedFetch('https://example.invalid')
  assert.equal(trackedFetch.activeRequestCount(), 1)
  assert.deepEqual(await trackedResponse.json(), { ok: true })
  assert.equal(await trackedFetch.waitForIdle(), true)
  assert.equal(trackedFetch.activeRequestCount(), 0)
})

test('synthetic actor refreshes its in-memory session without changing actor identity', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-refresh-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const actorId = validEnvironment().PLAN55_CANARY_ACTOR_ID
  let currentNow = new Date('2026-09-30T00:00:00.000Z')
  const epoch = Math.floor(currentNow.getTime() / 1000)
  const refreshRequests = []
  let refreshedUserId = actorId
  let actorExists = false
  let actorEmail = null
  const admin = {
    auth: {
      admin: {
        createUser: async (attributes) => {
          actorExists = true
          actorEmail = attributes.email
          return { data: { user: { id: actorId, email: attributes.email } }, error: null }
        },
        deleteUser: async () => { actorExists = false; return { error: null } },
        getUserById: async () => actorExists
          ? { data: { user: { id: actorId, email: actorEmail, app_metadata: { role: 'customer', plan55_disposable: true } } }, error: null }
          : { data: { user: null }, error: { status: 404, code: 'user_not_found' } },
      },
    },
    from(table) {
      if (table !== 'profiles') {
        return {
          select: (_column, options) => ({
            eq: async () => options?.head ? { count: 0, error: null } : { data: [], error: null },
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: actorId, role: 'customer' }, error: null }) }),
        }),
      }
    },
  }
  const anonymous = {
    auth: {
      signInWithPassword: async () => ({
        data: { session: {
          user: { id: actorId },
          access_token: 'access-before-refresh',
          refresh_token: 'refresh-before-refresh',
          expires_at: epoch + 10,
        } },
        error: null,
      }),
      refreshSession: async (input) => {
        refreshRequests.push(input.refresh_token)
        return {
          data: { session: {
            user: { id: refreshedUserId },
            access_token: 'access-after-refresh',
            refresh_token: 'refresh-after-refresh',
            expires_at: Math.floor(currentNow.getTime() / 1000) + 3_600,
          } },
          error: null,
        }
      },
    },
  }
  const operations = await createPlan55ProductionCanaryOperations({
    env: validEnvironment(),
    checkpointRoot: rootDir,
    clock: () => currentNow,
    sleep: async () => {},
    clientFactory: (_url, key) => key.includes('service-role') || key.startsWith('test-service') ? admin : anonymous,
  })
  const actor = await operations.createSyntheticActor('hvac')
  assert.deepEqual(Object.keys(actor).sort(), ['clearSession', 'getAccessToken', 'id', 'synthetic'])
  assert.equal(await actor.getAccessToken(), 'access-after-refresh')
  assert.deepEqual(refreshRequests, ['refresh-before-refresh'])
  currentNow = new Date((epoch + 3_600) * 1000)
  refreshedUserId = '123e4567-e89b-42d3-a456-426614174001'
  await assert.rejects(actor.getAccessToken(), { message: 'plan55_canary_actor_session_refresh_failed' })
  assert.deepEqual(refreshRequests, ['refresh-before-refresh', 'refresh-after-refresh'])
  await assert.rejects(actor.getAccessToken(), { message: 'plan55_canary_actor_session_unavailable' })
  actor.clearSession()
  await assert.rejects(actor.getAccessToken(), { message: 'plan55_canary_actor_session_unavailable' })
})

test('ambiguous Auth creation cleans the pre-recorded synthetic actor by its exact id', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-auth-create-ambiguous-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const actorId = validEnvironment().PLAN55_CANARY_ACTOR_ID
  let createdAttributes = null
  let actorExists = false
  const deletedIds = []
  let authIdentityReads = 0
  const admin = {
    auth: {
      admin: {
        createUser: async (attributes) => {
          createdAttributes = attributes
          actorExists = true
          throw new Error('connection lost after request dispatch')
        },
        getUserById: async (userId) => {
          authIdentityReads += 1
          assert.equal(userId, actorId)
          return actorExists
            ? { data: { user: { id: actorId, email: createdAttributes.email, app_metadata: { role: 'customer', plan55_disposable: true } } }, error: null }
            : { data: { user: null }, error: { status: 404, code: 'user_not_found' } }
        },
        deleteUser: async (userId) => {
          deletedIds.push(userId)
          actorExists = false
          return { error: null }
        },
      },
    },
    from() {
      return {
        select(_column, options) {
          return {
            eq: async () => options?.head ? { count: 0, error: null } : { data: [], error: null },
            in: async () => options?.head ? { count: 0, error: null } : { data: [], error: null },
          }
        },
      }
    },
  }
  const managementReads = []
  const operations = await createPlan55ProductionCanaryOperations({
    env: validEnvironment(),
    checkpointRoot: rootDir,
    sleep: async () => {},
    fetchImpl: async (url, init = {}) => {
      if (String(url).endsWith(`/projects/${PRODUCTION_PROJECT_REF}/secrets`) && init.method === 'GET') {
        managementReads.push(init.method)
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error('unexpected request')
    },
    clientFactory: (_url, key) => key.startsWith('test-service') ? admin : { auth: {} },
  })

  let createFailure = null
  try {
    await operations.createSyntheticActor('hvac')
  } catch (error) {
    createFailure = error
  }
  assert.equal(createdAttributes?.id, actorId)
  assert.equal(createdAttributes?.app_metadata?.plan55_disposable, true)
  assert.deepEqual(deletedIds, [actorId])
  assert.equal(actorExists, false)
  assert.ok(authIdentityReads >= 2)
  assert.equal(createFailure?.message, 'plan55_canary_actor_setup_failed')
  assert.deepEqual(managementReads, [])
})

test('canary enable requires source preflight and exact actor-scoped secret readback', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-actor-scope-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const actorId = validEnvironment().PLAN55_CANARY_ACTOR_ID
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
      provider_readiness: { anthropic: true, global_ai_enabled: true, durable_guards: true },
    },
  }
  let actorEmail = null
  let actorExists = false
  let scopedSecrets = []
  let mismatchReadback = false
  const admin = {
    auth: {
      admin: {
        getUserById: async () => actorExists
          ? { data: { user: { id: actorId, email: actorEmail, app_metadata: { role: 'customer', plan55_disposable: true } } }, error: null }
          : { data: { user: null }, error: { status: 404, code: 'user_not_found' } },
        createUser: async (attributes) => {
          actorExists = true
          actorEmail = attributes.email
          return { data: { user: { id: actorId, email: actorEmail } }, error: null }
        },
        deleteUser: async () => { actorExists = false; return { error: null } },
      },
    },
    from(table) {
      if (table === 'profiles') {
        return { select: (_column, options) => options?.head
          ? { eq: async () => ({ count: 0, error: null }) }
          : { eq: () => ({ maybeSingle: async () => ({ data: { id: actorId, role: 'customer' }, error: null }) }) } }
      }
      return { select: (_column, options) => ({ eq: async () => options?.head
        ? { count: 0, error: null }
        : { data: [], error: null } }) }
    },
  }
  const anonymous = {
    auth: {
      signInWithPassword: async () => ({
        data: { session: {
          user: { id: actorId }, access_token: 'synthetic-test-token', refresh_token: 'refresh-token', expires_at: 4_102_444_800,
        } },
        error: null,
      }),
    },
  }
  const fetchImpl = async (url, init = {}) => {
    const target = String(url)
    if (target === `${PRODUCTION_MOBILE_API_URL}/harness/health`) {
      return new Response(JSON.stringify(health), { status: 200 })
    }
    if (target.endsWith(`/projects/${PRODUCTION_PROJECT_REF}/secrets`)) {
      if (init.method === 'GET') {
        const values = mismatchReadback
          ? scopedSecrets.map((item) => item.name.endsWith('_CANARY_USER_ID')
            ? { ...item, value: '123e4567-e89b-42d3-a456-426614174099' }
            : item)
          : scopedSecrets
        return new Response(JSON.stringify(values), { status: 200 })
      }
      if (init.method === 'POST') {
        scopedSecrets = JSON.parse(init.body)
        return new Response(JSON.stringify({ created: true }), { status: 200 })
      }
      if (init.method === 'DELETE') {
        scopedSecrets = []
        return new Response(JSON.stringify({ deleted: true }), { status: 200 })
      }
    }
    throw new Error('unexpected_test_request')
  }
  const operations = await createPlan55ProductionCanaryOperations({
    env: validEnvironment(),
    fetchImpl,
    checkpointRoot: rootDir,
    sleep: async () => {},
    clientFactory: (_url, key) => key.startsWith('test-service') ? admin : anonymous,
    sourceAttestationProvider: async () => buildSourceAttestation(sourceSha),
    holdoutAttestationEvidenceProvider: async (input) => buildHoldoutAttestationEvidence(input),
  })
  await assert.rejects(
    operations.enableActorCanary('hvac', { id: actorId, synthetic: true }),
    { message: 'plan55_canary_actor_scope_invalid' },
  )
  await operations.preflight()

  const actor = await operations.createSyntheticActor('hvac')
  await operations.enableActorCanary('hvac', actor)
  assert.deepEqual(scopedSecrets, [
    { name: 'KAEL_PLAYBOOK_HVAC_CANARY_ENABLED', value: 'true' },
    { name: 'KAEL_PLAYBOOK_HVAC_CANARY_USER_ID', value: actorId },
  ])
  const successfulCleanup = await operations.cleanupService({ service: 'hvac', actor, flagMayBeEnabled: true })
  assert.deepEqual(successfulCleanup.actorLifecycle, {
    authAdminVerified: true,
    syntheticActorCreated: true,
    actorScopeVerified: true,
    disposableWorkerIsolated: true,
  })
  assert.deepEqual(scopedSecrets, [])

  mismatchReadback = true
  const mismatchedActor = await operations.createSyntheticActor('hvac')
  await assert.rejects(
    operations.enableActorCanary('hvac', mismatchedActor),
    { message: 'plan55_canary_actor_scope_readback_mismatch' },
  )
  const mismatchedCleanup = await operations.cleanupService({
    service: 'hvac', actor: mismatchedActor, flagMayBeEnabled: true,
  })
  assert.equal(mismatchedCleanup.actorLifecycle.actorScopeVerified, false)
  assert.deepEqual(scopedSecrets, [])
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
    holdoutAttestationEvidenceProvider: async (input) => {
      providerInput = input
      return buildHoldoutAttestationEvidence(input)
    },
  })

  const preflight = await operations.preflight()
  assert.equal(Object.hasOwn(health, 'plan55'), false)
  assert.equal(providerInput.expectedSourceSha, sourceSha)
  assert.equal(Object.keys(providerInput.expectedHoldoutHashes).length, 6)
  assert.ok(Object.values(providerInput.expectedHoldoutCaseCounts).every((count) => count === 24))
  assert.match(providerInput.expectedHoldoutLabelsSha256, /^sha256:[a-f0-9]{64}$/u)
  assert.equal(preflight.actorGuardProof.source_sha, sourceSha)
  assert.equal(preflight.independentHoldoutProof.source_sha, sourceSha)
  assert.equal(preflight.independentHoldoutProof.schema, 'plan55-independent-holdout-proof/v6')
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
  let hostedEdgeReads = 0
  const actorId = validEnvironment().PLAN55_CANARY_ACTOR_ID
  let actorEmail = null
  let actorExists = false
  const admin = {
    auth: {
      admin: {
        getUserById: async () => actorExists
          ? { data: { user: { id: actorId, email: actorEmail, app_metadata: { role: 'customer', plan55_disposable: true } } }, error: null }
          : { data: { user: null }, error: { status: 404, code: 'user_not_found' } },
        createUser: async (attributes) => {
          actorExists = true
          actorEmail = attributes.email
          return { data: { user: { id: actorId, email: actorEmail } }, error: null }
        },
        deleteUser: async () => { actorExists = false; return { error: null } },
      },
    },
    from(table) {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: actorId, role: 'customer' }, error: null }) }) }) }
      }
      return { select: (_column, options) => ({ eq: async () => ({ count: options?.head ? 0 : null, error: null }) }) }
    },
  }
  const anonymous = {
    auth: {
      signInWithPassword: async () => ({
        data: { session: {
          user: { id: actorId }, access_token: 'synthetic-test-token', refresh_token: 'refresh-token', expires_at: 4_102_444_800,
        } },
        error: null,
      }),
    },
  }
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
    if (target === `https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT_REF}/functions/mobile-api` &&
        init.method === 'GET') {
      hostedEdgeReads += 1
      return new Response(JSON.stringify({
        status: 'ACTIVE',
        id: '123e4567-e89b-42d3-a456-426614174001',
        version: 1,
        ezbr_sha256: '2'.repeat(64),
        verify_jwt: false,
        import_map: false,
        entrypoint_path: 'supabase/functions/mobile-api/index.ts',
        import_map_path: null,
      }), { status: 200 })
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
    clientFactory: (_url, key) => key.startsWith('test-service') ? admin : anonymous,
    sourceAttestationProvider: async () => buildSourceAttestation(sourceSha),
    holdoutAttestationEvidenceProvider: async (input) => buildHoldoutAttestationEvidence(input),
  })
  const preflight = await operations.preflight()
  const actor = await operations.createSyntheticActor('hvac')
  const slice = buildPlan55ServiceSlices('hvac')[0]

  await assert.rejects(operations.runSlice({
    service: 'hvac',
    actor,
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
    actor,
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
    actor,
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
  assert.equal(hostedEdgeReads, 1)
  actor.clearSession()
})

test('cleanup retries transient deletion visibility and proves scoped flags, Auth, rows, and workers are clear', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-cleanup-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const actorId = '123e4567-e89b-42d3-a456-426614174000'
  let deleteFlagAttempts = 0
  let authReads = 0
  let processTable = `${process.pid} node --test`
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
      release_lane: 'plan55-production-only',
      git_sha: 'a'.repeat(40),
      release_id: `harness-${'a'.repeat(12)}-${'c'.repeat(12)}`,
      deployment_id: `${PRODUCTION_PROJECT_REF}_mobile-api_1`,
      manifest_sha256: 'b'.repeat(64),
      bundle_sha256: 'c'.repeat(64),
      source_bundle_sha256: 'd'.repeat(64),
      edge_bundle_sha256: 'e'.repeat(64),
    },
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
            ? { data: { user: { id: actorId, app_metadata: { role: 'customer', plan55_disposable: true } } }, error: null }
            : { data: { user: null }, error: { status: 404, code: 'user_not_found' } }
        },
      },
    },
    from() {
      return {
        select(column, options) {
          return {
            eq: async () => options?.head
              ? { count: 0, error: null }
              : { data: [], error: null },
            in: async () => options?.head
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
    processTableReader: () => processTable,
    clientFactory: (_url, key) => key.includes('service-role') || key.startsWith('test-service')
      ? admin
      : { auth: {} },
  })
  const startMarker = {
    schema: 'plan55-service-start/v1',
    service: 'hvac',
    source_sha: health.release.git_sha,
    release_id: health.release.release_id,
    run_id: '12345',
    attempt: 1,
    actor_id: actorId,
  }
  const cleanup = () => operations.cleanupAbandonedService({
    service: 'hvac',
    actorId,
    startMarker,
  })
  processTable = `${process.pid} node --test\n${process.pid + 1} node apps/api/scripts/kael-playbook-production-canary.mjs --service hvac`
  await assert.rejects(cleanup(), { message: 'plan55_canary_orphan_worker_unverified' })
  processTable = 'malformed process row'
  await assert.rejects(cleanup(), { message: 'plan55_canary_orphan_worker_unverified' })
  processTable = `${process.pid + 2} node --test`
  await assert.rejects(cleanup(), { message: 'plan55_canary_orphan_worker_unverified' })
  processTable = `${process.pid} node --test\n${process.pid + 2} node apps/api/scripts/kael-playbook-production-canary.mjs.backup`
  const proof = await cleanup()
  assert.deepEqual(proof, {
    globalFlags: 'absent',
    canaryFlag: 'absent',
    canaryActorId: 'absent',
    authStatus: 404,
    orphanWorkers: 0,
    actorLifecycle: {
      authAdminVerified: false,
      syntheticActorCreated: false,
      actorScopeVerified: false,
      disposableWorkerIsolated: false,
    },
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
  })
  assert.ok(deleteFlagAttempts >= 2)
  assert.ok(authReads >= 2)
  assert.deepEqual(managementDeletes, Array.from({ length: deleteFlagAttempts }, () => [
    'KAEL_PLAYBOOK_HVAC_CANARY_ENABLED',
    'KAEL_PLAYBOOK_HVAC_CANARY_USER_ID',
  ]))
})

test('abandoned cleanup fails closed before touching flags or deleting an unmarked Auth user', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-cleanup-unmarked-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const actorId = validEnvironment().PLAN55_CANARY_ACTOR_ID
  let deleteUserCalls = 0
  let networkCalls = 0
  let authReads = 0
  const jsonResponse = (body) => new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  })
  const admin = {
    auth: {
      admin: {
        getUserById: async (userId) => {
          authReads += 1
          return {
            data: { user: { id: userId, app_metadata: { role: 'worker', plan55_disposable: false } } },
            error: null,
          }
        },
        deleteUser: async () => {
          deleteUserCalls += 1
          return { error: null }
        },
      },
    },
  }
  const mutations = []
  const operations = await createPlan55ProductionCanaryOperations({
    env: validEnvironment(),
    checkpointRoot: rootDir,
    sleep: async () => {},
    fetchImpl: async (url, init = {}) => {
      networkCalls += 1
      if (String(url).endsWith(`/projects/${PRODUCTION_PROJECT_REF}/secrets`) && init.method === 'GET') {
        return jsonResponse([])
      }
      mutations.push(init.method === 'DELETE' ? JSON.parse(init.body) : init.method ?? 'GET')
      return jsonResponse({ deleted: true })
    },
    clientFactory: (_url, key) => key.startsWith('test-service') ? admin : { auth: {} },
  })

  await assert.rejects(operations.cleanupAbandonedService({ service: 'hvac', actorId }), {
    message: 'plan55_canary_cleanup_marker_invalid',
  })
  assert.equal(networkCalls, 0)
  assert.equal(authReads, 0)
  assert.equal(deleteUserCalls, 0)
  assert.deepEqual(mutations, [])
})

test('abandoned cleanup rejects a marker for a different deployed release before mutations', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-cleanup-release-mismatch-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const actorId = validEnvironment().PLAN55_CANARY_ACTOR_ID
  let healthReads = 0
  let authReads = 0
  const mutations = []
  const releaseSha = 'a'.repeat(40)
  const releaseId = `harness-${releaseSha.slice(0, 12)}-${'c'.repeat(12)}`
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
      release_lane: 'plan55-production-only',
      git_sha: releaseSha,
      release_id: releaseId,
      deployment_id: `${PRODUCTION_PROJECT_REF}_mobile-api_1`,
      manifest_sha256: 'b'.repeat(64),
      bundle_sha256: 'c'.repeat(64),
      source_bundle_sha256: 'd'.repeat(64),
      edge_bundle_sha256: 'e'.repeat(64),
    },
  }
  const markerSha = 'f'.repeat(40)
  const startMarker = {
    schema: 'plan55-service-start/v1',
    service: 'hvac',
    source_sha: markerSha,
    release_id: `harness-${markerSha.slice(0, 12)}-${'d'.repeat(12)}`,
    run_id: '12345',
    attempt: 1,
    actor_id: actorId,
  }
  const operations = await createPlan55ProductionCanaryOperations({
    env: validEnvironment(),
    checkpointRoot: rootDir,
    fetchImpl: async (url, init = {}) => {
      if (String(url) === `${PRODUCTION_MOBILE_API_URL}/harness/health`) {
        healthReads += 1
        return new Response(JSON.stringify(health), { headers: { 'content-type': 'application/json' } })
      }
      mutations.push(init.method ?? 'GET')
      return new Response('[]', { headers: { 'content-type': 'application/json' } })
    },
    clientFactory: () => ({ auth: { admin: {
      getUserById: async () => { authReads += 1; return { data: { user: null }, error: { status: 404 } } },
      deleteUser: async () => ({ error: null }),
    } } }),
  })
  await assert.rejects(operations.cleanupAbandonedService({ service: 'hvac', actorId, startMarker }), {
    message: 'plan55_canary_cleanup_release_mismatch',
  })
  assert.equal(healthReads, 1)
  assert.equal(authReads, 0)
  assert.deepEqual(mutations, [])
})

test('interrupted recovery rejects incomplete actor or release markers before contacting Production', async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-recovery-marker-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  let networkCalls = 0
  const operations = await createPlan55ProductionCanaryOperations({
    env: validEnvironment(),
    checkpointRoot: rootDir,
    fetchImpl: async () => {
      networkCalls += 1
      throw new Error('unexpected_network_request')
    },
    clientFactory: () => ({ auth: {} }),
  })

  const releaseId = `harness-${'a'.repeat(12)}-${'b'.repeat(12)}`
  const input = {
    service: 'hvac',
    deployment: { project_ref: PRODUCTION_PROJECT_REF, release_id: releaseId, git_sha: 'a'.repeat(40) },
    runId: '12345',
    currentAttempt: 2,
  }
  const marker = {
    schema: 'plan55-service-start/v1',
    service: 'hvac',
    source_sha: 'a'.repeat(40),
    release_id: releaseId,
    run_id: '12345',
    attempt: 1,
    actor_id: '123e4567-e89b-42d3-a456-426614174000',
  }
  for (const invalidMarker of [
    { ...marker, actor_id: 'not-a-uuid' },
    Object.fromEntries(Object.entries(marker).filter(([key]) => key !== 'release_id')),
    { ...marker, release_id: `harness-${'a'.repeat(12)}-${'c'.repeat(12)}` },
  ]) {
    await assert.rejects(operations.recoverInterruptedServiceCheckpoint({
      ...input,
      markers: [invalidMarker],
    }), { message: 'plan55_canary_recovery_identity_invalid' })
  }
  assert.equal(networkCalls, 0)
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

  const cleanupMissingIdentity = spawnSync(process.execPath, [CLI_PATH, '--cleanup-only', '--service', 'hvac'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {},
    timeout: 30000,
  })
  assert.equal(cleanupMissingIdentity.status, 1)
  assert.equal(cleanupMissingIdentity.stderr.trim(), 'plan55_canary_cleanup_identity_required')

  const cleanupMissingCredentials = spawnSync(process.execPath, [
    CLI_PATH, '--cleanup-only', '--service', 'hvac', '--actor-id', validEnvironment().PLAN55_CANARY_ACTOR_ID,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { PLAN55_PRODUCTION_CANARY_OPT_IN: 'RUN_ONE_SYNTHETIC_ACTOR_SERVICE' },
    timeout: 30000,
  })
  assert.equal(cleanupMissingCredentials.status, 1)
  assert.equal(cleanupMissingCredentials.stderr.trim(), 'plan55_canary_cleanup_marker_invalid')

  const recoveryMissingService = spawnSync(process.execPath, [CLI_PATH, '--recover-interrupted'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {},
    timeout: 30000,
  })
  assert.equal(recoveryMissingService.status, 1)
  assert.equal(recoveryMissingService.stderr.trim(), 'plan55_canary_recovery_service_required')

  const recoveryMissingInput = spawnSync(process.execPath, [
    CLI_PATH, '--recover-interrupted', '--service', 'hvac',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {},
    input: '',
    timeout: 30000,
  })
  assert.equal(recoveryMissingInput.status, 1)
  assert.equal(recoveryMissingInput.stderr.trim(), 'plan55_canary_recovery_input_invalid')
})
