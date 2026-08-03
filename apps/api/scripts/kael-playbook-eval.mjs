#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aggregatePlaybookResults,
  aggregateRepetitionStability,
  buildSanitizedRawArtifact,
  createRunManifest,
  extractIntakeObservation,
  normalizeEvalEvidenceForRunMode,
  requestedSlotsFromResponse,
  resolveRetryWaitSeconds,
  scorePlaybookCase,
  selectUserTurn,
  validateEvalDistrict,
  validatePlaybookCorpus,
  validateStagingEvalTargets,
} from './lib/kael-playbook-eval-core.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const DEFAULT_CORPUS = resolve(REPO_ROOT, 'docs/playbooks/eval/electrical-cases.json')
const MOCK_FIXTURE_DIR = resolve(REPO_ROOT, 'apps/api/scripts/fixtures')
const PLAYBOOK_SOURCE = resolve(REPO_ROOT, 'supabase/functions/mobile-api/_shared/kael/learning/playbooks/electrical.ts')
const APPROVED_STAGING_PROJECT_REF = 'xyylanuyflrjzbjzhqfl'
const SOURCE_FILES = [
  'apps/api/scripts/kael-playbook-eval.mjs',
  'apps/api/scripts/lib/kael-playbook-eval-core.mjs',
  'supabase/functions/mobile-api/_shared/kael/kael-guardrails/boundary-guard.ts',
  'supabase/functions/mobile-api/_shared/kael/kael-guardrails/electrical-intake-policy.ts',
  'supabase/functions/mobile-api/_shared/kael/index.ts',
  'supabase/functions/mobile-api/_shared/kael/pipeline/intake-runtime.ts',
  'supabase/functions/mobile-api/_shared/kael/tools/intent.ts',
  'supabase/functions/mobile-api/_shared/kael/pipeline/pipeline.ts',
  'supabase/functions/mobile-api/_shared/kael/learning/performance-profiles.ts',
  'supabase/functions/mobile-api/_shared/kael/prompts/prompts.ts',
  'supabase/functions/mobile-api/_shared/kael/learning/trace.ts',
  'supabase/functions/mobile-api/_shared/kael/contracts/types.ts',
  'supabase/functions/mobile-api/_shared/kael/pipeline/utils.ts',
  'supabase/functions/mobile-api/_shared/platform/domain-error-mappers.ts',
  'supabase/functions/mobile-api/_shared/platform/domain-utils.ts',
  'supabase/functions/mobile-api/_shared/platform/edge-env.ts',
  'supabase/functions/mobile-api/_shared/domains/job/chat-guard.ts',
  'supabase/functions/mobile-api/_shared/platform/job-media.ts',
  'supabase/functions/mobile-api/_shared/platform/job-state.ts',
  'supabase/functions/mobile-api/_shared/platform/kael-price-source.ts',
  'supabase/functions/mobile-api/_shared/http/serialize/labels.ts',
  'supabase/functions/mobile-api/_shared/domains/job/create/create.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/guard.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/advance.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/branches-pre-pipeline.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/branches-post-pipeline.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/clarification.service.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/intake-safety.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/create.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/turn.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/evidence.ts',
  'supabase/functions/mobile-api/_shared/domains/kael-chat/serialize.ts',
]

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) return printHelp()
  validateRunArgs(args)
  const startedAt = new Date().toISOString()
  const label = args.label ?? process.env.KAEL_PB_EVAL_LABEL ?? 'baseline'
  const serviceType = args.service ?? 'electrical'
  const corpusPath = resolve(
    REPO_ROOT,
    args.corpus ?? process.env.KAEL_PB_EVAL_CORPUS ?? DEFAULT_CORPUS,
  )
  ensureInsideRepo(corpusPath, 'corpus')
  if (!repoRelative(corpusPath).startsWith('docs/playbooks/eval/') || !corpusPath.endsWith('.json')) {
    throw new Error('corpus_path_outside_eval_directory')
  }
  const corpusText = await readFile(corpusPath, 'utf8')
  const fullCorpus = validatePlaybookCorpus(JSON.parse(corpusText))
  const offset = args.offset ?? 0
  const corpus = args.limit == null
    ? fullCorpus.slice(offset)
    : fullCorpus.slice(offset, offset + args.limit)
  if (corpus.length === 0) throw new Error('selected_corpus_is_empty')
  const repetitions = args.repetitions ?? 1
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) {
    throw new Error('repetitions must be an integer from 1 to 10')
  }
  const reportPath = resolve(
    REPO_ROOT,
    args.report ?? process.env.KAEL_PB_EVAL_REPORT_PATH ??
      `docs/test-logs/${todayFromEnvOrArg(args)}_kael-playbook-${serviceType}-${label}.md`,
  )
  ensureInsideRepo(reportPath, 'report')
  const reportRelativePath = repoRelative(reportPath)
  if (!/^docs\/test-logs\/20\d{2}-\d{2}-\d{2}_kael-playbook-electrical-[a-z0-9._-]+\.md$/i.test(reportRelativePath)) {
    throw new Error('report_path_outside_test_logs')
  }
  const mockInput = args.mock ?? process.env.KAEL_PB_EVAL_MOCK ?? null
  const mockPath = mockInput ? await resolveMockFixturePath(mockInput) : null
  const mode = mockPath ? 'mock' : 'live'
  if (mode === 'live' && args.playbookEnabled === undefined) {
    throw new Error('live_run_requires_explicit_playbook_enabled')
  }
  const maxTurns = args.maxTurns ?? 3
  const district = validateEvalDistrict(args.district ?? process.env.KAEL_PB_EVAL_DISTRICT ?? 'q7')
  const delaySeconds = args.delay ?? (mode === 'live' ? 190 : 0)
  const retryWaitSeconds = args.retryWait ?? (mode === 'live' ? 190 : 0)
  const delayMs = delaySeconds * 1000
  if (mode === 'live' && delaySeconds < 190) throw new Error('live_delay_below_safe_minimum_190_seconds')
  if (mode === 'live' && retryWaitSeconds < 190) {
    throw new Error('live_retry_wait_below_safe_minimum_190_seconds')
  }
  if (mode === 'live' && corpus.length * repetitions > 18) {
    throw new Error('live_run_exceeds_safe_hourly_batch_use_offset_limit')
  }
  let mockText = null
  let caseRunner
  if (mockPath) {
    mockText = await readFile(mockPath, 'utf8')
    const transport = mockTransport(mockText)
    caseRunner = async (testCase) => {
      const response = await transport(testCase.id)
      return {
        response,
        initialObservation: extractIntakeObservation(response),
        clarificationTurns: lastContentType(response) === 'clarification' ? 1 : 0,
        turns: 1,
      }
    }
  } else {
    const post = livePost(
      await buildLiveConfig(),
      retryWaitSeconds,
      5,
      args.timeout ?? 45,
    )
    caseRunner = (testCase) => runCaseLive(post, testCase, serviceType, maxTurns, district)
  }

  const runs = []
  let executionIndex = 0
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const testCase of corpus) {
      if (executionIndex > 0 && delayMs > 0) await sleep(delayMs)
      executionIndex += 1
      const began = Date.now()
      let observed = null
      let finalObserved = null
      let clarificationTurns = 0
      let error = null
      let turns = 0
      try {
        const outcome = await caseRunner(testCase)
        turns = outcome.turns
        observed = outcome.initialObservation ?? extractIntakeObservation(outcome.response)
        finalObserved = extractIntakeObservation(outcome.response)
        clarificationTurns = outcome.clarificationTurns ?? 0
      } catch (caught) {
        error = caught instanceof Error ? caught : new Error(String(caught))
      }
      runs.push({
        id: testCase.id,
        difficulty: testCase.difficulty,
        repetition,
        expected: testCase.expected,
        observed,
        finalObserved,
        clarificationTurns,
        error,
        turns,
        latency_ms: Date.now() - began,
      })
    }
  }

  const scored = runs.map((run) => ({
    ...run,
    score: scorePlaybookCase(run.expected, run.observed, run.error),
  }))
  const evidence = normalizeEvalEvidenceForRunMode(
    mode,
    aggregatePlaybookResults(scored),
    aggregateRepetitionStability(scored),
  )
  const { metrics, stability } = evidence
  const observations = scored.filter((run) => run.observed).map((run) => run.observed)
  const observedPlaybook = singleObservedField(observations, 'playbook_version', true)
  const observedPrompt = singleObservedField(observations, 'prompt_version')
  if (observedPrompt === 'mixed') throw new Error('mixed_observed_prompt_versions')
  if (observedPlaybook === 'mixed') throw new Error('mixed_observed_playbook_versions')
  if (
    observations.length > 0 &&
    args.playbookEnabled !== undefined &&
    args.playbookEnabled !== (observedPlaybook !== null)
  ) throw new Error('playbook_flag_observation_mismatch')
  const deploymentVersion = process.env.KAEL_PB_EVAL_DEPLOYMENT_VERSION?.trim()
  if (mode === 'live' && !deploymentVersion) throw new Error('missing_live_deployment_version')
  const manifestInput = {
    git_sha: gitSha(),
    git_sha_scope: 'local_base_commit',
    deployment_version: mode === 'mock' ? 'local-mock' : deploymentVersion,
    deployment_version_source: mode === 'mock' ? 'local_mock_constant' : 'operator_supplied',
    deployment_attestation: 'not_performed',
    model_id: singleObservedField(observations, 'model_id') ?? 'unobserved',
    model_ids: [...new Set(observations.map((item) => item.model_id))].sort(),
    provider: 'unobserved',
    sampling_config: null,
    prompt_version: observedPrompt ?? 'unobserved',
    playbook_version: observedPlaybook,
    observed_playbook_state: observations.length === 0
      ? 'unobserved'
      : observedPlaybook === null ? 'off' : 'on',
    playbook_hash: `sha256:${sha256(await readFile(PLAYBOOK_SOURCE, 'utf8'))}`,
    playbook_hash_scope: 'full_local_source_file',
    playbook_source_path: repoRelative(PLAYBOOK_SOURCE),
    source_tree_hash: `sha256:${await sourceTreeHash()}`,
    source_scope: 'local_curated_source_set',
    source_files: SOURCE_FILES,
    source_hash_algorithm: 'sha256_path_and_file_sha256_v1',
    source_state: gitIsDirty() ? 'base_sha_with_uncommitted_sources' : 'clean_commit',
    fixture_hash: mockText ? `sha256:${sha256(mockText)}` : null,
    selected_case_hash: `sha256:${sha256(JSON.stringify(corpus))}`,
    corpus_path: repoRelative(corpusPath),
    feature_flags: {
      electrical_playbook: args.playbookEnabled,
    },
    corpus_version: `sha256:${sha256(corpusText)}`,
    run_mode: mode,
    started_at: startedAt,
    repetitions,
    repetition_strategy: mode === 'mock' ? 'deterministic_fixture_replay' : 'independent_live_sessions',
    run_config: {
      offset,
      limit: args.limit ?? null,
      max_turns: maxTurns,
      retry_wait_seconds: retryWaitSeconds,
      timeout_seconds: args.timeout ?? 45,
      district,
      allow_failures: args.allowFailures === true,
    },
  }
  const manifest = createRunManifest(manifestInput)
  const rawArtifact = buildSanitizedRawArtifact(manifestInput, scored)
  await writeReports({
    reportPath,
    label,
    serviceType,
    corpusPath,
    manifest,
    rawArtifact,
    scored,
    metrics,
    stability,
    mode,
  })
  console.log(JSON.stringify({
    label,
    mode,
    cases: corpus.length,
    repetitions,
    reportPath,
    metrics,
    stability: {
      repetition_evidence_available: stability.repetition_evidence_available,
      fully_consistent_rate: stability.fully_consistent_rate,
      outcome_mode_consistency_rate: stability.consistency_rate,
      errored_cases: stability.errored_cases,
      errored_runs: stability.errored_runs,
      worst_run_required_signal_misses: stability.worst_run_required_signal_misses,
      worst_run_immediate_critical_misses: stability.worst_run_immediate_critical_misses,
      worst_run_capability_misses: stability.worst_run_capability_misses,
    },
  }, null, 2))
  if (!args.allowFailures && scored.some((run) => !run.score.pass || run.score.error)) {
    throw new Error('eval_gate_failed_use_allow_failures_for_diagnostic_fixture')
  }
}

async function runCaseLive(post, testCase, serviceType, maxTurns, district) {
  let response = await post({
    service_type: serviceType,
    message: testCase.input_text_vi,
    problem_chips: [],
    client_request_id: randomUUID(),
    address_district: district,
  })
  const initialObservation = extractIntakeObservation(response)
  let sessionId = response?.session?.id ?? null
  let turns = 1
  let clarificationTurns = lastContentType(response) === 'clarification' ? 1 : 0
  let detailUsed = false
  const usedUserTurns = []
  while (turns < maxTurns && sessionId && lastContentType(response) === 'clarification') {
    const selected = selectUserTurn(
      testCase,
      requestedSlotsFromResponse(response),
      usedUserTurns,
    )
    if (selected) usedUserTurns.push(selected.index)
    if (selected?.fixture) throw new Error('fixture_turn_requires_multimodal_harness')
    const message = selected?.reply ?? (!detailUsed ? testCase.detail : null)
    if (!message) break
    detailUsed ||= !selected?.reply
    response = await post({
      service_type: serviceType,
      session_id: sessionId,
      message,
      address_district: district,
    })
    if (lastContentType(response) === 'clarification') clarificationTurns += 1
    sessionId = response?.session?.id ?? sessionId
    turns += 1
  }
  return { response, initialObservation, clarificationTurns, turns }
}

function livePost(config, retryWaitSec, maxAttempts, timeoutSec) {
  return async (request) => {
    let refreshed = false
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch(`${config.baseUrl}/kael/chat`, {
        method: 'POST',
        headers: {
          ...(config.anonKey ? { apikey: config.anonKey } : {}),
          Authorization: `Bearer ${config.bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutSec * 1000),
      })
      if (response.status === 401 && config.canRefresh && !refreshed) {
        refreshed = true
        await config.refresh()
        continue
      }
      if (response.status === 429 && attempt < maxAttempts - 1) {
        const waitSec = resolveRetryWaitSeconds(
          response.headers.get('retry-after'),
          retryWaitSec,
        )
        await sleep(waitSec * 1000)
        continue
      }
      if (!response.ok) throw new Error(`http_${response.status}`)
      const text = await response.text()
      return text ? JSON.parse(text) : {}
    }
    throw new Error('http_429')
  }
}

function mockTransport(mockText) {
  const mock = JSON.parse(mockText)
  return async (id) => {
    if (!(id in mock)) throw new Error('missing_mock_case')
    return mock[id]
  }
}

async function buildLiveConfig() {
  const rawBaseUrl = requireEnv('KAEL_PB_EVAL_MOBILE_API_URL')
  const anonKey = process.env.KAEL_PB_EVAL_ANON_KEY?.trim() || null
  const email = process.env.KAEL_PB_EVAL_EMAIL?.trim()
  const password = process.env.KAEL_PB_EVAL_PASSWORD
  const supabaseUrl = process.env.KAEL_PB_EVAL_SUPABASE_URL?.trim()
  const targets = validateStagingEvalTargets(
    rawBaseUrl,
    supabaseUrl,
    APPROVED_STAGING_PROJECT_REF,
  )
  const canRefresh = Boolean(email && password && supabaseUrl && anonKey)
  const config = {
    baseUrl: targets.mobileApiUrl,
    anonKey,
    bearerToken: process.env.KAEL_PB_EVAL_BEARER_TOKEN?.trim() || null,
    canRefresh,
    async refresh() {
      if (!canRefresh) return false
      const response = await fetch(`${targets.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(30000),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.access_token) throw new Error(`sign_in_http_${response.status}`)
      this.bearerToken = body.access_token
      return true
    },
  }
  if (!config.bearerToken && !(await config.refresh())) throw new Error('missing_eval_auth')
  return config
}

async function writeReports(input) {
  await mkdir(dirname(input.reportPath), { recursive: true })
  const pct = (value) => value == null ? 'n/a' : `${Math.round(value * 1000) / 10}%`
  const matrix = input.metrics.routing.confusion_matrix
  const diagnosticHeading = input.mode === 'mock'
    ? '## Local diagnostic metrics (not After)'
    : '## Live staging arm metrics (not a paired delta)'
  const lines = [
    `# Kael Playbook Eval - ${input.serviceType} (${input.label})`,
    '',
    '## Hypothesis',
    '',
    '- The electrical playbook may improve supported-service routing and safety handling without increasing false declines or unnecessary clarification.',
    '',
    '## Changed',
    '',
    input.mode === 'mock'
      ? '- Local fixture replay exercised the evaluator contract only; no deployed runtime was exercised or changed.'
      : `- Requested live arm: electrical playbook ${input.manifest.feature_flags.electrical_playbook ? 'enabled' : 'disabled'}. This report does not infer a deployment change.`,
    '',
    '## Baseline',
    '',
    '- Not captured in this report. Historical results are not treated as a matched baseline.',
    '',
    '## After',
    '',
    input.mode === 'mock'
      ? '- **NOT RUN.** Deterministic fixture replay is not deployed-runtime After evidence.'
      : '- **NOT ESTABLISHED.** This is one live arm; improvement requires a matched baseline and independent holdout.',
    '',
    '## Delta',
    '',
    '- Routing macro-F1: N/A',
    '- Suggested-service accuracy: N/A',
    '- Immediate-critical misses: N/A',
    '- Clarification turns: N/A',
    '- Latency p95: N/A',
    '- Cost per case: N/A',
    '',
    '## Run manifest',
    '',
    '```json',
    JSON.stringify(input.manifest, null, 2),
    '```',
    '',
    diagnosticHeading,
    '',
    `- Overall: ${pct(input.metrics.overall_pass_rate)} (${input.metrics.passed}/${input.metrics.total})`,
    `- Routing accuracy: ${pct(input.metrics.routing.accuracy)} (${input.metrics.total - input.metrics.routing.unclassified}/${input.metrics.total} classified runs)`,
    `- Routing macro-F1: ${input.metrics.routing.macro_f1 ?? 'n/a'}`,
    `- False-decline rate: ${pct(input.metrics.routing.false_decline_rate)} (${input.metrics.routing.false_declines}/${input.metrics.routing.valid_jobs})`,
    `- Suggested-service accuracy: ${pct(input.metrics.by_field.suggested_service.rate)}`,
    `- Clarification accuracy: ${pct(input.metrics.by_field.needs_clarification.rate)}`,
    `- Observed clarification rate: ${pct(input.metrics.conversation.clarification_rate)}`,
    `- Problem-slug accuracy: ${pct(input.metrics.by_field.problem_slug.rate)}`,
    `- Required-safety recall: ${pct(input.metrics.safety.required_signal_recall)} (${input.metrics.safety.observed_required_signals}/${input.metrics.safety.expected_required_signals}); misses: ${input.metrics.safety.required_signal_misses}`,
    `- Immediate-critical recall: ${pct(input.metrics.safety.immediate_critical_recall)} (${input.metrics.safety.observed_immediate_critical_signals}/${input.metrics.safety.expected_immediate_critical_signals}); misses: ${input.metrics.safety.immediate_critical_misses}`,
    `- Capability-signal recall: ${pct(input.metrics.safety.capability_recall)} (${input.metrics.safety.observed_capability_signals}/${input.metrics.safety.expected_capability_signals}); misses: ${input.metrics.safety.capability_misses}`,
    `- Safety false-positive rate: ${pct(input.metrics.safety.false_positive_rate)} (${input.metrics.safety.false_positives}/${input.metrics.safety.forbidden_signal_checks})`,
    `- Average turns: ${input.metrics.conversation.average_turns ?? 'n/a'}`,
    `- Latency p50 / p95: ${input.metrics.conversation.latency_ms_p50 ?? 'n/a'} / ${input.metrics.conversation.latency_ms_p95 ?? 'n/a'} ms`,
    `- Repeated-run fully-consistent rate (error-aware): ${pct(input.stability.fully_consistent_rate)}`,
    `- Outcome-mode agreement (diagnostic; errored outcomes can agree): ${pct(input.stability.consistency_rate)}`,
    `- Errored case groups / runs: ${input.stability.errored_cases} / ${input.stability.errored_runs}`,
    `- Release gate: ${input.manifest.run_config.allow_failures ? 'diagnostic override enabled' : 'strict'}`,
    '',
    '## Routing confusion matrix',
    '',
    `Run-level counts: ${input.stability.cases} unique cases x ${input.manifest.repetitions} repetition(s).`,
    '',
    '| expected \\ observed | in_scope | out_of_scope | service_mismatch |',
    '|---|---:|---:|---:|',
    ...['in_scope', 'out_of_scope', 'service_mismatch'].map((expected) =>
      `| ${expected} | ${matrix[expected].in_scope} | ${matrix[expected].out_of_scope} | ${matrix[expected].service_mismatch} |`
    ),
    '',
    '## Runs',
    '',
    '| Case | Rep | Result | Expected | Observed | Suggested | Clarify | Slug | Safety misses |',
    '|---|---:|---|---|---|---|---|---|---|',
    ...input.scored.map((run) => {
      const observed = run.observed?.scope_signal ?? 'error'
      const suggestion = run.observed?.suggested_service ?? '-'
      const misses = run.score.fields.safety_signals?.missing?.join(',') || '-'
      const clarify = fieldMark(run.score.fields.needs_clarification)
      const slug = fieldMark(run.score.fields.problem_slug)
      return `| ${run.id} | ${run.repetition} | ${run.score.pass ? 'PASS' : run.score.error ? 'ERR' : 'FAIL'} | ${run.expected.scope_signal} | ${observed} | ${suggestion} | ${clarify} | ${slug} | ${misses} |`
    }),
    '',
    '## Verification actually run',
    '',
    `- Runner completed ${input.metrics.total} scored record(s); release gate: ${input.manifest.run_config.allow_failures ? 'diagnostic override enabled' : 'strict'}.`,
    '- Structured observations, scoring, sanitized sidecar generation, and manifest validation completed before report writing.',
    '',
    '## Human/domain review still required',
    '',
    '- Tu/domain approval of the electrical textbook, safety wording, and product-policy calls remains pending; this harness cannot provide that approval.',
    '',
    '## Risks/Limitations',
    '',
    `- Corpus: ${repoRelative(input.corpusPath)}`,
    '- Routing is read only from the sanitized `intake_observation` contract; customer-facing copy is never used as a label.',
    '- Raw sidecar contains whitelisted observations and error codes only; it excludes response text, session IDs, credentials, and customer data.',
    '- Feature flags are requested configuration; `observed_playbook_state` is the structured runtime observation.',
    '- Git SHA, playbook hash, and source-tree hash describe bounded local sources only; deployment attestation was not performed.',
    '- Provider identity and sampling configuration are unobserved.',
    '- Mock runs validate harness behavior only. Live improvement requires an approved staging deployment and an independent holdout.',
    '- Safety-order, repeated-question, generic-fallback, complexity/slot completeness, token/cost, escalation, and repair metrics are not exposed by this structured contract and remain n/a.',
    '',
    '## Decision',
    '',
    '- **NEEDS_HOLDOUT**',
    '',
    '## Next Step',
    '',
    input.mode === 'mock'
      ? '- Complete owner/domain review, attest the staged deployment/source boundary, then run approved matched live baseline and After arms plus an independent holdout.'
      : '- Run the matched counterpart arm under the same approved corpus/configuration, then evaluate an independent holdout before any rollout claim.',
  ]
  const jsonPath = sidecarPath(input.reportPath, '.json')
  const rawPath = sidecarPath(input.reportPath, '.raw.json')
  const safeRuns = input.scored.map((run, index) => ({
    id: run.id,
    difficulty: run.difficulty,
    repetition: run.repetition,
    expected: sanitizeExpected(run.expected),
    observed: input.rawArtifact.observations[index].observation,
    error_code: input.rawArtifact.observations[index].error_code,
    score: run.score,
  }))
  await Promise.all([
    writeFile(input.reportPath, `${lines.join('\n')}\n`),
    writeFile(jsonPath, `${JSON.stringify({ manifest: input.manifest, metrics: input.metrics, stability: input.stability, runs: safeRuns }, null, 2)}\n`),
    writeFile(rawPath, `${JSON.stringify(input.rawArtifact, null, 2)}\n`),
  ])
}

function sanitizeExpected(expected) {
  return Object.fromEntries([
    'scope_signal',
    'suggested_service',
    'problem_slug',
    'acceptable_problem_slugs',
    'needs_clarification',
    'safety_signals',
    'required_safety_signals',
    'forbidden_safety_signals',
    'complexity',
  ].filter((key) => Object.hasOwn(expected, key)).map((key) => [key, expected[key]]))
}

function parseArgs(argv) {
  const out = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`missing_value_${arg}`)
      index += 1
      return value
    }
    if (arg === '--') continue
    else if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--mock') out.mock = nextValue()
    else if (arg === '--label') out.label = nextValue()
    else if (arg === '--corpus') out.corpus = nextValue()
    else if (arg === '--report') out.report = nextValue()
    else if (arg === '--service') out.service = nextValue()
    else if (arg === '--date') out.date = nextValue()
    else if (arg === '--delay') out.delay = Number(nextValue())
    else if (arg === '--offset') out.offset = Number(nextValue())
    else if (arg === '--limit') out.limit = Number(nextValue())
    else if (arg === '--max-turns') out.maxTurns = Number(nextValue())
    else if (arg === '--retry-wait') out.retryWait = Number(nextValue())
    else if (arg === '--timeout') out.timeout = Number(nextValue())
    else if (arg === '--repetitions') out.repetitions = Number(nextValue())
    else if (arg === '--district') out.district = nextValue()
    else if (arg === '--allow-failures') out.allowFailures = true
    else if (arg === '--playbook-enabled') out.playbookEnabled = parseBoolean(nextValue())
    else throw new Error(`unknown_arg_${arg}`)
  }
  return out
}

function printHelp() {
  console.log(`kael-playbook-eval

Mock contract run:
  node apps/api/scripts/kael-playbook-eval.mjs --mock <fixture.json> --label mock --date YYYY-MM-DD --repetitions 3 --allow-failures

Live staging run requires KAEL_PB_EVAL_MOBILE_API_URL, KAEL_PB_EVAL_DEPLOYMENT_VERSION, an explicit --playbook-enabled arm, and either KAEL_PB_EVAL_BEARER_TOKEN or KAEL_PB_EVAL_EMAIL, KAEL_PB_EVAL_PASSWORD, KAEL_PB_EVAL_SUPABASE_URL, KAEL_PB_EVAL_ANON_KEY.

Flags: --mock, --label, --corpus, --report, --service, --date, --delay, --offset, --limit, --max-turns, --retry-wait, --timeout, --repetitions, --district, --playbook-enabled, --allow-failures.`)
}

function lastContentType(response) {
  const turns = Array.isArray(response?.turns) ? response.turns : []
  return typeof turns.at(-1)?.content_type === 'string' ? turns.at(-1).content_type : null
}

function singleObservedField(observations, key, nullable = false) {
  const values = [...new Set(observations.map((item) => item[key]))]
  if (values.length === 0) return nullable ? null : undefined
  if (values.length === 1) return values[0]
  return values.every((value) => value === null) ? null : 'mixed'
}

function sidecarPath(reportPath, suffix) {
  return reportPath.endsWith('.md') ? reportPath.slice(0, -3) + suffix : reportPath + suffix
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function gitIsDirty() {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0
  } catch {
    return true
  }
}

async function sourceTreeHash() {
  const parts = await Promise.all(SOURCE_FILES.map(async (path) =>
    `${path}\n${sha256(await readFile(resolve(REPO_ROOT, path), 'utf8'))}`
  ))
  return sha256(parts.join('\n'))
}

function repoRelative(path) {
  return relative(REPO_ROOT, path).replaceAll('\\', '/')
}

function fieldMark(field) {
  if (!field?.gated) return '-'
  return field.pass ? 'PASS' : `FAIL (${String(field.observed)})`
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseBoolean(value) {
  if (['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())) return true
  if (['0', 'false', 'no', 'off'].includes(String(value).toLowerCase())) return false
  throw new Error('playbook-enabled must be true or false')
}

function validateRunArgs(args) {
  const label = args.label ?? process.env.KAEL_PB_EVAL_LABEL ?? 'baseline'
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(label)) throw new Error('invalid_label')
  const date = args.date ?? process.env.KAEL_PB_EVAL_DATE
  if (date !== undefined && !/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(date)) {
    throw new Error('invalid_date')
  }
  if ((args.service ?? 'electrical') !== 'electrical') throw new Error('unsupported_playbook_service')
  for (const [key, minimum, maximum] of [
    ['offset', 0, 10000], ['limit', 1, 10000], ['maxTurns', 1, 10],
    ['retryWait', 0, 3600], ['timeout', 1, 600], ['delay', 0, 3600],
  ]) {
    const value = args[key]
    if (value !== undefined && (!Number.isInteger(value) || value < minimum || value > maximum)) {
      throw new Error(`invalid_${key}`)
    }
  }
}

function ensureInsideRepo(path, label) {
  const candidate = relative(REPO_ROOT, path)
  if (candidate === '' || candidate.startsWith('..') || resolve(REPO_ROOT, candidate) !== resolve(path)) {
    throw new Error(`${label}_path_outside_repo`)
  }
}

async function resolveMockFixturePath(input) {
  const candidates = isAbsolute(input)
    ? [resolve(input)]
    : [resolve(process.cwd(), input), resolve(REPO_ROOT, input)]
  const candidate = [...new Set(candidates)].find((path) => (
    path.endsWith('.json') && isPathInside(MOCK_FIXTURE_DIR, path)
  ))
  if (!candidate) throw new Error('mock_path_outside_fixture_directory')
  ensureInsideRepo(candidate, 'mock')

  let canonicalFixtureDirectory
  let canonicalCandidate
  try {
    [canonicalFixtureDirectory, canonicalCandidate] = await Promise.all([
      realpath(MOCK_FIXTURE_DIR),
      realpath(candidate),
    ])
  } catch {
    throw new Error('mock_fixture_not_found')
  }
  if (!isPathInside(canonicalFixtureDirectory, canonicalCandidate)) {
    throw new Error('mock_path_outside_fixture_directory')
  }
  return canonicalCandidate
}

function isPathInside(directory, candidate) {
  const nestedPath = relative(directory, candidate)
  return nestedPath !== '' && nestedPath !== '..' &&
    !nestedPath.startsWith(`..${sep}`) && !isAbsolute(nestedPath)
}

function todayFromEnvOrArg(args) {
  return args.date ?? process.env.KAEL_PB_EVAL_DATE ?? new Date().toISOString().slice(0, 10)
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing_env_${name}`)
  return value
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
