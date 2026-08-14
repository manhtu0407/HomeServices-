import { type JobStatus } from "../../../../_shared/domain.ts";
import { asServiceType, nullableNumber, nullableString } from "../../platform/coercions.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { logJobEvent } from "../../platform/audit.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { buildWorkerBriefOutput, type KaelAutonomyDecision } from "../../kael/index.ts";
import { validateKaelAutonomyTransition, validateWorkflowTransition } from "../../workflow-orchestrator.ts";
import { hasActiveBroadcast, runWithBroadcastRetryLease } from "./broadcasts.ts";
import { startGeneralBroadcast, startSavedWorkerBroadcast } from "./matching-preference-fallback.ts";
import { getMatchingState } from "./matching-preference-read.ts";
import {
  logMatchingEvent,
  requireMatchingDistrict,
  type MatchingPreferenceInput,
} from "./matching-preference-shared.ts";

export async function beginMatchingPreferencePrompt(
  ctx: MobileApiContext,
  jobId: string,
  options: { autonomyDecision?: KaelAutonomyDecision } = {},
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id, service_type, address_district, kael_problem_identified, kael_price_max, final_price",
  });
  requireMatchingDistrict(job.address_district);
  if (job.status !== "awaiting_customer_confirm") {
    apiFailure("INVALID_STATUS", "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.", 409);
  }
  const confirmedPriceCap = nullableNumber(job.kael_price_max);
  if (confirmedPriceCap === null || confirmedPriceCap <= 0) {
    apiFailure("KAEL_PRICE_MISSING", "Kael chưa chốt được giá tạm tính nên chưa thể tìm thợ", 409);
  }
  const transition = options.autonomyDecision
    ? validateKaelAutonomyTransition({
      decision: options.autonomyDecision,
      from: job.status as JobStatus,
      to: "broadcasting",
    })
    : validateWorkflowTransition({
      event: "customer_confirmed_ticket",
      from: job.status as JobStatus,
      to: "broadcasting",
    });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
  const workerBriefCore = buildWorkerBriefOutput({
    stage: "core",
    serviceType: asServiceType(job.service_type),
    problemSummary: nullableString(job.kael_problem_identified) ?? "Yêu cầu cần thợ kiểm tra",
    district: nullableString(job.address_district),
    estimatedEarningMin: null,
    estimatedEarningMax: null,
  });
  const started = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("begin_job_matching_preference_atomic", {
      p_customer_id: ctx.user.id,
      p_final_price: confirmedPriceCap,
      p_job_id: jobId,
      p_worker_brief_core: workerBriefCore,
    }),
  );
  if (started.error) apiFailure("DB_ERROR", "Không thể bắt đầu tìm thợ", 500);
  const startedRow = started.data?.[0];
  if (!startedRow || typeof startedRow.ok !== "boolean") {
    apiFailure("DB_ERROR", "Phản hồi bắt đầu tìm thợ không hợp lệ", 500);
  }
  if (!startedRow.ok) {
    const errorCode = nullableString(startedRow.error_code);
    if (errorCode === "NOT_FOUND" || errorCode === "NOT_OWNER") {
      apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
    }
    apiFailure("STATUS_CHANGED", "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.", 409);
  }
  await logJobEvent(
    client,
    jobId,
    "kael_started_matching",
    ctx,
    "awaiting_customer_confirm",
    "broadcasting",
    options.autonomyDecision ? { autonomy_decision: options.autonomyDecision } : {},
  );
  await logMatchingEvent(client, jobId, "matching_preference_pending");
  return requireMatchingState(client, jobId, "broadcasting");
}

export async function ensureGeneralMatchingPreference(
  client: DbClient,
  jobId: string,
  customerId: string,
) {
  const inserted = await dbQuery(
    client.from("job_matching_preferences").upsert({
      job_id: jobId,
      customer_id: customerId,
      strategy: "general",
      preferred_worker_id: null,
      auto_general: true,
    }, { onConflict: "job_id", ignoreDuplicates: true }),
  );
  if (inserted.error) apiFailure("DB_ERROR", "Không thể lưu quyết định tìm thợ", 500);
}

export async function isMatchingPreferencePending(client: DbClient, jobId: string) {
  const result = await dbQuery<Record<string, unknown>>(
    client.from("job_matching_preferences")
      .select("strategy")
      .eq("job_id", jobId)
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải quyết định tìm thợ", 500);
  }
  return nullableString(result.data?.strategy) === "pending";
}

export async function setJobMatchingPreference(
  ctx: MobileApiContext,
  jobId: string,
  input: MatchingPreferenceInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id, service_type, address_district",
  });
  if (job.status !== "broadcasting") {
    apiFailure("INVALID_STATUS", "Yêu cầu này chưa sẵn sàng để chọn cách tìm thợ", 409);
  }
  const selected = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("set_job_matching_preference_atomic", {
      p_job_id: jobId,
      p_customer_id: ctx.user.id,
      p_strategy: input.mode,
      p_preferred_worker_id: input.worker_id ?? null,
      p_auto_general: input.auto_general,
      p_client_request_id: input.client_request_id,
    }),
  );
  if (selected.error) apiFailure("DB_ERROR", "Không thể lưu quyết định tìm thợ", 500);
  const row = selected.data?.[0];
  if (!row || typeof row.ok !== "boolean") {
    apiFailure("DB_ERROR", "Phản hồi quyết định tìm thợ không hợp lệ", 500);
  }
  if (!row.ok) mapMatchingPreferenceError(nullableString(row.error_code));
  const result = await runWithBroadcastRetryLease(client, jobId, ctx.user.id, async () => {
    if (await hasActiveBroadcast(client, jobId, new Date().toISOString())) {
      return { broadcast_sent: true, message: "Kael đang chờ phản hồi từ nhóm thợ hiện tại." };
    }
    if (input.mode === "general") {
      return startGeneralBroadcast(client, job, "matching_general_selected");
    }
    return startSavedWorkerBroadcast(client, job, input.worker_id ?? "", input.auto_general);
  });
  if (!result.acquired) {
    return matchingPreferenceResponse(
      client,
      jobId,
      job.status as JobStatus,
      false,
      "Kael đang đồng bộ quyết định tìm thợ. Vui lòng tải lại sau.",
    );
  }
  return matchingPreferenceResponse(
    client,
    jobId,
    job.status as JobStatus,
    result.value.broadcast_sent,
    result.value.message,
  );
}

async function matchingPreferenceResponse(
  client: DbClient,
  jobId: string,
  status: JobStatus,
  broadcastSent: boolean,
  message: string,
) {
  return {
    job_id: jobId,
    status,
    broadcast_sent: broadcastSent,
    worker: null,
    message,
    matching_state: await requireMatchingState(client, jobId, status),
  };
}

async function requireMatchingState(client: DbClient, jobId: string, status: string) {
  const matchingState = await getMatchingState(client, jobId, status);
  if (!matchingState) {
    apiFailure("DB_ERROR", "Không thể tải biên nhận tìm thợ", 500);
  }
  return matchingState;
}

function mapMatchingPreferenceError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND" || errorCode === "NOT_OWNER") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "FAVORITE_NOT_FOUND" || errorCode === "INVALID_TARGET") {
    apiFailure("WORKER_NOT_ELIGIBLE", "Thợ đã lưu không thuộc danh sách của bạn hoặc không còn phù hợp.", 409);
  }
  if (errorCode === "INVALID_STATUS" || errorCode === "PREFERENCE_LOCKED" || errorCode === "PREFERENCE_REQUIRED") {
    apiFailure("STATUS_CHANGED", "Quyết định tìm thợ đã thay đổi. Vui lòng tải lại.", 409);
  }
  apiFailure("DB_ERROR", "Không thể lưu quyết định tìm thợ", 500);
}
