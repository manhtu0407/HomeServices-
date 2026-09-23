import {
  asBoolean,
  asString,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery, workflowDb } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type {
  DevicePushTokenInput,
  EdgeDevicePushTokenUnregisterInput,
  EdgeMatchingPushDeliveryAckInput,
} from "../../../../_shared/domain.ts";

export async function listNotifications(ctx: MobileApiContext) {
  const unreadResult = await dbQuery<null>(
    db(ctx)
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.user.id)
      .neq("status", "read")
      .neq("status", "archived"),
  );
  if (unreadResult.error) {
    apiFailure("DB_ERROR", "Không thể tải số thông báo chưa đọc", 500);
  }
  if (
    typeof unreadResult.count !== "number" ||
    !Number.isSafeInteger(unreadResult.count) ||
    unreadResult.count < 0
  ) {
    apiFailure("DB_ERROR", "Dữ liệu số thông báo chưa đọc không hợp lệ", 500);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx)
      .from("notifications")
      .select(
        "id, title, body, event_type, status, job_id, created_at, read_at",
      )
      .eq("user_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(30),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải thông báo", 500);
  }
  const notifications = (result.data ?? []).map((row) => ({
    id: requiredNotificationString(row.id),
    title: requiredNotificationString(row.title),
    body: requiredNotificationString(row.body),
    event_type: requiredNotificationString(row.event_type),
    status: requiredNotificationString(row.status),
    job_id: nullableString(row.job_id),
    created_at: requiredNotificationString(row.created_at),
    read_at: nullableString(row.read_at),
  }));
  return {
    unread_count: unreadResult.count,
    notifications,
  };
}

export async function markNotificationRead(
  ctx: MobileApiContext,
  notificationId: string,
) {
  const readAt = new Date().toISOString();
  // authenticated may read its own notifications but not update them; the write is scoped to
  // ctx.user.id below.
  const result = await dbQuery<Record<string, unknown>>(
    workflowDb(ctx)
      .from("notifications")
      .update({ status: "read", read_at: readAt })
      .eq("id", notificationId)
      .eq("user_id", ctx.user.id)
      .select("id, read_at")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật thông báo", 500);
  }
  if (!result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy thông báo", 404);
  }
  return {
    notification_id: asString(result.data.id),
    status: "read" as const,
    read_at: nullableString(result.data.read_at) ?? readAt,
  };
}

export async function registerDevicePushToken(
  ctx: MobileApiContext,
  input: DevicePushTokenInput,
) {
  const safeMetadata = {
    ...(typeof input.safe_metadata.project_id_available === "boolean"
      ? { project_id_available: input.safe_metadata.project_id_available }
      : {}),
    role: ctx.role,
    source: "expo-notifications",
  };
  // The device-token and delivery-ack RPCs are service_role-only and take the user id as an
  // argument, so it comes from ctx and never from the request body.
  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowDb(ctx).rpc("register_device_push_token_atomic", {
      p_user_id: ctx.user.id,
      p_platform: input.platform,
      p_push_token: input.push_token,
      p_permission_status: input.permission_status,
      p_safe_metadata: safeMetadata,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể lưu thiết bị nhận thông báo", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure(
      "VALIDATION",
      "Dữ liệu thiết bị nhận thông báo không hợp lệ",
      400,
    );
  }
  if (
    typeof row.enabled_out !== "boolean" ||
    typeof row.token_id !== "string" || !row.token_id.trim() ||
    typeof row.updated_at_ts !== "string" || !row.updated_at_ts.trim()
  ) {
    apiFailure("DB_ERROR", "Dữ liệu thiết bị nhận thông báo không hợp lệ", 500);
  }
  return {
    token_id: row.token_id,
    enabled: row.enabled_out,
    updated_at: row.updated_at_ts,
  };
}

function requiredNotificationString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    apiFailure("DB_ERROR", "Dữ liệu thông báo không hợp lệ", 500);
  }
  return value;
}

export async function unregisterDevicePushToken(
  ctx: MobileApiContext,
  input: EdgeDevicePushTokenUnregisterInput,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowDb(ctx).rpc("unregister_device_push_token_atomic", {
      p_user_id: ctx.user.id,
      p_push_token: input.push_token,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể gỡ thiết bị nhận thông báo", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure(
      "VALIDATION",
      "Dữ liệu thiết bị nhận thông báo không hợp lệ",
      400,
    );
  }
  return {
    token_id: nullableString(row.token_id),
    unregistered: asBoolean(row.unregistered_out),
    updated_at: asString(row.updated_at_ts),
  };
}

export async function acknowledgeMatchingPushDelivery(
  ctx: MobileApiContext,
  input: EdgeMatchingPushDeliveryAckInput,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowDb(ctx).rpc("acknowledge_matching_push_delivery", {
      p_delivery_id: input.matching_delivery_id,
      p_worker_id: ctx.user.id,
      p_device_push_token_id: input.device_push_token_id,
      p_device_push_token_updated_at: input.device_push_token_updated_at,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể xác nhận thiết bị đã nhận yêu cầu", 500);
  }
  const row = result.data?.[0];
  if (!row || typeof row.id !== "string" || typeof row.delivered_at !== "string") {
    apiFailure(
      "DELIVERY_ACK_REJECTED",
      "Yêu cầu đã hết hạn hoặc không còn thuộc thiết bị này",
      409,
    );
  }
  return {
    acknowledged: true as const,
    delivery_id: row.id,
    delivered_at: row.delivered_at,
  };
}
