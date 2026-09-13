// Customer selection and capacity commit together; an unknown response is reconciled by request identity.
import {
  matchingSelectionReceiptSchema, type EdgeMatchingSelectionReceipt,
} from "../../../../_shared/contracts/stage1-reliability.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { dbQuery, workflowDb, type DbError } from "../../platform/db.ts";
import type { EdgeMatchingPreferenceResponse } from "../contracts/job.ts";
import { getMatchingState } from "./matching-preference-read.ts";
import type { MatchingPreferenceInput } from "./matching-preference-shared.ts";

const selectionConflicts = new Set([
  "COVERAGE_UNAVAILABLE", "MATCHING_PREFERENCE_NOT_READY", "MATCHING_PREFERENCE_REQUEST_CONFLICT",
  "MATCHING_PREFERENCE_CONFIRMATION_UNAVAILABLE", "MATCHING_PREFERENCE_FAVORITE_UNAVAILABLE",
]);

export async function requestDurableMatchingPreference(
  ctx: MobileApiContext, jobId: string, input: MatchingPreferenceInput,
): Promise<EdgeMatchingPreferenceResponse> {
  requireMatchingCustomer(ctx);
  const client = workflowDb(ctx);
  const result = await dbQuery(client.rpc("request_job_matching_preference_atomic", {
    p_job_id: jobId, p_customer_id: ctx.user.id, p_strategy: input.mode,
    p_preferred_worker_id: input.worker_id ?? null, p_auto_general: input.auto_general,
    p_client_request_id: input.client_request_id,
  }));
  if (result.error) failSelection(result.error, true);
  const selection = parseSelection(result.data, jobId, input.client_request_id, true);
  if (selection.mode !== input.mode || selection.preferred_worker_id !== (input.worker_id ?? null)
    || selection.auto_general !== input.auto_general) failSelection(null, true);
  let matchingState;
  try {
    matchingState = await getMatchingState(client, jobId, selection.job_status);
  } catch {
    failSelection(null, true);
  }
  if (!matchingState) failSelection(null, true);
  return {
    job_id: jobId, status: selection.job_status, broadcast_sent: selection.broadcast_sent,
    worker: null, selection, matching_state: matchingState,
    message: selection.state === "queued"
      ? "Đã ghi nhận lựa chọn. Kael đang chuẩn bị gửi yêu cầu tìm thợ."
      : "Đã đồng bộ lựa chọn và tiến trình tìm thợ của bạn.",
  };
}

export async function getJobMatchingPreferenceReceipt(
  ctx: MobileApiContext, jobId: string, requestId: string,
): Promise<{ selection: EdgeMatchingSelectionReceipt }> {
  requireMatchingCustomer(ctx);
  const result = await dbQuery(workflowDb(ctx).rpc("get_job_matching_preference_receipt", {
    p_job_id: jobId, p_customer_id: ctx.user.id, p_client_request_id: requestId,
  }));
  if (result.error) failSelection(result.error, false);
  return { selection: parseSelection(result.data, jobId, requestId, false) };
}

export function requireMatchingCustomer(ctx: MobileApiContext) {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách đặt dịch vụ được lựa chọn cách tìm thợ.", 403);
  }
}

function parseSelection(value: unknown, jobId: string, requestId: string, mutation: boolean) {
  const result = matchingSelectionReceiptSchema.safeParse(value);
  if (!result.success || result.data.job_id !== jobId || result.data.request_id !== requestId) {
    failSelection(null, mutation);
  }
  return result.data;
}

function failSelection(error: DbError | null, mutation: boolean): never {
  if (error?.code === "42501") apiFailure("NOT_FOUND", "Không tìm thấy lựa chọn tìm thợ.", 404);
  if (error?.message && selectionConflicts.has(error.message)) {
    apiFailure(error.message, "Chưa thể áp dụng lựa chọn này. Vui lòng tải lại tình trạng thợ và yêu cầu.", 409);
  }
  if (mutation) {
    apiFailure("MATCHING_PREFERENCE_OUTCOME_UNKNOWN", "Đang đối soát lựa chọn tìm thợ. Không cần gửi một lựa chọn mới.", 503,
      { reconcile_required: true });
  }
  apiFailure("MATCHING_PREFERENCE_READ_UNAVAILABLE", "Chưa thể tải lựa chọn tìm thợ. Vui lòng thử lại.", 503);
}
