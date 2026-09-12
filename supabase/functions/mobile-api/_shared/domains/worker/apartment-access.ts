// Edge service apartment-access domain (C4 6a, services/* split): the X-2 unit-access projection
// + sanitize/persist/state-builder helpers + authorizeApartmentAccess. Imported directly by services.ts.

import { asJobStatus, asRecord, nullableRecord, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, workflowDb, type DbClient } from "../../platform/db.ts";
import { compactMetadata } from "../../platform/domain-utils.ts";
import { evaluateJobChatContactGuard, normalizeGuardText } from "../job/chat-guard.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { WorkerStatusUpdateInput } from "../contracts/worker.ts";
import { sanitizeForLLM, apartmentAccessAuthorizationSchema, apartmentAccessAuthorizationReceiptSchema } from "../../../../_shared/domain.ts";
import type {
  EdgeApartmentAccessAuthorizationInput as ApartmentAccessAuthorizationInput,
  EdgeApartmentAccessAuthorizationReceipt as ApartmentAccessAuthorizationReceipt,
} from "../../../../_shared/domain.ts";
import type { ApartmentAccessProfileInput, JobStatus } from "../../../../_shared/domain.ts";
import { requireJobAccess } from "../../platform/access.ts";

type AddressAccessStage = "area_only" | "building_released" | "unit_released";

type AddressAccessEvidenceMode = "none" | "geofence" | "manual_photo";

type AddressParts = {
  building: string | null;
  unit: string | null;
  floor: string | null;
  district: string | null;
};

type AddressAccessView = {
  release_stage: AddressAccessStage;
  exact_unit_released: boolean;
  worker_checked_in: boolean;
  authorization_context: ApartmentAccessAuthorizationInput | null;
  authorization_receipt: ApartmentAccessAuthorizationReceipt | null;
  check_in_required: boolean;
  identity_check_required: boolean;
  customer_handoff_required: boolean;
  evidence_mode: AddressAccessEvidenceMode;
  access_profile: ApartmentAccessProfileInput;
};

type AddressAccessProjection = {
  fullAddress: AddressParts;
  addressAccess: AddressAccessView;
};

type WorkerAccessCheckInInput = NonNullable<
  WorkerStatusUpdateInput["access_check_in"]
>;

const APARTMENT_ACCESS_PROFILE_KEYS = [
  "entry_method",
  "parking_note",
  "guard_note",
  "building_note",
  "customer_handoff_note",
] as const satisfies ReadonlyArray<keyof ApartmentAccessProfileInput>;

const ADDRESS_BUILDING_RELEASE_STATUSES: readonly JobStatus[] = [
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
];

export const ACCESS_GEOFENCE_RADIUS_KM = 0.15;

export function sanitizeApartmentAccessProfile(
  input: unknown,
): ApartmentAccessProfileInput {
  const record = nullableRecord(input) ?? {};
  const profile: ApartmentAccessProfileInput = {};
  for (const key of APARTMENT_ACCESS_PROFILE_KEYS) {
    const value = sanitizeApartmentAccessText(record[key], 300);
    if (value) profile[key] = value;
  }
  return profile;
}

export function buildInitialApartmentAccessState() {
  return {
    release_stage: "area_only",
    exact_unit_released: false,
    check_in_required: true,
    identity_check_required: true,
    customer_handoff_required: true,
    evidence_mode: "none",
  };
}

export async function persistApartmentAccessProfileFromMetadata(
  client: DbClient,
  input: {
    customerId: string;
    jobId: string;
    addressLabel: string | null;
    district: string | null;
    profile: ApartmentAccessProfileInput;
  },
) {
  const fingerprint = apartmentAddressFingerprint(
    input.addressLabel,
    input.district,
  );
  if (!fingerprint) return;

  let profile = sanitizeApartmentAccessProfile(input.profile);
  if (isEmptyApartmentAccessProfile(profile)) {
    const existing = await dbQuery<Record<string, unknown>>(
      client
        .from("kael_chat_pre_intake_memory")
        .select("access_profile")
        .eq("customer_id", input.customerId)
        .eq("address_fingerprint", fingerprint)
        .maybeSingle(),
    );
    if (existing.error) {
      console.warn("mobile-api apartment access memory lookup failed", {
        jobId: input.jobId,
        errorCode: existing.error.code,
      });
    }
    if (!existing.error && existing.data) {
      profile = sanitizeApartmentAccessProfile(existing.data.access_profile);
    }
  }
  if (isEmptyApartmentAccessProfile(profile)) return;

  const jobUpdate = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({
        apartment_access_profile: profile,
        apartment_access_state: buildInitialApartmentAccessState(),
      })
      .eq("id", input.jobId)
      .select("id")
      .maybeSingle(),
  );
  if (jobUpdate.error) {
    console.warn("mobile-api apartment access job update failed", {
      jobId: input.jobId,
      errorCode: jobUpdate.error.code,
    });
  }

  const memoryUpsert = await dbQuery(
    client
      .from("kael_chat_pre_intake_memory")
      .upsert({
        customer_id: input.customerId,
        address_fingerprint: fingerprint,
        address_label_safe: sanitizeApartmentAccessText(
          input.addressLabel,
          200,
        ) ?? null,
        address_district: input.district,
        access_profile: profile,
        last_used_job_id: input.jobId,
      }),
  );
  if (memoryUpsert.error) {
    console.warn("mobile-api apartment access memory upsert failed", {
      jobId: input.jobId,
      errorCode: memoryUpsert.error.code,
    });
  }
}

export function mergeApartmentAccessProfiles(
  previous: unknown,
  incoming: unknown,
): ApartmentAccessProfileInput {
  return {
    ...sanitizeApartmentAccessProfile(previous),
    ...sanitizeApartmentAccessProfile(incoming),
  };
}

export function projectAddressAccess(
  row: Record<string, unknown>,
  role: MobileApiContext["role"],
  options: { forcedStage?: AddressAccessStage } = {},
): AddressAccessProjection {
  const rawAddress = readAddressParts(row);
  const profile = sanitizeApartmentAccessProfile(row.apartment_access_profile);
  const state = asRecord(row.apartment_access_state);
  const rowStatus = asJobStatus(row.job_status ?? row.status);
  const checkInRecord = nullableRecord(state.check_in);
  const checkInWorkerId = nullableString(checkInRecord?.worker_id);
  const rowWorkerId = nullableString(row.worker_id);
  const exactUnitReleased = state.exact_unit_released === true &&
    state.customer_authorized === true && rowWorkerId !== null &&
    checkInWorkerId === rowWorkerId && ADDRESS_BUILDING_RELEASE_STATUSES.includes(rowStatus);
  const releasedStage = exactUnitReleased
    ? "unit_released"
    : ADDRESS_BUILDING_RELEASE_STATUSES.includes(rowStatus)
    ? "building_released"
    : "area_only";
  const stage = options.forcedStage ?? releasedStage;
  const evidenceMode = accessEvidenceMode(state);
  // A check-in belongs to its assignee, not to every later worker on the job.
  const workerCheckedIn =
    (state.worker_checked_in === true || checkInRecord !== null) &&
    rowWorkerId !== null && checkInWorkerId === rowWorkerId &&
    ADDRESS_BUILDING_RELEASE_STATUSES.includes(rowStatus);
  const intent = apartmentAccessAuthorizationSchema.safeParse({
    expected_worker_id: rowWorkerId,
    expected_check_in_at: checkInRecord?.checked_in_at,
  });
  const authorizationContext = role === "customer" && workerCheckedIn && intent.success ? intent.data : null;
  const receipt = apartmentAccessAuthorizationReceiptSchema.safeParse({
    job_id: row.id, worker_id: state.authorized_worker_id, checked_in_at: state.authorized_check_in_at,
    authorized_at: state.customer_authorized_at, release_stage: "unit_released", already_authorized: true,
  });
  const authorizationReceipt = authorizationContext && exactUnitReleased && receipt.success &&
    receipt.data.worker_id === authorizationContext.expected_worker_id &&
    receipt.data.checked_in_at === authorizationContext.expected_check_in_at ? receipt.data : null;
  const workerAddress = stage === "unit_released"
    ? rawAddress
    : stage === "building_released"
    ? {
      building: redactWorkerBuilding(rawAddress.building) ??
        rawAddress.district,
      unit: null,
      floor: null,
      district: rawAddress.district,
    }
    : {
      building: null,
      unit: null,
      floor: null,
      district: rawAddress.district,
    };

  return {
    fullAddress: role === "worker" ? workerAddress : rawAddress,
    addressAccess: { ...buildAddressAccessView(
      profile,
      role === "worker" ? stage : releasedStage,
      evidenceMode,
      workerCheckedIn,
    ), authorization_context: authorizationContext, authorization_receipt: authorizationReceipt },
  };
}

export function buildCheckInAccessState(
  previous: unknown,
  checkIn: WorkerAccessCheckInInput,
  now: string,
  workerId: string | null,
) {
  const previousState = asRecord(previous);
  const previousCheckIn = nullableRecord(previousState.check_in);
  const preserveAuthorizedRelease = previousState.exact_unit_released === true &&
    previousState.customer_authorized === true &&
    workerId !== null &&
    nullableString(previousCheckIn?.worker_id) === workerId;

  return compactMetadata({
    ...previousState,
    release_stage: preserveAuthorizedRelease ? "unit_released" : "building_released",
    exact_unit_released: preserveAuthorizedRelease,
    worker_checked_in: true,
    worker_checked_in_at: now,
    customer_authorized: preserveAuthorizedRelease,
    customer_authorized_at: preserveAuthorizedRelease
      ? previousState.customer_authorized_at
      : undefined,
    customer_authorization_required: !preserveAuthorizedRelease,
    check_in_required: false,
    identity_check_required: true,
    customer_handoff_required: !preserveAuthorizedRelease,
    unit_released_at: preserveAuthorizedRelease
      ? previousState.unit_released_at
      : undefined,
    evidence_mode: checkIn.mode,
    check_in: compactMetadata({
      mode: checkIn.mode,
      // §32.7 (Codex review PR #66): bind the check-in to the worker who made it so a
      // replacement assignment cannot inherit it (authorize verifies the match).
      worker_id: workerId ?? undefined,
      lat: checkIn.lat,
      lng: checkIn.lng,
      accuracy_m: checkIn.accuracy_m,
      photo_urls: checkIn.photo_urls,
      note: sanitizeApartmentAccessText(checkIn.note, 300),
      checked_in_at: now,
    }),
  });
}

function sanitizeApartmentAccessText(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = sanitizeForLLM(value).trim().slice(0, maxLength);
  if (!trimmed) return undefined;
  if (evaluateJobChatContactGuard(trimmed).flagged) {
    return undefined;
  }
  return trimmed;
}

function isEmptyApartmentAccessProfile(profile: ApartmentAccessProfileInput) {
  return APARTMENT_ACCESS_PROFILE_KEYS.every((key) => !profile[key]);
}

function accessEvidenceMode(
  state: Record<string, unknown>,
): AddressAccessEvidenceMode {
  const direct = nullableString(state.evidence_mode);
  if (direct === "geofence" || direct === "manual_photo") return direct;
  const checkIn = nullableRecord(state.check_in);
  const mode = nullableString(checkIn?.mode);
  return mode === "geofence" || mode === "manual_photo" ? mode : "none";
}

function buildAddressAccessView(
  profile: ApartmentAccessProfileInput,
  stage: AddressAccessStage,
  evidenceMode: AddressAccessEvidenceMode,
  workerCheckedIn: boolean,
): AddressAccessView {
  const exact = stage === "unit_released";
  return {
    release_stage: stage,
    exact_unit_released: exact,
    // §32.7: the customer "Cho thợ lên" button keys on this — it must appear only
    // after a worker check-in and before the unit is released.
    worker_checked_in: workerCheckedIn,
    authorization_context: null,
    authorization_receipt: null,
    // §32.7 (Codex review PR #66): checked-in-but-not-yet-authorized must not keep
    // claiming a check-in is required — the stored state already says it happened.
    check_in_required: !exact && !workerCheckedIn,
    identity_check_required: true,
    customer_handoff_required: true,
    evidence_mode: exact ? evidenceMode : "none",
    access_profile: profile,
  };
}

function readAddressParts(row: Record<string, unknown>): AddressParts {
  return {
    building: nullableString(row.address_building),
    unit: nullableString(row.address_unit),
    floor: nullableString(row.address_floor),
    district: nullableString(row.address_district),
  };
}

function apartmentAddressFingerprint(
  addressLabel: string | null,
  district: string | null,
) {
  if (!addressLabel?.trim()) return null;
  const normalized = normalizeGuardText(
    [district, addressLabel].filter(Boolean).join("|"),
  );
  return normalized.length > 0 ? normalized.slice(0, 160) : null;
}

function redactWorkerBuilding(value: string | null) {
  if (!value) return null;
  const redacted = value
    .replace(/(?:căn\s*hộ|can\s*ho|căn|can|phòng|phong|unit|apt|apartment)\s*[:#-]?\s*[A-Za-z0-9./-]+/gi, "")
    .replace(/(?:tầng|tang|lầu|lau|floor)\s*[:#-]?\s*[A-Za-z0-9./-]+/gi, "")
    .replace(/\s*,\s*,+/g, ", ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return redacted || null;
}

export async function authorizeApartmentAccess(
  ctx: MobileApiContext, jobId: string, input?: ApartmentAccessAuthorizationInput,
): Promise<ApartmentAccessAuthorizationReceipt> {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách đặt dịch vụ được cho phép vào căn hộ.", 403);
  }
  const intent = apartmentAccessAuthorizationSchema.safeParse(input);
  if (!intent.success) {
    apiFailure("CLIENT_UPDATE_REQUIRED", "Hãy cập nhật ứng dụng và tải lại yêu cầu trước khi cho phép thợ lên.", 409);
  }
  await requireJobAccess(db(ctx), jobId, ctx, { requiredRole: "customer", select: "id, customer_id" });
  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowDb(ctx).rpc("authorize_apartment_access_atomic", {
      p_job_id: jobId, p_customer_id: ctx.user.id,
      p_expected_worker_id: intent.data.expected_worker_id,
      p_expected_check_in_at: intent.data.expected_check_in_at,
    }),
  );
  if (result.error) accessAuthorizationOutcomeUnknown();
  const row = Array.isArray(result.data) && result.data.length === 1 ? result.data[0] : null;
  if (!row || typeof row.ok !== "boolean") accessAuthorizationOutcomeUnknown();
  if (!row.ok) {
    if (row.error_code === "NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy công việc.", 404);
    if (row.error_code === "ACCESS_NOT_READY") {
      apiFailure("ACCESS_NOT_READY", "Chưa thể cho phép thợ lên. Hãy tải lại trạng thái công việc.", 409);
    }
    if (row.error_code === "ACCESS_CONTEXT_CHANGED") {
      apiFailure("ACCESS_CONTEXT_CHANGED", "Thợ hoặc lần xác nhận đã thay đổi. Hãy kiểm tra lại trước khi cho phép thợ lên.", 409);
    }
    accessAuthorizationOutcomeUnknown();
  }
  const receipt = apartmentAccessAuthorizationReceiptSchema.safeParse({
    job_id: row.job_id, worker_id: row.worker_id, checked_in_at: row.checked_in_at,
    authorized_at: row.authorized_at, already_authorized: row.already_authorized,
    release_stage: "unit_released",
  });
  if (!receipt.success || row.error_code !== null || row.job_id !== jobId ||
    row.worker_id !== intent.data.expected_worker_id ||
    row.checked_in_at !== intent.data.expected_check_in_at) accessAuthorizationOutcomeUnknown();
  return receipt.data;
}

function accessAuthorizationOutcomeUnknown(): never {
  apiFailure("ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN",
    "Đang đối soát quyền vào căn hộ. Hãy tải lại công việc để kiểm tra kết quả.", 503,
    { reconcile_required: true });
}
