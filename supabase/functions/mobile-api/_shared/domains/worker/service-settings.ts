import { asString, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, normalizeWorkerDistricts } from "../../platform/db.ts";
import { mapAvailabilityError } from "../../platform/domain-error-mappers.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { normalizeIsoTimestamp } from "../../platform/iso-timestamp.ts";
import type {
  WorkerServiceAreaUpdateInput,
  WorkerServicePreferencesUpdateInput,
} from "../../../../_shared/domain.ts";
import { getWorkerProfile } from "./profile.ts";

export async function updateWorkerServiceArea(
  ctx: MobileApiContext,
  input: WorkerServiceAreaUpdateInput,
) {
  const districts = normalizeWorkerDistricts(input.districts);
  if (!districts) {
    apiFailure("VALIDATION", "Khu vực làm việc không hợp lệ", 400);
  }
  const update: Record<string, unknown> = {
    districts,
    updated_at: new Date().toISOString(),
  };
  if ("home_lat" in input) update.home_lat = input.home_lat ?? null;
  if ("home_lng" in input) update.home_lng = input.home_lng ?? null;
  if ("service_radius_km" in input) {
    update.service_radius_km = input.service_radius_km ?? null;
  }

  const result = await dbQuery<{ id: string }>(
    db(ctx)
      .from("worker_profiles")
      .update(update)
      .eq("id", ctx.user.id)
      .select("id")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật khu vực làm việc", 500);
  }
  if (!result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ thợ", 404);
  }
  return getWorkerProfile(ctx);
}

export async function updateWorkerServicePreferences(
  ctx: MobileApiContext,
  input: WorkerServicePreferencesUpdateInput,
) {
  const result = await dbQuery<{ id: string }>(
    db(ctx)
      .from("worker_profiles")
      .update({
        active_service_types: input.selected_service_types,
        selected_service_types: input.selected_service_types,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ctx.user.id)
      .select("id")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật dịch vụ muốn nhận", 500);
  }
  if (!result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ thợ", 404);
  }
  return getWorkerProfile(ctx);
}

export async function updateWorkerAvailability(
  ctx: MobileApiContext,
  input: { is_available: boolean },
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("set_worker_availability_atomic", {
      p_worker_id: ctx.user.id,
      p_is_available: input.is_available,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  }
  const row = availabilityRpcRow(result.data?.[0]);
  if (!row) apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  if (!row.ok) mapAvailabilityError(nullableString(row.error_code));
  if (
    typeof row.is_available !== "boolean" ||
    typeof row.updated_at_ts !== "string" ||
    normalizeIsoTimestamp(row.updated_at_ts) === null
  ) {
    apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  }

  return {
    worker_id: ctx.user.id,
    is_available: row.is_available,
    updated_at: row.updated_at_ts,
  };
}

function availabilityRpcRow(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.ok !== "boolean" ||
    (row.error_code !== null && typeof row.error_code !== "string") ||
    (row.is_available !== null && typeof row.is_available !== "boolean") ||
    (row.updated_at_ts !== null && typeof row.updated_at_ts !== "string")
  ) return null;
  return row;
}
