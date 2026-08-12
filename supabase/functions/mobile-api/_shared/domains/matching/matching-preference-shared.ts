import { normalizeServiceAreaDistrict } from "../../../../_shared/domain.ts";
import { nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";

export type MatchingPreferenceInput = {
  auto_general: boolean;
  client_request_id: string;
  mode: "general" | "saved_worker_first";
  worker_id?: string;
};

export type MatchingFallbackReason =
  | "saved_worker_declined"
  | "saved_worker_expired"
  | "saved_worker_unavailable";

export function requireMatchingDistrict(value: unknown) {
  const district = normalizeServiceAreaDistrict(nullableString(value) ?? "");
  if (!district) apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  return district;
}

export function matchingFallbackEvent(reason: MatchingFallbackReason) {
  if (reason === "saved_worker_declined") return "matching_saved_worker_declined";
  if (reason === "saved_worker_expired") return "matching_saved_worker_expired";
  return "matching_saved_worker_unavailable";
}

export async function logMatchingEvent(
  client: DbClient,
  jobId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  const result = await dbQuery(
    client.from("job_events").insert({
      job_id: jobId,
      actor_id: null,
      actor_role: null,
      event_type: eventType,
      from_status: null,
      to_status: null,
      safe_metadata: metadata,
    }),
  );
  if (result.error) {
    console.warn("mobile-api matching event log failed", { eventType, jobId });
  }
}
