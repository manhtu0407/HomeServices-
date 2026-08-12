import type {
  EdgeCustomerKaelConversationMode,
  EdgeCustomerKaelConversationTurnInput,
  JobStatus,
} from "../../../../_shared/domain.ts";
import {
  scrubSensitiveForLLM,
  type EdgeAiSecrets,
  type KaelReasoningReporter,
  type KaelResponseReporter,
} from "../../kael/index.ts";
import { sanitizeCustomerCaseEvidenceText } from "../../kael/evidence/untrusted-evidence.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  asJobStatus,
  asNumber,
  asString,
  nullableServiceType,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { answerKaelAssistant } from "./assistant.ts";
import { cancelJob, requestCustomerCancellation } from "./cancellation.ts";
import type {
  EdgeCustomerKaelConversationCaseAction,
  EdgeCustomerKaelConversationSessionResponse,
  EdgeCustomerKaelConversationTurnResponse,
} from "../contracts/customer-kael-conversation.ts";
import {
  latestIsoTimestamp,
  nullablePerformanceProfile,
  projectCustomerCaseCatalogDetail,
} from "./kael-conversation-projection.ts";

export const CUSTOMER_CONVERSATION_SELECT =
  "id, customer_id, chat_mode, case_session_id, client_request_id, title, pinned_at, archived_at, total_turns, created_at, updated_at";
const CUSTOMER_CONVERSATION_TURN_SELECT =
  "id, conversation_id, customer_id, client_request_id, turn_index, role, text_content, created_at";
export const CUSTOMER_CASE_CATALOG_JOB_STATUSES: JobStatus[] = [
  "awaiting_customer_confirm",
  "broadcasting",
  "worker_candidate_pending",
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
  "confirmed_by_customer",
  "payment_pending",
];
export const CUSTOMER_CASE_SESSION_DISCOVERY_SELECT =
  "id, client_request_id, job_id, status, jobs!inner(id, customer_id, status)";


export async function getCustomerKaelConversation(
  ctx: MobileApiContext,
  conversationId: string,
) {
  const client = customerConversationDb(ctx);
  const session = await readCustomerConversation(client, ctx, conversationId);
  const caseSessionId = nullableString(session.case_session_id);
  const linkedCase = caseSessionId
    ? await readLinkedCustomerCaseSession(client, ctx.user.id, caseSessionId)
    : null;
  const turns = await readCustomerConversationTurns(client, ctx.user.id, conversationId);
  return {
    session: serializeCustomerConversation(linkedCase
      ? {
        ...session,
        case_job_id: linkedCase.jobId,
        profile_id: linkedCase.profileId,
        service_type: linkedCase.serviceType,
        total_turns: asNumber(session.total_turns) + linkedCase.totalTurns,
        updated_at: latestIsoTimestamp(asString(session.updated_at), linkedCase.updatedAt),
      }
      : session),
    turns,
  };
}


export async function sendCustomerKaelConversationTurn(
  ctx: MobileApiContext,
  conversationId: string,
  input: EdgeCustomerKaelConversationTurnInput,
  secrets: EdgeAiSecrets,
  options: {
    reasoning?: KaelReasoningReporter;
    response?: KaelResponseReporter;
  } = {},
) {
  const client = customerConversationDb(ctx);
  const session = await readCustomerConversation(client, ctx, conversationId);
  const conversationMode = asCustomerConversationMode(session.chat_mode);
  const caseSessionId = conversationMode === "case"
    ? nullableString(session.case_session_id)
    : null;
  const linkedCase = caseSessionId
    ? await readLinkedCustomerCaseSession(client, ctx.user.id, caseSessionId)
    : null;
  if (linkedCase) {
    apiFailure(
      "CASE_WORK_SESSION_REQUIRED",
      "Hãy tiếp tục qua phiên Agentic Xử lý công việc đang liên kết",
      409,
    );
  }

  const existingTurn = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_customer_conversation_turns")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("customer_id", ctx.user.id)
      .eq("client_request_id", input.client_request_id)
      .maybeSingle(),
  );
  if (existingTurn.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra lượt trò chuyện", 500);
  }
  if (existingTurn.data) {
    const existingResponse = await getCustomerKaelConversation(ctx, conversationId);
    options.reasoning?.complete({
      fallbackUsed: false,
      summary: [customerReasoningCompletion(input.language, false, true)],
    });
    return existingResponse;
  }

  const answer = await answerKaelAssistant(ctx, {
    language: input.language,
    message: input.message,
    surface: "customer_normal",
  }, secrets, { reasoning: options.reasoning, response: options.response });
  const customerText = (
    conversationMode === "case"
      ? sanitizeCustomerCaseEvidenceText(input.message)
      : scrubSensitiveForLLM(input.message)
  ).slice(0, 2000);
  const notes = answer.safety_notes.filter((note) => note.trim().length > 0);
  const noteLabel = input.language === "en" ? "Note" : "Lưu ý";
  const answerWithSafety = notes.length > 0
    ? `${answer.answer}\n\n${noteLabel}: ${notes.join(" ")}`
    : answer.answer;
  const kaelText = (
    conversationMode === "case"
      ? sanitizeCustomerCaseEvidenceText(answerWithSafety)
      : scrubSensitiveForLLM(answerWithSafety)
  ).slice(0, 4000);
  if (!customerText || !kaelText) {
    apiFailure("AI_INVALID_OUTPUT", "Kael chưa thể tạo câu trả lời an toàn", 502);
  }

  const appended = await dbQuery<number>(
    client.rpc("append_customer_kael_conversation_exchange", {
      p_client_request_id: input.client_request_id,
      p_conversation_id: conversationId,
      p_customer_id: ctx.user.id,
      p_customer_text: customerText,
      p_kael_text: kaelText,
    }),
  );
  if (appended.error) {
    apiFailure("DB_ERROR", "Không thể lưu lượt trò chuyện Kael", 500);
  }
  options.response?.complete(kaelText);
  const response = await getCustomerKaelConversation(ctx, conversationId);
  options.reasoning?.complete({
    fallbackUsed: answer.fallback_used,
    summary: answer.public_reasoning_summary ?? [],
  });
  return response;
}

function customerReasoningCompletion(
  language: "vi" | "en",
  fallbackUsed: boolean,
  existing = false,
) {
  if (language === "en") {
    if (existing) return "The already saved reply has been synchronized.";
    return fallbackUsed
      ? "Kael completed a safe alternative reply."
      : "Kael completed and saved a safe reply.";
  }
  if (existing) return "Phản hồi đã lưu được đồng bộ.";
  return fallbackUsed
    ? "Kael đã hoàn tất một phản hồi thay thế an toàn."
    : "Kael đã hoàn tất và lưu phản hồi an toàn.";
}

export async function readCustomerConversation(
  client: DbClient,
  ctx: MobileApiContext,
  conversationId: string,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_customer_conversations")
      .select(CUSTOMER_CONVERSATION_SELECT)
      .eq("id", conversationId)
      .eq("customer_id", ctx.user.id)
      .is("archived_at", null)
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy cuộc trò chuyện Kael", 404);
  }
  return result.data;
}

async function readCustomerConversationTurns(
  client: DbClient,
  customerId: string,
  conversationId: string,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_customer_conversation_turns")
      .select(CUSTOMER_CONVERSATION_TURN_SELECT)
      .eq("conversation_id", conversationId)
      .eq("customer_id", customerId)
      .order("turn_index", { ascending: true }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải lịch sử trò chuyện Kael", 500);
  }
  return (result.data ?? []).map(serializeCustomerConversationTurn);
}

export async function readLinkedCustomerCaseSession(
  client: DbClient,
  customerId: string,
  caseSessionId: string,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, job_id, service_type, safe_metadata, total_turns, updated_at")
      .eq("id", caseSessionId)
      .eq("customer_id", customerId)
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Xử lý công việc", 404);
  }
  return projectCustomerCaseCatalogDetail(result.data);
}

export async function closeLinkedCustomerJob(
  ctx: MobileApiContext,
  client: DbClient,
  jobId: string,
): Promise<{
  caseAction: EdgeCustomerKaelConversationCaseAction;
  jobStatus: JobStatus;
}> {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select("id, status")
      .eq("id", jobId)
      .eq("customer_id", ctx.user.id)
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy công việc liên kết", 404);
  }
  const status = asJobStatus(result.data.status);
  if (
    status === "cancelled" ||
    status === "confirmed_by_customer" ||
    status === "payment_pending" ||
    status === "paid" ||
    status === "reviewed"
  ) {
    return { caseAction: "already_closed", jobStatus: status };
  }
  if (
    status === "awaiting_customer_confirm" ||
    status === "broadcasting" ||
    status === "worker_candidate_pending"
  ) {
    const cancelled = await cancelJob(ctx, jobId);
    return { caseAction: "cancelled", jobStatus: cancelled.status };
  }
  if (
    status === "worker_matched" ||
    status === "worker_on_way" ||
    status === "arrived" ||
    status === "inspecting" ||
    status === "repairing" ||
    status === "scope_change_pending" ||
    status === "completed_by_worker"
  ) {
    const requested = await requestCustomerCancellation(ctx, jobId, {
      reason_code: "changed_mind",
      reason_note: "Khách xác nhận đóng phiên Xử lý công việc.",
      requested_at: new Date().toISOString(),
    });
    return {
      caseAction: requested.job_status === "cancelled"
        ? "cancelled"
        : "review_requested",
      jobStatus: requested.job_status,
    };
  }
  apiFailure(
    "INVALID_STATUS",
    "Công việc chưa ở trạng thái có thể đóng an toàn",
    409,
  );
}

export async function abandonCustomerCaseSession(
  client: DbClient,
  customerId: string,
  caseSessionId: string,
) {
  const abandonedAt = new Date().toISOString();
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .update({ status: "abandoned", abandoned_at: abandonedAt })
      .eq("id", caseSessionId)
      .eq("customer_id", customerId)
      .select("id")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể đóng phiên Xử lý công việc", 500);
  }
}

export async function findCustomerConversationByRequest(
  client: DbClient,
  customerId: string,
  mode: EdgeCustomerKaelConversationMode,
  clientRequestId: string,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_customer_conversations")
      .select("id")
      .eq("customer_id", customerId)
      .eq("chat_mode", mode)
      .eq("client_request_id", clientRequestId)
      .is("archived_at", null)
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra cuộc trò chuyện Kael", 500);
  }
  if (!result.data) return null;
  return asString(result.data.id);
}

export function serializeCustomerConversation(
  row: Record<string, unknown>,
): EdgeCustomerKaelConversationSessionResponse {
  return {
    id: asString(row.id),
    mode: asCustomerConversationMode(row.chat_mode),
    customer_id: asString(row.customer_id),
    case_job_id: nullableString(row.case_job_id),
    case_session_id: nullableString(row.case_session_id),
    client_request_id: asString(row.client_request_id),
    title: nullableString(row.title),
    pinned_at: nullableString(row.pinned_at),
    profile_id: nullablePerformanceProfile(row.profile_id),
    service_type: nullableServiceType(row.service_type),
    started_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
    total_turns: asNumber(row.total_turns),
  };
}

function serializeCustomerConversationTurn(
  row: Record<string, unknown>,
): EdgeCustomerKaelConversationTurnResponse {
  const role: EdgeCustomerKaelConversationTurnResponse["role"] =
    row.role === "customer" || row.role === "system" ? row.role : "kael";
  return {
    id: asString(row.id),
    conversation_id: asString(row.conversation_id),
    client_request_id: nullableString(row.client_request_id),
    turn_index: asNumber(row.turn_index),
    role,
    text_content: asString(row.text_content),
    created_at: asString(row.created_at),
  };
}

function asCustomerConversationMode(value: unknown): EdgeCustomerKaelConversationMode {
  return value === "case" ? "case" : "normal";
}

export function customerConversationDb(ctx: MobileApiContext) {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách hàng mới được dùng cuộc trò chuyện Kael này", 403);
  }
  return db(ctx);
}
