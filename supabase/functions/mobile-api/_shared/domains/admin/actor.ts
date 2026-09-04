import { asStringArray } from "../../platform/coercions.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery } from "../../platform/db.ts";
import {
  ADMIN_CONTROL_CAPABILITIES,
  type AdminActor,
  type AdminControlCapability,
} from "../contracts/admin-control.ts";

type Row = Record<string, unknown>;

export async function getAdminActor(ctx: MobileApiContext): Promise<AdminActor> {
  return requireAdminCapability(ctx, "finance.read");
}

export async function requireAdminCapability(
  ctx: MobileApiContext,
  capability: AdminControlCapability,
): Promise<AdminActor> {
  if (ctx.role === "admin") {
    return { access_level: "owner", capabilities: [...ADMIN_CONTROL_CAPABILITIES] };
  }
  if (ctx.role !== "admin_operator") {
    apiFailure("AUTH_FORBIDDEN", "Tài khoản không có quyền vào khu vực quản trị", 403);
  }
  const result = await dbQuery<Row>(
    db(ctx)
      .from("admin_operator_accounts")
      .select("capabilities,status")
      .eq("user_id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error || !result.data || result.data.status !== "active") {
    apiFailure("AUTH_FORBIDDEN", "Quyền Sub Admin hiện không còn hiệu lực", 403);
  }
  const storedCapabilities = asCapabilities(result.data.capabilities);
  const capabilities = Array.from(new Set([
    "finance.read" as const,
    "system.read" as const,
    ...storedCapabilities,
  ]));
  if (!capabilities.includes(capability)) {
    apiFailure("AUTH_FORBIDDEN", "Tài khoản chưa được cấp quyền cho thao tác này", 403);
  }
  return { access_level: "operator", capabilities };
}

export function asCapabilities(value: unknown): AdminControlCapability[] {
  const allowed = new Set<string>(ADMIN_CONTROL_CAPABILITIES);
  return Array.from(new Set(
    asStringArray(value).filter(
      (capability): capability is AdminControlCapability => allowed.has(capability),
    ),
  ));
}
