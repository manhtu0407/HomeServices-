// Edge service notifications domain (C4 6a, services/* split): notification list/read/device
// API endpoints + notify* push senders + insertUserNotification. Imported directly by services.ts.

import { asBoolean, asString, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { districtLabel, serviceLabel } from "./_shared.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { sendPushToUser } from "../push.ts";
import type { DevicePushTokenInput, JobStatus, ServiceType } from "../../../_shared/domain.ts";
import {
  NORMAL_TRANSACTION_SILENT_STATUSES,
  type CustomerCancellationSubCase,
  type KaelAutonomyDecision,
} from "../kael/index.ts";

type NotificationCopy = {
  eventType: string;
  title: string;
  body: string;
};

const CUSTOMER_STATUS_PUSH: Partial<Record<JobStatus, NotificationCopy>> = {
  arrived: {
    eventType: "worker_arrived",
    title: "Thợ đã đến",
    body: "Thợ đã đến nơi và chuẩn bị kiểm tra.",
  },
  completed_by_worker: {
    eventType: "completed_by_worker",
    title: "Thợ đã báo hoàn tất",
    body: "Kael đang kiểm tra bằng chứng hoàn tất và sẽ xác nhận hoặc mở tranh chấp theo chính sách.",
  },
};

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
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx)
      .from("notifications")
      .select("id, title, body, event_type, status, job_id, created_at, read_at")
      .eq("user_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(30),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải thông báo", 500);
  }
  const notifications = (result.data ?? []).map((row) => ({
    id: asString(row.id),
    title: asString(row.title),
    body: asString(row.body),
    event_type: asString(row.event_type),
    status: asString(row.status),
    job_id: nullableString(row.job_id),
    created_at: asString(row.created_at),
    read_at: nullableString(row.read_at),
  }));
  return {
    unread_count: unreadResult.count ?? 0,
    notifications,
  };
}

export async function markNotificationRead(
  ctx: MobileApiContext,
  notificationId: string,
) {
  const readAt = new Date().toISOString();
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
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
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("register_device_push_token_atomic", {
      p_user_id: ctx.user.id,
      p_platform: input.platform,
      p_push_token: input.push_token,
      p_permission_status: input.permission_status,
      p_safe_metadata: input.safe_metadata,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể lưu thiết bị nhận thông báo", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure("VALIDATION", "Dữ liệu thiết bị nhận thông báo không hợp lệ", 400);
  }
  return {
    token_id: asString(row.token_id),
    enabled: asBoolean(row.enabled_out),
    updated_at: asString(row.updated_at_ts),
  };
}

export async function notifyJobMessageRecipient(
  client: DbClient,
  job: Record<string, unknown>,
  ctx: MobileApiContext,
  messageId: string,
) {
  const recipientId = ctx.role === "customer"
    ? nullableString(job.worker_id)
    : nullableString(job.customer_id);
  if (!recipientId) return;

  const title = "Có tin nhắn mới";
  const body = "Bạn có tin nhắn mới trong công việc.";
  await insertUserNotification(client, {
    userId: recipientId,
    jobId: asString(job.id),
    eventType: "job_message_received",
    title,
    body,
    metadata: { message_id: messageId },
  });

  const jobId = asString(job.id);
  const deepLink = ctx.role === "customer"
    ? `/(worker)/jobs?job_id=${jobId}`
    : `/(customer)/history?job_id=${jobId}`;
  const push = await sendPushToUser(client, recipientId, {
    title,
    body,
    data: {
      event_type: "job_message_received",
      job_id: jobId,
      message_id: messageId,
      deep_link: deepLink,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api chat message push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

export async function notifyBroadcastWorkers(
  client: DbClient,
  jobId: string,
  serviceType: ServiceType,
  district: string,
  expiresAt: string,
  targets: Array<{ workerId: string; broadcastId: string }>,
) {
  if (targets.length === 0) return;
  const body = `${serviceLabel(serviceType)} - ${districtLabel(district)}`;
  const notificationResults = await Promise.allSettled(
    targets.map((target) =>
      dbQuery<Array<Record<string, unknown>>>(
        client.rpc("insert_notification_atomic", {
          p_user_id: target.workerId,
          p_job_id: jobId,
          p_event_type: "broadcast_received",
          p_title: "Có yêu cầu mới",
          p_body: body,
          p_safe_metadata: {
            broadcast_id: target.broadcastId,
            expires_at: expiresAt,
          },
        }),
      )
    ),
  );
  notificationResults.forEach((result, index) => {
    if (result.status === "rejected" || result.value.error) {
      console.warn("mobile-api worker notification insert failed", {
        jobId,
        workerId: targets[index]?.workerId,
      });
    }
  });

  for (const target of targets) {
    const push = await sendPushToUser(client, target.workerId, {
      title: "Có yêu cầu mới gần bạn",
      body,
      data: {
        event_type: "broadcast_received",
        job_id: jobId,
        broadcast_id: target.broadcastId,
        deep_link: `/(worker)/jobs?broadcast_id=${target.broadcastId}`,
      },
      sound: "default",
    });
    if (push.failed > 0) {
      console.warn("mobile-api worker push delivery had failures", {
        jobId,
        workerId: target.workerId,
        failed: push.failed,
      });
    }
  }
}

export async function notifyCustomerWorkerMatched(
  client: DbClient,
  jobId: string,
  workerId: string,
) {
  const customerLookup = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("customer_id").eq("id", jobId).single(),
  );
  if (customerLookup.error || !customerLookup.data) {
    console.warn("mobile-api customer notification lookup failed", { jobId });
    return;
  }
  const customerId = nullableString(customerLookup.data.customer_id);
  if (!customerId) return;

  const notification = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("insert_notification_atomic", {
      p_user_id: customerId,
      p_job_id: jobId,
      p_event_type: "worker_matched",
      p_title: "Đã có thợ nhận việc",
      p_body: "Thợ đang chuẩn bị, bạn có thể theo dõi trong Hoạt động.",
      p_safe_metadata: { worker_id: workerId },
    }),
  );
  if (notification.error) {
    console.warn("mobile-api customer notification insert failed", { jobId });
  }

  const push = await sendPushToUser(client, customerId, {
    title: "Đã có thợ nhận việc",
    body: "Thợ đang chuẩn bị đến.",
    data: {
      event_type: "worker_matched",
      job_id: jobId,
      deep_link: `/(customer)/history?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api customer push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

export async function notifyKaelConfirmedCompletion(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  workerId: string | null,
  finalPrice: number | null,
  decision: KaelAutonomyDecision,
) {
  const metadata = {
    final_price: finalPrice,
    autonomy_decision: decision,
  };
  if (customerId) {
    await insertUserNotification(client, {
      userId: customerId,
      jobId,
      eventType: "kael_confirmed_completion",
      title: "Kael đã xác nhận hoàn tất",
      body: "Kael đã xác nhận công việc từ bằng chứng hoàn tất. Bạn có thể xem lại hoặc đánh giá trong Hoạt động.",
      metadata,
    });
  }
  if (workerId) {
    await insertUserNotification(client, {
      userId: workerId,
      jobId,
      eventType: "kael_confirmed_completion",
      title: "Kael đã xác nhận hoàn tất",
      body: "Kael đã xác nhận công việc từ bằng chứng hoàn tất. Đối soát thu nhập sẽ cập nhật.",
      metadata,
    });
  }
}

export async function notifyCustomerWorkerCheckedIn(
  client: DbClient,
  jobId: string,
  customerId: string | null,
) {
  if (!customerId) return;
  const title = "Thợ đã tới sảnh";
  const body =
    'Thợ đã check-in tại sảnh. Bấm "Cho thợ lên" để mở số căn hộ chính xác cho thợ.';
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: "worker_checked_in_awaiting_authorization",
    title,
    body,
    metadata: { release_stage: "checked_in_awaiting_customer_authorization" },
  });
  await sendPushToUser(client, customerId, {
    title,
    body,
    data: {
      event_type: "worker_checked_in_awaiting_authorization",
      job_id: jobId,
    },
  });
}

export async function notifyCustomerJobStatus(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  status: JobStatus,
) {
  if (!customerId) return;
  if ((NORMAL_TRANSACTION_SILENT_STATUSES as readonly string[]).includes(status)) return;
  const copy = CUSTOMER_STATUS_PUSH[status];
  if (!copy) return;

  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: copy.eventType,
    title: copy.title,
    body: copy.body,
    metadata: { status },
  });

  const push = await sendPushToUser(client, customerId, {
    title: copy.title,
    body: copy.body,
    data: {
      event_type: copy.eventType,
      job_id: jobId,
      deep_link: `/(customer)/history?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api customer status push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

export async function notifyCustomerScopeChangeRequested(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  scopeChangeId: string,
) {
  if (!customerId || !scopeChangeId) return;
  const title = "Cần duyệt thay đổi phạm vi";
  const body = "Thợ vừa gửi thay đổi phạm vi. Vui lòng xem ngay.";
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: "scope_change_requested",
    title,
    body,
    metadata: { scope_change_id: scopeChangeId },
  });

  const push = await sendPushToUser(client, customerId, {
    title,
    body,
    data: {
      event_type: "scope_change_requested",
      job_id: jobId,
      scope_change_id: scopeChangeId,
      deep_link: `/(customer)/history?scope_change=${scopeChangeId}&job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api scope-change customer push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

export async function notifyCustomerScopeChangeDecided(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  scopeChangeId: string,
  decision: "approve" | "reject",
) {
  if (!customerId || !scopeChangeId) return;
  const approved = decision === "approve";
  const title = approved
    ? "Kael đã duyệt thay đổi phạm vi"
    : "Kael đã từ chối thay đổi phạm vi";
  const body = approved
    ? "Kael đã cập nhật giá theo phạm vi mới. Bạn có thể xem lại hoặc khiếu nại trong Hoạt động."
    : "Kael đã hủy phần phát sinh theo chính sách. Bạn có thể xem lại trong Hoạt động.";
  const eventType = approved
    ? "scope_change_auto_approved"
    : "scope_change_auto_rejected";
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType,
    title,
    body,
    metadata: { scope_change_id: scopeChangeId, decision, actor: "kael_system" },
  });

  const push = await sendPushToUser(client, customerId, {
    title,
    body,
    data: {
      event_type: eventType,
      job_id: jobId,
      scope_change_id: scopeChangeId,
      deep_link: `/(customer)/history?scope_change=${scopeChangeId}&job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api scope-change customer decision push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

export async function notifyCustomerWorkerReplacementSearch(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  broadcastSent: boolean,
) {
  if (!customerId) return;
  const title = "Đang tìm thợ thay thế";
  const body = broadcastSent
    ? "Kael đã gửi yêu cầu đến thợ phù hợp khác."
    : "Kael đang tìm thợ phù hợp khác cho yêu cầu này.";
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: "worker_replacement_search",
    title,
    body,
    metadata: { broadcast_sent: broadcastSent },
  });

  const push = await sendPushToUser(client, customerId, {
    title,
    body,
    data: {
      event_type: "worker_replacement_search",
      job_id: jobId,
      deep_link: `/(customer)/history?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api replacement customer push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

export async function notifyWorkerCustomerCancellation(
  client: DbClient,
  jobId: string,
  workerId: string,
  subCase: CustomerCancellationSubCase,
) {
  if (!workerId) return;
  const title = "Khách đã hủy yêu cầu";
  const body = subCase === "scheduled_job"
    ? "Khách đã hủy lịch sắp tới. Kael đã ghi nhận trong Phase 0."
    : "Khách đã hủy sau khi bạn nhận việc. Kael đã ghi nhận goodwill Phase 0.";

  await insertUserNotification(client, {
    userId: workerId,
    jobId,
    eventType: "customer_cancelled_after_accept",
    title,
    body,
    metadata: {
      sub_case: subCase,
      phase0_no_monetary_penalty: true,
    },
  });

  const push = await sendPushToUser(client, workerId, {
    title,
    body,
    data: {
      event_type: "customer_cancelled_after_accept",
      job_id: jobId,
      deep_link: `/(worker)/jobs?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api customer-cancel worker push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

export async function notifyWorkerScopeDecision(
  client: DbClient,
  jobId: string,
  scopeChangeId: string,
  decision: "approve" | "reject",
) {
  if (!jobId || !scopeChangeId) return;
  const workerLookup = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("worker_id").eq("id", jobId).single(),
  );
  if (workerLookup.error || !workerLookup.data) {
    console.warn("mobile-api worker scope-decision lookup failed", { jobId });
    return;
  }
  const workerId = nullableString(workerLookup.data.worker_id);
  if (!workerId) return;

  const approved = decision === "approve";
  const eventType = approved
    ? "scope_change_approved"
    : "scope_change_rejected";
  const title = approved
    ? "Kael đã duyệt thay đổi"
    : "Kael đã từ chối thay đổi";
  const body = approved
    ? "Bạn có thể tiếp tục xử lý công việc. Khách vẫn có đường khiếu nại nếu thông tin thực tế chưa đúng."
    : "Công việc đã được hủy theo quyết định của Kael.";
  await insertUserNotification(client, {
    userId: workerId,
    jobId,
    eventType,
    title,
    body,
    metadata: { scope_change_id: scopeChangeId, decision, actor: "kael_system" },
  });

  const push = await sendPushToUser(client, workerId, {
    title,
    body,
    data: {
      event_type: eventType,
      job_id: jobId,
      scope_change_id: scopeChangeId,
      deep_link: `/(worker)/jobs?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api worker scope-decision push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

export async function insertUserNotification(
  client: DbClient,
  input: {
    userId: string;
    jobId: string;
    eventType: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  },
) {
  const notification = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("insert_notification_atomic", {
      p_user_id: input.userId,
      p_job_id: input.jobId,
      p_event_type: input.eventType,
      p_title: input.title,
      p_body: input.body,
      p_safe_metadata: input.metadata ?? {},
    }),
  );
  if (notification.error) {
    console.warn("mobile-api notification insert failed", {
      jobId: input.jobId,
      eventType: input.eventType,
    });
  }
}
