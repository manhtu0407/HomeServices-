import { asString, nullableString } from "../../platform/coercions.ts";
import { type DbClient, dbQuery } from "../../platform/db.ts";
import { districtLabel, serviceLabel } from "../../platform/labels.ts";
import { sendPushToUser } from "../../platform/push.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { JobStatus, ServiceType } from "../../../../_shared/domain.ts";
import { NORMAL_TRANSACTION_SILENT_STATUSES } from "../../kael/index.ts";
import { insertUserNotification } from "./notifications-events.ts";

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
    body:
      "Vui lòng kiểm tra bằng chứng và chỉ xác nhận khi công việc đã hoàn tất đúng thỏa thuận.",
  },
};

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
  targets: Array<{
    workerId: string;
    broadcastId: string;
    deliveryId?: string;
    operationId?: string;
  }>,
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
        recipientOrdinal: index,
      });
    }
  });

  const pushResults = await Promise.allSettled(
    targets.map((target) =>
      sendPushToUser(
        client,
        target.workerId,
        {
          title: "Có yêu cầu mới gần bạn",
          body,
          data: {
            event_type: "broadcast_received",
            job_id: jobId,
            broadcast_id: target.broadcastId,
            deep_link: `/(worker)/jobs?broadcast_id=${target.broadcastId}`,
          },
          sound: "default",
        },
        {
          operationId: target.operationId ?? "matching.broadcast.push",
          idempotencyKey: target.deliveryId
            ? `matching-delivery:${target.deliveryId}`
            : undefined,
          matchingDeliveryId: target.deliveryId,
        },
      )
    ),
  );
  pushResults.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn("mobile-api worker push delivery threw", {
        jobId,
        recipientOrdinal: index,
      });
      return;
    }
    if (result.value.failed > 0) {
      console.warn("mobile-api worker push delivery had failures", {
        jobId,
        recipientOrdinal: index,
        failed: result.value.failed,
      });
      return;
    }
  });
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
  if (
    (NORMAL_TRANSACTION_SILENT_STATUSES as readonly string[]).includes(status)
  ) return;
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
