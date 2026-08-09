// Edge service customer-cancellation domain (C4 6a, services/* split): customer cancel flows —
// early cancel-before-accept (cancelJob) + the Phase-0 cancellation request with autonomy gating,
// preview, classification + worker-goodwill outcome. Imported by services.ts for wiring.

import { asBoolean, asCustomerCancellationAbuseSignals, asCustomerCancellationSubCase, asJobStatus, asString, nullableRecord, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { mapCancelError, mapCustomerCancellationError } from "../../platform/domain-error-mappers.ts";
import { logJobEvent } from "../../platform/audit.ts";
import { runPolicyAutonomyGate } from "../../kael/agents/autonomy-gate.ts";
import { notifyWorkerCustomerCancellation } from "../notification/notifications.ts";
import { requireJobAccess, type JobAccessRecord } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { requireNonOperatorWorkflowRole } from "../../platform/authz/workflow-role.ts";
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
  const command = validateWorkflowCommand({
    event: "customer_cancellation_requested",
    status: job.status as JobStatus,
  });
  if (!command.valid) {
    const existing = await readExistingCustomerCancellation({
      client, ctx, jobId, request: input, jobStatus: job.status as JobStatus,
    });
    if (existing) return existing;
    apiFailure("INVALID_STATUS", command.error, 409);
  }
  const existingCancellation = await readExistingCustomerCancellation({
    client, ctx, jobId, request: input, jobStatus: job.status as JobStatus,
  });
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
      const existing = await readExistingCustomerCancellation({
        client,
        ctx,
        jobId,
        request: input,
        jobStatus: asJobStatus(row.job_status ?? job.status),
      });
      if (existing) return existing;
    }
    mapCustomerCancellationError(errorCode);
  }
  return finalizeCustomerCancellationRequest({
    client, ctx, job, jobId, request: input, preAutonomy, row,
  });
}

async function readExistingCustomerCancellation(input: {
  client: DbClient;
  ctx: MobileApiContext;
  jobId: string;
  request: CustomerCancellationRequestInput;
  jobStatus: JobStatus;
}) {
  const existing = await dbQuery<Record<string, unknown>>(
    input.client
      .from("customer_cancellation_records")
      .select("id, status, job_id, sub_case, reason_code, reason_category, worker_id, admin_review_required, phase0_no_monetary_penalty, worker_goodwill, abuse_signals, created_at")
      .eq("job_id", input.jobId)
      .eq("customer_id", input.ctx.user.id)
      .in("status", ["requested", "dispute_pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (existing.error || !existing.data) return null;
  const cancellationId = asString(existing.data.id);
  const subCase = asCustomerCancellationSubCase(existing.data.sub_case);
  const reasonCode = nullableString(existing.data.reason_code) ?? input.request.reason_code;
  await recordCustomerCancellationReview(input.client, {
    jobId: input.jobId, customerId: input.ctx.user.id, cancellationId,
  }).catch(() => {
    console.warn("mobile-api customer cancellation memory repair failed", {
      jobId: input.jobId, cancellationId,
    });
  });
  return {
    cancellation_id: cancellationId,
    job_id: input.jobId,
    status: "requested" as const,
    job_status: input.jobStatus,
    sub_case: subCase,
    reason_code: reasonCode,
    reason_category: nullableString(existing.data.reason_category) ?? "needs_admin_review",
    admin_review_required: asBoolean(existing.data.admin_review_required),
    phase0_no_monetary_penalty: asBoolean(existing.data.phase0_no_monetary_penalty),
    worker_goodwill: nullableRecord(existing.data.worker_goodwill) ??
      buildCustomerCancellationPhase0Outcome({
        subCase, reasonCode, workerId: nullableString(existing.data.worker_id),
      }).workerGoodwill,
    abuse_signals: asCustomerCancellationAbuseSignals(existing.data.abuse_signals),
    message: "Yêu cầu hủy đang được xử lý.",
    created_at: asString(existing.data.created_at),
  };
}

async function finalizeCustomerCancellationRequest(input: {
  client: DbClient;
  ctx: MobileApiContext;
  job: JobAccessRecord;
  jobId: string;
  request: CustomerCancellationRequestInput;
  preAutonomy: Awaited<ReturnType<typeof gateCustomerCancellationBeforeMutation>>;
  row: Record<string, unknown>;
}) {
  const cancellationId = asString(input.row.cancellation_id);
  const subCase = asCustomerCancellationSubCase(input.row.sub_case);
  const reasonCode = nullableString(input.row.reason_code) ?? input.request.reason_code;
  const localClassification = classifyCustomerCancellationReason({
    reasonCode, reason: input.request.reason_note ?? reasonCode,
  });
  const reasonCategory = nullableString(input.row.reason_category) ?? localClassification.category;
  const abuseSignals = asCustomerCancellationAbuseSignals(input.row.abuse_signals);
  const adminReviewRequired = asBoolean(input.row.admin_review_required) ||
    localClassification.adminReviewRequired ||
    customerCancellationAbuseFromSignals(abuseSignals).adminReviewRequired ||
    subCase === "after_worker_completed_trigger_dispute";
  const workerIdFromRow = nullableString(input.row.worker_id_out);
  const workerGoodwill = nullableRecord(input.row.worker_goodwill) ??
    buildCustomerCancellationPhase0Outcome({ subCase, reasonCode, workerId: workerIdFromRow }).workerGoodwill;
  const jobStatus = input.row.job_status as JobStatus | undefined;
  const resultingJobStatus = jobStatus ?? "cancelled";
  const autonomyDecision = input.preAutonomy?.decision ?? null;
  const autonomyRun = input.preAutonomy?.run ?? null;
  await logCustomerCancellationEvents({
    ...input, cancellationId, subCase, reasonCode, reasonCategory, abuseSignals,
    adminReviewRequired, workerGoodwill, jobStatus, resultingJobStatus, autonomyDecision, autonomyRun,
  });
  const participants = await loadCancellationParticipants(input.client, input.jobId);
  const customerId = nullableString(participants.data?.customer_id) ?? input.ctx.user.id;
  const workerId = workerIdFromRow ?? nullableString(participants.data?.worker_id);
  await recordCustomerCancellationReview(input.client, {
    jobId: input.jobId, customerId, cancellationId,
  }).catch(() => console.warn("mobile-api customer cancellation review write failed", {
    jobId: input.jobId, cancellationId,
  }));
  if (workerId && (subCase === "after_worker_accept" || subCase === "scheduled_job")) {
    await notifyWorkerCustomerCancellation(input.client, input.jobId, workerId, subCase);
  }
  return {
    cancellation_id: cancellationId, job_id: input.jobId, status: "requested" as const,
    job_status: resultingJobStatus, sub_case: subCase, reason_code: reasonCode,
    reason_category: reasonCategory, admin_review_required: adminReviewRequired,
    phase0_no_monetary_penalty: true, worker_goodwill: workerGoodwill, abuse_signals: abuseSignals,
    message: subCase === "after_worker_completed_trigger_dispute"
      ? "Đã ghi nhận hủy sau hoàn tất để chuyển sang kiểm tra tranh chấp."
      : "Đã ghi nhận yêu cầu hủy. Phase 0 không tự tính phí hủy.",
    created_at: asString(input.row.created_at_ts),
  };
}

async function logCustomerCancellationEvents(input: {
  client: DbClient;
  ctx: MobileApiContext;
  job: JobAccessRecord;
  jobId: string;
  cancellationId: string;
  subCase: CustomerCancellationSubCase;
  reasonCode: string;
  reasonCategory: string;
  abuseSignals: ReturnType<typeof asCustomerCancellationAbuseSignals>;
  adminReviewRequired: boolean;
  workerGoodwill: Record<string, unknown>;
  jobStatus: JobStatus | undefined;
  resultingJobStatus: JobStatus;
  autonomyDecision: unknown;
  autonomyRun: Awaited<ReturnType<typeof gateCustomerCancellationBeforeMutation>> extends infer T ? T extends { run?: infer R } ? R : null : null;
}) {
  await logJobEvent(input.client, input.jobId, "customer_requested_cancellation", input.ctx, null, input.jobStatus ?? null, {
    cancellation_id: input.cancellationId, sub_case: input.subCase, reason_code: input.reasonCode,
    reason_category: input.reasonCategory, abuse_signals: input.abuseSignals,
    admin_review_required: input.adminReviewRequired, phase0_no_monetary_penalty: true,
    worker_goodwill: input.workerGoodwill,
    ...(input.autonomyDecision
      ? {
        autonomy_decision: input.autonomyDecision,
        autonomy_gate_result: input.autonomyRun?.gate.result ?? null,
        autonomy_transition_valid: input.autonomyRun?.gate.result === "allow",
        ...(input.autonomyRun?.gate.result !== "allow"
          ? { autonomy_transition_error: input.autonomyRun?.gate.audit.reason_code ?? "AUTONOMY_GATE_NOT_RUN" }
          : {}),
      }
      : {}),
  });
  if (input.autonomyDecision && input.autonomyRun?.gate.result === "allow") {
    await logJobEvent(input.client, input.jobId, "kael_processed_cancellation", input.ctx,
      input.job.status as JobStatus, input.resultingJobStatus, {
        cancellation_id: input.cancellationId, sub_case: input.subCase,
        autonomy_decision: input.autonomyDecision,
      });
  }
}

async function loadCancellationParticipants(client: DbClient, jobId: string) {
  const participants = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("customer_id, worker_id").eq("id", jobId).maybeSingle(),
  );
  if (participants.error) {
    console.warn("mobile-api cancellation participant lookup failed", {
      jobId, errorCode: participants.error.code,
    });
  }
  return participants;
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
      actor: requireNonOperatorWorkflowRole(input.ctx),
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
