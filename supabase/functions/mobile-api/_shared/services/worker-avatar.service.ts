import {
  WORKER_AVATAR_MAX_BYTES,
  type EdgeWorkerAvatarUpdateInput,
  type EdgeWorkerAvatarUploadInput,
} from "../../../_shared/domain.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { checkRateLimit, type RateLimitConfig } from "../rate-limit.ts";
import { db, dbQuery } from "./_runtime/db.ts";
import { inspectJobMediaContent } from "./jobs/media-content-policy.ts";
import { nullableString } from "./_runtime/coercions.ts";

type WorkerAvatarBucket = {
  createSignedUploadUrl(path: string): Promise<{
    data: { signedUrl?: string; signed_url?: string; token?: string } | null;
    error: unknown;
  }>;
  createSignedUrl(path: string, expiresIn: number): Promise<{
    data: { signedUrl?: string } | null;
    error: unknown;
  }>;
  download(path: string): Promise<{ data: Blob | null; error: unknown }>;
  remove?(paths: string[]): Promise<{ data?: unknown; error: unknown }>;
};

type WorkerAvatarStorageClient = {
  storage?: {
    from(bucket: string): WorkerAvatarBucket;
  };
};

const WORKER_AVATAR_BUCKET = "worker-avatars" as const;
const WORKER_AVATAR_REF_PREFIX = `supabase://${WORKER_AVATAR_BUCKET}/`;
const WORKER_AVATAR_UPLOAD_EXPIRES_IN_SECONDS = 2 * 60 * 60;
const WORKER_AVATAR_READ_EXPIRES_IN_SECONDS = 60 * 60;
const WORKER_AVATAR_READ_CACHE_MS = 50 * 60 * 1000;
const WORKER_AVATAR_UPLOAD_LIMIT: RateLimitConfig = {
  maxTokens: 6,
  refillRate: 6,
  refillIntervalMs: 60 * 60 * 1000,
};
const WORKER_AVATAR_REF_PATTERN =
  /^supabase:\/\/worker-avatars\/([^/\s?#]+)\/([A-Za-z0-9._-]+)$/i;
const WORKER_AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const signedAvatarCache = new Map<string, { expiresAt: number; url: string }>();

export async function createWorkerAvatarUpload(
  ctx: MobileApiContext,
  input: EdgeWorkerAvatarUploadInput,
) {
  const rate = checkRateLimit(
    `worker_avatar_upload:${ctx.user.id}`,
    WORKER_AVATAR_UPLOAD_LIMIT,
  );
  if (!rate.allowed) {
    apiFailure("RATE_LIMITED", "Bạn đã đổi ảnh quá nhiều lần. Vui lòng thử lại sau.", 429);
  }

  const bucket = requireWorkerAvatarBucket(ctx.supabase);
  const objectPath = `${ctx.user.id}/${crypto.randomUUID()}.${extensionForMime(input.mime_type)}`;
  const signed = await bucket.createSignedUploadUrl(objectPath);
  const signedUrl = signed.data?.signedUrl ?? signed.data?.signed_url;
  const token = signed.data?.token;
  if (signed.error || !signedUrl || !token) {
    apiFailure("STORAGE_ERROR", "Không thể chuẩn bị ảnh đại diện", 500);
  }

  return {
    bucket_id: WORKER_AVATAR_BUCKET,
    object_path: objectPath,
    avatar_ref: `${WORKER_AVATAR_REF_PREFIX}${objectPath}`,
    token,
    signed_upload_url: signedUrl,
    expires_in_seconds: WORKER_AVATAR_UPLOAD_EXPIRES_IN_SECONDS,
  };
}

export async function updateWorkerAvatar(
  ctx: MobileApiContext,
  input: EdgeWorkerAvatarUpdateInput,
) {
  const objectPath = workerAvatarObjectPath(input.avatar_ref, ctx.user.id);
  if (!objectPath) {
    apiFailure("VALIDATION", "Ảnh đại diện không thuộc tài khoản thợ này", 400);
  }

  const bucket = requireWorkerAvatarBucket(ctx.supabase);
  const downloaded = await bucket.download(objectPath);
  if (downloaded.error || !downloaded.data) {
    apiFailure("STORAGE_ERROR", "Không thể kiểm tra ảnh đại diện", 400);
  }
  if (downloaded.data.size <= 0 || downloaded.data.size > WORKER_AVATAR_MAX_BYTES) {
    apiFailure(
      downloaded.data.size > WORKER_AVATAR_MAX_BYTES ? "PAYLOAD_TOO_LARGE" : "UNSUPPORTED_MEDIA",
      "Ảnh đại diện phải nhỏ hơn hoặc bằng 5 MB",
      downloaded.data.size > WORKER_AVATAR_MAX_BYTES ? 413 : 400,
    );
  }

  const inspected = inspectJobMediaContent(
    new Uint8Array(await downloaded.data.arrayBuffer()),
  );
  if (inspected.kind !== "trusted" || !WORKER_AVATAR_MIME_TYPES.has(inspected.mimeType)) {
    apiFailure("UNSUPPORTED_MEDIA", "Ảnh đại diện phải là JPEG, PNG hoặc WebP hợp lệ", 400);
  }

  const client = db(ctx);
  const previous = await dbQuery<Record<string, unknown>>(
    client.from("profiles").select("avatar_url").eq("id", ctx.user.id).maybeSingle(),
  );
  if (previous.error || !previous.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ tài khoản", 404);
  }

  const updatedAt = new Date().toISOString();
  const updated = await dbQuery<Record<string, unknown>>(
    client.from("profiles")
      .update({ avatar_url: input.avatar_ref, updated_at: updatedAt })
      .eq("id", ctx.user.id)
      .select("id")
      .maybeSingle(),
  );
  if (updated.error || !updated.data) {
    apiFailure("DB_ERROR", "Không thể cập nhật ảnh đại diện", 500);
  }

  signedAvatarCache.delete(input.avatar_ref);
  const avatarUrl = await resolveWorkerAvatarUrl(ctx.supabase, input.avatar_ref);
  if (!avatarUrl) {
    apiFailure("STORAGE_ERROR", "Không thể mở ảnh đại diện vừa cập nhật", 500);
  }

  const previousRef = nullableString(previous.data.avatar_url);
  const previousPath = previousRef && previousRef !== input.avatar_ref
    ? workerAvatarObjectPath(previousRef, ctx.user.id)
    : null;
  if (previousPath && bucket.remove) {
    signedAvatarCache.delete(previousRef!);
    void bucket.remove([previousPath]).catch(() => undefined);
  }

  return {
    worker_id: ctx.user.id,
    avatar_url: avatarUrl,
    updated_at: updatedAt,
  };
}

export async function resolveWorkerAvatarUrl(
  storageClient: unknown,
  rawAvatarRef: unknown,
): Promise<string | null> {
  const avatarRef = nullableString(rawAvatarRef);
  if (!avatarRef) return null;
  if (/^https?:\/\//i.test(avatarRef)) return avatarRef;

  const objectPath = workerAvatarObjectPath(avatarRef);
  if (!objectPath) return null;
  const cached = signedAvatarCache.get(avatarRef);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const storage = (storageClient as WorkerAvatarStorageClient).storage;
  if (!storage) return null;
  const signed = await storage.from(WORKER_AVATAR_BUCKET).createSignedUrl(
    objectPath,
    WORKER_AVATAR_READ_EXPIRES_IN_SECONDS,
  );
  const signedUrl = signed.data?.signedUrl;
  if (signed.error || !signedUrl) return null;

  if (signedAvatarCache.size >= 200) {
    const firstKey = signedAvatarCache.keys().next().value;
    if (typeof firstKey === "string") signedAvatarCache.delete(firstKey);
  }
  signedAvatarCache.set(avatarRef, {
    expiresAt: Date.now() + WORKER_AVATAR_READ_CACHE_MS,
    url: signedUrl,
  });
  return signedUrl;
}

export function workerAvatarObjectPath(
  avatarRef: string,
  expectedWorkerId?: string,
): string | null {
  const match = avatarRef.match(WORKER_AVATAR_REF_PATTERN);
  if (!match || (expectedWorkerId && match[1] !== expectedWorkerId)) return null;
  return `${match[1]}/${match[2]}`;
}

function requireWorkerAvatarBucket(storageClient: unknown) {
  const storage = (storageClient as WorkerAvatarStorageClient).storage;
  if (!storage) {
    apiFailure("STORAGE_NOT_CONFIGURED", "Kho ảnh đại diện chưa được cấu hình", 500);
  }
  return storage.from(WORKER_AVATAR_BUCKET);
}

function extensionForMime(mimeType: EdgeWorkerAvatarUploadInput["mime_type"]) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}
