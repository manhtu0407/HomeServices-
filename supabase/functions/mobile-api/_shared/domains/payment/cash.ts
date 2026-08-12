import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";

export async function confirmWorkerCashPayment(
  _ctx: MobileApiContext,
  jobId: string,
): Promise<never> {
  return apiFailure(
    "PAYMENT_METHOD_CHANGED",
    "Thanh toán trực tiếp cần xác nhận từ cả khách và thợ trước khi công việc được ghi nhận đã thanh toán.",
    409,
    { job_id: jobId, recovery: "direct_payment_receipt" },
  );
}
