import { z } from "zod";

export const SERVICE_TYPES = Object.freeze([
  "electrical",
  "plumbing",
  "cleaning",
] as const);
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const JOB_STATUSES = Object.freeze(
  [
    "draft",
    "analyzing",
    "estimate_ready",
    "awaiting_customer_confirm",
    "broadcasting",
    "worker_matched",
    "worker_on_way",
    "arrived",
    "inspecting",
    "repairing",
    "scope_change_pending",
    "completed_by_worker",
    "confirmed_by_customer",
    "payment_pending",
    "paid",
    "reviewed",
    "cancelled",
  ] as const,
);
export type JobStatus = (typeof JOB_STATUSES)[number];

export const COMPLEXITY_LEVELS = Object.freeze(
  [
    "small",
    "medium",
    "large",
  ] as const,
);
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];

export const USER_ROLES = Object.freeze(
  ["customer", "worker", "admin"] as const,
);
export type UserRole = (typeof USER_ROLES)[number];

export const MESSAGE_SENDERS = Object.freeze(
  ["customer", "worker", "kael"] as const,
);
export type MessageSender = (typeof MESSAGE_SENDERS)[number];

export const BROADCAST_STATUSES = Object.freeze(
  [
    "pending",
    "sent",
    "accepted",
    "declined",
    "expired",
    "reassigned",
    "cancelled",
  ] as const,
);
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

export const SCOPE_CHANGE_STATUSES = Object.freeze(
  [
    "requested_by_worker",
    "reviewing_by_kael",
    "waiting_customer_decision",
    "approved_by_customer",
    "rejected_by_customer",
    "cancelled",
  ] as const,
);
export type ScopeChangeStatus = (typeof SCOPE_CHANGE_STATUSES)[number];

export const WORKER_VERIFICATION_STATUSES = Object.freeze(
  [
    "draft",
    "submitted",
    "under_review",
    "approved",
    "rejected",
    "suspended",
  ] as const,
);
export type WorkerVerificationStatus =
  (typeof WORKER_VERIFICATION_STATUSES)[number];

export const NOTIFICATION_STATUSES = Object.freeze(
  [
    "created",
    "queued",
    "sent",
    "failed",
    "read",
    "archived",
  ] as const,
);
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const LEARNING_CANDIDATE_STATUSES = Object.freeze(
  [
    "created",
    "pending_evidence",
    "evidence_gate_passed",
    "auto_promoted",
    "rejected",
    "rolled_back",
    "archived",
  ] as const,
);
export type LearningCandidateStatus =
  (typeof LEARNING_CANDIDATE_STATUSES)[number];

export const LEARNING_RULE_STATUSES = Object.freeze(
  [
    "draft",
    "active",
    "monitoring",
    "degraded",
    "disabled",
    "rolled_back",
  ] as const,
);
export type LearningRuleStatus = (typeof LEARNING_RULE_STATUSES)[number];

export const PLATFORM_FEE_CUSTOMER = 0.075;
export const PLATFORM_FEE_WORKER = 0.10;

export const PROBLEM_CHIPS = Object.freeze({
  electrical: Object.freeze([
    "Mất điện một phòng",
    "Mất điện toàn căn",
    "Ổ cắm/công tắc hỏng",
    "Cầu dao trip",
    "Đèn chập chờn",
    "Lắp thêm thiết bị",
    "Vấn đề khác",
  ] as const),
  plumbing: Object.freeze([
    "Ống rò rỉ",
    "Tắc cống/bồn",
    "Vòi hỏng",
    "Toilet không xả",
    "Áp nước yếu",
    "Lắp/thay thiết bị",
    "Vấn đề khác",
  ] as const),
  cleaning: Object.freeze([
    "Dọn dẹp nhà",
    "Vệ sinh bếp",
    "Vệ sinh phòng tắm",
    "Tổng vệ sinh",
    "Dọn sau sửa chữa",
    "Vệ sinh cửa kính",
    "Vấn đề khác",
  ] as const),
} as const);

export const REVIEW_TAGS = Object.freeze([
  "Đúng giờ",
  "Chuyên nghiệp",
  "Sạch sẽ",
  "Giải thích rõ",
  "Giá hợp lý",
] as const);

export const HCMC_DISTRICTS = Object.freeze(
  {
    hcmc_all: "Toàn TP.HCM",
    q1: "Quận 1",
    q3: "Quận 3",
    q4: "Quận 4",
    q5: "Quận 5",
    q6: "Quận 6",
    q7: "Quận 7",
    q8: "Quận 8",
    q10: "Quận 10",
    q11: "Quận 11",
    q12: "Quận 12",
    binh_thanh: "Bình Thạnh",
    thu_duc: "Thủ Đức",
    tan_binh: "Tân Bình",
    go_vap: "Gò Vấp",
    phu_nhuan: "Phú Nhuận",
    binh_tan: "Bình Tân",
    tan_phu: "Tân Phú",
    hoc_mon: "Hóc Môn",
    binh_chanh: "Bình Chánh",
    cu_chi: "Củ Chi",
    nha_be: "Nhà Bè",
    can_gio: "Cần Giờ",
  } as const,
);

export type DistrictSlug = keyof typeof HCMC_DISTRICTS;
export const DEFAULT_DISTRICT: DistrictSlug = "hcmc_all";

export function normalizeDistrict(
  input: string | null | undefined,
): DistrictSlug {
  if (!input) return DEFAULT_DISTRICT;
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_DISTRICT;

  if (Object.prototype.hasOwnProperty.call(HCMC_DISTRICTS, trimmed)) {
    return trimmed as DistrictSlug;
  }

  const lower = trimmed.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(HCMC_DISTRICTS, lower)) {
    return lower as DistrictSlug;
  }

  for (const [slug, label] of Object.entries(HCMC_DISTRICTS)) {
    if (label.toLowerCase() === lower) return slug as DistrictSlug;
  }

  const normalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const numMatch = normalized.match(/^(?:quan|q)[\s.]*(\d+)$/i);
  if (numMatch) {
    const districtNumber = numMatch[1];
    if (districtNumber === "2" || districtNumber === "9") return "thu_duc";
    const slug = `q${districtNumber}`;
    if (Object.prototype.hasOwnProperty.call(HCMC_DISTRICTS, slug)) {
      return slug as DistrictSlug;
    }
  }

  return DEFAULT_DISTRICT;
}

export function normalizeServiceAreaDistrict(
  input: string | null | undefined,
): Exclude<DistrictSlug, "hcmc_all"> | null {
  const canonical = normalizeDistrict(input);
  if (canonical === DEFAULT_DISTRICT) return null;
  return canonical as Exclude<DistrictSlug, "hcmc_all">;
}

export const serviceTypeSchema = z.enum(["electrical", "plumbing", "cleaning"]);

export const jobCreateSchema = z.object({
  service_type: serviceTypeSchema,
  description: z.string().min(10).max(2000),
  problem_chips: z.array(z.string().max(100)).min(1).max(10),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  address_building: z.string().max(200).optional(),
  address_unit: z.string().max(50).optional(),
  address_floor: z.string().max(10).optional(),
  address_district: z.string().max(100).optional(),
  scheduled_at: z.string().datetime().optional(),
});

export const kaelChatCreateSchema = z.object({
  service_type: serviceTypeSchema,
  session_id: z.string().uuid().optional(),
  message: z.string().min(1).max(5000).optional(),
  problem_chips: z.array(z.string().max(100)).max(10).default([]),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  address_label: z.string().max(200).optional(),
  address_district: z.string().max(100).optional(),
});

export const kaelChatTurnSchema = z.object({
  message: z.string().min(1).max(5000),
  problem_chips: z.array(z.string().max(100)).max(10).optional(),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  address_label: z.string().max(200).optional(),
  address_district: z.string().max(100).optional(),
});

export const placesAutocompleteSchema = z.object({
  input: z.string().trim().min(2).max(160),
  session_token: z.string().max(120).optional(),
});

export const jobMessageSendSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const reviewSchema = z.object({
  job_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().max(50)).max(10).default([]),
  comment: z.string().max(1000).optional(),
});

function isRealCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

export const workerRegisterSchema = z.object({
  legal_name: z.string().min(2).max(200),
  date_of_birth: z
    .string()
    .refine(
      isRealCalendarDate,
      "date_of_birth must be a real calendar date in YYYY-MM-DD",
    ),
  gender: z.enum(["male", "female", "other"]).optional(),
  service_types: z.array(serviceTypeSchema).min(1).max(3),
  years_experience: z.number().int().min(0).max(60),
  districts: z.array(z.string().min(1).max(50)).min(1).max(20),
  home_lat: z.number().min(-90).max(90).optional(),
  home_lng: z.number().min(-180).max(180).optional(),
  service_radius_km: z.number().int().min(1).max(30).optional(),
  problem_specializations: z.array(z.string().min(1).max(100)).max(20).optional(),
  cccd_front_url: z.string().url(),
  cccd_back_url: z.string().url(),
  selfie_url: z.string().url(),
  bank_account: z.string().min(6).max(50),
  bank_name: z.string().min(2).max(100),
});

export const availabilityToggleSchema = z.object({
  is_available: z.boolean(),
});

// Phase 2.0 (2026-05-23): worker không đề xuất giá ở B6. Kael compute new
// estimate từ original context + worker's reported scope. Schema accept
// description + reason + photo_urls only.
export const workerScopeChangeSchema = z.object({
  new_description: z.string().min(10).max(2000),
  reason: z.string().min(10).max(1000),
  photo_urls: z.array(z.string().url()).max(5).default([]),
});

export const kaelWorkerClarifySchema = z.object({
  question: z.string().min(3).max(1000),
});

export const workerCancellationRequestSchema = z.object({
  reason: z.string().min(10).max(1000),
  evidence_photo_urls: z.array(z.string().url()).max(5).default([]),
});

export const customerCancellationRequestSchema = z.object({
  reason_code: z.string().trim().min(3).max(120),
  reason_note: z.string().trim().min(3).max(1000).optional(),
  requested_at: z.string().datetime().optional(),
});

export const disputeOpenRequestSchema = z.object({
  dispute_type: z.enum([
    "completion_rejected",
    "damage_claim",
    "unpaid_service",
    "abusive_behavior_customer",
    "abusive_behavior_worker",
    "scope_disagreement_post_job",
    "other",
  ]),
  initiator_statement: z.string().trim().min(10).max(2000),
  evidence_photo_urls: z.array(z.string().min(10).max(500)).max(5).default([]),
});

export const disputeCounterStatementSchema = z.object({
  statement: z.string().trim().min(10).max(2000),
});

export const disputeAdminDecisionSchema = z.object({
  outcome: z.enum([
    "customer_favor_full",
    "customer_favor_partial",
    "worker_favor",
    "no_fault_both",
    "mutual_warning",
  ]),
  refund_amount: z.number().int().nonnegative().optional(),
  worker_credit_amount: z.number().int().nonnegative().optional(),
  customer_trust_impact: z.enum(["none", "minor_down", "major_down", "positive_resolved"]),
  worker_action: z.enum(["none", "warning", "temp_suspend_7d", "temp_suspend_30d", "permanent_suspend"]),
  reasoning: z.string().trim().min(50).max(2000),
});

export const workerCancellationDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  review_note: z.string().max(1000).optional(),
});

export const jobMediaAttachSchema = z.object({
  assets: z.array(z.object({
    object_path: z.string().min(10).max(500),
    stage: z.enum(["before", "after", "kael_reference", "cancellation_evidence", "scope_change_evidence"]),
    mime_type: z.string().min(3).max(120).optional(),
    file_size_bytes: z.number().int().min(0).max(26_214_400).optional(),
  })).min(1).max(5),
});

export const devicePushTokenSchema = z.object({
  platform: z.enum(["ios", "android", "web", "unknown"]),
  push_token: z.string().min(8).max(4096),
  permission_status: z.enum(["granted", "denied", "undetermined"]),
  safe_metadata: z.record(z.string(), z.unknown()).default({}),
});

export const customerScopeDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

export function sanitizeForLLM(input: string): string {
  let cleaned = "";
  for (const char of input) {
    const code = char.charCodeAt(0);
    const allowedControl = code === 9 || code === 10 || code === 13;
    if ((code < 32 && !allowedControl) || code === 127) continue;
    cleaned += char;
  }
  return cleaned.trim().slice(0, 5000);
}

export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type KaelChatCreateInput = z.infer<typeof kaelChatCreateSchema>;
export type KaelChatTurnInput = z.infer<typeof kaelChatTurnSchema>;
export type PlacesAutocompleteInput = z.infer<typeof placesAutocompleteSchema>;
export type JobMessageSendInput = z.infer<typeof jobMessageSendSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type WorkerRegisterInput = z.infer<typeof workerRegisterSchema>;
export type AvailabilityToggleInput = z.infer<typeof availabilityToggleSchema>;
export type WorkerScopeChangeInput = z.infer<typeof workerScopeChangeSchema>;
export type KaelWorkerClarifyInput = z.infer<typeof kaelWorkerClarifySchema>;
export type WorkerCancellationRequestInput = z.infer<
  typeof workerCancellationRequestSchema
>;
export type CustomerCancellationRequestInput = z.infer<
  typeof customerCancellationRequestSchema
>;
export type DisputeOpenRequestInput = z.infer<typeof disputeOpenRequestSchema>;
export type DisputeCounterStatementInput = z.infer<
  typeof disputeCounterStatementSchema
>;
export type DisputeAdminDecisionInput = z.infer<
  typeof disputeAdminDecisionSchema
>;
export type WorkerCancellationDecisionInput = z.infer<
  typeof workerCancellationDecisionSchema
>;
export type JobMediaAttachInput = z.infer<typeof jobMediaAttachSchema>;
export type DevicePushTokenInput = z.infer<typeof devicePushTokenSchema>;
export type CustomerScopeDecisionInput = z.infer<
  typeof customerScopeDecisionSchema
>;
