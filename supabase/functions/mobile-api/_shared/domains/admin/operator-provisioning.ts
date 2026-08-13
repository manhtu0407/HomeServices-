import type {
  EdgeAdminOperatorProvisionInput,
  AdminOperatorProvisionResponse,
  EdgeAdminOperatorResetPasswordInput,
  AdminOperatorResetPasswordResponse,
  AdminOperatorProvisioningSummary,
} from "../contracts/admin-control.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { asString, asStringArray, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import type { MobileApiContext } from "../../platform/auth.ts";

type Row = Record<string, unknown>;
type AuthAdminClient = DbClient & {
  auth: { admin: {
    createUser(input: unknown): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
    deleteUser(userId: string, shouldSoftDelete?: boolean): Promise<{ error: unknown }>;
    updateUserById(userId: string, input: unknown): Promise<{ error: unknown }>;
  } };
};

export async function provisionAdminOperator(
  ctx: MobileApiContext,
  input: EdgeAdminOperatorProvisionInput,
): Promise<AdminOperatorProvisionResponse> {
  requireOwner(ctx);
  const client = db(ctx);
  const authClient = ctx.supabase as AuthAdminClient;
  const begin = await dbQuery<Row[]>(client.rpc("admin_begin_operator_provisioning", {
    p_owner_id: ctx.user.id,
    p_email: input.email,
    p_full_name: input.full_name,
    p_capabilities: input.capabilities,
  }));
  const intent = begin.data?.[0];
  if (begin.error || !intent) apiFailure("DB_ERROR", "Không thể bắt đầu tạo tài khoản quản trị", 500);
  if (intent.ok !== true) mapProvisioningError(nullableString(intent.error_code));
  const provisioningId = asString(intent.provisioning_id);

  const created = await authClient.auth.admin.createUser({
    email: input.email,
    password: input.initial_password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, must_change_password: true },
  });
  if (created.error || !created.data.user) {
    await markProvisioningFailed(client, ctx.user.id, provisioningId, authFailureCode(created.error));
    if (isDuplicateAuthIdentity(created.error)) {
      apiFailure("EMAIL_EXISTS", "Gmail này đã có tài khoản. Hãy dùng luồng đề cử tài khoản đã có.", 409);
    }
    apiFailure("AUTH_CREATE_FAILED", "Không thể tạo tài khoản đăng nhập quản trị", 502);
  }

  const completed = await dbQuery<Row[]>(client.rpc("admin_complete_operator_provisioning", {
    p_owner_id: ctx.user.id,
    p_provisioning_id: provisioningId,
    p_user_id: created.data.user.id,
  }));
  const completion = completed.data?.[0];
  if (completed.error || completion?.ok !== true) {
    const rollback = await authClient.auth.admin.deleteUser(created.data.user.id, false);
    await markProvisioningFailed(client, ctx.user.id, provisioningId, "PROFILE_BIND_FAILED");
    if (rollback.error) {
      apiFailure("PROVISIONING_FAILED", "Tài khoản chưa thể liên kết và cần được hỗ trợ trước khi thử lại.", 503);
    }
    apiFailure("PROVISIONING_FAILED", "Không thể hoàn tất tài khoản. Đã hoàn tác an toàn; Owner có thể thử lại.", 503);
  }
  const now = new Date().toISOString();
  return {
    ok: true,
    account: {
      id: provisioningId,
      full_name: input.full_name,
      email_masked: maskEmail(input.email),
      status: "pending_password_change",
      capabilities: input.capabilities,
      created_at: now,
      updated_at: now,
      last_activity_at: null,
    },
  };
}

export async function resetPendingAdminOperatorPassword(
  ctx: MobileApiContext,
  provisioningId: string,
  input: EdgeAdminOperatorResetPasswordInput,
): Promise<AdminOperatorResetPasswordResponse> {
  requireOwner(ctx);
  const client = db(ctx);
  const authClient = ctx.supabase as AuthAdminClient;
  const provisioning = await dbQuery<Row>(client.from("admin_operator_provisioning")
    .select("id,user_id,status,created_by").eq("id", provisioningId).maybeSingle());
  const userId = nullableString(provisioning.data?.user_id);
  if (provisioning.error || !provisioning.data || !userId) apiFailure("NOT_FOUND", "Không tìm thấy tài khoản chờ kích hoạt", 404);
  if (provisioning.data.created_by !== ctx.user.id || provisioning.data.status !== "pending_password_change") {
    apiFailure("CONFLICT", "Chỉ có thể đặt lại mật khẩu cho tài khoản chưa kích hoạt", 409);
  }
  const updated = await authClient.auth.admin.updateUserById(userId, {
    password: input.initial_password,
    user_metadata: { must_change_password: true },
  });
  if (updated.error) apiFailure("AUTH_UPDATE_FAILED", "Không thể đặt lại mật khẩu ban đầu", 502);
  const now = new Date().toISOString();
  const audit = await dbQuery(client.from("kael_permission_audit").insert({
    actor_id: ctx.user.id,
    actor_role: "admin",
    purpose: "admin_operator_provisioning",
    action: "reset_password",
    topic: "admin_operator",
    decision: "allow",
    reason_code: "pending_password_reset",
    safe_metadata: { provisioning_id: provisioningId, user_id: userId },
  }));
  if (audit.error) apiFailure("AUDIT_FAILED", "Mật khẩu đã đổi nhưng chưa ghi được nhật ký kiểm soát", 500);
  return { ok: true, provisioning_id: provisioningId, updated_at: now };
}

export function serializeProvisioning(row: Row): AdminOperatorProvisioningSummary | null {
  const id = nullableString(row.id);
  const fullName = nullableString(row.full_name);
  const email = nullableString(row.email);
  const status = row.status;
  const createdAt = nullableString(row.created_at);
  const updatedAt = nullableString(row.updated_at);
  if (!id || !fullName || !email || !createdAt || !updatedAt ||
      (status !== "pending_password_change" && status !== "active" && status !== "failed")) return null;
  return {
    id,
    full_name: fullName,
    email_masked: maskEmail(email),
    status,
    capabilities: asStringArray(row.capabilities).filter(isCapability) as AdminOperatorProvisioningSummary["capabilities"],
    created_at: createdAt,
    updated_at: updatedAt,
    last_activity_at: nullableString(row.last_activity_at),
  };
}

async function markProvisioningFailed(
  client: ReturnType<typeof db>,
  ownerId: string,
  provisioningId: string,
  code: string,
) {
  await dbQuery(client.rpc("admin_fail_operator_provisioning", {
    p_owner_id: ownerId,
    p_provisioning_id: provisioningId,
    p_failure_code: code,
  }));
}

function requireOwner(ctx: MobileApiContext) {
  if (ctx.role !== "admin") apiFailure("AUTH_FORBIDDEN", "Chỉ Owner được quản lý tài khoản quản trị", 403);
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

function isCapability(value: string) {
  return [
    "operations.read", "workers.read", "workers.review", "workers.manage",
    "transactions.read", "finance.read", "finance.reconcile", "finance.tax.manage",
    "payouts.read", "payouts.process", "team.read",
  ].includes(value);
}

function isDuplicateAuthIdentity(error: unknown) {
  const message = error && typeof error === "object" && "message" in error
    ? String(error.message).toLowerCase()
    : "";
  return message.includes("already") || message.includes("registered") || message.includes("exists");
}

function authFailureCode(error: unknown) {
  return isDuplicateAuthIdentity(error) ? "EMAIL_EXISTS" : "AUTH_CREATE_FAILED";
}

function mapProvisioningError(code: string | null): never {
  if (code === "OWNER_REQUIRED") apiFailure("AUTH_FORBIDDEN", "Chỉ Owner được tạo tài khoản quản trị", 403);
  if (code === "EMAIL_EXISTS") apiFailure("EMAIL_EXISTS", "Gmail này đã có tài khoản. Hãy dùng luồng đề cử tài khoản đã có.", 409);
  if (code === "INVALID_INPUT") apiFailure("VALIDATION", "Thông tin tài khoản quản trị không hợp lệ", 400);
  apiFailure("PROVISIONING_FAILED", "Không thể tạo tài khoản quản trị", 409);
}
