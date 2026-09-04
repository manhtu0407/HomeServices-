export const SERVICE_TYPES = Object.freeze([
  'electrical',
  'plumbing',
  'cleaning',
  'hvac',
  'upholstery',
  'handyman',
] as const)
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const JOB_STATUSES = Object.freeze([
  'draft',
  'analyzing',
  'estimate_ready',
  'awaiting_customer_confirm',
  'broadcasting',
  'worker_candidate_pending',
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

export const USER_ROLES = Object.freeze(['customer', 'worker', 'admin', 'admin_operator'] as const)
export type UserRole = (typeof USER_ROLES)[number]

export const ADMIN_CAPABILITIES = Object.freeze([
  'operations.read',
  'operations.triage',
  'workers.read',
  'workers.review',
  'workers.manage',
  'transactions.read',
  'finance.read',
  'finance.reconcile',
  'finance.tax.manage',
  'payouts.read',
  'payouts.process',
  'team.read',
  'system.read',
  'system.manage',
] as const)
export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number]

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
  'manual_review',
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
// The configured base commission. Payment intent creation freezes a lower tier rate when eligible.
export const PLATFORM_FEE_WORKER = 0.15

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
  cleaning: Object.freeze([
    'Dọn dẹp nhà',
    'Vệ sinh bếp',
    'Vệ sinh phòng tắm',
    'Tổng vệ sinh',
    'Dọn sau sửa chữa',
    'Vệ sinh cửa kính',
    'Vấn đề khác',
  ] as const),
  hvac: Object.freeze([
    'Vệ sinh điều hòa',
    'Máy lạnh yếu',
    'Máy không mát',
    'Chảy nước',
    'Kêu bất thường',
    'Có mã lỗi',
    'Vấn đề khác',
  ] as const),
  upholstery: Object.freeze([
    'Vệ sinh sofa',
    'Vệ sinh nệm',
    'Vệ sinh rèm',
    'Vệ sinh thảm',
    'Vết bẩn',
    'Mùi hôi/ẩm mốc',
    'Vấn đề khác',
  ] as const),
  handyman: Object.freeze([
    'Khoan/lắp kệ',
    'Lắp thanh rèm',
    'Lắp đèn/thiết bị nhỏ',
    'Sửa bản lề/tay nắm',
    'Lắp thiết bị phòng tắm',
    'Lắp TV/nội thất',
    'Việc nhỏ khác',
  ] as const),
} as const)

export const REVIEW_TAGS = Object.freeze([
  'Đúng giờ',
  'Chuyên nghiệp',
  'Sạch sẽ',
  'Giải thích rõ',
  'Giá hợp lý',
] as const)

// =============================================================================
// HCMC district canonical slugs
//
// Both customer (address_district on jobs) and worker (districts[] on
// worker_profiles) MUST store these snake_case slugs. The matching layer
// (broadcast.ts) compares slugs exactly — without normalization, "Quận 1"
// vs "q1" would silently produce zero-match.
//
// Use normalizeDistrict() at the API boundary (job create, worker register)
// to convert customer/worker-typed input to canonical form.
// =============================================================================

export const HCMC_DISTRICTS = Object.freeze({
  hcmc_all: 'Toàn TP.HCM',
  q1: 'Quận 1',
  q3: 'Quận 3',
  q4: 'Quận 4',
  q5: 'Quận 5',
  q6: 'Quận 6',
  q7: 'Quận 7',
  q8: 'Quận 8',
  q10: 'Quận 10',
  q11: 'Quận 11',
  q12: 'Quận 12',
  binh_thanh: 'Bình Thạnh',
  thu_duc: 'Thủ Đức',
  tan_binh: 'Tân Bình',
  go_vap: 'Gò Vấp',
  phu_nhuan: 'Phú Nhuận',
  binh_tan: 'Bình Tân',
  tan_phu: 'Tân Phú',
  hoc_mon: 'Hóc Môn',
  binh_chanh: 'Bình Chánh',
  cu_chi: 'Củ Chi',
  nha_be: 'Nhà Bè',
  can_gio: 'Cần Giờ',
} as const)

export type DistrictSlug = keyof typeof HCMC_DISTRICTS

export const DEFAULT_DISTRICT: DistrictSlug = 'hcmc_all'

/**
 * Map free-form district input to canonical slug.
 *
 * Matching order:
 *   1. Exact slug ("q1")
 *   2. Case-insensitive slug ("Q1" → "q1")
 *   3. Exact Vietnamese label match ("Quận 1" → "q1")
 *   4. Numbered district patterns ("Quận 1", "Q.1", "quan 1" → "q1")
 *      Legacy "Quận 2" / "Quận 9" inputs map to "thu_duc".
 *   5. Fallback: DEFAULT_DISTRICT ("hcmc_all") — never lies about location
 *
 * Numbered district matching is diacritic-insensitive to stay aligned with
 * the Edge mobile-api boundary.
 */
export function normalizeDistrict(input: string | null | undefined): DistrictSlug {
  if (!input) return DEFAULT_DISTRICT
  const trimmed = input.trim()
  if (!trimmed) return DEFAULT_DISTRICT

  // 1. Exact slug
  if (Object.prototype.hasOwnProperty.call(HCMC_DISTRICTS, trimmed)) {
    return trimmed as DistrictSlug
  }

  // 2. Case-insensitive slug
  const lower = trimmed.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(HCMC_DISTRICTS, lower)) {
    return lower as DistrictSlug
  }

  // 3. Vietnamese label (case-insensitive). Also match the diacritic-stripped
  // form so ASCII "Binh Thanh"
  // returned by Google Places autocomplete matches "B\u00ecnh Th\u1ea1nh". Note: NFD
  // does not decompose "\u0110"/"\u0111", so we map them explicitly to D/d.
  const stripVi = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D')
  const inputStripped = stripVi(lower)
  for (const [slug, label] of Object.entries(HCMC_DISTRICTS)) {
    if (label.toLowerCase() === lower) return slug as DistrictSlug
    if (stripVi(label.toLowerCase()) === inputStripped) {
      return slug as DistrictSlug
    }
  }

  // Keep numbered district parsing aligned with Edge domain.ts: "Quan 1",
  // "quan 1", "Q.1", and "q 1" all normalize to canonical slugs.
  const normalized = inputStripped
  const normalizedNumMatch = normalized.match(/^(?:quan|q|district|dist)[\s.]*(\d+)$/i)
  if (normalizedNumMatch) {
    const districtNumber = normalizedNumMatch[1]
    if (districtNumber === '2' || districtNumber === '9') return 'thu_duc'
    const slug = `q${districtNumber}`
    if (Object.prototype.hasOwnProperty.call(HCMC_DISTRICTS, slug)) {
      return slug as DistrictSlug
    }
  }

  // 4. Numbered district: "quận 1", "Q.1", "q 1", "quan 1"
  // Match leading "qu(ận|an|.)?" then digits.
  const numMatch = lower.match(/^(?:qu[aâă]n|q|district|dist)[\s\.]*(\d+)$/i)
  if (numMatch) {
    const districtNumber = numMatch[1]
    if (districtNumber === '2' || districtNumber === '9') return 'thu_duc'
    const slug = `q${districtNumber}`
    if (Object.prototype.hasOwnProperty.call(HCMC_DISTRICTS, slug)) {
      return slug as DistrictSlug
    }
  }

  return DEFAULT_DISTRICT
}

/**
 * Free-form address labels like
 * "Vinhomes Central Park, Bình Thạnh" need substring scanning to extract the
 * district; `normalizeDistrict` alone returns hcmc_all because the whole
 * string is neither a slug nor a label. We split by common separators and
 * return the first piece that resolves to a real district.
 */
export function extractDistrictFromAddressLabel(
  label: string | null | undefined,
): DistrictSlug {
  if (!label) return DEFAULT_DISTRICT
  const direct = normalizeDistrict(label)
  if (direct !== DEFAULT_DISTRICT) return direct
  const pieces = label
    .split(/[,–—·;|\/]/)
    .map((piece) => piece.trim())
    .filter(Boolean)
  for (const piece of pieces) {
    const candidate = normalizeDistrict(piece)
    if (candidate !== DEFAULT_DISTRICT) return candidate
  }
  return DEFAULT_DISTRICT
}

/**
 * Strict customer dispatch district parser.
 *
 * `normalizeDistrict()` intentionally keeps a city-wide fallback for legacy
 * reads and broad worker coverage. New customer jobs need a concrete district,
 * otherwise we could broadcast an unknown/non-HCMC address as all of HCMC.
 */
export function normalizeServiceAreaDistrict(input: string | null | undefined): Exclude<DistrictSlug, 'hcmc_all'> | null {
  const canonical = normalizeDistrict(input)
  if (canonical === DEFAULT_DISTRICT) return null
  return canonical as Exclude<DistrictSlug, 'hcmc_all'>
}
