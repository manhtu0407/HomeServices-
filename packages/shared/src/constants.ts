export const SERVICE_TYPES = Object.freeze(['electrical', 'plumbing'] as const)
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const JOB_STATUSES = Object.freeze([
  'draft',
  'analyzing',
  'estimate_ready',
  'awaiting_customer_confirm',
  'broadcasting',
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
  'confirmed_by_customer',
  'payment_pending',
  'paid',
  'reviewed',
  'cancelled',
] as const)
export type JobStatus = (typeof JOB_STATUSES)[number]

export const COMPLEXITY_LEVELS = Object.freeze(['small', 'medium', 'large'] as const)
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number]

export const USER_ROLES = Object.freeze(['customer', 'worker', 'admin'] as const)
export type UserRole = (typeof USER_ROLES)[number]

export const MESSAGE_SENDERS = Object.freeze(['customer', 'worker', 'kael'] as const)
export type MessageSender = (typeof MESSAGE_SENDERS)[number]

export const BROADCAST_STATUSES = Object.freeze([
  'pending',
  'sent',
  'accepted',
  'declined',
  'expired',
  'reassigned',
  'cancelled',
] as const)
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number]

export const SCOPE_CHANGE_STATUSES = Object.freeze([
  'requested_by_worker',
  'reviewing_by_kael',
  'waiting_customer_decision',
  'approved_by_customer',
  'rejected_by_customer',
  'cancelled',
] as const)
export type ScopeChangeStatus = (typeof SCOPE_CHANGE_STATUSES)[number]

export const WORKER_VERIFICATION_STATUSES = Object.freeze([
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'suspended',
] as const)
export type WorkerVerificationStatus = (typeof WORKER_VERIFICATION_STATUSES)[number]

export const NOTIFICATION_STATUSES = Object.freeze([
  'created',
  'queued',
  'sent',
  'failed',
  'read',
  'archived',
] as const)
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

export const LEARNING_CANDIDATE_STATUSES = Object.freeze([
  'created',
  'pending_evidence',
  'evidence_gate_passed',
  'auto_promoted',
  'rejected',
  'rolled_back',
  'archived',
] as const)
export type LearningCandidateStatus = (typeof LEARNING_CANDIDATE_STATUSES)[number]

export const LEARNING_RULE_STATUSES = Object.freeze([
  'draft',
  'active',
  'monitoring',
  'degraded',
  'disabled',
  'rolled_back',
] as const)
export type LearningRuleStatus = (typeof LEARNING_RULE_STATUSES)[number]

export const PLATFORM_FEE_CUSTOMER = 0.075
export const PLATFORM_FEE_WORKER = 0.10

export const PROBLEM_CHIPS = Object.freeze({
  electrical: Object.freeze([
    'Mất điện một phòng',
    'Mất điện toàn căn',
    'Ổ cắm/công tắc hỏng',
    'Cầu dao trip',
    'Đèn chập chờn',
    'Lắp thêm thiết bị',
    'Vấn đề khác',
  ] as const),
  plumbing: Object.freeze([
    'Ống rò rỉ',
    'Tắc cống/bồn',
    'Vòi hỏng',
    'Toilet không xả',
    'Áp nước yếu',
    'Lắp/thay thiết bị',
    'Vấn đề khác',
  ] as const),
} as const)

export const REVIEW_TAGS = Object.freeze([
  'Đúng giờ',
  'Chuyên nghiệp',
  'Sạch sẽ',
  'Giải thích rõ',
  'Giá hợp lý',
] as const)
