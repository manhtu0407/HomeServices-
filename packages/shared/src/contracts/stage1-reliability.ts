import { z } from 'zod'

import { serviceTypeSchema } from './common'
import { JOB_STATUSES } from '../constants'

const instantSchema = z.string().datetime({ offset: true })

export const matchingOperationStateSchema = z.enum([
  'queued', 'broadcasting', 'candidate_ready', 'official_match',
  'no_reachable_worker', 'recovery_required', 'stopped',
])
export const matchingRetryRequestSchema = z.object({
  client_request_id: z.string().uuid(),
  expected_matching_operation_id: z.string().uuid(),
}).strict()
export const matchingOperationSnapshotSchema = z.object({
  operation_id: z.string().uuid(),
  state: matchingOperationStateSchema,
  updated_at: instantSchema,
}).strict()
export const matchingRetryReceiptSchema = matchingOperationSnapshotSchema.extend({
  confirmation_operation_id: z.string().uuid(),
  job_id: z.string().uuid(),
  request_id: z.string().uuid(),
  parent_operation_id: z.string().uuid(),
  support_code: z.string().regex(/^[A-Z0-9]{8}$/),
  created_at: instantSchema,
  broadcast_sent: z.boolean(),
}).strict().refine((receipt) =>
  receipt.parent_operation_id !== receipt.operation_id &&
  (receipt.state !== 'queued' || !receipt.broadcast_sent),
  { message: 'A queued retry cannot claim delivery or identify itself as its parent' })
export type MatchingRetryRequest = z.infer<typeof matchingRetryRequestSchema>
export const matchingSelectionReceiptSchema = z.object({
  job_id: z.string().uuid(),
  job_status: z.enum(JOB_STATUSES),
  request_id: z.string().uuid(),
  operation_id: z.string().uuid(),
  confirmation_operation_id: z.string().uuid(),
  state: matchingOperationStateSchema,
  mode: z.enum(['general', 'saved_worker_first']),
  preferred_worker_id: z.string().uuid().nullable(),
  auto_general: z.boolean(),
  selected_at: instantSchema,
  support_code: z.string().regex(/^[A-Z0-9]{8}$/),
  broadcast_sent: z.boolean(),
}).strict().refine((receipt) =>
  (receipt.mode === 'saved_worker_first') === (receipt.preferred_worker_id !== null) &&
  (receipt.state !== 'queued' || !receipt.broadcast_sent),
  { message: 'A queued selection cannot claim delivery and must retain its chosen target' })

export type MatchingSelectionReceipt = z.infer<typeof matchingSelectionReceiptSchema>
export type MatchingRetryReceipt = z.infer<typeof matchingRetryReceiptSchema>
export type MatchingOperationSnapshot = z.infer<typeof matchingOperationSnapshotSchema>

export const QUOTE_MODES = [
  'kael_auto_quote',
  'rfq',
  'inspection_only',
  'blocked',
] as const

export const quoteModeSchema = z.enum(QUOTE_MODES)

export const INTAKE_CONFIRMATION_KINDS = [
  'priced_offer',
  'rfq_request',
  'inspection_request',
  'none',
] as const

export const intakeConfirmationKindSchema = z.enum(INTAKE_CONFIRMATION_KINDS)

export const INTAKE_COVERAGE_NEXT_ACTIONS = [
  'collect_required',
  'offer_review',
  'rfq_review',
  'inspection_review',
  'blocked',
] as const

export const intakeCoverageNextActionSchema = z.enum(INTAKE_COVERAGE_NEXT_ACTIONS)

export const SERVICE_INTAKE_REQUIRED_FIELDS = [
  'service_type',
  'problem_slug',
  'address_label',
  'address_district',
  'scheduled_at',
  'description',
] as const

export const serviceIntakeRequiredFieldSchema = z.enum(SERVICE_INTAKE_REQUIRED_FIELDS)

const localizedQuestionSchema = z.object({
  key: z.string().trim().min(1).max(100),
  vi: z.string().trim().min(1).max(500),
  en: z.string().trim().min(1).max(500),
}).strict()

const lockedRequirementSchema = z.object({
  key: z.string().trim().min(1).max(100),
  required: z.boolean(),
  locked: z.literal(true),
  rule: z.string().trim().min(1).max(500),
}).strict()

export const serviceIntakePolicySchema = z.object({
  policy_id: z.string().uuid(),
  service_type: serviceTypeSchema,
  problem_slug: z.string().trim().regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/).max(100),
  version: z.number().int().positive(),
  status: z.enum(['draft', 'published', 'retired']),
  quote_mode: quoteModeSchema,
  required_fields: z.array(serviceIntakeRequiredFieldSchema).min(1),
  enrichment_slots: z.array(z.string().trim().min(1).max(100)).max(50),
  safety_requirements: z.array(lockedRequirementSchema).max(50),
  capability_requirements: z.array(lockedRequirementSchema).max(50),
  evidence_requirements: z.object({
    minimum_source_count: z.number().int().nonnegative(),
    minimum_high_trust_source_count: z.number().int().nonnegative(),
    requires_active_baseline: z.boolean(),
    allow_live_market_evidence: z.boolean().optional(),
  }).strict(),
  questions: z.array(localizedQuestionSchema).max(100),
  change_reason: z.string().trim().min(3).max(1000),
  created_by: z.string().uuid(),
  created_at: instantSchema,
  published_by: z.string().uuid().nullable(),
  published_at: instantSchema.nullable(),
}).strict().superRefine((policy, ctx) => {
  const evidence = policy.evidence_requirements
  if (
    policy.quote_mode === 'kael_auto_quote' && !evidence.requires_active_baseline &&
    !(evidence.allow_live_market_evidence === true && evidence.minimum_source_count >= 2 &&
      evidence.minimum_high_trust_source_count >= 2)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'kael_auto_quote requires an active governed price baseline or a two high-trust source live quorum',
      path: ['evidence_requirements', 'requires_active_baseline'],
    })
  }
  if (policy.status === 'published' && (!policy.published_by || !policy.published_at)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'published policies require publisher identity and timestamp',
      path: ['published_at'],
    })
  }
})

const intakeSafetyBlockerSchema = z.object({
  code: z.string().trim().min(1).max(80),
  message_vi: z.string().trim().min(1).max(500),
  message_en: z.string().trim().min(1).max(500),
  recoverable: z.boolean(),
}).strict()

export const intakeCoverageSchema = z.object({
  policy_id: z.string().uuid(),
  policy_version: z.number().int().positive(),
  quote_mode: quoteModeSchema,
  order_eligible: z.boolean(),
  missing_required_fields: z.array(serviceIntakeRequiredFieldSchema),
  missing_enrichment_slots: z.array(z.string().trim().min(1).max(100)),
  safety_blocker: intakeSafetyBlockerSchema.nullable(),
  confirmation_kind: intakeConfirmationKindSchema,
  next_action: intakeCoverageNextActionSchema,
}).strict().superRefine((coverage, ctx) => {
  const blockedByRequired = coverage.missing_required_fields.length > 0
  if (coverage.order_eligible && (blockedByRequired || coverage.safety_blocker !== null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'order_eligible requires all Tier A fields and no safety blocker',
      path: ['order_eligible'],
    })
  }

  const expected = coverage.quote_mode === 'kael_auto_quote'
    ? { confirmation_kind: 'priced_offer', next_action: 'offer_review' }
    : coverage.quote_mode === 'rfq'
      ? { confirmation_kind: 'rfq_request', next_action: 'rfq_review' }
      : coverage.quote_mode === 'inspection_only'
        ? { confirmation_kind: 'inspection_request', next_action: 'inspection_review' }
        : { confirmation_kind: 'none', next_action: 'blocked' }

  if (!coverage.order_eligible && coverage.quote_mode !== 'blocked') {
    if (coverage.confirmation_kind !== 'none' || coverage.next_action !== 'collect_required') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ineligible intake must collect required data before confirmation',
        path: ['next_action'],
      })
    }
    return
  }

  if (
    coverage.confirmation_kind !== expected.confirmation_kind ||
    coverage.next_action !== expected.next_action
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'quote mode, confirmation disclosure, and next action must agree',
      path: ['confirmation_kind'],
    })
  }
})

export const SERVICE_COVERAGE_STATUSES = ['ready', 'closed'] as const
export const serviceCoverageStatusSchema = z.enum(SERVICE_COVERAGE_STATUSES)

export const SERVICE_COVERAGE_REASON_CODES = [
  'READY',
  'INSUFFICIENT_ELIGIBLE_WORKERS',
  'COVERAGE_EVALUATION_UNAVAILABLE',
] as const
export const serviceCoverageReasonCodeSchema = z.enum(SERVICE_COVERAGE_REASON_CODES)

export const serviceCoverageReadinessSchema = z.object({
  service_type: serviceTypeSchema,
  district_code: z.string().trim().regex(/^[a-z0-9_]{2,50}$/),
  status: serviceCoverageStatusSchema,
  minimum_worker_count: z.literal(3),
  eligible_reachable_worker_count: z.number().int().nonnegative(),
  required_capabilities: z.array(z.string().trim().min(1).max(100)).max(50),
  reason_code: serviceCoverageReasonCodeSchema,
  checked_at: instantSchema,
  valid_until: instantSchema,
}).strict().superRefine((readiness, ctx) => {
  const thresholdMet = readiness.eligible_reachable_worker_count >= readiness.minimum_worker_count
  const ready = readiness.status === 'ready'
  if (ready !== thresholdMet) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'public coverage is ready only when the real eligible and reachable threshold is met',
      path: ['status'],
    })
  }
  if ((ready && readiness.reason_code !== 'READY') || (!ready && readiness.reason_code === 'READY')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'coverage reason must agree with readiness status',
      path: ['reason_code'],
    })
  }
  if (Date.parse(readiness.valid_until) <= Date.parse(readiness.checked_at)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'coverage validity must end after it was checked',
      path: ['valid_until'],
    })
  }
})

export const CONFIRMATION_OPERATION_STATES = [
  'confirmation_pending',
  'job_created',
  'matching_queued',
  'broadcasting',
  'candidate_ready',
  'official_match',
  'no_reachable_worker',
  'recovery_required',
  'stopped',
] as const

export const confirmationOperationStateSchema = z.enum(CONFIRMATION_OPERATION_STATES)

const terminalConfirmationOperationStates = new Set([
  'official_match',
  'no_reachable_worker',
  'stopped',
])

export const confirmationOperationReceiptSchema = z.object({
  operation_id: z.string().uuid(),
  idempotency_key: z.string().trim().min(16).max(160),
  session_id: z.string().uuid(),
  job_id: z.string().uuid().nullable(),
  quote_mode: quoteModeSchema,
  state: confirmationOperationStateSchema,
  terminal: z.boolean(),
  accepted_at: instantSchema,
  updated_at: instantSchema,
  retry_after_ms: z.number().int().min(100).max(30_000).nullable(),
  support_code: z.string().regex(/^[A-Z0-9]{8}$/),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.state !== 'confirmation_pending' && receipt.job_id === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'job_id is required after confirmation_pending',
      path: ['job_id'],
    })
  }
  const expectedTerminal = terminalConfirmationOperationStates.has(receipt.state)
  if (receipt.terminal !== expectedTerminal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'terminal must agree with the durable operation state',
      path: ['terminal'],
    })
  }
})

export const MATCHING_DELIVERY_STATES = [
  'queued',
  'delivered',
  'seen',
  'accepted',
  'expired',
] as const

export const matchingDeliveryStateSchema = z.enum(MATCHING_DELIVERY_STATES)

export const matchingDeliveryReceiptSchema = z.object({
  delivery_id: z.string().uuid(),
  broadcast_id: z.string().uuid(),
  job_id: z.string().uuid(),
  operation_id: z.string().uuid(),
  state: matchingDeliveryStateSchema,
  expires_at: instantSchema,
  delivered_at: instantSchema.nullable(),
  seen_at: instantSchema.nullable(),
  accepted_at: instantSchema.nullable(),
  server_time: instantSchema,
}).strict()

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const releaseIdentitySchema = z.object({
  release_id: z.string().trim().min(3).max(120).refine((value) => value !== 'unreleased'),
  git_sha: z.string().regex(/^[a-f0-9]{40}$/),
  source_bundle_hash: sha256Schema,
  mobile_build_fingerprint: sha256Schema,
  production_ui_source_hash: sha256Schema,
  edge_bundle_hash: sha256Schema,
  migration_watermark: z.string().regex(/^\d{14}$/),
  migration_inventory_hash: sha256Schema,
  policy_hash: sha256Schema,
  prompt_hash: sha256Schema,
  capability_hash: sha256Schema,
  price_evidence_hash: sha256Schema,
  provider_readiness_fingerprint: sha256Schema,
  generated_at: instantSchema,
}).strict()

export type QuoteMode = z.infer<typeof quoteModeSchema>
export type IntakeConfirmationKind = z.infer<typeof intakeConfirmationKindSchema>
export type IntakeCoverageNextAction = z.infer<typeof intakeCoverageNextActionSchema>
export type ServiceIntakeRequiredField = z.infer<typeof serviceIntakeRequiredFieldSchema>
export type ServiceIntakePolicy = z.infer<typeof serviceIntakePolicySchema>
export type IntakeCoverage = z.infer<typeof intakeCoverageSchema>
export type ServiceCoverageStatus = z.infer<typeof serviceCoverageStatusSchema>
export type ServiceCoverageReasonCode = z.infer<typeof serviceCoverageReasonCodeSchema>
export type ServiceCoverageReadiness = z.infer<typeof serviceCoverageReadinessSchema>
export type ConfirmationOperationState = z.infer<typeof confirmationOperationStateSchema>
export type ConfirmationOperationReceipt = z.infer<typeof confirmationOperationReceiptSchema>
export type MatchingDeliveryState = z.infer<typeof matchingDeliveryStateSchema>
export type MatchingDeliveryReceipt = z.infer<typeof matchingDeliveryReceiptSchema>
export type ReleaseIdentity = z.infer<typeof releaseIdentitySchema>
