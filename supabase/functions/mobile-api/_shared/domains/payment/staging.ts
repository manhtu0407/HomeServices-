// Staging-only payment simulator. This proves workflow/UI transitions without
// presenting a simulated provider result as real Production money movement.

import { PLATFORM_FEE_WORKER, type JobStatus } from "../../../../_shared/domain.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { validateWorkflowTransition } from "../../workflow-orchestrator.ts";
import { logJobEvent } from "../../platform/audit.ts";
import { nullableNumber, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";

type StagingPaymentRow = Record<string, unknown> & {
  id: string;
  status: JobStatus;
  customer_id: string;
};

export type EdgeStagingPaymentResponse = {
  job_id: string;
  status: JobStatus;
  payment: {
    provider: "staging_simulator";
    status: "pending" | "received";
    gross_amount: number;
    platform_fee: number;
    worker_net: number;
    payment_code: string;
    transfer_content: string;
    qr_image_url: null;
    expires_at: string | null;
    received_at: string | null;
    amount_received: number | null;
    updated_at: string;
  };
};

const PAYMENT_SELECT =
  "id, status, customer_id, final_price, payment_provider, payment_status, payment_code, payment_transfer_content, payment_expires_at, payment_received_at, payment_amount_received, gross_amount, platform_fee, worker_net";

export async function createStagingPaymentIntent(
  ctx: MobileApiContext,
  jobId: string,
  enabled: boolean,
): Promise<EdgeStagingPaymentResponse> {
  assertStagingPaymentEnabled(enabled);
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: PAYMENT_SELECT,
  }) as StagingPaymentRow;

  if (job.status === "payment_pending") {
    assertStagingProvider(job);
    return stagingPaymentResponse(jobId, job.status, job);
  }
  if (job.status !== "confirmed_by_customer") {
    apiFailure("INVALID_STATUS", "Công việc chưa sẵn sàng cho bước thanh toán.", 409);
  }
  const transition = validateWorkflowTransition({
    event: "customer_started_payment",
    from: job.status,
    to: "payment_pending",
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  const grossAmount = nullableNumber(job.final_price);
  if (grossAmount === null || grossAmount <= 0) {
    apiFailure("INVALID_STATUS", "Giá cuối cùng chưa hợp lệ để tạo thanh toán.", 409);
  }
  const now = new Date();
  const updatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const platformFee = Math.round(grossAmount * PLATFORM_FEE_WORKER);
  const workerNet = grossAmount - platformFee;
  const paymentCode = `STG-${jobId}`;
  const transferContent = `STAGING ONLY ${paymentCode}`;
  const payment = {
    status: "payment_pending" as const,
    payment_provider: "staging_simulator",
    payment_status: "pending",
    payment_code: paymentCode,
    payment_transfer_content: transferContent,
    payment_qr_image_url: null,
    payment_expires_at: expiresAt,
    payment_received_at: null,
    payment_amount_received: null,
    gross_amount: grossAmount,
    platform_fee: platformFee,
    worker_net: workerNet,
    payment_updated_at: updatedAt,
  };

  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update(payment)
      .eq("id", jobId)
      .eq("customer_id", ctx.user.id)
      .eq("status", "confirmed_by_customer")
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) apiFailure("DB_ERROR", "Không thể tạo thanh toán Staging.", 500);
  if (!updated.data) apiFailure("STATUS_CHANGED", "Trạng thái công việc đã thay đổi.", 409);

  await logJobEvent(client, jobId, "customer_started_payment", ctx, "confirmed_by_customer", "payment_pending", {
    payment_mode: "staging_simulator",
  });
  return stagingPaymentResponse(jobId, "payment_pending", payment);
}

export async function confirmStagingPayment(
  ctx: MobileApiContext,
  jobId: string,
  enabled: boolean,
): Promise<EdgeStagingPaymentResponse> {
  assertStagingPaymentEnabled(enabled);
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: PAYMENT_SELECT,
  }) as StagingPaymentRow;
  assertStagingProvider(job);

  if (job.status === "paid") return stagingPaymentResponse(jobId, job.status, job);
  if (job.status !== "payment_pending") {
    apiFailure("INVALID_STATUS", "Thanh toán Staging chưa ở trạng thái chờ xác nhận.", 409);
  }
  const transition = validateWorkflowTransition({
    event: "payment_confirmed",
    from: job.status,
    to: "paid",
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  const grossAmount = nullableNumber(job.gross_amount) ?? nullableNumber(job.final_price);
  if (grossAmount === null || grossAmount <= 0) {
    apiFailure("INVALID_STATUS", "Số tiền Staging chưa hợp lệ.", 409);
  }
  const now = new Date().toISOString();
  const payment = {
    status: "paid" as const,
    payment_status: "received",
    payment_received_at: now,
    payment_amount_received: grossAmount,
    paid_at: now,
    payment_updated_at: now,
  };
  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update(payment)
      .eq("id", jobId)
      .eq("customer_id", ctx.user.id)
      .eq("status", "payment_pending")
      .eq("payment_provider", "staging_simulator")
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) apiFailure("DB_ERROR", "Không thể xác nhận thanh toán Staging.", 500);
  if (!updated.data) apiFailure("STATUS_CHANGED", "Trạng thái thanh toán đã thay đổi.", 409);

  await logJobEvent(client, jobId, "payment_confirmed", ctx, "payment_pending", "paid", {
    payment_mode: "staging_simulator",
  });
  return stagingPaymentResponse(jobId, "paid", { ...job, ...payment });
}

function assertStagingPaymentEnabled(enabled: boolean) {
  if (!enabled) {
    apiFailure("PAYMENT_NOT_ENABLED", "Thanh toán chưa được bật cho môi trường này.", 409);
  }
}

function assertStagingProvider(job: Record<string, unknown>) {
  if (nullableString(job.payment_provider) !== "staging_simulator") {
    apiFailure("PAYMENT_PROVIDER_MISMATCH", "Phương thức thanh toán của công việc không phù hợp.", 409);
  }
}

function stagingPaymentResponse(
  jobId: string,
  status: JobStatus,
  row: Record<string, unknown>,
): EdgeStagingPaymentResponse {
  const grossAmount = nullableNumber(row.gross_amount) ?? nullableNumber(row.final_price) ?? 0;
  const platformFee = nullableNumber(row.platform_fee) ?? Math.round(grossAmount * PLATFORM_FEE_WORKER);
  const paymentCode = nullableString(row.payment_code) ?? `STG-${jobId}`;
  return {
    job_id: jobId,
    status,
    payment: {
      provider: "staging_simulator",
      status: status === "paid" ? "received" : "pending",
      gross_amount: grossAmount,
      platform_fee: platformFee,
      worker_net: nullableNumber(row.worker_net) ?? grossAmount - platformFee,
      payment_code: paymentCode,
      transfer_content: nullableString(row.payment_transfer_content) ?? `STAGING ONLY ${paymentCode}`,
      qr_image_url: null,
      expires_at: nullableString(row.payment_expires_at),
      received_at: nullableString(row.payment_received_at),
      amount_received: nullableNumber(row.payment_amount_received),
      updated_at: nullableString(row.payment_updated_at) ?? new Date().toISOString(),
    },
  };
}
