// Edge service chat domain (C4 6a, services/* split): in-app job messaging (list/send/threads) with
// the contact-guard + demanding-customer handlers. (kael-chat AI conversation stays in services.ts.)
// Imported directly by services.ts.

import { asBoolean, asString, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { evaluateJobChatContactGuard } from "./chat-guard.ts";
import { JOB_CHAT_SEND_STATUSES } from "../../platform/job-state.ts";
import { serializeJobMessage } from "./serialize.ts";
import { notifyJobMessageRecipient } from "../notification/notifications.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { recordJobIncidentChatMessage } from "./incident.ts";
import type { EdgeAiSecrets } from "../../kael/index.ts";
import type { JobMessageSendInput, JobStatus } from "../../../../_shared/domain.ts";
import {
  markJobMessagesRead,
  maybeHandleDemandingCustomerJobChat,
  maybeHandleJobChatContactGuard,
} from "./chat-support.ts";

export {
  guardDemandingResponseText,
  insertKaelJobMessage,
  selfCheckDemandingResponseText,
} from "./chat-support.ts";

export async function listJobMessages(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  await requireJobAccess(client, jobId, ctx, {
    select: "id, status, customer_id, worker_id",
  });
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("chat_messages")
      .select("id, job_id, sender_id, sender_role, content, is_read, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(100),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải tin nhắn", 500);
  }
  await markJobMessagesRead(client, jobId, ctx.user.id);
  return {
    job_id: jobId,
    messages: (result.data ?? []).map(serializeJobMessage).reverse(),
  };
}

export async function sendJobMessage(
  ctx: MobileApiContext,
  jobId: string,
  input: JobMessageSendInput,
  secrets: EdgeAiSecrets,
) {
  if (ctx.role !== "customer" && ctx.role !== "worker") {
    apiFailure("AUTH_FORBIDDEN", "Bạn không có quyền gửi tin nhắn", 403);
  }
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select: "id, status, customer_id, worker_id",
  });
  if (!JOB_CHAT_SEND_STATUSES.includes(job.status as JobStatus)) {
    apiFailure(
      "INVALID_STATUS",
      "Chưa thể gửi tin nhắn ở trạng thái yêu cầu hiện tại",
      409,
    );
  }
  const content = input.content.trim();
  if (!content) apiFailure("VALIDATION", "Nội dung tin nhắn không hợp lệ", 400);
  const contactGuard = evaluateJobChatContactGuard(content);
  const storedContent = contactGuard.flagged ? contactGuard.redactedContent : content;

  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("chat_messages")
      .insert({
        job_id: jobId,
        sender_id: ctx.user.id,
        sender_role: ctx.role,
        content: storedContent,
      })
      .select("id, job_id, sender_id, sender_role, content, is_read, created_at")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể gửi tin nhắn", 500);
  }
  const message = serializeJobMessage(result.data);
  await maybeHandleJobChatContactGuard(client, job, message.id, ctx, contactGuard);
  // Keep the demanding-customer detector OFF for
  // contact-guarded messages. The additive attempt (PR #64) re-ran the raw text through
  // the detector and (a) leaked an email into kael_interaction_log (excerpt sanitizer
  // strips only digits) and (b) miscategorized off-app PAYMENT phrases ("trả tiền" /
  // "tiền mặt") as demand_refund pressure -> a spurious "demanding" escalation + unrelated
  // pressure reply. The contact guard already redacts, nudges, and records disintermediation
  // risk, so the mutually-exclusive design is the correct, protective behaviour.
  if (!contactGuard.flagged) {
    await maybeHandleDemandingCustomerJobChat(client, job, ctx, content);
  }
  await notifyJobMessageRecipient(client, job, ctx, message.id);
  if (!contactGuard.flagged) {
    try {
      await recordJobIncidentChatMessage(client, job, message, ctx, secrets);
    } catch (error) {
      console.warn("mobile-api job incident advance failed", {
        jobId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  }
  return { message };
}

export async function listMyThreads(ctx: MobileApiContext) {
  const client = db(ctx);
  const jobsResult = await dbQuery<
    Array<{ id: string; status: string; service_type: string | null }>
  >(
    client
      .from("jobs")
      .select("id, status, service_type")
      .eq("customer_id", ctx.user.id)
      .order("updated_at", { ascending: false })
      .limit(50),
  );
  if (jobsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải hộp thư", 500);
  }
  const jobs = jobsResult.data ?? [];
  if (jobs.length === 0) return { threads: [] };

  const messagesResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("chat_messages")
      .select("job_id, content, sender_role, is_read, created_at")
      .in("job_id", jobs.map((job) => job.id))
      .order("created_at", { ascending: false }),
  );
  if (messagesResult.error) {
    apiFailure("DB_ERROR", "Không thể tải hộp thư", 500);
  }
  const latestByJob = new Map<string, Record<string, unknown>>();
  const unreadByJob = new Map<string, number>();
  for (const message of messagesResult.data ?? []) {
    const jobId = asString(message.job_id);
    // messages are created_at desc, so the first seen per job is the latest.
    if (!latestByJob.has(jobId)) latestByJob.set(jobId, message);
    if (
      asBoolean(message.is_read) === false &&
      nullableString(message.sender_role) !== "customer"
    ) {
      unreadByJob.set(jobId, (unreadByJob.get(jobId) ?? 0) + 1);
    }
  }

  const threads = jobs
    .map((job) => {
      const latest = latestByJob.get(job.id);
      if (!latest) return null;
      return {
        job_id: job.id,
        status: job.status,
        service_type: nullableString(job.service_type),
        last_message: {
          content: asString(latest.content),
          sender_role: nullableString(latest.sender_role),
          created_at: asString(latest.created_at),
        },
        unread_count: unreadByJob.get(job.id) ?? 0,
      };
    })
    .filter((thread): thread is NonNullable<typeof thread> => thread !== null)
    .sort((a, b) =>
      b.last_message.created_at.localeCompare(a.last_message.created_at)
    );
  return { threads };
}
