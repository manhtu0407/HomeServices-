import { asString, nullableNumber, nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { UserRole } from "../../../../_shared/domain.ts";
import type { EdgeJobDetailResponse } from "../contracts/job-detail.ts";
import { loadDirectWorkerPaymentAvailability } from "../payment/direct-payment-availability.ts";

export async function loadPaymentReceipt(
  client: DbClient,
  jobId: string,
  role: UserRole,
  customerId: string | null,
): Promise<EdgeJobDetailResponse["job"]["payment_receipt"]> {
  const orderResult = await dbQuery<Record<string, unknown>>(
    client
      .from("job_payment_orders")
      .select(
        "id,payment_method,status,gross_amount,qr_image_url,customer_transfer_claimed_at,customer_transferred_at,response_deadline,hold_until,customer_confirmed_at,worker_confirmed_at",
      )
      .eq("job_id", jobId)
      .maybeSingle(),
  );
  if (orderResult.error) {
    apiFailure("DB_ERROR", "Không thể tải biên nhận thanh toán", 500);
  }
  const order = orderResult.data;
  if (!order) return null;
  const method = nullableString(order.payment_method);
  const grossAmount = nullableNumber(order.gross_amount);
  if (
    (method !== "platform_bank_manual" && method !== "direct_worker") ||
    !grossAmount || !Number.isSafeInteger(grossAmount) || grossAmount <= 0
  ) {
    apiFailure("DB_ERROR", "Biên nhận thanh toán không hợp lệ", 500);
  }
  let collateralAmount: number | null = null;
  if (method === "direct_worker") {
    const collateralResult = await dbQuery<Record<string, unknown>>(
      client
        .from("worker_direct_payment_collateral_reservations")
        .select("collateral_amount")
        .eq("payment_order_id", asString(order.id))
        .maybeSingle(),
    );
    if (collateralResult.error) {
      apiFailure("DB_ERROR", "Không thể tải khoản giữ hoa hồng", 500);
    }
    collateralAmount = nullableNumber(collateralResult.data?.collateral_amount);
  }
  const directPaymentAvailable = method === "platform_bank_manual" && role === "customer" && customerId
    ? await loadDirectWorkerPaymentAvailability(client, jobId, customerId)
    : null;
  const account = role === "worker" ? null : paymentReceiptAccount(order.qr_image_url);
  return {
    method,
    status: asString(order.status),
    gross_amount: grossAmount,
    customer_transfer_claimed_at: nullableString(order.customer_transfer_claimed_at),
    customer_transferred_at: nullableString(order.customer_transferred_at),
    response_deadline: nullableString(order.response_deadline),
    hold_until: nullableString(order.hold_until),
    customer_confirmed_at: nullableString(order.customer_confirmed_at),
    worker_confirmed_at: nullableString(order.worker_confirmed_at),
    collateral_amount: collateralAmount,
    direct_payment_available: directPaymentAvailable,
    bank_code: account?.bankCode ?? null,
    account_holder: account?.accountHolder ?? null,
    account_masked: account?.accountMasked ?? null,
  };
}

export function parsePaymentStatus(
  value: unknown,
): EdgeJobDetailResponse["job"]["payment_status"] {
  if (value === null || value === undefined) return null;
  if (
    value === "not_started" || value === "code_requested" || value === "vietqr_ready" ||
    value === "pending" || value === "received" || value === "cash_confirmed" ||
    value === "amount_mismatch" || value === "expired" || value === "failed" ||
    value === "reconciled" || value === "manual_qr_ready" ||
    value === "manual_customer_claimed" || value === "manual_reconcile_required" ||
    value === "manual_verified" || value === "direct_awaiting_confirmation" ||
    value === "direct_awaiting_customer_confirmation" ||
    value === "direct_awaiting_worker_confirmation" ||
    value === "direct_reconcile_required" || value === "direct_paid"
  ) {
    return value;
  }
  apiFailure("DB_ERROR", "Trạng thái thanh toán không hợp lệ", 500);
}

function paymentReceiptAccount(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.origin !== "https://vietqr.app" || url.pathname !== "/img") return null;
    const account = url.searchParams.get("acc")?.replace(/\s+/g, "");
    const bankCode = url.searchParams.get("bank")?.trim().toUpperCase();
    const accountHolder = url.searchParams.get("holder")?.trim();
    if (
      !account || !/^[A-Za-z0-9]{1,19}$/.test(account) || !bankCode ||
      !/^[A-Z0-9_-]{2,32}$/.test(bankCode) || !accountHolder || accountHolder.length > 120
    ) return null;
    return {
      bankCode,
      accountHolder,
      accountMasked: account.length <= 4
        ? account.replace(/.(?=.)/g, "•")
        : `${"•".repeat(Math.max(0, account.length - 4))}${account.slice(-4)}`,
    };
  } catch {
    return null;
  }
}
