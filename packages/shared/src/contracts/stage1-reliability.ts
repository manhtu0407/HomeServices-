import { z } from 'zod'

import { serviceTypeSchema } from './common'

const instantSchema = z.string().datetime({ offset: true })

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
  }).strict(),
  questions: z.array(localizedQuestionSchema).max(100),
  change_reason: z.string().trim().min(3).max(1000),
  created_by: z.string().uuid(),
  created_at: instantSchema,
  published_by: z.string().uuid().nullable(),
  published_at: instantSchema.nullable(),
}).strict().superRefine((policy, ctx) => {
  if (policy.quote_mode === 'kael_auto_quote' && !policy.evidence_requirements.requires_active_baseline) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'kael_auto_quote requires an active governed price baseline',
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
export type ConfirmationOperationState = z.infer<typeof confirmationOperationStateSchema>
export type ConfirmationOperationReceipt = z.infer<typeof confirmationOperationReceiptSchema>
export type MatchingDeliveryState = z.infer<typeof matchingDeliveryStateSchema>
export type MatchingDeliveryReceipt = z.infer<typeof matchingDeliveryReceiptSchema>
export type ReleaseIdentity = z.infer<typeof releaseIdentitySchema>
