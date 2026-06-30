// Edge service worker-cancellation domain (C4 6a, services/* split): worker cancel-request flow with
// autonomy gating, classification, and (on approve) apartment-access reset + replacement re-broadcast via
// createBroadcasts; decideWorkerCancellation is the deprecated 410 stub. Imported by services.ts for wiring.

import { asBoolean, asJobStatus, asString, asWorkerCancellationAbuseSignals, asWorkerCancellationCategory, asWorkerCancellationReasonCode, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { mapWorkerCancellationRequestError } from "./_shared.ts";
import { logJobEvent } from "./audit.ts";
import { runPolicyAutonomyGate } from "./autonomy-gate.ts";
import { notifyCustomerWorkerReplacementSearch } from "./notifications.service.ts";
import { createBroadcasts, listBroadcastRecipientWorkerIds } from "./broadcasts.service.ts";
import { requireJobAccess, type JobAccessRecord } from "../access.ts";
import { apiFailure, type MobileApiContext, type MobileApiServices } from "../router.ts";
import { validateWorkflowCommand } from "../workflow-orchestrator.ts";
import { buildKaelAutonomyDecision, buildWorkerCancellationFallbackOptions, classifyWorkerCancellationReason, recordWorkerCancellationReview } from "../kael/index.ts";
import { normalizeServiceAreaDistrict } from "../../../_shared/domain.ts";
import type { JobStatus, ServiceType, WorkerCancellationRequestInput, WorkerCancellationDecisionInput } from "../../../_shared/domain.ts";

export async function requestWorkerCancellation(
  ctx: MobileApiContext,
  jobId: string,
  input: WorkerCancellationRequestInput,
) {
  const client = db(ctx);
  const readExistingCancellation = async (jobStatus: JobStatus) => {
    const existing = await dbQuery<Record<string, unknown>>(
      client
        .from("worker_cancellation_requests")
        .select(
          "id, status, created_at, reason_code, reason_category, admin_review_required, fallback_options, abuse_signals",
        )
        .eq("job_id", jobId)
        .eq("worker_id", ctx.user.id)
        .in("status", ["requested", "reviewing_by_kael", "approved"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (existing.error || !existing.data) return null;

    return {
      cancellation_id: asString(existing.data.id),
      job_id: jobId,
      status: nullableString(existing.data.status) ?? "reviewing_by_kael",
      job_status: jobStatus,
      broadcast_sent: false,
      message: "Yêu cầu hủy việc đang được xử lý.",
      created_at: asString(existing.data.created_at),
      reason_code: asWorkerCancellationReasonCode(existing.data.reason_code) ?? "changed_mind",
      reason_category: asWorkerCancellationCategory(existing.data.reason_category) ?? "suspicious",
      admin_review_required: asBoolean(existing.data.admin_review_required),
      abuse_signals: asWorkerCancellationAbuseSignals(existing.data.abuse_signals),
      fallback_options: asWorkerCancellationFallbackOptions(existing.data.fallback_options),
    };
  };
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
      const existing = await readExistingCancellation("broadcasting");
      if (existing?.status === "approved") return existing;
    }
    throw error;
  }
  const command = validateWorkflowCommand({
    event: "worker_cancellation_requested",
    status: job.status as JobStatus,
  });
  if (!command.valid) apiFailure("INVALID_STATUS", command.error, 409);
  const existingCancellation = await readExistingCancellation(job.status as JobStatus);
  if (existingCancellation) return existingCancellation;
  const preAutonomy = await gateWorkerCancellationBeforeMutation({
    client,
    ctx,
    job,
    jobId,
    request: input,
  });

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("request_worker_cancellation_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
      p_reason: input.reason,
      p_evidence_photo_urls: input.evidence_photo_urls,
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
      const existing = await readExistingCancellation(asJobStatus(row.job_status ?? job.status));
      if (existing) return existing;
    }
    mapWorkerCancellationRequestError(errorCode);
  }

  const cancellationId = asString(row.cancellation_id);
  const cancellationStatus = asString(row.cancellation_status);
  const jobStatus = row.job_status as JobStatus | undefined;
  const localClassification = preAutonomy.localClassification;
  const reasonCategory = asWorkerCancellationCategory(row.reason_category) ??
    localClassification.category;
  const reasonCode = asWorkerCancellationReasonCode(row.reason_code) ??
    localClassification.reasonCode;
  const adminReviewRequired = asBoolean(row.admin_review_required) ||
    reasonCategory !== "legit_auto_approve";
  const abuseSignals = asWorkerCancellationAbuseSignals(row.abuse_signals);
  const fallbackOptions = asWorkerCancellationFallbackOptions(row.fallback_options);
  const classification = {
    ...localClassification,
    category: reasonCategory,
    reasonCode,
    adminReviewRequired,
    autoApprove: !adminReviewRequired && reasonCategory === "legit_auto_approve",
  };
  const autonomyDecision = cancellationStatus === "approved" ? preAutonomy.decision : null;
  const autonomyRun = cancellationStatus === "approved" ? preAutonomy.run : null;
  const redFlagPatch: Record<string, boolean> = adminReviewRequired || abuseSignals.length > 0
    ? { worker_cancellation_abuse_review: true }
    : {};
  const abuse = {
    cancellationRate: 0,
    signals: abuseSignals,
    adminReviewRequired: adminReviewRequired || abuseSignals.length > 0,
    queuePriority: adminReviewRequired || abuseSignals.length > 0
      ? "medium" as const
      : "none" as const,
    suspensionAction: adminReviewRequired || abuseSignals.length > 0
      ? "admin_review_required" as const
      : "none" as const,
    redFlagPatch,
  };
  let broadcastSent = false;
  let message = cancellationStatus === "approved"
    ? "Đã hủy việc và đang tìm thợ thay thế."
    : "Đã gửi yêu cầu hủy việc.";

  if (cancellationStatus === "approved") {
    // §32.7 (Codex review PR #66): the replacement search reuses the job row, so the
    // cancelled worker's check-in (or an authorized unit release) must not carry over
    // to the next assignee. Fail-open with a warn — authorize is also defended by the
    // per-worker check-in binding, so a failed reset cannot release the unit by itself.
    const accessReset = await dbQuery(
      client
        .from("jobs")
        .update({ apartment_access_state: {} })
        .eq("id", jobId)
        .select("id")
        .maybeSingle(),
    );
    if (accessReset.error) {
      console.warn("mobile-api apartment access reset failed after worker cancellation", {
        jobId,
        errorCode: accessReset.error.code,
      });
    }
    const district = normalizeServiceAreaDistrict(nullableString(row.district_code) ?? "");
    if (district) {
      const previousRecipients = await listBroadcastRecipientWorkerIds(client, jobId);
      if (!previousRecipients.success) {
        message = previousRecipients.reason;
      } else {
        const cancelledWorkerId = nullableString(row.worker_id_out) ?? ctx.user.id;
        const excludeWorkerIds = Array.from(new Set([
          cancelledWorkerId,
          ...previousRecipients.workerIds,
        ]));
        const broadcast = await createBroadcasts(
          client,
          jobId,
          row.service_type_out as ServiceType,
          district,
          { excludeWorkerIds },
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
      client,
      jobId,
      nullableString(job.customer_id),
      broadcastSent,
    );
  }

  await logJobEvent(
    client,
    jobId,
    "worker_requested_cancellation",
    ctx,
    null,
    null,
    {
      cancellation_id: cancellationId,
      cancellation_status: cancellationStatus,
      broadcast_sent: broadcastSent,
      reason_code: reasonCode,
      reason_category: reasonCategory,
      abuse_signals: abuseSignals,
      admin_review_required: abuse.adminReviewRequired,
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
      (jobStatus ?? job.status) as JobStatus,
      {
        cancellation_id: cancellationId,
        broadcast_sent: broadcastSent,
        autonomy_decision: autonomyDecision,
      },
    );
  }
  if (cancellationStatus === "approved") {
    await recordWorkerCancellationReview(client, {
      jobId,
      workerId: nullableString(row.worker_id_out) ?? ctx.user.id,
      cancellationId,
      reason: input.reason,
      classification,
      abuse,
      subCase: "explicit_cancel",
    }).catch(() => {
      console.warn("mobile-api worker cancellation review write failed", {
        jobId,
        cancellationId,
      });
    });
  }
  return {
    cancellation_id: cancellationId,
    job_id: jobId,
    status: cancellationStatus,
    job_status: jobStatus ?? (job.status as JobStatus),
    broadcast_sent: broadcastSent,
    message,
    created_at: asString(row.created_at_ts),
    reason_code: reasonCode,
    reason_category: reasonCategory,
    admin_review_required: abuse.adminReviewRequired,
    abuse_signals: abuseSignals,
    fallback_options: fallbackOptions,
  };
}

export async function decideWorkerCancellation(
  ctx: MobileApiContext,
  cancellationId: string,
  input: WorkerCancellationDecisionInput,
): ReturnType<MobileApiServices["decideWorkerCancellation"]> {
  void ctx;
  void cancellationId;
  void input;
  apiFailure(
    "DEPRECATED",
    "Yêu cầu hủy việc của thợ đã được xử lý tự động ở endpoint hủy việc",
    410,
  );
  throw new Error("Unreachable after worker cancellation deprecation failure");
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
