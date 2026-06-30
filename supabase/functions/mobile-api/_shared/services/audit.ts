// Edge service audit & logging (C4 6a, services/* split): best-effort writes to job_events,
// kael_memory_audit, and api_logs, plus learning-queue dispatch. Re-exported through ./_shared.ts.

import { dbQuery, type DbClient } from "./db.ts";
import { nullableString } from "./coercions.ts";
import type { MobileApiContext } from "../router.ts";
import type { JobStatus } from "../../../_shared/domain.ts";
import { buildKaelOptimizationMetricRows, readKaelOptimizationFlags } from "../kael/cost-tracking.ts";
import {
  queueLearningForBatch,
  queueLearningSkillTriggers,
  type LearningSkillInput,
  type LearningSkillTrigger,
  type PipelineStageLog,
} from "../kael/index.ts";
import { auditKaelGuardrailTrip } from "../kael/self-check.ts";

export async function logJobEvent(
  client: DbClient,
  jobId: string,
  eventType: string,
  actor: MobileApiContext,
  fromStatus: JobStatus | null,
  toStatus: JobStatus | null,
  metadata: Record<string, unknown> = {},
) {
  await dbQuery(
    client.from("job_events").insert({
      job_id: jobId,
      actor_id: actor.user.id,
      actor_role: actor.role,
      event_type: eventType,
      from_status: fromStatus,
      to_status: toStatus,
      safe_metadata: metadata,
    }),
  ).catch(() => {
    console.warn("mobile-api job event log failed", { jobId, eventType });
  });
}

export async function auditGuardrailTripBestEffort(
  client: DbClient,
  input: {
    readonly jobId: string | null;
    readonly actorId: string | null;
    readonly actorRole: "customer" | "worker";
    readonly surface: string;
    readonly reason: string;
    readonly guardrailLabel?: string | null;
    readonly source:
      | "self_check"
      | "semantic_self_check"
      | "boundary_guard"
      | "autonomy_gate";
    readonly safeMetadata?: Record<string, unknown>;
  },
) {
  await auditKaelGuardrailTrip(client, {
    jobId: input.jobId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    surface: input.surface,
    reason: input.reason,
    guardrailLabel: input.guardrailLabel ?? null,
    source: input.source,
    safeMetadata: input.safeMetadata,
  }).catch((error) => {
    console.warn("mobile-api kael guardrail audit failed", {
      surface: input.surface,
      reason: input.reason,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  });
}

export function isWorkerAssistGuardrailReason(reason: string) {
  return reason === "MONEY_OR_STATUS_MUTATION" ||
    reason === "SELF_CHECK" ||
    reason === "semantic_guardrail" ||
    reason === "exact_vnd" ||
    reason === "language_mismatch" ||
    reason === "sentence_too_long" ||
    reason === "fear_language" ||
    reason === "absolute_claim" ||
    reason === "ai_self_reference" ||
    reason === "accusatory_in_dispute" ||
    reason === "aggressive_response";
}

export async function queueKaelLearningEvent(
  client: DbClient,
  event: LearningSkillTrigger,
  input: LearningSkillInput,
) {
  const flags = readKaelOptimizationFlags();
  const queueFn = flags.KAEL_OPT_BATCH_LEARNING_ENABLED
    ? queueLearningForBatch
    : queueLearningSkillTriggers;
  await queueFn(client, event, input).catch((error) => {
    console.warn("mobile-api kael learning queue failed", {
      event,
      jobId: nullableString(input.job_id),
      errorName: error instanceof Error ? error.name : typeof error,
    });
  });
}

export async function logMemoryAudit(
  client: DbClient,
  input: {
    subjectType: "customer" | "worker" | "job" | "domain" | "system";
    subjectId: string | null;
    actorId: string | null;
    operation: "read" | "write" | "delete" | "archive";
    layer: string;
    purpose: string;
  },
) {
  await dbQuery(
    client.from("kael_memory_audit").insert({
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      actor_id: input.actorId,
      operation: input.operation,
      layer: input.layer,
      purpose: input.purpose,
      safe_metadata: {},
    }),
  ).catch(() => {
    console.warn("mobile-api kael memory audit failed", {
      subjectType: input.subjectType,
      operation: input.operation,
    });
  });
}

export async function logApiCalls(
  client: DbClient,
  rows: Array<Record<string, unknown>>,
) {
  if (rows.length === 0) return;
  const result = await dbQuery(client.from("api_logs").insert(rows));
  if (result.error) {
    console.warn("mobile-api api_logs batch insert failed", {
      count: rows.length,
    });
    return;
  }

  const metricRows = buildKaelOptimizationMetricRows(rows);
  if (metricRows.length === 0) return;
  const metricsResult = await dbQuery(
    client.from("kael_optimization_metrics").insert(metricRows),
  );
  if (metricsResult.error) {
    console.warn("mobile-api optimization metrics insert failed", {
      count: metricRows.length,
    });
  }
}

export function apiLogPurposeForPipelineStage(
  stage: PipelineStageLog["stage"],
): string {
  switch (stage) {
    case "intent":
      return "intent_classification";
    case "vision":
      return "vision_analysis";
    case "market":
      return "market_lookup";
    case "synthesis":
      return "price_synthesis";
    case "baseline":
      return "problem_synthesis";
  }
}
