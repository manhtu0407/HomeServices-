import type { JobStatus } from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";

export type EdgeCashPaymentConfirmationResponse = {
  job_id: string;
  outcome: "confirmed" | "already_confirmed";
  status: JobStatus;
  payment: {
    provider: "cash";
    status: "cash_confirmed";
    gross_amount: number;
    platform_fee: number;
    worker_net: number;
    commission_level: number;
    commission_rate_bps: number;
    cash_commission_collected: number;
    cash_commission_due: number;
    received_at: string;
    updated_at: string;
  };
};

export async function confirmWorkerCashPayment(
  ctx: MobileApiContext,
  jobId: string,
): Promise<EdgeCashPaymentConfirmationResponse> {
  if (ctx.role !== "worker") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ thợ được xác nhận thanh toán tiền mặt.", 403);
  }

  const result = await dbQuery<Array<Record<string, unknown>>>(
    (ctx.supabase as DbClient).rpc("confirm_worker_cash_payment", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
    }),
  );
  const row = result.data?.[0];
  if (result.error?.code === "P0001") {
    apiFailure("STATUS_CHANGED", "Trạng thái công việc đã thay đổi. Vui lòng tải lại và thử lại.", 409);
  }
  if (result.error || !row || !isCashConfirmationRow(row, jobId)) {
    apiFailure("DB_ERROR", "Không thể xác nhận thanh toán tiền mặt.", 500);
  }

  return {
    job_id: jobId,
    outcome: row.outcome,
    status: "paid",
    payment: {
      provider: "cash",
      status: "cash_confirmed",
      gross_amount: row.gross_amount,
      platform_fee: row.platform_fee,
      worker_net: row.worker_net,
      commission_level: row.commission_level,
      commission_rate_bps: row.commission_rate_bps,
      cash_commission_collected: row.cash_commission_collected,
      cash_commission_due: row.cash_commission_due,
      received_at: row.payment_received_at,
      updated_at: row.payment_updated_at,
    },
  };
}

type CashConfirmationRow = {
  outcome: "confirmed" | "already_confirmed";
  job_id: string;
  job_status: "paid";
  payment_status: "cash_confirmed";
  gross_amount: number;
  platform_fee: number;
  worker_net: number;
  commission_level: number;
  commission_rate_bps: number;
  cash_commission_collected: number;
  cash_commission_due: number;
  payment_received_at: string;
  payment_updated_at: string;
};

function isCashConfirmationRow(
  value: Record<string, unknown>,
  expectedJobId: string,
): value is CashConfirmationRow {
  return value.job_id === expectedJobId &&
    value.job_status === "paid" &&
    value.payment_status === "cash_confirmed" &&
    (value.outcome === "confirmed" || value.outcome === "already_confirmed") &&
    isPositiveSafeInteger(value.gross_amount) &&
    isNonnegativeSafeInteger(value.platform_fee) &&
    isPositiveSafeInteger(value.worker_net) &&
    isPositiveSafeInteger(value.commission_level) &&
    isNonnegativeSafeInteger(value.commission_rate_bps) &&
    isNonnegativeSafeInteger(value.cash_commission_collected) &&
    isNonnegativeSafeInteger(value.cash_commission_due) &&
    value.cash_commission_collected + value.cash_commission_due === value.platform_fee &&
    value.gross_amount === value.platform_fee + value.worker_net &&
    isIsoTimestamp(value.payment_received_at) &&
    isIsoTimestamp(value.payment_updated_at);
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonnegativeSafeInteger(value) && value > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}
