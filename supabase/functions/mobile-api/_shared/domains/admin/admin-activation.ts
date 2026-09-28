import type {
  AdminActivationResponse,
  AdminActivationStatusResponse,
  EdgeAdminOperatorActivationInput,
} from "../contracts/admin-activation.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { asString, asStringArray, nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { AdminControlCapability } from "../contracts/admin-control.ts";

type Row = Record<string, unknown>;
type ActivationAuthClient = DbClient & {
  auth: {
    signInWithPassword(input: unknown): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
    updateUser(input: unknown): Promise<{ error: unknown }>;
  };
};

export async function getAdminActivation(
  ctx: MobileApiContext,
): Promise<AdminActivationStatusResponse> {
  const activationClient = requireActivationServiceClient(ctx);
  const result = await dbQuery<Row[]>(activationClient.rpc("get_admin_operator_activation_status", {
    p_actor_id: ctx.user.id,
  }));
  if (result.error) apiFailure("DB_ERROR", "Không thể kiểm tra trạng thái kích hoạt", 500);
  const activation = result.data?.[0];
  if (!activation) {
    return { required: false, status: null, email_masked: null, full_name: null, capability_count: 0 };
  }
  const status = activationStatus(activation.status);
  const email = nullableString(activation.email);
  return {
    required: status === "pending_password_change",
    status,
    email_masked: email ? maskEmail(email) : null,
    full_name: nullableString(activation.full_name),
    capability_count: asStringArray(activation.capabilities).length,
  };
}

export async function activateAdminOperator(
  ctx: MobileApiContext,
  input: EdgeAdminOperatorActivationInput,
): Promise<AdminActivationResponse> {
  const activationClient = requireActivationServiceClient(ctx);
  const verificationAuthClient = (ctx.userSupabase ?? ctx.supabase) as ActivationAuthClient;
  const provisioning = await dbQuery<Row[]>(activationClient.rpc("get_admin_operator_activation_status", {
    p_actor_id: ctx.user.id,
  }));
  const activation = provisioning.data?.[0];
  const email = nullableString(activation?.email);
  if (provisioning.error || !email) apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu kích hoạt quản trị", 404);
  if (activation?.status !== "pending_password_change") {
    apiFailure("CONFLICT", "Tài khoản không còn chờ đổi mật khẩu", 409);
  }

  const verified = await verificationAuthClient.auth.signInWithPassword({
    email,
    password: input.current_password,
  });
  if (verified.error || verified.data.user?.id !== ctx.user.id) {
    apiFailure("INVALID_PASSWORD", "Mật khẩu ban đầu không đúng", 400);
  }
  const passwordUpdated = await verificationAuthClient.auth.updateUser({
    password: input.new_password,
    user_metadata: { must_change_password: false },
  });
  if (passwordUpdated.error) apiFailure("AUTH_UPDATE_FAILED", "Không thể cập nhật mật khẩu mới", 502);

  const result = await dbQuery<Row[]>(activationClient.rpc("activate_admin_operator_atomic", {
    p_actor_id: ctx.user.id,
  }));
  const row = result.data?.[0];
  if (result.error || !row) {
    console.error("admin_operator_activation_rpc_failed", {
      code: result.error?.code ?? "EMPTY_RESULT",
      message: result.error?.message ?? "activation RPC returned no row",
    });
    apiFailure("ACTIVATION_RETRY_REQUIRED", "Mật khẩu đã đổi nhưng quyền chưa kích hoạt. Hãy đăng nhập lại bằng mật khẩu mới và thử lại.", 503);
  }
  if (row.ok !== true) apiFailure("ACTIVATION_FAILED", "Không thể kích hoạt quyền quản trị", 409);
  return {
    ok: true,
    role: "admin_operator",
    capabilities: asStringArray(row.capabilities_out).filter(isCapability) as AdminControlCapability[],
    activated_at: asString(row.activated_at),
  };
}

function activationStatus(value: unknown): AdminActivationStatusResponse["status"] {
  return value === "pending_password_change" || value === "active" || value === "failed" ? value : null;
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return local && domain ? `${local.slice(0, 2)}***@${domain}` : "***";
}

function isCapability(value: string) {
  return [
    "operations.read", "operations.triage", "workers.read", "workers.review", "workers.manage",
    "transactions.read", "finance.read", "finance.reconcile", "finance.tax.manage",
    "payouts.read", "payouts.process", "team.read", "workers.bonus.manage", "workers.discipline.manage",
  ].includes(value);
}

function requireActivationServiceClient(ctx: MobileApiContext): DbClient {
  if (!ctx.privilegedSupabase) {
    apiFailure(
      "SERVICE_UNAVAILABLE",
      "Không thể kết nối dịch vụ kích hoạt quản trị",
      503,
    );
  }
  return ctx.privilegedSupabase as DbClient;
}
