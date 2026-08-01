import {
  CUSTOMER_AVATAR_MAX_BYTES,
  WORKER_AVATAR_MAX_BYTES,
  type EdgeCustomerAvatarUpdateInput,
  type EdgeCustomerAvatarUploadInput,
  type EdgeWorkerAvatarUpdateInput,
  type EdgeWorkerAvatarUploadInput,
} from "../../../_shared/domain.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { checkRateLimit, type RateLimitConfig } from "../rate-limit.ts";
import { db, dbQuery } from "./db.ts";
import { inspectJobMediaContent } from "./job-media-content.ts";
import { nullableString } from "./coercions.ts";

type ProfileAvatarBucket = {
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

type ProfileAvatarStorageClient = {
  storage?: {
    from(bucket: string): ProfileAvatarBucket;
  };
};

const WORKER_AVATAR_BUCKET = "worker-avatars" as const;
const CUSTOMER_AVATAR_BUCKET = "customer-avatars" as const;
type ProfileAvatarBucketId =
  | typeof WORKER_AVATAR_BUCKET
  | typeof CUSTOMER_AVATAR_BUCKET;
type ProfileAvatarUploadInput =
  | EdgeWorkerAvatarUploadInput
  | EdgeCustomerAvatarUploadInput;
type ProfileAvatarUpdateInput =
  | EdgeWorkerAvatarUpdateInput
  | EdgeCustomerAvatarUpdateInput;
const PROFILE_AVATAR_UPLOAD_EXPIRES_IN_SECONDS = 2 * 60 * 60;
const PROFILE_AVATAR_READ_EXPIRES_IN_SECONDS = 60 * 60;
const PROFILE_AVATAR_READ_CACHE_MS = 50 * 60 * 1000;
const PROFILE_AVATAR_UPLOAD_LIMIT: RateLimitConfig = {
  maxTokens: 6,
  refillRate: 6,
  refillIntervalMs: 60 * 60 * 1000,
};
const WORKER_AVATAR_REF_PATTERN =
  /^supabase:\/\/worker-avatars\/([^/\s?#]+)\/([A-Za-z0-9._-]+)$/i;
const CUSTOMER_AVATAR_REF_PATTERN =
  /^supabase:\/\/customer-avatars\/([^/\s?#]+)\/([A-Za-z0-9._-]+)$/i;
const PROFILE_AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const signedAvatarCache = new Map<string, { expiresAt: number; url: string }>();

export async function createWorkerAvatarUpload(
  ctx: MobileApiContext,
  input: EdgeWorkerAvatarUploadInput,
) {
  return createProfileAvatarUpload(ctx, input, WORKER_AVATAR_BUCKET);
}

export function createCustomerAvatarUpload(
  ctx: MobileApiContext,
  input: EdgeCustomerAvatarUploadInput,
) {
  return createProfileAvatarUpload(ctx, input, CUSTOMER_AVATAR_BUCKET);
}

async function createProfileAvatarUpload<BucketId extends ProfileAvatarBucketId>(
  ctx: MobileApiContext,
  input: ProfileAvatarUploadInput,
  bucketId: BucketId,
) {
  const rate = checkRateLimit(
    `${bucketId}_upload:${ctx.user.id}`,
    PROFILE_AVATAR_UPLOAD_LIMIT,
  );
  if (!rate.allowed) {
    apiFailure("RATE_LIMITED", "Bạn đã đổi ảnh quá nhiều lần. Vui lòng thử lại sau.", 429);
  }

  const bucket = requireProfileAvatarBucket(ctx.supabase, bucketId);
  const objectPath = `${ctx.user.id}/${crypto.randomUUID()}.${extensionForMime(input.mime_type)}`;
  const signed = await bucket.createSignedUploadUrl(objectPath);
  const signedUrl = signed.data?.signedUrl ?? signed.data?.signed_url;
  const token = signed.data?.token;
  if (signed.error || !signedUrl || !token) {
    apiFailure("STORAGE_ERROR", "Không thể chuẩn bị ảnh đại diện", 500);
  }

  return {
    bucket_id: bucketId,
    object_path: objectPath,
    avatar_ref: `supabase://${bucketId}/${objectPath}`,
    token,
    signed_upload_url: signedUrl,
    expires_in_seconds: PROFILE_AVATAR_UPLOAD_EXPIRES_IN_SECONDS,
  };
}

export async function getCustomerAvatar(ctx: MobileApiContext) {
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx).from("profiles")
      .select("avatar_url, updated_at")
      .eq("id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ tài khoản", 404);
  }

  return {
    customer_id: ctx.user.id,
    avatar_url: await resolveCustomerAvatarUrl(ctx.supabase, result.data.avatar_url),
    updated_at: nullableString(result.data.updated_at),
  };
}

export async function updateCustomerAvatar(
  ctx: MobileApiContext,
  input: EdgeCustomerAvatarUpdateInput,
) {
  const result = await updateProfileAvatar(
    ctx,
    input,
    CUSTOMER_AVATAR_BUCKET,
    CUSTOMER_AVATAR_MAX_BYTES,
  );
  return {
    customer_id: ctx.user.id,
    avatar_url: result.avatar_url,
    updated_at: result.updated_at,
  };
}

export async function updateWorkerAvatar(
  ctx: MobileApiContext,
  input: EdgeWorkerAvatarUpdateInput,
) {
  const result = await updateProfileAvatar(
    ctx,
    input,
    WORKER_AVATAR_BUCKET,
    WORKER_AVATAR_MAX_BYTES,
  );
  return {
    worker_id: ctx.user.id,
    avatar_url: result.avatar_url,
    updated_at: result.updated_at,
  };
}

async function updateProfileAvatar(
  ctx: MobileApiContext,
  input: ProfileAvatarUpdateInput,
  bucketId: ProfileAvatarBucketId,
  maxBytes: number,
) {
  const objectPath = profileAvatarObjectPath(input.avatar_ref, bucketId, ctx.user.id);
  if (!objectPath) {
    apiFailure("VALIDATION", "Ảnh đại diện không thuộc tài khoản này", 400);
  }

  const bucket = requireProfileAvatarBucket(ctx.supabase, bucketId);
  const downloaded = await bucket.download(objectPath);
  if (downloaded.error || !downloaded.data) {
    apiFailure("STORAGE_ERROR", "Không thể kiểm tra ảnh đại diện", 400);
  }
  if (downloaded.data.size <= 0 || downloaded.data.size > maxBytes) {
    apiFailure(
      downloaded.data.size > maxBytes ? "PAYLOAD_TOO_LARGE" : "UNSUPPORTED_MEDIA",
      "Ảnh đại diện phải nhỏ hơn hoặc bằng 5 MB",
      downloaded.data.size > maxBytes ? 413 : 400,
    );
  }

  const inspected = inspectJobMediaContent(
    new Uint8Array(await downloaded.data.arrayBuffer()),
  );
  if (inspected.kind !== "trusted" || !PROFILE_AVATAR_MIME_TYPES.has(inspected.mimeType)) {
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
  const avatarUrl = await resolveProfileAvatarUrl(ctx.supabase, input.avatar_ref, bucketId);
  if (!avatarUrl) {
    apiFailure("STORAGE_ERROR", "Không thể mở ảnh đại diện vừa cập nhật", 500);
  }

  const previousRef = nullableString(previous.data.avatar_url);
  const previousPath = previousRef && previousRef !== input.avatar_ref
    ? profileAvatarObjectPath(previousRef, bucketId, ctx.user.id)
    : null;
  if (previousPath && bucket.remove) {
    signedAvatarCache.delete(previousRef!);
    void bucket.remove([previousPath]).catch(() => undefined);
  }

  return {
    avatar_url: avatarUrl,
    updated_at: updatedAt,
  };
}

export async function resolveWorkerAvatarUrl(
  storageClient: unknown,
  rawAvatarRef: unknown,
): Promise<string | null> {
  return resolveProfileAvatarUrl(storageClient, rawAvatarRef, WORKER_AVATAR_BUCKET);
}

export async function resolveCustomerAvatarUrl(
  storageClient: unknown,
  rawAvatarRef: unknown,
): Promise<string | null> {
  return resolveProfileAvatarUrl(storageClient, rawAvatarRef, CUSTOMER_AVATAR_BUCKET);
}

async function resolveProfileAvatarUrl(
  storageClient: unknown,
  rawAvatarRef: unknown,
  bucketId: ProfileAvatarBucketId,
): Promise<string | null> {
  const avatarRef = nullableString(rawAvatarRef);
  if (!avatarRef) return null;
  if (/^https?:\/\//i.test(avatarRef)) return avatarRef;

  const objectPath = profileAvatarObjectPath(avatarRef, bucketId);
  if (!objectPath) return null;
  const cached = signedAvatarCache.get(avatarRef);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const storage = (storageClient as ProfileAvatarStorageClient).storage;
  if (!storage) return null;
  const signed = await storage.from(bucketId).createSignedUrl(
    objectPath,
    PROFILE_AVATAR_READ_EXPIRES_IN_SECONDS,
  );
  const signedUrl = signed.data?.signedUrl;
  if (signed.error || !signedUrl) return null;

  if (signedAvatarCache.size >= 200) {
    const firstKey = signedAvatarCache.keys().next().value;
    if (typeof firstKey === "string") signedAvatarCache.delete(firstKey);
  }
  signedAvatarCache.set(avatarRef, {
    expiresAt: Date.now() + PROFILE_AVATAR_READ_CACHE_MS,
    url: signedUrl,
  });
  return signedUrl;
}

export function workerAvatarObjectPath(
  avatarRef: string,
  expectedWorkerId?: string,
): string | null {
  return profileAvatarObjectPath(avatarRef, WORKER_AVATAR_BUCKET, expectedWorkerId);
}

export function customerAvatarObjectPath(
  avatarRef: string,
  expectedCustomerId?: string,
): string | null {
  return profileAvatarObjectPath(avatarRef, CUSTOMER_AVATAR_BUCKET, expectedCustomerId);
}

export async function removeCustomerAvatarObject(
  storageClient: unknown,
  rawAvatarRef: unknown,
  expectedCustomerId: string,
) {
  const avatarRef = nullableString(rawAvatarRef);
  if (!avatarRef) return true;
  if (!avatarRef.toLowerCase().startsWith(`supabase://${CUSTOMER_AVATAR_BUCKET}/`)) {
    return true;
  }
  const objectPath = customerAvatarObjectPath(avatarRef, expectedCustomerId);
  if (!objectPath) return false;
  const storage = (storageClient as ProfileAvatarStorageClient).storage;
  const bucket = storage?.from(CUSTOMER_AVATAR_BUCKET);
  if (!bucket?.remove) return false;
  const removed = await bucket.remove([objectPath]);
  if (removed.error) return false;
  signedAvatarCache.delete(avatarRef);
  return true;
}

function profileAvatarObjectPath(
  avatarRef: string,
  bucketId: ProfileAvatarBucketId,
  expectedUserId?: string,
) {
  const pattern = bucketId === WORKER_AVATAR_BUCKET
    ? WORKER_AVATAR_REF_PATTERN
    : CUSTOMER_AVATAR_REF_PATTERN;
  const match = avatarRef.match(pattern);
  if (!match || (expectedUserId && match[1] !== expectedUserId)) return null;
  return `${match[1]}/${match[2]}`;
}

function requireProfileAvatarBucket(
  storageClient: unknown,
  bucketId: ProfileAvatarBucketId,
) {
  const storage = (storageClient as ProfileAvatarStorageClient).storage;
  if (!storage) {
    apiFailure("STORAGE_NOT_CONFIGURED", "Kho ảnh đại diện chưa được cấu hình", 500);
  }
  return storage.from(bucketId);
}

function extensionForMime(mimeType: ProfileAvatarUploadInput["mime_type"]) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}
