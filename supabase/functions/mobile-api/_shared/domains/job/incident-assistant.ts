import { asString, nullableString } from "../../platform/coercions.ts";
import { type DbClient, dbQuery } from "../../platform/db.ts";
import { logApiCalls } from "../../kael/learning/audit.ts";
import { type EdgeAiSecrets, runJobIncidentAssistant } from "../../kael/index.ts";
import { createRuntimeKaelSpendGate } from "../../kael/kael-guardrails/spend-gate.ts";
import {
  INCIDENT_MESSAGES,
  type AtomicIncidentRow,
  type IncidentHistoryRow,
  type IncidentRow,
  type IncidentSource,
  type JobRow,
} from "./incident-contracts.ts";
import {
  callAtomicIncidentRpc,
  mapIncidentMutationError,
  releaseAssistantClaim,
  requiredIncident,
  stringArray,
} from "./incident-data.ts";
import { apiFailure } from "../../platform/api-failure.ts";

export async function advanceJobIncident(
  client: DbClient,
  job: JobRow,
  incident: IncidentRow,
  event: { actor: "customer" | "worker"; text: string },
  source: IncidentSource,
  secrets: EdgeAiSecrets,
  actorId: string,
) {
  const incidentId = asString(incident.id);
  const jobId = asString(job.id);
  const history = await loadIncidentHistory(client, incidentId);
  let answer: Awaited<ReturnType<typeof runJobIncidentAssistant>>;
  try {
    answer = await runJobIncidentAssistant({
      job: {
        id: jobId,
        service_type: nullableString(job.service_type),
        description: nullableString(job.description),
        kael_problem_identified: nullableString(job.kael_problem_identified),
      },
      incident: {
        description: asString(incident.reported_description),
        reason: asString(incident.reported_reason),
        evidence_count: stringArray(incident.evidence_photo_urls).length,
      },
      event,
      history,
      secrets,
      spendGate: createRuntimeKaelSpendGate(client, actorId, secrets.harnessTrace),
    });
  } catch (error) {
    await releaseAssistantClaim(client, jobId, source);
    throw error;
  }
  const status = asString(incident.status) === "scope_proposed"
    ? "scope_proposed"
    : answer.evidence_status === "ready"
    ? "ready_for_scope_proposal"
    : answer.next_actor === "customer"
    ? "awaiting_customer"
    : "awaiting_worker";
  let applied: AtomicIncidentRow;
  try {
    applied = await callAtomicIncidentRpc(
      client,
      "apply_job_incident_assistant_turn_atomic",
      {
        p_assistant_claim_id: source.assistantClaimId,
        p_event_content: `${answer.summary}\n${answer.question}`,
        p_evidence_status: answer.evidence_status,
        p_expected_revision: source.revision,
        p_incident_id: incidentId,
        p_job_id: jobId,
        p_message_content: formatKaelIncidentMessage(answer),
        p_next_actor: answer.next_actor,
        p_question: answer.question,
        p_safe_metadata: {
          evidence_status: answer.evidence_status,
          fallback_used: answer.fallback_used,
          next_actor: answer.next_actor,
        },
        p_source_event_id: source.eventId,
        p_status: status,
        p_summary: answer.summary,
      },
      INCIDENT_MESSAGES.update,
    );
  } catch (error) {
    await releaseAssistantClaim(client, jobId, source);
    throw error;
  }
  if (applied.ok !== true) {
    await releaseAssistantClaim(client, jobId, source);
    mapIncidentMutationError(applied.error_code, INCIDENT_MESSAGES.update);
  }

  if (answer.provider && answer.model) {
    await logApiCalls(client, [{
      job_id: jobId,
      request_id: crypto.randomUUID(),
      purpose: "job_incident",
      provider: answer.provider,
      model: answer.model,
      input_tokens: null,
      output_tokens: null,
      cost_usd: answer.cost_usd ?? 0,
      latency_ms: answer.latency_ms ?? 0,
      success: !answer.fallback_used,
      error_code: answer.fallback_used ? "INCIDENT_ASSISTANT_FALLBACK" : null,
      safe_metadata: {
        evidence_status: answer.evidence_status,
        incident_id: incidentId,
        stale_result: applied.stale === true,
      },
    }]);
  }
  return requiredIncident(applied, INCIDENT_MESSAGES.update);
}

async function loadIncidentHistory(client: DbClient, incidentId: string) {
  const result = await dbQuery<IncidentHistoryRow[]>(
    client
      .from("kael_job_incident_events")
      .select("source_kind, actor_role, content, media_refs, created_at")
      .eq("incident_id", incidentId)
      .in("source_kind", [
        "incident_opened",
        "incident_updated",
        "job_chat_message",
      ])
      .order("created_at", { ascending: false })
      .limit(12),
  );
  if (result.error) apiFailure("DB_ERROR", INCIDENT_MESSAGES.inspect, 500);
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.reverse().map((historyEvent) => ({
    source_kind: historyEvent.source_kind,
    actor_role: historyEvent.actor_role,
    content: nullableString(historyEvent.content) ?? "",
    evidence_count: stringArray(historyEvent.media_refs).length,
  }));
}

function formatKaelIncidentMessage(
  answer: Awaited<ReturnType<typeof runJobIncidentAssistant>>,
) {
  const readiness = answer.evidence_status === "ready"
    ? "Kael đã đủ dữ liệu để thợ chủ động tạo đề xuất gửi khách."
    : answer.next_actor === "customer"
    ? "Kael cần khách phản hồi thêm."
    : "Kael cần thợ bổ sung thêm.";
  return `Kael Công việc: ${answer.summary}\n${readiness}\n${answer.question}`;
}
