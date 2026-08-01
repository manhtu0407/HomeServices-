import type { LearningCandidateStatus, ServiceType } from '@nestscout/shared'

export type KaelAssistantResponse = {
  answer: string
  safety_notes: string[]
  citations: string[]
  suggested_actions: ('open_booking' | 'check_job' | 'message_worker' | 'contact_support' | 'request_scope_change')[]
  boundary: 'answered' | 'educational_only' | 'redirect' | 'unsupported' | 'fallback'
  fallback_used: boolean
}

export type KaelMemoryPayload = Record<string, unknown> & {
  customer_id?: string
  worker_id?: string
  language?: string | null
  preference_summary?: string | null
  service_preferences?: Record<string, unknown> | null
  service_skill_proficiency?: Record<string, unknown> | null
  service_skill_summary?: string | null
  safe_metadata?: Record<string, unknown> | null
  trust_signals?: Record<string, unknown> | null
  reliability_signals?: Record<string, unknown> | null
  red_flags?: Record<string, unknown> | null
  memory_version?: number | null
  last_observed_at?: string | null
}

export type KaelMemorySelfViewResponse = {
  subject_type: 'customer' | 'worker'
  memory: KaelMemoryPayload | null
}

export type KaelMemoryResponse = {
  subject_type: 'customer' | 'worker'
  memory: Record<string, unknown> | null
}

export type KaelChatProgress = {
  current_stage:
    | 'intent_classification'
    | 'vision_analysis'
    | 'clarification'
    | 'problem_synthesis'
    | 'market_lookup'
    | 'price_synthesis'
    | 'advisory_generation'
    | 'worker_brief'
    | 'worker_assist'
    | 'scope_change'
    | 'scope_reviewing'
    | 'scope_estimating'
    | 'post_job_learning'
    | 'educational_response'
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  failure_reason?: string | null
  updated_at: string
}

export type KaelChatProgressResponse = {
  session_id: string
  progress: KaelChatProgress | null
}

export type KaelLearningCandidateSummary = {
  id: string
  candidate_type: string
  affected_service: ServiceType | null
  affected_problem: string | null
  affected_district: string | null
  confidence: number
  evidence_count: number
  status: LearningCandidateStatus
  audit_reason: string | null
  created_at: string
  updated_at: string
  promoted_at: string | null
  rolled_back_at: string | null
  suggested_payload: Record<string, unknown>
  evidence_snapshot: Record<string, unknown> | null
}

export type KaelLearningCandidateListResponse = {
  candidates: KaelLearningCandidateSummary[]
}

export type KaelLearningCandidateApproveResponse = {
  ok: boolean
  candidate_id: string
  rule_id: string | null
  rule_version: number | null
  status: string
  knowledge_apply: {
    ok: boolean
    error_code: string | null
    knowledge_table: string | null
    record_key: string | null
    knowledge_version: number | null
  } | null
}

export type KaelLearningCandidateRejectResponse = {
  ok: boolean
  candidate_id: string
  status: string
}
