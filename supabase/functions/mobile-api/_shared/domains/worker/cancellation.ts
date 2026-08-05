// Edge service worker-cancellation domain: worker cancel-request flow with autonomy gating,
// classification, and (on approve) apartment-access reset + replacement re-broadcast via
// createBroadcasts. Imported by services.ts for wiring.

import { asBoolean, asJobStatus, asString, asWorkerCancellationAbuseSignals, asWorkerCancellationCategory, asWorkerCancellationReasonCode, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { validateJobEvidenceRefs } from "../job/evidence-refs.ts";
import { mapWorkerCancellationRequestError } from "../../platform/domain-error-mappers.ts";
import { logJobEvent } from "../../platform/audit.ts";
import { runPolicyAutonomyGate } from "../../kael/agents/autonomy-gate.ts";
import { notifyCustomerWorkerReplacementSearch } from "../notification/notifications.ts";
import { createBroadcasts, listBroadcastRecipientWorkerIds } from "../matching/broadcasts.ts";
import { requireJobAccess, type JobAccessRecord } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { validateWorkflowCommand } from "../../workflow-orchestrator.ts";
import { buildKaelAutonomyDecision, buildWorkerCancellationFallbackOptions, classifyWorkerCancellationReason, recordWorkerCancellationReview } from "../../kael/index.ts";
import { normalizeServiceAreaDistrict } from "../../../../_shared/domain.ts";
import type { JobStatus, ServiceType, WorkerCancellationRequestInput } from "../../../../_shared/domain.ts";

export async function requestWorkerCancellation(
  ctx: MobileApiContext,
  jobId: string,
  input: WorkerCancellationRequestInput,
) {
  const client = db(ctx);
  let job: Awaited<ReturnType<typeof requireJobAccess>>;
  try {
    job = await requireJobAccess(client, jobId, ctx, {
      requiredRole: "worker",
    });
  } catch (error: unknown) {
    const errorCode = typeof error === "object" && error !== null
      ? nullableString((error as { code?: unknown }).code)
      : null;
    if (ctx.role === "worker" && errorCode === "NOT_FOUND") {
      const existing = await readExistingWorkerCancellation({
        client, ctx, jobId, jobStatus: "broadcasting",
      });
      if (existing?.status === "approved") return existing;
    }
    throw error;
  }
  const command = validateWorkflowCommand({
    event: "worker_cancellation_requested",
    status: job.status as JobStatus,
  });
  if (!command.valid) apiFailure("INVALID_STATUS", command.error, 409);
  const existingCancellation = await readExistingWorkerCancellation({
    client, ctx, jobId, jobStatus: job.status as JobStatus,
  });
  if (existingCancellation) return existingCancellation;
  const evidencePhotoRefs = await validateJobEvidenceRefs(client, {
    jobId,
    mediaRefs: input.evidence_photo_urls,
    allowedStages: ["cancellation_evidence"],
    ownerId: ctx.user.id,
  });
  const validatedInput = { ...input, evidence_photo_urls: evidencePhotoRefs };
  const preAutonomy = await gateWorkerCancellationBeforeMutation({
    client,
    ctx,
    job,
    jobId,
    request: validatedInput,
  });

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("request_worker_cancellation_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
      p_reason: validatedInput.reason,
      p_evidence_photo_urls: validatedInput.evidence_photo_urls,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy việc", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy việc", 500);
  if (!row.ok) {
    const errorCode = nullableString(row.error_code);
    if (errorCode === "ALREADY_REQUESTED") {
      const existing = await readExistingWorkerCancellation({
        client,
        ctx,
        jobId,
        jobStatus: asJobStatus(row.job_status ?? job.status),
      });
      if (existing) return existing;
    }
    mapWorkerCancellationRequestError(errorCode);
  }
  return finalizeWorkerCancellationRequest({ client, ctx, job, jobId, preAutonomy, row });
}

async function readExistingWorkerCancellation(input: {
  client: DbClient;
  ctx: MobileApiContext;
  jobId: string;
  jobStatus: JobStatus;
}) {
  const existing = await dbQuery<Record<string, unknown>>(
    input.client
      .from("worker_cancellation_requests")
      .select("id, status, created_at, reason_code, reason_category, admin_review_required, fallback_options, abuse_signals")
      .eq("job_id", input.jobId)
      .eq("worker_id", input.ctx.user.id)
      .in("status", ["requested", "reviewing_by_kael", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (existing.error || !existing.data) return null;
  const cancellationId = asString(existing.data.id);
  const cancellationStatus = nullableString(existing.data.status) ?? "reviewing_by_kael";
  if (cancellationStatus === "approved") {
    await recordWorkerCancellationReview(input.client, {
      jobId: input.jobId, workerId: input.ctx.user.id, cancellationId, subCase: "explicit_cancel",
    }).catch(() => console.warn("mobile-api worker cancellation memory repair failed", {
      jobId: input.jobId, cancellationId,
    }));
  }
  return {
    cancellation_id: cancellationId, job_id: input.jobId, status: cancellationStatus,
    job_status: input.jobStatus, broadcast_sent: false,
    message: "Yêu cầu hủy việc đang được xử lý.", created_at: asString(existing.data.created_at),
    reason_code: asWorkerCancellationReasonCode(existing.data.reason_code) ?? "changed_mind",
    reason_category: asWorkerCancellationCategory(existing.data.reason_category) ?? "suspicious",
    admin_review_required: asBoolean(existing.data.admin_review_required),
    abuse_signals: asWorkerCancellationAbuseSignals(existing.data.abuse_signals),
    fallback_options: asWorkerCancellationFallbackOptions(existing.data.fallback_options),
  };
}

async function finalizeWorkerCancellationRequest(input: {
  client: DbClient;
  ctx: MobileApiContext;
  job: JobAccessRecord;
  jobId: string;
  preAutonomy: Awaited<ReturnType<typeof gateWorkerCancellationBeforeMutation>>;
  row: Record<string, unknown>;
}) {
  const details = buildWorkerCancellationDetails(input.row, input.preAutonomy);
  const replacement = details.cancellationStatus === "approved"
    ? await restartReplacementSearch(input, details.cancellationId)
    : { broadcastSent: false, message: "Đã gửi yêu cầu hủy việc." };
  await logWorkerCancellationEvents({ ...input, ...details, ...replacement });
  if (details.cancellationStatus === "approved") {
    await recordWorkerCancellationReview(input.client, {
      jobId: input.jobId,
      workerId: nullableString(input.row.worker_id_out) ?? input.ctx.user.id,
      cancellationId: details.cancellationId,
      subCase: "explicit_cancel",
    }).catch(() => console.warn("mobile-api worker cancellation review write failed", {
      jobId: input.jobId, cancellationId: details.cancellationId,
    }));
  }
  return {
    cancellation_id: details.cancellationId, job_id: input.jobId,
    status: details.cancellationStatus,
    job_status: details.jobStatus ?? (input.job.status as JobStatus),
    broadcast_sent: replacement.broadcastSent, message: replacement.message,
    created_at: asString(input.row.created_at_ts), reason_code: details.reasonCode,
    reason_category: details.reasonCategory,
    admin_review_required: details.abuse.adminReviewRequired,
    abuse_signals: details.abuseSignals, fallback_options: details.fallbackOptions,
  };
}

function buildWorkerCancellationDetails(
  row: Record<string, unknown>,
  preAutonomy: Awaited<ReturnType<typeof gateWorkerCancellationBeforeMutation>>,
) {
  const cancellationStatus = asString(row.cancellation_status);
  const jobStatus = row.job_status as JobStatus | undefined;
  const localClassification = preAutonomy.localClassification;
  const reasonCategory = asWorkerCancellationCategory(row.reason_category) ?? localClassification.category;
  const reasonCode = asWorkerCancellationReasonCode(row.reason_code) ?? localClassification.reasonCode;
  const adminReviewRequired = asBoolean(row.admin_review_required) || reasonCategory !== "legit_auto_approve";
  const abuseSignals = asWorkerCancellationAbuseSignals(row.abuse_signals);
  const redFlagPatch: Record<string, boolean> = adminReviewRequired || abuseSignals.length > 0
    ? { worker_cancellation_abuse_review: true }
    : {};
  const abuse = {
    cancellationRate: 0, signals: abuseSignals,
    adminReviewRequired: adminReviewRequired || abuseSignals.length > 0,
    queuePriority: adminReviewRequired || abuseSignals.length > 0 ? "medium" as const : "none" as const,
    suspensionAction: adminReviewRequired || abuseSignals.length > 0
      ? "admin_review_required" as const : "none" as const,
    redFlagPatch,
  };
  return {
    cancellationId: asString(row.cancellation_id), cancellationStatus, jobStatus,
    reasonCategory, reasonCode, abuseSignals,
    fallbackOptions: asWorkerCancellationFallbackOptions(row.fallback_options), abuse,
    autonomyDecision: cancellationStatus === "approved" ? preAutonomy.decision : null,
    autonomyRun: cancellationStatus === "approved" ? preAutonomy.run : null,
  };
}

async function restartReplacementSearch(
  input: Pick<Parameters<typeof finalizeWorkerCancellationRequest>[0], "client" | "ctx" | "job" | "jobId" | "row">,
  cancellationId: string,
) {
  const accessReset = await dbQuery(
    input.client.from("jobs").update({ apartment_access_state: {} }).eq("id", input.jobId).select("id").maybeSingle(),
  );
  if (accessReset.error) {
    console.warn("mobile-api apartment access reset failed after worker cancellation", {
      jobId: input.jobId, errorCode: accessReset.error.code,
    });
  }
  let broadcastSent = false;
  let message = "Đã hủy việc và đang tìm thợ thay thế.";
  const district = normalizeServiceAreaDistrict(nullableString(input.row.district_code) ?? "");
  if (district) {
    const previousRecipients = await listBroadcastRecipientWorkerIds(input.client, input.jobId);
    if (!previousRecipients.success) message = previousRecipients.reason;
    else {
      const cancelledWorkerId = nullableString(input.row.worker_id_out) ?? input.ctx.user.id;
      const excludeWorkerIds = Array.from(new Set([cancelledWorkerId, ...previousRecipients.workerIds]));
      const broadcast = await createBroadcasts(
        input.client, input.jobId, input.row.service_type_out as ServiceType, district, { excludeWorkerIds },
      );
      broadcastSent = broadcast.success;
      message = broadcast.success
        ? `Đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ thay thế.`
        : broadcast.reason;
    }
  } else {
    message = "Đã hủy việc nhưng địa chỉ cần có quận TP.HCM rõ ràng để tìm thợ thay thế.";
  }
  await notifyCustomerWorkerReplacementSearch(
    input.client, input.jobId, nullableString(input.job.customer_id), broadcastSent,
  );
  void cancellationId;
  return { broadcastSent, message };
}

async function logWorkerCancellationEvents(input: {
  client: DbClient;
  ctx: MobileApiContext;
  job: JobAccessRecord;
  jobId: string;
  cancellationId: string;
  cancellationStatus: string;
  jobStatus: JobStatus | undefined;
  reasonCategory: string;
  reasonCode: string;
  abuseSignals: ReturnType<typeof asWorkerCancellationAbuseSignals>;
  abuse: ReturnType<typeof buildWorkerCancellationDetails>["abuse"];
  autonomyDecision: ReturnType<typeof buildWorkerCancellationDetails>["autonomyDecision"];
  autonomyRun: ReturnType<typeof buildWorkerCancellationDetails>["autonomyRun"];
  broadcastSent: boolean;
}) {
  await logJobEvent(input.client, input.jobId, "worker_requested_cancellation", input.ctx, null, null, {
    cancellation_id: input.cancellationId, cancellation_status: input.cancellationStatus,
    broadcast_sent: input.broadcastSent, reason_code: input.reasonCode,
    reason_category: input.reasonCategory, abuse_signals: input.abuseSignals,
    admin_review_required: input.abuse.adminReviewRequired,
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
      input.job.status as JobStatus, (input.jobStatus ?? input.job.status) as JobStatus, {
        cancellation_id: input.cancellationId, broadcast_sent: input.broadcastSent,
        autonomy_decision: input.autonomyDecision,
      });
  }
}

async function gateWorkerCancellationBeforeMutation(input: {
  client: DbClient;
  ctx: MobileApiContext;
  job: JobAccessRecord;
  jobId: string;
  request: WorkerCancellationRequestInput;
}) {
  const localClassification = classifyWorkerCancellationReason({
    reason: input.request.reason,
    evidencePhotoUrls: input.request.evidence_photo_urls,
  });
  const decision = buildKaelAutonomyDecision({
    action: "process_cancellation",
    policyId: "kael.autonomy.v2.worker_cancel_to_rematch",
    evidence: [
      {
        kind: "worker_evidence",
        reference_id: input.ctx.user.id,
        summary: "Worker cancellation input was classified before any release or rebroadcast mutation.",
      },
      {
        kind: "job_event",
        reference_id: input.jobId,
        summary: "Current worker assignment is checked before replacement matching.",
      },
      {
        kind: "policy",
        reference_id: "docs/workflow/worker-cancellation.md",
        summary: "Approved worker cancellation may start replacement matching only after the autonomy gate allows it.",
      },
    ],
    confidence: localClassification.autoApprove ? 0.92 : 0.72,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_processed_cancellation",
  });
  const run = await runPolicyAutonomyGate({
    label: "worker_process_cancellation",
    client: input.client,
    ctx: input.ctx,
    jobId: input.jobId,
    decision,
    from: input.job.status as JobStatus,
    to: "broadcasting",
    authority: {
      purpose: "scope_change",
      actor: input.ctx.role,
      jobRelation: "own_worker_job",
      action: "review_scope_change",
      topic: "job_status",
      intentConfidence: 1,
      topicSource: "deterministic_rule",
      boundarySignal: false,
      actorId: input.ctx.user.id,
      jobId: input.jobId,
    },
    knownEvidenceReferences: [input.ctx.user.id, input.jobId, "docs/workflow/worker-cancellation.md"],
  });
  if (run.gate.result !== "allow") {
    apiFailure("INVALID_STATUS", run.gate.audit.reason_code, 409);
  }
  return { decision, localClassification, run };
}

function asWorkerCancellationFallbackOptions(value: unknown) {
  if (!Array.isArray(value)) return buildWorkerCancellationFallbackOptions();
  const safe = value
    .filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item)
    )
    .map((item) => ({
      ...item,
      id: asString(item.id),
      label_vi: asString(item.label_vi),
      effect: asString(item.effect),
    }))
    .filter((item) =>
      item.id === "wait_15_minutes" ||
      item.id === "reschedule" ||
      item.id === "cancel_no_charge"
    );
  return safe.length > 0 ? safe : buildWorkerCancellationFallbackOptions();
}
