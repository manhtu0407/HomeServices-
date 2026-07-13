import { asString, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { logApiCalls } from "./audit.ts";
import { insertKaelJobMessage } from "./chat.service.ts";
import { requestScopeChange, validateScopeChangeEvidenceRefs } from "./scope-change.service.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import type { EdgeJobIncident } from "../router/dtos.ts";
import { requireJobAccess } from "../access.ts";
import { runJobIncidentAssistant, scrubSensitiveForLLM, type EdgeAiSecrets } from "../kael/index.ts";
import type { JobMessageSendInput, JobStatus, WorkerScopeChangeInput } from "../../../_shared/domain.ts";

const OPENABLE_JOB_STATUSES = new Set<JobStatus>([
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
]);
const ACTIVE_INCIDENT_STATUSES = [
  "open",
  "awaiting_worker",
  "awaiting_customer",
  "ready_for_scope_proposal",
] as const;
const CHAT_ELIGIBLE_INCIDENT_STATUSES = [...ACTIVE_INCIDENT_STATUSES, "scope_proposed"] as const;
const INCIDENT_MESSAGES = {
  load: "Kh\u00f4ng th\u1ec3 t\u1ea3i Kael C\u00f4ng vi\u1ec7c",
  inspect: "Kh\u00f4ng th\u1ec3 ki\u1ec3m tra Kael C\u00f4ng vi\u1ec7c",
  open: "Kh\u00f4ng th\u1ec3 m\u1edf Kael C\u00f4ng vi\u1ec7c",
  update: "Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt Kael C\u00f4ng vi\u1ec7c",
  trail: "Kh\u00f4ng th\u1ec3 l\u01b0u d\u1ea5u v\u1ebft Kael C\u00f4ng vi\u1ec7c",
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
  const existing = await loadActiveIncident(client, jobId);
  const incident = existing
    ? await updateIncidentSignal(client, existing, input, evidenceRefs)
    : await createIncident(client, jobId, ctx.user.id, input, evidenceRefs);
  await insertIncidentEvent(client, {
    incidentId: asString(incident.id),
    jobId,
    sourceKind: existing ? "incident_updated" : "incident_opened",
    actorId: ctx.user.id,
    actorRole: "worker",
    content: [input.new_description, input.reason].map(scrubSensitiveForLLM).join("\n"),
    mediaRefs: evidenceRefs,
  });
  const updated = await advanceJobIncident(client, job, incident, {
    actor: "worker",
    text: `${input.new_description}\n${input.reason}`,
  }, secrets);
  return { incident: serializeIncident(updated) };
}

export async function proposeScopeChangeFromJobIncident(
  ctx: MobileApiContext,
  jobId: string,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select: "id, customer_id, worker_id",
  });
  const incidentResult = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .select("id, reported_description, reported_reason, evidence_photo_urls, evidence_status, status")
      .eq("job_id", jobId)
      .eq("status", "ready_for_scope_proposal")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (incidentResult.error) apiFailure("DB_ERROR", INCIDENT_MESSAGES.inspect, 500);
  const incident = incidentResult.data;
  if (!incident || incident.evidence_status !== "ready") {
    apiFailure("INCIDENT_NOT_READY", "Kael c\u1ea7n th\u00eam b\u1eb1ng ch\u1ee9ng tr\u01b0\u1edbc khi t\u1ea1o \u0111\u1ec1 xu\u1ea5t.", 409);
  }

  const scope = await requestScopeChange(ctx, jobId, {
    new_description: asString(incident.reported_description),
    reason: asString(incident.reported_reason),
    photo_urls: stringArray(incident.evidence_photo_urls),
  }, secrets);
  const updated = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .update({
        status: "scope_proposed",
        scope_change_id: scope.scope_change_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", asString(incident.id))
      .select("id, job_id, status, evidence_status, last_summary, last_question, last_next_actor, created_at, updated_at")
      .single(),
  );
  if (updated.error || !updated.data) apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 ghi nh\u1eadn \u0111\u1ec1 xu\u1ea5t Kael", 500);
  await insertIncidentEvent(client, {
    incidentId: asString(incident.id),
    jobId,
    sourceKind: "scope_proposed",
    actorId: ctx.user.id,
    actorRole: "worker",
    content: null,
    mediaRefs: [],
    safeMetadata: { scope_change_id: scope.scope_change_id },
  });
  return { incident: serializeIncident(updated.data), scope_change: scope };
}

export async function recordJobIncidentChatMessage(
  client: DbClient,
  job: JobRow,
  message: JobMessageRow,
  ctx: MobileApiContext,
  secrets: EdgeAiSecrets,
) {
  if (message.sender_role !== "customer" && message.sender_role !== "worker") return;
  const incident = await loadChatEligibleIncident(client, asString(job.id));
  if (!incident) return;
  await insertIncidentEvent(client, {
    incidentId: asString(incident.id),
    jobId: asString(job.id),
    sourceKind: "job_chat_message",
    actorId: ctx.user.id,
    actorRole: message.sender_role,
    content: scrubSensitiveForLLM(message.content),
    mediaRefs: [],
    messageId: message.id,
  });
  await advanceJobIncident(client, job, incident, {
    actor: message.sender_role,
    text: message.content,
  }, secrets);
}

async function createIncident(
  client: DbClient,
  jobId: string,
  openedBy: string,
  input: WorkerScopeChangeInput,
  evidenceRefs: string[],
) {
  const result = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .insert({
        job_id: jobId,
        opened_by: openedBy,
        reported_description: input.new_description,
        reported_reason: input.reason,
        evidence_photo_urls: evidenceRefs,
      })
      .select("id, job_id, status, reported_description, reported_reason, evidence_photo_urls, evidence_status, last_summary, last_question, last_next_actor, created_at, updated_at")
      .single(),
  );
  if (result.error || !result.data) apiFailure("DB_ERROR", INCIDENT_MESSAGES.open, 500);
  return result.data;
}

async function updateIncidentSignal(
  client: DbClient,
  incident: IncidentRow,
  input: WorkerScopeChangeInput,
  evidenceRefs: string[],
) {
  const combinedEvidence = Array.from(new Set([
    ...stringArray(incident.evidence_photo_urls),
    ...evidenceRefs,
  ])).slice(0, 5);
  const result = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .update({
        reported_description: input.new_description,
        reported_reason: input.reason,
        evidence_photo_urls: combinedEvidence,
        updated_at: new Date().toISOString(),
      })
      .eq("id", asString(incident.id))
      .select("id, job_id, status, reported_description, reported_reason, evidence_photo_urls, evidence_status, last_summary, last_question, last_next_actor, created_at, updated_at")
      .single(),
  );
  if (result.error || !result.data) apiFailure("DB_ERROR", INCIDENT_MESSAGES.update, 500);
  return result.data;
}

async function loadActiveIncident(client: DbClient, jobId: string) {
  return loadIncidentForStatuses(client, jobId, ACTIVE_INCIDENT_STATUSES);
}

async function loadChatEligibleIncident(client: DbClient, jobId: string) {
  return loadIncidentForStatuses(client, jobId, CHAT_ELIGIBLE_INCIDENT_STATUSES);
}

async function loadIncidentForStatuses(
  client: DbClient,
  jobId: string,
  statuses: readonly string[],
) {
  const result = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .select("id, job_id, status, reported_description, reported_reason, evidence_photo_urls, evidence_status, last_summary, last_question, last_next_actor, created_at, updated_at")
      .eq("job_id", jobId)
      .in("status", [...statuses])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", INCIDENT_MESSAGES.inspect, 500);
  const incident = result.data ?? null;
  if (!incident || !statuses.includes(asString(incident.status))) {
    return null;
  }
  return incident;
}

async function advanceJobIncident(
  client: DbClient,
  job: JobRow,
  incident: IncidentRow,
  event: { actor: "customer" | "worker"; text: string },
  secrets: EdgeAiSecrets,
) {
  const history = await loadIncidentHistory(client, asString(incident.id));
  const answer = await runJobIncidentAssistant({
    job: {
      id: asString(job.id),
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
  });
  const status = asString(incident.status) === "scope_proposed"
    ? "scope_proposed"
    : answer.evidence_status === "ready"
    ? "ready_for_scope_proposal"
    : answer.next_actor === "customer"
    ? "awaiting_customer"
    : "awaiting_worker";
  const updated = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .update({
        status,
        evidence_status: answer.evidence_status,
        last_summary: answer.summary,
        last_question: answer.question,
        last_next_actor: answer.next_actor,
        updated_at: new Date().toISOString(),
      })
      .eq("id", asString(incident.id))
      .select("id, job_id, status, reported_description, reported_reason, evidence_photo_urls, evidence_status, last_summary, last_question, last_next_actor, created_at, updated_at")
      .single(),
  );
  if (updated.error || !updated.data) apiFailure("DB_ERROR", INCIDENT_MESSAGES.update, 500);
  await insertIncidentEvent(client, {
    incidentId: asString(incident.id),
    jobId: asString(job.id),
    sourceKind: "kael_turn",
    actorId: null,
    actorRole: "kael",
    content: `${answer.summary}\n${answer.question}`,
    mediaRefs: [],
    safeMetadata: {
      evidence_status: answer.evidence_status,
      fallback_used: answer.fallback_used,
      next_actor: answer.next_actor,
    },
  });
  await insertKaelJobMessage(client, asString(job.id), formatKaelIncidentMessage(answer));
  if (answer.provider && answer.model) {
    await logApiCalls(client, [{
      job_id: asString(job.id),
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
      safe_metadata: { incident_id: asString(incident.id), evidence_status: answer.evidence_status },
    }]);
  }
  return updated.data;
}

async function loadIncidentHistory(client: DbClient, incidentId: string) {
  const result = await dbQuery<IncidentHistoryRow>(
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
  return rows.reverse().map((event) => ({
    source_kind: event.source_kind,
    actor_role: event.actor_role,
    content: nullableString(event.content) ?? "",
    evidence_count: stringArray(event.media_refs).length,
  }));
}

async function insertIncidentEvent(
  client: DbClient,
  input: {
    incidentId: string;
    jobId: string;
    sourceKind: "incident_opened" | "incident_updated" | "job_chat_message" | "kael_turn" | "scope_proposed";
    actorId: string | null;
    actorRole: "customer" | "worker" | "kael" | "system";
    content: string | null;
    mediaRefs: string[];
    messageId?: string;
    safeMetadata?: Record<string, unknown>;
  },
) {
  const result = await dbQuery(
    client.from("kael_job_incident_events").insert({
      incident_id: input.incidentId,
      job_id: input.jobId,
      source_kind: input.sourceKind,
      actor_id: input.actorId,
      actor_role: input.actorRole,
      message_id: input.messageId ?? null,
      content: input.content,
      media_refs: input.mediaRefs,
      safe_metadata: input.safeMetadata ?? {},
    }),
  );
  if (result.error) apiFailure("DB_ERROR", INCIDENT_MESSAGES.trail, 500);
}

function serializeIncident(row: IncidentRow): EdgeJobIncident {
  return {
    id: asString(row.id),
    job_id: asString(row.job_id),
    status: asString(row.status) as EdgeJobIncident["status"],
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
    : "Kael c\u1ea7n th\u1ee3 b\u1ed5 sung th\u00eam."
  return `Kael C\u00f4ng vi\u1ec7c: ${answer.summary}\n${readiness}\n${answer.question}`;
}
