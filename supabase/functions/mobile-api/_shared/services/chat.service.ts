// Edge service chat domain (C4 6a, services/* split): in-app job messaging (list/send/threads) with
// the contact-guard + demanding-customer handlers. (kael-chat AI conversation stays in services.ts.)
// Imported directly by services.ts.

import { asBoolean, asNumber, asString, nullableRecord, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { evaluateJobChatContactGuard, JOB_CHAT_SEND_STATUSES, serializeJobMessage, type JobChatContactGuard } from "./_shared.ts";
import { notifyJobMessageRecipient } from "./notifications.service.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { requireJobAccess } from "../access.ts";
import { buildDemandingCustomerResponse, detectDemandingCustomerPatterns, recordDemandingCustomerInteraction } from "../kael/index.ts";
import { runKaelSelfCheckPipeline } from "../kael/self-check.ts";
import type { JobMessageSendInput, JobStatus } from "../../../_shared/domain.ts";

const DEMANDING_RESPONSE_SELF_CHECK_FALLBACK =
  "Kael đã ghi nhận và lưu lại đầy đủ trao đổi của bạn. Nếu cần, bạn có thể yêu cầu admin can thiệp.";

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
  await maybeHandleJobChatContactGuard(client, job, ctx, contactGuard);
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

async function maybeHandleJobChatContactGuard(
  client: DbClient,
  job: Record<string, unknown>,
  ctx: MobileApiContext,
  guard: JobChatContactGuard,
) {
  if (!guard.flagged) return;
  await insertKaelJobMessage(
    client,
    asString(job.id),
    ctx.role === "worker"
      ? "Kael giữ liên hệ, bằng chứng và thanh toán trong app để bảo vệ cả khách và thợ. Nếu phát sinh phạm vi, hãy gửi scope-change trong phòng việc."
      : "Kael giữ liên hệ, bằng chứng và thanh toán trong app để bảo vệ giao dịch. Nếu cần trao đổi thêm, hãy nhắn ngay tại phòng việc này.",
  );
  if (ctx.role !== "worker") return;
  await recordWorkerDisintermediationRisk(client, {
    jobId: asString(job.id),
    signals: guard.signals,
    workerId: ctx.user.id,
  });
}

async function recordWorkerDisintermediationRisk(
  client: DbClient,
  input: { jobId: string; signals: string[]; workerId: string },
) {
  const observedAt = new Date().toISOString();
  const existing = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_kael_memory")
      .select("red_flags, reliability_signals, safe_metadata")
      .eq("worker_id", input.workerId)
      .maybeSingle(),
  );
  const redFlags = nullableRecord(existing.data?.red_flags) ?? {};
  const reliabilitySignals = nullableRecord(existing.data?.reliability_signals) ?? {};
  const safeMetadata = nullableRecord(existing.data?.safe_metadata) ?? {};
  const previousCount = asNumber(redFlags.disintermediation_risk_count);
  await dbQuery(
    client.from("worker_kael_memory").upsert({
      worker_id: input.workerId,
      red_flags: {
        ...redFlags,
        disintermediation_contact_leak: true,
        disintermediation_risk_count: previousCount + 1,
        last_disintermediation_at: observedAt,
        last_disintermediation_job_id: input.jobId,
        last_disintermediation_signals: input.signals,
      },
      reliability_signals: {
        ...reliabilitySignals,
        app_channel_guard_triggered: true,
      },
      safe_metadata: {
        ...safeMetadata,
        last_disintermediation_guard: {
          job_id: input.jobId,
          observed_at: observedAt,
          signals: input.signals,
        },
      },
      last_observed_at: observedAt,
    }),
  );
  await dbQuery(
    client.from("kael_admin_queue").insert({
      job_id: input.jobId,
      actor_id: input.workerId,
      actor_role: "worker",
      queue_type: "disintermediation_risk",
      priority: "medium",
      status: "open",
      escalation_level: "soft",
      reason_code: "worker_contact_or_off_app_solicitation",
      response_summary: "worker_chat_contact_guard_triggered",
      safe_metadata: {
        guard: "chat_contact_redaction",
        signals: input.signals,
      },
    }),
  );
}

export function selfCheckDemandingResponseText(responseText: string): string {
  const checked = runKaelSelfCheckPipeline({
    text: responseText,
    actor: "customer",
    language: "vi",
    semanticGuardEnabled: true,
    fallbackText: DEMANDING_RESPONSE_SELF_CHECK_FALLBACK,
  });
  return checked.text;
}

async function maybeHandleDemandingCustomerJobChat(
  client: DbClient,
  job: Record<string, unknown>,
  ctx: MobileApiContext,
  message: string,
) {
  if (ctx.role !== "customer") return;
  const detection = detectDemandingCustomerPatterns({
    message,
    qaCount: 1,
    cancelCount: 0,
  });
  if (detection.expectedNuance === "none") return;

  const response = buildDemandingCustomerResponse(detection);
  await recordDemandingCustomerInteraction(client, {
    jobId: asString(job.id),
    actorId: ctx.user.id,
    actorRole: "customer",
    message,
    detection,
    response,
  });
  await insertKaelJobMessage(
    client,
    asString(job.id),
    selfCheckDemandingResponseText(response.responseText),
  );
}

async function insertKaelJobMessage(
  client: DbClient,
  jobId: string,
  content: string,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("chat_messages")
      .insert({
        job_id: jobId,
        sender_id: null,
        sender_role: "kael",
        content,
      })
      .select("id, job_id, sender_id, sender_role, content, is_read, created_at")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể lưu phản hồi Kael", 500);
  }
  return result.data;
}

async function markJobMessagesRead(
  client: DbClient,
  jobId: string,
  readerId: string,
) {
  const result = await dbQuery(
    client
      .from("chat_messages")
      .update({ is_read: true })
      .eq("job_id", jobId)
      .neq("sender_id", readerId)
      .eq("is_read", false)
      .select("id"),
  );
  if (result.error) {
    console.warn("mobile-api chat read update failed", {
      jobId,
      errorCode: result.error.code,
    });
  }
}
