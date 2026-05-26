export type WorkerCancellationExpectedCategory =
  | "legit_auto_approve"
  | "legit_with_admin_review"
  | "suspicious"
  | "no_reason";

export type WorkerCancellationReasonCode =
  | "medical_emergency_with_evidence"
  | "family_emergency_confirmed"
  | "vehicle_breakdown_with_photo"
  | "job_more_complex_than_described"
  | "unsafe_conditions_on_site"
  | "customer_not_responding_at_site"
  | "higher_pay_elsewhere"
  | "changed_mind"
  | "unable_to_find_address"
  | "no_reason";

export type WorkerCancellationClassification = {
  readonly category: WorkerCancellationExpectedCategory;
  readonly reasonCode: WorkerCancellationReasonCode;
  readonly autoApprove: boolean;
  readonly adminReviewRequired: boolean;
  readonly evidenceRequired: boolean;
};

export type WorkerCancellationFallbackOption = {
  readonly id: "wait_15_minutes" | "reschedule" | "cancel_no_charge";
  readonly label_vi: string;
  readonly effect:
    | "continue_rebroadcast_search"
    | "reschedule_job"
    | "cancel_without_charge";
  readonly no_charge_phase0?: true;
};

export type WorkerNoShowDetectionInput = {
  readonly jobStatus: string;
  readonly matchedAt: string | null;
  readonly scheduledAt: string | null;
  readonly now?: string;
};

export type WorkerNoShowDetection = {
  readonly triggered: boolean;
  readonly reasonCode: "none" | "status_stuck_after_match" | "eta_past_no_on_way";
  readonly minutesLate: number;
};

export type WorkerCancellationAbuseInput = {
  readonly completedJobs30d: number;
  readonly cancellations30d: number;
  readonly consecutiveCancellations: number;
  readonly noReasonCancellations30d: number;
  readonly cancellationsAfterArrival30d: number;
};

export type WorkerCancellationAbuseSignal =
  | "cancellation_rate_exceeded"
  | "consecutive_cancel_threshold"
  | "no_reason_cancel_threshold"
  | "cancel_after_arrival_threshold";

export type WorkerCancellationAbuseEvaluation = {
  readonly cancellationRate: number;
  readonly signals: readonly WorkerCancellationAbuseSignal[];
  readonly adminReviewRequired: boolean;
  readonly queuePriority: "none" | "medium";
  readonly suspensionAction: "none" | "admin_review_required";
  readonly redFlagPatch: Record<string, boolean>;
};

export type RecordWorkerCancellationReviewInput = {
  readonly jobId: string | null;
  readonly workerId: string | null;
  readonly cancellationId: string | null;
  readonly reason: string;
  readonly classification: WorkerCancellationClassification;
  readonly abuse: WorkerCancellationAbuseEvaluation;
  readonly subCase: "explicit_cancel" | "no_show";
};

export type WorkerCancellationReviewDbClient = {
  from(table: string): {
    select(columns?: string): WorkerCancellationReviewQuery;
    insert(value: unknown): PromiseLike<WorkerCancellationDbResult>;
    upsert(value: unknown): PromiseLike<WorkerCancellationDbResult>;
  };
};

type WorkerCancellationReviewQuery = {
  eq(column: string, value: unknown): WorkerCancellationReviewQuery;
  maybeSingle(): PromiseLike<WorkerCancellationDbResult>;
};

type WorkerCancellationDbResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

const FALLBACK_OPTIONS: readonly WorkerCancellationFallbackOption[] = [
  {
    id: "wait_15_minutes",
    label_vi: "Đợi 15 phút để Kael tìm tiếp",
    effect: "continue_rebroadcast_search",
  },
  {
    id: "reschedule",
    label_vi: "Đổi sang khung giờ khác",
    effect: "reschedule_job",
  },
  {
    id: "cancel_no_charge",
    label_vi: "Hủy việc, chưa tính phí trong Phase 0",
    effect: "cancel_without_charge",
    no_charge_phase0: true,
  },
];

export function classifyWorkerCancellationReason(input: {
  readonly reason: string;
  readonly evidencePhotoUrls?: readonly string[];
}): WorkerCancellationClassification {
  const normalized = normalizeText(input.reason);
  const evidenceCount = input.evidencePhotoUrls?.length ?? 0;

  if (!normalized.trim()) {
    return classification("no_reason", "no_reason", false, true, false);
  }

  if (evidenceCount > 0) {
    if (hasAny(normalized, ["y te", "tai nan", "benh", "medical", "hospital"])) {
      return classification(
        "legit_auto_approve",
        "medical_emergency_with_evidence",
        true,
        false,
        true,
      );
    }
    if (hasAny(normalized, ["gia dinh", "nguoi than", "family emergency"])) {
      return classification(
        "legit_auto_approve",
        "family_emergency_confirmed",
        true,
        false,
        true,
      );
    }
    if (hasAny(normalized, ["xe", "hong xe", "be banh", "vehicle", "breakdown"])) {
      return classification(
        "legit_auto_approve",
        "vehicle_breakdown_with_photo",
        true,
        false,
        true,
      );
    }
  }

  if (hasAny(normalized, ["phuc tap", "mo ta", "khac mo ta", "complex", "scope"])) {
    return classification(
      "legit_with_admin_review",
      "job_more_complex_than_described",
      false,
      true,
      false,
    );
  }
  if (hasAny(normalized, ["khong an toan", "nguy hiem", "mui khet", "day tran", "unsafe"])) {
    return classification(
      "legit_with_admin_review",
      "unsafe_conditions_on_site",
      false,
      true,
      false,
    );
  }
  if (hasAny(normalized, ["khach khong phan hoi", "khong phan hoi", "khach vang", "no response"])) {
    return classification(
      "legit_with_admin_review",
      "customer_not_responding_at_site",
      false,
      true,
      false,
    );
  }
  if (hasAny(normalized, ["tra cao hon", "cho khac", "viec khac", "higher pay"])) {
    return classification("suspicious", "higher_pay_elsewhere", false, true, false);
  }
  if (hasAny(normalized, ["khong tim", "dia chi", "lac duong", "find address"])) {
    return classification("suspicious", "unable_to_find_address", false, true, false);
  }
  if (hasAny(normalized, ["doi y", "khong muon", "changed mind"])) {
    return classification("suspicious", "changed_mind", false, true, false);
  }

  return classification("suspicious", "changed_mind", false, true, false);
}

export function detectWorkerNoShow(
  input: WorkerNoShowDetectionInput,
): WorkerNoShowDetection {
  if (input.jobStatus !== "worker_matched") {
    return { triggered: false, reasonCode: "none", minutesLate: 0 };
  }

  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const scheduledMs = input.scheduledAt ? Date.parse(input.scheduledAt) : NaN;
  if (Number.isFinite(scheduledMs) && nowMs > scheduledMs) {
    return {
      triggered: true,
      reasonCode: "eta_past_no_on_way",
      minutesLate: minutesBetween(scheduledMs, nowMs),
    };
  }

  const matchedMs = input.matchedAt ? Date.parse(input.matchedAt) : NaN;
  if (Number.isFinite(matchedMs)) {
    const minutesLate = minutesBetween(matchedMs, nowMs);
    if (minutesLate > 15) {
      return {
        triggered: true,
        reasonCode: "status_stuck_after_match",
        minutesLate,
      };
    }
  }

  return { triggered: false, reasonCode: "none", minutesLate: 0 };
}

export function evaluateWorkerCancellationAbuse(
  input: WorkerCancellationAbuseInput,
): WorkerCancellationAbuseEvaluation {
  const completedDenominator = Math.max(1, input.completedJobs30d);
  const cancellationRate = input.cancellations30d / completedDenominator;
  const signals: WorkerCancellationAbuseSignal[] = [];

  if (cancellationRate > 0.30) signals.push("cancellation_rate_exceeded");
  if (input.consecutiveCancellations >= 3) signals.push("consecutive_cancel_threshold");
  if (input.noReasonCancellations30d >= 2) signals.push("no_reason_cancel_threshold");
  if (input.cancellationsAfterArrival30d >= 1) {
    signals.push("cancel_after_arrival_threshold");
  }

  const adminReviewRequired = signals.length > 0;
  return {
    cancellationRate,
    signals,
    adminReviewRequired,
    queuePriority: adminReviewRequired ? "medium" : "none",
    suspensionAction: adminReviewRequired ? "admin_review_required" : "none",
    redFlagPatch: adminReviewRequired
      ? { worker_cancellation_abuse_review: true }
      : {},
  };
}

export function buildWorkerCancellationFallbackOptions() {
  return FALLBACK_OPTIONS.map((option) => ({ ...option }));
}

export async function recordWorkerCancellationReview(
  client: WorkerCancellationReviewDbClient,
  input: RecordWorkerCancellationReviewInput,
) {
  if (!input.workerId) return;

  const existing = await client
    .from("worker_kael_memory")
    .select("red_flags, reliability_signals, safe_metadata")
    .eq("worker_id", input.workerId)
    .maybeSingle();
  const existingData = asRecord(existing?.data);
  const redFlags = asRecord(existingData.red_flags);
  const reliabilitySignals = asRecord(existingData.reliability_signals);
  const safeMetadata = asRecord(existingData.safe_metadata);
  const observedAt = new Date().toISOString();

  await client.from("worker_kael_memory").upsert({
    worker_id: input.workerId,
    red_flags: {
      ...redFlags,
      ...input.abuse.redFlagPatch,
    },
    reliability_signals: {
      ...reliabilitySignals,
      last_worker_cancellation_reason: input.classification.reasonCode,
      last_worker_cancellation_category: input.classification.category,
      worker_cancellation_admin_review_required:
        input.classification.adminReviewRequired ||
        input.abuse.adminReviewRequired ||
        input.subCase === "no_show",
    },
    safe_metadata: {
      ...safeMetadata,
      last_worker_cancellation_review: {
        job_id: input.jobId,
        cancellation_id: input.cancellationId,
        reason_code: input.classification.reasonCode,
        reason_category: input.classification.category,
        sub_case: input.subCase,
        abuse_signals: input.abuse.signals,
        sanitized_reason: sanitizeReviewExcerpt(input.reason),
        autonomous_suspension: false,
        observed_at: observedAt,
      },
    },
    last_observed_at: observedAt,
  });

  const queueNeeded = input.classification.adminReviewRequired ||
    input.abuse.adminReviewRequired ||
    input.subCase === "no_show";
  if (!queueNeeded) return;

  await client.from("kael_admin_queue").insert({
    job_id: input.jobId,
    actor_id: input.workerId,
    actor_role: "worker",
    queue_type: input.subCase === "no_show"
      ? "worker_no_show"
      : "worker_cancellation_review",
    priority: "medium",
    status: "open",
    escalation_level: "soft",
    reason_code: input.classification.reasonCode,
    response_summary: input.subCase === "no_show"
      ? "admin_review_worker_no_show"
      : "admin_review_before_suspension",
    safe_metadata: {
      case: "worker_cancel",
      sub_case: input.subCase,
      reason_category: input.classification.category,
      abuse_signals: input.abuse.signals,
      fallback_options: buildWorkerCancellationFallbackOptions(),
      autonomous_suspension: false,
      sanitized_reason: sanitizeReviewExcerpt(input.reason),
    },
  });
}

function classification(
  category: WorkerCancellationExpectedCategory,
  reasonCode: WorkerCancellationReasonCode,
  autoApprove: boolean,
  adminReviewRequired: boolean,
  evidenceRequired: boolean,
): WorkerCancellationClassification {
  return {
    category,
    reasonCode,
    autoApprove,
    adminReviewRequired,
    evidenceRequired,
  };
}

function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

function hasAny(text: string, needles: readonly string[]) {
  return needles.some((needle) => text.includes(needle));
}

function minutesBetween(startMs: number, endMs: number) {
  return Math.max(0, Math.floor((endMs - startMs) / 60000));
}

function sanitizeReviewExcerpt(input: string): string {
  return input
    .replace(/\d{7,}/g, "[redacted-number]")
    .replace(/[^\S\r\n]+/g, " ")
    .trim()
    .slice(0, 240);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
