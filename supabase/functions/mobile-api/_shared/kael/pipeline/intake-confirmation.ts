import { z } from "zod";

import type { EdgeKaelIntakeConfirmation } from "../../../../_shared/contracts.ts";
import { evaluateMessageBoundary } from "../kael-guardrails/boundary-guard.ts";
import {
  getKaelPerformanceProfile,
  KAEL_CASE_WORK_SERVICE_TYPES,
  KAEL_PERFORMANCE_PROFILE_IDS,
  type KaelCaseWorkServiceType,
  type KaelPerformanceProfileId,
} from "../learning/performance-profiles.ts";
import {
  deterministicSafetyGuidance,
  scanIntakeSafetySignals,
} from "../kael-guardrails/electrical-intake-policy.ts";
import { getEnabledKaelPlaybook } from "../learning/playbooks/registry.ts";
import {
  type HcmcScheduleWindow,
  validateFutureHcmcSchedule,
} from "../../platform/scheduling.ts";

const INTAKE_FIELD_KEYS = [
  "service",
  "problem",
  "description",
  "location",
  "schedule",
] as const;

const INTAKE_ISSUE_CODES = [
  "profile_mismatch",
  "problem_missing",
  "description_too_short",
  "service_mismatch",
  "out_of_scope",
  "unsafe_input",
  "location_missing",
  "schedule_invalid",
  "schedule_past",
  "schedule_window_mismatch",
  "safety_attention",
] as const;

const SERVICE_COPY: Record<
  KaelCaseWorkServiceType,
  { en: { focus: string; label: string }; vi: { focus: string; label: string } }
> = {
  electrical: {
    en: {
      focus: "Kael will compare the power state, affected device, symptoms and safe access.",
      label: "Electrical repair",
    },
    vi: {
      focus: "Kael sẽ đối chiếu nguồn điện, thiết bị bị ảnh hưởng, dấu hiệu và khả năng tiếp cận an toàn.",
      label: "Sửa điện",
    },
  },
  plumbing: {
    en: {
      focus: "Kael will compare the leak or blockage, water isolation, affected fixture and access.",
      label: "Plumbing repair",
    },
    vi: {
      focus: "Kael sẽ đối chiếu rò rỉ hoặc tắc nghẽn, khả năng khóa nước, thiết bị và vị trí tiếp cận.",
      label: "Sửa nước",
    },
  },
  cleaning: {
    en: {
      focus: "Kael will compare the area, room count, current condition and requested cleaning depth.",
      label: "Home cleaning",
    },
    vi: {
      focus: "Kael sẽ đối chiếu diện tích, số phòng, hiện trạng và mức độ vệ sinh cần thực hiện.",
      label: "Vệ sinh nhà",
    },
  },
  hvac: {
    en: {
      focus: "Kael will compare the equipment, quantity, operating symptom and access to both units.",
      label: "Air conditioning",
    },
    vi: {
      focus: "Kael sẽ đối chiếu thiết bị, số lượng, dấu hiệu vận hành và vị trí tiếp cận dàn lạnh/dàn nóng.",
      label: "Điều hòa",
    },
  },
  upholstery: {
    en: {
      focus: "Kael will compare the material, item count, stains or odors and drying conditions.",
      label: "Upholstery care",
    },
    vi: {
      focus: "Kael sẽ đối chiếu chất liệu, số lượng, vết bẩn hoặc mùi và điều kiện làm khô.",
      label: "Chăm sóc nội thất",
    },
  },
  handyman: {
    en: {
      focus: "Kael will separate each task and compare quantity, surface, height and available hardware.",
      label: "Minor repair and installation",
    },
    vi: {
      focus: "Kael sẽ tách từng hạng mục, đối chiếu số lượng, bề mặt, độ cao và phụ kiện sẵn có.",
      label: "Sửa vặt và lắp đặt",
    },
  },
};

const FIELD_LABELS = {
  en: {
    description: "Description",
    location: "Location",
    problem: "Problem",
    schedule: "Desired time",
    service: "Service",
  },
  vi: {
    description: "Mô tả",
    location: "Khu vực",
    problem: "Vấn đề",
    schedule: "Thời gian",
    service: "Dịch vụ",
  },
} as const;

const kaelIntakeConfirmationFieldSchema = z.object({
  key: z.enum(INTAKE_FIELD_KEYS),
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(2000),
  state: z.enum(["clear", "attention", "invalid"]),
  note: z.string().min(1).max(500).nullable(),
}).strict();

const kaelIntakeConfirmationIssueSchema = z.object({
  code: z.enum(INTAKE_ISSUE_CODES),
  field: z.enum(INTAKE_FIELD_KEYS),
  severity: z.enum(["attention", "blocking"]),
  message: z.string().min(1).max(500),
}).strict();

const kaelIntakePayloadSchema = z.object({
  service_type: z.enum(KAEL_CASE_WORK_SERVICE_TYPES),
  profile_id: z.enum(KAEL_PERFORMANCE_PROFILE_IDS),
  description: z.string().trim().max(2000),
  problem_chips: z.array(z.string().trim().min(1).max(100)).max(10),
  address_label: z.string().trim().max(200),
  address_district: z.string().trim().max(100),
  scheduled_at: z.string().datetime(),
  schedule_window: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
    time_zone: z.literal("Asia/Ho_Chi_Minh"),
  }).strict(),
}).strict();

export const kaelIntakeConfirmationSchema = z.object({
  version: z.literal(1),
  source: z.literal("booking"),
  status: z.enum(["pending", "confirmed", "correction_requested"]),
  blocking: z.boolean(),
  checked_at: z.string().datetime(),
  confirmed_at: z.string().datetime().nullable(),
  correction_requested_at: z.string().datetime().nullable(),
  focus: z.string().min(1).max(500),
  question: z.string().min(1).max(500),
  fields: z.array(kaelIntakeConfirmationFieldSchema).length(INTAKE_FIELD_KEYS.length),
  issues: z.array(kaelIntakeConfirmationIssueSchema).max(12),
  intake: kaelIntakePayloadSchema,
}).strict();

type KaelIntakeConfirmation = EdgeKaelIntakeConfirmation;
type KaelIntakeConfirmationIssue = z.infer<typeof kaelIntakeConfirmationIssueSchema>;
type KaelIntakeConfirmationInput = {
  actorId?: string | null;
  serviceType: KaelCaseWorkServiceType;
  profileId: KaelPerformanceProfileId;
  description: string;
  problemChips: readonly string[];
  addressLabel: string;
  addressDistrict: string;
  scheduledAt: string;
  scheduleWindow: HcmcScheduleWindow;
  language: "vi" | "en";
};

export function buildKaelIntakeConfirmation(
  input: KaelIntakeConfirmationInput,
  now = new Date(),
): KaelIntakeConfirmation {
  const language = input.language;
  const { description, problemChips, issues } = collectIntakeIssues(input, now);
  const blocking = issues.some((issue) => issue.severity === "blocking");
  const checkedAt = now.toISOString();
  const result: KaelIntakeConfirmation = {
    version: 1,
    source: "booking",
    status: "pending",
    blocking,
    checked_at: checkedAt,
    confirmed_at: null,
    correction_requested_at: null,
    focus: SERVICE_COPY[input.serviceType][language].focus,
    question: blocking
      ? language === "vi"
        ? "Kael phát hiện thông tin cần chỉnh. Bạn kiểm tra lại mục được đánh dấu nhé."
        : "Kael found information that needs correction. Review the marked item."
      : language === "vi"
      ? "Bạn xác nhận các thông tin trên đã đúng để Kael bắt đầu phân tích nhé."
      : "Confirm that the information is correct so Kael can begin its analysis.",
    fields: buildIntakeFields(input, description, problemChips, issues),
    issues,
    intake: {
      service_type: input.serviceType,
      profile_id: input.profileId,
      description,
      problem_chips: problemChips,
      address_label: input.addressLabel.trim(),
      address_district: input.addressDistrict.trim(),
      scheduled_at: input.scheduledAt,
      schedule_window: input.scheduleWindow,
    },
  };
  return kaelIntakeConfirmationSchema.parse(result);
}

function collectIntakeIssues(
  input: KaelIntakeConfirmationInput,
  now: Date,
): {
  description: string;
  problemChips: string[];
  issues: KaelIntakeConfirmationIssue[];
} {
  const language = input.language;
  const description = input.description.trim();
  const problemChips = input.problemChips.map((value) => value.trim()).filter(Boolean).slice(0, 10);
  const issues: KaelIntakeConfirmationIssue[] = [];
  const expectedProfile = getKaelPerformanceProfile(input.serviceType);
  if (!expectedProfile || expectedProfile.id !== input.profileId) {
    issues.push({
      code: "profile_mismatch",
      field: "service",
      severity: "blocking",
      message: language === "vi"
        ? "Cấu hình dịch vụ chưa khớp. Hãy chọn lại dịch vụ."
        : "The service configuration does not match. Choose the service again.",
    });
  }
  if (problemChips.length === 0) {
    issues.push({
      code: "problem_missing",
      field: "problem",
      severity: "blocking",
      message: language === "vi"
        ? "Cần chọn ít nhất một vấn đề cụ thể."
        : "Choose at least one specific problem.",
    });
  }
  if (description.length < 10) {
    issues.push({
      code: "description_too_short",
      field: "description",
      severity: "blocking",
      message: language === "vi"
        ? "Mô tả cần rõ hơn trước khi Kael phân tích."
        : "Add a clearer description before Kael analyzes it.",
    });
  }
  appendBoundaryIssues(issues, input, description);
  appendLocationAndScheduleIssues(issues, input, now);
  appendSafetyIssue(issues, input, description);
  return { description, problemChips, issues };
}

function appendBoundaryIssues(
  issues: KaelIntakeConfirmationIssue[],
  input: KaelIntakeConfirmationInput,
  description: string,
) {
  const boundary = evaluateMessageBoundary(description, input.serviceType, {
    actorId: input.actorId,
    language: input.language,
  });
  if (boundary.ok) return;
  const code = boundary.reason === "service_mismatch"
    ? "service_mismatch"
    : boundary.reason === "out_of_scope"
    ? "out_of_scope"
    : "unsafe_input";
  issues.push({
    code,
    field: "description",
    severity: "blocking",
    message: boundary.declineText,
  });
}

function appendLocationAndScheduleIssues(
  issues: KaelIntakeConfirmationIssue[],
  input: KaelIntakeConfirmationInput,
  now: Date,
) {
  if (!input.addressLabel.trim() || !input.addressDistrict.trim()) {
    issues.push({
      code: "location_missing",
      field: "location",
      severity: "blocking",
      message: input.language === "vi"
        ? "Cần khu vực hợp lệ tại TP.HCM trước khi tiếp tục."
        : "A valid Ho Chi Minh City service area is required.",
    });
  }
  const scheduleError = validateFutureHcmcSchedule(input.scheduledAt, input.scheduleWindow, now);
  if (!scheduleError) return;
  const code = scheduleError === "past"
    ? "schedule_past"
    : scheduleError === "window_mismatch"
    ? "schedule_window_mismatch"
    : "schedule_invalid";
  issues.push({
    code,
    field: "schedule",
    severity: "blocking",
    message: scheduleIssueMessage(scheduleError, input.language),
  });
}

function appendSafetyIssue(
  issues: KaelIntakeConfirmationIssue[],
  input: KaelIntakeConfirmationInput,
  description: string,
) {
  const safetySignals = getEnabledKaelPlaybook(input.serviceType, input.actorId)
    ? scanIntakeSafetySignals(input.serviceType, description)
    : [];
  const safetyMessage = deterministicSafetyGuidance(
    safetySignals,
    input.language,
    input.serviceType,
  );
  if (!safetyMessage) return;
  issues.push({
    code: "safety_attention",
    field: "description",
    severity: "attention",
    message: safetyMessage,
  });
}

function buildIntakeFields(
  input: KaelIntakeConfirmationInput,
  description: string,
  problemChips: readonly string[],
  issues: readonly KaelIntakeConfirmationIssue[],
): KaelIntakeConfirmation["fields"] {
  const issueByField = new Map(
    INTAKE_FIELD_KEYS.map((key) => [key, issues.filter((issue) => issue.field === key)]),
  );
  const field = (key: (typeof INTAKE_FIELD_KEYS)[number], value: string) => {
    const fieldIssues = issueByField.get(key) ?? [];
    return {
      key,
      label: FIELD_LABELS[input.language][key],
      value,
      state: fieldIssues.some((issue) => issue.severity === "blocking")
        ? "invalid" as const
        : fieldIssues.length > 0
        ? "attention" as const
        : "clear" as const,
      note: fieldIssues[0]?.message ?? null,
    };
  };
  return [
    field("service", SERVICE_COPY[input.serviceType][input.language].label),
    field("problem", problemChips.join(", ") || (input.language === "vi" ? "Chưa chọn" : "Not selected")),
    field("description", description || (input.language === "vi" ? "Chưa có" : "Not provided")),
    field("location", input.addressLabel.trim() || input.addressDistrict.trim() ||
      (input.language === "vi" ? "Chưa có" : "Not provided")),
    field("schedule", formatSchedule(input.scheduleWindow, input.language)),
  ];
}

export function updateKaelIntakeConfirmationStatus(
  confirmation: KaelIntakeConfirmation,
  status: "confirmed" | "correction_requested",
  now = new Date(),
) {
  const timestamp = now.toISOString();
  return kaelIntakeConfirmationSchema.parse({
    ...confirmation,
    status,
    confirmed_at: status === "confirmed" ? timestamp : confirmation.confirmed_at,
    correction_requested_at: status === "correction_requested"
      ? timestamp
      : confirmation.correction_requested_at,
  });
}

function formatSchedule(window: HcmcScheduleWindow, language: "vi" | "en") {
  const [year, month, day] = window.date.split("-");
  const date = language === "vi" ? `${day}/${month}/${year}` : `${year}-${month}-${day}`;
  return `${date} · ${window.start}–${window.end}`;
}

function scheduleIssueMessage(
  issue: Exclude<ReturnType<typeof validateFutureHcmcSchedule>, null>,
  language: "vi" | "en",
) {
  if (language === "en") {
    if (issue === "past") return "The desired time has passed. Choose a future time.";
    if (issue === "window_mismatch") return "The date and time do not match. Choose them again.";
    return "The desired time is invalid. Choose it again.";
  }
  if (issue === "past") return "Thời gian mong muốn đã qua. Hãy chọn thời gian trong tương lai.";
  if (issue === "window_mismatch") return "Ngày và giờ chưa khớp nhau. Hãy chọn lại.";
  return "Thời gian mong muốn chưa hợp lệ. Hãy chọn lại.";
}
