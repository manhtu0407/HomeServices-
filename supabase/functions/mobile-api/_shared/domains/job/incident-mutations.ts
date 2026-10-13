import { asNumber, asString, nullableNumber } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient, workflowDb } from "../../platform/db.ts";
import {
  requestScopeChange,
  validateScopeChangeEvidenceRefs,
} from "./scope-change/request.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { requireJobAccess } from "../../platform/access.ts";
import {
  type EdgeAiSecrets,
  scrubSensitiveForLLM,
} from "../../kael/index.ts";
import type {
  EdgeJobIncidentScopeProposalInput,
  JobStatus,
  WorkerScopeChangeInput,
} from "../../../../_shared/domain.ts";
import {
  INCIDENT_MESSAGES,
  OPENABLE_JOB_STATUSES,
  type JobMessageRow,
  type JobRow,
} from "./incident-contracts.ts";
import {
  callAtomicIncidentRpc,
  loadFinalizedScopeProposal,
  loadIncidentById,
  mapIncidentMutationError,
  releaseScopeProposalClaim,
  requiredIncident,
  serializeIncident,
  stringArray,
} from "./incident-data.ts";
import { advanceJobIncident } from "./incident-assistant.ts";
import { parseSavedScopeChangeAnalysis } from "./scope-change/support.ts";
import { parseScopeChangeWorkerQuote } from "./scope-change/worker-quote.ts";

export { INCIDENT_MESSAGES } from "./incident-contracts.ts";
export type { IncidentRow } from "./incident-contracts.ts";
export { serializeIncident } from "./incident-data.ts";

export async function openJobIncident(
  ctx: MobileApiContext,
  jobId: string,
  input: WorkerScopeChangeInput,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select:
      "id, status, customer_id, worker_id, service_type, description, kael_problem_identified",
  });
  if (!OPENABLE_JOB_STATUSES.has(job.status as JobStatus)) {
    apiFailure(
      "INVALID_STATUS",
      "Chưa thể mở Kael Công việc ở trạng thái yêu cầu hiện tại",
      409,
    );
  }

  const evidenceRefs = await validateScopeChangeEvidenceRefs(
    client,
    jobId,
    ctx.user.id,
    asString(job.customer_id),
    input.photo_urls ?? [],
  );
  const assistantClaimId = crypto.randomUUID();
  const signal = await callAtomicIncidentRpc(
    client,
    "upsert_job_incident_signal_atomic",
    {
      p_content: [input.new_description, input.reason].map(scrubSensitiveForLLM)
        .join("\n"),
      p_evidence_photo_urls: evidenceRefs,
      p_assistant_claim_id: assistantClaimId,
      p_job_id: jobId,
      p_opened_by: ctx.user.id,
      p_reported_description: input.new_description,
      p_reported_reason: input.reason,
      p_request_id: input.client_request_id ?? null,
    },
    INCIDENT_MESSAGES.open,
  );
  if (signal.ok !== true) {
    mapIncidentMutationError(signal.error_code, INCIDENT_MESSAGES.open);
  }

  const incident = requiredIncident(signal, INCIDENT_MESSAGES.open);
  if (signal.claimed !== true) return { incident: serializeIncident(incident) };

  const updated = await advanceJobIncident(
    client,
    job,
    incident,
    {
      actor: "worker",
      text: `${input.new_description}\n${input.reason}`,
    },
    {
      assistantClaimId,
      eventId: asString(signal.source_event_id),
      revision: asNumber(signal.revision),
    },
    secrets,
    ctx.user.id,
  );
  return { incident: serializeIncident(updated) };
}

export async function proposeScopeChangeFromJobIncident(
  ctx: MobileApiContext,
  jobId: string,
  input: EdgeJobIncidentScopeProposalInput,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select:
      "id, status, customer_id, worker_id, service_type, description, address_district, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_estimate_card_v3",
  });
  const claimId = input.client_request_id;
  const basisResult = await dbQuery<Array<Record<string, unknown>>>(
    workflowDb(ctx).rpc("load_job_incident_scope_quote_basis", {
      p_quote_id: input.quote_id,
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
    }),
  );
  if (basisResult.error) {
    apiFailure("DB_ERROR", INCIDENT_MESSAGES.inspect, 500);
  }
  const quoteBasis = basisResult.data?.[0] ?? null;
  const claim = await callAtomicIncidentRpc(
    client,
    "claim_job_incident_scope_proposal_atomic",
    {
      p_claim_id: claimId,
      p_job_id: jobId,
      p_quote_id: input.quote_id,
      p_worker_id: ctx.user.id,
    },
    INCIDENT_MESSAGES.inspect,
  );
  if (claim.ok !== true) {
    if (claim.error_code === "STATUS_CHANGED") {
      apiFailure(
        "STATUS_CHANGED",
        "Trạng thái công việc đã thay đổi. Vui lòng tải lại trước khi tạo đề xuất.",
        409,
      );
    }
    const message = claim.error_code === "PROPOSAL_IN_PROGRESS"
      ? "Kael đang tạo đề xuất này. Vui lòng chờ trong giây lát."
      : "Kael cần thêm bằng chứng trước khi tạo đề xuất.";
    apiFailure("INCIDENT_NOT_READY", message, 409);
  }
  const incident = requiredIncident(claim, INCIDENT_MESSAGES.inspect);
  if (
    claim.idempotent === true && asString(incident.status) === "scope_proposed"
  ) {
    const scope = await loadFinalizedScopeProposal(client, jobId, incident);
    return { incident: serializeIncident(incident), scope_change: scope };
  }
  if (claim.claimed !== true) {
    apiFailure(
      "INCIDENT_NOT_READY",
      "Kael cần thêm bằng chứng trước khi tạo đề xuất.",
      409,
    );
  }
  const incidentId = asString(incident.id);
  const originalPriceMax = nullableNumber(job.kael_price_max);
  const quote = parseScopeChangeWorkerQuote(incident.scope_price_quote);
  const confirmedAt = asString(incident.scope_price_quote_confirmed_at);
  const quoteExpiresAt = asString(quoteBasis?.expires_at);
  const analysis = originalPriceMax !== null && quoteBasis &&
      asString(quoteBasis.incident_id) === incidentId &&
      asNumber(quoteBasis.incident_revision) + 1 === asNumber(incident.revision) &&
      asString(incident.scope_price_quote_id) === input.quote_id &&
      asNumber(incident.scope_price_quote_revision) === asNumber(incident.revision) &&
      quote?.quote_id === input.quote_id &&
      quote.expires_at === quoteExpiresAt &&
      Number.isFinite(Date.parse(confirmedAt)) &&
      Date.parse(confirmedAt) <= Date.parse(quoteExpiresAt)
    ? parseSavedScopeChangeAnalysis(quoteBasis.analysis, job, originalPriceMax)
    : null;
  if (!analysis) {
    await releaseScopeProposalClaim(client, jobId, incidentId, claimId);
    apiFailure(
      "QUOTE_CHANGED",
      "Báo giá đã thay đổi hoặc hết hạn. Thợ cần kiểm tra lại trước khi gửi đề xuất.",
      409,
    );
  }

  try {
    const scope = await requestScopeChange(
      ctx,
      jobId,
      {
        new_description: asString(incident.reported_description),
        reason: asString(incident.reported_reason),
        photo_urls: stringArray(incident.evidence_photo_urls),
      },
      secrets,
      { claimId, incidentId },
      {
        analysis,
        confirmedAt: asString(incident.scope_price_quote_confirmed_at),
        quoteId: input.quote_id,
        storedQuote: incident.scope_price_quote,
      },
    );
    const updated = await loadIncidentById(client, incidentId);
    return { incident: serializeIncident(updated), scope_change: scope };
  } catch (error) {
    await releaseScopeProposalClaim(client, jobId, incidentId, claimId);
    throw error;
  }
}

export async function recordJobIncidentChatMessage(
  client: DbClient,
  job: JobRow,
  message: JobMessageRow,
  ctx: MobileApiContext,
  secrets: EdgeAiSecrets,
) {
  if (message.sender_role !== "customer" && message.sender_role !== "worker") {
    return;
  }
  const jobId = asString(job.id);
  const assistantClaimId = crypto.randomUUID();
  const claim = await callAtomicIncidentRpc(
    client,
    "claim_job_incident_chat_turn_atomic",
    {
      p_actor_id: ctx.user.id,
      p_actor_role: message.sender_role,
      p_assistant_claim_id: assistantClaimId,
      p_content: scrubSensitiveForLLM(message.content),
      p_job_id: jobId,
      p_message_id: message.id,
    },
    INCIDENT_MESSAGES.update,
  );
  if (claim.ok !== true) {
    mapIncidentMutationError(claim.error_code, INCIDENT_MESSAGES.update);
  }
  if (claim.claimed !== true) return;

  const incident = requiredIncident(claim, INCIDENT_MESSAGES.inspect);
  await advanceJobIncident(
    client,
    job,
    incident,
    { actor: message.sender_role, text: message.content },
    {
      assistantClaimId,
      eventId: asString(claim.source_event_id),
      revision: asNumber(claim.revision),
    },
    secrets,
    ctx.user.id,
  );
}
