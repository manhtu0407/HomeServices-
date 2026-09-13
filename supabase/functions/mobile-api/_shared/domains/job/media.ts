// Edge service job-media domain (C4 6a, services/* split): upload intent creation/revocation
// for customer and worker media. Attachment and stored-content verification live in sibling modules.

import { asBoolean, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import {
  canAttachJobMediaStage,
  storageRef,
} from "../../platform/job-media.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { validateWorkflowCommand } from "../../workflow-orchestrator.ts";
import type { JobStatus } from "../../../../_shared/domain.ts";
import type {
  JobMediaRevokeInput,
  JobMediaRevokeResponse,
  JobMediaUploadInput,
} from "../../../../_shared/job-media-contract.ts";
import {
  jobMediaStageAllowsVideo,
  normalizeDeclaredJobMediaMime,
} from "./media-content.ts";
import {
  failJobMediaIntents,
  JOB_MEDIA_ALLOWED_MIME_TYPES,
  JOB_MEDIA_UPLOAD_EXPIRES_IN_SECONDS,
  jobMediaStorageBucket,
  safeJobMediaObjectName,
  withStorageTimeout,
} from "./media-support.ts";

export async function createJobMediaUpload(
  ctx: MobileApiContext,
  jobId: string,
  input: JobMediaUploadInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select: "id, status, service_type, customer_id, worker_id",
  });
  const status = job.status as JobStatus;
  const isCustomer = nullableString(job.customer_id) === ctx.user.id;
  const isWorker = nullableString(job.worker_id) === ctx.user.id;
  const isAdmin = ctx.role === "admin";
  const command = validateWorkflowCommand({
    event: "job_media_attached",
    status,
    mediaStage: input.stage,
  });
  if (!command.valid) apiFailure("INVALID_STATUS", command.error, 409);
  if (!canAttachJobMediaStage(input.stage, isCustomer, isWorker, isAdmin)) {
    apiFailure(
      "FORBIDDEN",
      "Vai tr\u00f2 hi\u1ec7n t\u1ea1i kh\u00f4ng \u0111\u01b0\u1ee3c t\u1ea3i media \u1edf b\u01b0\u1edbc n\u00e0y",
      403,
    );
  }

  const mimeType = normalizeDeclaredJobMediaMime(input.mime_type);
  if (!mimeType || !JOB_MEDIA_ALLOWED_MIME_TYPES.has(mimeType)) {
    apiFailure(
      "UNSUPPORTED_MEDIA",
      "\u0110\u1ecbnh d\u1ea1ng media ch\u01b0a \u0111\u01b0\u1ee3c h\u1ed7 tr\u1ee3",
      400,
    );
  }
  if (
    mimeType === "video/mp4" &&
    (!jobMediaStageAllowsVideo(input.stage) ||
      (input.stage === "kael_reference" && isWorker))
  ) {
    apiFailure(
      "UNSUPPORTED_MEDIA",
      "B\u1eb1ng ch\u1ee9ng \u1edf b\u01b0\u1edbc n\u00e0y ph\u1ea3i l\u00e0 \u1ea3nh",
      400,
    );
  }

  const storage = jobMediaStorageBucket(ctx);
  if (!storage?.createSignedUploadUrl) {
    apiFailure(
      "STORAGE_NOT_CONFIGURED",
      "Kho media ch\u01b0a \u0111\u01b0\u1ee3c c\u1ea5u h\u00ecnh",
      503,
    );
  }
  const objectName = safeJobMediaObjectName(input.file_name, mimeType);
  const objectPath =
    `${jobId}/${input.stage}/${crypto.randomUUID()}-${objectName}`;
  const reservation = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("reserve_job_media_upload", {
      p_job_id: jobId,
      p_owner_id: ctx.user.id,
      p_object_path: objectPath,
      p_stage: input.stage,
      p_mime_type: mimeType,
      p_file_size_bytes: input.file_size_bytes,
    }),
  );
  if (reservation.error) {
    apiFailure(
      "MEDIA_QUOTA_UNAVAILABLE",
      "Ch\u01b0a th\u1ec3 ki\u1ec3m tra h\u1ea1n m\u1ee9c media an to\u00e0n. Vui l\u00f2ng th\u1eed l\u1ea1i.",
      503,
    );
  }
  const reservationRow = reservation.data?.[0];
  if (!reservationRow || !asBoolean(reservationRow.allowed)) {
    apiFailure(
      nullableString(reservationRow?.reason) ?? "MEDIA_QUOTA_EXCEEDED",
      "Y\u00eau c\u1ea7u \u0111\u00e3 \u0111\u1ea1t gi\u1edbi h\u1ea1n media an to\u00e0n. Vui l\u00f2ng th\u1eed l\u1ea1i sau.",
      429,
    );
  }

  let signed: {
    data: { signedUrl?: string; signed_url?: string; token?: string } | null;
    error: unknown | null;
  };
  try {
    signed = await withStorageTimeout(
      storage.createSignedUploadUrl(objectPath),
    );
  } catch {
    await failJobMediaIntents(client, jobId, ctx.user.id, [objectPath]);
    apiFailure("STORAGE_ERROR", "Không thể chuẩn bị tệp media", 503);
  }
  const signedUrl = signed.data?.signedUrl ?? signed.data?.signed_url;
  const token = signed.data?.token;
  if (signed.error || !signedUrl || !token) {
    await failJobMediaIntents(client, jobId, ctx.user.id, [objectPath]);
    apiFailure(
      "STORAGE_ERROR",
      "Kh\u00f4ng th\u1ec3 chu\u1ea9n b\u1ecb t\u1ec7p media",
      503,
    );
  }

  return {
    bucket_id: "job-media" as const,
    object_path: objectPath,
    storage_ref: storageRef(objectPath),
    signed_upload_url: signedUrl,
    token,
    expires_in_seconds: JOB_MEDIA_UPLOAD_EXPIRES_IN_SECONDS,
  };
}

export async function revokeJobMediaUploads(
  ctx: MobileApiContext,
  jobId: string,
  input: JobMediaRevokeInput,
): Promise<JobMediaRevokeResponse> {
  const client = db(ctx);
  await requireJobAccess(client, jobId, ctx);
  const objectPaths = Array.from(new Set(input.object_paths));
  const revoked = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("revoke_job_media_uploads", {
      p_job_id: jobId,
      p_owner_id: ctx.user.id,
      p_object_paths: objectPaths,
    }),
  );
  if (revoked.error) {
    apiFailure(
      "MEDIA_REVOKE_UNAVAILABLE",
      "Chưa thể thu hồi media an toàn. Vui lòng thử lại.",
      503,
    );
  }
  const row = revoked.data?.[0];
  const revokedPaths = Array.isArray(row?.revoked_paths)
    ? row.revoked_paths.filter((value): value is string =>
      typeof value === "string"
    )
    : [];
  if (
    !row || !asBoolean(row.ok) || revokedPaths.length !== objectPaths.length
  ) {
    apiFailure(
      nullableString(row?.reason) ?? "MEDIA_REVOKE_INVALID",
      "Media thu hồi không hợp lệ hoặc không thuộc phiên tải lên hiện tại.",
      400,
    );
  }

  const storage = jobMediaStorageBucket(ctx);
  let deletionPending = true;
  if (storage) {
    try {
      const removed = await withStorageTimeout(storage.remove(revokedPaths));
      deletionPending = Boolean(removed.error);
    } catch {
      deletionPending = true;
    }
  }
  return {
    job_id: jobId,
    revoked_count: revokedPaths.length,
    deletion_pending: deletionPending,
  };
}

export { attachJobMedia } from "./media-attach.ts";
