import {
  asBoolean,
  asNumber,
  asServiceType,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { JobMediaAttachInput } from "../../../../_shared/domain.ts";
import { JOB_MEDIA_STORAGE_TIMEOUT_MS } from "../../../../_shared/job-media-contract.ts";
import {
  inspectJobMediaBlob,
  jobMediaStageAllowsVideo,
  MAX_JOB_MEDIA_BYTES,
} from "./media-content.ts";

export const JOB_MEDIA_UPLOAD_EXPIRES_IN_SECONDS = 2 * 60 * 60;
export const JOB_MEDIA_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
]);

export type JobMediaRow = {
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

export type JobMediaStorageBucket = {
  createSignedUploadUrl?(path: string): PromiseLike<{
    data: { signedUrl?: string; signed_url?: string; token?: string } | null;
    error: unknown | null;
  }>;
  download(
    path: string,
  ): PromiseLike<{ data: Blob | null; error: unknown | null }>;
  remove(
    paths: string[],
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
};

export type JobMediaVerificationFailure = {
  code: string;
  message: string;
  status: number;
};

export function jobMediaStorageBucket(
  ctx: MobileApiContext,
): JobMediaStorageBucket | null {
  const storage = (ctx.supabase as {
    storage?: { from(bucket: string): JobMediaStorageBucket };
  }).storage;
  return storage?.from("job-media") ?? null;
}

export async function verifyStoredJobMedia(
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
  if (
    inspected.mimeType === "video/mp4" && !jobMediaStageAllowsVideo(row.stage)
  ) {
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

export async function removeJobMediaObjectsBestEffort(
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

export async function failJobMediaIntents(
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
  return Array.from(
    new Set(
      revokedPaths.filter((value): value is string =>
        typeof value === "string" && requested.has(value)
      ),
    ),
  );
}

export async function consumeJobMediaIntents(
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
  if (
    !row || !asBoolean(row.ok) ||
    asNumber(row.consumed_count) !== uniquePaths.length
  ) {
    apiFailure(
      nullableString(row?.reason) ?? "MEDIA_INTENT_MISSING_OR_EXPIRED",
      "Media \u0111\u00e3 h\u1ebft h\u1ea1n ho\u1eb7c kh\u00f4ng thu\u1ed9c phi\u00ean t\u1ea3i l\u00ean h\u1ee3p l\u1ec7.",
      400,
    );
  }
}

export function safeJobMediaObjectName(fileName: string, mimeType: string) {
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

export async function withStorageTimeout<T>(
  promise: PromiseLike<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Storage timeout")),
      JOB_MEDIA_STORAGE_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
