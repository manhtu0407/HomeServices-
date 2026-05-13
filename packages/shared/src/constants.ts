export const SERVICE_TYPES = Object.freeze(['electrical', 'plumbing'] as const)
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const JOB_STATUSES = Object.freeze([
  'pending',
  'broadcast',
  'matched',
  'worker_en_route',
  'inspecting',
  'in_progress',
  'scope_change',
  'completed',
  'confirmed',
  'paid',
  'cancelled',
] as const)
export type JobStatus = (typeof JOB_STATUSES)[number]

export const COMPLEXITY_LEVELS = Object.freeze(['small', 'medium', 'large'] as const)
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number]

export const USER_ROLES = Object.freeze(['customer', 'worker', 'admin'] as const)
export type UserRole = (typeof USER_ROLES)[number]

export const MESSAGE_SENDERS = Object.freeze(['customer', 'worker', 'kael'] as const)
export type MessageSender = (typeof MESSAGE_SENDERS)[number]

export const BROADCAST_STATUSES = Object.freeze(['pending', 'accepted', 'declined', 'expired'] as const)
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number]

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
