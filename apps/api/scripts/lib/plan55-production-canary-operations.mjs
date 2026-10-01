import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  aggregatePlaybookResults,
  aggregateRepetitionStability,
  buildSanitizedRawArtifact,
  createRunManifest,
  extractIntakeObservation,
  normalizeEvalEvidenceForRunMode,
  requestedSlotsFromResponse,
  scorePlaybookCase,
  selectUserTurn,
  validatePlaybookCorpus,
} from './kael-playbook-eval-core.mjs'
import {
  PLAN55_RUNTIME_SOURCE_PATHS,
  PLAN55_SOURCE_ASSETS,
  PRODUCTION_MOBILE_API_URL,
  PRODUCTION_PROJECT_REF,
  assertPlan55SourceAttestation,
  plan55SourceAttestationSha256,
  validateProductionHealthPayload,
} from './kael-playbook-production-attestation.mjs'
import {
  PLAN55_SERVICE_ORDER,
  buildPlan55ProductionClientHeaders,
  validatePlan55SliceArtifacts,
} from './plan55-production-canary-core.mjs'
import { createPlan55FileCheckpointStore } from './plan55-production-canary-checkpoint-store.mjs'
import {
  createPlan55GithubReviewEvidenceProvider,
  plan55HoldoutLabelsSha256,
  verifyPlan55IndependentHoldoutReviewEvidence,
} from './plan55-independent-holdout-review.mjs'

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../../..')
const MANAGEMENT_ORIGIN = 'https://api.supabase.com/v1'
export const PLAN55_PRODUCTION_FLAG_NAMES = Object.freeze([
  ...PLAN55_SERVICE_ORDER.map((service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_ENABLED`),
  ...PLAN55_SERVICE_ORDER.map((service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_ENABLED`),
  ...PLAN55_SERVICE_ORDER.map((service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_USER_ID`),
  'KAEL_INTAKE_EVAL_OBSERVATION_ENABLED',
])
const CASE_DELAY_MS = 190_000
const CLEANUP_RETRIES = 12
const CLEANUP_RETRY_DELAY_MS = 500
const MAX_TURNS = 3
const DISTRICT = 'q7'
const CLEANUP_TABLES = Object.freeze([
  'profiles',
  'customer_profiles',
  'customer_account_deletion_requests',
  'kael_chat_sessions',
])

export function assertPlan55ProductionCanaryEnvironment(env = process.env) {
  const expectedUrl = `https://${PRODUCTION_PROJECT_REF}.supabase.co`
  if (env.SUPABASE_URL && normalizeSupabaseUrl(env.SUPABASE_URL) !== expectedUrl) {
    throw new Error('plan55_canary_wrong_supabase_url')
  }
  if (env.PLAN55_PRODUCTION_CANARY_OPT_IN !== 'RUN_ONE_SYNTHETIC_ACTOR_SERVICE') {
    throw new Error('plan55_canary_explicit_opt_in_required')
  }
  const serviceKey = env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
  const anonKey = env.PRODUCTION_SUPABASE_ANON_KEY
  const accessToken = env.SUPABASE_ACCESS_TOKEN
  if (!serviceKey || !anonKey || !accessToken) {
    throw new Error('plan55_canary_required_credentials_missing')
  }
  return Object.freeze({ expectedUrl, serviceKey, anonKey, accessToken })
}

export async function createPlan55ProductionCanaryOperations({
  env = process.env,
  fetchImpl = fetch,
  clientFactory,
  sourceAttestationProvider,
  holdoutReviewEvidenceProvider = createPlan55GithubReviewEvidenceProvider(),
  checkpointRoot = resolve(REPO_ROOT, '.scratch/plan55-production-canary'),
  artifactRoot = resolve(REPO_ROOT, 'docs/test-logs/plan55'),
  sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
  clock = () => new Date(),
} = {}) {
  const credentials = assertPlan55ProductionCanaryEnvironment(env)
  if (typeof fetchImpl !== 'function' || typeof sleep !== 'function' || typeof clock !== 'function') {
    throw new Error('plan55_canary_adapter_configuration_invalid')
  }

  const makeClient = clientFactory ?? await defaultClientFactory(fetchImpl)
  const admin = makeClient(credentials.expectedUrl, credentials.serviceKey, { auth: authOptions() })
  const anonymous = makeClient(credentials.expectedUrl, credentials.anonKey, { auth: authOptions() })
  const store = createPlan55FileCheckpointStore({ rootDir: checkpointRoot, clock })
  let enabledService = null
  let setupCleanupActorId = null
  let verifiedClientHeaders = null
  let verifiedDeployment = null
  let verifiedSourceAttestationSha256 = null
  let verifiedSourceAttestation = null

  async function readHealth() {
    const health = await readJson(fetchImpl, `${PRODUCTION_MOBILE_API_URL}/harness/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    }, 'plan55_canary_production_health_unavailable')
    return { health, deployment: validateProductionHealthPayload(health) }
  }

  async function readSecretNames() {
    const body = await readJson(fetchImpl, `${MANAGEMENT_ORIGIN}/projects/${PRODUCTION_PROJECT_REF}/secrets`, {
      method: 'GET',
      headers: managementHeaders(credentials.accessToken),
    }, 'plan55_canary_secret_inventory_unavailable')
    if (!Array.isArray(body) || body.some((item) => !isRecord(item) || typeof item.name !== 'string')) {
      throw new Error('plan55_canary_secret_inventory_invalid')
    }
    return new Set(body.map((item) => item.name))
  }

  async function assertCurrentHostedEdgeSource() {
    const expected = verifiedSourceAttestation?.deployed_source
    if (!expected) throw new Error('plan55_canary_deployed_edge_source_unverified')
    const current = await readJson(fetchImpl,
      `${MANAGEMENT_ORIGIN}/projects/${PRODUCTION_PROJECT_REF}/functions/mobile-api`, {
        method: 'GET',
        headers: managementHeaders(credentials.accessToken),
      }, 'plan55_canary_hosted_edge_metadata_unavailable')
    const deploymentId = isRecord(current) && current.id && current.version
      ? `${PRODUCTION_PROJECT_REF}_${current.id}_${current.version}`
      : null
    if (!isRecord(current) || current.status !== 'ACTIVE' || current.id !== expected.function_id ||
        current.version !== expected.edge_version ||
        current.ezbr_sha256 !== expected.hosted_bundle_sha256.slice('sha256:'.length) ||
        current.verify_jwt !== expected.verify_jwt || current.import_map !== expected.import_map ||
        current.entrypoint_path !== expected.entrypoint_path || current.import_map_path !== expected.import_map_path ||
        deploymentId !== expected.deployment_id) {
      throw new Error('plan55_canary_production_source_drift')
    }
  }

  async function assertCurrentReleaseSource() {
    if (!verifiedDeployment || !verifiedClientHeaders || !verifiedSourceAttestationSha256 || !verifiedSourceAttestation) {
      throw new Error('plan55_canary_production_source_unverified')
    }
    const { health, deployment } = await readHealth()
    if (health.release?.release_lane !== 'plan55-production-only' ||
        !sameDeploymentIdentity(deployment, verifiedDeployment) ||
        !sameClientHeaders(buildPlan55ProductionClientHeaders(health, deployment), verifiedClientHeaders)) {
      throw new Error('plan55_canary_production_source_drift')
    }
    if (plan55SourceAttestationSha256(verifiedSourceAttestation, deployment.git_sha) !== verifiedSourceAttestationSha256 ||
        verifiedSourceAttestation.deployed_source.git_sha !== deployment.git_sha ||
        verifiedSourceAttestation.deployed_source.release_id !== deployment.release_id) {
      throw new Error('plan55_canary_production_source_drift')
    }
    await assertCurrentHostedEdgeSource()
  }

  return Object.freeze({
    async preflight(service = PLAN55_SERVICE_ORDER[0]) {
      assertService(service)
      verifiedClientHeaders = null
      verifiedDeployment = null
      verifiedSourceAttestationSha256 = null
      verifiedSourceAttestation = null
      const { health, deployment } = await readHealth()
      await assertPrecedingServicesComplete(service, deployment, store)
      const [secretNames, sourceAttestation] = await Promise.all([
        readSecretNames(),
        sourceAttestationProvider
          ? sourceAttestationProvider()
          : runLocalSourceAttestor(),
      ])
      const clientHeaders = buildPlan55ProductionClientHeaders(health, deployment)
      const readiness = health.release?.provider_readiness
      const flagStates = Object.fromEntries(PLAN55_PRODUCTION_FLAG_NAMES.map((name) => [
        name,
        secretNames.has(name) ? 'unknown' : 'absent',
      ]))
      const requiredProviders = ['anthropic', 'global_ai_enabled', 'durable_guards']
      const verificationProviders = {
        required: requiredProviders,
        status: Object.fromEntries(requiredProviders.map((provider) => [provider, readiness?.[provider] === true])),
      }
      assertPlan55SourceAttestation(sourceAttestation, deployment.git_sha)
      const sourceAttestationSha256 = plan55SourceAttestationSha256(sourceAttestation, deployment.git_sha)
      const holdoutAssets = await readPlan55HoldoutAssets()
      const reviewEvidence = await holdoutReviewEvidenceProvider({
        expectedSourceSha: deployment.git_sha,
        expectedHoldoutHashes: holdoutAssets.hashes,
        expectedHoldoutCaseCounts: holdoutAssets.caseCounts,
        expectedHoldoutLabelsSha256: holdoutAssets.labelsSha256,
        sourceAttestation,
      })
      const independentHoldoutProof = verifyPlan55IndependentHoldoutReviewEvidence({
        proof: reviewEvidence?.proof,
        expectedSourceSha: deployment.git_sha,
        expectedHoldoutHashes: holdoutAssets.hashes,
        expectedHoldoutLabelsSha256: holdoutAssets.labelsSha256,
        pullRequest: reviewEvidence?.pullRequest,
        mergeCommit: reviewEvidence?.mergeCommit,
        reviews: reviewEvidence?.reviews,
      })
      if (enabledService !== null) throw new Error('plan55_canary_previous_flag_not_cleared')
      verifiedClientHeaders = clientHeaders
      verifiedDeployment = deployment
      verifiedSourceAttestationSha256 = sourceAttestationSha256
      verifiedSourceAttestation = sourceAttestation
      return {
        mobileApiUrl: PRODUCTION_MOBILE_API_URL,
        supabaseUrl: credentials.expectedUrl,
        productionCanaryOptIn: true,
        healthPayload: health,
        releaseLane: health.release?.release_lane,
        sourceAttestation,
        sourceAttestationSha256,
        actorGuardProof: reviewEvidence?.actorGuardProof,
        verificationProviders,
        flagStates,
        independentHoldoutProof,
        holdoutAssetHashes: holdoutAssets.hashes,
        holdoutLabelsSha256: holdoutAssets.labelsSha256,
        deployment,
        clientHeaders,
      }
    },

    async createSyntheticActor(service) {
      assertService(service)
      const email = `plan55-${service}-${randomUUID()}@example.invalid`
      const password = randomBytes(32).toString('base64url')
      let userId = null
      try {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { role: 'customer', plan55_disposable: true },
          user_metadata: { full_name: 'Plan 55 synthetic customer' },
        })
        if (error || !isUuid(data?.user?.id)) throw new Error('plan55_canary_actor_create_failed')
        userId = data.user.id
        const { data: profile, error: profileError } = await waitForSyntheticProfile(admin, userId, sleep)
        if (profileError || profile?.role !== 'customer') {
          throw new Error('plan55_canary_actor_profile_not_customer')
        }
        const { data: session, error: signInError } = await anonymous.auth.signInWithPassword({ email, password })
        if (signInError || typeof session?.session?.access_token !== 'string') {
          throw new Error('plan55_canary_actor_sign_in_failed')
        }
        const { data: verified, error: verifyError } = await admin.auth.admin.getUserById(userId)
        if (verifyError || verified?.user?.app_metadata?.plan55_disposable !== true) {
          throw new Error('plan55_canary_actor_marker_unverified')
        }
        return Object.freeze({
          id: userId,
          synthetic: true,
          accessToken: session.session.access_token,
        })
      } catch (error) {
        if (userId) {
          try {
            await retryCleanupMutation(
              () => deleteAuthActor(admin, userId),
              'plan55_canary_actor_setup_cleanup_failed',
              sleep,
            )
            await waitForActorDeletionProof(admin, userId, sleep)
          } catch {
            setupCleanupActorId = userId
            throw new Error('plan55_canary_actor_setup_cleanup_failed')
          }
        }
        throw safeError(error, 'plan55_canary_actor_setup_failed')
      }
    },

    async enableActorCanary(service, actor) {
      assertService(service)
      if (actor?.synthetic !== true || !isUuid(actor.id) || enabledService !== null) {
        throw new Error('plan55_canary_actor_scope_invalid')
      }
      const names = scopedFlagNames(service)
      const priorNames = await readSecretNames()
      if (PLAN55_PRODUCTION_FLAG_NAMES.some((name) => priorNames.has(name))) {
        throw new Error('plan55_canary_existing_flag_prevents_mutation')
      }
      enabledService = service
      await readJson(fetchImpl, `${MANAGEMENT_ORIGIN}/projects/${PRODUCTION_PROJECT_REF}/secrets`, {
        method: 'POST',
        headers: managementHeaders(credentials.accessToken, true),
        body: JSON.stringify([
          { name: names.enabled, value: 'true' },
          { name: names.actor, value: actor.id },
        ]),
      }, 'plan55_canary_scoped_flag_enable_failed')
    },

    async runSlice({ service, actor, slice, deployment, clientHeaders, sourceAttestation, sourceAttestationSha256 }) {
      assertService(service)
      if (enabledService !== (slice.playbookEnabled ? service : null) &&
          (slice.playbookEnabled || enabledService !== null)) {
        throw new Error('plan55_canary_slice_flag_scope_mismatch')
      }
      if (actor?.synthetic !== true || !isUuid(actor.id) || !actor.accessToken ||
          !sameDeploymentIdentity(deployment, verifiedDeployment) ||
          !sameClientHeaders(clientHeaders, verifiedClientHeaders) ||
          sourceAttestationSha256 !== verifiedSourceAttestationSha256 ||
          plan55SourceAttestationSha256(sourceAttestation, deployment.git_sha) !== verifiedSourceAttestationSha256) {
        throw new Error('plan55_canary_slice_actor_or_target_invalid')
      }
      await assertCurrentReleaseSource()
      return evaluateAndPersistSlice({
        service, actor, slice, deployment, clientHeaders, fetchImpl,
        sourceAttestation, sourceAttestationSha256,
        verifyCurrentSource: assertCurrentReleaseSource,
        anonKey: credentials.anonKey, sleep, clock, artifactRoot,
      })
    },

    async cleanupService({ service, actor, flagMayBeEnabled }) {
      assertService(service)
      const names = scopedFlagNames(service)
      const cleanupAttempts = []
      const cleanupActorId = actor && isUuid(actor.id) ? actor.id : setupCleanupActorId
      if (flagMayBeEnabled || enabledService === service) {
        cleanupAttempts.push(retryCleanupMutation(
          () => deleteScopedFlags(fetchImpl, credentials.accessToken, names),
          'plan55_canary_scoped_flag_cleanup_failed',
          sleep,
        ))
      }
      if (cleanupActorId) cleanupAttempts.push(retryCleanupMutation(
        () => deleteAuthActor(admin, cleanupActorId),
        'plan55_canary_auth_delete_failed',
        sleep,
      ))
      const failures = (await Promise.allSettled(cleanupAttempts))
        .filter((result) => result.status === 'rejected')
      if (failures.length > 0) throw new Error('plan55_canary_cleanup_mutation_failed')

      const proof = await waitForServiceCleanupProof({
        service,
        actor: cleanupActorId ? { id: cleanupActorId } : null,
        names,
        readSecretNames,
        readHealth,
        admin,
        sleep,
      })
      if (enabledService === service) enabledService = null
      setupCleanupActorId = null
      return proof
    },

    loadVerifiedSliceReceipt: async (input) => {
      const receipt = await store.loadVerifiedSliceReceipt(input)
      if (!receipt) return null
      await verifyPersistedArtifacts({ receipt, slice: input.slice, deployment: input.deployment, artifactRoot })
      return receipt
    },
    persistVerifiedSliceReceipt: (input) => store.persistVerifiedSliceReceipt(input),
    persistVerifiedServiceCleanup: (input) => store.persistVerifiedServiceCleanup(input),
    beginServiceCheckpoint: (input) => store.beginServiceCheckpoint(input),
  })
}

async function evaluateAndPersistSlice({ service, actor, slice, deployment, clientHeaders, sourceAttestation, sourceAttestationSha256, verifyCurrentSource, fetchImpl, anonKey, sleep, clock, artifactRoot }) {
  const corpusText = await readFile(resolve(REPO_ROOT, slice.corpusPath), 'utf8')
  const corpus = validatePlaybookCorpus(JSON.parse(corpusText), service)
  const selected = corpus.slice(slice.offset, slice.offset + slice.limit)
  if (selected.length !== 12) throw new Error('plan55_canary_corpus_slice_invalid')
  const runs = []
  for (const [index, testCase] of selected.entries()) {
    if (index > 0) await sleep(CASE_DELAY_MS)
    const started = Date.now()
    const outcome = await runLiveCase(fetchImpl, anonKey, actor, testCase, service, clientHeaders)
    const observed = outcome.initialObservation ?? extractIntakeObservation(outcome.response)
    runs.push({
      id: testCase.id,
      difficulty: testCase.difficulty,
      repetition: 1,
      expected: sanitizeExpected(testCase.expected),
      observed,
      finalObserved: extractIntakeObservation(outcome.response),
      clarificationTurns: outcome.clarificationTurns,
      error: null,
      turns: outcome.turns,
      latency_ms: Date.now() - started,
    })
  }

  const scored = runs.map((run) => ({
    ...run,
    score: scorePlaybookCase(run.expected, run.observed, run.error),
  }))
  const normalized = normalizeEvalEvidenceForRunMode(
    'live', aggregatePlaybookResults(scored), aggregateRepetitionStability(scored),
  )
  const observations = scored.map((run) => run.observed)
  const playbookVersions = [...new Set(observations.map((item) => item.playbook_version))]
  const promptVersions = [...new Set(observations.map((item) => item.prompt_version))]
  const modelIds = [...new Set(observations.map((item) => item.model_id))].sort()
  if (playbookVersions.length !== 1 || promptVersions.length !== 1 || modelIds.length === 0) {
    throw new Error('plan55_canary_observed_versions_mixed')
  }
  const startedAt = nowIso(clock)
  const playbookBytes = await readFile(resolve(REPO_ROOT, slice.playbookPath))
  const sourceFiles = [...new Set([...PLAN55_RUNTIME_SOURCE_PATHS, slice.playbookPath])]
  const sourceHashes = await Promise.all(sourceFiles.map(async (path) => {
    const bytes = await readFile(resolve(REPO_ROOT, path))
    return `${path}\n${sha256(bytes)}`
  }))
  const sourceTreeHash = sha256(sourceHashes.join('\n'))
  const manifestInput = {
    git_sha: deployment.git_sha,
    git_sha_scope: 'deployed_production_release',
    deployment_version: deployment.release_id,
    deployment_version_source: 'production_health_payload',
    deployment_attestation: 'production_runtime_source_attestation',
    source_attestation_sha256: `sha256:${sourceAttestationSha256}`,
    model_id: modelIds.length === 1 ? modelIds[0] : 'mixed',
    model_ids: modelIds,
    provider: 'unobserved',
    sampling_config: null,
    prompt_version: promptVersions[0],
    playbook_version: playbookVersions[0],
    observed_playbook_state: slice.playbookEnabled ? 'on' : 'off',
    playbook_hash: `sha256:${sha256(playbookBytes)}`,
    playbook_hash_scope: 'full_local_source_file',
    playbook_source_path: slice.playbookPath,
    source_tree_hash: `sha256:${sourceTreeHash}`,
    source_scope: 'production_attested_runtime_and_local_slice_source',
    source_files: sourceFiles,
    source_hash_algorithm: 'sha256_path_and_file_sha256_v1',
    source_state: 'clean_commit',
    fixture_hash: null,
    selected_case_hash: `sha256:${sha256(JSON.stringify(selected))}`,
    corpus_path: slice.corpusPath,
    feature_flags: { [`${service}_playbook`]: slice.playbookEnabled },
    corpus_version: `sha256:${sha256(corpusText)}`,
    run_mode: 'live',
    started_at: startedAt,
    repetitions: 1,
    repetition_strategy: 'independent_live_sessions',
    run_config: {
      offset: slice.offset,
      limit: slice.limit,
      max_turns: MAX_TURNS,
      retry_wait_seconds: 190,
      timeout_seconds: 45,
      district: DISTRICT,
      allow_failures: false,
    },
  }
  const manifest = createRunManifest(manifestInput)
  const fallbackRuns = observations.filter((item) => item.model_id === 'deterministic-fallback').length
  const metrics = {
    ...normalized.metrics,
    provider_fallback: Object.freeze({ fallback_runs: fallbackRuns, total_runs: observations.length }),
  }
  const stability = normalized.stability
  const raw = buildSanitizedRawArtifact(manifestInput, scored)
  const json = {
    manifest,
    metrics,
    stability,
    runs: scored.map((run, index) => ({
      id: run.id,
      difficulty: run.difficulty,
      repetition: run.repetition,
      expected: run.expected,
      observed: raw.observations[index].observation,
      error_code: raw.observations[index].error_code,
      score: run.score,
    })),
  }
  const markdown = renderMarkdown({ manifest, metrics, stability, scored, raw })
  const artifactReceipt = {
    json,
    raw,
    markdown,
    sourceAttestation,
    summary: { mode: 'live', cases: 12, metrics, stability },
  }
  const verified = validatePlan55SliceArtifacts({
    receipt: artifactReceipt,
    slice,
    deployment,
    sourceAttestation,
    expectedCaseIds: selected.map((testCase) => testCase.id),
  })
  if (verified.sourceAttestationSha256 !== sourceAttestationSha256) {
    throw new Error('plan55_canary_source_attestation_changed_during_slice')
  }
  await verifyCurrentSource()
  const artifactFiles = await persistArtifacts(artifactRoot, deployment, service, slice, manifest.started_at, artifactReceipt)
  return Object.freeze({
    ...verified,
    artifactFiles: artifactFiles.paths,
    artifactSha256: artifactFiles.hashes,
  })
}

async function runLiveCase(fetchImpl, anonKey, actor, testCase, service, clientHeaders) {
  let response = await postChat(fetchImpl, anonKey, actor.accessToken, {
    service_type: service,
    message: testCase.input_text_vi,
    problem_chips: [],
    client_request_id: randomUUID(),
    address_district: DISTRICT,
    language: 'vi',
  }, clientHeaders)
  const initialObservation = extractIntakeObservation(response)
  let sessionId = response?.session?.id ?? null
  let turns = 1
  let clarificationTurns = response?.turns?.at(-1)?.content_type === 'clarification' ? 1 : 0
  const usedUserTurns = []
  let detailUsed = false
  while (turns < MAX_TURNS && sessionId && response?.turns?.at(-1)?.content_type === 'clarification') {
    const selected = selectUserTurn(testCase, requestedSlotsFromResponse(response), usedUserTurns)
    if (selected) usedUserTurns.push(selected.index)
    if (selected?.fixture) throw new Error('plan55_canary_multimodal_fixture_not_supported')
    const message = selected?.reply ?? (!detailUsed ? testCase.detail : null)
    if (!message) break
    detailUsed ||= !selected?.reply
    response = await postChat(fetchImpl, anonKey, actor.accessToken, {
      service_type: service,
      session_id: sessionId,
      message,
      address_district: DISTRICT,
      language: 'vi',
    }, clientHeaders)
    if (response?.turns?.at(-1)?.content_type === 'clarification') clarificationTurns += 1
    sessionId = response?.session?.id ?? sessionId
    turns += 1
  }
  return { response, initialObservation, clarificationTurns, turns }
}

async function postChat(fetchImpl, anonKey, accessToken, body, clientHeaders) {
  return readJson(fetchImpl, `${PRODUCTION_MOBILE_API_URL}/kael/chat`, {
    method: 'POST',
    headers: {
      ...clientHeaders,
      apikey: anonKey,
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': `mobile:${body.client_request_id ?? randomUUID()}`,
    },
    body: JSON.stringify(body),
  }, 'plan55_canary_chat_request_failed')
}

async function readActorCleanupCounts(admin, actorId) {
  const [profiles, customerProfiles, deletionRequests, sessions] = await Promise.all([
    exactCount(admin, 'profiles', 'id', actorId),
    exactCount(admin, 'customer_profiles', 'id', actorId),
    exactCount(admin, 'customer_account_deletion_requests', 'customer_id', actorId),
    exactCount(admin, 'kael_chat_sessions', 'customer_id', actorId),
  ])
  const sessionIds = sessions.data.map((row) => row.id)
  let turns = 0
  if (sessionIds.length > 0) {
    const result = await admin.from('kael_chat_turns').select('id', { count: 'exact', head: true })
      .in('session_id', sessionIds)
    if (result.error || !Number.isSafeInteger(result.count)) throw new Error('plan55_canary_cleanup_rows_unreadable')
    turns = result.count
  }
  return {
    profiles,
    customer_profiles: customerProfiles,
    customer_account_deletion_requests: deletionRequests,
    kael_chat_sessions: sessions.count,
    kael_chat_turns: turns,
  }
}

async function waitForServiceCleanupProof({
  service,
  actor,
  names,
  readSecretNames,
  readHealth,
  admin,
  sleep,
}) {
  let lastFailure = 'plan55_canary_cleanup_unverified'
  for (let attempt = 0; attempt < CLEANUP_RETRIES; attempt += 1) {
    try {
      const [secretNames, authStatus, rows, { health }] = await Promise.all([
        readSecretNames(),
        actor && isUuid(actor.id) ? verifyAuthActorDeleted(admin, actor.id) : Promise.resolve(404),
        actor && isUuid(actor.id) ? readActorCleanupCounts(admin, actor.id) : Promise.resolve(zeroCleanupRows()),
        readHealth(),
      ])
      const globalFlagsRemain = PLAN55_PRODUCTION_FLAG_NAMES.some((name) => secretNames.has(name))
      const canaryFlag = secretNames.has(names.enabled) ? 'enabled' : 'absent'
      const canaryActorId = secretNames.has(names.actor) ? 'configured' : 'absent'
      const orphanWorkers = health.plan55?.cleanup?.orphan_workers
      const proof = { canaryFlag, canaryActorId, authStatus, rows, orphanWorkers }
      if (globalFlagsRemain) lastFailure = 'plan55_canary_flag_inventory_not_clean'
      else if (canaryFlag !== 'absent' || canaryActorId !== 'absent') lastFailure = 'plan55_canary_flag_cleanup_unverified'
      else if (authStatus !== 404) lastFailure = 'plan55_canary_auth_cleanup_unverified'
      else if (Object.values(rows).some((count) => count !== 0)) lastFailure = 'plan55_canary_cleanup_rows_pending'
      else if (orphanWorkers !== 0) lastFailure = 'plan55_canary_orphan_worker_unverified'
      else return proof
    } catch {
      lastFailure = 'plan55_canary_cleanup_unverified'
    }
    if (attempt + 1 < CLEANUP_RETRIES) await sleep(CLEANUP_RETRY_DELAY_MS)
  }
  throw new Error(lastFailure)
}

async function waitForActorDeletionProof(admin, actorId, sleep) {
  let lastFailure = 'plan55_canary_actor_setup_cleanup_failed'
  for (let attempt = 0; attempt < CLEANUP_RETRIES; attempt += 1) {
    try {
      const [authStatus, rows] = await Promise.all([
        verifyAuthActorDeleted(admin, actorId),
        readActorCleanupCounts(admin, actorId),
      ])
      if (authStatus === 404 && Object.values(rows).every((count) => count === 0)) return
    } catch {
      lastFailure = 'plan55_canary_actor_setup_cleanup_failed'
    }
    if (attempt + 1 < CLEANUP_RETRIES) await sleep(CLEANUP_RETRY_DELAY_MS)
  }
  throw new Error(lastFailure)
}

async function retryCleanupMutation(operation, failureCode, sleep) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await operation()
      return
    } catch {
      if (attempt === 2) throw new Error(failureCode)
      await sleep((attempt + 1) * CLEANUP_RETRY_DELAY_MS)
    }
  }
}

async function exactCount(admin, table, column, actorId) {
  const query = admin.from(table).select(column, { count: 'exact', head: true }).eq(column, actorId)
  const result = await query
  if (result.error || !Number.isSafeInteger(result.count)) throw new Error('plan55_canary_cleanup_rows_unreadable')
  if (table === 'kael_chat_sessions') {
    const rows = await admin.from(table).select('id').eq(column, actorId)
    if (rows.error || !Array.isArray(rows.data)) throw new Error('plan55_canary_cleanup_rows_unreadable')
    return { count: result.count, data: rows.data }
  }
  return result.count
}

async function waitForSyntheticProfile(admin, userId, sleep) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await admin.from('profiles').select('id,role').eq('id', userId).maybeSingle()
    if (!result.error && result.data) return result
    await sleep(250)
  }
  return { data: null, error: new Error('profile_not_created') }
}

async function deleteAuthActor(admin, userId) {
  const { error } = await admin.auth.admin.deleteUser(userId, false)
  if (error && error.status !== 404 && error.code !== 'user_not_found') {
    throw new Error('plan55_canary_auth_delete_failed')
  }
}

async function verifyAuthActorDeleted(admin, userId) {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (!error && data?.user) return 200
  if (error?.status === 404 || error?.code === 'user_not_found') return 404
  throw new Error('plan55_canary_auth_cleanup_unverified')
}

async function deleteScopedFlags(fetchImpl, accessToken, names) {
  await readJson(fetchImpl, `${MANAGEMENT_ORIGIN}/projects/${PRODUCTION_PROJECT_REF}/secrets`, {
    method: 'DELETE',
    headers: managementHeaders(accessToken, true),
    body: JSON.stringify([names.enabled, names.actor]),
  }, 'plan55_canary_scoped_flag_cleanup_failed')
}

async function persistArtifacts(root, deployment, service, slice, runId, receipt) {
  const runPath = runId.replace(/[^a-z0-9-]/giu, '-')
  const directory = resolve(root, deployment.git_sha, service, slice.id, runPath)
  const relativeDirectory = relative(root, directory)
  if (relativeDirectory.startsWith('..') || resolve(root, relativeDirectory) !== directory) {
    throw new Error('plan55_canary_artifact_path_invalid')
  }
  await mkdir(directory, { recursive: true })
  const content = {
    'slice.json': `${JSON.stringify(receipt.json, null, 2)}\n`,
    'slice.raw.json': `${JSON.stringify(receipt.raw, null, 2)}\n`,
    'slice.md': receipt.markdown,
    'source-attestation.json': `${JSON.stringify(receipt.sourceAttestation, null, 2)}\n`,
  }
  const paths = {}
  const hashes = {}
  for (const [name, value] of Object.entries(content)) {
    const path = resolve(directory, name)
    await writeFile(path, value, { flag: 'wx', mode: 0o600 })
    const repoRelativePath = relative(REPO_ROOT, path).replaceAll('\\', '/')
    if (repoRelativePath.startsWith('../') || repoRelativePath.includes('/../')) {
      throw new Error('plan55_canary_artifact_path_invalid')
    }
    paths[name] = repoRelativePath
    hashes[name] = sha256(value)
  }
  return { paths, hashes }
}

async function verifyPersistedArtifacts({ receipt, slice, deployment, artifactRoot }) {
  const names = ['slice.json', 'slice.raw.json', 'slice.md', 'source-attestation.json']
  if (!receipt.artifactFiles || !receipt.artifactSha256) throw new Error('plan55_checkpoint_artifact_receipt_missing')
  const contents = {}
  for (const name of names) {
    const relativePath = receipt.artifactFiles[name]
    if (typeof relativePath !== 'string' || relativePath.includes('\\') || relativePath.split('/').includes('..')) {
      throw new Error('plan55_checkpoint_artifact_path_invalid')
    }
    const path = resolve(REPO_ROOT, receipt.artifactFiles[name])
    const rel = relative(artifactRoot, path)
    if (rel.startsWith('..') || !/^[a-f0-9]{40}[/\\]/iu.test(rel)) {
      throw new Error('plan55_checkpoint_artifact_path_invalid')
    }
    const bytes = await readFile(path)
    if (sha256(bytes) !== receipt.artifactSha256[name]) throw new Error('plan55_checkpoint_artifact_digest_invalid')
    contents[name] = bytes.toString('utf8')
  }
  const corpusText = await readFile(resolve(REPO_ROOT, slice.corpusPath), 'utf8')
  const corpus = validatePlaybookCorpus(JSON.parse(corpusText), slice.service)
  const selectedCases = corpus.slice(slice.offset, slice.offset + slice.limit)
  if (selectedCases.length !== 12) throw new Error('plan55_checkpoint_corpus_slice_invalid')
  const verified = validatePlan55SliceArtifacts({
    receipt: {
      json: JSON.parse(contents['slice.json']),
      raw: JSON.parse(contents['slice.raw.json']),
      markdown: contents['slice.md'],
      sourceAttestation: JSON.parse(contents['source-attestation.json']),
      summary: { mode: 'live', cases: 12, metrics: receipt.metrics },
    },
    slice,
    deployment,
    sourceAttestation: JSON.parse(contents['source-attestation.json']),
    expectedCaseIds: selectedCases.map((testCase) => testCase.id),
  })
  if (verified.runId !== receipt.runId ||
      verified.sourceAttestationSha256 !== receipt.sourceAttestationSha256 ||
      sha256(contents['slice.json']) !== receipt.artifactSha256['slice.json']) {
    throw new Error('plan55_checkpoint_artifact_identity_mismatch')
  }
}

function renderMarkdown({ manifest, metrics, stability, scored, raw }) {
  const pct = (value) => value == null ? 'n/a' : `${Math.round(value * 1000) / 10}%`
  const matrix = metrics.routing.confusion_matrix
  const matrixRows = ['in_scope', 'out_of_scope', 'service_mismatch'].map((label) =>
    `| ${label} | ${matrix[label].in_scope} | ${matrix[label].out_of_scope} | ${matrix[label].service_mismatch} |`
  )
  const metricLines = [
    `- Overall: ${pct(metrics.overall_pass_rate)} (${metrics.passed}/${metrics.total})`,
    `- Routing accuracy: ${pct(metrics.routing.accuracy)} (${metrics.total - metrics.routing.unclassified}/${metrics.total} classified runs)`,
    `- Routing macro-F1: ${metrics.routing.macro_f1 ?? 'n/a'}`,
    `- False-decline rate: ${pct(metrics.routing.false_decline_rate)} (${metrics.routing.false_declines}/${metrics.routing.valid_jobs})`,
    `- Suggested-service accuracy: ${pct(metrics.by_field.suggested_service.rate)}`,
    `- Clarification accuracy: ${pct(metrics.by_field.needs_clarification.rate)}`,
    `- Observed clarification rate: ${pct(metrics.conversation.clarification_rate)}`,
    `- Problem-slug accuracy: ${pct(metrics.by_field.problem_slug.rate)}`,
    `- Deterministic fallback share: ${pct(metrics.provider_fallback.fallback_runs / metrics.provider_fallback.total_runs)} (${metrics.provider_fallback.fallback_runs}/${metrics.provider_fallback.total_runs})`,
    `- Required-safety recall: ${pct(metrics.safety.required_signal_recall)} (${metrics.safety.observed_required_signals}/${metrics.safety.expected_required_signals}); misses: ${metrics.safety.required_signal_misses}`,
    `- Immediate-critical recall: ${pct(metrics.safety.immediate_critical_recall)} (${metrics.safety.observed_immediate_critical_signals}/${metrics.safety.expected_immediate_critical_signals}); misses: ${metrics.safety.immediate_critical_misses}`,
    `- Capability-signal recall: ${pct(metrics.safety.capability_recall)} (${metrics.safety.observed_capability_signals}/${metrics.safety.expected_capability_signals}); misses: ${metrics.safety.capability_misses}`,
    `- Safety false-positive rate: ${pct(metrics.safety.false_positive_rate)} (${metrics.safety.false_positives}/${metrics.safety.forbidden_signal_checks})`,
    `- Average turns: ${metrics.conversation.average_turns ?? 'n/a'}`,
    `- Latency p50 / p95: ${metrics.conversation.latency_ms_p50 ?? 'n/a'} / ${metrics.conversation.latency_ms_p95 ?? 'n/a'} ms`,
    `- Repeated-run fully-consistent rate (error-aware): ${pct(stability.fully_consistent_rate)}`,
    `- Outcome-mode agreement (diagnostic; errored outcomes can agree): ${pct(stability.consistency_rate)}`,
    `- Errored case groups / runs: ${stability.errored_cases} / ${stability.errored_runs}`,
    '- Release gate: strict',
  ]
  const runRows = scored.map((run, index) => {
    const observation = raw.observations[index].observation
    const misses = run.score.fields.safety_signals?.missing?.join(',') || '-'
    const clarification = run.score.fields.needs_clarification?.pass ? 'PASS' : 'FAIL'
    const slug = run.score.fields.problem_slug?.pass ? 'PASS' : 'FAIL'
    return `| ${run.id} | ${run.repetition} | ${run.score.pass ? 'PASS' : 'FAIL'} | ${run.expected.scope_signal} | ${observation.scope_signal} | ${observation.suggested_service ?? '-'} | ${clarification} | ${slug} | ${misses} |`
  })
  const metricsHash = sha256(JSON.stringify(metrics))
  return [
    '# Plan 55 Production-only slice',
    '',
    '## Run manifest',
    '',
    '```json',
    JSON.stringify(manifest, null, 2),
    '```',
    '',
    '## Structured live metrics',
    '',
    ...metricLines,
    '',
    `<!-- plan55-eval-metrics-sha256:${metricsHash} -->`,
    '',
    '## Routing confusion matrix',
    '',
    `Run-level counts: ${stability.cases} unique cases x ${manifest.repetitions} repetition(s).`,
    '',
    '| expected \\ observed | in_scope | out_of_scope | service_mismatch |',
    '|---|---:|---:|---:|',
    ...matrixRows,
    '',
    '## Runs',
    '',
    '| Case | Rep | Result | Expected | Observed | Suggested | Clarify | Slug | Safety misses |',
    '|---|---:|---|---|---|---|---|---|---|',
    ...runRows,
    '',
  ].join('\n')
}

function sanitizeExpected(expected) {
  const allowed = [
    'scope_signal', 'suggested_service', 'problem_slug', 'acceptable_problem_slugs',
    'needs_clarification', 'safety_signals', 'required_safety_signals',
    'forbidden_safety_signals', 'complexity',
  ]
  return Object.fromEntries(allowed.filter((key) => Object.hasOwn(expected, key)).map((key) => [key, expected[key]]))
}

async function runLocalSourceAttestor() {
  const script = resolve(REPO_ROOT, 'apps/api/scripts/kael-playbook-production-attest.mjs')
  let result
  try {
    result = execFileSync(process.execPath, [script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env,
    })
  } catch {
    throw new Error('plan55_canary_source_attestation_failed')
  }
  const attestation = JSON.parse(result)
  if (attestation.endpoint !== `${PRODUCTION_MOBILE_API_URL}/harness/health`) {
    throw new Error('plan55_canary_source_attestation_target_mismatch')
  }
  return attestation
}

async function readPlan55HoldoutAssets() {
  const assets = await Promise.all(PLAN55_SERVICE_ORDER.map(async (service) => {
    const path = PLAN55_SOURCE_ASSETS[service].holdout
    const bytes = await readFile(resolve(REPO_ROOT, path))
    let cases
    try {
      cases = JSON.parse(bytes.toString('utf8'))
    } catch {
      throw new Error('plan55_canary_holdout_asset_invalid')
    }
    if (!Array.isArray(cases) || cases.length < 24 ||
        cases.some((item) => !isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) ||
        new Set(cases.map((item) => item.id)).size !== cases.length) {
      throw new Error('plan55_canary_holdout_asset_invalid')
    }
    return [service, `sha256:${sha256(bytes)}`, cases.length, cases]
  }))
  const labelsSha256 = plan55HoldoutLabelsSha256(Object.fromEntries(
    assets.map(([service, _digest, _count, cases]) => [service, cases]),
  ))
  return {
    hashes: Object.fromEntries(assets.map(([service, digest]) => [service, digest])),
    caseCounts: Object.fromEntries(assets.map(([service, _digest, count]) => [service, count])),
    labelsSha256,
  }
}

async function defaultClientFactory(fetchImpl) {
  const { createClient } = await import('@supabase/supabase-js')
  return (url, key, options) => createClient(url, key, {
    ...options,
    global: { fetch: fetchImpl },
  })
}

async function readJson(fetchImpl, url, init, errorCode) {
  let response
  try {
    response = await fetchImpl(url, {
      ...init,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new Error(errorCode)
  }
  if (!response.ok) throw new Error(`${errorCode}_${response.status}`)
  if (response.status === 204) return null
  try {
    return await response.json()
  } catch {
    throw new Error(`${errorCode}_invalid_response`)
  }
}

function managementHeaders(accessToken, json = false) {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: 'application/json',
    ...(json ? { 'content-type': 'application/json' } : {}),
  }
}

function scopedFlagNames(service) {
  return {
    enabled: `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_ENABLED`,
    actor: `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_USER_ID`,
  }
}

function authOptions() {
  return { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
}

function assertService(service) {
  if (!PLAN55_SERVICE_ORDER.includes(service)) throw new Error('plan55_canary_unsupported_service')
}

function zeroCleanupRows() {
  return Object.fromEntries(CLEANUP_TABLES.map((table) => [table, 0]).concat([['kael_chat_turns', 0]]))
}

function normalizeSupabaseUrl(value) {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname.replace(/\/$/u, '')}`
  } catch {
    return ''
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

async function assertPrecedingServicesComplete(service, deployment, store) {
  const serviceIndex = PLAN55_SERVICE_ORDER.indexOf(service)
  if (serviceIndex < 0) throw new Error('plan55_canary_unsupported_service')
  for (const precedingService of PLAN55_SERVICE_ORDER.slice(0, serviceIndex)) {
    const status = await store.readVerifiedServiceStatus({
      service: precedingService,
      deployment,
    })
    if (!status.complete) throw new Error('plan55_canary_prior_service_incomplete')
  }
}

function sameDeploymentIdentity(value, expected) {
  return isRecord(value) && isRecord(expected) &&
    value.project_ref === PRODUCTION_PROJECT_REF &&
    value.project_ref === expected.project_ref &&
    value.git_sha === expected.git_sha &&
    value.release_id === expected.release_id &&
    value.deployment_id === expected.deployment_id
}

function sameClientHeaders(value, expected) {
  if (!isRecord(value) || !isRecord(expected)) return false
  const names = Object.keys(expected)
  return Object.keys(value).length === names.length &&
    names.every((name) => value[name] === expected[name])
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
}

function nowIso(clock) {
  const value = clock()
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('plan55_canary_clock_invalid')
  return date.toISOString()
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function safeError(error, fallback) {
  const code = error instanceof Error ? error.message : ''
  return new Error(/^[a-z0-9_:-]{1,160}$/iu.test(code) ? code : fallback)
}
