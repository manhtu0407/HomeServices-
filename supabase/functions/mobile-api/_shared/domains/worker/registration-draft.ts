import type { EdgeWorkerRegistrationDraftInput } from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { db, dbQuery, normalizeWorkerDistricts } from "../../platform/db.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { normalizeIsoTimestamp } from "../../platform/iso-timestamp.ts";

export async function saveWorkerRegistrationDraft(
  ctx: MobileApiContext,
  input: EdgeWorkerRegistrationDraftInput,
) {
  const draft = { ...input } as Record<string, unknown>;
  if (input.districts) {
    const districts = normalizeWorkerDistricts(input.districts);
    if (!districts) apiFailure("VALIDATION", "Khu vực làm việc không hợp lệ", 400);
    draft.districts = districts;
  }
  for (const [key, folder] of [
    ["cccd_front_url", "cccd-front"],
    ["cccd_back_url", "cccd-back"],
    ["selfie_url", "selfie"],
  ] as const) {
    const value = input[key];
    if (value && !isOwnedVerificationRef(value, ctx.user.id, folder)) {
      apiFailure("INVALID_MEDIA_REF", "File xác minh không thuộc tài khoản hiện tại", 400);
    }
  }

  const result = await dbQuery<Array<WorkerDraftRpcRow>>(
    db(ctx).rpc("save_worker_registration_draft_atomic", {
      p_actor_id: ctx.user.id,
      p_worker_id: ctx.user.id,
      p_draft: draft,
    }),
  );
  const row = Array.isArray(result.data) && result.data.length === 1 ? result.data[0] : null;
  if (result.error || !row || typeof row.ok !== "boolean" || row.worker_id !== ctx.user.id) {
    console.warn("mobile-api worker draft RPC failed", {
      userId: ctx.user.id,
      errorCode: result.error?.code,
    });
    apiFailure("DB_ERROR", "Không thể tự lưu hồ sơ", 500);
  }
  if (!row.ok) {
    const code = row.error_code;
    if (code === "WORKER_ACCESS_REQUIRED") apiFailure("FORBIDDEN", "Tài khoản chưa được duyệt vào khu vực thợ", 403);
    if (code === "DRAFT_NOT_EDITABLE") apiFailure("CONFLICT", "Hồ sơ hiện không thể chỉnh sửa", 409);
    if (code === "INVALID_INPUT") apiFailure("VALIDATION", "Dữ liệu hồ sơ không hợp lệ", 400);
    apiFailure("DB_ERROR", "Không thể tự lưu hồ sơ", 500);
  }
  if (row.error_code !== null || row.verification_status !== "draft" ||
    typeof row.updated_at !== "string" || normalizeIsoTimestamp(row.updated_at) === null) {
    apiFailure("DB_ERROR", "Không thể xác nhận việc lưu hồ sơ", 500);
  }
  return {
    worker_id: row.worker_id,
    verification_status: "draft" as const,
    updated_at: row.updated_at,
  };
}

function isOwnedVerificationRef(value: string, workerId: string, folder: string) {
  const prefix = `supabase://worker-verification/${workerId}/${folder}/`;
  const fileName = value.startsWith(prefix) ? value.slice(prefix.length) : "";
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(fileName);
}

type WorkerDraftRpcRow = {
  ok?: unknown;
  error_code?: unknown;
  worker_id?: unknown;
  verification_status?: unknown;
  updated_at?: unknown;
};
