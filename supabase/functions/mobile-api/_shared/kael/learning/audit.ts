// Kael-specific audit and learning dispatch. These helpers live at the Kael layer so
// domains can use the AI boundary without making platform depend on the brain.

import { dbQuery, type DbClient } from "../../platform/db.ts";
import { nullableString } from "../../platform/coercions.ts";
import { buildKaelOptimizationMetricRows, readKaelOptimizationFlags } from "../kael-usage/cost-tracking.ts";
import { auditKaelGuardrailTrip } from "../kael-guardrails/self-check.ts";
import { queueLearningForBatch } from "./cron/process-learning-queue.ts";
import {
  queueLearningSkillTriggers,
  type LearningSkillInput,
  type LearningSkillTrigger,
} from "./skills/registry.ts";
import type { PipelineStageLog } from "../contracts/types.ts";

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
