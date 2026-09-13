import { z } from "zod";
import { edgeRefundSummarySchema, type EdgeRefundSummary } from "../../../../_shared/contracts/payment.ts";
import type { CustomerCancellationRequestInput } from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import type { EdgeCustomerCancellationResponse } from "../contracts/customer.ts";

const paidCancellationReceiptSchema = z.object({
  cancellation_id: z.string().uuid(),
  dispute_id: z.string().uuid(),
  job_id: z.string().uuid(),
  job_status: z.enum(["paid", "reviewed"]),
  reason_code: z.string().trim().min(1).max(100),
  created_at: z.string().datetime({ offset: true }),
});

export async function requestPaidCancellationReview(
  ctx: MobileApiContext,
  jobId: string,
  input: CustomerCancellationRequestInput,
): Promise<EdgeCustomerCancellationResponse> {
  if (ctx.role !== "customer") apiFailure("AUTH_FORBIDDEN", "Bạn không có quyền gửi yêu cầu này", 403);
  const result = await dbQuery(db(ctx).rpc("request_paid_cancellation_review_atomic", {
    p_job_id: jobId,
    p_customer_id: ctx.user.id,
    p_reason_code: input.reason_code,
    p_reason_note: input.reason_note ?? null,
  }));
  if (result.error?.code === "P0001") {
    if (result.error.message === "JOB_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
    if (result.error.message === "INVALID_REASON") apiFailure("VALIDATION", "Lý do yêu cầu không hợp lệ", 400);
    if (result.error.message === "PAID_REVIEW_STATUS_CHANGED") {
      apiFailure("INVALID_STATUS", "Trạng thái thanh toán đã thay đổi. Vui lòng tải lại.", 409);
    }
  }
  if (result.error) apiFailure("REFUND_REVIEW_UNAVAILABLE", "Chưa thể đối soát yêu cầu. Vui lòng tải lại để kiểm tra.", 503);
  const parsed = paidCancellationReceiptSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.job_id !== jobId) {
    apiFailure("REFUND_REVIEW_UNAVAILABLE", "Chưa thể xác minh biên nhận yêu cầu. Vui lòng tải lại để kiểm tra.", 503);
  }
  return {
    cancellation_id: parsed.data.cancellation_id,
    dispute_id: parsed.data.dispute_id,
    job_id: jobId,
    status: "requested",
    job_status: parsed.data.job_status,
    sub_case: "after_worker_completed_trigger_dispute",
    reason_code: parsed.data.reason_code,
    reason_category: "needs_admin_review",
    admin_review_required: true,
    phase0_no_monetary_penalty: false,
    worker_goodwill: null,
    abuse_signals: [],
    refund_state: "review_required",
    message: "Yêu cầu đã được chuyển để xem xét. Việc hủy và hoàn tiền chưa được phê duyệt; thanh toán đã ghi nhận không thay đổi.",
    created_at: parsed.data.created_at,
  };
}

export async function loadJobRefundSummary(
  client: DbClient,
  jobId: string,
  realOnly = false,
): Promise<EdgeRefundSummary | null> {
  const result = await dbQuery(client.rpc("read_job_refund_summary", {
    p_job_id: jobId,
    p_real_only: realOnly,
  }));
  if (result.error) apiFailure("REFUND_READ_UNAVAILABLE", "Chưa thể đối soát trạng thái hoàn tiền. Vui lòng thử lại.", 503);
  if (result.data === null) return null;
  const parsed = edgeRefundSummarySchema.safeParse(result.data);
  if (!parsed.success) apiFailure("REFUND_READ_UNAVAILABLE", "Trạng thái hoàn tiền chưa được xác minh. Vui lòng thử lại.", 503);
  return parsed.data;
}
