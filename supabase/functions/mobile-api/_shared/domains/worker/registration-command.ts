import {
  workerRegistrationCommandReceiptSchema,
  type EdgeWorkerRegistrationCommandInput as WorkerRegistrationCommandInput,
  type EdgeWorkerRegistrationCommandResult as WorkerRegistrationCommandResult,
} from "../../../../_shared/contracts/worker.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { normalizeIsoTimestamp } from "../../platform/iso-timestamp.ts";
import { AI_SESSION_LIMIT, checkRateLimit } from "../../platform/rate-limit.ts";

export async function submitWorkerRegistrationCommand(
  ctx: MobileApiContext,
  input: WorkerRegistrationCommandInput,
): Promise<WorkerRegistrationCommandResult> {
  if (normalizeIsoTimestamp(input.expected_draft_updated_at) === null) {
    apiFailure("VALIDATION", "Phiên bản hồ sơ không hợp lệ", 400);
  }
  if (!checkRateLimit(`worker_register:${ctx.user.id}`, AI_SESSION_LIMIT).allowed) {
    apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
  }
  const result = await dbQuery<unknown>(db(ctx).rpc("submit_worker_registration_draft_atomic", {
    p_actor_id: ctx.user.id,
    p_worker_id: ctx.user.id,
    p_client_request_id: input.client_request_id,
    p_expected_draft_updated_at: input.expected_draft_updated_at,
  }));
  if (result.error) {
    if (result.error.code === "23505") apiFailure("IDEMPOTENCY_CONFLICT", "Mã gửi hồ sơ đã dùng cho phiên bản khác", 409);
    if (result.error.code === "42501") apiFailure("FORBIDDEN", "Tài khoản chưa được phép nộp hồ sơ thợ", 403);
    apiFailure("DB_ERROR", "Chưa thể xác nhận kết quả gửi hồ sơ", 500);
  }
  return readReceipt(result.data, ctx.user.id, input.client_request_id, input.expected_draft_updated_at);
}

export async function getWorkerRegistrationCommand(
  ctx: MobileApiContext,
  clientRequestId: string,
): Promise<WorkerRegistrationCommandResult> {
  const result = await dbQuery<unknown>(db(ctx).rpc("get_worker_registration_command", {
    p_actor_id: ctx.user.id,
    p_client_request_id: clientRequestId,
  }));
  if (result.error) apiFailure("DB_ERROR", "Chưa thể đối soát kết quả gửi hồ sơ", 500);
  if (Array.isArray(result.data) && result.data.length === 0) {
    // Absence can race an in-flight transaction and does not prove a failed submission.
    return { state: "unknown", client_request_id: clientRequestId };
  }
  return readReceipt(result.data, ctx.user.id, clientRequestId);
}

function readReceipt(
  data: unknown,
  workerId: string,
  clientRequestId: string,
  expectedRevision?: string,
): WorkerRegistrationCommandResult {
  const parsed = workerRegistrationCommandReceiptSchema.safeParse(
    Array.isArray(data) && data.length === 1 ? data[0] : null,
  );
  if (!parsed.success) apiFailure("DB_ERROR", "Biên nhận gửi hồ sơ không hợp lệ", 500);
  const receipt = parsed.data;
  if (receipt.worker_id !== workerId || receipt.client_request_id !== clientRequestId ||
    [receipt.draft_updated_at, receipt.recorded_at, receipt.submitted_at]
      .some(value => value !== null && normalizeIsoTimestamp(value) === null) ||
    (expectedRevision !== undefined && !sameRevision(receipt.draft_updated_at, expectedRevision))) {
    apiFailure("DB_ERROR", "Không thể xác minh biên nhận gửi hồ sơ", 500);
  }
  return { state: "resolved", receipt };
}

function sameRevision(actual: string, expected: string): boolean {
  // Date.parse truncates sub-millisecond precision; compare the remaining digits separately.
  const remainder = (value: string) => (value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3);
  return Date.parse(actual) === Date.parse(expected) && remainder(actual) === remainder(expected);
}
