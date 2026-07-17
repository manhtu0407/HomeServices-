// Edge service customer-cancellation domain: customer cancel flows —
// early cancel-before-accept (cancelJob) + the Phase-0 cancellation request with autonomy gating,
// preview, classification + worker-goodwill outcome. Imported by services.ts for wiring.

import { asBoolean, asCustomerCancellationAbuseSignals, asCustomerCancellationSubCase, asJobStatus, asString, nullableRecord, nullableString } from "../_runtime/coercions.ts";
import { db, dbQuery, type DbClient } from "../_runtime/db.ts";
import { mapCancelError, mapCustomerCancellationError } from "../_runtime/shared.ts";
import { logJobEvent } from "../_runtime/audit.ts";
import { runPolicyAutonomyGate } from "../_runtime/autonomy-gate.ts";
import { notifyWorkerCustomerCancellation } from "../notifications/index.ts";
import { requireJobAccess, type JobAccessRecord } from "../../access.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import { validateWorkflowCommand, validateWorkflowTransition } from "../../workflow-orchestrator.ts";
import { buildCustomerCancellationPhase0Outcome, buildKaelAutonomyDecision, classifyCustomerCancellationReason, customerCancellationAbuseFromSignals, recordCustomerCancellationReview, type CustomerCancellationSubCase } from "../../kael/index.ts";
import type { JobStatus, CustomerCancellationRequestInput } from "../../../../_shared/domain.ts";

type CustomerCancellationPreview = {
  subCase: CustomerCancellationSubCase;
  shouldGateAutonomy: boolean;
  to: JobStatus;
};

export async function cancelJob(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id",
  });
  const transition = validateWorkflowTransition({
    event: "cancel_requested",
    from: job.status as JobStatus,
    to: "cancelled",
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("cancel_job_before_accept_atomic", {
      p_job_id: jobId,
      p_customer_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể hủy yêu cầu", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể hủy yêu cầu", 500);
  if (!row.ok) mapCancelError(nullableString(row.error_code));

  await logJobEvent(
    client,
    jobId,
    "customer_cancelled_before_accept",
    ctx,
    job.status as JobStatus,
    "cancelled",
  );
  return { job_id: jobId, status: row.job_status as JobStatus };
}

export async function requestCustomerCancellation(
  ctx: MobileApiContext,
  jobId: string,
  input: CustomerCancellationRequestInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id, worker_id, scheduled_at",
  });
  const readExistingCancellation = async (jobStatus: JobStatus) => {
    const existing = await dbQuery<Record<string, unknown>>(
      client
        .from("customer_cancellation_records")
        .select(
          "id, status, job_id, sub_case, reason_code, reason_category, worker_id, admin_review_required, phase0_no_monetary_penalty, worker_goodwill, abuse_signals, created_at",
        )
        .eq("job_id", jobId)
        .eq("customer_id", ctx.user.id)
        .in("status", ["requested", "dispute_pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (existing.error || !existing.data) return null;

    const cancellationId = asString(existing.data.id);
    const subCase = asCustomerCancellationSubCase(existing.data.sub_case);
    const reasonCode = nullableString(existing.data.reason_code) ?? input.reason_code;
    await recordCustomerCancellationReview(client, {
      jobId,
      customerId: ctx.user.id,
      cancellationId,
    }).catch(() => {
      console.warn("mobile-api customer cancellation memory repair failed", {
        jobId,
        cancellationId,
      });
    });
    return {
      cancellation_id: cancellationId,
      job_id: jobId,
      status: "requested" as const,
      job_status: jobStatus,
      sub_case: subCase,
      reason_code: reasonCode,
      reason_category: nullableString(existing.data.reason_category) ?? "needs_admin_review",
      admin_review_required: asBoolean(existing.data.admin_review_required),
      phase0_no_monetary_penalty: asBoolean(existing.data.phase0_no_monetary_penalty),
      worker_goodwill: nullableRecord(existing.data.worker_goodwill) ??
        buildCustomerCancellationPhase0Outcome({
          subCase,
          reasonCode,
          workerId: nullableString(existing.data.worker_id),
        }).workerGoodwill,
      abuse_signals: asCustomerCancellationAbuseSignals(existing.data.abuse_signals),
      message: "Yêu cầu hủy đang được xử lý.",
      created_at: asString(existing.data.created_at),
    };
  };
  const command = validateWorkflowCommand({
    event: "customer_cancellation_requested",
    status: job.status as JobStatus,
  });
  if (!command.valid) {
    const existing = await readExistingCancellation(job.status as JobStatus);
    if (existing) return existing;
    apiFailure("INVALID_STATUS", command.error, 409);
  }
  const existingCancellation = await readExistingCancellation(job.status as JobStatus);
  if (existingCancellation) return existingCancellation;

  const cancellationPreview = previewCustomerCancellation(job);
  if (!cancellationPreview) {
    apiFailure("INVALID_STATUS", "Cannot determine safe cancellation flow", 409);
  }
  const preAutonomy = await gateCustomerCancellationBeforeMutation({
    client,
    ctx,
    job,
    jobId,
    preview: cancellationPreview,
    request: input,
  });

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("request_customer_cancellation_atomic", {
      p_job_id: jobId,
      p_customer_id: ctx.user.id,
      p_reason_code: input.reason_code,
      p_reason_note: input.reason_note ?? null,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy", 500);
  if (!row.ok) {
    const errorCode = nullableString(row.error_code);
    if (errorCode === "ALREADY_REQUESTED") {
      const existing = await readExistingCancellation(asJobStatus(row.job_status ?? job.status));
      if (existing) return existing;
    }
    mapCustomerCancellationError(errorCode);
  }

  const cancellationId = asString(row.cancellation_id);
  const subCase = asCustomerCancellationSubCase(row.sub_case);
  const reasonCode = nullableString(row.reason_code) ?? input.reason_code;
  const localClassification = classifyCustomerCancellationReason({
    reasonCode,
    reason: input.reason_note ?? reasonCode,
  });
  const reasonCategory = nullableString(row.reason_category) ??
    localClassification.category;
  const abuseSignals = asCustomerCancellationAbuseSignals(row.abuse_signals);
  const abuse = customerCancellationAbuseFromSignals(abuseSignals);
  const adminReviewRequired = asBoolean(row.admin_review_required) ||
    localClassification.adminReviewRequired ||
    abuse.adminReviewRequired ||
    subCase === "after_worker_completed_trigger_dispute";
  const workerIdFromRow = nullableString(row.worker_id_out);
  const phase0Outcome = buildCustomerCancellationPhase0Outcome({
    subCase,
    reasonCode,
    workerId: workerIdFromRow,
  });
  const workerGoodwill = nullableRecord(row.worker_goodwill) ??
    phase0Outcome.workerGoodwill;
  const jobStatus = row.job_status as JobStatus | undefined;
  const resultingJobStatus = jobStatus ?? "cancelled";
  const autonomyDecision = preAutonomy?.decision ?? null;
  const autonomyRun = preAutonomy?.run ?? null;

  await logJobEvent(
    client,
    jobId,
    "customer_requested_cancellation",
    ctx,
    null,
    jobStatus ?? null,
    {
      cancellation_id: cancellationId,
      sub_case: subCase,
      reason_code: reasonCode,
      reason_category: reasonCategory,
      abuse_signals: abuseSignals,
      admin_review_required: adminReviewRequired,
      phase0_no_monetary_penalty: true,
      worker_goodwill: workerGoodwill,
      ...(autonomyDecision
        ? {
          autonomy_decision: autonomyDecision,
          autonomy_gate_result: autonomyRun?.gate.result ?? null,
          autonomy_transition_valid: autonomyRun?.gate.result === "allow",
          ...(autonomyRun?.gate.result !== "allow"
            ? { autonomy_transition_error: autonomyRun?.gate.audit.reason_code ?? "AUTONOMY_GATE_NOT_RUN" }
            : {}),
        }
        : {}),
    },
  );
  if (autonomyDecision && autonomyRun?.gate.result === "allow") {
    await logJobEvent(
      client,
      jobId,
      "kael_processed_cancellation",
      ctx,
      job.status as JobStatus,
      resultingJobStatus,
      {
        cancellation_id: cancellationId,
        sub_case: subCase,
        autonomy_decision: autonomyDecision,
      },
    );
  }

  const participants = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select("customer_id, worker_id")
      .eq("id", jobId)
      .maybeSingle(),
  );
  if (participants.error) {
    console.warn("mobile-api cancellation participant lookup failed", {
      jobId,
      errorCode: participants.error.code,
    });
  }
  const customerId = nullableString(participants.data?.customer_id) ?? ctx.user.id;
  const workerId = workerIdFromRow ?? nullableString(participants.data?.worker_id);

  await recordCustomerCancellationReview(client, {
    jobId,
    customerId,
    cancellationId,
  }).catch(() => {
    console.warn("mobile-api customer cancellation review write failed", {
      jobId,
      cancellationId,
    });
  });

  if (workerId && (subCase === "after_worker_accept" || subCase === "scheduled_job")) {
    await notifyWorkerCustomerCancellation(client, jobId, workerId, subCase);
  }

  return {
    cancellation_id: cancellationId,
    job_id: jobId,
    status: "requested" as const,
    job_status: resultingJobStatus,
    sub_case: subCase,
    reason_code: reasonCode,
    reason_category: reasonCategory,
    admin_review_required: adminReviewRequired,
    phase0_no_monetary_penalty: true,
    worker_goodwill: workerGoodwill,
    abuse_signals: abuseSignals,
    message: subCase === "after_worker_completed_trigger_dispute"
      ? "Đã ghi nhận hủy sau hoàn tất để chuyển sang kiểm tra tranh chấp."
      : "Đã ghi nhận yêu cầu hủy. Phase 0 không tự tính phí hủy.",
    created_at: asString(row.created_at_ts),
  };
}

function previewCustomerCancellation(
  job: JobAccessRecord,
  now = new Date(),
): CustomerCancellationPreview | null {
  const status = job.status as JobStatus;
  if (status === "completed_by_worker") {
    return {
      subCase: "after_worker_completed_trigger_dispute",
      shouldGateAutonomy: false,
      to: status,
    };
  }
  if (isFutureTimestamp(job.scheduled_at, now)) {
    return { subCase: "scheduled_job", shouldGateAutonomy: true, to: "cancelled" };
  }
  if (status === "awaiting_customer_confirm") {
    return { subCase: "before_a7", shouldGateAutonomy: true, to: "cancelled" };
  }
  if (status === "broadcasting") {
    return { subCase: "after_a7_before_worker_accept", shouldGateAutonomy: true, to: "cancelled" };
  }
  if (
    status === "worker_matched" ||
    status === "worker_on_way" ||
    status === "arrived" ||
    status === "inspecting" ||
    status === "repairing" ||
    status === "scope_change_pending"
  ) {
    return { subCase: "after_worker_accept", shouldGateAutonomy: true, to: "cancelled" };
  }
  return null;
}

function isFutureTimestamp(value: unknown, now: Date) {
  const text = nullableString(value);
  if (!text) return false;
  const time = Date.parse(text);
  return Number.isFinite(time) && time > now.getTime();
}

async function gateCustomerCancellationBeforeMutation(input: {
  client: DbClient;
  ctx: MobileApiContext;
  job: JobAccessRecord;
  jobId: string;
  preview: CustomerCancellationPreview;
  request: CustomerCancellationRequestInput;
}) {
  if (!input.preview.shouldGateAutonomy) return null;
  const localClassification = classifyCustomerCancellationReason({
    reasonCode: input.request.reason_code,
    reason: input.request.reason_note ?? input.request.reason_code,
  });
  const decision = buildKaelAutonomyDecision({
    action: "process_cancellation",
    policyId: `kael.autonomy.v2.customer_cancel_${input.preview.subCase}`,
    evidence: [
      {
        kind: "customer_input",
        reference_id: input.ctx.user.id,
        summary: "Customer cancellation input was validated before any cancellation mutation.",
      },
      {
        kind: "job_event",
        reference_id: input.jobId,
        summary: "Current job phase predicts the cancellation outcome before the atomic RPC.",
      },
      {
        kind: "policy",
        reference_id: "STRUCTURES.md#cancellation",
        summary: "Kael processes cancellation only after the autonomy gate allows the transition.",
      },
    ],
    confidence: localClassification.adminReviewRequired ? 0.68 : 0.84,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_processed_cancellation",
  });
  const run = await runPolicyAutonomyGate({
    label: "customer_process_cancellation",
    client: input.client,
    ctx: input.ctx,
    jobId: input.jobId,
    decision,
    from: input.job.status as JobStatus,
    to: input.preview.to,
    authority: {
      purpose: "scope_change",
      actor: input.ctx.role,
      jobRelation: "own_customer_job",
      action: "review_scope_change",
      topic: "job_status",
      intentConfidence: 1,
      topicSource: "deterministic_rule",
      boundarySignal: false,
      actorId: input.ctx.user.id,
      jobId: input.jobId,
    },
    knownEvidenceReferences: [input.ctx.user.id, input.jobId, "STRUCTURES.md#cancellation"],
  });
  if (run.gate.result !== "allow") {
    apiFailure("INVALID_STATUS", run.gate.audit.reason_code, 409);
  }
  return { decision, run };
}
