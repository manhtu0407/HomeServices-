// Edge service completion-review domain (C4 6a, services/* split): customer confirm-completion
// (autonomy-gated) + submit-review (rating -> learning + normal-transaction memory). The worker-evidence
// builder buildKaelCompletionDecision stays in services.ts (status flow). Imported by services.ts.

import { asComplexityOrNull, asJobStatus, asServiceType, asString, asStringArray, nullableNumber, nullableRecord, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { mapReviewError } from "./_shared.ts";
import { logJobEvent, logMemoryAudit, queueKaelLearningEvent } from "./audit.ts";
import { insertUserNotification } from "./notifications.service.ts";
import { runPolicyAutonomyGate } from "./autonomy-gate.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { requireJobAccess } from "../access.ts";
import { validateWorkflowTransition } from "../workflow-orchestrator.ts";
import { buildKaelAutonomyDecision, recordLearningReviewOutcome, type KaelAutonomyDecision } from "../kael/index.ts";
import type { JobStatus, ServiceType } from "../../../_shared/domain.ts";

type NormalTransactionMemoryInput = {
  jobId: string;
  customerId: string;
  workerId: string | null;
  serviceType: ServiceType;
  problemSummary: string | null;
  district: string | null;
  rating: number;
  finalPrice: number | null;
};

export async function confirmCompletion(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id, worker_id, final_price, completion_notes, completion_photo_urls",
  });
  if (job.status === "confirmed_by_customer" || job.status === "reviewed") {
    return {
      job_id: jobId,
      status: job.status as JobStatus,
      final_price: nullableNumber(job.final_price),
    };
  }
  if (job.status !== "completed_by_worker") {
    apiFailure(
      "INVALID_STATUS",
      "Trạng thái yêu cầu đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  const autonomyDecision = buildKaelCustomerAcceptedCompletionDecision(
    jobId,
    nullableNumber(job.final_price),
    {
      completionNotes: nullableString(job.completion_notes),
      completionPhotoUrls: asStringArray(job.completion_photo_urls),
      customerId: ctx.user.id,
    },
  );
  const autonomyRun = await runPolicyAutonomyGate({
    label: "customer_confirm_completion",
    client,
    ctx,
    jobId,
    decision: autonomyDecision,
    from: job.status as JobStatus,
    to: "confirmed_by_customer",
    amountVnd: nullableNumber(job.final_price),
    authority: {
      purpose: "scope_change",
      actor: ctx.role,
      jobRelation: "own_customer_job",
      action: "review_scope_change",
      topic: "job_status",
      intentConfidence: 1,
      topicSource: "deterministic_rule",
      boundarySignal: false,
      actorId: ctx.user.id,
      jobId,
    },
    knownEvidenceReferences: [ctx.user.id, jobId, "RULES.md#rule-7"],
  });
  if (autonomyRun.gate.result !== "allow") {
    apiFailure("INVALID_STATUS", autonomyRun.gate.audit.reason_code, 409);
  }
  const finalPrice = nullableNumber(job.final_price);
  // jobs.final_price là Kael-locked. Nếu null thì
  // confirmSearch chưa set baseline — chặn confirm để giữ trust.
  if (finalPrice === null || finalPrice <= 0) {
    apiFailure(
      "INVALID_STATUS",
      "Kael chưa chốt giá cuối cùng nên chưa thể xác nhận hoàn tất",
      409,
    );
  }

  const now = new Date().toISOString();
  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({ status: "confirmed_by_customer", confirmed_at: now })
      .eq("id", jobId)
      .eq("customer_id", ctx.user.id)
      .eq("status", job.status)
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) {
    apiFailure("DB_ERROR", "Không thể xác nhận hoàn thành", 500);
  }
  if (!updated.data) {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  await logJobEvent(
    client,
    jobId,
    "kael_confirmed_completion",
    ctx,
    job.status as JobStatus,
    "confirmed_by_customer",
    { autonomy_decision: autonomyDecision, customer_input: "accepted_completion" },
  );
  // P9 keeps review prompting in the completion surface; A14 sends the customer notification.
  // Kael Autonomy v2: notify worker that completion has been policy-confirmed.
  const workerId = nullableString(job.worker_id);
  if (workerId) {
    await insertUserNotification(client, {
      userId: workerId,
      jobId,
      eventType: "kael_confirmed_completion",
      title: "Kael đã xác nhận hoàn tất",
      body: "Kael đã xác nhận công việc từ bằng chứng hoàn tất. Đối soát thu nhập sẽ cập nhật.",
      metadata: { final_price: finalPrice, autonomy_decision: autonomyDecision },
    });
  }
  return {
    job_id: jobId,
    status: "confirmed_by_customer" as JobStatus,
    final_price: finalPrice,
  };
}

export async function submitReview(ctx: MobileApiContext, jobId: string, input: {
  rating: number;
  tags?: string[];
  comment?: string;
}) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select:
      "id, status, customer_id, worker_id, service_type, address_district, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, final_price",
  });
  if (job.status === "reviewed") {
    const existing = await dbQuery<Record<string, unknown>>(
      client
        .from("reviews")
        .select("id")
        .eq("job_id", jobId)
        .eq("customer_id", ctx.user.id)
        .maybeSingle(),
    );
    if (existing.error || !existing.data) {
      apiFailure("INVALID_STATUS", "Yêu cầu đã được đánh giá nhưng chưa tìm thấy bản ghi đánh giá", 409);
    }
    return {
      review_id: asString(existing.data.id),
      job_id: jobId,
      status: "reviewed" as JobStatus,
    };
  }
  const transition = validateWorkflowTransition({
    event: "review_submitted",
    from: job.status as JobStatus,
    to: "reviewed",
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("submit_review_atomic", {
      p_job_id: jobId,
      p_customer_id: ctx.user.id,
      p_rating: input.rating,
      p_tags: input.tags ?? [],
      p_comment: input.comment ?? null,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể gửi đánh giá", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể gửi đánh giá", 500);
  if (!row.ok) {
    const existingReviewId = nullableString(row.review_id);
    if (nullableString(row.error_code) === "ALREADY_REVIEWED" && existingReviewId) {
      return {
        review_id: existingReviewId,
        job_id: jobId,
        status: asJobStatus(row.job_status ?? "reviewed"),
      };
    }
    mapReviewError(nullableString(row.error_code));
  }

  await logJobEvent(
    client,
    jobId,
    "customer_reviewed",
    ctx,
    null,
    "reviewed",
    { rating: input.rating },
  );
  await recordLearningReviewOutcome(client, {
    jobId,
    finalPrice: nullableNumber(job.final_price),
    rating: input.rating,
  });
  await queueKaelLearningEvent(client, 'post-A14', {
    actor_id: ctx.user.id,
    actor_role: ctx.role,
    job_id: jobId,
    customer_id: ctx.user.id,
    worker_id: nullableString(job.worker_id) ?? undefined,
    service_type: asServiceType(job.service_type),
    problem_slug: nullableString(job.kael_problem_identified) ?? undefined,
    district_code: nullableString(job.address_district) ?? undefined,
    complexity: asComplexityOrNull(job.kael_complexity) ?? undefined,
    baseline_min: nullableNumber(job.kael_price_min) ?? undefined,
    baseline_max: nullableNumber(job.kael_price_max) ?? undefined,
    final_price: nullableNumber(job.final_price),
    rating: input.rating,
    review_tags: input.tags ?? [],
    scope_change_requested: false,
    reviewed_at: new Date().toISOString(),
  });
  await recordNormalTransactionMemory(client, {
    jobId,
    customerId: ctx.user.id,
    workerId: nullableString(job.worker_id),
    serviceType: asServiceType(job.service_type),
    problemSummary: nullableString(job.kael_problem_identified),
    district: nullableString(job.address_district),
    rating: input.rating,
    finalPrice: nullableNumber(job.final_price),
  });
  await insertUserNotification(client, {
    userId: ctx.user.id,
    jobId,
    eventType: "review_thanks",
    title: "\u0043\u1ea3m \u01a1n b\u1ea1n \u0111\u00e3 \u0111\u00e1nh gi\u00e1",
    body: "Kael \u0111\u00e3 ghi nh\u1eadn \u0111\u00e1nh gi\u00e1 \u0111\u1ec3 c\u1ea3i thi\u1ec7n l\u1ea7n sau.",
    metadata: { rating: input.rating },
  });
  return {
    review_id: asString(row.review_id),
    job_id: jobId,
    status: row.job_status as JobStatus,
  };
}

function buildKaelCustomerAcceptedCompletionDecision(
  jobId: string,
  finalPrice: number | null,
  input: {
    completionNotes: string | null;
    completionPhotoUrls: string[];
    customerId: string;
  },
): KaelAutonomyDecision {
  const photoCount = input.completionPhotoUrls.length;
  const noteLength = input.completionNotes?.trim().length ?? 0;
  return buildKaelAutonomyDecision({
    action: "confirm_completion",
    policyId: "kael.autonomy.v2.customer_completion_acceptance",
    evidence: [
      {
        kind: "customer_input",
        reference_id: input.customerId,
        summary: "Customer accepted completion; server treats the action as input to Kael decision.",
      },
      {
        kind: "worker_evidence",
        reference_id: jobId,
        summary: `Worker completion evidence on record: ${photoCount} photo(s), note length ${noteLength}.`,
      },
      {
        kind: "system_check",
        reference_id: jobId,
        summary: finalPrice && finalPrice > 0
          ? "Final price is already Kael-locked before completion confirmation."
          : "Final price is missing and will be rejected before persistence.",
      },
      {
        kind: "policy",
        reference_id: "RULES.md#rule-7",
        summary: "Kael Autonomy v2 keeps completion authority server-side and appealable.",
      },
    ],
    confidence: photoCount > 0 || noteLength >= 12 ? 0.88 : 0.76,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_confirmed_completion",
  });
}

async function recordNormalTransactionMemory(
  client: DbClient,
  input: NormalTransactionMemoryInput,
) {
  const observedAt = new Date().toISOString();
  const customerExisting = await dbQuery<Record<string, unknown>>(
    client
      .from("customer_kael_memory")
      .select("service_preferences, trust_signals, safe_metadata")
      .eq("customer_id", input.customerId)
      .maybeSingle(),
  );
  const servicePreferences = nullableRecord(
    customerExisting.data?.service_preferences,
  ) ?? {};
  const previousServicePreference = nullableRecord(
    servicePreferences[input.serviceType],
  ) ?? {};
  const trustSignals = nullableRecord(customerExisting.data?.trust_signals) ?? {};
  const customerMetadata = nullableRecord(customerExisting.data?.safe_metadata) ??
    {};

  await dbQuery(
    client.from("customer_kael_memory").upsert({
      customer_id: input.customerId,
      preference_summary:
        `Normal ${input.serviceType} transaction reviewed with rating ${input.rating}.`,
      service_preferences: {
        ...servicePreferences,
        [input.serviceType]: {
          ...previousServicePreference,
          last_rating: input.rating,
          last_district: input.district,
          last_normal_job_id: input.jobId,
          observed_at: observedAt,
        },
      },
      trust_signals: {
        ...trustSignals,
        reviewed_after_completion: true,
        last_rating: input.rating,
        last_normal_job_id: input.jobId,
      },
      safe_metadata: {
        ...customerMetadata,
        last_normal_transaction: {
          job_id: input.jobId,
          service_type: input.serviceType,
          district: input.district,
          final_price_present: input.finalPrice !== null,
          problem_summary_present: input.problemSummary !== null,
          layers: ["L2", "L3", "L5"],
          observed_at: observedAt,
        },
      },
      last_observed_at: observedAt,
    }),
  ).catch(() => {
    console.warn("mobile-api customer kael memory write failed", {
      jobId: input.jobId,
    });
  });

  if (input.workerId) {
    const workerExisting = await dbQuery<Record<string, unknown>>(
      client
        .from("worker_kael_memory")
        .select("service_skill_proficiency, reliability_signals, safe_metadata")
        .eq("worker_id", input.workerId)
        .maybeSingle(),
    );
    const proficiency = nullableRecord(
      workerExisting.data?.service_skill_proficiency,
    ) ?? {};
    const previousProficiency = nullableRecord(proficiency[input.serviceType]) ??
      {};
    const reliabilitySignals = nullableRecord(
      workerExisting.data?.reliability_signals,
    ) ?? {};
    const workerMetadata = nullableRecord(workerExisting.data?.safe_metadata) ??
      {};

    await dbQuery(
      client.from("worker_kael_memory").upsert({
        worker_id: input.workerId,
        service_skill_summary:
          `Normal ${input.serviceType} job completed with customer rating ${input.rating}.`,
        service_skill_proficiency: {
          ...proficiency,
          [input.serviceType]: {
            ...previousProficiency,
            last_rating: input.rating,
            last_normal_job_id: input.jobId,
            observed_at: observedAt,
          },
        },
        reliability_signals: {
          ...reliabilitySignals,
          customer_reviewed_after_completion: true,
          last_rating: input.rating,
          last_normal_job_id: input.jobId,
        },
        safe_metadata: {
          ...workerMetadata,
          last_normal_transaction: {
            job_id: input.jobId,
            service_type: input.serviceType,
            final_price_present: input.finalPrice !== null,
            layers: ["L2", "L4", "L5"],
            observed_at: observedAt,
          },
        },
        last_observed_at: observedAt,
      }),
    ).catch(() => {
      console.warn("mobile-api worker kael memory write failed", {
        jobId: input.jobId,
      });
    });
  }

  await dbQuery(
    client.from("job_events").insert({
      job_id: input.jobId,
      actor_id: input.customerId,
      actor_role: "customer",
      event_type: "kael_memory_l2_observed",
      from_status: null,
      to_status: null,
      safe_metadata: {
        normal_case: true,
        layers: ["L2", "L3", "L4", "L5"],
        service_type: input.serviceType,
        final_price_present: input.finalPrice !== null,
      },
    }),
  ).catch(() => {
    console.warn("mobile-api job memory event write failed", {
      jobId: input.jobId,
    });
  });

  await logMemoryAudit(client, {
    subjectType: "job",
    subjectId: input.jobId,
    actorId: input.customerId,
    operation: "write",
    layer: "L2",
    purpose: "normal_transaction_review",
  });
  await logMemoryAudit(client, {
    subjectType: "customer",
    subjectId: input.customerId,
    actorId: input.customerId,
    operation: "write",
    layer: "L3",
    purpose: "normal_transaction_review",
  });
  if (input.workerId) {
    await logMemoryAudit(client, {
      subjectType: "worker",
      subjectId: input.workerId,
      actorId: input.customerId,
      operation: "write",
      layer: "L4",
      purpose: "normal_transaction_review",
    });
  }
  await logMemoryAudit(client, {
    subjectType: "domain",
    subjectId: null,
    actorId: input.customerId,
    operation: "write",
    layer: "L5",
    purpose: "normal_transaction_review",
  });
}
