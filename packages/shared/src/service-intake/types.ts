import type { ComplexityLevel, ServiceType } from '../constants'

export const LAUNCH_SERVICE_LINE_IDS = Object.freeze([
  'home_cleaning',
  'hvac_basic_maintenance',
  'upholstery_care',
  'handyman_minor_installation',
] as const)

export type LaunchServiceLineId = (typeof LAUNCH_SERVICE_LINE_IDS)[number]

export const CUSTOMER_SERVICE_IDS = Object.freeze([
  'electrical',
  'plumbing',
  ...LAUNCH_SERVICE_LINE_IDS,
] as const)

export type CustomerServiceId = (typeof CUSTOMER_SERVICE_IDS)[number]
export type KaelPerformanceMode = 'clean_scope' | 'air_scope' | 'fabric_scope' | 'task_scope'
export type ConfidenceLevel = 'low' | 'medium' | 'high'
export type IntakeQuestionType = 'single_select' | 'multi_select' | 'number' | 'text'
export type IntakeAnswerValue = string | number | boolean | readonly string[] | null
export type IntakeAnswers = Record<string, IntakeAnswerValue | undefined>

export type IntakeOption = Readonly<{
  value: string
  labelVi: string
  labelEn: string
  helperVi?: string
  helperEn?: string
}>

export type IntakeQuestion = Readonly<{
  id: string
  type: IntakeQuestionType
  labelVi: string
  labelEn: string
  helperVi?: string
  helperEn?: string
  required: boolean
  options?: readonly IntakeOption[]
  maxSelections?: number
  min?: number
  max?: number
  placeholderVi?: string
  placeholderEn?: string
}>

export type MediaRequirement = Readonly<{
  required: boolean
  recommended: boolean
  minPhotos: number
  promptsVi: readonly string[]
  promptsEn: readonly string[]
}>

export type RiskRulePredicate = Readonly<{
  slot: string
  operator: 'equals' | 'includes_any' | 'number_gte' | 'media_lt'
  value?: string | number | readonly string[]
}>

export type RiskRule = Readonly<{
  id: string
  labelVi: string
  labelEn: string
  severity: 'info' | 'review' | 'block'
  when: RiskRulePredicate
}>

export type ServicePerformancePlaybook = Readonly<{
  serviceLineId: LaunchServiceLineId
  productionServiceType: ServiceType | null
  labelVi: string
  labelEn: string
  professionalName: string
  kaelScopeName: string
  mode: KaelPerformanceMode
  performanceGoalVi: string
  performanceGoalEn: string
  questions: readonly IntakeQuestion[]
  quoteDriverSlots: readonly string[]
  defaultProblemChips: readonly string[]
  requiredToolsVi: readonly string[]
  requiredToolsEn: readonly string[]
  customerPrepVi: readonly string[]
  customerPrepEn: readonly string[]
  completionChecklistVi: readonly string[]
  completionChecklistEn: readonly string[]
  scopeChangeTriggersVi: readonly string[]
  scopeChangeTriggersEn: readonly string[]
  unsupportedBoundariesVi: readonly string[]
  unsupportedBoundariesEn: readonly string[]
  mediaRequirement: MediaRequirement
  riskRules: readonly RiskRule[]
  bookingBlockerVi?: string
  bookingBlockerEn?: string
}>

export type ServiceIntakeState = Readonly<{
  serviceLineId: LaunchServiceLineId
  answers: IntakeAnswers
  mediaCount: number
}>

export type DurationRangeMinutes = Readonly<{ min: number; max: number }>

export type ServiceScopeCard = Readonly<{
  serviceLineId: LaunchServiceLineId
  productionServiceType: ServiceType | null
  labelVi: string
  labelEn: string
  professionalName: string
  kaelScopeName: string
  mode: KaelPerformanceMode
  scopeSummaryVi: string
  scopeSummaryEn: string
  quoteDriversVi: readonly string[]
  quoteDriversEn: readonly string[]
  problemChips: readonly string[]
  complexity: ComplexityLevel
  confidence: ConfidenceLevel
  confidenceScore: number
  estimatedDurationMinutes: DurationRangeMinutes
  recommendedCrewSize: number
  requiredToolsVi: readonly string[]
  requiredToolsEn: readonly string[]
  customerPrepVi: readonly string[]
  customerPrepEn: readonly string[]
  workerBriefVi: string
  workerBriefEn: string
  completionChecklistVi: readonly string[]
  completionChecklistEn: readonly string[]
  scopeChangeTriggersVi: readonly string[]
  scopeChangeTriggersEn: readonly string[]
  unsupportedBoundariesVi: readonly string[]
  unsupportedBoundariesEn: readonly string[]
  riskFlags: readonly string[]
  reviewReasonsVi: readonly string[]
  reviewReasonsEn: readonly string[]
  mediaRequirement: MediaRequirement
  canCreateProductionJob: boolean
  bookingBlockerVi?: string
  bookingBlockerEn?: string
}>

export type ExistingJobCreatePayload = Readonly<{
  service_type: ServiceType
  description: string
  problem_chips: readonly string[]
  photo_urls: readonly string[]
  address_district: string
  address_building?: string | null
  address_unit?: string | null
  address_floor?: string | null
  scheduled_at?: string | null
}>

export type AgenticPerformanceInput = Readonly<{
  state: ServiceIntakeState
  photoUrls?: readonly string[]
  addressDistrict?: string | null
  addressBuilding?: string | null
  addressUnit?: string | null
  addressFloor?: string | null
  scheduledAt?: string | null
  customerAcceptedScope?: boolean
}>

export type AgenticPerformanceDecision =
  | Readonly<{ kind: 'ask_question'; serviceLineId: LaunchServiceLineId; question: IntakeQuestion }>
  | Readonly<{ kind: 'request_media'; serviceLineId: LaunchServiceLineId; mediaRequirement: MediaRequirement; scopeCard: ServiceScopeCard }>
  | Readonly<{ kind: 'show_scope_card'; scopeCard: ServiceScopeCard }>
  | Readonly<{ kind: 'needs_human_review'; scopeCard: ServiceScopeCard; reasonsVi: readonly string[]; reasonsEn: readonly string[] }>
  | Readonly<{ kind: 'create_job_handoff'; scopeCard: ServiceScopeCard; jobPayload: ExistingJobCreatePayload }>
  | Readonly<{ kind: 'beta_service_blocked'; scopeCard: ServiceScopeCard }>

export function isLaunchServiceLineId(value: unknown): value is LaunchServiceLineId {
  return typeof value === 'string' && LAUNCH_SERVICE_LINE_IDS.includes(value as LaunchServiceLineId)
}

export function isCustomerServiceId(value: unknown): value is CustomerServiceId {
  return typeof value === 'string' && CUSTOMER_SERVICE_IDS.includes(value as CustomerServiceId)
}

export function productionServiceTypeForCustomerService(value: CustomerServiceId): ServiceType | null {
  if (value === 'electrical' || value === 'plumbing') return value
  if (value === 'home_cleaning') return 'cleaning'
  return null
}
