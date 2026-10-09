import type { MobileApiContext } from "../../platform/auth.ts";
import { dbQuery, workflowDb } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { confirmationOperationReceiptSchema } from "../../../../_shared/contracts/stage1-reliability.ts";
import { buildConfirmationIdempotencyKey } from "./confirmation-operation.ts";

const recoveryConflicts = new Set([
  "LEGACY_OFFER_CHANGED", "KAEL_PRICE_EVIDENCE_REQUIRED", "POLICY_BLOCKED",
  "POLICY_UNAVAILABLE", "CONFIRMATION_KIND_MISMATCH", "LEGACY_RECOVERY_NOT_READY",
  "TIER_A_INCOMPLETE", "SAFETY_BLOCKED", "MISSING_REASONING_RECEIPT", "MISSING_SCOPE",
  "MISSING_ESTIMATE", "NO_DISTRICT",
]);

export async function recoverLegacyKaelConfirmation(
  ctx: MobileApiContext,
  sessionId: string,
  input: { job_id: string; price_reasoning_receipt_id: string },
): Promise<Record<string, unknown>> {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách đặt dịch vụ được khôi phục xác nhận.", 403);
  }
  const result = await dbQuery(workflowDb(ctx).rpc("recover_legacy_kael_confirmation_atomic", {
    p_session_id: sessionId, p_customer_id: ctx.user.id, p_job_id: input.job_id,
    p_price_reasoning_receipt_id: input.price_reasoning_receipt_id,
  }));
  if (result.error?.code === "42501") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu cần khôi phục.", 404);
  }
  if (result.error?.message && recoveryConflicts.has(result.error.message)) {
    apiFailure(result.error.message, "Phương án cần được kiểm tra và xác nhận lại trước khi tìm thợ.", 409);
  }
  const receipt = confirmationOperationReceiptSchema.safeParse(result.data);
  if (result.error || !receipt.success || receipt.data.session_id !== sessionId ||
    receipt.data.job_id !== input.job_id || receipt.data.idempotency_key !==
      buildConfirmationIdempotencyKey(sessionId, ctx.user.id)) {
    apiFailure("LEGACY_RECOVERY_OUTCOME_UNKNOWN", "Đang đối soát xác nhận. Hãy tải lại trạng thái yêu cầu.",
      503, { reconcile_required: true });
  }
  return { operation: receipt.data };
}
