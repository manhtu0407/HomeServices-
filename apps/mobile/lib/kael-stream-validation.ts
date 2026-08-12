import {
  KAEL_PERFORMANCE_PROFILE_IDS,
  SERVICE_TYPES as CANONICAL_SERVICE_TYPES,
} from '@nestscout/shared'

import type {
  CustomerKaelConversationResponse,
  KaelChatProgress,
  KaelChatResponse,
  WorkerKaelChatResponse,
} from './api-types'

const KAEL_PROGRESS_STAGES = new Set<KaelChatProgress['current_stage']>([
  'intent_classification',
  'vision_analysis',
  'clarification',
  'problem_synthesis',
  'market_lookup',
  'price_synthesis',
  'advisory_generation',
  'worker_brief',
  'worker_assist',
  'scope_change',
  'scope_reviewing',
  'scope_estimating',
  'post_job_learning',
  'educational_response',
])

const SERVICE_TYPES = new Set<string>(CANONICAL_SERVICE_TYPES)
const CUSTOMER_CONVERSATION_MODES = new Set(['normal', 'case'])
const CUSTOMER_CONVERSATION_TURN_ROLES = new Set(['customer', 'kael', 'system'])
const KAEL_PERFORMANCE_PROFILES = new Set<string>(KAEL_PERFORMANCE_PROFILE_IDS)
const CUSTOMER_SESSION_STATUSES = new Set(['active', 'collecting_evidence', 'estimate_ready', 'confirmed', 'abandoned', 'unsupported'])
const CUSTOMER_CASE_PHASES = new Set([
  'analysis', 'offer_review', 'matching', 'worker_candidate_review', 'worker_en_route',
  'service_execution', 'scope_change_review', 'completion_review', 'payment', 'review', 'closed',
])
const CUSTOMER_NEXT_ACTIONS = new Set([
  'await_input', 'collect_evidence', 'ask_photo', 'ask_video', 'estimate_ready',
  'unsupported', 'budget_exceeded', 'confirmed', 'ask_question', 'request_evidence',
])
const CUSTOMER_TURN_ROLES = new Set(['customer', 'kael', 'system'])
const CUSTOMER_TURN_TYPES = new Set([
  'text', 'photo_request', 'video_request', 'photo_attached', 'video_attached',
  'clarification', 'analysis', 'estimate', 'error',
])
const WORKER_SESSION_STATUSES = new Set(['active', 'closed', 'escalated', 'error'])
const WORKER_TURN_ROLES = new Set(['worker', 'kael', 'system'])
const WORKER_TURN_TYPES = new Set(['text', 'clarification', 'guidance', 'photo_request', 'photo_attached', 'error'])
const COMPLEXITY_LEVELS = new Set(['small', 'medium', 'large'])
const PRICE_REASONING_COMPONENT_KINDS = new Set([
  'service_package', 'labor', 'travel', 'materials', 'replacement_parts', 'equipment', 'other',
])
const PRICE_REASONING_COMPONENT_STATUSES = new Set([
  'priced', 'included_unitemized', 'conditional_unpriced', 'excluded', 'undetermined',
])
const PRICE_REASONING_CAUSE_BASIS = new Set([
  'customer_report', 'visual_evidence', 'service_profile', 'knowledge',
])
const PRICE_REASONING_SOURCES = new Set([
  'perplexity_validated', 'baseline_with_market', 'baseline_only', 'inspection_required',
])
const PRICE_REASONING_CONFIDENCE = new Set(['low', 'medium', 'high'])

export function isKaelProgressStatus(status: string): status is KaelChatProgress['status'] {
  return status === 'queued' || status === 'running' || status === 'completed' || status === 'failed'
}

export function isKaelProgressStage(stage: string): stage is KaelChatProgress['current_stage'] {
  return (KAEL_PROGRESS_STAGES as ReadonlySet<string>).has(stage)
}

export function safeParseObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function isCustomerKaelConversationStreamResult(
  value: unknown,
): value is CustomerKaelConversationResponse {
  const response = asRecord(value)
  const session = asRecord(response?.session)
  const turns = response?.turns
  if (!response || !session || !Array.isArray(turns) || turns.length > 500) return false
  if (
    !isBoundedString(session.id, 160) ||
    !isEnumString(session.mode, CUSTOMER_CONVERSATION_MODES) ||
    !isBoundedString(session.customer_id, 160) ||
    !isNullableBoundedString(session.case_job_id, 160) ||
    !isNullableBoundedString(session.case_session_id, 160) ||
    !isBoundedString(session.client_request_id, 160) ||
    !isNullableBoundedString(session.title, 64) ||
    !isNullableBoundedString(session.pinned_at, 64) ||
    !isNullableEnumString(session.profile_id, KAEL_PERFORMANCE_PROFILES) ||
    !isNullableEnumString(session.service_type, SERVICE_TYPES) ||
    !isBoundedString(session.started_at, 64) ||
    !isBoundedString(session.updated_at, 64) ||
    !isNonNegativeInteger(session.total_turns) ||
    session.total_turns !== turns.length
  ) return false
  return turns.every(isCustomerConversationTurn)
}

export function isCustomerKaelStreamResult(value: unknown): value is KaelChatResponse {
  const response = asRecord(value)
  const session = asRecord(response?.session)
  const turns = response?.turns
  if (!response || !session || !Array.isArray(turns) || turns.length > 500) return false
  if (
    !isBoundedString(session.id, 160) || !isNullableBoundedString(session.job_id, 160) ||
    !isBoundedString(session.customer_id, 160) || !isEnumString(session.service_type, SERVICE_TYPES) ||
    !isEnumString(session.status, CUSTOMER_SESSION_STATUSES) ||
    !isEnumString(session.case_phase, CUSTOMER_CASE_PHASES) ||
    !isNullableRecord(session.diagnosis_scope) || !isNullableBoundedString(session.scheduled_at, 64) ||
    !isNullableEstimate(session.estimate) || !isBoundedString(session.started_at, 64) ||
    !isNullableBoundedString(session.estimate_ready_at, 64) || !isNonNegativeInteger(session.total_turns) ||
    !isFiniteRange(session.total_cost_usd, 0, Number.MAX_SAFE_INTEGER) ||
    !isEnumString(session.next_action, CUSTOMER_NEXT_ACTIONS)
  ) return false
  return turns.every(isCustomerTurn)
}

export function isWorkerKaelStreamResult(value: unknown): value is WorkerKaelChatResponse {
  const response = asRecord(value)
  const session = asRecord(response?.session)
  const turns = response?.turns
  if (!response || !session || !Array.isArray(turns) || turns.length > 500) return false
  if (
    !isBoundedString(session.id, 160) || !isBoundedString(session.job_id, 160) ||
    !isBoundedString(session.worker_id, 160) || !isEnumString(session.status, WORKER_SESSION_STATUSES) ||
    !isBoundedString(session.started_at, 64) || !isNullableBoundedString(session.closed_at, 64) ||
    !isNonNegativeInteger(session.total_turns) || !isNullableProgress(session.progress)
  ) return false
  return turns.every(isWorkerTurn)
}

function isCustomerConversationTurn(value: unknown): boolean {
  const turn = asRecord(value)
  return Boolean(turn) &&
    isBoundedString(turn?.id, 160) &&
    isBoundedString(turn?.conversation_id, 160) &&
    isOptionalNullableBoundedString(turn?.client_request_id, 160) &&
    isNonNegativeInteger(turn?.turn_index) &&
    isEnumString(turn?.role, CUSTOMER_CONVERSATION_TURN_ROLES) &&
    isBoundedString(turn?.text_content, 12_000) &&
    isBoundedString(turn?.created_at, 64)
}

function isCustomerTurn(value: unknown): boolean {
  const turn = asRecord(value)
  if (!turn) return false
  const clarification = turn.clarification
  return isBoundedString(turn.id, 160) && isBoundedString(turn.session_id, 160) &&
    isNonNegativeInteger(turn.turn_index) && isEnumString(turn.role, CUSTOMER_TURN_ROLES) &&
    isEnumString(turn.content_type, CUSTOMER_TURN_TYPES) && isNullableBoundedString(turn.text_content, 12_000) &&
    isBoundedStringArray(turn.media_refs, 16, 1_000) && isNullableEstimate(turn.estimate) &&
    (clarification === undefined || clarification === null || isClarification(clarification)) &&
    isBoundedString(turn.created_at, 64)
}

function isWorkerTurn(value: unknown): boolean {
  const turn = asRecord(value)
  return Boolean(turn) && isBoundedString(turn?.id, 160) && isBoundedString(turn?.session_id, 160) &&
    isNonNegativeInteger(turn?.turn_index) && isEnumString(turn?.role, WORKER_TURN_ROLES) &&
    isEnumString(turn?.content_type, WORKER_TURN_TYPES) && isNullableBoundedString(turn?.text_content, 12_000) &&
    isBoundedStringArray(turn?.media_refs, 16, 1_000) && isBoundedStringArray(turn?.safety_notes, 32, 1_000) &&
    isBoundedString(turn?.created_at, 64)
}

function isClarification(value: unknown): boolean {
  const clarification = asRecord(value)
  return Boolean(clarification) && isNullableBoundedString(clarification?.question, 2_000) &&
    isBoundedStringArray(clarification?.missing_slots, 64, 160)
}

function isNullableEstimate(value: unknown): boolean {
  if (value === null) return true
  const estimate = asRecord(value)
  if (!estimate) return false
  return isEnumString(estimate.service_type, SERVICE_TYPES) &&
    isBoundedString(estimate.problem_category, 160) && isBoundedString(estimate.problem_summary, 2_000) &&
    isEnumString(estimate.complexity, COMPLEXITY_LEVELS) &&
    isFiniteRange(estimate.price_min, 0, Number.MAX_SAFE_INTEGER) &&
    isFiniteRange(estimate.price_max, Number(estimate.price_min), Number.MAX_SAFE_INTEGER) &&
    isFiniteRange(estimate.confidence, 0, 1) && isNullableBoundedString(estimate.advisory, 4_000) &&
    isBoundedString(estimate.disclaimer, 2_000) &&
    (estimate.needs_inspection === undefined || typeof estimate.needs_inspection === 'boolean') &&
    (estimate.price_source === undefined || isNullableBoundedString(estimate.price_source, 160)) &&
    (estimate.complexity_reasoning === undefined || isNullableBoundedString(estimate.complexity_reasoning, 2_000)) &&
    (estimate.needs_inspection_reason === undefined || isNullableBoundedString(estimate.needs_inspection_reason, 2_000)) &&
    (estimate.market_signals === undefined || isNullableBoundedString(estimate.market_signals, 2_000)) &&
    isOptionalNullableAnalysisReceipt(estimate.analysis_receipt) &&
    isOptionalNullablePriceReasoningReceipt(
      estimate.price_reasoning_receipt,
      Number(estimate.price_min),
      Number(estimate.price_max),
    )
}

function isOptionalNullableAnalysisReceipt(value: unknown): boolean {
  if (value === undefined || value === null) return true
  const receipt = asRecord(value)
  const evidence = asRecord(receipt?.evidence)
  const market = asRecord(receipt?.market)
  if (
    receipt?.schema_version !== 'analysis_receipt.v1' ||
    !evidence ||
    !isNonNegativeInteger(evidence.photo_count) ||
    !isNonNegativeInteger(evidence.video_frame_count) ||
    !isNonNegativeInteger(evidence.voice_transcript_count) ||
    !(evidence.analysis_status === undefined || isEnumString(
      evidence.analysis_status,
      new Set(['analyzed', 'not_provided', 'unavailable']),
    )) ||
    typeof evidence.skipped !== 'boolean' ||
    !market ||
    !(market.accepted_source_count === null || isNonNegativeInteger(market.accepted_source_count)) ||
    !(market.high_trust_source_count === null || isNonNegativeInteger(market.high_trust_source_count)) ||
    !(market.quorum_met === null || typeof market.quorum_met === 'boolean')
  ) return false

  if (!isOptionalAnalysisReceiptFindings(
    evidence.findings,
    Number(evidence.photo_count),
    Number(evidence.video_frame_count),
    evidence.skipped,
  )) return false

  if (
    evidence.analysis_status !== undefined &&
    evidence.analysis_status !== 'analyzed' &&
    Array.isArray(evidence.findings) &&
    evidence.findings.length > 0
  ) return false
  if (evidence.skipped && evidence.analysis_status !== undefined && evidence.analysis_status !== 'not_provided') {
    return false
  }

  return isOptionalAnalysisReceiptProblem(receipt.problem)
}

function isOptionalAnalysisReceiptFindings(
  value: unknown,
  photoCount: number,
  videoFrameCount: number,
  skipped: boolean,
): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length > 5 || (skipped && value.length > 0)) return false
  const seen = new Set<string>()
  return value.every((item) => {
    const finding = asRecord(item)
    if (
      !finding ||
      !isEnumString(finding.confidence, new Set(['low', 'medium', 'high'])) ||
      !Number.isSafeInteger(finding.evidence_index) ||
      Number(finding.evidence_index) < 1 ||
      !isEnumString(finding.evidence_kind, new Set(['photo', 'video_frame'])) ||
      !isBoundedString(finding.observation, 240) ||
      !isNullableBoundedString(finding.possible_meaning, 240)
    ) return false
    const evidenceIndex = Number(finding.evidence_index)
    const availableCount = finding.evidence_kind === 'photo' ? photoCount : videoFrameCount
    const key = `${finding.evidence_kind}:${evidenceIndex}`
    if (evidenceIndex > availableCount || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isOptionalAnalysisReceiptProblem(value: unknown): boolean {
  if (value === undefined) return true
  const problem = asRecord(value)
  return Boolean(problem) &&
    isBoundedString(problem?.summary, 500) &&
    isBoundedStringArray(problem?.severity_indicators, 5, 200) &&
    isNullableBoundedString(problem?.recommended_scope, 400) &&
    isNullableBoundedString(problem?.remaining_uncertainty, 300)
}

function isOptionalNullablePriceReasoningReceipt(
  value: unknown,
  estimateMin: number,
  estimateMax: number,
): boolean {
  if (value === undefined || value === null) return true
  const receipt = asRecord(value)
  const problem = asRecord(receipt?.problem)
  const scope = asRecord(receipt?.scope)
  const costs = asRecord(receipt?.costs)
  const scenarios = asRecord(receipt?.scenarios)
  const fairness = asRecord(receipt?.fairness)
  if (
    receipt?.schema_version !== 'price_reasoning_receipt.v1' ||
    !isBoundedString(receipt?.receipt_id, 160) ||
    !problem ||
    !isBoundedStringArray(problem.confirmed_facts, 5, 300) ||
    problem.confirmed_facts.length === 0 ||
    !isPriceReasoningCauses(problem.possible_causes) ||
    !isBoundedStringArray(problem.unknowns, 5, 300) ||
    !scope ||
    !isBoundedStringArray(scope.included, 8, 300) ||
    scope.included.length === 0 ||
    !isBoundedStringArray(scope.conditional, 8, 300) ||
    !isBoundedStringArray(scope.excluded, 8, 300) ||
    !costs ||
    costs.currency !== 'VND' ||
    !isFiniteRange(costs.total_min, 1, Number.MAX_SAFE_INTEGER) ||
    !isFiniteRange(costs.total_max, Number(costs.total_min), Number.MAX_SAFE_INTEGER) ||
    costs.total_min !== estimateMin ||
    costs.total_max !== estimateMax ||
    !isEnumString(costs.reconciliation, new Set(['package_total', 'exact'])) ||
    !Array.isArray(costs.components) ||
    costs.components.length === 0 ||
    costs.components.length > 8 ||
    !scenarios ||
    !isPriceReasoningScenario(scenarios.low, Number(costs.total_min)) ||
    !isPriceReasoningScenario(scenarios.high, Number(costs.total_max)) ||
    !fairness ||
    !isEnumString(fairness.price_source, PRICE_REASONING_SOURCES) ||
    !isEnumString(fairness.confidence, PRICE_REASONING_CONFIDENCE) ||
    !(fairness.market_source_count === null || isNonNegativeInteger(fairness.market_source_count)) ||
    !(fairness.high_trust_source_count === null || isNonNegativeInteger(fairness.high_trust_source_count)) ||
    !(fairness.quorum_met === null || typeof fairness.quorum_met === 'boolean') ||
    !isBoundedString(fairness.cap_statement, 360) ||
    !isBoundedStringArray(fairness.remaining_uncertainty, 5, 300)
  ) return false

  const components = costs.components
  if (!components.every(isPriceReasoningComponent)) return false
  const pricedComponents = components.filter((component) => asRecord(component)?.status === 'priced')
  if (costs.reconciliation === 'package_total') {
    const packageComponent = asRecord(pricedComponents[0])
    return pricedComponents.length === 1 &&
      packageComponent?.kind === 'service_package' &&
      packageComponent.amount_min === costs.total_min &&
      packageComponent.amount_max === costs.total_max &&
      isFairPriceReasoningMarketCounts(fairness)
  }
  const exactMin = pricedComponents.reduce(
    (sum, component) => sum + Number(asRecord(component)?.amount_min ?? 0),
    0,
  )
  const exactMax = pricedComponents.reduce(
    (sum, component) => sum + Number(asRecord(component)?.amount_max ?? 0),
    0,
  )
  return pricedComponents.length > 0 &&
    exactMin === costs.total_min &&
    exactMax === costs.total_max &&
    isFairPriceReasoningMarketCounts(fairness)
}

function isPriceReasoningCauses(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 5 && value.every((item) => {
    const cause = asRecord(item)
    return Boolean(cause) &&
      isBoundedString(cause?.statement, 300) &&
      isEnumString(cause?.confidence, PRICE_REASONING_CONFIDENCE) &&
      Array.isArray(cause?.basis) &&
      cause.basis.length > 0 &&
      cause.basis.length <= 4 &&
      cause.basis.every((basis) => isEnumString(basis, PRICE_REASONING_CAUSE_BASIS))
  })
}

function isPriceReasoningComponent(value: unknown): boolean {
  const component = asRecord(value)
  if (
    !component ||
    !isEnumString(component.kind, PRICE_REASONING_COMPONENT_KINDS) ||
    !isEnumString(component.status, PRICE_REASONING_COMPONENT_STATUSES) ||
    !isBoundedString(component.explanation, 360)
  ) return false
  const hasMin = component.amount_min !== null
  const hasMax = component.amount_max !== null
  if (hasMin !== hasMax) return false
  if (component.status === 'priced') {
    return component.kind === 'service_package' &&
      isFiniteRange(component.amount_min, 1, Number.MAX_SAFE_INTEGER) &&
      isFiniteRange(component.amount_max, Number(component.amount_min), Number.MAX_SAFE_INTEGER)
  }
  return component.amount_min === null && component.amount_max === null
}

function isPriceReasoningScenario(value: unknown, expectedTotal: number): boolean {
  const scenario = asRecord(value)
  return Boolean(scenario) &&
    scenario?.total === expectedTotal &&
    isBoundedStringArray(scenario?.conditions, 5, 260) &&
    scenario.conditions.length > 0 &&
    isBoundedStringArray(scenario?.scope, 5, 260) &&
    scenario.scope.length > 0
}

function isFairPriceReasoningMarketCounts(fairness: Record<string, unknown>): boolean {
  const marketCount = fairness.market_source_count
  const highTrustCount = fairness.high_trust_source_count
  return !(typeof marketCount === 'number' && typeof highTrustCount === 'number' && highTrustCount > marketCount)
}

function isNullableProgress(value: unknown): boolean {
  if (value === null) return true
  const progress = asRecord(value)
  return Boolean(progress) && isEnumString(progress?.current_stage, KAEL_PROGRESS_STAGES) &&
    typeof progress?.status === 'string' && isKaelProgressStatus(progress.status) &&
    isFiniteRange(progress?.progress, 0, 1) && isOptionalNullableBoundedString(progress?.failure_reason, 2_000) &&
    isBoundedString(progress?.updated_at, 64)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

function isNullableBoundedString(value: unknown, maxLength: number): boolean {
  return value === null || isBoundedString(value, maxLength)
}

function isOptionalNullableBoundedString(value: unknown, maxLength: number): boolean {
  return value === undefined || isNullableBoundedString(value, maxLength)
}

function isBoundedStringArray(
  value: unknown,
  maxItems: number,
  maxItemLength: number,
): value is string[] {
  return Array.isArray(value) && value.length <= maxItems &&
    value.every((item) => isBoundedString(item, maxItemLength))
}

function isNullableRecord(value: unknown): boolean {
  return value === null || asRecord(value) !== null
}

function isEnumString(value: unknown, values: ReadonlySet<string>): value is string {
  return typeof value === 'string' && values.has(value)
}

function isNullableEnumString(value: unknown, values: ReadonlySet<string>) {
  return value === null || isEnumString(value, values)
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isFiniteRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}
