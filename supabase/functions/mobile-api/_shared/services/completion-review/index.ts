// Edge service completion-review domain (C4 6a, services/* split): explicit customer
// confirm-completion + submit-review (rating -> learning + normal-transaction memory).

import { asComplexityOrNull, asJobStatus, asServiceType, asString, asStringArray, nullableNumber, nullableString } from "../_runtime/coercions.ts";
import { db, dbQuery, type DbClient } from "../_runtime/db.ts";
import { mapReviewError } from "../_runtime/shared.ts";
import { logJobEvent, logMemoryAudit, queueKaelLearningEvent } from "../_runtime/audit.ts";
import { insertUserNotification } from "../notifications/index.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import { requireJobAccess } from "../../access.ts";
import { validateWorkflowTransition } from "../../workflow-orchestrator.ts";
import { recordLearningReviewOutcome } from "../../kael/index.ts";
import type { JobStatus } from "../../../../_shared/domain.ts";

type NormalTransactionMemoryInput = {
  jobId: string;
  customerId: string;
  workerId: string | null;
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
  const transition = validateWorkflowTransition({
    event: "customer_confirmed_completion",
    from: job.status as JobStatus,
    to: "confirmed_by_customer",
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
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
    "customer_confirmed_completion",
    ctx,
    job.status as JobStatus,
    "confirmed_by_customer",
    {
      customer_input: "accepted_completion",
      completion_evidence: {
        note_present: Boolean(nullableString(job.completion_notes)),
        photo_count: asStringArray(job.completion_photo_urls).length,
      },
    },
  );
  // P9 keeps review prompting in the completion surface; A14 sends the customer notification.
  // Kael Autonomy v2: notify worker that completion has been policy-confirmed.
  const workerId = nullableString(job.worker_id);
  if (workerId) {
    await insertUserNotification(client, {
      userId: workerId,
      jobId,
      eventType: "customer_confirmed_completion",
      title: "Khách đã xác nhận hoàn tất",
      body: "Khách đã duyệt bằng chứng hoàn tất. Đối soát thu nhập sẽ cập nhật.",
      metadata: { final_price: finalPrice },
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
    await recordNormalTransactionMemory(client, {
      jobId,
      customerId: ctx.user.id,
      workerId: nullableString(job.worker_id),
    });
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

async function recordNormalTransactionMemory(
  client: DbClient,
  input: NormalTransactionMemoryInput,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("record_normal_transaction_memory_atomic", {
      p_job_id: input.jobId,
      p_customer_id: input.customerId,
    }),
  );
  if (result.error) {
    console.warn("mobile-api normal transaction memory write failed", {
      jobId: input.jobId,
      errorCode: result.error.code,
    });
    return;
  }
  if (result.data?.[0]?.applied !== true) return;

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
