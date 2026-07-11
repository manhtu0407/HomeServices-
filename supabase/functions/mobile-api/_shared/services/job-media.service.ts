// Edge service job-media domain (C4 6a, services/* split): attach customer/worker media assets to a
// job (role + workflow-stage gated, dedup by object_path, mirrors before/after refs onto the job).
// Imported by services.ts for wiring.

import { asServiceType, asStringArray, nullableString } from "./coercions.ts";
import { db, dbQuery } from "./db.ts";
import { logJobEvent } from "./audit.ts";
import { canAttachJobMediaStage, mergeLimitedRefs, storageRef, validateJobMediaPath } from "./_shared.ts";
import { requireJobAccess } from "../access.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { validateWorkflowCommand } from "../workflow-orchestrator.ts";
import type { JobMediaAttachInput, JobStatus } from "../../../_shared/domain.ts";
import {
  inspectJobMediaContent,
  jobMediaStageAllowsVideo,
  MAX_JOB_MEDIA_BYTES,
  normalizeDeclaredJobMediaMime,
} from "./job-media-content.ts";

const JOB_MEDIA_STORAGE_TIMEOUT_MS = 15_000;

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
  download(path: string): PromiseLike<{ data: Blob | null; error: unknown | null }>;
  remove(paths: string[]): PromiseLike<{ data: unknown; error: unknown | null }>;
};

type JobMediaVerificationFailure = {
  code: string;
  message: string;
  status: number;
};

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
  const storage = rowsToInsert.length > 0 ? jobMediaStorageBucket(ctx) : null;
  if (rowsToInsert.length > 0 && !storage) {
    apiFailure("MEDIA_VALIDATION_UNAVAILABLE", "Chưa thể xác minh tệp media an toàn", 503);
  }
  if (storage) {
    const verifiedRows: JobMediaRow[] = [];
    for (const row of rowsToInsert) {
      const verified = await verifyStoredJobMedia(storage, row);
      if ("code" in verified) {
        await removeJobMediaObjectsBestEffort(
          storage,
          rowsToInsert.map((candidate) => candidate.object_path),
        );
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
      if (storage) {
        await removeJobMediaObjectsBestEffort(
          storage,
          rowsToInsert.map((row) => row.object_path),
        );
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

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await blob.arrayBuffer());
  } catch {
    return verificationFailure(
      "MEDIA_VALIDATION_UNAVAILABLE",
      "Chưa thể đọc tệp media để xác minh an toàn",
      503,
    );
  }
  if (bytes.byteLength !== blob.size) {
    return verificationFailure(
      "MEDIA_SIZE_MISMATCH",
      "Kích thước tệp media không khớp với nội dung thực",
      400,
    );
  }

  const inspected = inspectJobMediaContent(bytes);
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
