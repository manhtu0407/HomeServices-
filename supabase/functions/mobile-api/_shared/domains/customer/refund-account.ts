import type {
  CustomerRefundAccountSaveRequest,
} from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { EdgeCustomerRefundAccountResponse } from "../contracts/customer.ts";
import { db, dbQuery, workflowDb } from "../../platform/db.ts";
import { requireRealTrafficActor } from "../../platform/synthetic-cohort.ts";
import { nullableString } from "../../platform/coercions.ts";

type RefundAccountRow = Record<string, unknown>;

const REFUND_ACCOUNT_COLUMNS = [
  "id",
  "bank_key",
  "bank_name",
  "bank_account_masked",
  "status",
  "is_default",
  "verified_at",
  "updated_at",
].join(", ");

type RefundAccountStatus = NonNullable<
  EdgeCustomerRefundAccountResponse["refund_account"]
>["status"];

export async function getCustomerRefundAccount(
  ctx: MobileApiContext,
): Promise<EdgeCustomerRefundAccountResponse> {
  await requireRealTrafficActor(workflowDb(ctx), ctx.user.id, "customer");
  const result = await dbQuery<RefundAccountRow>(
    db(ctx)
      .from("customer_payment_methods")
      .select(REFUND_ACCOUNT_COLUMNS)
      .eq("customer_id", ctx.user.id)
      .eq("is_default", true)
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Chưa thể tải tài khoản hoàn tiền", 500);
  }

  return {
    refund_account: result.data ? serializeRefundAccount(result.data) : null,
  };
}

export async function saveCustomerRefundAccount(
  ctx: MobileApiContext,
  input: CustomerRefundAccountSaveRequest,
): Promise<EdgeCustomerRefundAccountResponse> {
  // Membership rows have RLS with no policy, so the caller's own client would never see a synthetic
  // actor and the guard would always pass; the RPC below is executable by service_role only.
  await requireRealTrafficActor(workflowDb(ctx), ctx.user.id, "customer");
  // The atomic RPC validates and persists raw financial PII without returning it to the client.
  const result = await dbQuery<RefundAccountRow[]>(
    workflowDb(ctx).rpc("upsert_customer_refund_payment_method", {
      p_account_holder_name: input.account_holder_name.trim(),
      p_bank_account: input.bank_account.trim(),
      p_bank_key: input.bank_key,
      p_customer_id: ctx.user.id,
    }),
  );
  const persisted = result.data?.[0] ?? null;
  if (result.error || !persisted) {
    apiFailure("DB_ERROR", "Chưa thể lưu tài khoản hoàn tiền", 500);
  }

  return { refund_account: serializeRefundAccount(persisted) };
}

function serializeRefundAccount(
  row: RefundAccountRow,
): NonNullable<EdgeCustomerRefundAccountResponse["refund_account"]> {
  const id = nullableString(row.id);
  const bankKey = nullableString(row.bank_key);
  const bankName = nullableString(row.bank_name);
  const accountMasked = nullableString(row.bank_account_masked);
  const status = refundAccountStatus(row.status);
  const updatedAt = nullableString(row.updated_at);
  const verifiedAt = row.verified_at === null ? null : nullableString(row.verified_at);

  if (
    !id || !bankKey || !bankName || !accountMasked || !status || !updatedAt ||
    row.is_default !== true || (row.verified_at !== null && !verifiedAt)
  ) {
    apiFailure("DB_ERROR", "Chưa thể xác nhận tài khoản hoàn tiền đã lưu", 500);
  }

  return {
    id,
    bank_key: bankKey,
    bank_name: bankName,
    bank_account_masked: accountMasked,
    status,
    is_default: true,
    verified_at: verifiedAt,
    updated_at: updatedAt,
  };
}

function refundAccountStatus(value: unknown): RefundAccountStatus | null {
  return value === "pending_verification" || value === "verified" || value === "rejected"
    ? value
    : null;
}
