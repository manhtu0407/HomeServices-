// Scope-change request flow: authorize, calculate, persist atomically, then drain effects.

import { asString, nullableNumber, nullableString } from "../../../platform/coercions.ts";
import { mapScopeRequestError } from "../../../platform/domain-error-mappers.ts";
import {
  buildDirectScopeEffectPayloads,
  buildScopeChangeLearningInput,
  drainDirectScopeChangeEffects,
  finalizeIncidentScopeChange,
  parseDirectScopeEffectStates,
} from "./effects.ts";
import { validateScopeChangeEvidenceRefs } from "./decision.ts";
import {
  mapDirectScopeClaimError,
  parseScopeChangeReplay,
  prepareScopeChangeEstimate,
  releaseDirectScopeClaim,
} from "./support.ts";
import { db, dbQuery } from "../../../platform/db.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import { requireJobAccess } from "../../../platform/access.ts";
import { validateWorkflowTransition } from "../../../workflow-orchestrator.ts";
import { type EdgeAiSecrets, updateKaelProgress } from "../../../kael/index.ts";
import type { JobStatus, ScopeChangeStatus } from "../../../../../_shared/domain.ts";

export {
  decideScopeChange,
  validateScopeChangeEvidenceRefs,
} from "./decision.ts";

import {
  persistScopeChangeRequest,
  type IncidentScopeChangeProposal,
  type ScopeChangePrepared,
  type ScopeChangeRequestInput,
} from "./persist.ts";

export async function requestScopeChange(
  ctx: MobileApiContext,
  jobId: string,
  input: ScopeChangeRequestInput,
  secrets: EdgeAiSecrets,
  incidentProposal?: IncidentScopeChangeProposal,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select:
      "id, status, customer_id, worker_id, service_type, description, address_district, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max",
  });
  const evidencePhotoRefs = await validateScopeChangeEvidenceRefs(
    client,
    jobId,
    ctx.user.id,
    asString(job.customer_id),
    input.photo_urls ?? [],
  );
  if (!incidentProposal && !input.client_request_id) {
    apiFailure("VALIDATION", "Thiếu mã yêu cầu đổi phạm vi", 400);
  }
  const directClaim = incidentProposal ? null : await claimDirectScopeChange(
    client,
    jobId,
    ctx.user.id,
    input,
    evidencePhotoRefs,
  );
  if (directClaim?.kind === "replay") {
    await drainDirectScopeChangeEffects(
      client,
      ctx,
      job,
      input.client_request_id,
      directClaim.response.scope_change_id,
      parseDirectScopeEffectStates(directClaim.sideEffectsState),
    );
    return directClaim.response;
  }
  const claimId = directClaim?.kind === "claimed" ? directClaim.claimId : null;
  const originalPriceMax = await validateScopeChangeRequestState(
    client,
    ctx,
    jobId,
    job,
    input,
    claimId,
  );
  const prepared = await prepareScopeChangeEstimate({
    client,
    ctx,
    job,
    jobId,
    request: input,
    secrets,
    originalPriceMax,
    evidencePhotoRefs,
    directClaimId: claimId,
  });
  const learningInput = buildScopeChangeLearningInput(
    ctx,
    job,
    jobId,
    evidencePhotoRefs,
    prepared.enrichedEstimate,
    originalPriceMax,
    prepared.scopeChangeOutputs.anti_fraud.challenge_required,
  );
  const directEffects = incidentProposal
    ? null
    : buildDirectScopeEffectPayloads(
      jobId,
      prepared.enrichedEstimate,
      learningInput,
    );
  const row = await persistScopeChangeRequest({
    client,
    ctx,
    jobId,
    request: input,
    incidentProposal,
    claimId,
    evidencePhotoRefs,
    prepared,
    directEffects,
  });
  const scopeChangeId = asString(row.scope_change_id);
  const response = serializeScopeChangeResponse(row, jobId, prepared);
  if (!incidentProposal) {
    await drainDirectScopeChangeEffects(
      client,
      ctx,
      job,
      input.client_request_id,
      scopeChangeId,
      parseDirectScopeEffectStates(row.side_effects_state),
    );
    return response;
  }

  await finalizeIncidentScopeChange({
    client,
    ctx,
    jobId,
    customerId: nullableString(job.customer_id),
    scopeChangeId,
    jobScopeProgressTarget: prepared.jobScopeProgressTarget,
    estimate: prepared.estimate,
    enrichedEstimate: prepared.enrichedEstimate,
    antiFraud: prepared.scopeChangeOutputs.anti_fraud,
    learningInput,
  });
  return response;
}

async function validateScopeChangeRequestState(
  client: ReturnType<typeof db>,
  ctx: MobileApiContext,
  jobId: string,
  job: Record<string, unknown>,
  input: ScopeChangeRequestInput,
  claimId: string | null,
): Promise<number> {
  const originalPriceMax = nullableNumber(job.kael_price_max);
  const transition = validateWorkflowTransition({
    event: "scope_change_requested",
    from: job.status as JobStatus,
    to: "scope_change_pending",
  });
  const failure = !transition.valid
    ? ["INVALID_STATUS", transition.error] as const
    : originalPriceMax === null || originalPriceMax <= 0
    ? [
      "KAEL_PRICE_MISSING",
      "Kael chưa có giá gốc hợp lệ để tính phạm vi phát sinh",
    ] as const
    : null;
  if (!failure) return originalPriceMax as number;
  await releaseDirectScopeClaim(
    client,
    jobId,
    ctx.user.id,
    input.client_request_id,
    claimId,
    failure[0],
  );
  return apiFailure(failure[0], failure[1], 409) as never;
}


function serializeScopeChangeResponse(
  row: Record<string, unknown>,
  jobId: string,
  prepared: ScopeChangePrepared,
) {
  return {
    scope_change_id: asString(row.scope_change_id),
    job_id: jobId,
    status: row.scope_status as ScopeChangeStatus,
    created_at: asString(row.created_at_ts),
    kael_estimate: {
      price_min: prepared.estimate.price_min,
      price_max: prepared.estimate.price_max,
      confidence: prepared.estimate.confidence,
      problem_summary: prepared.estimate.problem_summary,
      advisory: prepared.estimate.advisory ?? null,
      complexity_assessment: prepared.estimate.complexity_assessment,
      disclaimer: prepared.estimate.disclaimer,
      fallback_used: prepared.estimate.fallback_used,
    },
    anti_fraud: prepared.scopeChangeOutputs.anti_fraud,
    worker_challenge: prepared.scopeChangeOutputs.worker_challenge,
    customer_card: prepared.scopeChangeOutputs.customer_card,
  };
}

async function claimDirectScopeChange(
  client: ReturnType<typeof db>,
  jobId: string,
  workerId: string,
  input: Parameters<typeof requestScopeChange>[2],
  evidencePhotoRefs: string[],
) {
  const claimId = crypto.randomUUID();
  const claimResult = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("claim_scope_change_request_atomic", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_client_request_id: input.client_request_id,
      p_claim_id: claimId,
      p_new_description: input.new_description,
      p_reason: input.reason,
      p_evidence_photo_urls: evidencePhotoRefs,
    }),
  );
  if (claimResult.error) {
    apiFailure("DB_ERROR", "Không thể giữ lượt tạo yêu cầu thay đổi", 500);
  }
  const claim = claimResult.data?.[0];
  if (!claim) {
    apiFailure("DB_ERROR", "Không thể giữ lượt tạo yêu cầu thay đổi", 500);
  }
  if (claim.replayed === true) {
    return {
      kind: "replay" as const,
      response: parseScopeChangeReplay(claim.response_payload, jobId),
      sideEffectsState: claim.side_effects_state,
    };
  }
  if (claim.ok !== true) {
    mapDirectScopeClaimError(nullableString(claim.error_code));
  }
  if (claim.claimed !== true) {
    apiFailure("DB_ERROR", "Không thể giữ lượt tạo yêu cầu thay đổi", 500);
  }
  return { kind: "claimed" as const, claimId };
}

