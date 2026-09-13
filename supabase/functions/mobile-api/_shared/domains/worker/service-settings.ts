import { nullableString } from "../../platform/coercions.ts";
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
  const patch: Record<string, unknown> = {
    districts,
  };
  if ("home_lat" in input) patch.home_lat = input.home_lat ?? null;
  if ("home_lng" in input) patch.home_lng = input.home_lng ?? null;
  if ("service_radius_km" in input) {
    patch.service_radius_km = input.service_radius_km ?? null;
  }

  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("update_worker_service_area_atomic", {
      p_actor_id: ctx.user.id,
      p_worker_id: ctx.user.id,
      p_patch: patch,
    }),
  );
  const row = result.data?.length === 1 ? result.data[0] : null;
  if (result.error || !row || typeof row.ok !== "boolean") {
    apiFailure("DB_ERROR", "Không thể cập nhật khu vực làm việc", 500);
  }
  if (!row.ok) {
    if (row.error_code === "ALREADY_FINALIZED") {
      apiFailure("ALREADY_FINALIZED", "Hồ sơ đang được xem xét hoặc bị khóa. Chưa thể đổi khu vực làm việc.", 409);
    }
    if (row.error_code === "NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ thợ", 404);
    if (row.error_code === "NOT_OWNER" || row.error_code === "WRONG_ROLE") {
      apiFailure("FORBIDDEN", "Bạn không có quyền cập nhật hồ sơ này", 403);
    }
    if (row.error_code === "INVALID_INPUT") apiFailure("VALIDATION", "Khu vực làm việc không hợp lệ", 400);
    apiFailure("DB_ERROR", "Không thể cập nhật khu vực làm việc", 500);
  }
  if (row.error_code !== null || row.worker_id !== ctx.user.id ||
    typeof row.updated_at !== "string" || normalizeIsoTimestamp(row.updated_at) === null) {
    apiFailure("DB_ERROR", "Không thể cập nhật khu vực làm việc", 500);
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
