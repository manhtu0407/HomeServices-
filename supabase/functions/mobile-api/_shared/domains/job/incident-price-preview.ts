import { asNumber, asString, nullableNumber } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { requireJobAccess } from "../../platform/access.ts";
import type { EdgeAiSecrets } from "../../kael/index.ts";
import type {
  EdgeJobIncidentScopePricePreviewInput,
  JobStatus,
} from "../../../../_shared/domain.ts";
import {
  INCIDENT_MESSAGES,
  OPENABLE_JOB_STATUSES,
  type IncidentRow,
} from "./incident-contracts.ts";
import {
  callAtomicIncidentRpc,
  mapIncidentMutationError,
  requiredIncident,
  serializeIncident,
  stringArray,
} from "./incident-data.ts";
import { logScopeChangeEstimateApiCall } from "./scope-change/decision.ts";
import { prepareScopeChangeEstimate } from "./scope-change/support.ts";
import { buildScopeChangeWorkerQuote } from "./scope-change/worker-quote.ts";

export async function previewScopeChangeFromJobIncident(
  ctx: MobileApiContext,
  jobId: string,
  input: EdgeJobIncidentScopePricePreviewInput,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select:
      "id, status, customer_id, worker_id, service_type, description, address_district, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_estimate_card_v3",
  });
  if (!OPENABLE_JOB_STATUSES.has(job.status as JobStatus)) {
    apiFailure("INVALID_STATUS", "Công việc không còn ở bước có thể tính đề xuất.", 409);
  }
  const incidentResult = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .select(
        "id, job_id, status, evidence_status, reported_description, reported_reason, evidence_photo_urls, revision, created_at, updated_at",
      )
      .eq("job_id", jobId)
      .eq("status", "ready_for_scope_proposal")
      .eq("evidence_status", "ready")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  const incident = incidentResult.data;
  if (incidentResult.error || !incident) {
    apiFailure("INCIDENT_NOT_READY", "Kael cần đủ dữ kiện và bằng chứng trước khi tính giá.", 409);
  }
  const originalPriceMax = nullableNumber(job.kael_price_max);
  if (originalPriceMax === null || originalPriceMax <= 0) {
    apiFailure("KAEL_PRICE_MISSING", "Chưa có giá gốc hợp lệ để đối chiếu.", 409);
  }
  const prepared = await prepareScopeChangeEstimate({
    client,
    ctx,
    job,
    jobId,
    request: {
      new_description: asString(incident.reported_description),
      reason: asString(incident.reported_reason),
    },
    secrets,
    originalPriceMax,
    evidencePhotoRefs: stringArray(incident.evidence_photo_urls),
    directClaimId: null,
  });
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const quote = buildScopeChangeWorkerQuote({
    estimate: prepared.enrichedEstimate,
    expiresAt,
    incidentId: asString(incident.id),
    jobId,
    quoteId: input.client_request_id,
  });
  const saved = await callAtomicIncidentRpc(
    client,
    "save_job_incident_scope_price_quote_atomic",
    {
      p_expected_revision: asNumber(incident.revision),
      p_incident_id: asString(incident.id),
      p_job_id: jobId,
      p_quote: quote,
      p_quote_expires_at: expiresAt,
      p_quote_id: quote.quote_id,
      p_worker_id: ctx.user.id,
    },
    INCIDENT_MESSAGES.update,
  );
  if (saved.ok !== true) {
    mapIncidentMutationError(saved.error_code, INCIDENT_MESSAGES.update);
  }
  await logScopeChangeEstimateApiCall(client, jobId, prepared.enrichedEstimate);
  return {
    incident: serializeIncident(requiredIncident(saved, INCIDENT_MESSAGES.update)),
    quote,
  };
}
