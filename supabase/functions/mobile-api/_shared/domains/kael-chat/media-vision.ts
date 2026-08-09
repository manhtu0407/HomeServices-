import type { KaelDiagnosisScopeArtifact } from "../../kael/index.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  KAEL_CHAT_MEDIA_BUCKET,
  KAEL_CHAT_MEDIA_REF_PATTERN,
  type KaelMediaStorage,
} from "./media-upload.ts";

const KAEL_CASE_WORK_EVIDENCE_URL_EXPIRES_IN_SECONDS = 15 * 60;
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

export async function createSignedCaseWorkEvidenceUrls(
  ctx: MobileApiContext,
  mediaRefs: readonly string[],
  sessionOwnerId: string | null,
): Promise<string[]> {
  const refs = [...new Set(mediaRefs.map((ref) => ref.trim()).filter(Boolean))];
  if (refs.length === 0) return [];

  const storage = (ctx.supabase as KaelMediaStorage).storage;
  const bucket = storage?.from(KAEL_CHAT_MEDIA_BUCKET);
  const storagePrefix = `supabase://${KAEL_CHAT_MEDIA_BUCKET}/`;

  const resolved = await Promise.all(refs.map(async (mediaRef) => {
    if (!mediaRef.startsWith(storagePrefix)) return mediaRef;
    const match = mediaRef.match(KAEL_CHAT_MEDIA_REF_PATTERN);
    if (
      !bucket ||
      !sessionOwnerId ||
      !match ||
      match[1] !== sessionOwnerId ||
      match[2] !== "model_vision"
    ) {
      return null;
    }

    try {
      const signed = await bucket.createSignedUrl(
        mediaRef.slice(storagePrefix.length),
        KAEL_CASE_WORK_EVIDENCE_URL_EXPIRES_IN_SECONDS,
        {
          transform: {
            width: 1200,
            height: 1200,
            resize: "contain",
            quality: 82,
          },
        },
      );
      return signed.error || !signed.data?.signedUrl ? null : signed.data.signedUrl;
    } catch {
      return null;
    }
  }));

  return resolved.filter((mediaRef): mediaRef is string => Boolean(mediaRef));
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
