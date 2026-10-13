import { isSystemEvidenceFresh, type EdgeMobileHealthObservationInput as MobileHealthObservationInput } from "../../../../_shared/contracts/system-health.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { dbQuery, workflowDb } from "../../platform/db.ts";
import type { MobileApiContext } from "../../platform/auth.ts";

export async function recordMobileHealthObservation(
  ctx: MobileApiContext,
  input: MobileHealthObservationInput,
  sessionHashSecret: string | undefined,
): Promise<{ accepted: boolean; observed_at: string }> {
  if (!isSystemEvidenceFresh(input.observed_at, Date.now(), 180_000)) {
    apiFailure("VALIDATION", "Thời điểm quan sát ứng dụng đã hết hạn hoặc không hợp lệ", 400);
  }
  const platform = ctx.clientPlatform;
  if (platform !== "ios" && platform !== "android") {
    apiFailure("VALIDATION", "Chỉ nhận quan sát từ ứng dụng native", 400);
  }
  if (!sessionHashSecret || sessionHashSecret.length < 32) {
    apiFailure("DEPENDENCY_UNAVAILABLE", "Telemetry ứng dụng chưa được cấu hình", 503);
  }
  const environment = ctx.environment;
  if (environment !== "production" && environment !== "staging" && environment !== "local") {
    apiFailure("DEPENDENCY_UNAVAILABLE", "Môi trường hệ thống chưa được định danh", 503);
  }

  const actorHash = await hashHmac(sessionHashSecret, `system-health:mobile-actor:${ctx.user.id}`);
  const sessionHash = await hashHmac(sessionHashSecret, `${ctx.user.id}:${input.client_session_id}`);
  const releaseId = safeIdentity(ctx.clientReleaseId);
  const buildId = safeIdentity(ctx.clientEasBuildId) ?? safeIdentity(ctx.clientBuildNumber?.toString());
  const apiStatus = input.api_status === "yellow" ? "yellow" : "green";
  const reasonCode = input.reason_code;
  const result = await dbQuery<boolean>(workflowDb(ctx).rpc("record_system_mobile_observation", {
    p_environment: environment,
    p_session_hash: sessionHash,
    p_actor_hash: actorHash,
    p_platform: platform,
    p_release_id: releaseId,
    p_build_id: buildId,
    p_last_observed_at: input.observed_at,
    p_api_status: apiStatus,
    p_reason_code: reasonCode,
    p_duration_ms: input.duration_ms,
  }), 5_000);
  if (result.error || typeof result.data !== "boolean") {
    apiFailure("DB_ERROR", "Không thể ghi nhận tín hiệu ứng dụng", 503);
  }
  return { accepted: result.data, observed_at: input.observed_at };
}

async function hashHmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeIdentity(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:+-]{1,100}$/u.test(trimmed) ? trimmed : null;
}
