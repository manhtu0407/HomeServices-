import type {
  ServiceType,
  EdgeWorkerApplicationStatus as WorkerApplicationStatus,
  EdgeWorkerKycStatus as WorkerKycStatus,
  EdgeWorkerReadiness as WorkerReadiness,
  EdgeWorkerReadinessNextAction as WorkerReadinessNextAction,
} from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  asServiceTypeArray,
  asStringArray,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery, workflowDb } from "../../platform/db.ts";

const ACTIVE_JOB_STATUSES = [
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
  "confirmed_by_customer",
];

type ReadinessSnapshot = {
  actorId: string;
  actorRole: string;
  application: Record<string, unknown> | null;
  applicationReview: Record<string, unknown> | null;
  worker: Record<string, unknown> | null;
  activeJob: boolean;
  activeCandidate: boolean;
  activeReservation: boolean;
  pushTokenRegistered: boolean;
  observedAt: string;
};

export async function getWorkerReadiness(
  ctx: MobileApiContext,
): Promise<WorkerReadiness> {
  const client = db(ctx);
  // The application RPC, capacity reservations and review decisions cannot be read with the
  // caller's token; each is scoped below to the caller's own id or application.
  const service = workflowDb(ctx);
  const observedAt = new Date().toISOString();
  const [profileResult, workerResult, applicationResult, jobResult, candidateResult, reservationResult] =
    await Promise.all([
      dbQuery<Record<string, unknown>>(
        client.from("profiles").select("role").eq("id", ctx.user.id).maybeSingle(),
      ),
      dbQuery<Record<string, unknown>>(
        client
          .from("worker_profiles")
          .select(
            "id, verification_status, is_available, is_approved, is_suspended, service_types, selected_service_types, districts, problem_specializations, legal_name, date_of_birth, service_radius_km, cccd_front_url, cccd_back_url, selfie_url, bank_account, bank_name, matching_push_proven_at, matching_foreground_active_until, synthetic_cohort_id",
          )
          .eq("id", ctx.user.id)
          .maybeSingle(),
      ),
      dbQuery<Array<Record<string, unknown>>>(
        service.rpc("get_current_worker_application", { p_actor_id: ctx.user.id }),
      ),
      dbQuery<Array<Record<string, unknown>>>(
        client
          .from("jobs")
          .select("id")
          .eq("worker_id", ctx.user.id)
          .in("status", ACTIVE_JOB_STATUSES)
          .limit(1),
      ),
      dbQuery<Array<Record<string, unknown>>>(
        client
          .from("job_worker_candidates")
          .select("id")
          .eq("worker_id", ctx.user.id)
          .eq("status", "proposed")
          .or(`expires_at.is.null,expires_at.gt.${observedAt}`)
          .limit(1),
      ),
      dbQuery<Array<Record<string, unknown>>>(
        service
          .from("matching_capacity_reservations")
          .select("id")
          .eq("worker_id", ctx.user.id)
          .in("status", ["held", "offered"])
          .gt("expires_at", observedAt)
          .limit(1),
      ),
    ]);

  if (
    profileResult.error || workerResult.error || applicationResult.error || jobResult.error ||
    candidateResult.error || reservationResult.error || !profileResult.data
  ) {
    apiFailure("DB_ERROR", "Không thể tải trạng thái sẵn sàng của thợ", 500);
  }

  const application = applicationResult.data?.[0] ?? null;
  const reviewResult = application?.id
    ? await dbQuery<Record<string, unknown>>(
      service
        .from("admin_worker_application_reviews")
        .select("decision, reason, decided_at")
        .eq("queue_id", application.id)
        .maybeSingle(),
    )
    : { data: null, error: null };
  if (reviewResult.error) {
    apiFailure("DB_ERROR", "Không thể tải kết quả xét duyệt thợ", 500);
  }

  const pushProvenAt = nullableString(workerResult.data?.matching_push_proven_at);
  const pushTokenResult = pushProvenAt
    ? await dbQuery<Array<Record<string, unknown>>>(
      client
        .from("device_push_tokens")
        .select("id")
        .eq("user_id", ctx.user.id)
        .eq("enabled", true)
        .eq("permission_status", "granted")
        .lte("updated_at", pushProvenAt)
        .limit(1),
    )
    : { data: [], error: null };
  if (pushTokenResult.error) {
    apiFailure("DB_ERROR", "Không thể tải trạng thái nhận thông báo", 500);
  }

  return deriveWorkerReadiness({
    actorId: ctx.user.id,
    actorRole: String(profileResult.data.role ?? ctx.role),
    application,
    applicationReview: reviewResult.data,
    worker: workerResult.data,
    activeJob: Boolean(jobResult.data?.length),
    activeCandidate: Boolean(candidateResult.data?.length),
    activeReservation: Boolean(reservationResult.data?.length),
    pushTokenRegistered: Boolean(pushTokenResult.data?.length),
    observedAt,
  });
}

export function deriveWorkerReadiness(snapshot: ReadinessSnapshot): WorkerReadiness {
  const worker = snapshot.worker;
  const application = deriveApplication(snapshot);
  const verificationStatus = workerKycStatus(worker?.verification_status);
  const services = asServiceTypeArray(
    Array.isArray(worker?.selected_service_types) && worker.selected_service_types.length > 0
      ? worker.selected_service_types
      : worker?.service_types,
  );
  const districts = asStringArray(worker?.districts);
  const capabilities = asStringArray(worker?.problem_specializations);
  const missingFields = workerMissingKycFields(worker);
  const approved = Boolean(worker?.is_approved) && verificationStatus === "approved";
  const suspended = Boolean(worker?.is_suspended) || verificationStatus === "suspended";
  const available = Boolean(worker?.is_available);
  const pushProvenAt = nullableString(worker?.matching_push_proven_at);
  const foregroundActiveUntil = nullableString(worker?.matching_foreground_active_until);
  const observedMs = Date.parse(snapshot.observedAt);
  const pushProven = snapshot.pushTokenRegistered && isWithinPastHours(pushProvenAt, observedMs, 24);
  const foregroundActive = isAtOrAfter(foregroundActiveUntil, observedMs);
  const reachabilityStatus = pushProven
    ? "push_proven" as const
    : foregroundActive
    ? "foreground_active" as const
    : "unproven" as const;
  const reasonCodes = readinessReasonCodes({
    applicationStatus: application.status,
    verificationStatus,
    missingFields,
    approved,
    suspended,
    services,
    districts,
    capabilities,
    available,
    activeJob: snapshot.activeJob,
    activeCandidate: snapshot.activeCandidate,
    activeReservation: snapshot.activeReservation,
    reachable: reachabilityStatus !== "unproven",
    synthetic: Boolean(worker?.synthetic_cohort_id),
  });

  return {
    worker_id: snapshot.actorId,
    application,
    kyc: { status: verificationStatus, missing_fields: missingFields },
    services,
    districts,
    capabilities,
    availability: { enabled: available, approved, suspended },
    capacity: {
      active_job: snapshot.activeJob,
      active_candidate: snapshot.activeCandidate,
      active_reservation: snapshot.activeReservation,
    },
    reachability: {
      status: reachabilityStatus,
      push_token_registered: snapshot.pushTokenRegistered,
      push_proven_at: pushProvenAt,
      foreground_active_until: foregroundActiveUntil,
    },
    ready_for_matching: reasonCodes.length === 0,
    next_action: nextReadinessAction(reasonCodes),
    reason_codes: reasonCodes,
    observed_at: snapshot.observedAt,
  };
}

function deriveApplication(snapshot: ReadinessSnapshot): WorkerReadiness["application"] {
  const queue = snapshot.application;
  const review = snapshot.applicationReview;
  const decision = nullableString(review?.decision) ?? nullableString(asRecord(queue?.safe_metadata).decision);
  const status: WorkerApplicationStatus = decision === "approve" || (!queue && snapshot.actorRole === "worker")
    ? "approved"
    : decision === "request_changes"
    ? "changes_requested"
    : decision === "reject"
    ? "rejected"
    : queue
    ? "pending_review"
    : "not_submitted";
  return {
    application_id: nullableString(queue?.id),
    status,
    submitted_at: nullableString(queue?.created_at),
    decided_at: nullableString(review?.decided_at) ?? nullableString(asRecord(queue?.safe_metadata).decided_at),
    reason: nullableString(review?.reason),
    can_submit: status === "not_submitted" || status === "changes_requested",
    can_resume: status === "changes_requested",
  };
}

function workerKycStatus(value: unknown): WorkerKycStatus {
  return value === "draft" || value === "submitted" || value === "under_review" ||
      value === "approved" || value === "rejected" || value === "suspended"
    ? value
    : "not_available";
}

function workerMissingKycFields(worker: Record<string, unknown> | null): string[] {
  if (!worker) return ["worker_profile"];
  const missing: string[] = [];
  if (!nullableString(worker.legal_name)) missing.push("legal_name");
  if (!nullableString(worker.date_of_birth)) missing.push("date_of_birth");
  if (asServiceTypeArray(worker.service_types).length === 0) missing.push("service_types");
  if (asStringArray(worker.districts).length === 0) missing.push("districts");
  if (typeof worker.service_radius_km !== "number") missing.push("service_radius_km");
  if (!nullableString(worker.cccd_front_url)) missing.push("cccd_front");
  if (!nullableString(worker.cccd_back_url)) missing.push("cccd_back");
  if (!nullableString(worker.selfie_url)) missing.push("selfie");
  if (!nullableString(worker.bank_account)) missing.push("bank_account");
  if (!nullableString(worker.bank_name)) missing.push("bank_name");
  return missing;
}

function readinessReasonCodes(input: {
  applicationStatus: WorkerApplicationStatus;
  verificationStatus: WorkerKycStatus;
  missingFields: string[];
  approved: boolean;
  suspended: boolean;
  services: ServiceType[];
  districts: string[];
  capabilities: string[];
  available: boolean;
  activeJob: boolean;
  activeCandidate: boolean;
  activeReservation: boolean;
  reachable: boolean;
  synthetic: boolean;
}): string[] {
  const reasons: string[] = [];
  if (input.applicationStatus !== "approved") reasons.push(`APPLICATION_${input.applicationStatus.toUpperCase()}`);
  if (input.verificationStatus === "not_available") reasons.push("KYC_PROFILE_NOT_AVAILABLE");
  else if (input.verificationStatus !== "approved") reasons.push(`KYC_${input.verificationStatus.toUpperCase()}`);
  if (input.missingFields.length > 0) reasons.push("KYC_FIELDS_MISSING");
  if (!input.approved) reasons.push("WORKER_NOT_APPROVED");
  if (input.suspended) reasons.push("WORKER_SUSPENDED");
  if (input.services.length === 0) reasons.push("SERVICES_MISSING");
  if (input.districts.length === 0) reasons.push("DISTRICTS_MISSING");
  if (input.capabilities.length === 0) reasons.push("CAPABILITIES_MISSING");
  if (!input.available) reasons.push("AVAILABILITY_DISABLED");
  if (input.activeJob) reasons.push("ACTIVE_JOB");
  if (input.activeCandidate) reasons.push("ACTIVE_CANDIDATE");
  if (input.activeReservation) reasons.push("ACTIVE_RESERVATION");
  if (!input.reachable) reasons.push("REACHABILITY_UNPROVEN");
  if (input.synthetic) reasons.push("SYNTHETIC_NOT_PUBLIC");
  return Array.from(new Set(reasons));
}

function nextReadinessAction(reasons: string[]): WorkerReadinessNextAction {
  if (reasons.includes("APPLICATION_NOT_SUBMITTED")) return "submit_application";
  if (reasons.includes("APPLICATION_PENDING_REVIEW")) return "await_application_review";
  if (reasons.includes("APPLICATION_CHANGES_REQUESTED")) return "revise_application";
  if (reasons.includes("APPLICATION_REJECTED")) return "contact_support";
  if (reasons.includes("KYC_PROFILE_NOT_AVAILABLE") || reasons.includes("KYC_DRAFT") || reasons.includes("KYC_FIELDS_MISSING")) return "complete_kyc";
  if (reasons.includes("KYC_SUBMITTED") || reasons.includes("KYC_UNDER_REVIEW")) return "await_kyc_review";
  if (reasons.includes("KYC_REJECTED")) return "revise_kyc";
  if (reasons.includes("WORKER_SUSPENDED") || reasons.includes("KYC_SUSPENDED")) return "resolve_suspension";
  if (reasons.includes("SERVICES_MISSING")) return "configure_services";
  if (reasons.includes("DISTRICTS_MISSING")) return "configure_districts";
  if (reasons.includes("CAPABILITIES_MISSING")) return "declare_capabilities";
  if (reasons.includes("AVAILABILITY_DISABLED")) return "enable_availability";
  if (reasons.some((reason) => reason === "ACTIVE_JOB" || reason === "ACTIVE_CANDIDATE" || reason === "ACTIVE_RESERVATION")) return "finish_active_work";
  if (reasons.includes("REACHABILITY_UNPROVEN")) return "restore_reachability";
  return reasons.length === 0 ? "ready" : "contact_support";
}

function isWithinPastHours(value: string | null, observedMs: number, hours: number): boolean {
  if (!value || !Number.isFinite(observedMs)) return false;
  const valueMs = Date.parse(value);
  return Number.isFinite(valueMs) && valueMs <= observedMs && valueMs >= observedMs - hours * 60 * 60 * 1000;
}

function isAtOrAfter(value: string | null, observedMs: number): boolean {
  if (!value || !Number.isFinite(observedMs)) return false;
  const valueMs = Date.parse(value);
  return Number.isFinite(valueMs) && valueMs >= observedMs;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
