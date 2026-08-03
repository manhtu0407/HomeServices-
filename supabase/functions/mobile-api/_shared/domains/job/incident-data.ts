import { asRecord, asString, nullableString } from "../../platform/coercions.ts";
import { type DbClient, dbQuery } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { EdgeJobIncident } from "../contracts/job.ts";
import type { ScopeChangeStatus } from "../../../../_shared/domain.ts";
import {
  INCIDENT_MESSAGES,
  type AtomicIncidentRow,
  type IncidentRow,
  type IncidentSource,
} from "./incident-contracts.ts";

export async function loadIncidentById(client: DbClient, incidentId: string) {
  const result = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .select(
        "id, job_id, status, reported_description, reported_reason, evidence_photo_urls, evidence_status, last_summary, last_question, last_next_actor, created_at, updated_at",
      )
      .eq("id", incidentId)
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", INCIDENT_MESSAGES.load, 500);
  }
  return result.data;
}

export async function loadFinalizedScopeProposal(
  client: DbClient,
  jobId: string,
  incident: IncidentRow,
) {
  const scopeChangeId = asString(incident.scope_change_id);
  if (!scopeChangeId) apiFailure("DB_ERROR", INCIDENT_MESSAGES.load, 500);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("scope_change_requests")
      .select("id, job_id, status, created_at")
      .eq("id", scopeChangeId)
      .eq("job_id", jobId)
      .maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", INCIDENT_MESSAGES.load, 500);
  }
  return {
    scope_change_id: asString(result.data.id),
    job_id: asString(result.data.job_id),
    status: asString(result.data.status) as ScopeChangeStatus,
    created_at: asString(result.data.created_at),
  };
}

export async function releaseScopeProposalClaim(
  client: DbClient,
  jobId: string,
  incidentId: string,
  claimId: string,
) {
  const released = await dbQuery(
    client.rpc("release_job_incident_scope_proposal_atomic", {
      p_claim_id: claimId,
      p_incident_id: incidentId,
      p_job_id: jobId,
    }),
  );
  if (released.error) {
    console.warn("mobile-api incident scope proposal claim release failed", {
      jobId,
      incidentId,
    });
  }
}

export async function releaseAssistantClaim(
  client: DbClient,
  jobId: string,
  source: IncidentSource,
) {
  const released = await dbQuery(
    client.rpc("release_job_incident_assistant_claim_atomic", {
      p_assistant_claim_id: source.assistantClaimId,
      p_job_id: jobId,
      p_source_event_id: source.eventId,
    }),
  );
  if (released.error) {
    console.warn("mobile-api incident assistant claim release failed", {
      jobId,
      sourceEventId: source.eventId,
    });
  }
}

export async function callAtomicIncidentRpc(
  client: DbClient,
  name: string,
  args: Record<string, unknown>,
  failureMessage: string,
) {
  const result = await dbQuery<AtomicIncidentRow[]>(client.rpc(name, args));
  if (result.error || !result.data?.[0]) {
    apiFailure("DB_ERROR", failureMessage, 500);
  }
  return result.data[0];
}

export function requiredIncident(row: AtomicIncidentRow, failureMessage: string) {
  const incident = asRecord(row.incident);
  if (!asString(incident.id)) apiFailure("DB_ERROR", failureMessage, 500);
  return incident;
}

export function mapIncidentMutationError(
  errorCode: unknown,
  failureMessage: string,
): never {
  const code = nullableString(errorCode);
  if (
    code === "INVALID_STATUS" || code === "IDEMPOTENCY_CONFLICT" ||
    code === "INCIDENT_CLAIM_STALE" || code === "ASSISTANT_CLAIM_STALE"
  ) {
    apiFailure(code, failureMessage, 409);
  }
  if (code === "AUTH_FORBIDDEN" || code === "AUTH_MISSING") {
    apiFailure(code, failureMessage, 403);
  }
  apiFailure("DB_ERROR", failureMessage, 500);
}

export function serializeIncident(row: IncidentRow): EdgeJobIncident {
  const status = asString(row.status);
  if (
    ![
      "open",
      "awaiting_worker",
      "awaiting_customer",
      "ready_for_scope_proposal",
      "scope_proposed",
      "resolved",
      "cancelled",
    ].includes(status)
  ) {
    apiFailure("DB_ERROR", "Dữ liệu phát sinh công việc không hợp lệ", 500);
  }
  return {
    id: asString(row.id),
    job_id: asString(row.job_id),
    status: status as EdgeJobIncident["status"],
    evidence_status: row.evidence_status === "ready" ? "ready" : "needs_more",
    last_summary: nullableString(row.last_summary),
    last_question: nullableString(row.last_question),
    last_next_actor:
      row.last_next_actor === "customer" || row.last_next_actor === "worker"
        ? row.last_next_actor
        : null,
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
