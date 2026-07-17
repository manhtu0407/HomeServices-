// Private Kael media boundary: durable upload reservations, ownership checks,
// trusted Storage image transforms, and retention cleanup. Raw video originals
// remain private evidence; only decoded/re-encoded image outputs reach a model.

import type { KaelDiagnosisScopeArtifact } from "../../kael/index.ts";
import type {
  EdgeKaelChatMediaRevokeInput,
  EdgeKaelChatMediaUploadInput,
} from "../../../../_shared/domain.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import { asBoolean, asNumber, nullableString } from "../_runtime/coercions.ts";
import { db, dbQuery } from "../_runtime/db.ts";

type KaelMediaStorage = {
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
        options?: {
          transform?: {
            width: number;
            height: number;
            resize: "contain";
            quality: number;
          };
        },
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

const KAEL_CHAT_MEDIA_BUCKET = "kael-chat-media" as const;
const KAEL_CHAT_MEDIA_UPLOAD_EXPIRES_IN_SECONDS = 2 * 60 * 60;
const KAEL_CHAT_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const KAEL_CHAT_MEDIA_REF_PATTERN =
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

export function buildKaelVisionValidationEvidence(
  evidenceItems: KaelDiagnosisScopeArtifact["evidence"],
  mediaRefs: readonly string[],
): KaelDiagnosisScopeArtifact["evidence"] {
  const validationEvidence = [...evidenceItems];
  const validatedRefs = new Set(
    validationEvidence.flatMap((evidence) =>
      (evidence.kind === "photo" || evidence.kind === "video_frame") &&
        evidence.model_eligible !== false && evidence.ref
        ? [evidence.ref]
        : []
    ),
  );

  for (const mediaRef of mediaRefs) {
    const match = mediaRef.match(KAEL_CHAT_MEDIA_REF_PATTERN);
    if (match?.[2] === "model_vision" && !validatedRefs.has(mediaRef)) {
      validationEvidence.push({
        kind: "photo",
        ref: mediaRef,
        model_eligible: true,
      });
      validatedRefs.add(mediaRef);
    }
  }

  return validationEvidence;
}

export async function createSignedVisionUrls(
  ctx: MobileApiContext,
  evidenceItems: KaelDiagnosisScopeArtifact["evidence"],
  sessionOwnerId: string,
): Promise<string[]> {
  const visionEvidence = evidenceItems.filter((evidence) =>
    (evidence.kind === "photo" || evidence.kind === "video_frame") &&
    evidence.model_eligible !== false
  );
  if (visionEvidence.length === 0) return [];
  if (visionEvidence.length > 5) {
    apiFailure("TOO_MANY_MEDIA", "Kael chỉ phân tích tối đa 5 ảnh hoặc khung hình mỗi lượt", 400);
  }

  const storage = (ctx.supabase as KaelMediaStorage).storage;
  if (!storage) {
    apiFailure("STORAGE_NOT_CONFIGURED", "Kho media chưa được cấu hình", 500);
  }
  const bucket = storage.from(KAEL_CHAT_MEDIA_BUCKET);
  const storagePrefix = `supabase://${KAEL_CHAT_MEDIA_BUCKET}/`;
  const signedUrls: string[] = [];

  for (const evidence of visionEvidence) {
    const match = evidence.ref?.match(KAEL_CHAT_MEDIA_REF_PATTERN);
    if (!match || match[1] !== sessionOwnerId || match[2] !== "model_vision") {
      apiFailure("INVALID_MEDIA_REF", "Khung hình gửi Kael không hợp lệ", 400);
    }
    const objectPath = evidence.ref!.slice(storagePrefix.length);
    const signed = await bucket.createSignedUrl(objectPath, 5 * 60, {
      transform: {
        width: 1600,
        height: 1600,
        resize: "contain",
        quality: 82,
      },
    });
    if (signed.error || !signed.data?.signedUrl) {
      apiFailure(
        "MEDIA_VALIDATION_UNAVAILABLE",
        "Chưa thể giải mã an toàn tệp ảnh. Vui lòng thử lại.",
        503,
      );
    }
    const trusted = await inspectTrustedKaelVisionTransform(signed.data.signedUrl);
    if (trusted === "invalid") {
      apiFailure("INVALID_MEDIA_CONTENT", "Tệp gửi cho Kael không phải ảnh hợp lệ", 400);
    }
    if (trusted === "unavailable") {
      apiFailure(
        "MEDIA_VALIDATION_UNAVAILABLE",
        "Chưa thể kiểm tra an toàn tệp ảnh. Vui lòng thử lại.",
        503,
      );
    }
    signedUrls.push(signed.data.signedUrl);
  }

  if (signedUrls.length !== visionEvidence.length) {
    apiFailure("MEDIA_VALIDATION_UNAVAILABLE", "Chưa thể xác minh đầy đủ media", 503);
  }
  return signedUrls;
}

export function isTrustedKaelVisionTransformPayload(
  contentType: string | null,
  bytes: Uint8Array,
) {
  const mimeType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= png.length && png.every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/webp") {
    const header = new TextDecoder().decode(bytes.slice(0, 12));
    return bytes.length >= 12 && header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
  }
  return false;
}

export async function inspectTrustedKaelVisionTransform(
  signedUrl: string,
): Promise<"valid" | "invalid" | "unavailable"> {
  const signatureBytes = 16;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(signedUrl, {
      headers: { Range: `bytes=0-${signatureBytes - 1}` },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      return response.status >= 400 && response.status < 500 ? "invalid" : "unavailable";
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > signatureBytes) {
      await response.body.cancel().catch(() => undefined);
      return "unavailable";
    }
    const reader = response.body.getReader();
    const next = await reader.read();
    await reader.cancel().catch(() => undefined);
    if (next.done || !next.value?.length) return "invalid";
    return isTrustedKaelVisionTransformPayload(
        response.headers.get("content-type"),
        next.value.slice(0, signatureBytes),
      )
      ? "valid"
      : "invalid";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timeout);
  }
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
