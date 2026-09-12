import { nullableString } from "../../platform/coercions.ts";
import { type DbClient, dbQuery } from "../../platform/db.ts";
import { sendPushToUser } from "../../platform/push.ts";
import type { CustomerCancellationSubCase } from "../../kael/index.ts";

export async function notifyCustomerScopeChangeRequested(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  scopeChangeId: string,
) {
  if (!customerId || !scopeChangeId) return;
  const title = "Cần duyệt thay đổi phạm vi";
  const body =
    "Thợ vừa gửi thay đổi phạm vi. Phần thay đổi đang tạm dừng đến khi bạn xác nhận hoặc giữ phạm vi cũ.";
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: "scope_change_requested",
    title,
    body,
    metadata: {
      scope_change_id: scopeChangeId,
      actor: "worker",
      customer_confirmation_required: true,
    },
  });

  const push = await sendPushToUser(client, customerId, {
    title,
    body,
    data: {
      event_type: "scope_change_requested",
      job_id: jobId,
      scope_change_id: scopeChangeId,
      deep_link:
        `/(customer)/history?scope_change=${scopeChangeId}&job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn(
      "mobile-api scope-change customer push delivery had failures",
      {
        jobId,
        failed: push.failed,
      },
    );
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
    ? "Khách đã hủy lịch sắp tới. Bạn không cần tiếp tục công việc này."
    : "Khách đã hủy yêu cầu. Bạn không cần tiếp tục công việc này.";

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
    console.warn(
      "mobile-api customer-cancel worker push delivery had failures",
      {
        jobId,
        failed: push.failed,
      },
    );
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
    ? "Khách đã xác nhận thay đổi"
    : "Khách giữ phạm vi cũ";
  const body = approved
    ? "Bạn có thể tiếp tục theo phạm vi và mức giá mới mà khách vừa xác nhận."
    : "Công việc tiếp tục theo phạm vi đã chốt trước đó; không thực hiện phần thay đổi.";
  await insertUserNotification(client, {
    userId: workerId,
    jobId,
    eventType,
    title,
    body,
    metadata: { scope_change_id: scopeChangeId, decision, actor: "customer" },
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
    console.warn(
      "mobile-api worker scope-decision push delivery had failures",
      {
        jobId,
        failed: push.failed,
      },
    );
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
