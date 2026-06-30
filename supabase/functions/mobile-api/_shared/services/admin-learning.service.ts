// Edge service admin learning-queue domain (C4 6a, services/* split): admin-only ops over Kael
// learning candidates (list/approve/reject), the learning queue + batch processors, rule monitoring,
// A/B price-synthesis eval, and market-cache invalidation. Imported by services.ts for wiring.

import { asLearningCandidateStatus, asNumber, asString, nullableNumber, nullableRecord, nullableServiceType, nullableString } from "./coercions.ts";
import { db, dbQuery } from "./db.ts";
import { apiFailure, type MobileApiContext, type MarketCacheInvalidateInput, type MarketCacheInvalidateResponse, type KaelLearningQueueProcessInput, type KaelLearningQueueProcessResponse, type KaelBatchResultsProcessInput, type KaelBatchResultsProcessResponse, type KaelLearningMonitorInput, type KaelLearningMonitorResponse, type KaelLearningCandidateListInput, type KaelLearningCandidateListResponse, type KaelLearningCandidateReviewInput, type KaelLearningCandidateApproveResponse, type KaelLearningCandidateRejectResponse, type KaelLearningCandidateSummary } from "../router.ts";
import { evaluatePriceSynthesisAbCase as runPriceSynthesisAbCase, monitorLearningRules, processBatchResults, processLearningQueue, type EdgeAiSecrets, type PriceSynthesisAbCaseInput, type PriceSynthesisAbEvaluation } from "../kael/index.ts";

export async function invalidateMarketCache(
  ctx: MobileApiContext,
  input: MarketCacheInvalidateInput,
): Promise<MarketCacheInvalidateResponse> {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được xóa cache giá", 403);
  }
  const invalidatedAt = new Date().toISOString();
  let query = db(ctx)
    .from("kael_market_cache")
    .update({ invalidated_at: invalidatedAt, updated_at: invalidatedAt })
    .is("invalidated_at", null);
  if (input.cache_id) query = query.eq("id", input.cache_id);
  if (input.district_code) query = query.eq("district_code", input.district_code);
  if (input.service_type) query = query.eq("service_type", input.service_type);
  if (input.problem_slug) query = query.eq("problem_slug", input.problem_slug);
  if (input.complexity) query = query.eq("complexity", input.complexity);

  const result = await dbQuery<Array<{ id: string }>>(query.select("id"));
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể xóa cache giá", 500);
  }
  return {
    invalidated_count: result.data?.length ?? 0,
    invalidated_at: invalidatedAt,
    filters: input,
  };
}

export async function evaluatePriceSynthesisAbCaseAdmin(
  ctx: MobileApiContext,
  input: PriceSynthesisAbCaseInput,
  secrets: EdgeAiSecrets,
): Promise<PriceSynthesisAbEvaluation> {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chi admin moi duoc chay A/B price_synthesis", 403);
  }
  return runPriceSynthesisAbCase(input, secrets);
}

export async function processKaelLearningQueueAdmin(
  ctx: MobileApiContext,
  input: KaelLearningQueueProcessInput,
  secrets: EdgeAiSecrets,
): Promise<KaelLearningQueueProcessResponse> {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được xử lý hàng đợi Kael", 403);
  }
  return processLearningQueue(db(ctx), secrets, {
    limit: input.limit,
    forceRealtime: input.force_realtime,
  });
}

export async function processKaelBatchResultsAdmin(
  ctx: MobileApiContext,
  input: KaelBatchResultsProcessInput,
  secrets: EdgeAiSecrets,
): Promise<KaelBatchResultsProcessResponse> {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được xử lý batch Kael", 403);
  }
  return processBatchResults(db(ctx), secrets, {
    limit: input.limit,
    forcePoll: input.force_poll,
  });
}

export async function monitorKaelLearningRulesAdmin(
  ctx: MobileApiContext,
  input: KaelLearningMonitorInput,
): Promise<KaelLearningMonitorResponse> {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được theo dõi rule Kael", 403);
  }
  return monitorLearningRules(db(ctx), {
    limit: input.limit,
  });
}

export async function listKaelLearningCandidatesAdmin(
  ctx: MobileApiContext,
  input: KaelLearningCandidateListInput,
): Promise<KaelLearningCandidateListResponse> {
  if (ctx.role !== "admin") {
    await denyKaelLearningCandidateAdminAccess(ctx, "list", null);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx)
      .from("learning_candidates")
      .select(
        "id,candidate_type,affected_service,affected_problem,affected_district,suggested_payload,confidence,evidence_count,status,audit_reason,created_at,updated_at,promoted_at,rolled_back_at",
      )
      .eq("status", input.state)
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 50),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách ứng viên learning Kael", 500);
  }
  return {
    candidates: (result.data ?? []).map(kaelLearningCandidateSummary),
  };
}

export async function approveKaelLearningCandidateAdmin(
  ctx: MobileApiContext,
  candidateId: string,
  input: KaelLearningCandidateReviewInput,
): Promise<KaelLearningCandidateApproveResponse> {
  if (ctx.role !== "admin") {
    await denyKaelLearningCandidateAdminAccess(ctx, "approve", candidateId);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("admin_approve_learning_candidate", {
      p_candidate_id: candidateId,
      p_admin_id: ctx.user.id,
      p_review_note: input.review_note ?? null,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể duyệt ứng viên learning Kael", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure("DB_ERROR", "Không thể duyệt ứng viên learning Kael", 500);
  }
  if (row.ok !== true) {
    mapLearningCandidateReviewError(nullableString(row.error_code), "approve");
  }
  const knowledgeApplyResult = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("apply_approved_learning_candidate_to_knowledge", {
      p_candidate_id: candidateId,
      p_admin_id: ctx.user.id,
    }),
  );
  if (knowledgeApplyResult.error) {
    apiFailure("DB_ERROR", "Không thể áp dụng tri thức Kael đã duyệt", 500);
  }
  const knowledgeApplyRow = knowledgeApplyResult.data?.[0] ?? null;
  return {
    ok: true,
    candidate_id: asString(row.candidate_id) || candidateId,
    rule_id: nullableString(row.rule_id),
    rule_version: nullableNumber(row.rule_version),
    status: asString(row.status) || "auto_promoted",
    knowledge_apply: knowledgeApplyRow
      ? {
        ok: knowledgeApplyRow.ok === true,
        error_code: nullableString(knowledgeApplyRow.error_code),
        knowledge_table: nullableString(knowledgeApplyRow.knowledge_table),
        record_key: nullableString(knowledgeApplyRow.record_key),
        knowledge_version: nullableNumber(knowledgeApplyRow.knowledge_version),
      }
      : null,
  };
}

export async function rejectKaelLearningCandidateAdmin(
  ctx: MobileApiContext,
  candidateId: string,
  input: KaelLearningCandidateReviewInput,
): Promise<KaelLearningCandidateRejectResponse> {
  if (ctx.role !== "admin") {
    await denyKaelLearningCandidateAdminAccess(ctx, "reject", candidateId);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("admin_reject_learning_candidate", {
      p_candidate_id: candidateId,
      p_admin_id: ctx.user.id,
      p_reason: input.reason,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể từ chối ứng viên learning Kael", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure("DB_ERROR", "Không thể từ chối ứng viên learning Kael", 500);
  }
  if (row.ok !== true) {
    mapLearningCandidateReviewError(nullableString(row.error_code), "reject");
  }
  return {
    ok: true,
    candidate_id: asString(row.candidate_id) || candidateId,
    status: asString(row.status) || "archived",
  };
}

async function denyKaelLearningCandidateAdminAccess(
  ctx: MobileApiContext,
  action: "list" | "approve" | "reject",
  candidateId: string | null,
): Promise<never> {
  const result = await dbQuery<null>(
    db(ctx).from("kael_permission_audit").insert({
      actor_id: ctx.user.id,
      actor_role: ctx.role,
      purpose: "kael_learning_admin_review",
      action,
      topic: "learning_candidate",
      decision: "deny",
      reason_code: "admin_required",
      safe_metadata: {
        ...(candidateId ? { candidate_id: candidateId } : {}),
      },
    }),
  );
  if (result.error) {
    console.warn("mobile-api learning admin deny audit failed", {
      action,
      errorCode: result.error.code,
    });
  }
  apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được review ứng viên learning Kael", 403);
}

function kaelLearningCandidateSummary(
  row: Record<string, unknown>,
): KaelLearningCandidateSummary {
  const payload = nullableRecord(row.suggested_payload) ?? {};
  return {
    id: asString(row.id),
    candidate_type: asString(row.candidate_type),
    affected_service: nullableServiceType(row.affected_service),
    affected_problem: nullableString(row.affected_problem),
    affected_district: nullableString(row.affected_district),
    confidence: asNumber(row.confidence),
    evidence_count: Math.max(0, Math.trunc(asNumber(row.evidence_count))),
    status: asLearningCandidateStatus(row.status),
    audit_reason: nullableString(row.audit_reason),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
    promoted_at: nullableString(row.promoted_at),
    rolled_back_at: nullableString(row.rolled_back_at),
    suggested_payload: payload,
    evidence_snapshot: nullableRecord(payload.evidence_snapshot),
  };
}

function mapLearningCandidateReviewError(
  code: string | null,
  action: "approve" | "reject",
): never {
  const normalized = code ?? "REVIEW_FAILED";
  const message = action === "approve"
    ? "Không thể duyệt ứng viên learning Kael"
    : "Không thể từ chối ứng viên learning Kael";
  if (normalized === "CANDIDATE_NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy ứng viên learning Kael", 404);
  }
  if (normalized === "ADMIN_REQUIRED") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được review ứng viên learning Kael", 403);
  }
  if (
    normalized === "INVALID_INPUT" ||
    normalized === "INVALID_PAYLOAD" ||
    normalized === "UNKNOWN_SKILL" ||
    normalized === "TARGET_NOT_ALLOWED" ||
    normalized === "FORBIDDEN_EFFECT" ||
    normalized === "UNSUPPORTED_CANDIDATE_TYPE" ||
    normalized === "CANDIDATE_TYPE_MISMATCH"
  ) {
    apiFailure("VALIDATION", message, 400, { reason_code: normalized });
  }
  apiFailure("LEARNING_REVIEW_FAILED", message, 409, { reason_code: normalized });
}
