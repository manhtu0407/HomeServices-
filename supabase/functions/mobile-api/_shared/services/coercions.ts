// Edge service value coercions (C4 6a, services/* split): pure unknown->typed converters
// plus the Kael-chat enum types. Re-exported through ./_shared.ts so callers import from one place.

import {
  SERVICE_TYPES,
  type ServiceType,
} from "../../../_shared/domain.ts";
import type {
  ComplexityLevel,
  JobStatus,
  LearningCandidateStatus,
  MessageSender,
  WorkerVerificationStatus,
} from "../../../_shared/domain.ts";
import type { KaelChatStatus } from "../../../_shared/contracts.ts";
import type {
  CustomerCancellationAbuseSignal,
  CustomerCancellationSubCase,
  WorkerCancellationAbuseSignal,
  WorkerCancellationExpectedCategory,
  WorkerCancellationReasonCode,
} from "../kael/index.ts";

export type KaelChatTurnRole = "customer" | "kael" | "system";

export type KaelChatContentType =
  | "text"
  | "photo_request"
  | "video_request"
  | "photo_attached"
  | "video_attached"
  | "clarification"
  | "analysis"
  | "estimate"
  | "error";

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function asBoolean(value: unknown): boolean {
  return value === true;
}

export function positiveNumberFrom(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function nullableNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function nullableRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function asComplexity(value: unknown): ComplexityLevel {
  if (value === "small" || value === "medium" || value === "large") {
    return value;
  }
  return "medium";
}

export function asComplexityOrNull(value: unknown): ComplexityLevel | null {
  return value === "small" || value === "medium" || value === "large"
    ? value
    : null;
}

export function nullableComplexity(value: unknown): ComplexityLevel | null {
  if (value === null || value === undefined) return null;
  return asComplexity(value);
}

export function asJobStatus(value: unknown): JobStatus {
  if (
    value === "draft" ||
    value === "analyzing" ||
    value === "estimate_ready" ||
    value === "awaiting_customer_confirm" ||
    value === "broadcasting" ||
    value === "worker_candidate_pending" ||
    value === "worker_matched" ||
    value === "worker_on_way" ||
    value === "arrived" ||
    value === "inspecting" ||
    value === "repairing" ||
    value === "scope_change_pending" ||
    value === "completed_by_worker" ||
    value === "confirmed_by_customer" ||
    value === "payment_pending" ||
    value === "paid" ||
    value === "reviewed" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "draft";
}

export function asWorkerVerificationStatus(value: unknown): WorkerVerificationStatus {
  if (
    value === "draft" ||
    value === "submitted" ||
    value === "under_review" ||
    value === "approved" ||
    value === "rejected" ||
    value === "suspended"
  ) {
    return value;
  }
  return "draft";
}

export function asWorkerCancellationCategory(
  value: unknown,
): WorkerCancellationExpectedCategory | null {
  return value === "legit_auto_approve" ||
      value === "legit_with_admin_review" ||
      value === "suspicious" ||
      value === "no_reason"
    ? value
    : null;
}

export function asWorkerCancellationReasonCode(
  value: unknown,
): WorkerCancellationReasonCode | null {
  if (
    value === "medical_emergency_with_evidence" ||
    value === "family_emergency_confirmed" ||
    value === "vehicle_breakdown_with_photo" ||
    value === "job_more_complex_than_described" ||
    value === "unsafe_conditions_on_site" ||
    value === "customer_not_responding_at_site" ||
    value === "higher_pay_elsewhere" ||
    value === "changed_mind" ||
    value === "unable_to_find_address" ||
    value === "no_reason"
  ) {
    return value;
  }
  return null;
}

export function asWorkerCancellationAbuseSignals(
  value: unknown,
): WorkerCancellationAbuseSignal[] {
  return asStringArray(value).filter((item): item is WorkerCancellationAbuseSignal =>
    item === "cancellation_rate_exceeded" ||
    item === "consecutive_cancel_threshold" ||
    item === "no_reason_cancel_threshold" ||
    item === "cancel_after_arrival_threshold"
  );
}

export function asCustomerCancellationSubCase(value: unknown): CustomerCancellationSubCase {
  if (
    value === "before_a7" ||
    value === "after_a7_before_worker_accept" ||
    value === "after_worker_accept" ||
    value === "after_worker_completed_trigger_dispute" ||
    value === "scheduled_job"
  ) {
    return value;
  }
  return "after_worker_accept";
}

export function asCustomerCancellationAbuseSignals(
  value: unknown,
): CustomerCancellationAbuseSignal[] {
  return asStringArray(value).filter((item): item is CustomerCancellationAbuseSignal =>
    item === "customer_cancellation_rate_exceeded" ||
    item === "cancel_after_accept_threshold" ||
    item === "same_day_cancel_threshold" ||
    item === "no_reason_cancel_threshold"
  );
}

export function asDisputePriority(value: unknown): "low" | "medium" | "high" | "critical" | null {
  return value === "low" ||
      value === "medium" ||
      value === "high" ||
      value === "critical"
    ? value
    : null;
}

export function relatedJob(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return typeof value[0] === "object" && value[0] !== null
      ? value[0] as Record<string, unknown>
      : null;
  }
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

export function asServiceType(value: unknown): ServiceType {
  const serviceType = nullableServiceType(value);
  if (serviceType) return serviceType;
  throw new TypeError("Invalid service_type value");
}

export function nullableServiceType(value: unknown): ServiceType | null {
  return typeof value === "string" &&
      (SERVICE_TYPES as readonly string[]).includes(value)
    ? value as ServiceType
    : null;
}

export function asLearningCandidateStatus(value: unknown): LearningCandidateStatus {
  if (
    value === "created" ||
    value === "pending_evidence" ||
    value === "evidence_gate_passed" ||
    value === "manual_review" ||
    value === "auto_promoted" ||
    value === "rejected" ||
    value === "rolled_back" ||
    value === "archived"
  ) {
    return value;
  }
  return "created";
}

export function asServiceTypeArray(value: unknown): ServiceType[] {
  return asStringArray(value).filter((item): item is ServiceType =>
    (SERVICE_TYPES as readonly string[]).includes(item)
  );
}

export function asMessageSender(value: unknown): MessageSender {
  if (value === "worker" || value === "kael") return value;
  return "customer";
}

export function asKaelChatStatus(value: unknown): KaelChatStatus {
  if (
    value === "active" ||
    value === "collecting_evidence" ||
    value === "estimate_ready" ||
    value === "confirmed" ||
    value === "abandoned" ||
    value === "unsupported"
  ) {
    return value;
  }
  return "active";
}

export function asKaelTurnRole(value: unknown): KaelChatTurnRole {
  if (value === "customer" || value === "kael" || value === "system") {
    return value;
  }
  return "system";
}

export function asKaelContentType(value: unknown): KaelChatContentType {
  if (
    value === "text" ||
    value === "photo_request" ||
    value === "video_request" ||
    value === "photo_attached" ||
    value === "video_attached" ||
    value === "clarification" ||
    value === "analysis" ||
    value === "estimate" ||
    value === "error"
  ) {
    return value;
  }
  return "text";
}

export function asKaelStoredSentiment(
  value: unknown,
): "neutral" | "detail_oriented" | "pressure" | undefined {
  return value === "neutral" || value === "detail_oriented" || value === "pressure"
    ? value
    : undefined;
}
