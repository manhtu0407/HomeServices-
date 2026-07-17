const SCOPE_SIGNALS = new Set(['in_scope', 'out_of_scope', 'service_mismatch'])
const SCOPE_LABELS = [...SCOPE_SIGNALS]
const SUPPORTED_SERVICES = new Set([
  'electrical',
  'plumbing',
  'cleaning',
  'hvac',
  'upholstery',
  'handyman',
])
const KNOWN_PROBLEM_SLUGS = new Set([
  'breaker_trip', 'electrical-general', 'flickering_light', 'install_device',
  'other_electrical', 'outlet_or_switch_broken', 'power_outage_one_room',
  'power_outage_whole_unit', 'clogged_drain_or_sink', 'faucet_broken',
  'install_or_replace_fixture', 'other_plumbing', 'pipe_leak', 'plumbing-general',
  'toilet_flush_issue', 'weak_water_pressure', 'bathroom_deep_clean',
  'cleaning-general', 'deep_cleaning', 'kitchen_deep_clean', 'other_cleaning',
  'post_repair_cleaning', 'standard_home_cleaning', 'window_cleaning', 'error_code',
  'hvac-general', 'no_cooling', 'other_hvac', 'routine_hvac_cleaning',
  'unusual_noise', 'water_leak', 'weak_cooling', 'carpet_cleaning',
  'curtain_cleaning', 'mattress_cleaning', 'odor_or_mold', 'other_upholstery',
  'sofa_cleaning', 'stain_treatment', 'upholstery-general', 'drill_or_mount_shelf',
  'handyman-general', 'install_bathroom_fixture', 'install_curtain_rod',
  'install_small_fixture', 'mount_tv_or_furniture', 'other_handyman',
  'repair_hinge_or_handle',
])
const KNOWN_SAFETY_SIGNALS = new Set([
  'smoke_or_burning', 'sparking', 'exposed_live_parts', 'water_near_power',
  'distribution_board', 'fixed_wiring', 'protective_device', 'new_circuit',
  'uncontrolled_flow', 'flooding', 'sewage', 'hot_water_hazard', 'concealed_pipe',
  'shared_stack', 'main_supply', 'waterproofing_boundary', 'biohazard',
  'unknown_chemical', 'sharp_waste', 'heavy_mold', 'unsafe_height',
  'fragile_surface', 'specialist_floor', 'heavy_machinery', 'burning_smell',
  'refrigerant_suspected', 'unsafe_unit_access', 'repair', 'sealed_system',
  'refrigerant', 'control_board', 'bio_contamination', 'pest_evidence',
  'sensitive_occupant', 'missing_care_label', 'delicate_fabric',
  'color_transfer_risk', 'high_value_item', 'load_bearing_change',
  'concealed_electrical', 'concealed_plumbing', 'regulated_electrical',
  'regulated_plumbing', 'structural_work', 'specialist_appliance',
])
const ELECTRICAL_PROBLEM_SLUGS = new Set([
  'breaker_trip', 'electrical-general', 'flickering_light', 'install_device',
  'other_electrical', 'outlet_or_switch_broken', 'power_outage_one_room',
  'power_outage_whole_unit',
])
const IMMEDIATE_CRITICAL_SAFETY_SIGNALS = new Set([
  'smoke_or_burning', 'sparking', 'exposed_live_parts', 'water_near_power',
])
const ELECTRICAL_CAPABILITY_SAFETY_SIGNALS = new Set([
  'distribution_board', 'fixed_wiring', 'protective_device', 'new_circuit',
])
const ELECTRICAL_SAFETY_SIGNALS = new Set([
  ...IMMEDIATE_CRITICAL_SAFETY_SIGNALS,
  ...ELECTRICAL_CAPABILITY_SAFETY_SIGNALS,
])
const CORPUS_CASE_FIELDS = new Set([
  'id', 'input_text_vi', 'expected', 'difficulty', 'rationale', 'detail', 'user_turns',
])
const CORPUS_EXPECTED_FIELDS = new Set([
  'scope_signal', 'suggested_service', 'problem_slug', 'acceptable_problem_slugs',
  'needs_clarification', 'safety_signals', 'required_safety_signals',
  'forbidden_safety_signals', 'complexity',
])

export function extractIntakeObservation(response) {
  const turns = Array.isArray(response?.turns) ? response.turns : []
  const finalTurn = record(turns.at(-1))
  const source = record(finalTurn.intake_observation)
  if (Object.keys(source).length === 0) throw new Error('missing intake_observation')

  return sanitizeIntakeObservation(source)
}

export function sanitizeIntakeObservation(source) {
  const scopeSignal = requiredString(source.scope_signal, 'scope_signal')
  if (!SCOPE_SIGNALS.has(scopeSignal)) throw new Error('invalid intake_observation.scope_signal')
  const observation = {
    scope_signal: scopeSignal,
    suggested_service: nullableService(source.suggested_service),
    problem_slug: nullableIdentifier(source.problem_slug, 'problem_slug', 100),
    needs_clarification: requiredBoolean(source.needs_clarification, 'needs_clarification'),
    safety_signals: safetySignals(source.safety_signals),
    model_id: identifier(source.model_id, 'model_id', 120),
    prompt_version: identifier(source.prompt_version, 'prompt_version', 80),
    playbook_version: nullableIdentifier(source.playbook_version, 'playbook_version', 80),
  }
  assertObservationConsistency(observation)
  return observation
}

export function scorePlaybookCase(expected, observed, error) {
  if (error) {
    const fields = emptyScoreFields()
    const requiredSafety = expectedSafetySignals(expected)
    if (requiredSafety.length > 0) {
      fields.safety_signals = {
        gated: true,
        pass: false,
        expected: requiredSafety,
        observed: [],
        missing: requiredSafety,
        forbidden_observed: [],
      }
    }
    return { pass: false, error: true, fields }
  }

  const fields = {
    ...emptyScoreFields(),
    scope_signal: fieldScore(expected.scope_signal, observed.scope_signal),
  }
  if (Object.hasOwn(expected, 'suggested_service')) {
    fields.suggested_service = fieldScore(expected.suggested_service, observed.suggested_service)
  }
  if (typeof expected.needs_clarification === 'boolean') {
    fields.needs_clarification = fieldScore(
      expected.needs_clarification,
      observed.needs_clarification,
    )
  }

  const acceptedSlugs = Array.isArray(expected.acceptable_problem_slugs)
    ? expected.acceptable_problem_slugs
    : typeof expected.problem_slug === 'string'
      ? [expected.problem_slug]
      : []
  if (
    acceptedSlugs.length > 0 &&
    expected.scope_signal === 'in_scope'
  ) {
    fields.problem_slug = {
      gated: true,
      pass: acceptedSlugs.includes(observed.problem_slug),
      expected: acceptedSlugs,
      observed: observed.problem_slug,
    }
  }

  const requiredSafety = expectedSafetySignals(expected)
  const forbiddenSafety = Array.isArray(expected.forbidden_safety_signals)
    ? expected.forbidden_safety_signals
    : []
  if (requiredSafety.length > 0 || forbiddenSafety.length > 0) {
    const missing = requiredSafety.filter((signal) => !observed.safety_signals.includes(signal))
    const forbiddenObserved = forbiddenSafety.filter((signal) => observed.safety_signals.includes(signal))
    fields.safety_signals = {
      gated: true,
      pass: missing.length === 0 && forbiddenObserved.length === 0,
      expected: requiredSafety,
      observed: observed.safety_signals,
      missing,
      forbidden_observed: forbiddenObserved,
    }
  }

  return {
    pass: Object.values(fields).every((field) => !field || !field.gated || field.pass),
    error: false,
    fields,
  }
}

export function aggregatePlaybookResults(scored) {
  const passed = scored.filter((run) => run.score.pass && !run.score.error).length
  const errored = scored.filter((run) => run.score.error).length
  const routable = scored.filter((run) => (
    !run.score.error &&
    SCOPE_SIGNALS.has(run.expected.scope_signal) &&
    SCOPE_SIGNALS.has(run.observed.scope_signal)
  ))
  const confusionMatrix = emptyConfusionMatrix()
  for (const run of routable) {
    confusionMatrix[run.expected.scope_signal][run.observed.scope_signal] += 1
  }

  const perCategory = Object.fromEntries(SCOPE_LABELS.map((label) => {
    const truePositive = confusionMatrix[label][label]
    const falsePositive = SCOPE_LABELS
      .filter((candidate) => candidate !== label)
      .reduce((sum, candidate) => sum + confusionMatrix[candidate][label], 0)
    const falseNegative = SCOPE_LABELS
      .filter((candidate) => candidate !== label)
      .reduce((sum, candidate) => sum + confusionMatrix[label][candidate], 0)
    const support = truePositive + falseNegative
    if (support === 0) return [label, { precision: null, recall: null, f1: null, support }]
    const precision = ratio(truePositive, truePositive + falsePositive)
    const recall = ratio(truePositive, truePositive + falseNegative)
    const f1 = precision !== null && recall !== null && precision + recall > 0
      ? round((2 * precision * recall) / (precision + recall))
      : 0
    return [label, { precision, recall, f1, support }]
  }))

  const routingCorrect = routable.filter(
    (run) => run.expected.scope_signal === run.observed.scope_signal,
  ).length
  const validJobs = routable.filter((run) => run.expected.scope_signal === 'in_scope')
  const falseDeclines = validJobs.filter((run) => run.observed.scope_signal !== 'in_scope').length
  const supportedCategoryF1 = SCOPE_LABELS
    .map((label) => perCategory[label].f1)
    .filter((value) => value !== null)

  return {
    overall_pass_rate: ratio(passed, scored.length),
    passed,
    total: scored.length,
    errored,
    by_field: {
      scope_signal: aggregateField(scored, 'scope_signal'),
      suggested_service: aggregateField(scored, 'suggested_service'),
      needs_clarification: aggregateField(scored, 'needs_clarification'),
      problem_slug: aggregateField(scored, 'problem_slug'),
      safety_signals: aggregateField(scored, 'safety_signals'),
    },
    routing: {
      accuracy: ratio(routingCorrect, routable.length),
      macro_f1: supportedCategoryF1.length
        ? round(supportedCategoryF1.reduce((sum, value) => sum + value, 0) / supportedCategoryF1.length)
        : null,
      confusion_matrix: confusionMatrix,
      per_category: perCategory,
      false_declines: falseDeclines,
      valid_jobs: validJobs.length,
      false_decline_rate: ratio(falseDeclines, validJobs.length),
      unclassified: scored.length - routable.length,
    },
    safety: aggregateSafety(scored),
    conversation: aggregateConversation(scored),
  }
}

export function aggregateRepetitionStability(scored) {
  const groups = new Map()
  for (const run of scored) {
    if (!groups.has(run.id)) groups.set(run.id, [])
    groups.get(run.id).push(run)
  }

  const perCase = [...groups.entries()].map(([id, runs]) => {
    const signatures = new Map()
    let worstRequiredMisses = 0
    let worstImmediateCriticalMisses = 0
    let worstCapabilityMisses = 0
    let erroredRuns = 0
    for (const run of runs) {
      const signature = outcomeSignature(run)
      signatures.set(signature, (signatures.get(signature) ?? 0) + 1)
      const misses = safetyMissCounts(run)
      worstRequiredMisses = Math.max(worstRequiredMisses, misses.required)
      worstImmediateCriticalMisses = Math.max(worstImmediateCriticalMisses, misses.immediateCritical)
      worstCapabilityMisses = Math.max(worstCapabilityMisses, misses.capability)
      if (run.score.error) erroredRuns += 1
    }
    const dominantRuns = Math.max(...signatures.values())
    return {
      id,
      repetitions: runs.length,
      consistency_rate: dominantRuns / runs.length,
      fully_consistent: signatures.size === 1 && erroredRuns === 0,
      errored_runs: erroredRuns,
      worst_run_required_signal_misses: worstRequiredMisses,
      worst_run_immediate_critical_misses: worstImmediateCriticalMisses,
      worst_run_capability_misses: worstCapabilityMisses,
    }
  })
  const repetitionCounts = perCase.map((item) => item.repetitions)
  const minRepetitions = repetitionCounts.length ? Math.min(...repetitionCounts) : 0
  const maxRepetitions = repetitionCounts.length ? Math.max(...repetitionCounts) : 0
  const repetitionEvidenceAvailable = minRepetitions >= 2
  const fullyConsistentCases = perCase.filter((item) => item.fully_consistent).length
  const erroredCases = perCase.filter((item) => item.errored_runs > 0).length
  const erroredRuns = perCase.reduce((sum, item) => sum + item.errored_runs, 0)

  return {
    cases: perCase.length,
    min_repetitions: minRepetitions,
    max_repetitions: maxRepetitions,
    repetition_evidence_available: repetitionEvidenceAvailable,
    fully_consistent_cases: repetitionEvidenceAvailable ? fullyConsistentCases : null,
    fully_consistent_rate: repetitionEvidenceAvailable
      ? ratio(fullyConsistentCases, perCase.length)
      : null,
    consistency_rate: repetitionEvidenceAvailable
      ? round(perCase.reduce((sum, item) => sum + item.consistency_rate, 0) / perCase.length)
      : null,
    errored_cases: erroredCases,
    errored_runs: erroredRuns,
    worst_run_required_signal_misses: perCase.length
      ? Math.max(...perCase.map((item) => item.worst_run_required_signal_misses))
      : 0,
    worst_run_immediate_critical_misses: perCase.length
      ? Math.max(...perCase.map((item) => item.worst_run_immediate_critical_misses))
      : 0,
    worst_run_capability_misses: perCase.length
      ? Math.max(...perCase.map((item) => item.worst_run_capability_misses))
      : 0,
    cases_with_any_required_signal_miss: perCase.filter(
      (item) => item.worst_run_required_signal_misses > 0,
    ).length,
    cases_with_any_immediate_critical_miss: perCase.filter(
      (item) => item.worst_run_immediate_critical_misses > 0,
    ).length,
    cases_with_any_capability_miss: perCase.filter(
      (item) => item.worst_run_capability_misses > 0,
    ).length,
    per_case: perCase.map((item) => ({
      ...item,
      fully_consistent: item.repetitions >= 2 ? item.fully_consistent : null,
      consistency_rate: item.repetitions >= 2 ? round(item.consistency_rate) : null,
    })),
  }
}

export function createRunManifest(input) {
  const featureFlags = Object.fromEntries(
    Object.entries(record(input.feature_flags)).filter(([, value]) => typeof value === 'boolean'),
  )
  const repetitions = input.repetitions
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error('invalid manifest.repetitions')
  }
  const runMode = manifestEnum(input.run_mode, 'run_mode', ['mock', 'live'])
  const deploymentVersion = manifestIdentifier(input.deployment_version, 'deployment_version')
  const deploymentVersionSource = manifestEnum(
    input.deployment_version_source,
    'deployment_version_source',
    ['local_mock_constant', 'operator_supplied'],
  )
  if (
    runMode === 'mock' &&
    (deploymentVersion !== 'local-mock' || deploymentVersionSource !== 'local_mock_constant')
  ) {
    throw new Error('invalid manifest.mock_deployment_provenance')
  }
  if (runMode === 'live' && deploymentVersionSource !== 'operator_supplied') {
    throw new Error('invalid manifest.live_deployment_provenance')
  }

  return {
    git_sha: manifestString(input.git_sha, 'git_sha'),
    git_sha_scope: manifestEnum(input.git_sha_scope, 'git_sha_scope', ['local_base_commit']),
    deployment_version: deploymentVersion,
    deployment_version_source: deploymentVersionSource,
    deployment_attestation: manifestEnum(
      input.deployment_attestation,
      'deployment_attestation',
      ['not_performed'],
    ),
    model_id: manifestString(input.model_id, 'model_id'),
    model_ids: manifestStringArray(input.model_ids, 'model_ids'),
    provider: manifestEnum(input.provider, 'provider', ['unobserved']),
    sampling_config: manifestNull(input.sampling_config, 'sampling_config'),
    prompt_version: manifestString(input.prompt_version, 'prompt_version'),
    playbook_version: manifestNullableString(input.playbook_version, 'playbook_version'),
    observed_playbook_state: manifestEnum(
      input.observed_playbook_state,
      'observed_playbook_state',
      ['on', 'off', 'unobserved'],
    ),
    playbook_hash: manifestHash(input.playbook_hash, 'playbook_hash'),
    playbook_hash_scope: manifestEnum(
      input.playbook_hash_scope,
      'playbook_hash_scope',
      ['full_local_source_file'],
    ),
    playbook_source_path: manifestRepoPath(input.playbook_source_path, 'playbook_source_path'),
    source_tree_hash: manifestHash(input.source_tree_hash, 'source_tree_hash'),
    source_scope: manifestEnum(input.source_scope, 'source_scope', ['local_curated_source_set']),
    source_files: manifestRepoPathArray(input.source_files, 'source_files'),
    source_hash_algorithm: manifestEnum(
      input.source_hash_algorithm,
      'source_hash_algorithm',
      ['sha256_path_and_file_sha256_v1'],
    ),
    source_state: manifestEnum(
      input.source_state,
      'source_state',
      ['clean_commit', 'base_sha_with_uncommitted_sources'],
    ),
    fixture_hash: manifestNullableHash(input.fixture_hash, 'fixture_hash'),
    selected_case_hash: manifestHash(input.selected_case_hash, 'selected_case_hash'),
    corpus_path: manifestRepoPath(input.corpus_path, 'corpus_path'),
    feature_flags: featureFlags,
    corpus_version: manifestString(input.corpus_version, 'corpus_version'),
    run_mode: runMode,
    started_at: manifestString(input.started_at, 'started_at'),
    repetitions,
    repetition_strategy: manifestString(input.repetition_strategy, 'repetition_strategy'),
    run_config: sanitizeRunConfig(input.run_config),
  }
}

export function buildSanitizedRawArtifact(manifestInput, runs) {
  const manifest = createRunManifest(manifestInput)
  const recordsTiming = manifest.run_mode === 'live'
  return {
    manifest,
    observations: runs.map((run) => ({
      id: artifactString(run.id, 'id'),
      repetition: positiveInteger(run.repetition, 'repetition'),
      turns: recordsTiming ? nonNegativeInteger(run.turns, 'turns') : null,
      clarification_turns: recordsTiming
        ? nonNegativeInteger(run.clarificationTurns ?? 0, 'clarification_turns')
        : null,
      latency_ms: recordsTiming ? nonNegativeNumber(run.latency_ms, 'latency_ms') : null,
      observation: sanitizeOptionalObservation(run.observed),
      final_observation: sanitizeOptionalObservation(run.finalObserved ?? run.observed),
      error_code: safeErrorCode(run.error),
    })),
  }
}

export function normalizeEvalEvidenceForRunMode(runMode, metrics, stability) {
  if (!['mock', 'live'].includes(runMode)) throw new Error('invalid run mode')
  if (runMode === 'live') return { metrics, stability }
  return {
    metrics: {
      ...metrics,
      conversation: {
        ...metrics.conversation,
        average_turns: null,
        latency_ms_p50: null,
        latency_ms_p95: null,
      },
    },
    stability: {
      ...stability,
      repetition_evidence_available: false,
      fully_consistent_cases: null,
      fully_consistent_rate: null,
      consistency_rate: null,
      per_case: stability.per_case.map((item) => ({
        ...item,
        fully_consistent: null,
        consistency_rate: null,
      })),
    },
  }
}

export function validatePlaybookCorpus(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('corpus must be a non-empty array')
  }
  const ids = new Set()
  for (const candidate of value) {
    const testCase = record(candidate)
    assertOnlyFields(testCase, CORPUS_CASE_FIELDS, 'unknown corpus case field')
    const id = artifactString(testCase.id, 'corpus_case_id')
    if (ids.has(id)) throw new Error(`duplicate corpus case id: ${id}`)
    ids.add(id)
    boundedCorpusString(testCase.input_text_vi, 'input_text_vi', 5000)
    boundedCorpusString(testCase.rationale, 'rationale', 2000)
    if (Object.hasOwn(testCase, 'detail')) boundedCorpusString(testCase.detail, 'detail', 5000)
    if (!['easy', 'medium', 'hard'].includes(testCase.difficulty)) {
      throw new Error(`invalid corpus difficulty: ${id}`)
    }
    validateCorpusExpected(testCase.expected, id)
    validateCorpusUserTurns(testCase.user_turns, id)
  }
  return value
}

export function requestedSlotsFromResponse(response) {
  const turns = Array.isArray(response?.turns) ? response.turns : []
  const clarification = record(record(turns.at(-1)).clarification)
  const slots = Array.isArray(clarification.missing_slots)
    ? clarification.missing_slots.filter((slot) => typeof slot === 'string' && slot.length > 0)
    : []
  return [...new Set(slots)]
}

export function selectUserTurn(testCase, requestedSlots, usedIndexes = []) {
  const turns = Array.isArray(testCase?.user_turns) ? testCase.user_turns : []
  const requested = new Set(
    Array.isArray(requestedSlots) ? requestedSlots.filter((slot) => typeof slot === 'string') : [],
  )
  const used = new Set(usedIndexes)
  for (let index = 0; index < turns.length; index += 1) {
    if (used.has(index)) continue
    const turn = record(turns[index])
    if (typeof turn.when_asked_for !== 'string' || !requested.has(turn.when_asked_for)) continue
    const reply = typeof turn.reply === 'string' && turn.reply.length > 0 ? turn.reply : null
    const fixture = typeof turn.fixture === 'string' && turn.fixture.length > 0 ? turn.fixture : null
    if (!reply && !fixture) continue
    return { index, when_asked_for: turn.when_asked_for, reply, fixture }
  }
  return null
}

export function resolveRetryWaitSeconds(retryAfterHeader, minimumSeconds) {
  if (!Number.isInteger(minimumSeconds) || minimumSeconds < 0 || minimumSeconds > 3600) {
    throw new Error('invalid_retry_wait_seconds')
  }
  if (retryAfterHeader === null || retryAfterHeader === undefined) return minimumSeconds
  const normalized = String(retryAfterHeader).trim()
  if (!/^\d+$/.test(normalized)) throw new Error('invalid_retry_after')
  const retryAfterSeconds = Number(normalized)
  if (!Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds > 3600) {
    throw new Error('retry_after_exceeds_max_3600_seconds')
  }
  return Math.max(retryAfterSeconds, minimumSeconds)
}

export function validateEvalDistrict(value) {
  const districts = new Set([
    'q1', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q10', 'q11', 'q12',
    'binh_thanh', 'thu_duc', 'tan_binh', 'go_vap', 'phu_nhuan', 'binh_tan',
    'tan_phu', 'hoc_mon', 'binh_chanh', 'cu_chi', 'nha_be', 'can_gio',
  ])
  if (typeof value !== 'string' || !districts.has(value)) throw new Error('invalid_eval_district')
  return value
}

export function validateStagingEvalTargets(mobileApiUrl, supabaseUrl, stagingProjectRef) {
  if (!/^[a-z]{20}$/.test(stagingProjectRef)) throw new Error('invalid_staging_project_ref')
  const expectedHost = `${stagingProjectRef}.supabase.co`
  const api = validatedHttpsUrl(mobileApiUrl, 'mobile_api')
  if (api.hostname !== expectedHost || api.pathname.replace(/\/+$/, '') !== '/functions/v1/mobile-api') {
    throw new Error('unapproved_mobile_api_target')
  }
  let normalizedSupabaseUrl = null
  if (supabaseUrl) {
    const supabase = validatedHttpsUrl(supabaseUrl, 'supabase')
    if (supabase.hostname !== expectedHost || supabase.pathname.replace(/\/+$/, '') !== '') {
      throw new Error('unapproved_supabase_target')
    }
    normalizedSupabaseUrl = supabase.toString().replace(/\/$/, '')
  }
  return { mobileApiUrl: api.toString().replace(/\/$/, ''), supabaseUrl: normalizedSupabaseUrl }
}

function emptyScoreFields() {
  return {
    scope_signal: null,
    suggested_service: null,
    needs_clarification: null,
    problem_slug: null,
    safety_signals: null,
  }
}

function outcomeSignature(run) {
  if (run.score.error) return 'error'
  const observation = run.observed
  return JSON.stringify([
    observation.scope_signal,
    observation.suggested_service,
    observation.problem_slug,
    observation.needs_clarification,
    [...observation.safety_signals].sort(),
  ])
}

function emptyConfusionMatrix() {
  return Object.fromEntries(SCOPE_LABELS.map((expected) => [
    expected,
    Object.fromEntries(SCOPE_LABELS.map((observed) => [observed, 0])),
  ]))
}

function aggregateField(scored, name) {
  const rows = scored
    .map((run) => run.score.fields[name])
    .filter((field) => field?.gated)
  const passed = rows.filter((field) => field.pass).length
  return { gated_cases: rows.length, passed, rate: ratio(passed, rows.length) }
}

function aggregateSafety(scored) {
  const bySignal = new Map()
  const totals = {
    required: { expected: 0, observed: 0 },
    immediate_critical: { expected: 0, observed: 0 },
    capability: { expected: 0, observed: 0 },
  }
  let falsePositives = 0
  let forbiddenChecks = 0
  for (const run of scored) {
    const required = expectedSafetySignals(run.expected)
    const forbidden = [...new Set(
      Array.isArray(run.expected.forbidden_safety_signals)
        ? run.expected.forbidden_safety_signals
        : [],
    )]
    for (const signal of required) {
      const kind = safetySignalKind(signal)
      const current = bySignal.get(signal) ?? { kind, expected: 0, observed: 0 }
      current.expected += 1
      totals.required.expected += 1
      if (kind !== 'required') totals[kind].expected += 1
      if (!run.score.error && run.observed.safety_signals.includes(signal)) {
        current.observed += 1
        totals.required.observed += 1
        if (kind !== 'required') totals[kind].observed += 1
      }
      bySignal.set(signal, current)
    }
    for (const signal of forbidden) {
      if (run.score.error) continue
      forbiddenChecks += 1
      if (run.observed.safety_signals.includes(signal)) falsePositives += 1
    }
  }

  return {
    expected_required_signals: totals.required.expected,
    observed_required_signals: totals.required.observed,
    required_signal_misses: totals.required.expected - totals.required.observed,
    required_signal_recall: ratio(totals.required.observed, totals.required.expected),
    expected_immediate_critical_signals: totals.immediate_critical.expected,
    observed_immediate_critical_signals: totals.immediate_critical.observed,
    immediate_critical_misses:
      totals.immediate_critical.expected - totals.immediate_critical.observed,
    immediate_critical_recall: ratio(
      totals.immediate_critical.observed,
      totals.immediate_critical.expected,
    ),
    expected_capability_signals: totals.capability.expected,
    observed_capability_signals: totals.capability.observed,
    capability_misses: totals.capability.expected - totals.capability.observed,
    capability_recall: ratio(totals.capability.observed, totals.capability.expected),
    forbidden_signal_checks: forbiddenChecks,
    false_positives: falsePositives,
    false_positive_rate: ratio(falsePositives, forbiddenChecks),
    by_signal: Object.fromEntries([...bySignal.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([signal, counts]) => [signal, {
        ...counts,
        recall: ratio(counts.observed, counts.expected),
      }])),
  }
}

function safetyMissCounts(run) {
  const missing = run.score.fields.safety_signals?.missing ?? []
  return {
    required: missing.length,
    immediateCritical: missing.filter(
      (signal) => safetySignalKind(signal) === 'immediate_critical',
    ).length,
    capability: missing.filter((signal) => safetySignalKind(signal) === 'capability').length,
  }
}

function safetySignalKind(signal) {
  if (IMMEDIATE_CRITICAL_SAFETY_SIGNALS.has(signal)) return 'immediate_critical'
  if (ELECTRICAL_CAPABILITY_SAFETY_SIGNALS.has(signal)) return 'capability'
  return 'required'
}

function fieldScore(expected, observed) {
  return { gated: true, pass: observed === expected, expected, observed }
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function requiredString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`invalid intake_observation.${field}`)
  }
  return value
}

function requiredBoolean(value, field) {
  if (typeof value !== 'boolean') throw new Error(`invalid intake_observation.${field}`)
  return value
}

function nullableService(value) {
  if (value === null) return null
  if (typeof value !== 'string' || !SUPPORTED_SERVICES.has(value)) {
    throw new Error('invalid intake_observation.suggested_service')
  }
  return value
}

function nullableIdentifier(value, field, maxLength) {
  if (value === null) return null
  if (field === 'problem_slug' && !KNOWN_PROBLEM_SLUGS.has(value)) {
    throw new Error('invalid intake_observation.problem_slug')
  }
  return identifier(value, field, maxLength)
}

function identifier(value, field, maxLength) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    !/^[a-z0-9._:/-]+$/i.test(value)
  ) {
    throw new Error(`invalid intake_observation.${field}`)
  }
  return value
}

function safetySignals(value) {
  if (!Array.isArray(value)) throw new Error('invalid intake_observation.safety_signals')
  const unique = [...new Set(value)]
  if (
    unique.length > 8 ||
    unique.some((signal) => (
      typeof signal !== 'string' ||
      signal.length === 0 ||
      signal.length > 80 ||
      !KNOWN_SAFETY_SIGNALS.has(signal)
    ))
  ) {
    throw new Error('invalid intake_observation.safety_signals')
  }
  return unique
}

function assertObservationConsistency(observation) {
  const inScope = observation.scope_signal === 'in_scope'
  const mismatch = observation.scope_signal === 'service_mismatch'
  const consistent = inScope
    ? observation.suggested_service === null && observation.problem_slug !== null
    : mismatch
      ? observation.suggested_service !== null &&
        observation.problem_slug === null &&
        !observation.needs_clarification
      : observation.suggested_service === null &&
        observation.problem_slug === null &&
        !observation.needs_clarification
  if (!consistent) throw new Error('inconsistent intake_observation')
}

function manifestString(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`invalid manifest.${field}`)
  return value
}

function manifestIdentifier(value, field) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 120 ||
    !/^[a-z0-9][a-z0-9._:/-]*$/i.test(value)
  ) {
    throw new Error(`invalid manifest.${field}`)
  }
  return value
}

function manifestNullableString(value, field) {
  if (value === null) return null
  return manifestString(value, field)
}

function manifestNull(value, field) {
  if (value !== null) throw new Error(`invalid manifest.${field}`)
  return null
}

function manifestHash(value, field) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`invalid manifest.${field}`)
  }
  return value
}

function manifestNullableHash(value, field) {
  if (value === null) return null
  return manifestHash(value, field)
}

function manifestRepoPath(value, field) {
  const path = manifestString(value, field)
  if (
    path.includes('\\') || path.startsWith('/') || /^[a-z]:/i.test(path) ||
    path.split('/').some((part) => part === '..' || part.length === 0) ||
    !/^[a-z0-9._/-]+$/i.test(path)
  ) {
    throw new Error(`invalid manifest.${field}`)
  }
  return path
}

function manifestRepoPathArray(value, field) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error(`invalid manifest.${field}`)
  }
  const paths = value.map((path) => manifestRepoPath(path, field))
  if (new Set(paths).size !== paths.length) throw new Error(`invalid manifest.${field}`)
  return paths
}

function manifestStringArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`invalid manifest.${field}`)
  }
  return [...new Set(value)]
}

function manifestEnum(value, field, allowed) {
  if (!allowed.includes(value)) throw new Error(`invalid manifest.${field}`)
  return value
}

function validateCorpusExpected(value, id) {
  const expected = record(value)
  assertOnlyFields(expected, CORPUS_EXPECTED_FIELDS, `unknown corpus expected field: ${id}`)
  for (const field of [
    'scope_signal', 'suggested_service', 'needs_clarification', 'complexity',
  ]) {
    if (!Object.hasOwn(expected, field)) throw new Error(`missing corpus expected.${field}: ${id}`)
  }
  if (
    !Object.hasOwn(expected, 'problem_slug') &&
    !Object.hasOwn(expected, 'acceptable_problem_slugs')
  ) {
    throw new Error(`missing corpus expected.problem_slug: ${id}`)
  }
  if (!Object.hasOwn(expected, 'safety_signals') && !Object.hasOwn(expected, 'required_safety_signals')) {
    throw new Error(`missing corpus expected.safety_signals: ${id}`)
  }
  if (
    Object.hasOwn(expected, 'safety_signals') &&
    Object.hasOwn(expected, 'required_safety_signals')
  ) {
    throw new Error(`ambiguous corpus expected.safety_signals: ${id}`)
  }
  if (!SCOPE_SIGNALS.has(expected.scope_signal)) {
    throw new Error(`invalid corpus expected.scope_signal: ${id}`)
  }
  if (
    expected.suggested_service !== null &&
    (typeof expected.suggested_service !== 'string' || !SUPPORTED_SERVICES.has(expected.suggested_service))
  ) {
    throw new Error(`invalid corpus expected.suggested_service: ${id}`)
  }
  const mismatch = expected.scope_signal === 'service_mismatch'
  if (
    (mismatch && (expected.suggested_service === null || expected.suggested_service === 'electrical')) ||
    (!mismatch && expected.suggested_service !== null)
  ) {
    throw new Error(`inconsistent corpus expected.suggested_service: ${id}`)
  }
  const problemSlug = Object.hasOwn(expected, 'problem_slug') ? expected.problem_slug : null
  if (
    problemSlug !== null &&
    (typeof problemSlug !== 'string' || !ELECTRICAL_PROBLEM_SLUGS.has(problemSlug))
  ) {
    throw new Error(`invalid corpus expected.problem_slug: ${id}`)
  }
  const acceptableSlugs = Object.hasOwn(expected, 'acceptable_problem_slugs')
    ? corpusIdentifierArray(
      expected.acceptable_problem_slugs,
      ELECTRICAL_PROBLEM_SLUGS,
      'acceptable_problem_slugs',
      id,
    )
    : []
  if (problemSlug !== null && acceptableSlugs.length > 0) {
    throw new Error(`ambiguous corpus expected.problem_slug: ${id}`)
  }
  if (
    expected.scope_signal === 'in_scope' &&
    problemSlug === null &&
    acceptableSlugs.length === 0
  ) {
    throw new Error(`missing corpus expected.problem_slug: ${id}`)
  }
  if (expected.scope_signal !== 'in_scope' && (problemSlug !== null || acceptableSlugs.length > 0)) {
    throw new Error(`inconsistent corpus expected.problem_slug: ${id}`)
  }
  if (typeof expected.needs_clarification !== 'boolean') {
    throw new Error(`invalid corpus expected.needs_clarification: ${id}`)
  }
  if (expected.scope_signal !== 'in_scope' && expected.needs_clarification) {
    throw new Error(`inconsistent corpus expected.needs_clarification: ${id}`)
  }
  if (expected.complexity !== null && !['small', 'medium', 'large'].includes(expected.complexity)) {
    throw new Error(`invalid corpus expected.complexity: ${id}`)
  }
  const requiredField = Object.hasOwn(expected, 'required_safety_signals')
    ? 'required_safety_signals'
    : 'safety_signals'
  const required = corpusIdentifierArray(
    expected[requiredField],
    ELECTRICAL_SAFETY_SIGNALS,
    requiredField,
    id,
  )
  const forbidden = Object.hasOwn(expected, 'forbidden_safety_signals')
    ? corpusIdentifierArray(
      expected.forbidden_safety_signals,
      ELECTRICAL_SAFETY_SIGNALS,
      'forbidden_safety_signals',
      id,
    )
    : []
  if (required.some((signal) => forbidden.includes(signal))) {
    throw new Error(`overlapping corpus safety signals: ${id}`)
  }
}

function validateCorpusUserTurns(value, id) {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length > 8) throw new Error(`invalid corpus user_turns: ${id}`)
  for (const candidate of value) {
    const turn = record(candidate)
    assertOnlyFields(
      turn,
      new Set(['when_asked_for', 'reply', 'fixture']),
      `unknown corpus user_turn field: ${id}`,
    )
    if (typeof turn.when_asked_for !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(turn.when_asked_for)) {
      throw new Error(`invalid corpus user_turn.when_asked_for: ${id}`)
    }
    const hasReply = Object.hasOwn(turn, 'reply')
    const hasFixture = Object.hasOwn(turn, 'fixture')
    if (hasReply) boundedCorpusString(turn.reply, 'user_turn.reply', 2000)
    if (hasFixture) manifestRepoPath(turn.fixture, 'user_turn.fixture')
    if (hasReply === hasFixture) throw new Error(`invalid corpus user_turn payload: ${id}`)
  }
}

function corpusIdentifierArray(value, allowed, field, id) {
  if (!Array.isArray(value) || value.length > 8 || new Set(value).size !== value.length) {
    throw new Error(`invalid corpus expected.${field}: ${id}`)
  }
  if (value.some((item) => typeof item !== 'string' || !allowed.has(item))) {
    throw new Error(`invalid corpus expected.${field}: ${id}`)
  }
  return value
}

function boundedCorpusString(value, field, maxLength) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`invalid corpus ${field}`)
  }
}

function assertOnlyFields(value, allowed, message) {
  if (Object.keys(value).some((field) => !allowed.has(field))) throw new Error(message)
}

function artifactString(value, field) {
  if (typeof value !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(value)) {
    throw new Error(`invalid artifact.${field}`)
  }
  return value
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`invalid artifact.${field}`)
  return value
}

function nonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`invalid artifact.${field}`)
  return value
}

function nonNegativeNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid artifact.${field}`)
  }
  return value
}

function safeErrorCode(error) {
  if (!error) return null
  const message = error instanceof Error ? error.message : String(error)
  const httpCode = message.trim().match(/^(http_[1-5][0-9]{2})(?::|\s|$)/i)?.[1]
  if (httpCode) return httpCode.toLowerCase()
  if (message === 'missing intake_observation') return 'missing_intake_observation'
  if (message.startsWith('invalid intake_observation.')) return 'invalid_intake_observation'
  return 'runner_error'
}

function sanitizeOptionalObservation(value) {
  const source = record(value)
  return Object.keys(source).length > 0 ? sanitizeIntakeObservation(source) : null
}

function expectedSafetySignals(expected) {
  return [...new Set(
    Array.isArray(expected.required_safety_signals)
      ? expected.required_safety_signals
      : Array.isArray(expected.safety_signals)
        ? expected.safety_signals
        : [],
  )]
}

function aggregateConversation(scored) {
  const turns = scored.map((run) => run.turns).filter(Number.isFinite)
  const latencies = scored.map((run) => run.latency_ms).filter(Number.isFinite).sort((a, b) => a - b)
  const clarificationObservations = scored
    .filter((run) => !run.error && (
      Number.isInteger(run.clarificationTurns) ||
      typeof run.observed?.needs_clarification === 'boolean'
    ))
    .map((run) => Number.isInteger(run.clarificationTurns)
      ? run.clarificationTurns > 0
      : run.observed.needs_clarification)
  return {
    average_turns: turns.length ? round(turns.reduce((sum, value) => sum + value, 0) / turns.length) : null,
    clarification_rate: ratio(
      clarificationObservations.filter(Boolean).length,
      clarificationObservations.length,
    ),
    latency_ms_p50: percentile(latencies, 0.5),
    latency_ms_p95: percentile(latencies, 0.95),
  }
}

function percentile(values, quantile) {
  if (values.length === 0) return null
  return values[Math.ceil(values.length * quantile) - 1]
}

function sanitizeRunConfig(value) {
  const source = record(value)
  const output = {}
  for (const key of ['offset', 'limit', 'max_turns', 'retry_wait_seconds', 'timeout_seconds']) {
    const candidate = source[key]
    if (candidate === null || (Number.isFinite(candidate) && candidate >= 0)) output[key] = candidate
  }
  if (typeof source.district === 'string' && /^[a-z0-9_]{1,40}$/.test(source.district)) {
    output.district = source.district
  }
  if (typeof source.allow_failures === 'boolean') output.allow_failures = source.allow_failures
  return output
}

function validatedHttpsUrl(value, label) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`invalid_${label}_url`)
  }
  if (
    parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search ||
    parsed.hash || (parsed.port && parsed.port !== '443')
  ) {
    throw new Error(`invalid_${label}_url`)
  }
  return parsed
}

function ratio(numerator, denominator) {
  return denominator > 0 ? round(numerator / denominator) : null
}

function round(value, places = 4) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}
