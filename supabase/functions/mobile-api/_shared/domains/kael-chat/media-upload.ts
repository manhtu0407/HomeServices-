// Private Kael media boundary: durable upload reservations, ownership checks,
// and retention cleanup. Raw video originals remain private evidence; only images
// the server has checked for location metadata reach a model.

import type {
  EdgeKaelChatMediaRevokeInput,
  EdgeKaelChatMediaUploadInput,
} from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { asBoolean, asNumber, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";

export type KaelMediaStorage = {
  storage?: {
    from(bucket: string): {
      createSignedUploadUrl(
        path: string,
      ): Promise<{
        data: { signedUrl?: string; signed_url?: string; token?: string } | null;
        error: unknown;
      }>;
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{
        data: { signedUrl?: string } | null;
        error: unknown;
      }>;
      remove?(
        paths: string[],
      ): Promise<{ data?: unknown; error: unknown }>;
    };
  };
};

export const KAEL_CHAT_MEDIA_BUCKET = "kael-chat-media" as const;
const KAEL_CHAT_MEDIA_UPLOAD_EXPIRES_IN_SECONDS = 2 * 60 * 60;
const KAEL_CHAT_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
export const KAEL_CHAT_MEDIA_REF_PATTERN =
  /^supabase:\/\/kael-chat-media\/([^/\s?#]+)\/kael-chat\/(model_vision|private_video_original)\/(?!.*(?:\.\.|\/\/))[^\s?#]+$/i;

export async function createKaelChatMediaUpload(
  ctx: MobileApiContext,
  input: EdgeKaelChatMediaUploadInput,
) {
  const mimeType = input.mime_type.trim().toLowerCase();
  if (!KAEL_CHAT_ALLOWED_MIME_TYPES.has(mimeType)) {
    apiFailure("UNSUPPORTED_MEDIA", "Định dạng media chưa được hỗ trợ", 400);
  }
  if (input.purpose === "model_vision" && !mimeType.startsWith("image/")) {
    apiFailure("UNSUPPORTED_MEDIA", "Khung hình gửi Kael phải là ảnh tương thích", 400);
  }
  if (
    input.purpose === "private_video_original" &&
    !mimeType.startsWith("video/")
  ) {
    apiFailure("UNSUPPORTED_MEDIA", "Bằng chứng gốc riêng tư phải là video", 400);
  }

  const storage = (ctx.supabase as KaelMediaStorage).storage;
  if (!storage) {
    apiFailure("STORAGE_NOT_CONFIGURED", "Kho media chưa được cấu hình", 500);
  }
  const bucket = storage.from(KAEL_CHAT_MEDIA_BUCKET);

  const objectName = safeKaelChatObjectName(input.file_name, mimeType);
  const objectPath = `${ctx.user.id}/kael-chat/${input.purpose}/${crypto.randomUUID()}-${objectName}`;
  const client = db(ctx);
  const reservation = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("reserve_kael_chat_media_upload", {
      p_customer_id: ctx.user.id,
      p_object_path: objectPath,
      p_purpose: input.purpose,
      p_mime_type: mimeType,
      p_file_size_bytes: input.file_size_bytes,
    }),
  );
  if (reservation.error) {
    apiFailure(
      "MEDIA_QUOTA_UNAVAILABLE",
      "Chưa thể kiểm tra hạn mức media an toàn. Vui lòng thử lại.",
      503,
    );
  }
  const reservationRow = reservation.data?.[0];
  if (!reservationRow || !asBoolean(reservationRow.allowed)) {
    const reason = nullableString(reservationRow?.reason) ?? "MEDIA_QUOTA_EXCEEDED";
    apiFailure(
      reason,
      "Bạn đã đạt giới hạn media tạm thời. Hãy thử lại sau.",
      429,
    );
  }

  const signed = await bucket.createSignedUploadUrl(objectPath);
  const signedUrl = signed.data?.signedUrl ?? signed.data?.signed_url;
  const token = signed.data?.token;
  if (signed.error || !signedUrl || !token) {
    await revokeKaelMediaIntent(client, ctx.user.id, objectPath);
    apiFailure("STORAGE_ERROR", "Không thể chuẩn bị media cho Kael", 500);
  }

  return {
    bucket_id: KAEL_CHAT_MEDIA_BUCKET,
    object_path: objectPath,
    media_ref: `supabase://${KAEL_CHAT_MEDIA_BUCKET}/${objectPath}`,
    token,
    signed_upload_url: signedUrl,
    expires_in_seconds: KAEL_CHAT_MEDIA_UPLOAD_EXPIRES_IN_SECONDS,
  };
}

export async function validateAndConsumeKaelChatEvidenceMediaRefs(
  ctx: MobileApiContext,
  mediaRefs: string[],
  sessionOwnerId: string,
) {
  const normalizedRefs = [...new Set(
    mediaRefs.map((ref) => ref.trim()).filter(Boolean),
  )].slice(0, 20);
  if (normalizedRefs.length === 0) return normalizedRefs;

  const objectPaths: string[] = [];
  for (const mediaRef of normalizedRefs) {
    const match = mediaRef.match(KAEL_CHAT_MEDIA_REF_PATTERN);
    if (!match || match[1] !== sessionOwnerId) {
      apiFailure("VALIDATION", "Media bằng chứng không hợp lệ", 400);
    }
    objectPaths.push(mediaRef.slice(`supabase://${KAEL_CHAT_MEDIA_BUCKET}/`.length));
  }

  const client = db(ctx);
  const consumed = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("consume_kael_chat_media_uploads", {
      p_customer_id: sessionOwnerId,
      p_object_paths: objectPaths,
    }),
  );
  if (consumed.error) {
    apiFailure(
      "MEDIA_INTENT_UNAVAILABLE",
      "Chưa thể xác minh quyền sử dụng media. Vui lòng thử lại.",
      503,
    );
  }
  const row = consumed.data?.[0];
  if (!row || !asBoolean(row.ok) || asNumber(row.consumed_count) !== objectPaths.length) {
    apiFailure(
      nullableString(row?.reason) ?? "MEDIA_INTENT_INVALID",
      "Media đã hết hạn hoặc không thuộc phiên tải lên hợp lệ.",
      400,
    );
  }
  return normalizedRefs;
}

export async function revokeKaelChatMedia(
  ctx: MobileApiContext,
  input: EdgeKaelChatMediaRevokeInput,
) {
  const storagePrefix = `supabase://${KAEL_CHAT_MEDIA_BUCKET}/`;
  const paths = [...new Set(input.media_refs)].map((mediaRef) => {
    const match = mediaRef.match(KAEL_CHAT_MEDIA_REF_PATTERN);
    if (!match || match[1] !== ctx.user.id) {
      apiFailure("INVALID_MEDIA_REF", "Media không thuộc tài khoản hiện tại", 400);
    }
    return mediaRef.slice(storagePrefix.length);
  });

  const client = db(ctx);
  const revoked = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("revoke_kael_chat_media_uploads", {
      p_customer_id: ctx.user.id,
      p_object_paths: paths,
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
  if (!row || !asBoolean(row.ok) || revokedPaths.length !== paths.length) {
    apiFailure(
      nullableString(row?.reason) ?? "MEDIA_REVOKE_INVALID",
      "Media thu hồi không hợp lệ hoặc đã hết hạn.",
      400,
    );
  }

  const bucket = (ctx.supabase as KaelMediaStorage).storage?.from(
    KAEL_CHAT_MEDIA_BUCKET,
  );
  const removed = bucket?.remove
    ? await bucket.remove(revokedPaths)
    : { error: true };
  return {
    revoked_count: revokedPaths.length,
    deletion_pending: Boolean(removed?.error),
  };
}

async function revokeKaelMediaIntent(
  client: ReturnType<typeof db>,
  customerId: string,
  objectPath: string,
) {
  const revoked = await dbQuery(
    client
      .from("kael_chat_media_upload_intents")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("customer_id", customerId)
      .eq("object_path", objectPath),
  );
  if (revoked.error) {
    console.warn("mobile-api kael media intent revoke failed", {
      errorCode: revoked.error.code,
    });
  }
}

function safeKaelChatObjectName(fileName: string | undefined, mimeType: string) {
  const extension = extensionForKaelChatMime(mimeType);
  const rawName = (fileName?.trim() || `evidence.${extension}`)
    .split(/[\\/]/)
    .pop() ?? `evidence.${extension}`;
  const withoutQuery = rawName.split(/[?#]/)[0] ?? `evidence.${extension}`;
  const safeName = withoutQuery
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 140);
  const normalized = safeName || `evidence.${extension}`;
  return /\.[A-Za-z0-9]{2,5}$/.test(normalized)
    ? normalized
    : `${normalized}.${extension}`;
}

function extensionForKaelChatMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "video/webm") return "webm";
  return "jpg";
}
