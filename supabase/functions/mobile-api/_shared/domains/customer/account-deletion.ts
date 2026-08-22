import type { AccountDeletionRequest } from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { EdgeCustomerAccountDeletionResponse } from "../contracts/customer.ts";
import { deleteAccount } from "../account/account-deletion.ts";

export async function deleteCustomerAccount(
  ctx: MobileApiContext,
  input: AccountDeletionRequest,
): Promise<EdgeCustomerAccountDeletionResponse> {
  if (ctx.role !== "customer") {
    apiFailure(
      "AUTH_FORBIDDEN",
      "Chỉ chủ tài khoản khách hàng mới có thể xóa tài khoản này",
      403,
    );
  }
  return await deleteAccount(ctx, input);
}
