import { asServiceType, nullableNumber, nullableString } from "../../../platform/coercions.ts";
import type { DbClient } from "../../../platform/db.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import type { LearningSkillInput } from "../../../kael/index.ts";
import { logJobEvent } from "../../../platform/audit.ts";
import { queueKaelLearningEvent } from "../../../kael/learning/audit.ts";
import { logScopeChangeEstimateApiCall } from "./decision.ts";
import { notifyCustomerScopeChangeRequested } from "../../notification/notifications.ts";
import { updateKaelProgress } from "../../../kael/index.ts";
import type { PricedScopeChangeEstimate } from "./effects-contracts.ts";

export async function finalizeIncidentScopeChange(input: {
  readonly client: DbClient;
  readonly ctx: MobileApiContext;
  readonly jobId: string;
  readonly customerId: string | null;
  readonly scopeChangeId: string;
  readonly jobScopeProgressTarget: { table: "jobs"; id: string };
  readonly estimate: PricedScopeChangeEstimate;
  readonly enrichedEstimate: PricedScopeChangeEstimate;
  readonly antiFraud: { score: number; challenge_required: boolean };
  readonly learningInput: LearningSkillInput;
}) {
  const {
    client,
    ctx,
    jobId,
    customerId,
    scopeChangeId,
    jobScopeProgressTarget,
    estimate,
    enrichedEstimate,
    antiFraud,
    learningInput,
  } = input;
  await updateKaelProgress(
    client,
    { table: "scope_change_requests", id: scopeChangeId },
    { stage: "scope_estimating", status: "completed", progress: 1 },
  );
  await updateKaelProgress(client, jobScopeProgressTarget, {
    stage: "scope_estimating",
    status: "completed",
    progress: 1,
  });
  await logJobEvent(
    client,
    jobId,
    "kael_scope_review_computed",
    ctx,
    null,
    null,
    {
      fallback_used: estimate.fallback_used,
      confidence: estimate.confidence,
      computed_min: estimate.price_min,
      computed_max: estimate.price_max,
      anti_fraud_score: antiFraud.score,
      challenge_required: antiFraud.challenge_required,
    },
  );
  await logScopeChangeEstimateApiCall(client, jobId, enrichedEstimate);
  await logJobEvent(
    client,
    jobId,
    "worker_requested_scope_change",
    ctx,
    null,
    "scope_change_pending",
    { scope_change_id: scopeChangeId },
  );
  await notifyCustomerScopeChangeRequested(
    client,
    jobId,
    customerId,
    scopeChangeId,
  );
  await logJobEvent(
    client,
    jobId,
    "scope_change_notified",
    ctx,
    "scope_change_pending",
    "scope_change_pending",
    { scope_change_id: scopeChangeId, customer_confirmation_required: true },
  );
  await queueKaelLearningEvent(client, 'post-B6', learningInput);
}

export function buildScopeChangeLearningInput(
  ctx: MobileApiContext,
  job: Record<string, unknown>,
  jobId: string,
  evidencePhotoRefs: string[],
  estimate: PricedScopeChangeEstimate,
  originalPriceMax: number,
  challengeRequired: boolean,
): LearningSkillInput {
  return {
    actor_id: ctx.user.id,
    actor_role: ctx.role,
    job_id: jobId,
    customer_id: nullableString(job.customer_id) ?? undefined,
    worker_id: ctx.user.id,
    service_type: asServiceType(job.service_type),
    problem_slug: nullableString(job.kael_problem_identified) ?? undefined,
    district_code: nullableString(job.address_district) ?? undefined,
    complexity: estimate.complexity_assessment,
    baseline_min: nullableNumber(job.kael_price_min) ?? undefined,
    baseline_max: originalPriceMax,
    scope_change_requested: true,
    worker_report: {
      has_photos: evidencePhotoRefs.length > 0,
      reported_complexity: estimate.complexity_assessment,
      challenge_required: challengeRequired,
    },
  };
}
