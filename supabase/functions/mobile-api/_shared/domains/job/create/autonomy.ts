import { estimatePriceSourceFromStageLogs } from "../../../platform/kael-price-source.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import { requireNonOperatorWorkflowRole } from "../../../platform/authz/workflow-role.ts";
import type { DbClient } from "../../../platform/db.ts";
import {
  buildEstimateCardOutput,
  buildKaelAutonomyDecision,
  buildWorkerBriefOutput,
  runKaelAutonomyOrchestrator,
} from "../../../kael/index.ts";
import type { JobCreateInput } from "../../../../../_shared/domain.ts";
import type { SuccessfulJobPipeline } from "./analyze.ts";
import { retireAnalyzingJobOrFail } from "./compensation.ts";

export async function prepareJobAutonomyOrFail(input: {
  readonly client: DbClient;
  readonly ctx: MobileApiContext;
  readonly request: JobCreateInput;
  readonly pipeline: SuccessfulJobPipeline;
  readonly jobId: string;
  readonly canonicalDistrict: string;
}) {
  const { client, ctx, request, pipeline, jobId, canonicalDistrict } = input;
  const estimate = pipeline.estimate;
  const estimateCardV3 = buildEstimateCardOutput({
    estimate,
    priceSource: estimate.needs_inspection
      ? "inspection_required"
      : estimatePriceSourceFromStageLogs(pipeline.stageLogs),
    baselineUsed:
      request.service_type + ":" + pipeline.serviceProblemId + ":" + estimate.complexity,
    marketSignals: estimate.market_signals ?? estimate.needs_inspection_reason,
    needsInspectionReason: estimate.needs_inspection_reason,
  });
  const now = new Date().toISOString();
  const lockedFinalPrice = estimate.price_max;
  const workerBriefCore = buildWorkerBriefOutput({
    stage: "core",
    serviceType: request.service_type,
    problemSummary: estimate.problem_summary,
    district: canonicalDistrict,
    // A pre-match brief is shared across workers and cannot state one worker's net honestly.
    estimatedEarningMin: null,
    estimatedEarningMax: null,
    knowledgeSafetyGuidance: pipeline.knowledgeContext?.safetyGuidance,
  });
  const autonomyDecision = buildKaelAutonomyDecision({
    action: "start_matching",
    policyId: "kael.autonomy.v2.estimate_to_matching",
    evidence: [
      {
        kind: "artifact",
        reference_id: jobId,
        summary: "Validated Kael estimate, supported service scope, and HCMC district.",
      },
      {
        kind: "policy",
        reference_id: "RULES.md#rule-7",
        summary: "Kael Autonomy v2 allows server-validated matching after estimate.",
      },
    ],
    confidence: estimate.confidence,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_started_matching",
  });

  let autonomyRun: Awaited<ReturnType<typeof runKaelAutonomyOrchestrator>>;
  try {
    autonomyRun = await runKaelAutonomyOrchestrator({
      label: "estimate_to_matching",
      decision: autonomyDecision,
      from: "analyzing",
      to: "broadcasting",
      authority: {
        purpose: "price_synthesis",
        actor: "customer",
        jobRelation: "own_customer_job",
        action: "synthesize_price",
        topic: "price_estimate",
        intentConfidence: 1,
        topicSource: "deterministic_rule",
        boundarySignal: false,
        actorId: ctx.user.id,
        jobId,
      },
      knownEvidenceReferences: [jobId, "RULES.md#rule-7"],
      source: "policy",
      audit: {
        client,
        jobId,
        actorId: ctx.user.id,
        actorRole: requireNonOperatorWorkflowRole(ctx),
        source: "policy",
      },
    });
  } catch {
    await retireAnalyzingJobOrFail({
      client,
      jobId,
      actor: ctx,
      reasonCode: "AUTONOMY_AUDIT_FAILED",
      cleanupFailureMessage: "Không thể đóng yêu cầu sau lỗi hệ thống",
    });
    apiFailure("DB_ERROR", "Không thể ghi nhận quyết định điều phối", 500);
  }
  if (autonomyRun.gate.result !== "allow") {
    await retireAnalyzingJobOrFail({
      client,
      jobId,
      actor: ctx,
      reasonCode: autonomyRun.gate.audit.reason_code,
      cleanupFailureMessage: "Không thể đóng yêu cầu sau lỗi điều phối",
    });
    const transitionError = autonomyRun.gate.audit.safe_metadata.transition_error;
    apiFailure(
      "INVALID_STATUS",
      typeof transitionError === "string"
        ? transitionError
        : "Kael autonomy decision rejected by invariant gate.",
      409,
    );
  }

  return {
    estimate,
    estimateCardV3,
    now,
    lockedFinalPrice,
    workerBriefCore,
    autonomyDecision,
  };
}
