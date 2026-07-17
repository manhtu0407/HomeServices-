import { asNumber, asRecord, asString, nullableString } from "../_runtime/coercions.ts";
import { db, dbQuery, type DbClient } from "../_runtime/db.ts";
import { logApiCalls } from "../_runtime/audit.ts";
import { requestScopeChange, validateScopeChangeEvidenceRefs } from "../scope-change/index.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import type { EdgeJobIncident } from "../../router/dtos.ts";
import { requireJobAccess } from "../../access.ts";
import { runJobIncidentAssistant, scrubSensitiveForLLM, type EdgeAiSecrets } from "../../kael/index.ts";
import type {
  EdgeJobIncidentScopeProposalInput,
  JobStatus,
  ScopeChangeStatus,
  WorkerScopeChangeInput,
} from "../../../../_shared/domain.ts";

const OPENABLE_JOB_STATUSES = new Set<JobStatus>([
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
]);
const INCIDENT_MESSAGES = {
  load: "Kh\u00f4ng th\u1ec3 t\u1ea3i Kael C\u00f4ng vi\u1ec7c",
  inspect: "Kh\u00f4ng th\u1ec3 ki\u1ec3m tra Kael C\u00f4ng vi\u1ec7c",
  open: "Kh\u00f4ng th\u1ec3 m\u1edf Kael C\u00f4ng vi\u1ec7c",
  update: "Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt Kael C\u00f4ng vi\u1ec7c",
};

type IncidentRow = Record<string, unknown>;
type JobRow = Record<string, unknown>;
type JobMessageRow = {
  id: string;
  sender_role: "customer" | "worker" | "kael";
  content: string;
};
type IncidentHistoryRow = {
  source_kind: "incident_opened" | "incident_updated" | "job_chat_message";
  actor_role: "customer" | "worker";
  content: string | null;
  media_refs: unknown;
};
type AtomicIncidentRow = Record<string, unknown> & {
  error_code?: string | null;
  incident?: unknown;
  ok?: boolean;
};
type IncidentSource = {
  assistantClaimId: string;
  eventId: string;
  revision: number;
};

export async function getJobIncident(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  await requireJobAccess(client, jobId, ctx, { select: "id, customer_id, worker_id" });
  const result = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .select("id, job_id, status, evidence_status, last_summary, last_question, last_next_actor, created_at, updated_at")
      .eq("job_id", jobId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", INCIDENT_MESSAGES.load, 500);
  return { incident: result.data ? serializeIncident(result.data) : null };
}

export async function openJobIncident(
  ctx: MobileApiContext,
  jobId: string,
  input: WorkerScopeChangeInput,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select: "id, status, customer_id, worker_id, service_type, description, kael_problem_identified",
  });
  if (!OPENABLE_JOB_STATUSES.has(job.status as JobStatus)) {
    apiFailure("INVALID_STATUS", "Ch\u01b0a th\u1ec3 m\u1edf Kael C\u00f4ng vi\u1ec7c \u1edf tr\u1ea1ng th\u00e1i y\u00eau c\u1ea7u hi\u1ec7n t\u1ea1i", 409);
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
      p_content: [input.new_description, input.reason].map(scrubSensitiveForLLM).join("\n"),
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
  if (signal.ok !== true) mapIncidentMutationError(signal.error_code, INCIDENT_MESSAGES.open);

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
  await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select: "id, customer_id, worker_id",
  });
  const claimId = input.client_request_id;
  const claim = await callAtomicIncidentRpc(
    client,
    "claim_job_incident_scope_proposal_atomic",
    {
      p_claim_id: claimId,
      p_job_id: jobId,
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
      ? "Kael \u0111ang t\u1ea1o \u0111\u1ec1 xu\u1ea5t n\u00e0y. Vui l\u00f2ng ch\u1edd trong gi\u00e2y l\u00e1t."
      : "Kael c\u1ea7n th\u00eam b\u1eb1ng ch\u1ee9ng tr\u01b0\u1edbc khi t\u1ea1o \u0111\u1ec1 xu\u1ea5t.";
    apiFailure("INCIDENT_NOT_READY", message, 409);
  }
  const incident = requiredIncident(claim, INCIDENT_MESSAGES.inspect);
  if (claim.idempotent === true && asString(incident.status) === "scope_proposed") {
    const scope = await loadFinalizedScopeProposal(client, jobId, incident);
    return { incident: serializeIncident(incident), scope_change: scope };
  }
  if (claim.claimed !== true) {
    apiFailure(
      "INCIDENT_NOT_READY",
      "Kael c\u1ea7n th\u00eam b\u1eb1ng ch\u1ee9ng tr\u01b0\u1edbc khi t\u1ea1o \u0111\u1ec1 xu\u1ea5t.",
      409,
    );
  }
  const incidentId = asString(incident.id);

  try {
    const scope = await requestScopeChange(ctx, jobId, {
      new_description: asString(incident.reported_description),
      reason: asString(incident.reported_reason),
      photo_urls: stringArray(incident.evidence_photo_urls),
    }, secrets, { claimId, incidentId });
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
  if (message.sender_role !== "customer" && message.sender_role !== "worker") return;
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
  if (claim.ok !== true) mapIncidentMutationError(claim.error_code, INCIDENT_MESSAGES.update);
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

async function advanceJobIncident(
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
      spendGate: { client, actorId },
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
      .in("source_kind", ["incident_opened", "incident_updated", "job_chat_message"])
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

async function loadIncidentById(client: DbClient, incidentId: string) {
  const result = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .select("id, job_id, status, reported_description, reported_reason, evidence_photo_urls, evidence_status, last_summary, last_question, last_next_actor, created_at, updated_at")
      .eq("id", incidentId)
      .single(),
  );
  if (result.error || !result.data) apiFailure("DB_ERROR", INCIDENT_MESSAGES.load, 500);
  return result.data;
}

async function loadFinalizedScopeProposal(
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
  if (result.error || !result.data) apiFailure("DB_ERROR", INCIDENT_MESSAGES.load, 500);
  return {
    scope_change_id: asString(result.data.id),
    job_id: asString(result.data.job_id),
    status: asString(result.data.status) as ScopeChangeStatus,
    created_at: asString(result.data.created_at),
  };
}

async function releaseScopeProposalClaim(
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

async function releaseAssistantClaim(
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

async function callAtomicIncidentRpc(
  client: DbClient,
  name: string,
  args: Record<string, unknown>,
  failureMessage: string,
) {
  const result = await dbQuery<AtomicIncidentRow[]>(client.rpc(name, args));
  if (result.error || !result.data?.[0]) apiFailure("DB_ERROR", failureMessage, 500);
  return result.data[0];
}

function requiredIncident(row: AtomicIncidentRow, failureMessage: string) {
  const incident = asRecord(row.incident);
  if (!asString(incident.id)) apiFailure("DB_ERROR", failureMessage, 500);
  return incident;
}

function mapIncidentMutationError(errorCode: unknown, failureMessage: string): never {
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

function serializeIncident(row: IncidentRow): EdgeJobIncident {
  const status = asString(row.status);
  if (![
    "open",
    "awaiting_worker",
    "awaiting_customer",
    "ready_for_scope_proposal",
    "scope_proposed",
    "resolved",
    "cancelled",
  ].includes(status)) {
    apiFailure("DB_ERROR", "Dữ liệu phát sinh công việc không hợp lệ", 500);
  }
  return {
    id: asString(row.id),
    job_id: asString(row.job_id),
    status: status as EdgeJobIncident["status"],
    evidence_status: row.evidence_status === "ready" ? "ready" : "needs_more",
    last_summary: nullableString(row.last_summary),
    last_question: nullableString(row.last_question),
    last_next_actor: row.last_next_actor === "customer" || row.last_next_actor === "worker"
      ? row.last_next_actor
      : null,
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function formatKaelIncidentMessage(answer: Awaited<ReturnType<typeof runJobIncidentAssistant>>) {
  const readiness = answer.evidence_status === "ready"
    ? "Kael \u0111\u00e3 \u0111\u1ee7 d\u1eef li\u1ec7u \u0111\u1ec3 th\u1ee3 ch\u1ee7 \u0111\u1ed9ng t\u1ea1o \u0111\u1ec1 xu\u1ea5t g\u1eedi kh\u00e1ch."
    : answer.next_actor === "customer"
    ? "Kael c\u1ea7n kh\u00e1ch ph\u1ea3n h\u1ed3i th\u00eam."
    : "Kael c\u1ea7n th\u1ee3 b\u1ed5 sung th\u00eam.";
  return `Kael C\u00f4ng vi\u1ec7c: ${answer.summary}\n${readiness}\n${answer.question}`;
}
