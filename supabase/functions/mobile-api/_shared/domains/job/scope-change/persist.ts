// Atomic persistence for a scope-change request: RPC args, failure progress, replay row.

import { nullableString } from "../../../platform/coercions.ts";
import { mapScopeRequestError } from "../../../platform/domain-error-mappers.ts";
import { buildDirectScopeEffectPayloads } from "./effects.ts";
import { prepareScopeChangeEstimate } from "./support.ts";
import { db, dbQuery } from "../../../platform/db.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import { updateKaelProgress } from "../../../kael/index.ts";

export type ScopeChangeRequestInput = {
  client_request_id?: string;
  new_description: string;
  reason: string;
  photo_urls?: string[];
};

export type IncidentScopeChangeProposal = {
  claimId: string;
  incidentId: string;
};


export type ScopeChangePrepared = Awaited<ReturnType<typeof prepareScopeChangeEstimate>>;
export type DirectScopeEffects = ReturnType<typeof buildDirectScopeEffectPayloads>;

export async function persistScopeChangeRequest(input: {
  client: ReturnType<typeof db>;
  ctx: MobileApiContext;
  jobId: string;
  request: ScopeChangeRequestInput;
  incidentProposal?: IncidentScopeChangeProposal;
  claimId: string | null;
  evidencePhotoRefs: string[];
  prepared: ScopeChangePrepared;
  directEffects: DirectScopeEffects | null;
}): Promise<Record<string, unknown>> {
  const rpcName = input.incidentProposal
    ? "request_job_incident_scope_change_atomic"
    : "request_scope_change_atomic";
  const rpcArgs: Record<string, unknown> = {
    p_job_id: input.jobId,
    p_worker_id: input.ctx.user.id,
    p_new_description: input.request.new_description,
    p_reason: input.request.reason,
    p_evidence_photo_urls: input.evidencePhotoRefs,
    p_kael_computed_min: input.prepared.enrichedEstimate.price_min,
    p_kael_computed_max: input.prepared.enrichedEstimate.price_max,
    p_kael_review: input.prepared.enrichedEstimate,
  };
  if (input.incidentProposal) {
    rpcArgs.p_claim_id = input.incidentProposal.claimId;
    rpcArgs.p_incident_id = input.incidentProposal.incidentId;
  } else {
    rpcArgs.p_client_request_id = input.request.client_request_id;
    rpcArgs.p_claim_id = input.claimId;
    rpcArgs.p_database_effect_id = input.directEffects?.database.effectId;
    rpcArgs.p_database_effect_payload = input.directEffects?.database.payload;
    rpcArgs.p_learning_effect_id = input.directEffects?.learning.effectId;
    rpcArgs.p_learning_effect_payload = input.directEffects?.learning.payload;
    rpcArgs.p_push_effect_id = input.directEffects?.push.effectId;
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    input.client.rpc(rpcName, rpcArgs),
  );
  if (result.error) return failScopeChangeRequest(input, "scope_request_rpc_failed");
  const row = result.data?.[0];
  if (!row) return failScopeChangeRequest(input, "scope_request_missing_row");
  if (row.ok) return row;
  const errorCode = nullableString(row.error_code);
  await updateKaelProgress(input.client, input.prepared.jobScopeProgressTarget, {
    stage: "scope_estimating",
    status: "failed",
    progress: 0.72,
    failureReason: errorCode ?? "scope_request_rejected",
  });
  if (errorCode === "SCOPE_CLAIM_STALE") {
    apiFailure("REQUEST_IN_PROGRESS", "Lượt tạo yêu cầu đã thay đổi. Vui lòng chờ rồi thử lại.", 409);
  }
  if (errorCode === "IDEMPOTENCY_CONFLICT") {
    apiFailure("IDEMPOTENCY_CONFLICT", "Mã yêu cầu đã được dùng cho nội dung khác.", 409);
  }
  return mapScopeRequestError(errorCode) as never;
}

async function failScopeChangeRequest(
  input: Pick<Parameters<typeof persistScopeChangeRequest>[0], "client" | "prepared">,
  failureReason: string,
): Promise<never> {
  await updateKaelProgress(input.client, input.prepared.jobScopeProgressTarget, {
    stage: "scope_estimating",
    status: "failed",
    progress: 0.72,
    failureReason,
  });
  return apiFailure("DB_ERROR", "Không thể tạo yêu cầu thay đổi", 500) as never;
}

