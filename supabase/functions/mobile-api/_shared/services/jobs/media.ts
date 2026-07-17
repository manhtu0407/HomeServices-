// Edge service job-media domain: attach customer/worker media assets to a
// job (role + workflow-stage gated, dedup by object_path, mirrors before/after refs onto the job).
// Imported by services.ts for wiring.

import { asBoolean, asNumber, asServiceType, asStringArray, nullableString } from "../_runtime/coercions.ts";
import { db, dbQuery } from "../_runtime/db.ts";
import { logJobEvent } from "../_runtime/audit.ts";
import { canAttachJobMediaStage, mergeLimitedRefs, storageRef, validateJobMediaPath } from "../_runtime/shared.ts";
import { requireJobAccess } from "../../access.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import { validateWorkflowCommand } from "../../workflow-orchestrator.ts";
import type { JobMediaAttachInput, JobStatus } from "../../../../_shared/domain.ts";
import { JOB_MEDIA_STORAGE_TIMEOUT_MS } from "../../../../_shared/job-media-contract.ts";
import type {
  JobMediaRevokeInput,
  JobMediaRevokeResponse,
  JobMediaUploadInput,
} from "../../../../_shared/job-media-contract.ts";
import {
  inspectJobMediaBlob,
  jobMediaStageAllowsVideo,
  MAX_JOB_MEDIA_BYTES,
  normalizeDeclaredJobMediaMime,
} from "./media-content-policy.ts";

const JOB_MEDIA_UPLOAD_EXPIRES_IN_SECONDS = 2 * 60 * 60;
const JOB_MEDIA_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
]);

type JobMediaRow = {
  job_id: string;
  owner_id: string;
  service_type: ReturnType<typeof asServiceType>;
  stage: JobMediaAttachInput["assets"][number]["stage"];
  bucket_id: "job-media";
  object_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  safe_metadata: Record<string, never>;
};

type JobMediaStorageBucket = {
  createSignedUploadUrl?(path: string): PromiseLike<{
    data: { signedUrl?: string; signed_url?: string; token?: string } | null;
    error: unknown | null;
  }>;
  download(path: string): PromiseLike<{ data: Blob | null; error: unknown | null }>;
  remove(paths: string[]): PromiseLike<{ data: unknown; error: unknown | null }>;
};

type JobMediaVerificationFailure = {
  code: string;
  message: string;
  status: number;
};

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
    (!jobMediaStageAllowsVideo(input.stage) || (input.stage === "kael_reference" && isWorker))
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
  const objectPath = `${jobId}/${input.stage}/${crypto.randomUUID()}-${objectName}`;
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
    signed = await withStorageTimeout(storage.createSignedUploadUrl(objectPath));
  } catch {
    await failJobMediaIntents(client, jobId, ctx.user.id, [objectPath]);
    apiFailure("STORAGE_ERROR", "Không thể chuẩn bị tệp media", 503);
  }
  const signedUrl = signed.data?.signedUrl ?? signed.data?.signed_url;
  const token = signed.data?.token;
  if (signed.error || !signedUrl || !token) {
    await failJobMediaIntents(client, jobId, ctx.user.id, [objectPath]);
    apiFailure("STORAGE_ERROR", "Kh\u00f4ng th\u1ec3 chu\u1ea9n b\u1ecb t\u1ec7p media", 503);
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
  await requireJobAccess(client, jobId, ctx, {
    select: "id, customer_id, worker_id",
  });
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
    ? row.revoked_paths.filter((value): value is string => typeof value === "string")
    : [];
  if (!row || !asBoolean(row.ok) || revokedPaths.length !== objectPaths.length) {
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

export async function attachJobMedia(
  ctx: MobileApiContext,
  jobId: string,
  input: JobMediaAttachInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select:
      "id, status, service_type, customer_id, worker_id, photo_urls, completion_photo_urls",
  });
  const status = job.status as JobStatus;
  const customerId = nullableString(job.customer_id);
  const workerId = nullableString(job.worker_id);
  const isCustomer = customerId === ctx.user.id;
  const isWorker = workerId === ctx.user.id;
  const isAdmin = ctx.role === "admin";
  if (!isCustomer && !isWorker && !isAdmin) {
    apiFailure("FORBIDDEN", "Bạn không có quyền gắn media cho yêu cầu này", 403);
  }

  for (const asset of input.assets) {
    const command = validateWorkflowCommand({
      event: "job_media_attached",
      status,
      mediaStage: asset.stage,
    });
    if (!command.valid) apiFailure("INVALID_STATUS", command.error, 409);
  }

  const serviceType = asServiceType(job.service_type);
  const rows: JobMediaRow[] = input.assets.map((asset) => {
    validateJobMediaPath(jobId, asset.stage, asset.object_path);
    if (!canAttachJobMediaStage(asset.stage, isCustomer, isWorker, isAdmin)) {
      apiFailure("FORBIDDEN", "Vai trò hiện tại không được gắn media ở bước này", 403);
    }
    return {
      job_id: jobId,
      owner_id: ctx.user.id,
      service_type: serviceType,
      stage: asset.stage,
      bucket_id: "job-media",
      object_path: asset.object_path,
      mime_type: normalizeDeclaredJobMediaMime(asset.mime_type),
      file_size_bytes: asset.file_size_bytes ?? null,
      safe_metadata: {},
    };
  });

  const objectPaths = Array.from(new Set(rows.map((row) => row.object_path)));
  const existingAssets = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_media_assets")
      .select("object_path")
      .eq("job_id", jobId)
      .in("object_path", objectPaths),
  );
  if (existingAssets.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra media đã gắn", 500);
  }
  const existingObjectPaths = new Set(
    (existingAssets.data ?? []).map((asset) => nullableString(asset.object_path)).filter(Boolean),
  );
  const nextObjectPaths = new Set<string>();
  let rowsToInsert = rows.filter((row) => {
    if (existingObjectPaths.has(row.object_path) || nextObjectPaths.has(row.object_path)) {
      return false;
    }
    nextObjectPaths.add(row.object_path);
    return true;
  });
  const responseObjectPaths = new Set<string>();
  const responseRows = rows.filter((row) => {
    if (responseObjectPaths.has(row.object_path)) return false;
    responseObjectPaths.add(row.object_path);
    return true;
  });
  if (rowsToInsert.length > 0) {
    await consumeJobMediaIntents(
      client,
      jobId,
      ctx.user.id,
      rowsToInsert.map((row) => row.object_path),
    );
  }
  const storage = rowsToInsert.length > 0 ? jobMediaStorageBucket(ctx) : null;
  if (rowsToInsert.length > 0 && !storage) {
    await failJobMediaIntents(
      client,
      jobId,
      ctx.user.id,
      rowsToInsert.map((row) => row.object_path),
    );
    apiFailure("MEDIA_VALIDATION_UNAVAILABLE", "Chưa thể xác minh tệp media an toàn", 503);
  }
  if (storage) {
    const verifiedRows: JobMediaRow[] = [];
    for (const row of rowsToInsert) {
      const verified = await verifyStoredJobMedia(storage, row);
      if ("code" in verified) {
        const cleanupPaths = await failJobMediaIntents(
          client,
          jobId,
          ctx.user.id,
          rowsToInsert.map((candidate) => candidate.object_path),
        );
        await removeJobMediaObjectsBestEffort(storage, cleanupPaths);
        apiFailure(verified.code, verified.message, verified.status);
      }
      verifiedRows.push(verified.row);
    }
    rowsToInsert = verifiedRows;
  }
  if (rowsToInsert.length > 0) {
    const inserted = await dbQuery(
      client.from("job_media_assets").insert(rowsToInsert).select("id"),
    );
    if (inserted.error) {
      const cleanupPaths = await failJobMediaIntents(
        client,
        jobId,
        ctx.user.id,
        rowsToInsert.map((row) => row.object_path),
      );
      if (storage) {
        await removeJobMediaObjectsBestEffort(storage, cleanupPaths);
      }
      apiFailure("DB_ERROR", "Không thể lưu thông tin media", 500);
    }
  }
  const beforeRefs = rows
    .filter((row) => row.stage === "before" || (row.stage === "kael_reference" && isCustomer))
    .map((row) => storageRef(row.object_path));
  const afterRefs = rows
    .filter((row) => row.stage === "after")
    .map((row) => storageRef(row.object_path));
  let photoUrls = asStringArray(job.photo_urls);

  if (beforeRefs.length > 0) {
    photoUrls = mergeLimitedRefs(photoUrls, beforeRefs, 5);
    const updated = await dbQuery(
      client
        .from("jobs")
        .update({ photo_urls: photoUrls })
        .eq("id", jobId)
        .select("id")
        .maybeSingle(),
    );
    if (updated.error || !updated.data) {
      apiFailure("DB_ERROR", "Không thể cập nhật media yêu cầu", 500);
    }
  }

  if (afterRefs.length > 0) {
    const completionPhotoUrls = mergeLimitedRefs(
      asStringArray(job.completion_photo_urls),
      afterRefs,
      10,
    );
    const updated = await dbQuery(
      client
        .from("jobs")
        .update({ completion_photo_urls: completionPhotoUrls })
        .eq("id", jobId)
        .select("id")
        .maybeSingle(),
    );
    if (updated.error || !updated.data) {
      apiFailure("DB_ERROR", "Không thể cập nhật media hoàn tất", 500);
    }
  }

  if (rowsToInsert.length > 0) {
    await logJobEvent(
      client,
      jobId,
      "job_media_attached",
      ctx,
      status,
      status,
      {
        count: rowsToInsert.length,
        stages: Array.from(new Set(rowsToInsert.map((row) => row.stage))),
      },
    );
  }

  return {
    job_id: jobId,
    photo_urls: photoUrls,
    media: responseRows.map((row) => ({
      bucket_id: "job-media" as const,
      object_path: row.object_path,
      storage_ref: storageRef(row.object_path),
      stage: row.stage,
    })),
  };
}

function jobMediaStorageBucket(ctx: MobileApiContext): JobMediaStorageBucket | null {
  const storage = (ctx.supabase as {
    storage?: { from(bucket: string): JobMediaStorageBucket };
  }).storage;
  return storage?.from("job-media") ?? null;
}

async function verifyStoredJobMedia(
  storage: JobMediaStorageBucket,
  row: JobMediaRow,
): Promise<{ row: JobMediaRow } | JobMediaVerificationFailure> {
  let downloaded: { data: Blob | null; error: unknown | null };
  try {
    downloaded = await withStorageTimeout(storage.download(row.object_path));
  } catch {
    return verificationFailure(
      "MEDIA_VALIDATION_UNAVAILABLE",
      "Chưa thể tải tệp media để xác minh an toàn",
      503,
    );
  }
  const blob = downloaded.data;
  if (downloaded.error || !blob) {
    return verificationFailure(
      "MEDIA_VALIDATION_UNAVAILABLE",
      "Chưa thể tải tệp media để xác minh an toàn",
      503,
    );
  }
  if (blob.size <= 0 || blob.size > MAX_JOB_MEDIA_BYTES) {
    return verificationFailure(
      "MEDIA_TOO_LARGE",
      "Tệp media rỗng hoặc vượt quá giới hạn cho phép",
      blob.size > MAX_JOB_MEDIA_BYTES ? 413 : 400,
    );
  }
  if (row.file_size_bytes !== null && row.file_size_bytes !== blob.size) {
    return verificationFailure(
      "MEDIA_SIZE_MISMATCH",
      "Kích thước tệp media không khớp với dữ liệu đã khai báo",
      400,
    );
  }

  let inspected: Awaited<ReturnType<typeof inspectJobMediaBlob>>;
  try {
    inspected = await inspectJobMediaBlob(blob);
  } catch {
    return verificationFailure(
      "MEDIA_VALIDATION_UNAVAILABLE",
      "Chưa thể đọc tệp media để xác minh an toàn",
      503,
    );
  }
  if (inspected.kind === "audio") {
    return verificationFailure(
      "RAW_AUDIO_PRIVATE",
      "Giọng nói gốc chỉ ở trên thiết bị; chỉ bản chép lời đã kiểm tra được gửi cho Kael",
      400,
    );
  }
  if (inspected.kind !== "trusted") {
    return verificationFailure(
      "UNSUPPORTED_MEDIA",
      "Tệp media không phải JPEG, PNG, WebP hoặc MP4 hợp lệ",
      400,
    );
  }
  if (inspected.mimeType === "video/mp4" && !jobMediaStageAllowsVideo(row.stage)) {
    return verificationFailure(
      "UNSUPPORTED_MEDIA",
      "Bằng chứng ở bước này phải là ảnh",
      400,
    );
  }
  if (row.mime_type && row.mime_type !== inspected.mimeType) {
    return verificationFailure(
      "MEDIA_TYPE_MISMATCH",
      "Loại tệp media không khớp với nội dung thực",
      400,
    );
  }
  return {
    row: {
      ...row,
      file_size_bytes: blob.size,
      mime_type: inspected.mimeType,
    },
  };
}

function verificationFailure(
  code: string,
  message: string,
  status: number,
): JobMediaVerificationFailure {
  return { code, message, status };
}

async function removeJobMediaObjectsBestEffort(
  storage: JobMediaStorageBucket,
  paths: string[],
) {
  if (paths.length === 0) return;
  try {
    await withStorageTimeout(storage.remove(Array.from(new Set(paths))));
  } catch {
    // Registration remains rejected even when orphan cleanup must be retried later.
  }
}

async function failJobMediaIntents(
  client: ReturnType<typeof db>,
  jobId: string,
  ownerId: string,
  paths: string[],
) {
  const requestedPaths = Array.from(new Set(paths));
  if (requestedPaths.length === 0) return [];
  const revoked = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("fail_job_media_uploads", {
      p_job_id: jobId,
      p_owner_id: ownerId,
      p_object_paths: requestedPaths,
    }),
  );
  if (revoked.error) return [];
  const requested = new Set(requestedPaths);
  const revokedPaths = revoked.data?.[0]?.revoked_paths;
  if (!Array.isArray(revokedPaths)) return [];
  return Array.from(new Set(
    revokedPaths.filter((value): value is string =>
      typeof value === "string" && requested.has(value)
    ),
  ));
}

async function consumeJobMediaIntents(
  client: ReturnType<typeof db>,
  jobId: string,
  ownerId: string,
  paths: string[],
) {
  const uniquePaths = Array.from(new Set(paths));
  const consumed = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("consume_job_media_uploads", {
      p_job_id: jobId,
      p_owner_id: ownerId,
      p_object_paths: uniquePaths,
    }),
  );
  if (consumed.error) {
    apiFailure(
      "MEDIA_INTENT_UNAVAILABLE",
      "Ch\u01b0a th\u1ec3 x\u00e1c minh phi\u00ean t\u1ea3i media. Vui l\u00f2ng th\u1eed l\u1ea1i.",
      503,
    );
  }
  const row = consumed.data?.[0];
  if (!row || !asBoolean(row.ok) || asNumber(row.consumed_count) !== uniquePaths.length) {
    apiFailure(
      nullableString(row?.reason) ?? "MEDIA_INTENT_MISSING_OR_EXPIRED",
      "Media \u0111\u00e3 h\u1ebft h\u1ea1n ho\u1eb7c kh\u00f4ng thu\u1ed9c phi\u00ean t\u1ea3i l\u00ean h\u1ee3p l\u1ec7.",
      400,
    );
  }
}

function safeJobMediaObjectName(fileName: string, mimeType: string) {
  const extension = mimeType === "image/png"
    ? "png"
    : mimeType === "image/webp"
    ? "webp"
    : mimeType === "video/mp4"
    ? "mp4"
    : "jpg";
  const rawBase = (fileName.trim().split(/[\\/]/).pop() ?? "media")
    .split(/[?#]/, 1)[0]
    .replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const safeBase = rawBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120) || "media";
  return `${safeBase}.${extension}`;
}

async function withStorageTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Storage timeout")), JOB_MEDIA_STORAGE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
