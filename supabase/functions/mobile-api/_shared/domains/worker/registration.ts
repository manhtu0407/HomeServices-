import { asString, asWorkerVerificationStatus, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, normalizeWorkerDistricts } from "../../platform/db.ts";
import { compactMetadata } from "../../platform/domain-utils.ts";
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
  const now = new Date().toISOString();
  const client = db(ctx);
  if (input.client_request_id) {
    const existing = await findExistingWorkerApplication(
      client,
      ctx.user.id,
      input.source,
      input.client_request_id,
    );
    if (existing) return serializeWorkerApplication(existing, now);
  }

  const result = await dbQuery<WorkerApplicationQueueRow>(
    client
      .from("kael_admin_queue")
      .insert({
        actor_id: ctx.user.id,
        actor_role: ctx.role,
        escalation_level: "soft",
        priority: "medium",
        queue_type: "worker_application_review",
        reason_code: "worker_application_submitted",
        response_summary: "worker_application_submitted",
        safe_metadata: compactMetadata({
          ...workerApplicationContactMetadata(input.contact),
          actor_id: ctx.user.id,
          client_request_id: input.client_request_id ?? null,
          language: input.language,
          source: input.source,
        }),
        status: "open",
      })
      .select(WORKER_APPLICATION_QUEUE_SELECT)
      .single(),
  );
  if (result.error?.code === "23505" && input.client_request_id) {
    const existing = await findExistingWorkerApplication(
      client,
      ctx.user.id,
      input.source,
      input.client_request_id,
    );
    if (existing) return serializeWorkerApplication(existing, now);
  }
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể gửi hồ sơ ứng tuyển", 500);
  }
  return serializeWorkerApplication(result.data, now);
}

const WORKER_APPLICATION_QUEUE_SELECT = "id, status, created_at, safe_metadata";

type WorkerApplicationQueueRow = {
  id?: unknown;
  status?: unknown;
  created_at?: unknown;
  safe_metadata?: unknown;
};

async function findExistingWorkerApplication(
  client: ReturnType<typeof db>,
  actorId: string,
  source: WorkerApplicationSubmitInput["source"],
  clientRequestId: string,
) {
  const existing = await dbQuery<WorkerApplicationQueueRow>(
    client
      .from("kael_admin_queue")
      .select(WORKER_APPLICATION_QUEUE_SELECT)
      .eq("actor_id", actorId)
      .eq("queue_type", "worker_application_review")
      .eq("reason_code", "worker_application_submitted")
      .eq("safe_metadata->>source", source)
      .eq("safe_metadata->>client_request_id", clientRequestId)
      .maybeSingle(),
  );
  if (existing.error) {
    apiFailure("DB_ERROR", "Không thể tải hồ sơ ứng tuyển", 500);
  }
  return existing.data ?? null;
}

function serializeWorkerApplication(
  row: WorkerApplicationQueueRow,
  fallbackSubmittedAt: string,
) {
  return {
    application_id: asString(row.id),
    status: "open" as const,
    submitted_at: nullableString(row.created_at) ?? fallbackSubmittedAt,
  };
}

function workerApplicationContactMetadata(contact: string) {
  const normalized = contact.trim().toLowerCase();
  const digits = normalized.replace(/\D/g, "");
  if (digits.length >= 9) {
    return {
      contact_suffix: digits.slice(-4),
      contact_type: "phone",
    };
  }
  const localPart = normalized.split("@")[0] ?? normalized;
  return {
    contact_suffix: localPart.slice(-2),
    contact_type: "email",
  };
}
