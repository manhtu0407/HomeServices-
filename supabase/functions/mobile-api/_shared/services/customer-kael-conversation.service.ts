import type {
  EdgeCustomerKaelConversationCreateInput,
  EdgeCustomerKaelConversationMode,
  EdgeCustomerKaelConversationTurnInput,
  EdgeCustomerKaelConversationPinInput,
  EdgeCustomerKaelConversationRenameInput,
  JobStatus,
} from "../../../_shared/domain.ts";
import { scrubSensitiveForLLM, type EdgeAiSecrets } from "../kael/index.ts";
import { sanitizeCustomerCaseEvidenceText } from "../kael/untrusted-evidence.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import {
  asJobStatus,
  asNumber,
  asString,
  nullableServiceType,
  nullableString,
} from "./coercions.ts";
import { answerKaelAssistant } from "./customer-assistant.service.ts";
import { cancelJob, requestCustomerCancellation } from "./customer-cancellation.service.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import type {
  EdgeCustomerKaelConversationCaseAction,
  EdgeCustomerKaelConversationSessionResponse,
  EdgeCustomerKaelConversationTurnResponse,
} from "../router/customer-kael-conversation-dtos.ts";
import {
  isVisibleCustomerConversationCatalogRow,
  latestIsoTimestamp,
  nullablePerformanceProfile,
  projectCustomerCaseCatalogDetail,
  sortCustomerConversationSessions,
  type CustomerCaseCatalogDetail,
} from "./customer-kael-conversation-projection.ts";

const CUSTOMER_CONVERSATION_SELECT =
  "id, customer_id, chat_mode, case_session_id, client_request_id, title, pinned_at, archived_at, total_turns, created_at, updated_at";
const CUSTOMER_CONVERSATION_TURN_SELECT =
  "id, conversation_id, customer_id, client_request_id, turn_index, role, text_content, created_at";
const CUSTOMER_CASE_CATALOG_JOB_STATUSES: JobStatus[] = [
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
const CUSTOMER_CASE_SESSION_DISCOVERY_SELECT =
  "id, client_request_id, job_id, status, jobs!inner(id, customer_id, status)";

export async function createCustomerKaelConversation(
  ctx: MobileApiContext,
  input: EdgeCustomerKaelConversationCreateInput,
) {
  const client = customerConversationDb(ctx);
  const existing = await findCustomerConversationByRequest(
    client,
    ctx.user.id,
    input.mode,
    input.client_request_id,
  );
  if (existing) return getCustomerKaelConversation(ctx, existing);

  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_customer_conversations")
      .insert({
        customer_id: ctx.user.id,
        chat_mode: input.mode,
        client_request_id: input.client_request_id,
      })
      .select(CUSTOMER_CONVERSATION_SELECT)
      .single(),
  );
  if (result.error?.code === "23505") {
    const recovered = await findCustomerConversationByRequest(
      client,
      ctx.user.id,
      input.mode,
      input.client_request_id,
    );
    if (recovered) return getCustomerKaelConversation(ctx, recovered);
  }
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể tạo cuộc trò chuyện Kael", 500);
  }
  return getCustomerKaelConversation(ctx, asString(result.data.id));
}

export async function listCustomerKaelConversations(
  ctx: MobileApiContext,
  mode: EdgeCustomerKaelConversationMode,
) {
  const client = customerConversationDb(ctx);
  if (mode === "case") {
    await reconcileActiveCustomerCaseConversations(client, ctx.user.id);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_customer_conversations")
      .select(CUSTOMER_CONVERSATION_SELECT)
      .eq("customer_id", ctx.user.id)
      .eq("chat_mode", mode)
      .is("archived_at", null)
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(20),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải các cuộc trò chuyện Kael", 500);
  }

  const rows = result.data ?? [];
  const caseSessionIds = rows
    .map((row) => nullableString(row.case_session_id))
    .filter((value): value is string => Boolean(value));
  const caseDetails = new Map<string, CustomerCaseCatalogDetail>();
  if (caseSessionIds.length > 0) {
    const caseSessions = await dbQuery<Array<Record<string, unknown>>>(
      client
        .from("kael_chat_sessions")
        .select("id, job_id, service_type, safe_metadata, total_turns, updated_at")
        .eq("customer_id", ctx.user.id)
        .neq("status", "abandoned")
        .in("id", caseSessionIds),
    );
    if (caseSessions.error) {
      apiFailure("DB_ERROR", "Không thể tải lịch sử Xử lý công việc", 500);
    }
    for (const row of caseSessions.data ?? []) {
      caseDetails.set(asString(row.id), projectCustomerCaseCatalogDetail(row));
    }
  }

  const availableCaseSessionIds = new Set(caseDetails.keys());
  const sessions = rows
    .filter((row) => isVisibleCustomerConversationCatalogRow(row, availableCaseSessionIds))
    .map((row) => {
      const caseSessionId = nullableString(row.case_session_id);
      const caseDetail = caseSessionId ? caseDetails.get(caseSessionId) : null;
      return serializeCustomerConversation(
        caseDetail
          ? {
            ...row,
            case_job_id: caseDetail.jobId,
            profile_id: caseDetail.profileId,
            service_type: caseDetail.serviceType,
            total_turns: asNumber(row.total_turns) + caseDetail.totalTurns,
            updated_at: latestIsoTimestamp(asString(row.updated_at), caseDetail.updatedAt),
          }
          : row,
      );
    });
  return { sessions: sortCustomerConversationSessions(sessions) };
}

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

export async function archiveCustomerKaelConversation(
  ctx: MobileApiContext,
  conversationId: string,
  confirmCaseWork = false,
) {
  const client = customerConversationDb(ctx);
  const conversation = await readCustomerConversation(client, ctx, conversationId);
  const caseSessionId = nullableString(conversation.case_session_id);
  if (caseSessionId && !confirmCaseWork) {
    apiFailure(
      "CASE_WORK_CONFIRMATION_REQUIRED",
      "Cần xác nhận trước khi hủy quy trình Xử lý công việc",
      409,
    );
  }

  let jobId: string | null = null;
  let jobStatus: JobStatus | null = null;
  let caseAction: EdgeCustomerKaelConversationCaseAction = "none";
  if (caseSessionId) {
    const linkedCase = await readLinkedCustomerCaseSession(
      client,
      ctx.user.id,
      caseSessionId,
    );
    jobId = linkedCase.jobId;
    if (jobId) {
      const closure = await closeLinkedCustomerJob(ctx, client, jobId);
      jobStatus = closure.jobStatus;
      caseAction = closure.caseAction;
    } else {
      caseAction = "abandoned";
    }
    await abandonCustomerCaseSession(client, ctx.user.id, caseSessionId);
  }

  const archivedAt = new Date().toISOString();
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_customer_conversations")
      .update({ archived_at: archivedAt, pinned_at: null })
      .eq("id", conversationId)
      .eq("customer_id", ctx.user.id)
      .is("archived_at", null)
      .select("id")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể xóa cuộc trò chuyện khỏi danh sách", 500);
  }
  return {
    session_id: conversationId,
    archived_at: archivedAt,
    case_session_id: caseSessionId,
    job_id: jobId,
    job_status: jobStatus,
    case_action: caseAction,
  };
}

export async function renameCustomerKaelConversation(
  ctx: MobileApiContext,
  conversationId: string,
  input: EdgeCustomerKaelConversationRenameInput,
) {
  const client = customerConversationDb(ctx);
  await readCustomerConversation(client, ctx, conversationId);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_customer_conversations")
      .update({ title: input.title.trim() })
      .eq("id", conversationId)
      .eq("customer_id", ctx.user.id)
      .is("archived_at", null)
      .select(CUSTOMER_CONVERSATION_SELECT)
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể đổi tên cuộc trò chuyện", 500);
  }
  return getCustomerKaelConversation(ctx, conversationId);
}

export async function setCustomerKaelConversationPinned(
  ctx: MobileApiContext,
  conversationId: string,
  input: EdgeCustomerKaelConversationPinInput,
) {
  const client = customerConversationDb(ctx);
  await readCustomerConversation(client, ctx, conversationId);
  const pinnedAt = input.pinned ? new Date().toISOString() : null;
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_customer_conversations")
      .update({ pinned_at: pinnedAt })
      .eq("id", conversationId)
      .eq("customer_id", ctx.user.id)
      .is("archived_at", null)
      .select(CUSTOMER_CONVERSATION_SELECT)
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể cập nhật ghim cuộc trò chuyện", 500);
  }
  return getCustomerKaelConversation(ctx, conversationId);
}

export async function sendCustomerKaelConversationTurn(
  ctx: MobileApiContext,
  conversationId: string,
  input: EdgeCustomerKaelConversationTurnInput,
  secrets: EdgeAiSecrets,
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
  if (existingTurn.data) return getCustomerKaelConversation(ctx, conversationId);

  const answer = await answerKaelAssistant(ctx, {
    language: input.language,
    message: input.message,
    surface: "customer_normal",
  }, secrets);
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
  return getCustomerKaelConversation(ctx, conversationId);
}

async function reconcileActiveCustomerCaseConversations(
  client: DbClient,
  customerId: string,
) {
  const activeSessions = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_chat_sessions")
      .select(CUSTOMER_CASE_SESSION_DISCOVERY_SELECT)
      .eq("customer_id", customerId)
      .neq("status", "abandoned")
      .eq("jobs.customer_id", customerId)
      .in("jobs.status", CUSTOMER_CASE_CATALOG_JOB_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(20),
  );
  if (activeSessions.error) {
    apiFailure("DB_ERROR", "Không thể đồng bộ phiên Xử lý công việc", 500);
  }

  const sessions = activeSessions.data ?? [];
  if (sessions.length === 0) return;
  const caseSessionIds = sessions.map((session) => asString(session.id));
  const existing = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_customer_conversations")
      .select("id, case_session_id, archived_at")
      .eq("customer_id", customerId)
      .eq("chat_mode", "case")
      .in("case_session_id", caseSessionIds),
  );
  if (existing.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra danh mục Xử lý công việc", 500);
  }

  const existingByCaseSession = new Map<string, Record<string, unknown>>();
  for (const conversation of existing.data ?? []) {
    const caseSessionId = nullableString(conversation.case_session_id);
    if (caseSessionId) existingByCaseSession.set(caseSessionId, conversation);
  }
  const archivedConversationIds = Array.from(existingByCaseSession.values())
    .filter((conversation) => Boolean(nullableString(conversation.archived_at)))
    .map((conversation) => asString(conversation.id));
  if (archivedConversationIds.length > 0) {
    const restored = await dbQuery<Array<Record<string, unknown>>>(
      client
        .from("kael_customer_conversations")
        .update({ archived_at: null })
        .eq("customer_id", customerId)
        .in("id", archivedConversationIds)
        .select("id"),
    );
    if (restored.error) {
      apiFailure("DB_ERROR", "Không thể khôi phục phiên Xử lý công việc", 500);
    }
  }

  for (const session of sessions) {
    const caseSessionId = asString(session.id);
    if (existingByCaseSession.has(caseSessionId)) continue;
    await linkCustomerCaseConversation(
      client,
      customerId,
      caseSessionId,
      nullableString(session.client_request_id),
    );
  }
}

export async function ensureCustomerCaseConversation(
  ctx: MobileApiContext,
  caseSessionId: string,
  clientRequestId: string | null,
) {
  const client = customerConversationDb(ctx);
  const caseSession = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, customer_id")
      .eq("id", caseSessionId)
      .eq("customer_id", ctx.user.id)
      .single(),
  );
  if (caseSession.error || !caseSession.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Xử lý công việc", 404);
  }

  return linkCustomerCaseConversation(
    client,
    ctx.user.id,
    caseSessionId,
    clientRequestId,
  );
}

export async function linkCreatedCustomerCaseConversation(
  ctx: MobileApiContext,
  caseSessionId: string,
  clientRequestId: string | null,
) {
  // createKaelChat has just inserted this owner-scoped session, so repeating the
  // ownership read here only adds a network round trip to the first handoff.
  return linkCustomerCaseConversation(
    customerConversationDb(ctx),
    ctx.user.id,
    caseSessionId,
    clientRequestId,
  );
}

async function linkCustomerCaseConversation(
  client: DbClient,
  customerId: string,
  caseSessionId: string,
  clientRequestId: string | null,
) {
  const requestId = clientRequestId ?? caseSessionId;
  const linked = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_customer_conversations")
      .upsert({
        customer_id: customerId,
        chat_mode: "case",
        case_session_id: caseSessionId,
        client_request_id: requestId,
        archived_at: null,
      }, { onConflict: "customer_id,chat_mode,client_request_id" })
      .select("id")
      .single(),
  );
  if (linked.error?.code === "23505") {
    const restored = await restoreCustomerConversationByCaseSession(
      client,
      customerId,
      caseSessionId,
    );
    if (restored) return restored;
  }
  if (linked.error) {
    apiFailure("DB_ERROR", "Không thể liên kết cuộc trò chuyện Case Work", 500);
  }
  if (linked.data) return asString(linked.data.id);

  const restored = await restoreCustomerConversationByCaseSession(
    client,
    customerId,
    caseSessionId,
  );
  if (restored) return restored;

  const inserted = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_customer_conversations")
      .insert({
        id: caseSessionId,
        customer_id: customerId,
        chat_mode: "case",
        case_session_id: caseSessionId,
        client_request_id: requestId,
      })
      .select("id")
      .single(),
  );
  if (inserted.error?.code === "23505") {
    const existing = await restoreCustomerConversationByCaseSession(
      client,
      customerId,
      caseSessionId,
    );
    if (existing) return existing;
  }
  if (inserted.error || !inserted.data) {
    apiFailure("DB_ERROR", "Không thể tạo danh mục Case Work", 500);
  }
  return asString(inserted.data.id);
}

async function restoreCustomerConversationByCaseSession(
  client: DbClient,
  customerId: string,
  caseSessionId: string,
) {
  const existing = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_customer_conversations")
      .select("id, archived_at")
      .eq("customer_id", customerId)
      .eq("chat_mode", "case")
      .eq("case_session_id", caseSessionId)
      .maybeSingle(),
  );
  if (existing.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra danh mục Xử lý công việc", 500);
  }
  if (!existing.data) return null;

  const conversationId = asString(existing.data.id);
  if (nullableString(existing.data.archived_at)) {
    const restored = await dbQuery<Record<string, unknown>>(
      client
        .from("kael_customer_conversations")
        .update({ archived_at: null })
        .eq("id", conversationId)
        .eq("customer_id", customerId)
        .select("id")
        .single(),
    );
    if (restored.error || !restored.data) {
      apiFailure("DB_ERROR", "Không thể khôi phục phiên Xử lý công việc", 500);
    }
  }
  return conversationId;
}

async function readCustomerConversation(
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

async function readLinkedCustomerCaseSession(
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

async function closeLinkedCustomerJob(
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

async function abandonCustomerCaseSession(
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

async function findCustomerConversationByRequest(
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

function serializeCustomerConversation(
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

function customerConversationDb(ctx: MobileApiContext) {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách hàng mới được dùng cuộc trò chuyện Kael này", 403);
  }
  return db(ctx);
}
