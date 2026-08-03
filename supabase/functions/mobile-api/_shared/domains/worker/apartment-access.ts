// Edge service apartment-access domain (C4 6a, services/* split): the X-2 unit-access projection
// + sanitize/persist/state-builder helpers + authorizeApartmentAccess. Imported directly by services.ts.

import { asJobStatus, asRecord, nullableRecord, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { ACTIVE_WORKER_JOB_STATUSES } from "../../platform/job-state.ts";
import { compactMetadata } from "../../platform/domain-utils.ts";
import { evaluateJobChatContactGuard, normalizeGuardText } from "../job/chat-guard.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { WorkerStatusUpdateInput } from "../contracts/worker.ts";
import { sanitizeForLLM } from "../../../../_shared/domain.ts";
import type { ApartmentAccessProfileInput, JobStatus } from "../../../../_shared/domain.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { logJobEvent } from "../../platform/audit.ts";

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
  const exactUnitReleased = state.exact_unit_released === true;
  const rowStatus = asJobStatus(row.job_status ?? row.status);
  const releasedStage = exactUnitReleased
    ? "unit_released"
    : ADDRESS_BUILDING_RELEASE_STATUSES.includes(rowStatus)
    ? "building_released"
    : "area_only";
  const stage = options.forcedStage ?? releasedStage;
  const evidenceMode = accessEvidenceMode(state);
  // §32.7 (Codex review PR #66): a check-in belongs to the worker who made it — after a
  // replacement, the previous assignee's check-in must not show as the new worker's.
  const checkInRecord = nullableRecord(state.check_in);
  const checkInWorkerId = nullableString(checkInRecord?.worker_id);
  const rowWorkerId = nullableString(row.worker_id);
  const workerCheckedIn =
    (state.worker_checked_in === true || checkInRecord !== null) &&
    (checkInWorkerId === null || rowWorkerId === null ||
      checkInWorkerId === rowWorkerId);
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
    addressAccess: buildAddressAccessView(
      profile,
      role === "worker" ? stage : releasedStage,
      evidenceMode,
      workerCheckedIn,
    ),
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

export function buildAuthorizedReleaseAccessState(previous: unknown, now: string) {
  return compactMetadata({
    ...asRecord(previous),
    release_stage: "unit_released",
    exact_unit_released: true,
    worker_checked_in: true,
    customer_authorized: true,
    customer_authorized_at: now,
    customer_authorization_required: false,
    check_in_required: false,
    identity_check_required: true,
    customer_handoff_required: false,
    unit_released_at: now,
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

export async function authorizeApartmentAccess(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select:
      "id, status, customer_id, worker_id, apartment_access_profile, apartment_access_state, address_building, address_unit, address_floor, address_district",
  });
  // §32.7 (Codex review PR #66): the unit may only be released while the job is still
  // running — a stale client or direct POST after cancellation/completion must not
  // disclose the exact unit to a worker who is no longer on an active assignment.
  if (!ACTIVE_WORKER_JOB_STATUSES.includes(job.status as JobStatus)) {
    apiFailure(
      "ACCESS_NOT_READY",
      "Yêu cầu không còn hoạt động nên không thể mở quyền vào căn hộ.",
      409,
    );
  }
  const state = asRecord(job.apartment_access_state);
  if (state.exact_unit_released === true) {
    return {
      job_id: jobId,
      release_stage: "unit_released" as const,
      already_authorized: true as const,
    };
  }
  // §32.7 (Codex review PR #66): the check-in must belong to the CURRENT worker —
  // after a replacement, the previous assignee's check-in must not unlock the unit
  // for the next one. Pre-binding states (no worker_id on the check-in) are rejected
  // too; the worker simply re-checks-in (same-status check-in is supported).
  const checkInWorkerId = nullableString(nullableRecord(state.check_in)?.worker_id);
  const currentWorkerId = nullableString(job.worker_id);
  const workerCheckedIn = (state.worker_checked_in === true ||
    nullableRecord(state.check_in) !== null) &&
    checkInWorkerId !== null && currentWorkerId !== null &&
    checkInWorkerId === currentWorkerId;
  if (!workerCheckedIn) {
    apiFailure(
      "ACCESS_NOT_READY",
      "Thợ chưa check-in tại sảnh nên chưa thể mở căn hộ.",
      409,
    );
  }
  const now = new Date().toISOString();
  const accessState = buildAuthorizedReleaseAccessState(state, now);
  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({ apartment_access_state: accessState })
      .eq("id", jobId)
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) {
    apiFailure("DB_ERROR", "Không thể mở quyền vào căn hộ", 500);
  }
  if (!updated.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy công việc", 404);
  }
  await logJobEvent(
    client,
    jobId,
    "apartment_access_authorized",
    ctx,
    job.status as JobStatus,
    job.status as JobStatus,
    {
      apartment_access_release: true,
      release_stage: "unit_released",
      customer_authorized: true,
    },
  );
  // Tell the worker the customer has authorized so the
  // exact unit is now visible — otherwise the worker would only learn on a manual refetch.
  // Best-effort: a notification failure must not block the authorization.
  const workerId = nullableString(job.worker_id);
  if (workerId) {
    const notified = await dbQuery<Array<Record<string, unknown>>>(
      client.rpc("insert_notification_atomic", {
        p_user_id: workerId,
        p_job_id: jobId,
        p_event_type: "apartment_access_authorized",
        p_title: "Khách đã cho phép lên",
        p_body: "Bạn có thể xem địa chỉ căn hộ và lên gặp khách.",
        p_safe_metadata: { release_stage: "unit_released" },
      }),
    );
    if (notified.error) {
      console.warn("mobile-api apartment access authorize notification failed", {
        jobId,
      });
    }
  }
  return {
    job_id: jobId,
    release_stage: "unit_released" as const,
    already_authorized: false as const,
  };
}
