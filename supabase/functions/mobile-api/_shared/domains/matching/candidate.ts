// Customer-confirmed worker proposal gate. Keeps jobs.worker_id and address
// release locked until the owning customer confirms an exact candidate id.

import type { JobStatus } from "../../../../_shared/domain.ts";
import { candidateDecisionStatusSchema } from "../../../../_shared/contracts/job.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { throwMatchingCapacityError } from "../../platform/domain-error-mappers.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { validateWorkflowTransition } from "../../workflow-orchestrator.ts";
import {
  buildSafeWorkerCandidateView,
  candidateHasExpired,
  loadSafeWorkerCandidateView,
  mapWorkerCandidateDecisionError,
} from "./candidate-support.ts";
import { asJobStatus, asString, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, workflowDb } from "../../platform/db.ts";
import { loadDirectWorkerPaymentAvailability } from "../payment/direct-payment-availability.ts";
import { recordHarnessEvent } from "../../../../_shared/harness/trace.ts";
import { getJobMatchingOperation } from "./customer-retry.ts";

export { notifyCustomerCandidateReady } from "./candidate-support.ts";

export async function getWorkerCandidateDecision(ctx: MobileApiContext, jobId: string, candidateId: string) {
  const client = db(ctx);
  await requireJobAccess(client, jobId, ctx, { requiredRole: "customer" });
  const result = await dbQuery<Record<string, unknown>>(
    client.from("job_worker_candidates")
      .select("id, job_id, worker_id, status, customer_decision_kind, customer_decided_at")
      .eq("id", candidateId).eq("job_id", jobId).maybeSingle(),
  ).catch(() => candidateDecisionOutcomeUnknown());
  if (result.error) candidateDecisionOutcomeUnknown();
  if (!result.data) apiFailure("NOT_FOUND", "Không tìm thấy đề xuất thợ.", 404);
  const row = result.data;
  if (row.id !== candidateId || row.job_id !== jobId ||
    ![null, "confirm", "reject"].includes(row.customer_decision_kind as null | string)) {
    candidateDecisionOutcomeUnknown();
  }
  // Profile visibility and the latest matching round do not determine a historical decision.
  const parsed = candidateDecisionStatusSchema.safeParse({
    job_id: row.job_id, candidate_id: row.id, worker_id: row.worker_id, candidate_status: row.status,
    receipt: row.customer_decision_kind === null ? null : {
      job_id: row.job_id, candidate_id: row.id, worker_id: row.worker_id,
      decision: row.customer_decision_kind, decided_at: row.customer_decided_at,
    },
  });
  if (!parsed.success) candidateDecisionOutcomeUnknown();
  return parsed.data;
}

export async function getWorkerCandidate(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const workflowClient = workflowDb(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id, worker_id, quote_mode",
  });
  const current = await dbQuery<Record<string, unknown>>(
    client.from("job_worker_candidates")
      .select("id, job_id, worker_id, broadcast_id, status, proposed_at, expires_at, customer_decided_at, original_scope_price_quote, worker_matching_proposals(id, scope_summary, price_min, price_max, status)")
      .eq("job_id", jobId).in("status", ["proposed", "customer_confirmed"])
      .order("proposed_at", { ascending: false }).limit(1).maybeSingle(),
  );
  if (current.error) apiFailure("DB_ERROR", "Không thể tải thợ đang chờ xác nhận", 500);
  if (
    current.data?.status === "proposed" &&
    candidateHasExpired(current.data.expires_at)
  ) {
    const expired = await dbQuery<Array<Record<string, unknown>>>(
      workflowClient.rpc("expire_worker_candidate_atomic", {
        p_job_id: jobId,
        p_candidate_id: asString(current.data.id),
        p_customer_id: ctx.user.id,
      }),
    );
    if (expired.error) candidateDecisionOutcomeUnknown();
    const expiredRow = Array.isArray(expired.data) && expired.data.length === 1 ? expired.data[0] : null;
    if (!expiredRow || typeof expiredRow.ok !== "boolean") candidateDecisionOutcomeUnknown();
    if (expiredRow.ok === false) {
      apiFailure("STATUS_CHANGED", "Trạng thái đề xuất thợ đã thay đổi. Vui lòng tải lại.", 409);
    }
    if (expiredRow.candidate_id !== current.data.id || expiredRow.worker_id !== current.data.worker_id ||
      !nullableString(expiredRow.worker_id) || expiredRow.error_code !== null ||
      typeof expiredRow.already_applied !== "boolean") candidateDecisionOutcomeUnknown();
    if (expiredRow.job_status !== "broadcasting") {
      apiFailure("STATUS_CHANGED", "Trạng thái đề xuất thợ đã thay đổi. Vui lòng tải lại.", 409);
    }
    // Expiry projects durable state in SQL; observing it is not consent to start another round.
    try {
      const { operation } = await getJobMatchingOperation(ctx, jobId);
      if (!operation) candidateDecisionOutcomeUnknown();
      return { job_id: jobId, status: "broadcasting" as JobStatus, candidate: null, operation };
    } catch {
      candidateDecisionOutcomeUnknown();
    }
  }
  const candidate = current.data
    ? await buildSafeWorkerCandidateView(client, current.data, asString(job.customer_id))
    : null;
  const directPaymentAvailable = candidate && ctx.role === "customer"
    ? await loadDirectWorkerPaymentAvailability(client, jobId, ctx.user.id)
    : null;
  return {
    job_id: jobId,
    status: job.status,
    candidate: candidate
      ? { ...candidate, direct_payment_available: directPaymentAvailable }
      : null,
  };
}

export async function confirmWorkerCandidate(
  ctx: MobileApiContext,
  jobId: string,
  candidateId: string,
) {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách đặt dịch vụ được quyết định thợ.", 403);
  }
  const client = db(ctx);
  const workflowClient = workflowDb(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id, quote_mode",
  });
  const proposalMode = job.quote_mode === "rfq" || job.quote_mode === "inspection_only";
  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowClient.rpc(proposalMode
      ? "confirm_worker_matching_proposal_atomic"
      : "confirm_worker_candidate_atomic", {
      p_job_id: jobId,
      p_candidate_id: candidateId,
      p_customer_id: ctx.user.id,
    }),
  );
  if (result.error) {
    throwMatchingCapacityError(result.error);
    await recordHarnessEvent(ctx.traceContext, {
      eventClass: "matching.candidate_confirm.rpc_failed",
      stage: "matching.candidate.confirm",
      status: "failed",
      errorCode: "CANDIDATE_CONFIRM_RPC_FAILED",
      safeMetadata: {
        rpc_code: safeRpcCode(result.error.code),
        rpc_subject: safeRpcSubject(result.error.message),
      },
    });
    candidateDecisionOutcomeUnknown();
  }
  const row = Array.isArray(result.data) && result.data.length === 1 ? result.data[0] : null;
  if (!row) {
    await recordHarnessEvent(ctx.traceContext, {
      eventClass: "matching.candidate_confirm.empty_result",
      stage: "matching.candidate.confirm",
      status: "failed",
      errorCode: "CANDIDATE_CONFIRM_EMPTY_RESULT",
      safeMetadata: {
        result_kind: Array.isArray(result.data) ? "array" : typeof result.data,
        result_count: Array.isArray(result.data) ? result.data.length : null,
      },
    });
    candidateDecisionOutcomeUnknown();
  }
  if (typeof row.ok !== "boolean") candidateDecisionOutcomeUnknown();
  if (row.ok === false) {
    const errorCode = nullableString(row.error_code);
    if (errorCode === "PRICE_QUOTE_INVALID") {
      apiFailure("PRICE_QUOTE_INVALID", "Báo giá của thợ không còn hợp lệ. Vui lòng tải lại đề xuất.", 409);
    }
    if (!errorCode || !["NOT_FOUND", "INVALID_STATUS", "STATUS_CHANGED", "EXPIRED",
      "WORKER_NOT_ELIGIBLE"].includes(errorCode)) candidateDecisionOutcomeUnknown();
    mapWorkerCandidateDecisionError(errorCode);
  }
  const workerId = nullableString(row.worker_id);
  if (!workerId) candidateDecisionOutcomeUnknown();
  const alreadyApplied = row.already_applied === true;
  const returnedStatus = asJobStatus(row.job_status);
  if (returnedStatus !== row.job_status) candidateDecisionOutcomeUnknown();
  if (!alreadyApplied) {
    // Checked against the status the RPC actually landed on, not against the one this branch
    // expects. Asserting a literal against a literal answers a question nobody asked.
    const transition = validateWorkflowTransition({
      event: "customer_confirmed_worker",
      from: "worker_candidate_pending",
      to: returnedStatus,
    });
    if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
  }
  if (row.candidate_id !== candidateId || typeof row.already_applied !== "boolean" ||
    row.error_code !== null) candidateDecisionOutcomeUnknown();
  try {
    const candidate = await loadSafeWorkerCandidateView(client, jobId, candidateId, ctx.user.id);
    if (candidate.candidate_id !== candidateId || candidate.worker_id !== workerId ||
      candidate.status !== "customer_confirmed") candidateDecisionOutcomeUnknown();
    return { job_id: jobId, status: returnedStatus, candidate, already_applied: alreadyApplied };
  } catch {
    candidateDecisionOutcomeUnknown();
  }
}

function safeRpcCode(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_]{1,64}$/u.test(value)
    ? value
    : "UNKNOWN";
}

function safeRpcSubject(value: unknown) {
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (normalized.includes("permission denied for function")) return "function_execute";
  if (normalized.includes("permission denied")) return "data_access";
  if (normalized.includes("ambiguous")) return "sql_ambiguity";
  if (normalized.includes("constraint")) return "constraint";
  return "unknown";
}

export async function rejectWorkerCandidate(
  ctx: MobileApiContext,
  jobId: string,
  candidateId: string,
) {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách đặt dịch vụ được quyết định thợ.", 403);
  }
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowDb(ctx).rpc("reject_worker_candidate_atomic", {
      p_job_id: jobId, p_candidate_id: candidateId, p_customer_id: ctx.user.id,
    }),
  );
  if (result.error) candidateDecisionOutcomeUnknown();
  const row = Array.isArray(result.data) && result.data.length === 1 ? result.data[0] : null;
  if (!row || typeof row.ok !== "boolean") candidateDecisionOutcomeUnknown();
  if (row.ok === false) mapWorkerCandidateDecisionError(nullableString(row.error_code));
  const returnedStatus = asJobStatus(row.job_status);
  if (returnedStatus !== row.job_status) candidateDecisionOutcomeUnknown();
  const alreadyApplied = row.already_applied === true;
  if (!alreadyApplied) {
    const transition = validateWorkflowTransition({
      event: "customer_rejected_worker", from: "worker_candidate_pending", to: returnedStatus,
    });
    if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
  }
  if (row.candidate_id !== candidateId || !nullableString(row.worker_id) ||
    typeof row.already_applied !== "boolean" || row.error_code !== null) candidateDecisionOutcomeUnknown();
  // The command owns proposal retirement, inbox and continuation. Post-commit work is read-only.
  try {
    const candidate = await loadSafeWorkerCandidateView(client, jobId, candidateId, ctx.user.id);
    const { operation } = await getJobMatchingOperation(ctx, jobId);
    if (!operation) candidateDecisionOutcomeUnknown();
    const message = returnedStatus !== "broadcasting"
      ? "Quyết định này đã được xử lý."
      : operation.state === "queued"
      ? "Đã ghi nhận quyết định. Yêu cầu tìm thợ tiếp đang chờ xử lý."
      : operation.state === "no_reachable_worker"
      ? "Đã ghi nhận quyết định. Hiện chưa có thợ phù hợp có thể nhận yêu cầu."
      : operation.state === "recovery_required"
      ? "Đã ghi nhận quyết định. Tiến trình tìm thợ cần được kiểm tra lại."
      : "Đã ghi nhận quyết định. Vui lòng theo dõi trạng thái yêu cầu.";
    return { job_id: jobId, status: returnedStatus, candidate, already_applied: alreadyApplied,
      broadcast_sent: false, operation, message };
  } catch {
    candidateDecisionOutcomeUnknown();
  }
}

function candidateDecisionOutcomeUnknown(): never {
  apiFailure("CANDIDATE_DECISION_OUTCOME_UNKNOWN",
    "Đang đối soát quyết định của bạn. Vui lòng tải lại trạng thái yêu cầu.", 503,
    { reconcile_required: true });
}
