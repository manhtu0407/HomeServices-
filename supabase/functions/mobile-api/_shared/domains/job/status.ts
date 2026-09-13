// Worker status transitions retain actor ownership, phase, and private-evidence gates.

import { asStringArray, nullableNumber, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { mergeLimitedRefs } from "../../platform/job-media.ts";
import { logJobEvent } from "../../platform/audit.ts";
import { queueKaelLearningEvent } from "../../kael/learning/audit.ts";
import {
  notifyCustomerJobStatus,
  notifyCustomerWorkerCheckedIn,
} from "../notification/notifications.ts";
import { distanceKmBetween } from "../matching/geo.ts";
import {
  ACCESS_GEOFENCE_RADIUS_KM,
  buildCheckInAccessState,
} from "../worker/apartment-access.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { WorkerStatusUpdateInput } from "../contracts/worker.ts";
import { validateWorkflowTransition } from "../../workflow-orchestrator.ts";
import type { JobStatus } from "../../../../_shared/domain.ts";
import { requireAttachedCheckInMedia } from "./status-check-in.ts";
import { validateJobEvidenceRefs } from "./evidence-refs.ts";

export async function updateJobStatus(
  ctx: MobileApiContext,
  jobId: string,
  input: WorkerStatusUpdateInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select:
      "id, status, customer_id, worker_id, final_price, completion_notes, completion_photo_urls, apartment_access_profile, apartment_access_state, address_building, address_unit, address_floor, address_district, address_lat, address_lng",
  });
  if (job.status === "scope_change_pending") {
    apiFailure(
      "SCOPE_CHANGE_PENDING",
      "Không thể cập nhật trạng thái khi Kael đang xét thay đổi phạm vi",
      409,
    );
  }
  // §32.7 (Codex review PR #66): a check-in can legitimately arrive as `arrived -> arrived`
  // — the client retries after losing the response of a successful flip, or the worker
  // first took the explicit "continue without check-in" path and checks in afterwards.
  // The transition validator rejects same-status moves, so treat this case as a
  // check-in-only command instead of a transition.
  const isSameStatusCheckIn = input.status === "arrived" &&
    job.status === "arrived" &&
    Boolean(input.access_check_in);
  const transition = isSameStatusCheckIn ? null : validateWorkflowTransition({
    event: input.status === "completed_by_worker"
      ? "worker_completed"
      : "worker_status_advanced",
    from: job.status as JobStatus,
    to: input.status,
  });
  if (transition && !transition.valid) {
    apiFailure("INVALID_STATUS", transition.error, 409);
  }

  const now = new Date().toISOString();
  const { update, completionEvidenceForDecision, accessReleaseMetadata } =
    await buildJobStatusUpdate({
      client,
      ctx,
      jobId,
      job,
      input,
      now,
      timestampColumn: transition?.timestampColumn,
    });

  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update(update)
      .eq("id", jobId)
      .eq("worker_id", ctx.user.id)
      .eq("status", job.status)
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) {
    if (updated.error.code === "23514" && updated.error.message === "RFQ_PRICE_CONFIRMATION_REQUIRED") {
      apiFailure("RFQ_PRICE_CONFIRMATION_REQUIRED", "Cần khách xác nhận báo giá trước khi bắt đầu công việc.", 409);
    }
    if (
      updated.error.code === "P0001" &&
      updated.error.message === "CUSTOMER_COMPLETION_EVIDENCE_REQUIRED"
    ) {
      apiFailure(
        "INVALID_JOB_MEDIA_REF",
        "Bằng chứng hoàn tất đã thay đổi. Vui lòng tải lại và gửi ảnh hoàn tất.",
        409,
      );
    }
    apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  }
  if (!updated.data) {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  await logJobEvent(
    client,
    jobId,
    "worker_status_update",
    ctx,
    job.status as JobStatus,
    input.status,
    accessReleaseMetadata ?? {},
  );
  const finalStatus: JobStatus = input.status;
  await notifyCustomerJobStatus(
    client,
    jobId,
    nullableString(job.customer_id),
    input.status,
  );
  // Worker just checked in at the lobby → prompt the customer to
  // authorize exact-unit access ("Cho thợ lên"). Distinct from the generic arrived
  // push; this one tells the customer an ACTION is needed.
  if (
    accessReleaseMetadata?.release_stage ===
      "checked_in_awaiting_customer_authorization"
  ) {
    await notifyCustomerWorkerCheckedIn(
      client,
      jobId,
      nullableString(job.customer_id),
    );
  }
  if (input.status === "completed_by_worker") {
    await queueKaelLearningEvent(client, 'post-B7', {
      actor_id: ctx.user.id,
      actor_role: ctx.role,
      job_id: jobId,
      customer_id: nullableString(job.customer_id) ?? undefined,
      worker_id: ctx.user.id,
      scope_change_requested: false,
      worker_report: {
        has_photos: (completionEvidenceForDecision?.completion_photo_urls ??
          input.completion_photo_urls ?? []).length > 0,
      },
    });
  }
  return {
    job_id: jobId,
    from_status: job.status as JobStatus,
    to_status: finalStatus,
    updated_at: now,
  };
}

async function buildJobStatusUpdate(input: {
  client: ReturnType<typeof db>;
  ctx: MobileApiContext;
  jobId: string;
  job: Record<string, unknown>;
  input: WorkerStatusUpdateInput;
  now: string;
  timestampColumn?: string | null;
}) {
  const update: Record<string, unknown> = { status: input.input.status };
  let completionEvidenceForDecision: {
    completion_notes: string;
    completion_photo_urls: string[];
  } | null = null;
  let accessReleaseMetadata: Record<string, unknown> | null = null;
  if (input.timestampColumn) update[input.timestampColumn] = input.now;
  if (input.input.access_check_in) {
    await validateAndApplyAccessCheckIn(input, update);
    const accessState = buildCheckInAccessState(
      input.job.apartment_access_state,
      input.input.access_check_in,
      input.now,
      nullableString(input.job.worker_id) ?? input.ctx.user.id,
    );
    update.apartment_access_state = accessState;
    const authorizedReleasePreserved = accessState.exact_unit_released === true;
    accessReleaseMetadata = {
      apartment_access_release: authorizedReleasePreserved,
      release_stage: authorizedReleasePreserved
        ? "unit_released"
        : "checked_in_awaiting_customer_authorization",
      evidence_mode: input.input.access_check_in.mode,
    };
  }
  if (input.input.status === "completed_by_worker") {
    completionEvidenceForDecision = buildCompletionEvidence(input.input, input.job);
    completionEvidenceForDecision.completion_photo_urls = await validateJobEvidenceRefs(
      input.client,
      {
        jobId: input.jobId,
        ownerId: input.ctx.user.id,
        mediaRefs: completionEvidenceForDecision.completion_photo_urls,
        allowedStages: ["after"],
        maxRefs: 10,
      },
    );
    update.completion_notes = completionEvidenceForDecision.completion_notes;
    update.completion_photo_urls = completionEvidenceForDecision.completion_photo_urls;
  }
  return { update, completionEvidenceForDecision, accessReleaseMetadata };
}

async function validateAndApplyAccessCheckIn(
  input: Parameters<typeof buildJobStatusUpdate>[0],
  update: Record<string, unknown>,
) {
  const checkIn = input.input.access_check_in;
  if (!checkIn || input.input.status !== "arrived") {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u check-in kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  if (checkIn.mode === "geofence") {
    validateCheckInGeofence(input.job, checkIn);
  }
  const checkInPhotoUrls = checkIn.photo_urls ?? [];
  if (checkInPhotoUrls.length > 0) {
    await requireAttachedCheckInMedia(
      input.client,
      input.jobId,
      input.ctx.user.id,
      checkInPhotoUrls,
    );
  }
  return update;
}

function validateCheckInGeofence(
  job: Record<string, unknown>,
  checkIn: NonNullable<WorkerStatusUpdateInput["access_check_in"]>,
) {
  const buildingLat = nullableNumber(job.address_lat);
  const buildingLng = nullableNumber(job.address_lng);
  const checkInLat = nullableNumber(checkIn.lat);
  const checkInLng = nullableNumber(checkIn.lng);
  const accuracyM = nullableNumber(checkIn.accuracy_m);
  if (buildingLat === null || buildingLng === null) {
    apiFailure("VALIDATION", "Chưa có toạ độ toà nhà để xác minh check-in. Hãy dùng ảnh sảnh.", 400);
  }
  if (checkInLat === null || checkInLng === null) {
    apiFailure("VALIDATION", "Check-in geofence thiếu toạ độ. Hãy bật vị trí hoặc dùng ảnh sảnh.", 400);
  }
  const distanceKm = distanceKmBetween(checkInLat, checkInLng, buildingLat, buildingLng);
  if (distanceKm > ACCESS_GEOFENCE_RADIUS_KM) {
    apiFailure("VALIDATION", "Check-in ở quá xa địa chỉ công việc. Hãy đến đúng toà rồi check-in lại, hoặc dùng ảnh sảnh.", 400);
  }
  if (accuracyM !== null && accuracyM > ACCESS_GEOFENCE_RADIUS_KM * 1_000) {
    apiFailure("VALIDATION", "Độ chính xác vị trí chưa đủ để xác minh check-in. Hãy thử lại hoặc dùng ảnh sảnh.", 400);
  }
}

function buildCompletionEvidence(
  input: WorkerStatusUpdateInput,
  job: Record<string, unknown>,
) {
  const completionNotes =
    (input.completion_notes ?? nullableString(job.completion_notes) ?? "").trim();
  const completionPhotoUrls = mergeLimitedRefs(
    asStringArray(job.completion_photo_urls),
    input.completion_photo_urls ?? [],
    10,
  );
  if (completionNotes.length < 5 || completionPhotoUrls.length === 0) {
    apiFailure("VALIDATION", "Cần ghi chú và ảnh hoàn tất trước khi báo hoàn tất", 400);
  }
  return {
    completion_notes: completionNotes,
    completion_photo_urls: completionPhotoUrls,
  };
}
