import { logJobEvent } from "../../../platform/audit.ts";
import { createBroadcasts } from "../../matching/broadcasts.ts";
import { rollbackFailedBroadcastStart } from "../../matching/flow.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import { dbQuery, type DbClient } from "../../../platform/db.ts";
import { recordLearningRuleApplication } from "../../../kael/index.ts";
import type { JobCreateInput } from "../../../../../_shared/domain.ts";
import type { SuccessfulJobPipeline } from "./analyze.ts";
import type { prepareJobAutonomyOrFail } from "./autonomy.ts";
import { retireAnalyzingJobOrFail } from "./compensation.ts";

type JobAutonomyPreparation = Awaited<ReturnType<typeof prepareJobAutonomyOrFail>>;

export async function persistAndStartJobBroadcast(input: {
  readonly client: DbClient;
  readonly ctx: MobileApiContext;
  readonly request: JobCreateInput;
  readonly pipeline: SuccessfulJobPipeline;
  readonly preparation: JobAutonomyPreparation;
  readonly jobId: string;
  readonly canonicalDistrict: string;
}) {
  const {
    client,
    ctx,
    request,
    pipeline,
    preparation,
    jobId,
    canonicalDistrict,
  } = input;
  const {
    estimate,
    estimateCardV3,
    now,
    lockedFinalPrice,
    workerBriefCore,
    autonomyDecision,
  } = preparation;
  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({
        status: "broadcasting",
        kael_problem_identified: estimate.problem_summary,
        kael_complexity: estimate.complexity,
        kael_price_min: estimate.price_min,
        kael_price_max: estimate.price_max,
        kael_reference_price_min: pipeline.referencePriceMin ?? null,
        kael_reference_price_max: pipeline.referencePriceMax ?? null,
        kael_advisory: estimate.advisory,
        kael_estimate_card_v3: estimateCardV3,
        kael_worker_brief_core: workerBriefCore,
        final_price: lockedFinalPrice,
        service_problem_id: pipeline.serviceProblemId,
        estimate_ready_at: now,
        broadcast_at: now,
        confirmed_search_at: now,
      })
      .eq("id", jobId)
      .eq("status", "analyzing")
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) {
    await retireAnalyzingJobOrFail({
      client,
      jobId,
      actor: ctx,
      reasonCode: "ESTIMATE_PERSIST_FAILED",
      cleanupFailureMessage: "Không thể đóng yêu cầu sau lỗi lưu ước tính",
    });
    apiFailure("DB_ERROR", "Không thể cập nhật kết quả phân tích", 500);
  }
  if (!updated.data) {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái yêu cầu đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }

  await recordPipelineLearningApplications(client, jobId, pipeline);
  await logJobEvent(
    client,
    jobId,
    "estimate_ready",
    ctx,
    "analyzing",
    "broadcasting",
    {
      fallback_used: pipeline.fallbackUsed,
      autonomy_decision: autonomyDecision,
    },
  );

  const broadcast = await createBroadcasts(
    client,
    jobId,
    request.service_type,
    canonicalDistrict,
  );
  if (!broadcast.success) {
    if (broadcast.reasonCode === "DB_ERROR") {
      const rolledBack = await rollbackFailedBroadcastStart(
        client,
        jobId,
        ctx.user.id,
        "analyzing",
      );
      if (!rolledBack) {
        apiFailure(
          "DB_ERROR",
          "Không thể khôi phục yêu cầu sau lỗi gửi thợ",
          500,
        );
      }
      await logJobEvent(
        client,
        jobId,
        "broadcast_start_failed",
        ctx,
        "broadcasting",
        "analyzing",
        { reason: broadcast.reason, autonomy_decision: autonomyDecision },
      );
      await retireAnalyzingJobOrFail({
        client,
        jobId,
        actor: ctx,
        reasonCode: "BROADCAST_START_FAILED",
        cleanupFailureMessage: "Không thể đóng yêu cầu sau lỗi gửi thợ",
      });
      apiFailure("DB_ERROR", "Không thể gửi yêu cầu đến thợ", 500);
    }
    await logJobEvent(
      client,
      jobId,
      "no_worker_found",
      ctx,
      "broadcasting",
      null,
      {
        reason: broadcast.reason,
        district: canonicalDistrict,
        service_type: request.service_type,
        autonomy_decision: autonomyDecision,
      },
    );
  }

  return broadcast;
}

async function recordPipelineLearningApplications(
  client: DbClient,
  jobId: string,
  pipeline: SuccessfulJobPipeline,
) {
  if (!pipeline.learningApplications?.length) return;
  await Promise.all(pipeline.learningApplications.map((application) =>
    recordLearningRuleApplication(client, {
      ruleId: application.ruleId,
      ruleVersion: application.ruleVersion,
      skillId: application.skillId,
      jobId,
      actorRole: "system",
      appliedTarget: application.appliedTarget,
      safeMetadata: application.safeMetadata,
    })
  ));
}
