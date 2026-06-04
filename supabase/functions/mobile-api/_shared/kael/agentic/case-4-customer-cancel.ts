export type CustomerCancellationExpectedCategory =
  | "no_penalty_anytime"
  | "no_penalty_phase_0"
  | "needs_admin_review"
  | "flag_suspicious";

export type CustomerCancellationReasonCode =
  | "worker_late_significantly"
  | "worker_no_show"
  | "personal_emergency_with_note"
  | "service_issue_resolved_itself"
  | "changed_mind"
  | "found_alternative"
  | "wrong_service_selected"
  | "worker_not_trustworthy_claim"
  | "address_inaccessible"
  | "pricing_disagreement_late"
  | "repeat_cancel_same_day"
  | "multiple_cancel_after_accept"
  | "no_reason_provided";

export type CustomerCancellationSubCase =
  | "before_a7"
  | "after_a7_before_worker_accept"
  | "after_worker_accept"
  | "after_worker_completed_trigger_dispute"
  | "scheduled_job";

export type CustomerCancellationClassification = {
  readonly category: CustomerCancellationExpectedCategory;
  readonly reasonCode: CustomerCancellationReasonCode;
  readonly adminReviewRequired: boolean;
};

export type CustomerCancellationSubCaseDecision = {
  readonly subCase: CustomerCancellationSubCase;
  readonly shouldCancelJob: boolean;
  readonly shouldTriggerDispute: boolean;
  readonly workerGoodwillRequired: boolean;
};

export type CustomerCancellationAbuseInput = {
  readonly cancellations30d: number;
  readonly completedJobs30d: number;
  readonly cancelsAfterAccept30d: number;
  readonly sameDayCancels: number;
  readonly noReasonCancels30d: number;
};

export type CustomerCancellationAbuseSignal =
  | "customer_cancellation_rate_exceeded"
  | "cancel_after_accept_threshold"
  | "same_day_cancel_threshold"
  | "no_reason_cancel_threshold";

export type CustomerCancellationAbuseEvaluation = {
  readonly cancellationRate: number;
  readonly signals: readonly CustomerCancellationAbuseSignal[];
  readonly adminReviewRequired: boolean;
  readonly queuePriority: "none" | "medium";
  readonly trustSignalsPatch: Record<string, boolean>;
};

export type CustomerCancellationPhase0Outcome = {
  readonly customerPenaltyAmount: null;
  readonly workerCompensationAmount: null;
  readonly phase0NoMonetaryPenalty: true;
  readonly workerGoodwill: {
    readonly required: boolean;
    readonly kind: "none" | "phase0_goodwill_note";
    readonly worker_id: string | null;
    readonly amount: null;
  };
};

export type RecordCustomerCancellationReviewInput = {
  readonly jobId: string | null;
  readonly customerId: string | null;
  readonly workerId: string | null;
  readonly cancellationId: string | null;
  readonly reason: string;
  readonly subCase: CustomerCancellationSubCase;
  readonly classification: CustomerCancellationClassification;
  readonly abuse: CustomerCancellationAbuseEvaluation;
  readonly phase0Outcome: CustomerCancellationPhase0Outcome;
};

export type CustomerCancellationReviewDbClient = {
  from(table: import("../../db-types.ts").PublicTableName): {
    select(columns?: string): CustomerCancellationReviewQuery;
    insert(value: unknown): CustomerCancellationReviewQuery;
    upsert(value: unknown): CustomerCancellationReviewQuery;
  };
};

type CustomerCancellationReviewQuery = {
  eq(column: string, value: unknown): CustomerCancellationReviewQuery;
  maybeSingle(): PromiseLike<CustomerCancellationDbResult>;
  then<TResult1 = CustomerCancellationDbResult, TResult2 = never>(
    onfulfilled?: ((value: CustomerCancellationDbResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

type CustomerCancellationDbResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

const CUSTOMER_CANCEL_REASON_BY_CODE: Record<
  CustomerCancellationReasonCode,
  CustomerCancellationExpectedCategory
> = {
  worker_late_significantly: "no_penalty_anytime",
  worker_no_show: "no_penalty_anytime",
  personal_emergency_with_note: "no_penalty_anytime",
  service_issue_resolved_itself: "no_penalty_anytime",
  changed_mind: "no_penalty_phase_0",
  found_alternative: "no_penalty_phase_0",
  wrong_service_selected: "no_penalty_phase_0",
  worker_not_trustworthy_claim: "needs_admin_review",
  address_inaccessible: "needs_admin_review",
  pricing_disagreement_late: "needs_admin_review",
  repeat_cancel_same_day: "flag_suspicious",
  multiple_cancel_after_accept: "flag_suspicious",
  no_reason_provided: "flag_suspicious",
};

export function classifyCustomerCancellationReason(input: {
  readonly reason?: string | null;
  readonly reasonCode?: string | null;
}): CustomerCancellationClassification {
  const code = normalizeReasonCode(input.reasonCode);
  if (code) return classificationForCode(code);

  const normalized = normalizeText(input.reason ?? "");
  if (!normalized.trim() || hasAny(normalized, ["khong co ly do", "no reason"])) {
    return classificationForCode("no_reason_provided");
  }
  if (hasAny(normalized, ["tre", "den muon", "late", "lau qua", "cho them"])) {
    return classificationForCode("worker_late_significantly");
  }
  if (hasAny(normalized, ["khong den", "no show", "vang mat"])) {
    return classificationForCode("worker_no_show");
  }
  if (hasAny(normalized, ["cap cuu", "khac phuc", "tu het", "het su co", "resolved itself"])) {
    return classificationForCode("service_issue_resolved_itself");
  }
  if (hasAny(normalized, ["benh", "tai nan", "emergency", "viec gap"])) {
    return classificationForCode("personal_emergency_with_note");
  }
  if (hasAny(normalized, ["chon nham", "nham dich vu", "wrong service"])) {
    return classificationForCode("wrong_service_selected");
  }
  if (hasAny(normalized, ["doi y", "khong muon", "changed mind"])) {
    return classificationForCode("changed_mind");
  }
  if (hasAny(normalized, ["tim duoc", "nguoi khac", "alternative", "found another"])) {
    return classificationForCode("found_alternative");
  }
  if (hasAny(normalized, ["khong dang tin", "khong tin", "not trustworthy"])) {
    return classificationForCode("worker_not_trustworthy_claim");
  }
  if (hasAny(normalized, ["khong vao duoc", "khong tiep can", "inaccessible"])) {
    return classificationForCode("address_inaccessible");
  }
  if (hasAny(normalized, ["bat dong gia", "gia khong dung", "pricing"])) {
    return classificationForCode("pricing_disagreement_late");
  }

  return classificationForCode("no_reason_provided");
}

export function determineCustomerCancellationSubCase(input: {
  readonly status: string;
  readonly workerId?: string | null;
  readonly scheduledAt?: string | null;
  readonly now?: string;
}): CustomerCancellationSubCaseDecision {
  if (input.status === "completed_by_worker") {
    return {
      subCase: "after_worker_completed_trigger_dispute",
      shouldCancelJob: false,
      shouldTriggerDispute: true,
      workerGoodwillRequired: false,
    };
  }

  if (isFutureScheduled(input.scheduledAt, input.now)) {
    return {
      subCase: "scheduled_job",
      shouldCancelJob: true,
      shouldTriggerDispute: false,
      workerGoodwillRequired: Boolean(input.workerId),
    };
  }

  if (input.status === "awaiting_customer_confirm") {
    return {
      subCase: "before_a7",
      shouldCancelJob: true,
      shouldTriggerDispute: false,
      workerGoodwillRequired: false,
    };
  }

  if (input.status === "broadcasting") {
    return {
      subCase: "after_a7_before_worker_accept",
      shouldCancelJob: true,
      shouldTriggerDispute: false,
      workerGoodwillRequired: false,
    };
  }

  return {
    subCase: "after_worker_accept",
    shouldCancelJob: true,
    shouldTriggerDispute: false,
    workerGoodwillRequired: Boolean(input.workerId),
  };
}

export function buildCustomerCancellationPhase0Outcome(input: {
  readonly subCase: CustomerCancellationSubCase;
  readonly reasonCode: string;
  readonly workerId?: string | null;
}): CustomerCancellationPhase0Outcome {
  const goodwillRequired =
    input.subCase === "after_worker_accept" ||
    input.subCase === "scheduled_job";
  return {
    customerPenaltyAmount: null,
    workerCompensationAmount: null,
    phase0NoMonetaryPenalty: true,
    workerGoodwill: {
      required: goodwillRequired,
      kind: goodwillRequired ? "phase0_goodwill_note" : "none",
      worker_id: goodwillRequired ? input.workerId ?? null : null,
      amount: null,
    },
  };
}

export function evaluateCustomerCancellationAbuse(
  input: CustomerCancellationAbuseInput,
): CustomerCancellationAbuseEvaluation {
  const cancellationRate = input.cancellations30d / Math.max(1, input.completedJobs30d);
  const signals: CustomerCancellationAbuseSignal[] = [];

  if (cancellationRate > 0.30) signals.push("customer_cancellation_rate_exceeded");
  if (input.cancelsAfterAccept30d >= 3) signals.push("cancel_after_accept_threshold");
  if (input.sameDayCancels >= 2) signals.push("same_day_cancel_threshold");
  if (input.noReasonCancels30d >= 3) signals.push("no_reason_cancel_threshold");

  const adminReviewRequired = signals.length > 0;
  return {
    cancellationRate,
    signals,
    adminReviewRequired,
    queuePriority: adminReviewRequired ? "medium" : "none",
    trustSignalsPatch: adminReviewRequired
      ? {
        cancellation_abuser: true,
        customer_cancellation_abuse_review: true,
        require_specific_reason_next_booking: true,
        require_admin_verify_before_next_booking: true,
      }
      : {},
  };
}

export async function recordCustomerCancellationReview(
  client: CustomerCancellationReviewDbClient,
  input: RecordCustomerCancellationReviewInput,
) {
  if (!input.customerId) return;

  const existing = await client
    .from("customer_kael_memory")
    .select("trust_signals, safe_metadata")
    .eq("customer_id", input.customerId)
    .maybeSingle();
  const existingData = asRecord(existing?.data);
  const trustSignals = asRecord(existingData.trust_signals);
  const safeMetadata = asRecord(existingData.safe_metadata);
  const observedAt = new Date().toISOString();

  await client.from("customer_kael_memory").upsert({
    customer_id: input.customerId,
    trust_signals: {
      ...trustSignals,
      ...input.abuse.trustSignalsPatch,
      last_customer_cancellation_reason: input.classification.reasonCode,
      last_customer_cancellation_category: input.classification.category,
    },
    safe_metadata: {
      ...safeMetadata,
      last_customer_cancellation_review: {
        job_id: input.jobId,
        cancellation_id: input.cancellationId,
        worker_id: input.workerId,
        reason_code: input.classification.reasonCode,
        reason_category: input.classification.category,
        sub_case: input.subCase,
        abuse_signals: input.abuse.signals,
        sanitized_reason: sanitizeReviewExcerpt(input.reason),
        phase0_no_monetary_penalty: input.phase0Outcome.phase0NoMonetaryPenalty,
        worker_goodwill: input.phase0Outcome.workerGoodwill,
        autonomous_action: false,
        observed_at: observedAt,
      },
    },
    last_observed_at: observedAt,
  });

  const queueNeeded =
    input.classification.adminReviewRequired ||
    input.abuse.adminReviewRequired ||
    input.subCase === "after_worker_accept" ||
    input.subCase === "after_worker_completed_trigger_dispute";
  if (!queueNeeded) return;

  await client.from("kael_admin_queue").insert({
    job_id: input.jobId,
    actor_id: input.customerId,
    actor_role: "customer",
    queue_type: "customer_cancellation_review",
    priority: "medium",
    status: "open",
    escalation_level: input.subCase === "after_worker_completed_trigger_dispute" ? "hard" : "soft",
    reason_code: input.classification.reasonCode,
    response_summary: input.subCase === "after_worker_completed_trigger_dispute"
      ? "defer_to_case_5_dispute"
      : "customer_cancellation_review",
    safe_metadata: {
      case: "customer_cancel",
      sub_case: input.subCase,
      worker_id: input.workerId,
      reason_category: input.classification.category,
      abuse_signals: input.abuse.signals,
      phase0_no_monetary_penalty: true,
      worker_goodwill: input.phase0Outcome.workerGoodwill,
      sanitized_reason: sanitizeReviewExcerpt(input.reason),
    },
  });
}

export function customerCancellationAbuseFromSignals(
  signals: readonly string[] | null | undefined,
): CustomerCancellationAbuseEvaluation {
  const normalized = (signals ?? []).filter(isCustomerCancellationAbuseSignal);
  const adminReviewRequired = normalized.length > 0;
  return {
    cancellationRate: 0,
    signals: normalized,
    adminReviewRequired,
    queuePriority: adminReviewRequired ? "medium" : "none",
    trustSignalsPatch: adminReviewRequired
      ? {
        cancellation_abuser: true,
        customer_cancellation_abuse_review: true,
        require_specific_reason_next_booking: true,
        require_admin_verify_before_next_booking: true,
      }
      : {},
  };
}

function classificationForCode(
  reasonCode: CustomerCancellationReasonCode,
): CustomerCancellationClassification {
  const category = CUSTOMER_CANCEL_REASON_BY_CODE[reasonCode];
  return {
    category,
    reasonCode,
    adminReviewRequired: category === "needs_admin_review" || category === "flag_suspicious",
  };
}

function normalizeReasonCode(value?: string | null): CustomerCancellationReasonCode | null {
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(CUSTOMER_CANCEL_REASON_BY_CODE, value)) {
    return value as CustomerCancellationReasonCode;
  }
  return null;
}

function isFutureScheduled(scheduledAt?: string | null, now?: string) {
  if (!scheduledAt) return false;
  const scheduledMs = Date.parse(scheduledAt);
  const nowMs = Date.parse(now ?? new Date().toISOString());
  return Number.isFinite(scheduledMs) && Number.isFinite(nowMs) && scheduledMs > nowMs;
}

function isCustomerCancellationAbuseSignal(
  value: string,
): value is CustomerCancellationAbuseSignal {
  return value === "customer_cancellation_rate_exceeded" ||
    value === "cancel_after_accept_threshold" ||
    value === "same_day_cancel_threshold" ||
    value === "no_reason_cancel_threshold";
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

function sanitizeReviewExcerpt(input: string): string {
  return input
    .replace(/\b(?:0|\+?84)?\d{8,10}\b/g, "[redacted-number]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/[^\S\r\n]+/g, " ")
    .trim()
    .slice(0, 240);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
