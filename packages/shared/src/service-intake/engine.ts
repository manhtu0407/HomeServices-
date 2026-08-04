import { getServicePerformancePlaybook } from './catalog'
import type { ComplexityLevel } from '../constants'
import { jobCreateSchema } from '../validation'
import type {
  AgenticPerformanceDecision,
  AgenticPerformanceInput,
  ConfidenceLevel,
  DurationRangeMinutes,
  IntakeAnswerValue,
  IntakeAnswers,
  IntakeQuestion,
  MediaRequirement,
  RiskRule,
  ServiceIntakeState,
  ServicePerformancePlaybook,
  ServiceScopeCard,
} from './types'

export function createInitialPerformanceIntake(serviceLineId: ServiceIntakeState['serviceLineId']): ServiceIntakeState {
  getServicePerformancePlaybook(serviceLineId)
  return Object.freeze({ serviceLineId, answers: {}, mediaCount: 0 })
}

export function applyPerformanceAnswer(state: ServiceIntakeState, questionId: string, value: IntakeAnswerValue): ServiceIntakeState {
  const question = getServicePerformancePlaybook(state.serviceLineId).questions.find(
    (entry) => entry.id === questionId,
  )
  if (!question) throw new RangeError(`Unknown performance intake question: ${questionId}`)

  return Object.freeze({
    ...state,
    answers: Object.freeze({
      ...state.answers,
      [questionId]: normalizeAnswerValue(question, value),
    }),
  })
}

export function setPerformanceMediaCount(state: ServiceIntakeState, mediaCount: number): ServiceIntakeState {
  return Object.freeze({ ...state, mediaCount: normalizeMediaCount(mediaCount) })
}

function getMissingRequiredPerformanceQuestions(state: ServiceIntakeState): readonly IntakeQuestion[] {
  return getServicePerformancePlaybook(state.serviceLineId).questions.filter(
    (question) => question.required && !isValidRequiredAnswer(question, state.answers[question.id]),
  )
}

function getNextPerformanceQuestion(state: ServiceIntakeState): IntakeQuestion | null {
  return getMissingRequiredPerformanceQuestions(state)[0] ?? null
}

export function buildServiceScopeCard(state: ServiceIntakeState): ServiceScopeCard {
  const playbook = getServicePerformancePlaybook(state.serviceLineId)
  const normalizedState = normalizePerformanceState(playbook, state)
  const duration = estimateDuration(playbook, normalizedState.answers)
  const complexity = estimateComplexity(playbook, normalizedState.answers, duration)
  const risks = evaluateRiskRules(playbook, normalizedState.answers, normalizedState.mediaCount)
  const mediaRequirement = deriveMediaRequirement(playbook, normalizedState.answers)
  const confidenceScore = estimateConfidence(playbook, normalizedState, mediaRequirement, risks.reviewReasonsVi)
  const quoteDriversVi = buildQuoteDrivers(playbook, normalizedState.answers, 'vi')
  const quoteDriversEn = buildQuoteDrivers(playbook, normalizedState.answers, 'en')
  const problemChips = buildProblemChips(playbook, normalizedState.answers)
  const recommendedCrewSize = estimateCrewSize(playbook, normalizedState.answers, duration, risks.riskFlags)
  const scopeSummaryVi = buildScopeSummary(playbook, quoteDriversVi, complexity, duration, recommendedCrewSize, 'vi')
  const scopeSummaryEn = buildScopeSummary(playbook, quoteDriversEn, complexity, duration, recommendedCrewSize, 'en')
  const canCreateProductionJob = playbook.productionServiceType !== null

  return Object.freeze({
    serviceLineId: playbook.serviceLineId,
    productionServiceType: playbook.productionServiceType,
    labelVi: playbook.labelVi,
    labelEn: playbook.labelEn,
    professionalName: playbook.professionalName,
    kaelScopeName: playbook.kaelScopeName,
    mode: playbook.mode,
    scopeSummaryVi,
    scopeSummaryEn,
    quoteDriversVi,
    quoteDriversEn,
    problemChips,
    complexity,
    confidence: confidenceFromScore(confidenceScore),
    confidenceScore,
    estimatedDurationMinutes: duration,
    recommendedCrewSize,
    requiredToolsVi: playbook.requiredToolsVi,
    requiredToolsEn: playbook.requiredToolsEn,
    customerPrepVi: playbook.customerPrepVi,
    customerPrepEn: playbook.customerPrepEn,
    workerBriefVi: buildWorkerBrief(playbook, scopeSummaryVi, risks.reviewReasonsVi, 'vi'),
    workerBriefEn: buildWorkerBrief(playbook, scopeSummaryEn, risks.reviewReasonsEn, 'en'),
    completionChecklistVi: playbook.completionChecklistVi,
    completionChecklistEn: playbook.completionChecklistEn,
    scopeChangeTriggersVi: playbook.scopeChangeTriggersVi,
    scopeChangeTriggersEn: playbook.scopeChangeTriggersEn,
    unsupportedBoundariesVi: playbook.unsupportedBoundariesVi,
    unsupportedBoundariesEn: playbook.unsupportedBoundariesEn,
    riskFlags: risks.riskFlags,
    reviewReasonsVi: risks.reviewReasonsVi,
    reviewReasonsEn: risks.reviewReasonsEn,
    mediaRequirement,
    canCreateProductionJob,
    bookingBlockerVi: canCreateProductionJob ? undefined : playbook.bookingBlockerVi,
    bookingBlockerEn: canCreateProductionJob ? undefined : playbook.bookingBlockerEn,
  })
}

export function runKaelAgenticPerformanceStep(input: AgenticPerformanceInput): AgenticPerformanceDecision {
  const nextQuestion = getNextPerformanceQuestion(input.state)
  if (nextQuestion) return { kind: 'ask_question', serviceLineId: input.state.serviceLineId, question: nextQuestion }

  const scopeCard = buildServiceScopeCard(input.state)
  if (
    scopeCard.mediaRequirement.required &&
    normalizeMediaCount(input.state.mediaCount) < scopeCard.mediaRequirement.minPhotos
  ) {
    return { kind: 'request_media', serviceLineId: input.state.serviceLineId, mediaRequirement: scopeCard.mediaRequirement, scopeCard }
  }
  if (scopeCard.reviewReasonsVi.length > 0) {
    return { kind: 'needs_human_review', scopeCard, reasonsVi: scopeCard.reviewReasonsVi, reasonsEn: scopeCard.reviewReasonsEn }
  }
  if (!input.customerAcceptedScope) return { kind: 'show_scope_card', scopeCard }
  if (!scopeCard.canCreateProductionJob || !scopeCard.productionServiceType) return { kind: 'beta_service_blocked', scopeCard }
  const addressDistrict = input.addressDistrict?.trim()
  if (!addressDistrict) return { kind: 'show_scope_card', scopeCard }
  if (
    scopeCard.mediaRequirement.required &&
    (input.photoUrls?.length ?? 0) < scopeCard.mediaRequirement.minPhotos
  ) {
    return {
      kind: 'request_media',
      serviceLineId: input.state.serviceLineId,
      mediaRequirement: scopeCard.mediaRequirement,
      scopeCard,
    }
  }

  const parsedJobPayload = jobCreateSchema.safeParse({
    service_type: scopeCard.productionServiceType,
    description: buildKaelBookingMessageFromScopeCard(scopeCard),
    problem_chips: scopeCard.problemChips,
    photo_urls: input.photoUrls ?? [],
    address_district: addressDistrict,
    ...(input.addressBuilding != null ? { address_building: input.addressBuilding } : {}),
    ...(input.addressUnit != null ? { address_unit: input.addressUnit } : {}),
    ...(input.addressFloor != null ? { address_floor: input.addressFloor } : {}),
    ...(input.scheduledAt != null ? { scheduled_at: input.scheduledAt } : {}),
  })
  if (!parsedJobPayload.success) return { kind: 'show_scope_card', scopeCard }
  const payload = parsedJobPayload.data

  return {
    kind: 'create_job_handoff',
    scopeCard,
    jobPayload: {
      service_type: payload.service_type,
      description: payload.description,
      problem_chips: Object.freeze([...payload.problem_chips]),
      photo_urls: Object.freeze([...payload.photo_urls]),
      address_district: payload.address_district ?? addressDistrict,
      ...(payload.address_building !== undefined ? { address_building: payload.address_building } : {}),
      ...(payload.address_unit !== undefined ? { address_unit: payload.address_unit } : {}),
      ...(payload.address_floor !== undefined ? { address_floor: payload.address_floor } : {}),
      ...(payload.scheduled_at !== undefined ? { scheduled_at: payload.scheduled_at } : {}),
    },
  }
}

function buildKaelBookingMessageFromScopeCard(scopeCard: ServiceScopeCard): string {
  return [
    `[${scopeCard.kaelScopeName}]`,
    `Dịch vụ: ${scopeCard.labelVi}`,
    `Phạm vi: ${scopeCard.scopeSummaryVi}`,
    `Thời lượng dự kiến: ${scopeCard.estimatedDurationMinutes.min}–${scopeCard.estimatedDurationMinutes.max} phút`,
    `Số người đề xuất: ${scopeCard.recommendedCrewSize}`,
    `Checklist hoàn tất: ${scopeCard.completionChecklistVi.join('; ')}`,
    `Cần duyệt khi: ${scopeCard.scopeChangeTriggersVi.join('; ')}`,
    `Không bao gồm: ${scopeCard.unsupportedBoundariesVi.join('; ')}`,
  ].join('\n')
}

function normalizeAnswerValue(question: IntakeQuestion, value: IntakeAnswerValue): IntakeAnswerValue {
  if (value === null) return null

  if (question.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`${question.id} must be a finite number`)
    }
    if (question.integer && !Number.isInteger(value)) {
      throw new RangeError(`${question.id} must be a whole number`)
    }
    if (question.min !== undefined && value < question.min) {
      throw new RangeError(`${question.id} is below its minimum`)
    }
    if (question.max !== undefined && value > question.max) {
      throw new RangeError(`${question.id} is above its maximum`)
    }
    return value
  }

  if (question.type === 'text') {
    if (typeof value !== 'string') throw new TypeError(`${question.id} must be text`)
    const normalized = value.trim()
    if (question.maxLength !== undefined && normalized.length > question.maxLength) {
      throw new RangeError(`${question.id} is too long`)
    }
    return normalized || null
  }

  if (question.type === 'single_select') {
    if (typeof value !== 'string') throw new TypeError(`${question.id} must be one option`)
    const normalized = value.trim()
    if (!normalized) return null
    if (!question.options?.some((option) => option.value === normalized)) {
      throw new RangeError(`${question.id} contains an unsupported option`)
    }
    return normalized
  }

  if (!Array.isArray(value)) throw new TypeError(`${question.id} must be an option list`)
  const normalized = value.map((entry) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new TypeError(`${question.id} contains an invalid option`)
    }
    return entry.trim()
  })
  const unique = [...new Set(normalized)]
  if (question.maxSelections !== undefined && unique.length > question.maxSelections) {
    throw new RangeError(`${question.id} has too many selections`)
  }
  if (!unique.every((entry) => question.options?.some((option) => option.value === entry))) {
    throw new RangeError(`${question.id} contains an unsupported option`)
  }
  if (unique.includes('none') && unique.length > 1) {
    throw new RangeError(`${question.id} cannot combine none with another option`)
  }
  return Object.freeze(unique)
}

function isEmptyAnswer(value: IntakeAnswerValue | undefined): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

function isValidRequiredAnswer(question: IntakeQuestion, value: IntakeAnswerValue | undefined): boolean {
  if (value === undefined) return false
  try {
    return !isEmptyAnswer(normalizeAnswerValue(question, value))
  } catch {
    return false
  }
}

function normalizePerformanceState(
  playbook: ServicePerformancePlaybook,
  state: ServiceIntakeState,
): ServiceIntakeState {
  const answers: IntakeAnswers = {}
  for (const question of playbook.questions) {
    const value = state.answers[question.id]
    if (value === undefined) continue
    try {
      answers[question.id] = normalizeAnswerValue(question, value)
    } catch {
      continue
    }
  }
  return Object.freeze({
    serviceLineId: state.serviceLineId,
    answers: Object.freeze(answers),
    mediaCount: normalizeMediaCount(state.mediaCount),
  })
}

function normalizeMediaCount(value: number): number {
  return Number.isFinite(value) ? Math.min(5, Math.max(0, Math.floor(value))) : 0
}

function answerString(answers: IntakeAnswers, id: string): string | null {
  const value = answers[id]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function answerNumber(answers: IntakeAnswers, id: string): number | null {
  const value = answers[id]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function answerList(answers: IntakeAnswers, id: string): readonly string[] {
  const value = answers[id]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

function buildQuoteDrivers(playbook: ServicePerformancePlaybook, answers: IntakeAnswers, language: 'vi' | 'en'): readonly string[] {
  const result = playbook.quoteDriverSlots.flatMap((slot) => {
    const value = answers[slot]
    if (value === null || value === undefined || value === '') return []
    const question = playbook.questions.find((entry) => entry.id === slot)
    const label = language === 'vi' ? question?.labelVi : question?.labelEn
    const values = Array.isArray(value) ? value.filter((entry) => entry !== 'none') : [value]
    if (values.length === 0) return []
    const displayValues = values.map((entry) => {
      if (typeof entry !== 'string') return String(entry)
      const option = question?.options?.find((candidate) => candidate.value === entry)
      return language === 'vi' ? option?.labelVi ?? entry : option?.labelEn ?? entry
    })
    return [`${label ?? slot}: ${displayValues.join(', ')}`]
  })
  return Object.freeze(result)
}

function buildProblemChips(playbook: ServicePerformancePlaybook, answers: IntakeAnswers): readonly string[] {
  const chips = [...playbook.defaultProblemChips]
  if (playbook.serviceLineId === 'home_cleaning') {
    const cleaningType = answerString(answers, 'cleaning_type')
    if (cleaningType === 'deep' || cleaningType === 'move_in_out') chips.push('Tổng vệ sinh')
    if (cleaningType === 'post_repair') chips.push('Dọn sau sửa chữa')
    const zones = answerList(answers, 'priority_zones')
    if (zones.includes('kitchen')) chips.push('Vệ sinh bếp')
    if (zones.includes('bathroom')) chips.push('Vệ sinh phòng tắm')
    if (zones.includes('glass_windows')) chips.push('Vệ sinh cửa kính')
  }
  return Object.freeze([...new Set(chips)])
}

function estimateDuration(playbook: ServicePerformancePlaybook, answers: IntakeAnswers): DurationRangeMinutes {
  if (playbook.serviceLineId === 'home_cleaning') return clampDuration(estimateCleaningDuration(answers))
  if (playbook.serviceLineId === 'hvac_basic_maintenance') return clampDuration(estimateHvacDuration(answers))
  if (playbook.serviceLineId === 'upholstery_care') return clampDuration(estimateFabricDuration(answers))
  return clampDuration(estimateHandymanDuration(answers))
}

function estimateCleaningDuration(answers: IntakeAnswers): DurationRangeMinutes {
  const type = answerString(answers, 'cleaning_type') ?? 'standard'
  const area = answerNumber(answers, 'area_sqm') ?? areaByLayout(answerString(answers, 'property_layout'))
  const bathrooms = answerNumber(answers, 'bathroom_count') ?? 1
  const condition = answerString(answers, 'condition_level') ?? 'level_2'
  const addons = answerList(answers, 'addons')
  let range = type === 'quick' ? [75, 120] : type === 'deep' ? [210, 330] : type === 'post_repair' || type === 'move_in_out' ? [240, 420] : type === 'recurring' ? [105, 180] : [90, 150]
  let [min, max] = range
  if (area > 70) { const blocks = Math.ceil((area - 70) / 30); min += blocks * 25; max += blocks * 45 }
  if (bathrooms > 1) { min += (bathrooms - 1) * 25; max += (bathrooms - 1) * 45 }
  if (condition === 'level_3') { min += 45; max += 75 }
  if (condition === 'level_4') { min += 90; max += 150 }
  min += addons.length * 15
  max += addons.length * 35
  return { min, max }
}

function estimateHvacDuration(answers: IntakeAnswers): DurationRangeMinutes {
  const goal = answerString(answers, 'hvac_goal') ?? 'routine_cleaning'
  const units = answerNumber(answers, 'unit_count') ?? 1
  const access = answerString(answers, 'access_level') ?? 'easy'
  const symptomatic = ['weak_cooling', 'water_leak', 'odor'].includes(goal)
  let min = units * (symptomatic ? 55 : goal === 'basic_check' ? 35 : 40)
  let max = units * (symptomatic ? 90 : 60)
  if (access === 'high_or_tight') { min += 20; max += 35 }
  if (access === 'difficult') { min += 35; max += 60 }
  return { min, max }
}

function estimateFabricDuration(answers: IntakeAnswers): DurationRangeMinutes {
  const items = answerList(answers, 'fabric_items')
  const issues = answerList(answers, 'fabric_issue')
  const inferredCount = extractFirstNumber(answerString(answers, 'fabric_quantity_size') ?? '') ?? items.length
  const count = Math.max(1, Math.min(6, inferredCount || 1))
  let min = 60 + count * 25
  let max = 100 + count * 45
  if (items.includes('curtain')) { min += 30; max += 60 }
  if (items.includes('carpet')) { min += 20; max += 45 }
  if (issues.some((issue) => ['odor', 'stain', 'sweat_yellowing', 'child_accident', 'light_mold'].includes(issue))) { min += 30; max += 75 }
  return { min, max }
}

function estimateHandymanDuration(answers: IntakeAnswers): DurationRangeMinutes {
  const tasks = answerList(answers, 'task_types')
  const count = answerNumber(answers, 'task_count') ?? Math.max(1, tasks.length)
  const riskCount = answerList(answers, 'task_risk_flags').filter((flag) => flag !== 'none').length
  let min = 35 * count
  let max = 55 * count
  if (answerString(answers, 'requires_drilling') === 'yes' || tasks.some((task) => ['drill_shelf', 'curtain_rod', 'tv_mount'].includes(task))) { min += 20; max += 45 }
  if (tasks.includes('tv_mount')) { min += 35; max += 75 }
  min += riskCount * 10
  max += riskCount * 25
  return { min, max }
}

function estimateComplexity(playbook: ServicePerformancePlaybook, answers: IntakeAnswers, duration: DurationRangeMinutes): ComplexityLevel {
  if (duration.max >= 360) return 'large'
  if (playbook.serviceLineId === 'home_cleaning') {
    if (answerString(answers, 'condition_level') === 'level_4' || answerString(answers, 'cleaning_type') === 'post_repair') return 'large'
    return duration.max >= 240 || answerString(answers, 'condition_level') === 'level_3' ? 'medium' : 'small'
  }
  if (playbook.serviceLineId === 'hvac_basic_maintenance') return answerList(answers, 'hvac_safety_notes').filter((item) => item !== 'none').length > 0 ? 'large' : duration.max >= 150 ? 'medium' : 'small'
  if (playbook.serviceLineId === 'upholstery_care') return answerList(answers, 'fabric_issue').includes('light_mold') || answerString(answers, 'fabric_material') === 'leather' ? 'large' : duration.max >= 150 ? 'medium' : 'small'
  const tasks = answerList(answers, 'task_types')
  const risks = answerList(answers, 'task_risk_flags').filter((item) => item !== 'none')
  return tasks.includes('tv_mount') || risks.some((item) => ['hidden_wire_pipe', 'heavy_item'].includes(item)) ? 'large' : tasks.length >= 3 || risks.length > 0 ? 'medium' : 'small'
}

function estimateCrewSize(playbook: ServicePerformancePlaybook, _answers: IntakeAnswers, duration: DurationRangeMinutes, riskFlags: readonly string[]): number {
  if (playbook.serviceLineId === 'home_cleaning') return duration.max >= 420 ? 3 : duration.max >= 210 ? 2 : 1
  if (playbook.serviceLineId === 'handyman_minor_installation' && riskFlags.includes('handyman_heavy_item')) return 2
  return 1
}

function evaluateRiskRules(playbook: ServicePerformancePlaybook, answers: IntakeAnswers, mediaCount: number) {
  const matches = playbook.riskRules.filter((rule) => matchesRiskRule(rule, answers, mediaCount))
  const reviews = matches.filter((rule) => rule.severity === 'review' || rule.severity === 'block')
  return Object.freeze({
    riskFlags: Object.freeze(matches.map((rule) => rule.id)),
    reviewReasonsVi: Object.freeze(reviews.map((rule) => rule.labelVi)),
    reviewReasonsEn: Object.freeze(reviews.map((rule) => rule.labelEn)),
  })
}

function matchesRiskRule(rule: RiskRule, answers: IntakeAnswers, mediaCount: number): boolean {
  const raw = rule.when.slot === '__media_count' ? mediaCount : answers[rule.when.slot]
  if (rule.when.operator === 'equals') return raw === rule.when.value
  if (rule.when.operator === 'number_gte') return typeof raw === 'number' && typeof rule.when.value === 'number' && raw >= rule.when.value
  if (rule.when.operator === 'media_lt') return typeof rule.when.value === 'number' && mediaCount < rule.when.value
  return Array.isArray(raw) && Array.isArray(rule.when.value) && raw.some((entry) => (rule.when.value as readonly string[]).includes(entry))
}

function deriveMediaRequirement(playbook: ServicePerformancePlaybook, answers: IntakeAnswers): MediaRequirement {
  if (playbook.serviceLineId === 'upholstery_care') {
    const issues = answerList(answers, 'fabric_issue')
    const required = issues.some((issue) => ['stain', 'light_mold', 'child_accident'].includes(issue)) || answerString(answers, 'fabric_material') === 'unknown'
    return Object.freeze({ ...playbook.mediaRequirement, required })
  }
  return playbook.mediaRequirement
}

function estimateConfidence(playbook: ServicePerformancePlaybook, state: ServiceIntakeState, media: MediaRequirement, reviews: readonly string[]): number {
  let score = 0.58
  if (getMissingRequiredPerformanceQuestions(state).length === 0) score += 0.14
  if (state.mediaCount >= media.minPhotos && (media.required || media.recommended)) score += 0.08
  if (playbook.productionServiceType) score += 0.04
  score -= Math.min(0.18, reviews.length * 0.06)
  if (media.required && state.mediaCount < media.minPhotos) score -= 0.12
  return Math.max(0.35, Math.min(0.9, Number(score.toFixed(2))))
}

function confidenceFromScore(score: number): ConfidenceLevel {
  return score >= 0.76 ? 'high' : score >= 0.56 ? 'medium' : 'low'
}

function buildScopeSummary(playbook: ServicePerformancePlaybook, drivers: readonly string[], complexity: ComplexityLevel, duration: DurationRangeMinutes, crew: number, language: 'vi' | 'en'): string {
  if (language === 'vi') return `${playbook.kaelScopeName}: ${drivers.join('; ')}. Đề xuất ${crew} người, ${duration.min}–${duration.max} phút, độ phức tạp ${complexityLabel(complexity, language)}.`
  return `${playbook.kaelScopeName}: ${drivers.join('; ')}. Suggested crew ${crew}, ${duration.min}–${duration.max} minutes, ${complexityLabel(complexity, language)} complexity.`
}

function buildWorkerBrief(playbook: ServicePerformancePlaybook, summary: string, reviews: readonly string[], language: 'vi' | 'en'): string {
  const tools = language === 'vi' ? playbook.requiredToolsVi : playbook.requiredToolsEn
  const checklist = language === 'vi' ? playbook.completionChecklistVi : playbook.completionChecklistEn
  const excluded = language === 'vi' ? playbook.unsupportedBoundariesVi : playbook.unsupportedBoundariesEn
  return [summary, `${language === 'vi' ? 'Chuẩn bị' : 'Prepare'}: ${tools.join(', ')}.`, `${language === 'vi' ? 'Checklist' : 'Completion checklist'}: ${checklist.join('; ')}.`, `${language === 'vi' ? 'Không bao gồm' : 'Not included'}: ${excluded.join('; ')}.`, reviews.length ? `${language === 'vi' ? 'Cần duyệt' : 'Review required'}: ${reviews.join('; ')}.` : null].filter(Boolean).join('\n')
}

function complexityLabel(complexity: ComplexityLevel, language: 'vi' | 'en') {
  if (language === 'vi') return complexity === 'small' ? 'nhỏ' : complexity === 'medium' ? 'vừa' : 'lớn'
  return complexity
}

function clampDuration(range: DurationRangeMinutes): DurationRangeMinutes {
  const min = Math.max(30, Math.round(range.min / 5) * 5)
  const max = Math.max(min + 15, Math.round(range.max / 5) * 5)
  return Object.freeze({ min, max })
}

function areaByLayout(layout: string | null): number {
  return layout === 'studio' ? 35 : layout === 'one_bedroom' ? 50 : layout === 'two_bedroom' ? 70 : layout === 'three_bedroom' ? 95 : layout === 'house' ? 120 : 60
}

function extractFirstNumber(value: string): number | null {
  const match = value.match(/\d+/)
  return match ? Number.parseInt(match[0], 10) : null
}
