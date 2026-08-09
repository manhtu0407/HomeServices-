import type { UserRole } from "../../../../_shared/domain.ts";
import { apiFailure } from "../api-failure.ts";
import type { MobileApiContext } from "../auth.ts";

// Operator accounts are intentionally scoped to the Admin control plane. Workflow domains
// call this at the authority boundary so a future route cannot escalate an operator into a
// customer, worker, or Kael policy action.
export function requireNonOperatorWorkflowRole(
  ctx: MobileApiContext,
): Exclude<UserRole, "admin_operator"> {
  if (ctx.role === "admin_operator") {
    apiFailure("AUTH_FORBIDDEN", "Quản trị viên phụ không có quyền vào luồng này", 403);
  }
  return ctx.role;
}
