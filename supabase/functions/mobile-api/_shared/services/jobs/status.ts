// Edge service job-status domain (C4 6a, services/* split): the worker-driven status machine —
// updateJobStatus (transition validate, geofenced check-in -> access state, completion evidence ->
// customer confirmation gate + check-in nudge). Imported by services.ts for wiring.

import { asStringArray, nullableNumber, nullableString } from "../_runtime/coercions.ts";
import { db, dbQuery } from "../_runtime/db.ts";
import { mergeLimitedRefs } from "../_runtime/shared.ts";
import { logJobEvent, queueKaelLearningEvent } from "../_runtime/audit.ts";
import { notifyCustomerJobStatus, notifyCustomerWorkerCheckedIn } from "../notifications/index.ts";
import { distanceKmBetween } from "../matching/broadcasts.ts";
import { ACCESS_GEOFENCE_RADIUS_KM, buildCheckInAccessState } from "../apartment-access/index.ts";
import { requireJobAccess } from "../../access.ts";
import { apiFailure, type MobileApiContext, type WorkerStatusUpdateInput } from "../../router.ts";
import { validateWorkflowTransition } from "../../workflow-orchestrator.ts";
import type { JobStatus } from "../../../../_shared/domain.ts";

export async function updateJobStatus(
  ctx: MobileApiContext,
  jobId: string,
  input: WorkerStatusUpdateInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select: "id, status, customer_id, worker_id, final_price, completion_notes, completion_photo_urls, apartment_access_profile, apartment_access_state, address_building, address_unit, address_floor, address_district, address_lat, address_lng",
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
    event: input.status === "completed_by_worker" ? "worker_completed" : "worker_status_advanced",
    from: job.status as JobStatus,
    to: input.status,
  });
  if (transition && !transition.valid) {
    apiFailure("INVALID_STATUS", transition.error, 409);
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: input.status };
  let completionEvidenceForDecision: {
    completion_notes?: string;
    completion_photo_urls?: string[];
  } | null = null;
  let accessReleaseMetadata: Record<string, unknown> | null = null;
  if (transition?.timestampColumn) update[transition.timestampColumn] = now;
  if (input.access_check_in) {
    if (input.status !== "arrived") {
      apiFailure("VALIDATION", "D\u1eef li\u1ec7u check-in kh\u00f4ng h\u1ee3p l\u1ec7", 400);
    }
    // A geofence check-in must be physically near the
    // job's geocoded building before the exact unit is released — otherwise a worker could
    // unlock the unit from anywhere (lat/lng were only range-checked before). manual_photo
    // check-ins rely on the lobby photo and are not distance-gated here.
    if (input.access_check_in.mode === "geofence") {
      const buildingLat = nullableNumber(job.address_lat);
      const buildingLng = nullableNumber(job.address_lng);
      const checkInLat = nullableNumber(input.access_check_in.lat);
      const checkInLng = nullableNumber(input.access_check_in.lng);
      const accuracyM = nullableNumber(input.access_check_in.accuracy_m);
      if (buildingLat === null || buildingLng === null) {
        apiFailure(
          "VALIDATION",
          "Chưa có toạ độ toà nhà để xác minh check-in. Hãy dùng ảnh sảnh.",
          400,
        );
      }
      if (checkInLat === null || checkInLng === null) {
        apiFailure(
          "VALIDATION",
          "Check-in geofence thiếu toạ độ. Hãy bật vị trí hoặc dùng ảnh sảnh.",
          400,
        );
      }
      const distanceKm = distanceKmBetween(
        checkInLat,
        checkInLng,
        buildingLat,
        buildingLng,
      );
      if (distanceKm > ACCESS_GEOFENCE_RADIUS_KM) {
        apiFailure(
          "VALIDATION",
          "Check-in ở quá xa địa chỉ công việc. Hãy đến đúng toà rồi check-in lại, hoặc dùng ảnh sảnh.",
          400,
        );
      }
      if (accuracyM !== null && accuracyM > ACCESS_GEOFENCE_RADIUS_KM * 1_000) {
        apiFailure(
          "VALIDATION",
          "Độ chính xác vị trí chưa đủ để xác minh check-in. Hãy thử lại hoặc dùng ảnh sảnh.",
          400,
        );
      }
    }
    const checkInPhotoUrls = input.access_check_in.photo_urls ?? [];
    if (checkInPhotoUrls.length > 0) {
      await requireAttachedCheckInMedia(
        client,
        jobId,
        ctx.user.id,
        checkInPhotoUrls,
      );
    }
    const accessState = buildCheckInAccessState(
      job.apartment_access_state,
      input.access_check_in,
      now,
      nullableString(job.worker_id) ?? ctx.user.id,
    );
    update.apartment_access_state = accessState;
    const authorizedReleasePreserved = accessState.exact_unit_released === true;
    accessReleaseMetadata = {
      apartment_access_release: authorizedReleasePreserved,
      release_stage: authorizedReleasePreserved
        ? "unit_released"
        : "checked_in_awaiting_customer_authorization",
      evidence_mode: input.access_check_in.mode,
    };
  }
  if (input.status === "completed_by_worker") {
    // jobs.final_price source = Kael (set by A7
    // autonomy decision or latest A11 scope decision). Worker payload không có final_price; preserve
    // existing jobs.final_price từ Kael-locked baseline.
    const completionNotes = (input.completion_notes ?? nullableString(job.completion_notes) ?? "").trim();
    const completionPhotoUrls = mergeLimitedRefs(
      asStringArray(job.completion_photo_urls),
      input.completion_photo_urls ?? [],
      10,
    );
    if (completionNotes.length < 5 || completionPhotoUrls.length === 0) {
      apiFailure(
        "VALIDATION",
        "Cần ghi chú và ảnh hoàn tất trước khi báo hoàn tất",
        400,
      );
    }
    completionEvidenceForDecision = {
      completion_notes: completionNotes,
      completion_photo_urls: completionPhotoUrls,
    };
    update.completion_notes = completionNotes;
    update.completion_photo_urls = completionPhotoUrls;
  }

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
        has_photos: (completionEvidenceForDecision?.completion_photo_urls ?? input.completion_photo_urls ?? []).length > 0,
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

async function requireAttachedCheckInMedia(
  client: ReturnType<typeof db>,
  jobId: string,
  workerId: string,
  storageRefs: string[],
) {
  const objectPaths = Array.from(new Set(storageRefs.map((storageRef) =>
    checkInObjectPath(storageRef, jobId)
  )));
  if (objectPaths.some((objectPath) => objectPath === null)) {
    apiFailure("VALIDATION", "Ảnh check-in không thuộc công việc hiện tại", 400);
  }
  const validObjectPaths = objectPaths as string[];
  const assets = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_media_assets")
      .select("object_path")
      .eq("job_id", jobId)
      .eq("owner_id", workerId)
      .eq("stage", "access_check_in")
      .in("object_path", validObjectPaths),
  );
  if (assets.error) {
    apiFailure("DB_ERROR", "Không thể xác minh ảnh check-in", 500);
  }
  if (!Array.isArray(assets.data)) {
    apiFailure("DB_ERROR", "Không thể xác minh ảnh check-in", 500);
  }
  const attachedPaths = new Set(
    assets.data
      .map((asset) => nullableString(asset.object_path))
      .filter((objectPath): objectPath is string => objectPath !== null),
  );
  if (
    attachedPaths.size !== validObjectPaths.length ||
    validObjectPaths.some((objectPath) => !attachedPaths.has(objectPath))
  ) {
    apiFailure(
      "CHECK_IN_MEDIA_NOT_ATTACHED",
      "Ảnh check-in chưa được gắn an toàn vào công việc hiện tại",
      400,
    );
  }
}

function checkInObjectPath(storageRef: string, jobId: string): string | null {
  try {
    const url = new URL(storageRef);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "supabase:" ||
      url.hostname !== "job-media" ||
      pathParts.length !== 3 ||
      pathParts[0] !== jobId ||
      pathParts[1] !== "access_check_in" ||
      pathParts.some((part) => part === "." || part === "..")
    ) {
      return null;
    }
    return pathParts.join("/");
  } catch {
    return null;
  }
}
