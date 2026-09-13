import { z } from "zod";
import { asWorkerVerificationStatus, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, normalizeWorkerDistricts } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type {
  WorkerApplicationSubmitInput,
  WorkerRegisterInput,
  WorkerVerificationStatus,
} from "../../../../_shared/domain.ts";
import { AI_SESSION_LIMIT, checkRateLimit } from "../../platform/rate-limit.ts";

export async function registerWorker(
  ctx: MobileApiContext,
  input: WorkerRegisterInput,
) {
  const rateCheck = checkRateLimit(
    `worker_register:${ctx.user.id}`,
    AI_SESSION_LIMIT,
  );
  if (!rateCheck.allowed) {
    apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
  }

  const districts = normalizeWorkerDistricts(input.districts);
  if (!districts) {
    apiFailure("VALIDATION", "Khu vực làm việc không hợp lệ", 400);
  }
  if (
    !isOwnedWorkerVerificationRef(input.cccd_front_url, ctx.user.id, "cccd-front") ||
    !isOwnedWorkerVerificationRef(input.cccd_back_url, ctx.user.id, "cccd-back") ||
    !isOwnedWorkerVerificationRef(input.selfie_url, ctx.user.id, "selfie")
  ) {
    apiFailure(
      "INVALID_MEDIA_REF",
      "File xác minh không thuộc tài khoản hiện tại",
      400,
    );
  }
  const result = await dbQuery<Array<WorkerRegistrationRpcRow>>(
    db(ctx).rpc("submit_worker_registration_atomic", {
      p_actor_id: ctx.user.id,
      p_worker_id: ctx.user.id,
      p_legal_name: input.legal_name,
      p_date_of_birth: input.date_of_birth,
      p_gender: input.gender ?? null,
      p_service_types: input.service_types,
      p_years_experience: input.years_experience,
      p_districts: districts,
      p_home_lat: input.home_lat ?? null,
      p_home_lng: input.home_lng ?? null,
      p_service_radius_km: input.service_radius_km ?? 8,
      p_problem_specializations: input.problem_specializations ?? [],
      p_cccd_front_url: input.cccd_front_url,
      p_cccd_back_url: input.cccd_back_url,
      p_selfie_url: input.selfie_url,
      p_bank_account: input.bank_account,
      p_bank_name: input.bank_name,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) {
    console.warn("mobile-api worker registration RPC failed", {
      userId: ctx.user.id,
      errorCode: result.error?.code,
    });
    apiFailure("DB_ERROR", "Không thể lưu hồ sơ", 500);
  }
  if (!row.ok) mapWorkerRegistrationError(nullableString(row.error_code));
  if (
    !row.worker_id_out || !row.verification_status_out ||
    !row.submitted_at_ts
  ) {
    apiFailure("DB_ERROR", "Không thể lưu hồ sơ", 500);
  }
  return {
    worker_id: row.worker_id_out,
    verification_status: asWorkerVerificationStatus(
      row.verification_status_out,
    ),
    submitted_at: row.submitted_at_ts,
  };
}

function isOwnedWorkerVerificationRef(
  value: string,
  workerId: string,
  folder: "cccd-front" | "cccd-back" | "selfie",
) {
  const prefix = `supabase://worker-verification/${workerId}/${folder}/`;
  if (!value.startsWith(prefix)) return false;
  const fileName = value.slice(prefix.length);
  return fileName.length > 0 && fileName.length <= 180 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName);
}

type WorkerRegistrationRpcRow = {
  ok: boolean;
  error_code: string | null;
  worker_id_out: string | null;
  verification_status_out: WorkerVerificationStatus | null;
  submitted_at_ts: string | null;
  idempotent_out: boolean;
};

function mapWorkerRegistrationError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ", 404);
  }
  if (errorCode === "WRONG_ROLE") {
    apiFailure("WRONG_ROLE", "Tài khoản này không phải tài khoản thợ", 403);
  }
  if (errorCode === "NOT_OWNER") {
    apiFailure("NOT_OWNER", "Bạn chỉ có thể gửi hồ sơ của chính mình", 403);
  }
  if (errorCode === "ALREADY_FINALIZED") {
    apiFailure(
      "ALREADY_FINALIZED",
      "Hồ sơ đang được xem xét, đã được duyệt hoặc bị khóa. Liên hệ hỗ trợ để cập nhật.",
      409,
    );
  }
  if (errorCode === "INVALID_INPUT") {
    apiFailure("VALIDATION", "Dữ liệu hồ sơ không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể lưu hồ sơ", 500);
}

export async function submitWorkerApplication(
  ctx: MobileApiContext,
  input: WorkerApplicationSubmitInput,
) {
  assertWorkerEmailIdentity(ctx, input.contact);
  const result = await dbQuery<Array<WorkerApplicationRpcRow>>(
    db(ctx).rpc("submit_worker_application_atomic", {
      p_actor_id: ctx.user.id,
      p_contact_suffix: workerApplicationContactSuffix(input.contact),
      p_language: input.language,
      p_source: input.source,
      p_client_request_id: input.client_request_id ?? null,
      p_revision_of_application_id: input.revision_of_application_id ?? null,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row || result.data?.length !== 1) {
    apiFailure("DB_ERROR", "Không thể gửi hồ sơ ứng tuyển", 500);
  }
  if (row.ok === false) {
    const errorCode = nullableString(row.error_code);
    if (errorCode === "INVALID_INPUT") {
      apiFailure("VALIDATION", "Dữ liệu hồ sơ ứng tuyển không hợp lệ", 400);
    }
    if (errorCode === "PROFILE_NOT_FOUND") {
      apiFailure("NOT_FOUND", "Không tìm thấy tài khoản", 404);
    }
    if (errorCode === "INVALID_ROLE") {
      apiFailure("FORBIDDEN", "Vai trò này không thể gửi hồ sơ thợ", 403);
    }
    apiFailure("DB_ERROR", "Không thể gửi hồ sơ ứng tuyển", 500);
  }
  const parsed = workerApplicationReceiptSchema.safeParse(row);
  if (!parsed.success || (parsed.data.application_id === null && ctx.role !== "worker")) {
    apiFailure("DB_ERROR", "Chưa thể xác nhận kết quả gửi hồ sơ. Vui lòng kiểm tra lại trạng thái hồ sơ.", 500);
  }
  const receipt = parsed.data;
  return {
    application_id: receipt.application_id,
    status: receipt.status_out,
    submitted_at: receipt.submitted_at,
    decided_at: receipt.decided_at,
    reason: receipt.reason_out,
    can_submit: receipt.can_submit,
    can_resume: receipt.can_resume,
    idempotent: receipt.idempotent_out,
  };
}

const workerApplicationReceiptSchema = z.object({
  ok: z.literal(true),
  error_code: z.null(),
  application_id: z.string().uuid().nullable(),
  status_out: z.enum(["pending_review", "changes_requested", "rejected", "approved"]),
  submitted_at: z.string().datetime({ offset: true }).nullable(),
  decided_at: z.string().datetime({ offset: true }).nullable(),
  reason_out: z.string().nullable(),
  can_submit: z.boolean(),
  can_resume: z.boolean(),
  idempotent_out: z.boolean(),
}).refine((receipt) => {
  const revisable = receipt.status_out === "changes_requested";
  if (receipt.can_submit !== revisable || receipt.can_resume !== revisable) return false;
  if (!receipt.idempotent_out && receipt.status_out !== "pending_review") return false;
  if (receipt.application_id !== null) return receipt.submitted_at !== null;
  // Legacy approved Workers may predate the application queue; no new application is claimed.
  return receipt.status_out === "approved" && receipt.idempotent_out &&
    receipt.submitted_at === null && receipt.decided_at === null && receipt.reason_out === null;
});

function assertWorkerEmailIdentity(ctx: MobileApiContext, contact: string) {
  const accountEmail = ctx.user.email?.trim().toLowerCase();
  if (ctx.user.authProvider !== "email" || !accountEmail) {
    apiFailure(
      "WORKER_EMAIL_PASSWORD_REQUIRED",
      "Tài khoản thợ chỉ hỗ trợ thư điện tử và mật khẩu",
      403,
    );
  }
  if (contact.trim().toLowerCase() !== accountEmail) {
    apiFailure(
      "WORKER_EMAIL_MISMATCH",
      "Thư điện tử ứng tuyển phải trùng với tài khoản đang đăng nhập",
      400,
    );
  }
}

function workerApplicationContactSuffix(contact: string) {
  const localPart = contact.trim().toLowerCase().split("@")[0] ?? "";
  return localPart.slice(-2);
}

type WorkerApplicationRpcRow = {
  ok?: unknown;
  error_code?: unknown;
  application_id?: unknown;
  status_out?: unknown;
  submitted_at?: unknown;
  decided_at?: unknown;
  reason_out?: unknown;
  can_submit?: unknown;
  can_resume?: unknown;
  idempotent_out?: unknown;
}
