import { z } from "zod";
import { SERVICE_TYPES } from "../service-taxonomy.ts";
export { PROBLEM_CHIPS, SERVICE_TYPES } from "../service-taxonomy.ts";
export type { ServiceType } from "../service-taxonomy.ts";
export const JOB_STATUSES = Object.freeze(
  [
    "draft",
    "analyzing",
    "estimate_ready",
    "awaiting_customer_confirm",
    "broadcasting",
    "worker_candidate_pending",
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
  ["customer", "worker", "admin", "admin_operator"] as const,
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
    "manual_review",
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
// The configured base commission. Payment intent creation freezes a lower tier rate when eligible.
export const PLATFORM_FEE_WORKER = 0.15;

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

  // Match diacritic-stripped form
  // so ASCII "Binh Thanh" returned by Google Places autocomplete matches
  // "B\u00ecnh Th\u1ea1nh". Note: NFD does not decompose "\u0110"/"\u0111" \u2014 map them too.
  const stripVi = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u0111/g, "d")
      .replace(/\u0110/g, "D");
  const inputStripped = stripVi(lower);
  for (const [slug, label] of Object.entries(HCMC_DISTRICTS)) {
    if (label.toLowerCase() === lower) return slug as DistrictSlug;
    if (stripVi(label.toLowerCase()) === inputStripped) {
      return slug as DistrictSlug;
    }
  }

  const normalized = inputStripped;
  const numMatch = normalized.match(/^(?:quan|q|district|dist)[\s.]*(\d+)$/i);
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

export const serviceTypeSchema = z.enum(SERVICE_TYPES);
export const clientRequestIdSchema = z.uuidv4();
export const uuidPathPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
