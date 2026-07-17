// Edge service job-create domain (C4 6a, services/* split): the createJob orchestrator — rate-limit,
// idempotent insert, geocode, runKaelPipeline, autonomy gate, estimate persist, then createBroadcasts
// (rollback via matching). Helpers: analyzing-job cleanup, learning-application record, idempotency
// lookup + existing-job response. Imported by services.ts for wiring.

import { asComplexityOrNull, asJobStatus, asRecord, asServiceType, asString, nullableNumber, nullableString, positiveNumberFrom } from "../_runtime/coercions.ts";
import { db, dbQuery, type DbClient } from "../_runtime/db.ts";
import { estimatePriceSourceFromStageLogs, sourceTrustSecretsForRequest } from "../_runtime/shared.ts";
import { apiLogPurposeForPipelineStage, logApiCalls, logJobEvent } from "../_runtime/audit.ts";
import { buildInitialApartmentAccessState, persistApartmentAccessProfileFromMetadata, sanitizeApartmentAccessProfile } from "../apartment-access/index.ts";
import { geocodeJobAddressForMatching } from "../places-geo/index.ts";
import { createBroadcasts } from "../matching/broadcasts.ts";
import { rollbackFailedBroadcastStart } from "../matching/index.ts";
import { insertUserNotification } from "../notifications/index.ts";
import { HCMC_SCHEDULE_VALIDATION_MESSAGE, validateFutureHcmcSchedule } from "./schedule-policy.ts";
import { AI_SESSION_LIMIT, checkRateLimit } from "../../rate-limit.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import { validateWorkflowTransition } from "../../workflow-orchestrator.ts";
import { buildEstimateCardOutput, buildKaelAutonomyDecision, buildWorkerBriefOutput, prependDeterministicSafetyGuidance, PRICE_DISCLAIMER, recordLearningRuleApplication, resolveElectricalIntakeRuntime, runKaelAutonomyOrchestrator, runKaelPipeline, type EdgeAiSecrets, type PipelineResult } from "../../kael/index.ts";
import { isKaelAiKillSwitchEnabled } from "../../kael/spend-gate.ts";
import { normalizeServiceAreaDistrict, PLATFORM_FEE_WORKER, sanitizeForLLM } from "../../../../_shared/domain.ts";
import type { JobCreateInput, JobStatus } from "../../../../_shared/domain.ts";

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
  const canonicalDistrict = normalizeServiceAreaDistrict(
    input.address_district,
  );
  if (!canonicalDistrict) {
    apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  }
  const requestId = crypto.randomUUID();

  // Idempotent re-POST. If the customer
  // sends the same client_request_id again, return the existing job instead
  // of inserting a duplicate row. Closes F-04 (3 parallel POSTs → 3 jobs).
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

  const rateCheck = checkRateLimit(
    `job_create:${ctx.user.id}`,
    AI_SESSION_LIMIT,
  );
  if (!rateCheck.allowed) {
    apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
  }

  const inserted = await dbQuery<{ display_code?: unknown; id: string }>(
    client
      .from("jobs")
      .insert({
        customer_id: ctx.user.id,
        service_type: input.service_type,
        description: sanitizeForLLM(input.description),
        problem_chips: input.problem_chips,
        photo_urls: input.photo_urls,
        address_building: input.address_building ?? null,
        address_unit: input.address_unit ?? null,
        address_floor: input.address_floor ?? null,
        address_district: canonicalDistrict,
        apartment_access_profile: sanitizeApartmentAccessProfile(
          input.apartment_access_profile,
        ),
        apartment_access_state: buildInitialApartmentAccessState(),
        scheduled_at: input.scheduled_at ?? null,
        status: "analyzing",
        client_request_id: input.client_request_id ?? null,
      })
      .select("id, display_code")
      .single(),
  );

  // Lost race against a concurrent POST with the same client_request_id ->
  // fall back to the winner's row instead of bubbling a 23505 to the client.
  if (
    inserted.error?.code === "23505" && input.client_request_id
  ) {
    const recoveredId = await findExistingJobByClientRequest(
      client,
      ctx.user.id,
      input.client_request_id,
    );
    if (recoveredId) {
      return buildExistingJobCreateResponse(ctx, recoveredId);
    }
  }

  if (inserted.error || !inserted.data) {
    apiFailure("DB_ERROR", "Không thể tạo yêu cầu", 500);
  }
  const jobId = inserted.data.id;
  const displayCode = nullableString(inserted.data.display_code);
  await persistApartmentAccessProfileFromMetadata(client, {
    customerId: ctx.user.id,
    jobId,
    addressLabel: input.address_building ?? null,
    district: canonicalDistrict,
    profile: sanitizeApartmentAccessProfile(input.apartment_access_profile),
  });
  await geocodeJobAddressForMatching(client, jobId, {
    addressLabel: input.address_building ?? null,
    district: canonicalDistrict,
  }, secrets);
  await logJobEvent(client, jobId, "job_created", ctx, null, "analyzing");

  const jobIntakeSafetySignals = resolveElectricalIntakeRuntime({
    intakeDiagnosisEnabled: false,
    serviceType: input.service_type,
    problemChips: input.problem_chips,
    description: input.description,
  }).safetySignals;
  const withJobIntakeSafetyGuidance = (message: string) =>
    prependDeterministicSafetyGuidance(
      message,
      isKaelAiKillSwitchEnabled() ? [] : jobIntakeSafetySignals,
      "vi",
    );

  let pipeline: PipelineResult;
  try {
    pipeline = await runKaelPipeline(
      {
        serviceType: input.service_type,
        problemChips: input.problem_chips,
        description: input.description,
        district: canonicalDistrict,
        photoUrls: input.photo_urls,
        progressJobId: jobId,
        actorId: ctx.user.id, // S4/F1 (§38): per-user AI-spend attribution
      },
      client,
      sourceTrustSecretsForRequest(secrets, ctx),
    );
  } catch {
    const cleanupOk = await cancelAnalyzingJob(
      client,
      jobId,
      ctx,
      "PIPELINE_THROW",
    );
    if (!cleanupOk) {
      apiFailure("DB_ERROR", "Không thể đóng yêu cầu sau lỗi hệ thống", 500);
    }
    console.warn("mobile-api Kael pipeline threw", {
      jobId,
      reasonCode: "PIPELINE_THROW",
    });
    apiFailure(
      "AI_FAILED",
      withJobIntakeSafetyGuidance("Hệ thống đang xử lý. Vui lòng thử lại."),
      502,
    );
  }

  await logApiCalls(
    client,
    pipeline.stageLogs
      .filter((stage) => stage.provider && stage.model)
      .map((stage) => ({
        job_id: jobId,
        request_id: requestId,
        purpose: apiLogPurposeForPipelineStage(stage.stage),
        provider: stage.provider,
        model: stage.model,
        input_tokens: stage.inputTokens ?? null,
        output_tokens: stage.outputTokens ?? null,
        cost_usd: stage.costUsd ?? null,
        latency_ms: stage.latencyMs,
        success: stage.success,
        error_code: stage.failureReason ?? null,
        safe_metadata: {
          ...(stage.cacheStatus ? { cache_status: stage.cacheStatus } : {}),
          ...(stage.safeMetadata ?? {}),
        },
      })),
  );

  if (!pipeline.success) {
    const cleanupOk = await cancelAnalyzingJob(
      client,
      jobId,
      ctx,
      pipeline.code,
      pipeline.policyReasonCode
        ? { policy_reason_code: pipeline.policyReasonCode }
        : {},
    );
    if (!cleanupOk) {
      apiFailure("DB_ERROR", "Không thể đóng yêu cầu sau lỗi hệ thống", 500);
    }
    if (pipeline.code === "UNSUPPORTED" || pipeline.code === "SERVICE_MISMATCH") {
      apiFailure("UNSUPPORTED", pipeline.error, 400);
    }
    if (pipeline.code === "NO_BASELINE") {
      apiFailure("NO_BASELINE", pipeline.error, 502);
    }
    apiFailure(
      "AI_FAILED",
      withJobIntakeSafetyGuidance("Hệ thống đang xử lý. Vui lòng thử lại."),
      502,
    );
  }

  const estimate = pipeline.estimate;
  const estimateCardV3 = buildEstimateCardOutput({
    estimate,
    priceSource: estimate.needs_inspection
      ? "inspection_required"
      : estimatePriceSourceFromStageLogs(pipeline.stageLogs),
    baselineUsed:
      `${input.service_type}:${pipeline.serviceProblemId}:${estimate.complexity}`,
    marketSignals: estimate.market_signals ?? estimate.needs_inspection_reason,
    needsInspectionReason: estimate.needs_inspection_reason,
  });
  const now = new Date().toISOString();
  const lockedFinalPrice = estimate.price_max;
  const workerBriefCore = buildWorkerBriefOutput({
    stage: "core",
    serviceType: input.service_type,
    problemSummary: estimate.problem_summary,
    district: canonicalDistrict,
    estimatedEarningMin: Math.round(estimate.price_min * (1 - PLATFORM_FEE_WORKER)),
    estimatedEarningMax: Math.round(lockedFinalPrice * (1 - PLATFORM_FEE_WORKER)),
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
        actorRole: ctx.role,
        source: "policy",
      },
    });
  } catch {
    const retired = await cancelAnalyzingJob(
      client,
      jobId,
      ctx,
      "AUTONOMY_AUDIT_FAILED",
    );
    if (!retired) {
      apiFailure("DB_ERROR", "Không thể đóng yêu cầu sau lỗi hệ thống", 500);
    }
    apiFailure("DB_ERROR", "Không thể ghi nhận quyết định điều phối", 500);
  }
  if (autonomyRun.gate.result !== "allow") {
    const retired = await cancelAnalyzingJob(
      client,
      jobId,
      ctx,
      autonomyRun.gate.audit.reason_code,
    );
    if (!retired) {
      apiFailure("DB_ERROR", "Không thể đóng yêu cầu sau lỗi điều phối", 500);
    }
    const transitionError = autonomyRun.gate.audit.safe_metadata.transition_error;
    apiFailure(
      "INVALID_STATUS",
      typeof transitionError === "string"
        ? transitionError
        : "Kael autonomy decision rejected by invariant gate.",
      409,
    );
  }
  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({
        status: "broadcasting",
        kael_problem_identified: estimate.problem_summary,
        kael_complexity: estimate.complexity,
        kael_price_min: estimate.price_min,
        kael_price_max: estimate.price_max,
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
    const retired = await cancelAnalyzingJob(
      client,
      jobId,
      ctx,
      "ESTIMATE_PERSIST_FAILED",
    );
    if (!retired) {
      apiFailure("DB_ERROR", "Không thể đóng yêu cầu sau lỗi lưu ước tính", 500);
    }
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
    input.service_type,
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
      const retired = await cancelAnalyzingJob(
        client,
        jobId,
        ctx,
        "BROADCAST_START_FAILED",
      );
      if (!retired) {
        apiFailure(
          "DB_ERROR",
          "Không thể đóng yêu cầu sau lỗi gửi thợ",
          500,
        );
      }
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
        service_type: input.service_type,
        autonomy_decision: autonomyDecision,
      },
    );
  }

  await logJobEvent(
    client,
    jobId,
    "kael_started_matching",
    ctx,
    "analyzing",
    "broadcasting",
    {
      broadcast_sent: broadcast.success,
      ...(broadcast.success
        ? { batch_id: broadcast.batchId, worker_count: broadcast.broadcastCount }
        : { reason: broadcast.reason }),
      autonomy_decision: autonomyDecision,
    },
  );

  // Customer notification when Kael finishes analysis.
  await insertUserNotification(client, {
    userId: ctx.user.id,
    jobId,
    eventType: "estimate_ready",
    title: "Kael đang điều phối",
    body: broadcast.success
      ? "Kael đã chốt ước tính và đang gửi yêu cầu đến thợ phù hợp."
      : "Kael đã chốt ước tính và sẽ tiếp tục theo dõi thợ phù hợp.",
    metadata: {
      service_type: input.service_type,
      price_min: estimate.price_min,
      price_max: estimate.price_max,
      autonomy_decision_event: autonomyDecision.resulting_event,
      broadcast_sent: broadcast.success,
    },
  });

  return {
    job_id: jobId,
    ...(displayCode ? { display_code: displayCode } : {}),
    status: "broadcasting" as JobStatus,
    estimate,
    estimate_card_v3: estimateCardV3,
    final_price: lockedFinalPrice,
    fallback_used: pipeline.fallbackUsed,
    broadcast_sent: broadcast.success,
    message: broadcast.success
      ? `Đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ. Đang chờ phản hồi.`
      : broadcast.reason,
  };
}

async function cancelAnalyzingJob(
  client: DbClient,
  jobId: string,
  actor: MobileApiContext,
  reasonCode: string,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const cancelledAt = new Date().toISOString();
  const transition = validateWorkflowTransition({
    event: "kael_failed",
    from: "analyzing",
    to: "cancelled",
  });
  if (!transition.valid) {
    console.warn("mobile-api analyzing job cleanup transition rejected", {
      jobId,
      reasonCode,
      error: transition.error,
    });
    return false;
  }
  const cancelResult = await dbQuery(
    client
      .from("jobs")
      .update({
        status: "cancelled",
        cancelled_at: cancelledAt,
        // A terminal create failure must release the idempotency key. The
        // mobile client intentionally keeps that key across retries; retaining
        // it here would make every retry resolve to this cancelled shell and
        // return JOB_PENDING forever.
        client_request_id: null,
      })
      .eq("id", jobId)
      .eq("status", "analyzing")
      .select("id")
      .maybeSingle(),
  ).catch((error) => ({
    data: null,
    error: {
      code: "CLEANUP_THROW",
      message: error instanceof Error ? error.name : "cleanup failed",
    },
  }));

  if (cancelResult.error) {
    console.warn("mobile-api analyzing job cleanup failed", {
      jobId,
      reasonCode,
      errorCode: cancelResult.error.code,
    });
    return false;
  }
  if (!cancelResult.data) {
    console.warn("mobile-api analyzing job cleanup matched no rows", {
      jobId,
      reasonCode,
    });
    return false;
  }

  await logJobEvent(
    client,
    jobId,
    "kael_failed",
    actor,
    "analyzing",
    "cancelled",
    { reason_code: reasonCode, ...metadata },
  );
  return true;
}

async function recordPipelineLearningApplications(
  client: DbClient,
  jobId: string,
  pipeline: PipelineResult,
) {
  if (!pipeline.success || !pipeline.learningApplications?.length) return;
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

async function findExistingJobByClientRequest(
  client: DbClient,
  customerId: string,
  clientRequestId: string,
): Promise<string | null> {
  const result = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .select("id")
      .eq("customer_id", customerId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return null;
  return result.data.id;
}

async function buildExistingJobCreateResponse(
  ctx: MobileApiContext,
  jobId: string,
) {
  const client = db(ctx);
  const job = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select(
        "id, display_code, status, service_type, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_advisory, kael_estimate_card_v3, final_price",
      )
      .eq("id", jobId)
      .single(),
  );
  if (job.error || !job.data) {
    apiFailure("DB_ERROR", "Không thể tải lại yêu cầu đã tạo", 500);
  }
  const displayCode = nullableString(job.data.display_code);
  const cardV3 = asRecord(job.data.kael_estimate_card_v3);
  const cardEstimate = asRecord(cardV3.estimate);
  const complexity = asComplexityOrNull(job.data.kael_complexity) ??
    asComplexityOrNull(cardEstimate.complexity);
  const confidence = nullableNumber(cardEstimate.confidence);
  const problemCategory = nullableString(cardEstimate.problem_category);
  const problemSummary = nullableString(job.data.kael_problem_identified);
  const priceMin = positiveNumberFrom(job.data.kael_price_min) ??
    positiveNumberFrom(cardEstimate.price_min);
  const priceMax = positiveNumberFrom(job.data.kael_price_max) ??
    positiveNumberFrom(cardEstimate.price_max);
  if (!complexity || priceMin === null || priceMax === null || priceMax < priceMin) {
    apiFailure(
      "JOB_PENDING",
      "Yêu cầu đang được Kael phân tích. Vui lòng thử lại sau.",
      409,
    );
  }
  if (
    confidence === null || confidence < 0 || confidence > 1 ||
    !problemCategory?.trim() || !problemSummary?.trim()
  ) {
    apiFailure("DB_ERROR", "Dữ liệu yêu cầu đã tạo không hợp lệ", 500);
  }
  const estimate = {
    service_type: asServiceType(job.data.service_type),
    problem_category: problemCategory,
    problem_summary: problemSummary,
    complexity,
    price_min: priceMin,
    price_max: priceMax,
    confidence,
    advisory: nullableString(job.data.kael_advisory),
    disclaimer: PRICE_DISCLAIMER,
  };
  return {
    job_id: asString(job.data.id),
    ...(displayCode ? { display_code: displayCode } : {}),
    status: asJobStatus(job.data.status),
    estimate,
    estimate_card_v3: Object.keys(cardV3).length > 0
      ? (cardV3 as Record<string, unknown>)
      : undefined,
    final_price: nullableNumber(job.data.final_price),
    fallback_used: false,
  };
}
