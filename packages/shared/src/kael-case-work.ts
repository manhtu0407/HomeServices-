import { z } from 'zod'

import { SERVICE_TYPES } from './constants'
import { KAEL_PERFORMANCE_PROFILE_IDS } from './service-intake'

export const CASE_WORK_PHASES = Object.freeze([
  'analysis',
  'offer_review',
  'matching',
  'worker_candidate_review',
  'worker_en_route',
  'service_execution',
  'scope_change_review',
  'completion_review',
  'payment',
  'review',
  'closed',
] as const)

export type CaseWorkPhase = (typeof CASE_WORK_PHASES)[number]

const factValueSchema = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(500)).max(30),
  z.null(),
])

export const caseWorkEvidenceSchema = z.object({
  kind: z.enum([
    'photo',
    'video_frame',
    'video_original_private',
    'voice_transcript',
    'text_note',
  ]),
  ref: z.string().max(1000).optional(),
  transcript: z.string().trim().min(1).max(5000).optional(),
  summary: z.string().trim().min(1).max(1000).optional(),
  model_eligible: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if ((value.kind === 'photo' || value.kind === 'video_frame' || value.kind === 'video_original_private') && !value.ref) {
    ctx.addIssue({ code: 'custom', path: ['ref'], message: `${value.kind} evidence requires a private ref` })
  }
  if ((value.kind === 'voice_transcript' || value.kind === 'text_note') && !value.transcript) {
    ctx.addIssue({ code: 'custom', path: ['transcript'], message: `${value.kind} evidence requires reviewed text` })
  }
  if (value.kind === 'voice_transcript' && value.ref) {
    ctx.addIssue({ code: 'custom', path: ['ref'], message: 'Raw voice media must not be attached to a transcript' })
  }
  if (value.kind === 'video_original_private' && value.model_eligible) {
    ctx.addIssue({ code: 'custom', path: ['model_eligible'], message: 'Original video is private human evidence only' })
  }
  if (
    (value.kind === 'photo' || value.kind === 'video_frame') &&
    value.ref &&
    !/^supabase:\/\/kael-chat-media\/[^/\s?#]+\/kael-chat\/model_vision\/(?!.*(?:\.\.|\/\/))[^\s?#]+$/i.test(value.ref)
  ) {
    ctx.addIssue({ code: 'custom', path: ['ref'], message: 'Model evidence requires a private model_vision ref' })
  }
  if (
    value.kind === 'video_original_private' &&
    value.ref &&
    !/^supabase:\/\/kael-chat-media\/[^/\s?#]+\/kael-chat\/private_video_original\/(?!.*(?:\.\.|\/\/))[^\s?#]+$/i.test(value.ref)
  ) {
    ctx.addIssue({ code: 'custom', path: ['ref'], message: 'Original video requires a private human-evidence ref' })
  }
})

const safetyFlagSchema = z.object({
  code: z.string().trim().min(1).max(120),
  severity: z.enum(['notice', 'review', 'stop']),
  customer_message: z.string().trim().min(1).max(1000).optional(),
}).strict()

const nextActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ask_question'),
    question: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({
    kind: z.literal('request_evidence'),
    evidence_kind: z.enum(['photo', 'video_frame', 'voice_transcript']),
    prompt: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({ kind: z.literal('prepare_offer') }).strict(),
  z.object({
    kind: z.literal('escalate'),
    reason: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({ kind: z.literal('wait') }).strict(),
])

const profileByService = {
  electrical: 'electric_diagnose',
  plumbing: 'water_diagnose',
  cleaning: 'clean_scope',
  hvac: 'air_scope',
  upholstery: 'fabric_scope',
  handyman: 'task_scope',
} as const

export const diagnosisScopeArtifactSchema = z.object({
  version: z.literal(1),
  service_type: z.enum(SERVICE_TYPES),
  profile_id: z.enum(KAEL_PERFORMANCE_PROFILE_IDS),
  case_phase: z.enum(CASE_WORK_PHASES),
  facts: z.record(z.string().min(1).max(120), factValueSchema),
  missing_facts: z.array(z.string().min(1).max(120)).max(64),
  evidence: z.array(caseWorkEvidenceSchema).max(20),
  safety_flags: z.array(safetyFlagSchema).max(20),
  scope_summary: z.string().trim().min(1).max(3000).nullable(),
  quote_ready: z.boolean(),
  quote_blockers: z.array(z.string().min(1).max(200)).max(30),
  worker_requirements: z.array(z.string().min(1).max(120)).max(30),
  confidence: z.number().min(0).max(1),
  next_action: nextActionSchema,
  updated_at: z.string().datetime(),
}).strict().superRefine((value, ctx) => {
  if (profileByService[value.service_type] !== value.profile_id) {
    ctx.addIssue({ code: 'custom', path: ['profile_id'], message: 'Profile must match the selected service' })
  }

  if (Object.keys(value.facts).length > 64) {
    ctx.addIssue({ code: 'custom', path: ['facts'], message: 'Artifact facts exceed the bounded case-work contract' })
  }

  if (value.quote_ready) {
    if (value.missing_facts.length > 0 || value.quote_blockers.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['quote_ready'], message: 'Quote cannot be ready while blockers remain' })
    }
    if (!value.scope_summary) {
      ctx.addIssue({ code: 'custom', path: ['scope_summary'], message: 'Quote-ready artifact requires a scope summary' })
    }
    if (value.next_action.kind !== 'prepare_offer') {
      ctx.addIssue({ code: 'custom', path: ['next_action'], message: 'Quote-ready artifact must prepare the offer' })
    }
  }
})

export type DiagnosisScopeArtifact = z.infer<typeof diagnosisScopeArtifactSchema>
export type CaseWorkEvidence = DiagnosisScopeArtifact['evidence'][number]
export type CaseWorkNextAction = DiagnosisScopeArtifact['next_action']
