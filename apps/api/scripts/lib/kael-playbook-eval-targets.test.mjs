import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  aggregatePlaybookResults,
  aggregateRepetitionStability,
  scorePlaybookCase,
  validateStagingEvalTargets,
} from './kael-playbook-eval-core.mjs'
import {
  PRODUCTION_MOBILE_API_URL,
  PRODUCTION_PROJECT_REF,
  PLAN55_RUNTIME_SOURCE_PATHS,
  PLAN55_SOURCE_ASSETS,
  PLAN55_EVALUATOR_PATHS,
  validateProductionEvalTargets,
  validateProductionHealthPayload,
} from './kael-playbook-production-attestation.mjs'
import {
  PLAN55_SERVICE_ORDER,
  assertPlan55CanaryPreflight,
  assertPlan55Cleanup,
  buildPlan55ServiceSlices,
  runPlan55ServiceSequence,
  validatePlan55SliceArtifacts,
} from './plan55-production-canary-core.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const APPROVED_TEST_REF = 'abcdefghijklmnopqrst'
const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'
const productionUrl = `https://${PRODUCTION_REF}.supabase.co`

function productionHealth(overrides = {}) {
  return {
    service: 'mobile-api',
    status: 'ok',
    environment: {
      project_ref: PRODUCTION_PROJECT_REF,
      provider_configuration_class: 'production-locked',
      webhook_configuration_class: 'production-signed',
    },
    release: {
      release_id: 'harness-645c907e178f-f426155f83de',
      deployment_id: `${PRODUCTION_PROJECT_REF}_7d0946b9-aa63-42d3-b4d6-f1615a2c4d05_273`,
      git_sha: '645c907e178f21ddde24a72501e6c8449d6720f9',
      manifest_sha256: 'f5b620a9acbe44370b1737743e592cff14a969e843192e817546e29a389edb0a',
      bundle_sha256: 'e179c0572365ff73ba0765a34685cf7034f2c439b5ccc3fdbe69a230793955f3',
      source_bundle_sha256: 'ec3108a99b29ed82541e56367d7378dfafb2391eb37404221bf48717b6d4cd8d',
      edge_bundle_sha256: '6b173e2a9be01e4e1461f70504941dae5a4ec599cba84fdfe5e7e52cf7fc963b',
      registered: true,
    },
    ...overrides,
  }
}

function validPlan55Preflight(overrides = {}) {
  const sourceSha = productionHealth().release.git_sha
  const attestedFile = (path) => ({
    path,
    git_blob_sha1: '1'.repeat(40),
    deployed_sha256: `sha256:${'2'.repeat(64)}`,
    working_tree_sha256: `sha256:${'2'.repeat(64)}`,
    working_tree_matches_release_after_git_clean_filter: true,
  })
  const sourceAttestation = {
    schema: 'plan55-production-source-attestation/v1',
    endpoint: `${PRODUCTION_MOBILE_API_URL}/harness/health`,
    deployment: { project_ref: PRODUCTION_PROJECT_REF, git_sha: sourceSha },
    runtime_files: PLAN55_RUNTIME_SOURCE_PATHS.map(attestedFile),
    evaluator: {
      files: PLAN55_EVALUATOR_PATHS,
      sha256: `sha256:${'3'.repeat(64)}`,
    },
    services: Object.fromEntries(Object.entries(PLAN55_SOURCE_ASSETS).map(([service, files]) => [
      service,
      Object.fromEntries(Object.entries(files).map(([kind, path]) => [kind, attestedFile(path)])),
    ])),
  }
  const flagStates = { KAEL_INTAKE_EVAL_OBSERVATION_ENABLED: 'absent' }
  for (const service of PLAN55_SERVICE_ORDER) {
    const prefix = `KAEL_PLAYBOOK_${service.toUpperCase()}`
    flagStates[`${prefix}_ENABLED`] = 'absent'
    flagStates[`${prefix}_CANARY_ENABLED`] = 'absent'
    flagStates[`${prefix}_CANARY_USER_ID`] = 'absent'
  }
  return {
    mobileApiUrl: PRODUCTION_MOBILE_API_URL,
    supabaseUrl: productionUrl,
    productionCanaryOptIn: true,
    healthPayload: productionHealth(),
    releaseLane: 'verification',
    sourceAttestation,
    actorGuardProof: {
      source_sha: sourceSha,
      verified_auth_context: true,
      ignores_request_body_id: true,
      canary_precedes_legacy_global: true,
      regression_tests_pass: true,
    },
    flagStates,
    verificationProviders: {
      required: ['provider-a', 'provider-b'],
      status: { 'provider-a': true, 'provider-b': true },
    },
    ...overrides,
  }
}

test('Production target validator enforces explicit canary opt-in and exact target', () => {
  assert.deepEqual(
    validateProductionEvalTargets(`${PRODUCTION_MOBILE_API_URL}/`, `${productionUrl}/`, true),
    { mobileApiUrl: PRODUCTION_MOBILE_API_URL, supabaseUrl: productionUrl },
  )
  assert.throws(
    () => validateProductionEvalTargets(PRODUCTION_MOBILE_API_URL, null, false),
    { message: 'production_canary_opt_in_required' },
  )
  assert.throws(
    () => validateProductionEvalTargets(
      `https://${APPROVED_TEST_REF}.supabase.co/functions/v1/mobile-api`,
      null,
      true,
    ),
    { message: 'unapproved_production_mobile_api_target' },
  )
  assert.throws(
    () => validateProductionEvalTargets(`${productionUrl}.attacker.test/functions/v1/mobile-api`, null, true),
    { message: 'unapproved_production_mobile_api_target' },
  )
  assert.throws(
    () => validateProductionEvalTargets(PRODUCTION_MOBILE_API_URL, 'https://user@' + productionUrl, true),
    { message: 'invalid_supabase_url' },
  )
})

test('Production public health payload yields only validated deployment identity', () => {
  assert.deepEqual(validateProductionHealthPayload(productionHealth()), {
    source: 'public_harness_health',
    project_ref: PRODUCTION_PROJECT_REF,
    status: 'ok',
    provider_configuration_class: 'production-locked',
    webhook_configuration_class: 'production-signed',
    release_id: 'harness-645c907e178f-f426155f83de',
    deployment_id: `${PRODUCTION_PROJECT_REF}_7d0946b9-aa63-42d3-b4d6-f1615a2c4d05_273`,
    git_sha: '645c907e178f21ddde24a72501e6c8449d6720f9',
    manifest_sha256: 'sha256:f5b620a9acbe44370b1737743e592cff14a969e843192e817546e29a389edb0a',
    bundle_sha256: 'sha256:e179c0572365ff73ba0765a34685cf7034f2c439b5ccc3fdbe69a230793955f3',
    source_bundle_sha256: 'sha256:ec3108a99b29ed82541e56367d7378dfafb2391eb37404221bf48717b6d4cd8d',
    edge_bundle_sha256: 'sha256:6b173e2a9be01e4e1461f70504941dae5a4ec599cba84fdfe5e7e52cf7fc963b',
  })
})

test('Production attestation rejects an unhealthy, wrong-project, or mismatched release', () => {
  assert.throws(
    () => validateProductionHealthPayload(productionHealth({ status: 'degraded' })),
    { message: 'production_health_not_ok' },
  )
  assert.throws(
    () => validateProductionHealthPayload(productionHealth({
      environment: { project_ref: APPROVED_TEST_REF },
    })),
    { message: 'production_health_wrong_project' },
  )
  assert.throws(
    () => validateProductionHealthPayload(productionHealth({
      release: { ...productionHealth().release, registered: false },
    })),
    { message: 'production_health_release_unregistered' },
  )
  assert.throws(
    () => validateProductionHealthPayload(productionHealth({
      release: { ...productionHealth().release, git_sha: '782f45456f6ace601aa2ea55ab38aa52cc2538de' },
    })),
    { message: 'production_health_release_sha_mismatch' },
  )
})

test('Production canary preflight requires exact attestation, actor guard, clear flags, and providers', () => {
  assert.equal(assertPlan55CanaryPreflight(validPlan55Preflight()).deployment.git_sha,
    productionHealth().release.git_sha)
  assert.throws(() => assertPlan55CanaryPreflight(validPlan55Preflight({
    actorGuardProof: { verified_auth_context: false },
  })), { message: 'plan55_preflight_actor_guard_unverified' })
  assert.throws(() => assertPlan55CanaryPreflight(validPlan55Preflight({
    flagStates: { ...validPlan55Preflight().flagStates, KAEL_PLAYBOOK_HVAC_ENABLED: 'on' },
  })), { message: 'plan55_preflight_existing_flag_must_remain_off' })
  assert.throws(() => assertPlan55CanaryPreflight(validPlan55Preflight({
    verificationProviders: { required: ['provider-a'], status: { 'provider-a': false } },
  })), { message: 'plan55_preflight_verification_provider_not_ready' })
})

test('every attested Plan 55 evaluator source exists in this checkout', () => {
  const missing = PLAN55_EVALUATOR_PATHS.filter((path) => !existsSync(resolve(REPO_ROOT, path)))
  assert.deepEqual(missing, [])
})

test('Plan 55 emits eight ordered, disjoint 12-case slices per service', () => {
  assert.deepEqual(PLAN55_SERVICE_ORDER, [
    'hvac', 'handyman', 'cleaning', 'upholstery', 'plumbing', 'electrical',
  ])
  const slices = buildPlan55ServiceSlices('hvac')
  assert.equal(slices.length, 8)
  assert.deepEqual(slices.map(({ arm, dataset, repetition, offset, limit }) =>
    [arm, dataset, repetition, offset, limit]), [
    ['baseline', 'corpus', 1, 0, 12],
    ['baseline', 'corpus', 2, 12, 12],
    ['baseline', 'holdout', 1, 0, 12],
    ['baseline', 'holdout', 2, 12, 12],
    ['after', 'corpus', 1, 0, 12],
    ['after', 'corpus', 2, 12, 12],
    ['after', 'holdout', 1, 0, 12],
    ['after', 'holdout', 2, 12, 12],
  ])
  assert.equal(new Set(slices.map((slice) => slice.id)).size, 8)
  assert.throws(() => buildPlan55ServiceSlices('unsupported'), {
    message: 'plan55_canary_unsupported_service',
  })
})

test('Plan 55 cleanup requires absent flag and actor ID, Auth 404, zero rows, and no orphan worker', () => {
  const clean = {
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
  }
  assert.equal(assertPlan55Cleanup(clean), true)
  assert.throws(() => assertPlan55Cleanup({ ...clean, authStatus: 200 }), {
    message: 'plan55_cleanup_auth_actor_still_exists',
  })
  assert.throws(() => assertPlan55Cleanup({ ...clean, canaryActorId: 'present' }), {
    message: 'plan55_cleanup_canary_actor_still_configured',
  })
  assert.throws(() => assertPlan55Cleanup({ ...clean, canaryActorId: undefined }), {
    message: 'plan55_cleanup_canary_actor_still_configured',
  })
  assert.throws(() => assertPlan55Cleanup({ ...clean, orphanWorkers: 1 }), {
    message: 'plan55_cleanup_orphan_worker_detected',
  })
  assert.throws(() => assertPlan55Cleanup({
    ...clean,
    rows: { ...clean.rows, profiles: 1 },
  }), { message: 'plan55_cleanup_residual_rows_detected' })
})

test('Plan 55 validates JSON/raw/Markdown IDs, metrics, and exact release inputs', () => {
  const slice = buildPlan55ServiceSlices('hvac')[0]
  const caseIds = Array.from({ length: 12 }, (_, index) => `hvac-case-${index + 1}`)
  const deployment = { release_id: 'harness-645c907e178f-f426155f83de', git_sha: productionHealth().release.git_sha }
  const expected = {
    scope_signal: 'in_scope',
    suggested_service: 'hvac',
    problem_slug: 'hvac-general',
    acceptable_problem_slugs: ['hvac-general'],
    needs_clarification: false,
  }
  const observed = {
    scope_signal: 'in_scope',
    suggested_service: 'hvac',
    problem_slug: 'hvac-general',
    needs_clarification: false,
    safety_signals: [],
  }
  const scored = caseIds.map((id) => ({
    id,
    repetition: 1,
    expected,
    observed,
    score: scorePlaybookCase(expected, observed, null),
    turns: 2,
    clarificationTurns: 0,
    latency_ms: 30,
    error: null,
  }))
  const metrics = aggregatePlaybookResults(scored)
  const stability = aggregateRepetitionStability(scored)
  const manifest = {
    started_at: '2026-09-27T12:00:00.000Z',
    run_mode: 'live',
    deployment_version: deployment.release_id,
    observed_playbook_state: 'off',
    feature_flags: { hvac_playbook: false },
    corpus_path: slice.corpusPath,
    playbook_source_path: slice.playbookPath,
    repetitions: 1,
    run_config: { offset: 0, limit: 12, allow_failures: false },
  }
  const observations = caseIds.map((id) => ({
    id,
    repetition: 1,
    turns: 2,
    clarification_turns: 0,
    latency_ms: 30,
    observation: observed,
    final_observation: observed,
    error_code: null,
  }))
  const runs = scored.map((run) => ({
    id: run.id,
    repetition: run.repetition,
    expected: run.expected,
    observed: run.observed,
    error_code: null,
    score: run.score,
  }))
  const metricHash = createHash('sha256').update(JSON.stringify(metrics)).digest('hex')
  const markdown = [
    '## Run manifest', '', '```json', JSON.stringify(manifest, null, 2), '```',
    `<!-- plan55-eval-metrics-sha256:${metricHash} -->`, '',
    '## Live staging arm metrics (not a paired delta)', '',
    '- Overall: 100% (12/12)',
    '- Routing accuracy: 100% (12/12 classified runs)',
    '- Routing macro-F1: 1',
    '- False-decline rate: 0% (0/12)',
    '- Suggested-service accuracy: 100%',
    '- Clarification accuracy: 100%',
    '- Observed clarification rate: 0%',
    '- Problem-slug accuracy: 100%',
    '- Required-safety recall: n/a (0/0); misses: 0',
    '- Immediate-critical recall: n/a (0/0); misses: 0',
    '- Capability-signal recall: n/a (0/0); misses: 0',
    '- Safety false-positive rate: n/a (0/0)',
    '- Average turns: 2',
    '- Latency p50 / p95: 30 / 30 ms',
    '- Repeated-run fully-consistent rate (error-aware): n/a',
    '- Outcome-mode agreement (diagnostic; errored outcomes can agree): n/a',
    '- Errored case groups / runs: 0 / 0',
    '- Release gate: strict',
    '', '## Routing confusion matrix', '',
    'Run-level counts: 12 unique cases x 1 repetition(s).', '',
    '| expected \\ observed | in_scope | out_of_scope | service_mismatch |',
    '|---|---:|---:|---:|',
    '| in_scope | 12 | 0 | 0 |',
    '| out_of_scope | 0 | 0 | 0 |',
    '| service_mismatch | 0 | 0 | 0 |',
    '',
    '## Runs', '', '| Case | Rep | Result |', '|---|---:|---|',
    ...caseIds.map((id) => `| ${id} | 1 | PASS |`), '', '## Verification actually run', '',
  ].join('\n')
  const receipt = {
    json: { manifest, metrics, stability, runs },
    raw: { manifest, observations },
    markdown,
    summary: { mode: 'live', cases: 12, metrics },
  }
  assert.equal(validatePlan55SliceArtifacts({ receipt, slice, deployment, expectedCaseIds: caseIds }).errorCount, 0)
  assert.throws(() => validatePlan55SliceArtifacts({
    receipt: { ...receipt, raw: { ...receipt.raw, observations: observations.slice(1) } },
    slice,
    deployment,
    expectedCaseIds: caseIds,
  }), { message: 'plan55_canary_slice_artifact_integrity_failed' })
  assert.throws(() => validatePlan55SliceArtifacts({
    receipt: { ...receipt, markdown: markdown.replace(metricHash, '0'.repeat(64)) },
    slice,
    deployment,
    expectedCaseIds: caseIds,
  }), { message: 'plan55_canary_slice_artifact_integrity_failed' })
  assert.throws(() => validatePlan55SliceArtifacts({
    receipt: {
      ...receipt,
      markdown: markdown.replace('- Overall: 100% (12/12)', '- Overall: 50% (6/12)'),
    },
    slice,
    deployment,
    expectedCaseIds: caseIds,
  }), { message: 'plan55_canary_slice_artifact_integrity_failed' })
  assert.throws(() => validatePlan55SliceArtifacts({
    receipt: {
      ...receipt,
      markdown: markdown.replace('| in_scope | 12 | 0 | 0 |', '| in_scope | 11 | 0 | 0 |'),
    },
    slice,
    deployment,
    expectedCaseIds: caseIds,
  }), { message: 'plan55_canary_slice_artifact_integrity_failed' })
  const inconsistentMetrics = { ...metrics, overall_pass_rate: 0.5, passed: 6 }
  const inconsistentMetricHash = createHash('sha256').update(JSON.stringify(inconsistentMetrics)).digest('hex')
  assert.throws(() => validatePlan55SliceArtifacts({
    receipt: {
      ...receipt,
      json: { ...receipt.json, metrics: inconsistentMetrics },
      summary: { ...receipt.summary, metrics: inconsistentMetrics },
      markdown: markdown
        .replace(metricHash, inconsistentMetricHash)
        .replace('- Overall: 100% (12/12)', '- Overall: 50% (6/12)'),
    },
    slice,
    deployment,
    expectedCaseIds: caseIds,
  }), { message: 'plan55_canary_slice_artifact_integrity_failed' })
  assert.throws(() => validatePlan55SliceArtifacts({
    receipt: {
      ...receipt,
      json: {
        ...receipt.json,
        runs: receipt.json.runs.map((run, index) => index === 0
          ? { ...run, observed: { ...run.observed, scope_signal: 'out_of_scope' } }
          : run),
      },
    },
    slice,
    deployment,
    expectedCaseIds: caseIds,
  }), { message: 'plan55_canary_slice_artifact_integrity_failed' })
})

test('Plan 55 sequence stays serial and continues after a service-local G5 failure only after cleanup', async () => {
  const events = []
  const operations = {
    async preflight(service) { events.push(`preflight:${service}`); return validPlan55Preflight() },
    async createSyntheticActor(service) {
      events.push(`create:${service}`)
      return { id: `00000000-0000-4000-8000-${String(PLAN55_SERVICE_ORDER.indexOf(service) + 1).padStart(12, '0')}`, synthetic: true }
    },
    async runSlice({ service, slice }) {
      events.push(`slice:${service}:${slice.id}`)
      const sourceSha = productionHealth().release.git_sha
      return {
        sliceId: slice.id,
        artifactIntegrity: 'pass',
        caseCount: 12,
        errorCount: 0,
        sourceSha,
        corpusPath: slice.corpusPath,
        playbookPath: slice.playbookPath,
        playbookEnabled: slice.playbookEnabled,
        metrics: { overall_pass_rate: 1 },
      }
    },
    async enableActorCanary(service) { events.push(`enable:${service}`) },
    async cleanupService({ service }) {
      events.push(`cleanup:${service}`)
      return {
        canaryFlag: 'absent', canaryActorId: 'absent', authStatus: 404,
        rows: {
          profiles: 0, customer_profiles: 0,
          customer_account_deletion_requests: 0,
          kael_chat_sessions: 0, kael_chat_turns: 0,
        },
        orphanWorkers: 0,
      }
    },
    async evaluateG5({ service }) {
      events.push(`g5:${service}`)
      return { passed: service !== 'hvac', deltas: { measured: true } }
    },
  }
  const result = await runPlan55ServiceSequence({
    services: ['hvac', 'handyman'],
    operations,
  })
  assert.deepEqual(result.services.map(({ service, status }) => [service, status]), [
    ['hvac', 'G5_FAILED_SERVICE_OFF'],
    ['handyman', 'G5_PASSED'],
  ])
  assert.equal(events.filter((event) => event.startsWith('slice:')).length, 16)
  assert.ok(events.indexOf('cleanup:hvac') < events.indexOf('preflight:handyman'))
  assert.ok(events.indexOf('enable:hvac') < events.findIndex((event) => event.startsWith('slice:hvac:hvac-after')))
  assert.throws(() => assertPlan55Cleanup({
    canaryFlag: 'present', authStatus: 404,
    rows: {
      profiles: 0, customer_profiles: 0,
      customer_account_deletion_requests: 0,
      kael_chat_sessions: 0, kael_chat_turns: 0,
    }, orphanWorkers: 0,
  }), { message: 'plan55_cleanup_canary_flag_still_enabled' })
})

test('eval target validator accepts only the configured project and API route', () => {
  const expectedApi = `https://${APPROVED_TEST_REF}.supabase.co/functions/v1/mobile-api`
  const expectedSupabase = `https://${APPROVED_TEST_REF}.supabase.co`

  assert.deepEqual(
    validateStagingEvalTargets(`${expectedApi}/`, expectedSupabase, APPROVED_TEST_REF),
    { mobileApiUrl: expectedApi, supabaseUrl: expectedSupabase },
  )
  assert.throws(
    () => validateStagingEvalTargets(
      `${productionUrl}/functions/v1/mobile-api`,
      null,
      APPROVED_TEST_REF,
    ),
    { message: 'unapproved_mobile_api_target' },
  )
  assert.throws(
    () => validateStagingEvalTargets(
      expectedApi,
      productionUrl,
      APPROVED_TEST_REF,
    ),
    { message: 'unapproved_supabase_target' },
  )
})

test('playbook evaluator rejects the Production endpoint before client setup or network access', () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('KAEL_PB_EVAL_')),
  )
  env.KAEL_PB_EVAL_MOBILE_API_URL = `${productionUrl}/functions/v1/mobile-api`
  env.KAEL_PB_EVAL_CLIENT_PLATFORM = 'invalid'

  const result = spawnSync(
    process.execPath,
    [
      resolve(REPO_ROOT, 'apps/api/scripts/kael-playbook-eval.mjs'),
      '--service', 'electrical',
      '--playbook-enabled', 'false',
      '--date', '2026-09-26',
      '--limit', '1',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', env, timeout: 10000 },
  )

  assert.ifError(result.error)
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /unapproved_mobile_api_target/u)
  assert.doesNotMatch(
    result.stderr,
    /invalid_eval_client_platform|missing_eval_auth|fetch failed/u,
  )
})

test('six-service evaluator rejects the Production endpoint before network access', () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('KAEL_EVAL_')),
  )
  env.KAEL_EVAL_RUN_LIVE = 'yes'
  env.KAEL_EVAL_MOBILE_API_URL = `${productionUrl}/functions/v1/mobile-api`
  env.KAEL_EVAL_BEARER_TOKEN = 'test-only-token'

  const result = spawnSync(
    process.execPath,
    [resolve(REPO_ROOT, 'apps/api/scripts/kael-eval.mjs'), '--mode', 'live'],
    { cwd: REPO_ROOT, encoding: 'utf8', env, timeout: 10000 },
  )

  assert.ifError(result.error)
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /must target local or staging ref/u)
  assert.doesNotMatch(result.stderr, /fetch failed|ECONNREFUSED/u)
})
