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
  buildPlan55ServiceSlices,
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
const BOUNDED_RESPONSE_CLEANUP = new WeakMap()
export const PLAN55_PRODUCTION_FLAG_NAMES = Object.freeze([
  ...PLAN55_SERVICE_ORDER.map((service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_ENABLED`),
  ...PLAN55_SERVICE_ORDER.map((service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_ENABLED`),
  ...PLAN55_SERVICE_ORDER.map((service) => `KAEL_PLAYBOOK_${service.toUpperCase()}_CANARY_USER_ID`),
  'KAEL_INTAKE_EVAL_OBSERVATION_ENABLED',
])
const CASE_DELAY_MS = 190_000
const CLEANUP_RETRIES = 12
const CLEANUP_RETRY_DELAY_MS = 500
const REQUEST_TIMEOUT_MS = 20_000
const MAX_TURNS = 3
const DISTRICT = 'q7'
const CLEANUP_TABLES = Object.freeze([
  'profiles',
  'customer_profiles',
  'customer_account_deletion_requests',
  'kael_chat_sessions',
  'worker_profiles',
  'jobs_as_customer',
  'jobs_as_worker',
  'job_broadcasts_as_worker',
  'job_events_as_actor',
  'chat_messages_as_sender',
  'notifications_as_user',
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

  const boundedFetch = createPlan55BoundedFetch(fetchImpl)
  const makeClient = clientFactory ?? await defaultClientFactory(boundedFetch)
  const admin = makeClient(credentials.expectedUrl, credentials.serviceKey, { auth: authOptions() })
  const anonymous = makeClient(credentials.expectedUrl, credentials.anonKey, { auth: authOptions() })
  const store = createPlan55FileCheckpointStore({ rootDir: checkpointRoot, clock })
  let enabledService = null
  let setupCleanupActorId = null
  let setupCleanupActorIdentityUnknown = false
  let verifiedClientHeaders = null
  let verifiedDeployment = null
  let verifiedSourceAttestationSha256 = null
  let verifiedSourceAttestation = null

  async function readHealth() {
    const health = await readJson(boundedFetch, `${PRODUCTION_MOBILE_API_URL}/harness/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    }, 'plan55_canary_production_health_unavailable')
    return { health, deployment: validateProductionHealthPayload(health) }
  }

  async function readSecretNames() {
    const body = await readJson(boundedFetch, `${MANAGEMENT_ORIGIN}/projects/${PRODUCTION_PROJECT_REF}/secrets`, {
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
    const current = await readJson(boundedFetch,
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

  async function cleanupServiceOperation({ service, actor, flagMayBeEnabled }) {
    assertService(service)
    actor?.clearSession?.()
    const names = scopedFlagNames(service)
    const cleanupActorId = actor?.synthetic === true && isUuid(actor.id)
      ? actor.id
      : setupCleanupActorId
    let flagCleanupFailed = false
    if (flagMayBeEnabled || enabledService === service) {
      try {
        await retryCleanupMutation(
          () => deleteScopedFlags(boundedFetch, credentials.accessToken, names),
          'plan55_canary_scoped_flag_cleanup_failed',
          sleep,
        )
      } catch {
        flagCleanupFailed = true
      }
    }
    let actorExists = false
    let actorIdentityError = null
    if (cleanupActorId) {
      try {
        actorExists = await assertSyntheticAuthActor(admin, cleanupActorId)
      } catch (error) {
        actorIdentityError = error
      }
    }
    let actorDeleteFailed = false
    if (cleanupActorId && actorExists) {
      try {
        await retryCleanupMutation(
          () => deleteSyntheticAuthActor(admin, cleanupActorId),
          'plan55_canary_auth_delete_failed',
          sleep,
        )
      } catch {
        actorDeleteFailed = true
      }
    }
    if (flagCleanupFailed || actorIdentityError || actorDeleteFailed) {
      if (actorIdentityError && !flagCleanupFailed && !actorDeleteFailed) throw actorIdentityError
      throw new Error('plan55_canary_cleanup_mutation_failed')
    }

    const proof = await waitForServiceCleanupProof({
      service,
      actor: cleanupActorId ? { id: cleanupActorId } : null,
      names,
      readSecretNames,
      admin,
      sleep,
      actorIdentityUnknown: setupCleanupActorIdentityUnknown,
    })
    if (!(await boundedFetch.waitForIdle()) || boundedFetch.activeRequestCount() !== 0) {
      throw new Error('plan55_canary_orphan_worker_unverified')
    }
    if (enabledService === service) enabledService = null
    setupCleanupActorId = null
    setupCleanupActorIdentityUnknown = false
    return { ...proof, orphanWorkers: boundedFetch.activeRequestCount() }
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
      const userId = typeof env.PLAN55_CANARY_ACTOR_ID === 'string'
        ? env.PLAN55_CANARY_ACTOR_ID.toLowerCase()
        : ''
      if (!isUuid(userId)) throw new Error('plan55_canary_actor_id_missing')
      const email = `plan55-${service}-${randomUUID()}@example.invalid`
      const password = randomBytes(32).toString('base64url')
      let sessionAccess = null
      try {
        setupCleanupActorId = userId
        setupCleanupActorIdentityUnknown = false
        const { data, error } = await admin.auth.admin.createUser({
          id: userId,
          email,
          password,
          email_confirm: true,
          app_metadata: { role: 'customer', plan55_disposable: true },
          user_metadata: { full_name: 'Plan 55 synthetic customer' },
        })
        if (error || data?.user?.id !== userId) throw new Error('plan55_canary_actor_create_failed')
        const { data: profile, error: profileError } = await waitForSyntheticProfile(admin, userId, sleep)
        if (profileError || profile?.role !== 'customer') {
          throw new Error('plan55_canary_actor_profile_not_customer')
        }
        const { data: session, error: signInError } = await anonymous.auth.signInWithPassword({ email, password })
        if (signInError || session?.session?.user?.id !== userId) {
          throw new Error('plan55_canary_actor_sign_in_failed')
        }
        sessionAccess = createSessionAccess(session.session, userId, anonymous, clock)
        const { data: verified, error: verifyError } = await admin.auth.admin.getUserById(userId)
        if (verifyError || verified?.user?.id !== userId ||
            verified?.user?.app_metadata?.role !== 'customer' ||
            verified?.user?.app_metadata?.plan55_disposable !== true) {
          throw new Error('plan55_canary_actor_marker_unverified')
        }
        return Object.freeze({
          id: userId,
          synthetic: true,
          getAccessToken: () => sessionAccess.getAccessToken(),
          clearSession: () => sessionAccess?.clear(),
        })
      } catch (error) {
        sessionAccess?.clear()
        if (userId) {
          setupCleanupActorId = userId
          setupCleanupActorIdentityUnknown = false
          try {
            await retryCleanupMutation(
              () => deleteSyntheticAuthActor(admin, userId),
              'plan55_canary_actor_setup_cleanup_failed',
              sleep,
            )
            await waitForActorDeletionProof(admin, userId, sleep)
            setupCleanupActorId = null
          } catch {
            setupCleanupActorId = userId
            throw new Error('plan55_canary_actor_setup_cleanup_failed')
          }
        }
        if (setupCleanupActorIdentityUnknown) {
          throw new Error('plan55_canary_actor_cleanup_identity_unknown')
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
      await readJson(boundedFetch, `${MANAGEMENT_ORIGIN}/projects/${PRODUCTION_PROJECT_REF}/secrets`, {
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
      if (actor?.synthetic !== true || !isUuid(actor.id) || typeof actor.getAccessToken !== 'function' ||
          !sameDeploymentIdentity(deployment, verifiedDeployment) ||
          !sameClientHeaders(clientHeaders, verifiedClientHeaders) ||
          sourceAttestationSha256 !== verifiedSourceAttestationSha256 ||
          plan55SourceAttestationSha256(sourceAttestation, deployment.git_sha) !== verifiedSourceAttestationSha256) {
        throw new Error('plan55_canary_slice_actor_or_target_invalid')
      }
      await assertCurrentReleaseSource()
      return evaluateAndPersistSlice({
        service, actor, slice, deployment, clientHeaders, fetchImpl: boundedFetch,
        sourceAttestation, sourceAttestationSha256,
        verifyCurrentSource: assertCurrentReleaseSource,
        anonKey: credentials.anonKey, sleep, clock, artifactRoot,
      })
    },

    cleanupService: cleanupServiceOperation,
    async cleanupAbandonedService({ service, actorId }) {
      assertService(service)
      if (!isUuid(actorId)) throw new Error('plan55_canary_actor_id_invalid')
      return cleanupServiceOperation({
        service,
        actor: { id: actorId.toLowerCase(), synthetic: true },
        flagMayBeEnabled: true,
      })
    },

    async recoverInterruptedServiceCheckpoint({ service, deployment, runId, currentAttempt, markers }) {
      assertService(service)
      if (!deployment || deployment.project_ref !== PRODUCTION_PROJECT_REF ||
          typeof deployment.release_id !== 'string' || typeof deployment.git_sha !== 'string' ||
          !/^[a-f0-9]{40}$/iu.test(deployment.git_sha) || !/^\d+$/u.test(String(runId ?? '')) ||
          !Number.isSafeInteger(currentAttempt) || currentAttempt < 2 ||
          !Array.isArray(markers) || markers.length === 0) {
        throw new Error('plan55_canary_recovery_identity_invalid')
      }
      const expectedSourceSha = deployment.git_sha.toLowerCase()
      const actorIds = new Set()
      for (const marker of markers) {
        if (marker?.schema !== 'plan55-service-start/v1' || marker.service !== service ||
            String(marker.source_sha ?? '').toLowerCase() !== expectedSourceSha ||
            String(marker.run_id ?? '') !== String(runId) ||
            !Number.isSafeInteger(marker.attempt) || marker.attempt < 1 || marker.attempt >= currentAttempt ||
            marker.release_id !== deployment.release_id ||
            !isUuid(marker.actor_id) || actorIds.has(marker.actor_id.toLowerCase())) {
          throw new Error('plan55_canary_recovery_identity_invalid')
        }
        actorIds.add(marker.actor_id.toLowerCase())
      }

      let cleanup
      for (const actorId of actorIds) {
        cleanup = await this.cleanupAbandonedService({ service, actorId })
      }

      let interrupted
      try {
        interrupted = await store.readInterruptedServiceCheckpoint({ service, deployment })
      } catch (error) {
        if (error?.message !== 'plan55_checkpoint_service_not_interrupted') throw error
        const status = await store.readVerifiedServiceStatus({ service, deployment })
        const sourceIdentityVerified = await verifyCurrentRecoveryDeployment(deployment)
        return Object.freeze({
          schema: 'plan55-interrupted-service-recovery/v1',
          service,
          project_ref: PRODUCTION_PROJECT_REF,
          release_id: deployment.release_id,
          source_sha: expectedSourceSha,
          status: 'CLEANUP_ONLY_PASS',
          cleaned_actor_count: actorIds.size,
          retained_slice_count: status.verifiedSliceIds.length,
          invalidated_slice_ids: [],
          source_identity_verified: sourceIdentityVerified,
          cleanup,
        })
      }

      const sourceIdentityVerified = await verifyCurrentRecoveryDeployment(deployment)
      const slices = new Map(buildPlan55ServiceSlices(service).map((slice) => [slice.id, slice]))
      const storedIds = new Set(interrupted.receipts.map(({ sliceId }) => sliceId))
      const validatedReceipts = []
      const invalidatedSliceIds = []
      for (const receipt of interrupted.receipts) {
        const slice = slices.get(receipt.sliceId)
        if (!sourceIdentityVerified || !slice) {
          invalidatedSliceIds.push(receipt.sliceId)
          continue
        }
        try {
          await verifyPersistedArtifacts({ receipt, slice, deployment, artifactRoot })
          validatedReceipts.push(receipt)
        } catch {
          invalidatedSliceIds.push(receipt.sliceId)
        }
      }
      for (const sliceId of interrupted.sliceIds) {
        if (!storedIds.has(sliceId)) invalidatedSliceIds.push(sliceId)
      }
      const recovered = await store.recoverInterruptedServiceCheckpoint({
        checkpoint: interrupted,
        service,
        deployment,
        validatedReceipts,
        invalidatedSliceIds,
        cleanup,
      })
      return Object.freeze({
        schema: 'plan55-interrupted-service-recovery/v1',
        service,
        project_ref: PRODUCTION_PROJECT_REF,
        release_id: deployment.release_id,
        source_sha: expectedSourceSha,
        status: 'RECOVERY_PASS',
        cleaned_actor_count: actorIds.size,
        retained_slice_count: recovered.retainedSliceCount,
        invalidated_slice_ids: recovered.invalidatedSliceIds,
        source_identity_verified: sourceIdentityVerified,
        cleanup,
      })
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

  async function verifyCurrentRecoveryDeployment(expectedDeployment) {
    try {
      const { health, deployment } = await readHealth()
      if (health.release?.release_lane !== 'plan55-production-only' ||
          !sameDeploymentIdentity(deployment, expectedDeployment)) return false
      const sourceAttestation = sourceAttestationProvider
        ? await sourceAttestationProvider()
        : await runLocalSourceAttestor()
      assertPlan55SourceAttestation(sourceAttestation, deployment.git_sha)
      const clientHeaders = buildPlan55ProductionClientHeaders(health, deployment)
      verifiedDeployment = deployment
      verifiedClientHeaders = clientHeaders
      verifiedSourceAttestation = sourceAttestation
      verifiedSourceAttestationSha256 = plan55SourceAttestationSha256(sourceAttestation, deployment.git_sha)
      await assertCurrentHostedEdgeSource()
      return true
    } catch {
      verifiedDeployment = null
      verifiedClientHeaders = null
      verifiedSourceAttestation = null
      verifiedSourceAttestationSha256 = null
      return false
    }
  }
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
  let response = await postChat(fetchImpl, anonKey, actor.getAccessToken, {
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
    response = await postChat(fetchImpl, anonKey, actor.getAccessToken, {
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

async function postChat(fetchImpl, anonKey, getAccessToken, body, clientHeaders) {
  const accessToken = await getAccessToken()
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
  const [
    profiles,
    customerProfiles,
    deletionRequests,
    sessions,
    workerProfiles,
    jobsAsCustomer,
    jobsAsWorker,
    broadcastsAsWorker,
    eventsAsActor,
    chatMessagesAsSender,
    notificationsAsUser,
  ] = await Promise.all([
    exactCount(admin, 'profiles', 'id', actorId),
    exactCount(admin, 'customer_profiles', 'id', actorId),
    exactCount(admin, 'customer_account_deletion_requests', 'customer_id', actorId),
    exactRows(admin, 'kael_chat_sessions', 'customer_id', actorId),
    exactCount(admin, 'worker_profiles', 'id', actorId),
    exactCount(admin, 'jobs', 'customer_id', actorId),
    exactCount(admin, 'jobs', 'worker_id', actorId),
    exactCount(admin, 'job_broadcasts', 'worker_id', actorId),
    exactCount(admin, 'job_events', 'actor_id', actorId),
    exactCount(admin, 'chat_messages', 'sender_id', actorId),
    exactCount(admin, 'notifications', 'user_id', actorId),
  ])
  const sessionIds = sessions.map((row) => row.id)
  const turns = await exactCountIn(admin, 'kael_chat_turns', 'session_id', sessionIds)
  return {
    profiles,
    customer_profiles: customerProfiles,
    customer_account_deletion_requests: deletionRequests,
    kael_chat_sessions: sessions.length,
    kael_chat_turns: turns,
    worker_profiles: workerProfiles,
    jobs_as_customer: jobsAsCustomer,
    jobs_as_worker: jobsAsWorker,
    job_broadcasts_as_worker: broadcastsAsWorker,
    job_events_as_actor: eventsAsActor,
    chat_messages_as_sender: chatMessagesAsSender,
    notifications_as_user: notificationsAsUser,
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
  actorIdentityUnknown,
}) {
  let lastFailure = 'plan55_canary_cleanup_unverified'
  for (let attempt = 0; attempt < CLEANUP_RETRIES; attempt += 1) {
    try {
      const secretNames = await readSecretNames()
      const globalFlagsRemain = PLAN55_PRODUCTION_FLAG_NAMES.some((name) => secretNames.has(name))
      const canaryFlag = secretNames.has(names.enabled) ? 'enabled' : 'absent'
      const canaryActorId = secretNames.has(names.actor) ? 'configured' : 'absent'
      if (actorIdentityUnknown) {
        if (globalFlagsRemain) throw new Error('plan55_canary_flag_inventory_not_clean')
        if (canaryFlag !== 'absent' || canaryActorId !== 'absent') {
          throw new Error('plan55_canary_flag_cleanup_unverified')
        }
        throw new Error('plan55_canary_auth_actor_identity_unknown')
      }
      const [authStatus, rows] = await Promise.all([
        actor && isUuid(actor.id) ? verifyAuthActorDeleted(admin, actor.id) : Promise.resolve(404),
        actor && isUuid(actor.id) ? readActorCleanupCounts(admin, actor.id) : Promise.resolve(zeroCleanupRows()),
      ])
      const proof = { globalFlags: globalFlagsRemain ? 'present' : 'absent', canaryFlag, canaryActorId, authStatus, rows }
      if (globalFlagsRemain) lastFailure = 'plan55_canary_flag_inventory_not_clean'
      else if (canaryFlag !== 'absent' || canaryActorId !== 'absent') lastFailure = 'plan55_canary_flag_cleanup_unverified'
      else if (authStatus !== 404) lastFailure = 'plan55_canary_auth_cleanup_unverified'
      else if (Object.values(rows).some((count) => count !== 0)) lastFailure = 'plan55_canary_cleanup_rows_pending'
      else return proof
    } catch (error) {
      if (error instanceof Error && error.message === 'plan55_canary_auth_actor_identity_unknown') throw error
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
  return result.count
}

async function exactRows(admin, table, column, actorId) {
  const result = await admin.from(table).select('id').eq(column, actorId)
  if (result.error || !Array.isArray(result.data)) throw new Error('plan55_canary_cleanup_rows_unreadable')
  return result.data
}

async function exactCountIn(admin, table, column, values) {
  if (values.length === 0) return 0
  const result = await admin.from(table).select(column, { count: 'exact', head: true }).in(column, values)
  if (result.error || !Number.isSafeInteger(result.count)) throw new Error('plan55_canary_cleanup_rows_unreadable')
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

async function deleteSyntheticAuthActor(admin, userId) {
  if (!(await assertSyntheticAuthActor(admin, userId))) return
  const { error } = await admin.auth.admin.deleteUser(userId, false)
  if (error && error.status !== 404 && error.code !== 'user_not_found') {
    throw new Error('plan55_canary_auth_delete_failed')
  }
}

async function assertSyntheticAuthActor(admin, userId) {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error?.status === 404 || error?.code === 'user_not_found') return false
  const user = data?.user
  if (error || user?.id !== userId || user?.app_metadata?.role !== 'customer' ||
      user?.app_metadata?.plan55_disposable !== true) {
    throw new Error('plan55_canary_auth_actor_not_disposable')
  }
  return true
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

export async function readPlan55HoldoutAssets() {
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

export function createPlan55BoundedFetch(fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS) {
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('plan55_canary_bounded_fetch_configuration_invalid')
  }
  let activeRequests = 0
  const idleWaiters = new Set()
  const boundedFetch = async (input, init = {}) => {
    activeRequests += 1
    const requestSignal = init?.signal ?? input?.signal
    const controller = new AbortController()
    let completed = false
    const finish = (abort = false) => {
      if (completed) return
      completed = true
      activeRequests -= 1
      clearTimeout(timer)
      requestSignal?.removeEventListener('abort', forwardAbort)
      if (activeRequests === 0) {
        for (const resolveIdle of idleWaiters) resolveIdle()
      }
      if (abort && !controller.signal.aborted) {
        controller.abort(new DOMException('Plan 55 response was not consumed', 'AbortError'))
      }
    }
    const forwardAbort = () => controller.abort(requestSignal.reason)
    if (requestSignal?.aborted) forwardAbort()
    else requestSignal?.addEventListener('abort', forwardAbort, { once: true })
    const timer = setTimeout(() => {
      controller.abort(new DOMException('Plan 55 request timed out', 'TimeoutError'))
    }, timeoutMs)
    try {
      const response = await fetchImpl(input, { ...init, signal: controller.signal })
      if (!response || typeof response !== 'object') {
        finish()
        return response
      }
      const wrapResponse = (target) => {
        const boundedResponse = new Proxy(target, {
          get(responseTarget, property) {
            const value = Reflect.get(responseTarget, property, responseTarget)
            if (property === 'clone' && typeof value === 'function') {
              return (...args) => wrapResponse(value.apply(responseTarget, args))
            }
            if (['arrayBuffer', 'blob', 'formData', 'json', 'text'].includes(property) && typeof value === 'function') {
              return async (...args) => {
                try {
                  return await value.apply(responseTarget, args)
                } finally {
                  finish()
                }
              }
            }
            return typeof value === 'function' ? value.bind(responseTarget) : value
          },
        })
        BOUNDED_RESPONSE_CLEANUP.set(boundedResponse, finish)
        return boundedResponse
      }
      return wrapResponse(response)
    } catch (error) {
      finish()
      throw error
    }
  }
  Object.defineProperties(boundedFetch, {
    activeRequestCount: { value: () => activeRequests },
    waitForIdle: {
      value: (waitMs = timeoutMs) => {
        if (activeRequests === 0) return Promise.resolve(true)
        return new Promise((resolveIdle) => {
          let timer
          const finishWait = (idle) => {
            clearTimeout(timer)
            idleWaiters.delete(onIdle)
            resolveIdle(idle)
          }
          const onIdle = () => finishWait(true)
          timer = setTimeout(() => finishWait(activeRequests === 0), waitMs)
          idleWaiters.add(onIdle)
        })
      },
    },
  })
  return boundedFetch
}

function createSessionAccess(initialSession, actorId, anonymous, clock) {
  let tokenState = createSessionTokenState(initialSession, clock)
  let refreshInFlight = null
  let generation = 0
  return {
    async getAccessToken() {
      if (!tokenState) throw new Error('plan55_canary_actor_session_unavailable')
      if (tokenState.expiresAt - Math.floor(clock().getTime() / 1000) > 60) {
        return tokenState.accessToken
      }
      if (!refreshInFlight) {
        const refreshGeneration = generation
        const refreshToken = tokenState.refreshToken
        refreshInFlight = (async () => {
          try {
            const { data, error } = await anonymous.auth.refreshSession({
              refresh_token: refreshToken,
            })
            const refreshed = data?.session
            if (error || refreshed?.user?.id !== actorId) throw new Error('refresh_rejected')
            const nextState = createSessionTokenState(refreshed, clock)
            if (generation !== refreshGeneration) return
            tokenState = nextState
          } catch {
            if (generation === refreshGeneration) tokenState = null
            throw new Error('plan55_canary_actor_session_refresh_failed')
          }
        })()
      }
      const pendingRefresh = refreshInFlight
      try {
        await pendingRefresh
      } finally {
        if (refreshInFlight === pendingRefresh) refreshInFlight = null
      }
      if (!tokenState) throw new Error('plan55_canary_actor_session_refresh_failed')
      return tokenState.accessToken
    },
    clear() {
      generation += 1
      tokenState = null
      refreshInFlight = null
    },
  }
}

function createSessionTokenState(session, clock) {
  const expiresIn = Number(session?.expires_in)
  const fallbackExpiry = Number.isFinite(expiresIn)
    ? Math.floor(clock().getTime() / 1000) + expiresIn
    : Number.NaN
  const expiresAt = Number(session?.expires_at ?? fallbackExpiry)
  if (typeof session?.access_token !== 'string' || session.access_token.length === 0 ||
      typeof session?.refresh_token !== 'string' || session.refresh_token.length === 0 ||
      !Number.isSafeInteger(expiresAt)) {
    throw new Error('plan55_canary_actor_session_invalid')
  }
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt,
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
    })
  } catch {
    throw new Error(errorCode)
  }
  if (!response.ok) {
    finishBoundedResponse(response, true)
    throw new Error(`${errorCode}_${response.status}`)
  }
  if (response.status === 204) {
    finishBoundedResponse(response)
    return null
  }
  try {
    return await response.json()
  } catch {
    throw new Error(`${errorCode}_invalid_response`)
  }
}

function finishBoundedResponse(response, abort = false) {
  BOUNDED_RESPONSE_CLEANUP.get(response)?.(abort)
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
