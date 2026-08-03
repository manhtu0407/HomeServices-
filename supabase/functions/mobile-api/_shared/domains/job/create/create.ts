// Job-create orchestration: validate and sequence durable creation, Kael analysis, autonomy, matching, and notification.

import { logJobEvent } from "../../../platform/audit.ts";
import { insertUserNotification } from "../../notification/notifications.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import { db } from "../../../platform/db.ts";
import { AI_SESSION_LIMIT, checkRateLimit } from "../../../platform/rate-limit.ts";
import { HCMC_SCHEDULE_VALIDATION_MESSAGE, validateFutureHcmcSchedule } from "../../../platform/scheduling.ts";
import type { EdgeAiSecrets } from "../../../kael/index.ts";
import { normalizeServiceAreaDistrict, type JobCreateInput, type JobStatus } from "../../../../../_shared/domain.ts";
import { analyzeJobOrFail } from "./analyze.ts";
import { prepareJobAutonomyOrFail } from "./autonomy.ts";
import { persistAndStartJobBroadcast } from "./broadcast-start.ts";
import {
  buildExistingJobCreateResponse,
  findExistingJobByClientRequest,
} from "./idempotency.ts";
import { insertJobShell } from "./insert.ts";

export async function createJob(
  ctx: MobileApiContext,
  input: JobCreateInput,
  secrets: EdgeAiSecrets,
) {
  const scheduleValidation = validateFutureHcmcSchedule(input.scheduled_at);
  if (scheduleValidation !== null && !input.client_request_id) {
    apiFailure("VALIDATION", HCMC_SCHEDULE_VALIDATION_MESSAGE, 400);
  }
  const client = db(ctx);
  const canonicalDistrict = normalizeServiceAreaDistrict(input.address_district);
  if (!canonicalDistrict) {
    apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  }
  const requestId = crypto.randomUUID();

  if (input.client_request_id) {
    const existingJobId = await findExistingJobByClientRequest(
      client,
      ctx.user.id,
      input.client_request_id,
    );
    if (existingJobId) {
      return buildExistingJobCreateResponse(ctx, existingJobId);
    }
    if (scheduleValidation !== null) {
      apiFailure("VALIDATION", HCMC_SCHEDULE_VALIDATION_MESSAGE, 400);
    }
  }

  const rateCheck = checkRateLimit("job_create:" + ctx.user.id, AI_SESSION_LIMIT);
  if (!rateCheck.allowed) {
    apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
  }

  const shell = await insertJobShell({
    client,
    ctx,
    request: input,
    canonicalDistrict,
    secrets,
  });
  if (shell.kind === "duplicate_client_request") {
    const recoveredId = await findExistingJobByClientRequest(
      client,
      ctx.user.id,
      input.client_request_id!,
    );
    if (recoveredId) {
      return buildExistingJobCreateResponse(ctx, recoveredId);
    }
    apiFailure("DB_ERROR", "Không thể tạo yêu cầu", 500);
  }

  const pipeline = await analyzeJobOrFail({
    client,
    ctx,
    request: input,
    secrets,
    jobId: shell.jobId,
    canonicalDistrict,
    requestId,
  });
  const preparation = await prepareJobAutonomyOrFail({
    client,
    ctx,
    request: input,
    pipeline,
    jobId: shell.jobId,
    canonicalDistrict,
  });
  const broadcast = await persistAndStartJobBroadcast({
    client,
    ctx,
    request: input,
    pipeline,
    preparation,
    jobId: shell.jobId,
    canonicalDistrict,
  });

  await logJobEvent(
    client,
    shell.jobId,
    "kael_started_matching",
    ctx,
    "analyzing",
    "broadcasting",
    {
      broadcast_sent: broadcast.success,
      ...(broadcast.success
        ? { batch_id: broadcast.batchId, worker_count: broadcast.broadcastCount }
        : { reason: broadcast.reason }),
      autonomy_decision: preparation.autonomyDecision,
    },
  );
  await insertUserNotification(client, {
    userId: ctx.user.id,
    jobId: shell.jobId,
    eventType: "estimate_ready",
    title: "Kael đang điều phối",
    body: broadcast.success
      ? "Kael đã chốt ước tính và đang gửi yêu cầu đến thợ phù hợp."
      : "Kael đã chốt ước tính và sẽ tiếp tục theo dõi thợ phù hợp.",
    metadata: {
      service_type: input.service_type,
      price_min: preparation.estimate.price_min,
      price_max: preparation.estimate.price_max,
      autonomy_decision_event: preparation.autonomyDecision.resulting_event,
      broadcast_sent: broadcast.success,
    },
  });

  return {
    job_id: shell.jobId,
    ...(shell.displayCode ? { display_code: shell.displayCode } : {}),
    status: "broadcasting" as JobStatus,
    estimate: preparation.estimate,
    estimate_card_v3: preparation.estimateCardV3,
    final_price: preparation.lockedFinalPrice,
    fallback_used: pipeline.fallbackUsed,
    broadcast_sent: broadcast.success,
    message: broadcast.success
      ? "Đã gửi yêu cầu đến " + broadcast.broadcastCount + " thợ. Đang chờ phản hồi."
      : broadcast.reason,
  };
}
