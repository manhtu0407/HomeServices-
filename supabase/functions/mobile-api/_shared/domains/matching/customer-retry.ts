// Customer retry is one database command; the existing outbox owns matching and delivery.
// Receipt reads must remain available after an unknown outcome, including after official match.
import {
  matchingRetryReceiptSchema, matchingOperationSnapshotSchema,
  type EdgeMatchingRetryRequest, type EdgeMatchingRetryReceipt,
  type EdgeMatchingOperationSnapshot,
} from "../../../../_shared/contracts/stage1-reliability.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery, workflowDb, type DbError } from "../../platform/db.ts";
import { requireJobAccess } from "../../platform/access.ts";

const retryConflicts = new Set([
  "COVERAGE_UNAVAILABLE", "MATCHING_RETRY_PARENT_CHANGED", "MATCHING_RETRY_NOT_READY",
  "MATCHING_RETRY_REQUEST_CONFLICT", "MATCHING_RETRY_CONFIRMATION_UNAVAILABLE",
  "MATCHING_PREFERENCE_PENDING",
]);

export async function requestJobMatchingRetry(
  ctx: MobileApiContext, jobId: string, input: EdgeMatchingRetryRequest,
): Promise<{ operation: EdgeMatchingRetryReceipt }> {
  requireCustomer(ctx);
  const result = await dbQuery(workflowDb(ctx).rpc("request_job_matching_retry_atomic", {
    p_job_id: jobId, p_customer_id: ctx.user.id,
    p_client_request_id: input.client_request_id,
    p_expected_matching_operation_id: input.expected_matching_operation_id,
  }));
  if (result.error) failRetry(result.error, true);
  const parsed = matchingRetryReceiptSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.job_id !== jobId ||
      parsed.data.request_id !== input.client_request_id ||
      parsed.data.parent_operation_id !== input.expected_matching_operation_id) {
    failRetry(null, true);
  }
  return { operation: parsed.data };
}

export async function getJobMatchingRetry(
  ctx: MobileApiContext, jobId: string, requestId: string,
): Promise<{ operation: EdgeMatchingRetryReceipt }> {
  requireCustomer(ctx);
  const result = await dbQuery(workflowDb(ctx).rpc("get_job_matching_retry_operation", {
    p_job_id: jobId, p_customer_id: ctx.user.id, p_client_request_id: requestId,
  }));
  if (result.error) failRetry(result.error, false);
  const parsed = matchingRetryReceiptSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.job_id !== jobId || parsed.data.request_id !== requestId) {
    failRetry(null, false);
  }
  return { operation: parsed.data };
}

export async function getJobMatchingOperation(
  ctx: MobileApiContext, jobId: string,
): Promise<{ job_id: string; operation: EdgeMatchingOperationSnapshot | null }> {
  requireCustomer(ctx);
  const client = db(ctx);
  await requireJobAccess(client, jobId, ctx, { requiredRole: "customer" });
  const result = await dbQuery<Record<string, unknown>>(client.from("matching_operations")
    .select("id, state, updated_at").eq("job_id", jobId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(1).maybeSingle());
  if (result.error) failRetry(result.error, false);
  if (!result.data) return { job_id: jobId, operation: null };
  const parsed = matchingOperationSnapshotSchema.safeParse({
    operation_id: result.data.id, state: result.data.state, updated_at: result.data.updated_at,
  });
  if (!parsed.success) failRetry(null, false);
  return { job_id: jobId, operation: parsed.data };
}

function requireCustomer(ctx: MobileApiContext) {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách đặt dịch vụ được yêu cầu tìm thợ lại.", 403);
  }
}

function failRetry(error: DbError | null, mutation: boolean): never {
  if (error?.code === "42501") {
    apiFailure("NOT_FOUND", "Không tìm thấy tiến trình tìm thợ.", 404);
  }
  if (error?.message && retryConflicts.has(error.message)) {
    apiFailure(error.message, "Chưa thể bắt đầu lượt tìm thợ mới. Vui lòng tải lại trạng thái yêu cầu.", 409);
  }
  if (mutation) {
    apiFailure("MATCHING_RETRY_OUTCOME_UNKNOWN", "Đang đối soát yêu cầu tìm thợ. Không cần gửi một yêu cầu mới.", 503,
      { reconcile_required: true });
  }
  apiFailure("MATCHING_RETRY_READ_UNAVAILABLE", "Chưa thể tải tiến trình tìm thợ. Vui lòng thử lại.", 503);
}
