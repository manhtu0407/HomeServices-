import { asNumber, asString, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { requireJobAccess } from "../../platform/access.ts";
import {
  INCIDENT_MESSAGES,
  type IncidentRow,
  serializeIncident,
} from "./incident-mutations.ts";
import { stringArray } from "./incident-data.ts";
import type { EdgeJobDetailResponse } from "../contracts/job-detail.ts";
import { parseScopeChangeWorkerQuote } from "./scope-change/worker-quote.ts";

const CUSTOMER_VISIBLE_INCIDENT_STATUSES = [
  "open",
  "awaiting_worker",
  "awaiting_customer",
  "ready_for_scope_proposal",
] as const;

export {
  openJobIncident,
  proposeScopeChangeFromJobIncident,
  recordJobIncidentChatMessage,
} from "./incident-mutations.ts";
export { previewScopeChangeFromJobIncident } from "./incident-price-preview.ts";

export async function getJobIncident(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  await requireJobAccess(client, jobId, ctx, {
    select: "id, status, customer_id, worker_id",
  });
  const result = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .select(
        "id, job_id, status, revision, evidence_status, last_summary, last_question, last_next_actor, scope_price_quote_id, scope_price_quote, scope_price_quote_revision, scope_price_quote_expires_at, created_at, updated_at",
      )
      .eq("job_id", jobId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (result.error) {
    console.warn("mobile-api incident quote hydration failed", {
      code: result.error.code ?? "UNKNOWN_DB_ERROR",
      jobId,
    });
    apiFailure("DB_ERROR", INCIDENT_MESSAGES.load, 500);
  }
  if (!result.data) return { incident: null, quote: null };
  const incident = serializeIncident(result.data);
  const quote = parseScopeChangeWorkerQuote(result.data.scope_price_quote);
  const quoteIsCurrent = quote &&
    quote.job_id === jobId &&
    quote.incident_id === incident.id &&
    quote.quote_id === asString(result.data.scope_price_quote_id) &&
    asNumber(result.data.scope_price_quote_revision) === asNumber(result.data.revision) &&
    Date.parse(quote.expires_at) > Date.now();
  return { incident, quote: quoteIsCurrent ? quote : null };
}

export async function getCurrentJobIncidentReview(
  client: DbClient,
  jobId: string,
): Promise<EdgeJobDetailResponse["current_job_incident"]> {
  const result = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .select(
        "id, job_id, status, evidence_status, reported_description, reported_reason, evidence_photo_urls, last_summary, last_question, last_next_actor, created_at, updated_at",
      )
      .eq("job_id", jobId)
      .in("status", [...CUSTOMER_VISIBLE_INCIDENT_STATUSES])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", INCIDENT_MESSAGES.load, 500);
  if (!result.data) return null;

  const incident = serializeIncident(result.data);
  if (!CUSTOMER_VISIBLE_INCIDENT_STATUSES.includes(
    incident.status as (typeof CUSTOMER_VISIBLE_INCIDENT_STATUSES)[number],
  )) {
    apiFailure("DB_ERROR", "Dữ liệu phát sinh công việc không hợp lệ", 500);
  }
  return {
    id: incident.id,
    status: incident.status as "open" | "awaiting_worker" | "awaiting_customer" | "ready_for_scope_proposal",
    evidence_status: incident.evidence_status,
    reported_description: nullableString(result.data.reported_description),
    reported_reason: nullableString(result.data.reported_reason),
    evidence_count: stringArray(result.data.evidence_photo_urls).length,
    last_summary: incident.last_summary,
    last_question: incident.last_question,
    last_next_actor: incident.last_next_actor,
    created_at: asString(result.data.created_at),
    updated_at: asString(result.data.updated_at),
  };
}
