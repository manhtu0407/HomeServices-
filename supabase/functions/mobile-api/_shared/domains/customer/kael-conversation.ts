import type {
  EdgeCustomerKaelConversationCreateInput,
  EdgeCustomerKaelConversationMode,
  EdgeCustomerKaelConversationPinInput,
  EdgeCustomerKaelConversationRenameInput,
  JobStatus,
} from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { asNumber, asString, nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import type { EdgeCustomerKaelConversationCaseAction } from "../contracts/customer-kael-conversation.ts";
import {
  isVisibleCustomerConversationCatalogRow,
  latestIsoTimestamp,
  projectCustomerCaseCatalogDetail,
  sortCustomerConversationSessions,
  type CustomerCaseCatalogDetail,
} from "./kael-conversation-projection.ts";
import {
  CUSTOMER_CASE_CATALOG_JOB_STATUSES,
  CUSTOMER_CASE_SESSION_DISCOVERY_SELECT,
  CUSTOMER_CONVERSATION_SELECT,
  abandonCustomerCaseSession,
  closeLinkedCustomerJob,
  customerConversationDb,
  findCustomerConversationByRequest,
  getCustomerKaelConversation,
  readCustomerConversation,
  readLinkedCustomerCaseSession,
  serializeCustomerConversation,
} from "./kael-conversation-turn.ts";

export {
  getCustomerKaelConversation,
  sendCustomerKaelConversationTurn,
} from "./kael-conversation-turn.ts";

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
