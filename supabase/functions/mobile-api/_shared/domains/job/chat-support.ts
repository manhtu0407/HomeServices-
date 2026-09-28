import { asString, nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient, workflowDb } from "../../platform/db.ts";
import type { JobChatContactGuard } from "./chat-guard.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { buildDemandingCustomerResponse, detectDemandingCustomerPatterns, recordDemandingCustomerInteraction } from "../../kael/index.ts";
import { guardOutput } from "../../kael/kael-guardrails/output-gateway.ts";
import { auditGuardrailTripBestEffort } from "../../kael/learning/audit.ts";

const DEMANDING_RESPONSE_SELF_CHECK_FALLBACK =
  "Kael đã ghi nhận yêu cầu kiểm tra kỹ. Giá và phạm vi hiện tại được giữ nguyên; Kael chỉ tiếp tục khi các dữ kiện và căn cứ hiển thị đủ rõ để bạn xác nhận.";
const DEMANDING_RESPONSE_SELF_CHECK_FALLBACK_EN =
  "Kael recorded the request for a careful review. The current price and scope remain unchanged until the displayed facts and evidence are clear enough for you to confirm.";

export async function maybeHandleJobChatContactGuard(
  client: DbClient,
  job: Record<string, unknown>,
  messageId: string,
  ctx: MobileApiContext,
  guard: JobChatContactGuard,
) {
  if (!guard.flagged) return;
  await retainRedactionEvidence(workflowDb(ctx), {
    job_id: asString(job.id),
    message_id: messageId,
    sender_id: ctx.user.id,
    sender_role: ctx.role,
    original_body: guard.originalContent,
    matched_rules: guard.signals,
  });
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
    messageId,
    signals: guard.signals,
    workerId: ctx.user.id,
  });
}

// The chat row keeps only the redacted text, so this is the one place an admin can later
// read what was actually sent when reviewing an off-app case. A failed write must not block
// the chat, but it is logged because it leaves that case without evidence.
async function retainRedactionEvidence(
  client: DbClient,
  row: {
    job_id: string;
    message_id: string;
    sender_id: string;
    sender_role: string;
    original_body: string;
    matched_rules: string[];
  },
) {
  const result = await dbQuery(client.from("chat_guard_redaction_evidence").insert(row));
  if (result.error) {
    console.warn("mobile-api chat redaction evidence write failed", {
      jobId: row.job_id,
      messageId: row.message_id,
      errorCode: result.error.code,
    });
  }
}

async function recordWorkerDisintermediationRisk(
  client: DbClient,
  input: { jobId: string; messageId: string; signals: string[]; workerId: string },
) {
  const args = {
    p_worker_id: input.workerId,
    p_job_id: input.jobId,
    p_message_id: input.messageId,
    p_signals: input.signals,
  };
  let result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("record_worker_disintermediation_memory_atomic", args),
  );
  if (result.error) {
    result = await dbQuery<Array<Record<string, unknown>>>(
      client.rpc("record_worker_disintermediation_memory_atomic", args),
    );
  }
  if (result.error) {
    console.warn("mobile-api worker disintermediation memory write failed", {
      jobId: input.jobId,
      messageId: input.messageId,
      errorCode: result.error.code,
    });
  }
}

export function selfCheckDemandingResponseText(
  responseText: string,
  language: "vi" | "en" = "vi",
): string {
  return guardDemandingResponseText(responseText, language).text;
}

export function guardDemandingResponseText(
  responseText: string,
  language: "vi" | "en" = "vi",
) {
  return guardOutput({
    text: responseText,
    actor: "customer",
    language,
    surface: "job_chat_demanding_response",
    fallbackText: language === "en"
      ? DEMANDING_RESPONSE_SELF_CHECK_FALLBACK_EN
      : DEMANDING_RESPONSE_SELF_CHECK_FALLBACK,
  });
}

export async function maybeHandleDemandingCustomerJobChat(
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
  const guarded = guardDemandingResponseText(response.responseText);
  if (guarded.trip) {
    await auditGuardrailTripBestEffort(client, {
      jobId: asString(job.id),
      actorId: ctx.user.id,
      actorRole: "customer",
      surface: guarded.trip.surface,
      reason: guarded.trip.reason,
      guardrailLabel: guarded.trip.guardrailLabel ?? null,
      source: guarded.trip.source,
    });
  }
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
    guarded.text,
  );
}

export async function insertKaelJobMessage(
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

export async function markJobMessagesRead(
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
