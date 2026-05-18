import { z } from "zod";

export const SERVICE_TYPES = Object.freeze(["electrical", "plumbing"] as const);
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

export const PLATFORM_FEE_WORKER = 0.10;

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
    const slug = `q${numMatch[1]}`;
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

export const serviceTypeSchema = z.enum(["electrical", "plumbing"]);

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
  service_types: z.array(serviceTypeSchema).min(1).max(2),
  years_experience: z.number().int().min(0).max(60),
  districts: z.array(z.string().min(1).max(50)).min(1).max(20),
  cccd_front_url: z.string().url(),
  cccd_back_url: z.string().url(),
  selfie_url: z.string().url(),
  bank_account: z.string().min(6).max(50),
  bank_name: z.string().min(2).max(100),
});

export const availabilityToggleSchema = z.object({
  is_available: z.boolean(),
});

export const workerScopeChangeSchema = z
  .object({
    new_description: z.string().min(10).max(2000),
    new_price_min: z.number().int().positive(),
    new_price_max: z.number().int().positive(),
    reason: z.string().min(10).max(1000),
  })
  .refine((d) => d.new_price_max >= d.new_price_min, {
    message: "new_price_max must be >= new_price_min",
    path: ["new_price_max"],
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
export type ReviewInput = z.infer<typeof reviewSchema>;
export type WorkerRegisterInput = z.infer<typeof workerRegisterSchema>;
export type AvailabilityToggleInput = z.infer<typeof availabilityToggleSchema>;
export type WorkerScopeChangeInput = z.infer<typeof workerScopeChangeSchema>;
export type CustomerScopeDecisionInput = z.infer<
  typeof customerScopeDecisionSchema
>;
