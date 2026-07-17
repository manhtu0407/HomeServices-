// Worker Kael private-media boundary: bind a reference to the active worker and
// job, mint a short transformed URL, and convert vision output into untrusted,
// direct-verification-only evidence for the advisory service.

import { sanitizeForLLM } from "../../../../_shared/domain.ts";
import type { WorkerVisionFinding } from "../../kael/types.ts";
import { workerVisionFindingSchema } from "../../kael/types.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import { validateJobMediaPath } from "../_runtime/shared.ts";
import { nullableString } from "../_runtime/coercions.ts";
import { type DbClient, dbQuery } from "../_runtime/db.ts";
import { inspectTrustedKaelVisionTransform } from "../kael-chat/media.ts";

const WORKER_KAEL_MEDIA_PREFIX = "supabase://job-media/";

type WorkerKaelVisionStorageBucket = {
  createSignedUrl(
    path: string,
    expiresIn: number,
    options: {
      transform: { width: number; height: number; resize: "contain"; quality: number };
    },
  ): Promise<{ data: { signedUrl?: string } | null; error: unknown }>;
};

export function buildSafeWorkerVisionFinding(analysis: {
  problem_identified: string;
  severity_indicators: readonly string[];
  complexity_hint: string;
}, serviceType: string | null): WorkerVisionFinding | null {
  const evidenceText = [analysis.problem_identified, ...analysis.severity_indicators].join(" ");
  if (hasInstructionShapedVisionEvidence(evidenceText)) return null;

  const problemIdentified = sanitizeForLLM(analysis.problem_identified).trim().slice(0, 500);
  const severityIndicators = analysis.severity_indicators
    .map((value) => sanitizeForLLM(value).trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 5);
  if (!problemIdentified) return null;

  const normalizedEvidence = `${serviceType ?? ""} ${problemIdentified} ${severityIndicators.join(" ")}`
    .toLowerCase();
  const safetyFlags: WorkerVisionFinding["safety_flags"][number][] = [
    "uncertain_identification",
  ];
  if (serviceType === "electrical" || /electri|\bwire\b|conductor|breaker|\bđiện\b|dây dẫn|cầu dao/u.test(normalizedEvidence)) {
    safetyFlags.unshift("electrical");
  }
  if (/(?:water|nước).{0,80}(?:electri|điện)|(?:electri|điện).{0,80}(?:water|nước)/u.test(normalizedEvidence)) {
    safetyFlags.push("water_near_electricity");
  }
  if (/sharp|exposed edge|sắc nhọn|cạnh hở/u.test(normalizedEvidence)) {
    safetyFlags.push("sharp_or_exposed_part");
  }
  if (/structural|collapse|sập|kết cấu/u.test(normalizedEvidence)) {
    safetyFlags.push("structural_instability");
  }

  const parsed = workerVisionFindingSchema.safeParse({
    problem_identified: problemIdentified,
    severity_indicators: severityIndicators,
    complexity_hint: analysis.complexity_hint,
    // The reused vision route is not calibrated for field-work certainty, so
    // report unknown confidence instead of inventing a score.
    confidence: 0,
    requires_direct_verification: true,
    safety_flags: [...new Set(safetyFlags)],
  });
  return parsed.success ? parsed.data : null;
}

export function validateWorkerKaelMediaRefs(
  jobId: string,
  mediaRefs: readonly string[],
): string[] {
  const uniqueRefs = [...new Set(mediaRefs.map((value) => value.trim()))];
  if (uniqueRefs.length > 5) {
    apiFailure("TOO_MANY_MEDIA", "Media hiện trường vượt quá giới hạn", 400);
  }
  const expectedPrefix = `${WORKER_KAEL_MEDIA_PREFIX}${jobId}/kael_reference/`;
  return uniqueRefs.map((mediaRef) => {
    if (!mediaRef.startsWith(expectedPrefix)) {
      apiFailure("INVALID_MEDIA_REF", "Media hiện trường không hợp lệ", 400);
    }
    const objectPath = mediaRef.slice(WORKER_KAEL_MEDIA_PREFIX.length);
    try {
      validateJobMediaPath(jobId, "kael_reference", objectPath);
    } catch {
      apiFailure("INVALID_MEDIA_REF", "Media hiện trường không hợp lệ", 400);
    }
    return objectPath;
  });
}

export async function prepareWorkerKaelVisionUrls(
  ctx: MobileApiContext,
  client: DbClient,
  jobId: string,
  mediaRefs: readonly string[],
): Promise<string[]> {
  const objectPaths = validateWorkerKaelMediaRefs(jobId, mediaRefs);
  if (objectPaths.length === 0) return [];

  const assets = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_media_assets")
      .select("job_id, owner_id, bucket_id, stage, object_path, mime_type")
      .eq("job_id", jobId)
      .eq("owner_id", ctx.user.id)
      .eq("bucket_id", "job-media")
      .eq("stage", "kael_reference")
      .in("object_path", objectPaths),
  );
  if (assets.error) {
    apiFailure("MEDIA_VALIDATION_UNAVAILABLE", "Chưa thể xác minh media hiện trường", 503);
  }
  const rowsByPath = new Map(
    (assets.data ?? []).map((row) => [nullableString(row.object_path), row]),
  );
  if (
    rowsByPath.size !== objectPaths.length ||
    objectPaths.some((path) => {
      const row = rowsByPath.get(path);
      return !row || nullableString(row.mime_type)?.startsWith("image/") !== true;
    })
  ) {
    apiFailure(
      "INVALID_MEDIA_REF",
      "Media hiện trường chưa được gắn an toàn vào việc này",
      400,
    );
  }

  const storage = (ctx.supabase as {
    storage?: { from(bucket: string): WorkerKaelVisionStorageBucket };
  }).storage;
  if (!storage) {
    apiFailure("STORAGE_NOT_CONFIGURED", "Kho media chưa được cấu hình", 500);
  }
  const bucket = storage.from("job-media");
  const signedUrls: string[] = [];
  for (const objectPath of objectPaths) {
    const signed = await bucket.createSignedUrl(objectPath, 5 * 60, {
      transform: {
        width: 1600,
        height: 1600,
        resize: "contain",
        quality: 82,
      },
    });
    const signedUrl = signed.data?.signedUrl;
    if (signed.error || !signedUrl) {
      apiFailure("MEDIA_VALIDATION_UNAVAILABLE", "Chưa thể đọc media hiện trường an toàn", 503);
    }
    const trusted = await inspectTrustedKaelVisionTransform(signedUrl);
    if (trusted === "invalid") {
      apiFailure("INVALID_MEDIA_CONTENT", "Media hiện trường không phải ảnh hợp lệ", 400);
    }
    if (trusted === "unavailable") {
      apiFailure("MEDIA_VALIDATION_UNAVAILABLE", "Chưa thể kiểm tra an toàn media hiện trường", 503);
    }
    signedUrls.push(signedUrl);
  }
  return signedUrls;
}

function hasInstructionShapedVisionEvidence(value: string) {
  return /(?:ignore|disregard|override)\s+(?:all\s+)?(?:prior|previous|system|developer|rules?|instructions?)|system\s+prompt|developer\s+message|follow\s+(?:these|the)\s+instructions?|bỏ qua\s+(?:mọi\s+)?(?:quy tắc|chỉ thị|hướng dẫn)|<\/?system\b|#{2,}\s*(?:instruction|system)/iu
    .test(value);
}
