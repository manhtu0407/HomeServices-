import type { CustomerAddressSaveRequest } from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { dbQuery, workflowDb } from "../../platform/db.ts";
import { getCustomerProfileInsights } from "./profile-insights.ts";

export async function saveCustomerAddress(
  ctx: MobileApiContext,
  input: CustomerAddressSaveRequest,
) {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Bạn không có quyền thực hiện hành động này", 403);
  }

  // authenticated is read-only on customer_profiles (20260518032000, and no owner write
  // policy), so the user-scoped client would be refused: the row is written through the
  // service client after the role check above, keyed to ctx.user.id and never to the body.
  // A profiles trigger keeps every customer backed by a row (20260816120000); this still
  // upserts so a missing row is created instead of an update silently affecting zero rows.
  const result = await dbQuery(
    workflowDb(ctx)
      .from("customer_profiles")
      .upsert({ id: ctx.user.id, default_address: input.default_address }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Chưa thể lưu địa chỉ mặc định", 500);
  }

  return getCustomerProfileInsights(ctx);
}
