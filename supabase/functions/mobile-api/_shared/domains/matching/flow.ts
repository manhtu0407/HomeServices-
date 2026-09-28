// Edge service matching/broadcast domain (C4 6a, services/* split): the broadcast lifecycle —
// customer confirm-search -> createBroadcasts (with retry-lease + rollback), worker proposal,
// customer candidate decision, and worker decline. Address release starts only after confirmation.

import { asServiceType, asString, nullableNumber, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, workflowDb } from "../../platform/db.ts";
import { logJobEvent } from "../../platform/audit.ts";
import {
  createBroadcasts,
  expireStaleBroadcasts,
  failBroadcastRetryClaim,
  hasActiveBroadcast,
  runWithBroadcastRetryLease,
} from "./broadcasts.ts";
import { insertUserNotification } from "../notification/notifications.ts";
import {
  restoreKaelOfferAfterBroadcastFailure,
  rollbackFailedBroadcastStart,
} from "./flow-rollback.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { validateKaelAutonomyTransition, validateWorkflowTransition } from "../../workflow-orchestrator.ts";
import { buildWorkerBriefOutput, type KaelAutonomyDecision } from "../../kael/index.ts";
import { normalizeServiceAreaDistrict } from "../../../../_shared/domain.ts";
import type { JobStatus, ServiceType } from "../../../../_shared/domain.ts";
import { ensureGeneralMatchingPreference, getMatchingState, isMatchingPreferencePending } from "./matching-preference.ts";

type ConfirmSearchOptions = {
  autonomyDecision?: KaelAutonomyDecision;
  kaelSessionId?: string;
};

export { acceptBroadcast } from "./accept.ts";
export { declineBroadcast } from "./decline.ts";
export { rollbackFailedBroadcastStart } from "./flow-rollback.ts";

export async function confirmSearch(
  ctx: MobileApiContext,
  jobId: string,
  options: ConfirmSearchOptions = {},
) {
  const client = db(ctx);
  const now = new Date().toISOString();
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select:
      "id, status, customer_id, worker_id, service_type, address_district, kael_problem_identified, kael_price_min, kael_price_max, final_price, quote_mode",
  });
  if (
    job.status === "broadcasting" &&
    await isMatchingPreferencePending(client, jobId)
  ) {
    apiFailure(
      "MATCHING_PREFERENCE_PENDING",
      "B\u1ea1n c\u1ea7n ch\u1ecdn c\u00e1ch t\u00ecm th\u1ee3 tr\u01b0\u1edbc khi Kael g\u1eedi y\u00eau c\u1ea7u.",
      409,
    );
  }
  const broadcastContext = await prepareSearchBroadcast({
    client,
    ctx,
    job,
    jobId,
    now,
    options,
  });
  await ensureGeneralMatchingPreference(client, jobId, ctx.user.id);
  const result = await executeSearchBroadcast({
    client,
    ctx,
    job,
    jobId,
    options,
    ...broadcastContext,
  });
  return {
    ...result,
    matching_state: await getMatchingState(client, jobId, result.status, workflowDb(ctx)),
  };
}

async function prepareSearchBroadcast(input: {
  client: ReturnType<typeof db>;
  ctx: MobileApiContext;
  job: Record<string, unknown>;
  jobId: string;
  now: string;
  options: ConfirmSearchOptions;
}) {
  const retryingExistingSearch = input.job.status === "broadcasting";
  const autonomyDecision = input.options.autonomyDecision;
  const confirmedPriceCap = nullableNumber(input.job.kael_price_max);
  const district = normalizeServiceAreaDistrict(
    nullableString(input.job.address_district) ?? "",
  );
  if (!district) apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  if (retryingExistingSearch) {
    await expireStaleBroadcasts(input.client, input.jobId, input.now);
    if (await hasActiveBroadcast(input.client, input.jobId, input.now)) {
      apiFailure("BROADCAST_ACTIVE", "Yêu cầu đang được gửi đến thợ. Vui lòng chờ phản hồi hiện tại.", 409);
    }
    return { retryingExistingSearch, rollbackStatus: null, district };
  }
  const permitsUnpricedMatching = input.job.quote_mode === "rfq" ||
    input.job.quote_mode === "inspection_only";
  if (!permitsUnpricedMatching && (confirmedPriceCap === null || confirmedPriceCap <= 0)) {
    apiFailure("KAEL_PRICE_MISSING", "Kael chưa chốt được giá tạm tính nên chưa thể tìm thợ", 409);
  }
  const transition = autonomyDecision
    ? validateKaelAutonomyTransition({
      decision: autonomyDecision,
      from: input.job.status as JobStatus,
      to: "broadcasting",
    })
    : validateWorkflowTransition({
      event: "customer_confirmed_ticket",
      from: input.job.status as JobStatus,
      to: "broadcasting",
    });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
  const workerBriefCore = buildWorkerBriefOutput({
    stage: "core",
    serviceType: asServiceType(input.job.service_type),
    problemSummary: nullableString(input.job.kael_problem_identified) ?? "Yêu cầu cần thợ kiểm tra",
    district: nullableString(input.job.address_district),
    estimatedEarningMin: null,
    estimatedEarningMax: null,
  });
  const updated = await dbQuery<{ id: string }>(
    input.client
      .from("jobs")
      .update({
        status: "broadcasting",
        broadcast_at: input.now,
        confirmed_search_at: input.now,
        kael_worker_brief_core: workerBriefCore,
      })
      .eq("id", input.jobId)
      .eq("customer_id", input.ctx.user.id)
      .eq("status", input.job.status)
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) apiFailure("DB_ERROR", "Không thể bắt đầu tìm thợ", 500);
  if (!updated.data) apiFailure("STATUS_CHANGED", "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.", 409);
  await logJobEvent(
    input.client,
    input.jobId,
    autonomyDecision ? "kael_started_matching" : "customer_confirmed_search",
    input.ctx,
    input.job.status as JobStatus,
    "broadcasting",
    autonomyDecision ? { autonomy_decision: autonomyDecision } : {},
  );
  return { retryingExistingSearch, rollbackStatus: input.job.status as JobStatus, district };
}

async function executeSearchBroadcast(input: {
  client: ReturnType<typeof db>;
  ctx: MobileApiContext;
  job: Record<string, unknown>;
  jobId: string;
  options: ConfirmSearchOptions;
  retryingExistingSearch: boolean;
  rollbackStatus: JobStatus | null;
  district: string;
}) {
  const autonomyDecision = input.options.autonomyDecision;
  const sendBroadcast = async () => {
    if (input.retryingExistingSearch) {
      await logJobEvent(
        input.client,
        input.jobId,
        "customer_retried_search",
        input.ctx,
        "broadcasting",
        "broadcasting",
      );
    }
    const broadcast = await createBroadcasts(
      workflowDb(input.ctx),
      input.jobId,
      input.job.service_type as ServiceType,
      input.district,
    );
    if (!broadcast.success) {
      if (broadcast.reasonCode === "DB_ERROR") {
        if (input.rollbackStatus) {
          const rolledBack = await rollbackFailedBroadcastStart(
            input.client,
            input.jobId,
            input.ctx.user.id,
            input.rollbackStatus,
          );
          if (!rolledBack) {
            apiFailure(
              "DB_ERROR",
              "Không thể khôi phục yêu cầu sau lỗi gửi thợ",
              500,
            );
          }
          if (
            input.options.kaelSessionId &&
            !(await restoreKaelOfferAfterBroadcastFailure(
              input.client,
              input.options.kaelSessionId,
              input.jobId,
              input.ctx.user.id,
            ))
          ) {
            apiFailure(
              "DB_ERROR",
              "Kh\u00f4ng th\u1ec3 kh\u00f4i ph\u1ee5c phi\u00ean Kael sau l\u1ed7i g\u1eedi th\u1ee3",
              500,
            );
          }
          await logJobEvent(
            input.client,
            input.jobId,
            "broadcast_start_failed",
            input.ctx,
            "broadcasting",
            input.rollbackStatus,
            {
              reason: broadcast.reason,
              ...(autonomyDecision ? { autonomy_decision: autonomyDecision } : {}),
            },
          );
        }
        apiFailure("DB_ERROR", "Không thể gửi yêu cầu đến thợ", 500);
      }
      await logJobEvent(
        input.client,
        input.jobId,
        "no_worker_found",
        input.ctx,
        "broadcasting",
        null,
        {
          reason: broadcast.reason,
          district: input.district,
          service_type: input.job.service_type,
          ...(autonomyDecision ? { autonomy_decision: autonomyDecision } : {}),
        },
      );
      await insertUserNotification(input.client, {
        userId: input.ctx.user.id,
        jobId: input.jobId,
        eventType: "no_worker_found",
        title: "Chưa có thợ phù hợp",
        body: "Hiện chưa có thợ phù hợp. Bạn có thể thử tìm lại sau.",
        metadata: { district: input.district, service_type: asString(input.job.service_type) },
      });
      return {
        job_id: input.jobId,
        status: "broadcasting" as JobStatus,
        broadcast_sent: false,
        worker: null,
        message: broadcast.reason,
      };
    }

    await logJobEvent(
      input.client,
      input.jobId,
      "broadcast_sent",
      input.ctx,
      "broadcasting",
      null,
      {
        batch_id: broadcast.batchId,
        worker_count: broadcast.broadcastCount,
        ...(autonomyDecision ? { autonomy_decision: autonomyDecision } : {}),
      },
    );

    return {
      job_id: input.jobId,
      status: "broadcasting" as JobStatus,
      broadcast_sent: true,
      worker: null,
      message:
        `Đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ. Đang chờ phản hồi.`,
    };
  };

  if (!input.retryingExistingSearch) return sendBroadcast();

  const claimResult = await runWithBroadcastRetryLease(
    workflowDb(input.ctx),
    input.jobId,
    input.ctx.user.id,
    sendBroadcast,
  );
  if (!claimResult.acquired) {
    failBroadcastRetryClaim(claimResult.reasonCode);
  }
  return claimResult.value;
}
