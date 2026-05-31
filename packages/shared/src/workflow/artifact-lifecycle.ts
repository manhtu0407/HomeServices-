export const WORKFLOW_ARTIFACT_TYPES = Object.freeze([
  'service_request',
  'process_ticket',
  'ai_diagnosis',
  'ai_notes',
  'estimate',
  'worker_brief',
  'provider_match',
  'booking',
  'scope_change',
  'cancellation_review',
  'completion_evidence',
  'completion_review',
  'dispute_decision',
  'payment_decision',
  'review',
] as const)

export type WorkflowArtifactType = (typeof WORKFLOW_ARTIFACT_TYPES)[number]

export const WORKFLOW_ARTIFACT_MODES = Object.freeze([
  'hidden',
  'basic',
  'loading',
  'partial',
  'annotated',
  'review',
  'final',
  'done',
  'blocked',
  'failed',
] as const)

export type WorkflowArtifactMode = (typeof WORKFLOW_ARTIFACT_MODES)[number]

export const ARTIFACT_LIFECYCLE_BY_TYPE = Object.freeze({
  service_request: Object.freeze(['hidden', 'basic', 'partial', 'review', 'final', 'done', 'blocked', 'failed']),
  process_ticket: Object.freeze([
    'hidden',
    'basic',
    'loading',
    'partial',
    'annotated',
    'review',
    'final',
    'done',
    'blocked',
    'failed',
  ]),
  ai_diagnosis: Object.freeze(['hidden', 'loading', 'partial', 'annotated', 'review', 'final', 'blocked', 'failed']),
  ai_notes: Object.freeze(['hidden', 'loading', 'partial', 'annotated', 'review', 'final', 'blocked', 'failed']),
  estimate: Object.freeze(['hidden', 'loading', 'partial', 'review', 'final', 'blocked', 'failed']),
  worker_brief: Object.freeze(['hidden', 'loading', 'partial', 'final', 'done', 'blocked', 'failed']),
  provider_match: Object.freeze(['hidden', 'loading', 'partial', 'final', 'done', 'blocked', 'failed']),
  booking: Object.freeze(['hidden', 'basic', 'loading', 'final', 'done', 'blocked', 'failed']),
  scope_change: Object.freeze(['hidden', 'loading', 'review', 'final', 'done', 'blocked', 'failed']),
  cancellation_review: Object.freeze(['hidden', 'review', 'final', 'done', 'blocked', 'failed']),
  completion_evidence: Object.freeze(['hidden', 'loading', 'review', 'final', 'done', 'blocked', 'failed']),
  completion_review: Object.freeze(['hidden', 'review', 'final', 'done', 'blocked', 'failed']),
  dispute_decision: Object.freeze(['hidden', 'review', 'final', 'done', 'blocked', 'failed']),
  payment_decision: Object.freeze(['hidden', 'review', 'final', 'done', 'blocked', 'failed']),
  review: Object.freeze(['hidden', 'review', 'final', 'done', 'blocked']),
} satisfies Record<WorkflowArtifactType, readonly WorkflowArtifactMode[]>)

export function getArtifactLifecycle(type: WorkflowArtifactType): readonly WorkflowArtifactMode[] {
  return ARTIFACT_LIFECYCLE_BY_TYPE[type]
}

export function isWorkflowArtifactMode(value: string): value is WorkflowArtifactMode {
  return (WORKFLOW_ARTIFACT_MODES as readonly string[]).includes(value)
}
