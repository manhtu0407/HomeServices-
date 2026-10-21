// Deterministic emergency handling for Case intake turns. It runs before the boundary guard, the
// intent router and the pipeline, and it does not depend on a playbook flag or on a model.

import { sanitizeForLLM } from "../../../../_shared/domain.ts";
import { sanitizeCustomerCaseEvidenceText } from "../../kael/evidence/untrusted-evidence.ts";
import {
  EMERGENCY_GATE_VERSION,
  resolveReportedEmergencyGuidanceFromTexts,
  type EmergencyGuidance,
} from "../../kael/kael-guardrails/emergency-guidance.ts";
import { ApiFailure, apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { asKaelChatStatus, asNumber, asRecord, nullableServiceType } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import {
  buildKaelTurnTrace,
  logKaelTurnTrace,
  type KaelTurnTrace,
  type KaelTurnTraceIdentity,
} from "../../platform/turn-trace.ts";
import { requiresImmediateKaelSafetyPathForTexts } from "./intake-safety.ts";
import {
  appendKaelSystemTurn,
  assertKaelSessionOwnership,
  insertKaelTurn,
  updateKaelSession,
} from "./session-store.ts";

export type CaseEmergency = {
  readonly guidance: EmergencyGuidance;
  // Fire, medical, police and unclear emergencies end the turn. A wiring or water hazard is advice
  // the intake can continue after, so the Case still gets its next question.
  readonly stopsTurn: boolean;
};

// Where in the Case the report was caught; it labels the trace and nothing else.
export type CaseEmergencyEntry = "turn" | "evidence" | "create" | "confirm";

type CaseEmergencyInput = {
  // One text, or every customer-authored text the request carries.
  readonly message: string | readonly string[];
  readonly language: "vi" | "en";
  readonly serviceType: unknown;
  readonly persistedSafetySignals?: readonly string[];
  readonly actorId?: string | null;
  // The request cannot take the turn: its booking confirmation is pending, analysis is deferred, or the
  // price-question chip persists nothing. No flagged path or pipeline step runs, so every reported route is
  // answered here and ends the request.
  readonly parked?: boolean;
};

// Every text a customer wrote into one request, read once each in a fixed order. The gate, the safety signals a
// Case persists and the text a model may see all start from this list, so a hazard cannot be reported in a field
// that only one of them reads.
export function customerAuthoredTexts(input: {
  readonly message?: string | null;
  readonly skipReason?: string | null;
  readonly intakeDescription?: string | null;
  readonly evidenceItems?: ReadonlyArray<{
    readonly transcript?: string | null;
    readonly summary?: string | null;
  }> | null;
}): string[] {
  const seen = new Set<string>();
  const texts: string[] = [];
  const candidates = [
    input.message,
    input.skipReason,
    input.intakeDescription,
    ...(input.evidenceItems ?? []).flatMap((item) => [item.transcript, item.summary]),
  ];
  for (const candidate of candidates) {
    const text = typeof candidate === "string" ? sanitizeForLLM(candidate) : "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    texts.push(text);
  }
  return texts;
}

export function resolveCaseEmergency(input: CaseEmergencyInput): CaseEmergency | null {
  const texts = (typeof input.message === "string" ? [input.message] : [...input.message])
    .filter((text) => text.length > 0);
  const guidance = resolveReportedEmergencyGuidanceFromTexts(texts, input.language, {
    serviceType: typeof input.serviceType === "string" ? input.serviceType : null,
  });
  if (!guidance) return null;
  if (input.parked) return { guidance, stopsTurn: true };
  const hazardOnly = guidance.route === "electrical_water";
  const flaggedPathOwnsHazard = guidance.route === "fire" || hazardOnly;
  const serviceType = nullableServiceType(input.serviceType);
  // When a service's flagged path already answers a smoke, fire or wiring hazard with its own
  // deterministic guidance, that reply is the only safety message; a second one would repeat it. The flagged path
  // reads the safety signals of every text, so the check reads the same texts.
  if (
    flaggedPathOwnsHazard && serviceType &&
    requiresImmediateKaelSafetyPathForTexts(
      texts,
      serviceType,
      input.persistedSafetySignals,
      input.actorId,
    )
  ) return null;
  return { guidance, stopsTurn: !hazardOnly };
}

type EmergencyOutcome = "emergency_stop" | "emergency_advice" | "emergency_guidance_only" | "emergency_write_failed";

function emergencyTrace(
  emergency: CaseEmergency,
  entry: CaseEmergencyEntry,
  identity: KaelTurnTraceIdentity | undefined,
  session: Record<string, unknown> | undefined,
  outcome: EmergencyOutcome = emergency.stopsTurn ? "emergency_stop" : "emergency_advice",
): KaelTurnTrace | undefined {
  // Tracing is observability only: it must never be the reason a customer's emergency goes unanswered.
  try {
    return buildKaelTurnTrace({
      identity,
      route: "case_emergency",
      stage: "emergency_gate",
      outcome,
      canonicalService: session?.service_type,
      casePhase: session?.case_phase,
      permissionReason: `EMERGENCY_${emergency.guidance.route.toUpperCase()}`,
      gateEntry: entry,
      emergencyGateVersion: EMERGENCY_GATE_VERSION,
    });
  } catch {
    return undefined;
  }
}

function logEmergencyTrace(trace: KaelTurnTrace | undefined) {
  // The trace carries route and release codes only. It never gets an actor pseudonym: a stable id beside a fire,
  // health or police code would profile one person.
  try {
    if (trace) logKaelTurnTrace(trace, console.warn);
  } catch {
    return;
  }
}

// What a request that cannot take the turn answers when its customer reported an emergency: the same error code and
// status the contract already gives that refusal, with the deterministic guidance in front of its message. Nothing is
// written, so a closed Case stays closed and an invalid schedule is applied nowhere. With no scope (the caller could
// not establish who owns the Case) the refusal is the plain one, so guidance is never handed to someone else's request.
export type EmergencyRefusalScope = {
  readonly texts: readonly string[];
  readonly language: "vi" | "en";
  readonly serviceType: unknown;
  readonly entry: CaseEmergencyEntry;
  readonly identity?: KaelTurnTraceIdentity;
  readonly session?: Record<string, unknown>;
};

export function refuseWithEmergencyGuidance(
  refusal: { readonly code: string; readonly message: string; readonly status: number },
  scope?: EmergencyRefusalScope | null,
): never {
  const emergency = scope
    ? resolveCaseEmergency({
      message: scope.texts,
      language: scope.language,
      serviceType: scope.serviceType,
      parked: true,
    })
    : null;
  if (!scope || !emergency) apiFailure(refusal.code, refusal.message, refusal.status);
  logEmergencyTrace(
    emergencyTrace(emergency, scope.entry, scope.identity, scope.session, "emergency_guidance_only"),
  );
  apiFailure(refusal.code, `${emergency.guidance.response}\n\n${refusal.message}`, refusal.status);
}

const SESSION_COLUMNS = "id, customer_id, service_type, status, case_phase, total_turns, safe_metadata";

// The Case when the caller owns it; null for a missing Case, someone else's Case or a failed read. A request already
// bound for a refusal uses it so that looking the Case up never changes which refusal the caller gets.
export async function ownedSessionForRefusal(
  ctx: MobileApiContext,
  sessionId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await dbQuery<Record<string, unknown>>(
      db(ctx).from("kael_chat_sessions").select(SESSION_COLUMNS).eq("id", sessionId).single(),
    );
    if (result.error || !result.data) return null;
    assertKaelSessionOwnership(result.data, ctx);
    return result.data;
  } catch {
    return null;
  }
}

const CLOSED_STATUSES = new Set(["confirmed", "abandoned", "unsupported"]);

// A request that carries customer-authored text but no typed message (a create on an existing session) is not a turn
// the Case takes, so nothing about it changes unless the text reports an emergency. Returns true when it was answered.
// `soft` is for a request that is already bound for a refusal: a Case it cannot reach is then simply not answered.
export async function answerEmergencyOnOwnedSession(
  ctx: MobileApiContext,
  sessionId: string,
  input: { readonly texts: readonly string[]; readonly language: "vi" | "en"; readonly soft: boolean },
): Promise<boolean> {
  if (input.texts.length === 0) return false;
  let session: Record<string, unknown> | null;
  if (input.soft) {
    session = await ownedSessionForRefusal(ctx, sessionId);
  } else {
    const result = await dbQuery<Record<string, unknown>>(
      db(ctx).from("kael_chat_sessions").select(SESSION_COLUMNS).eq("id", sessionId).single(),
    );
    if (result.error || !result.data) apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
    assertKaelSessionOwnership(result.data, ctx);
    session = result.data;
  }
  if (!session) return false;
  const emergency = resolveCaseEmergency({
    message: input.texts,
    language: input.language,
    serviceType: session.service_type,
    parked: true,
  });
  if (!emergency) return false;
  if (CLOSED_STATUSES.has(asKaelChatStatus(session.status))) {
    refuseWithEmergencyGuidance(
      { code: "INVALID_STATUS", message: "Phiên Kael này không còn nhận tin nhắn", status: 409 },
      { texts: input.texts, language: input.language, serviceType: session.service_type, entry: "create", identity: ctx, session },
    );
  }
  await answerParkedEmergency({
    client: db(ctx),
    sessionId,
    session,
    texts: input.texts,
    emergency,
    entry: "create",
    identity: ctx,
  });
  return true;
}

// A classified emergency whose reply could not be written: the failure is traced (route, entry, gate version and
// correlation only, never a word of the customer's text) and the error the caller already raises keeps its code and
// status but carries the guidance, so the customer is not left with a bare failure while the Case may be in danger.
function emergencyWriteFailure(
  error: unknown,
  emergency: CaseEmergency,
  entry: CaseEmergencyEntry,
  identity: KaelTurnTraceIdentity | undefined,
  session: Record<string, unknown> | undefined,
): ApiFailure {
  logEmergencyTrace(emergencyTrace(emergency, entry, identity, session, "emergency_write_failed"));
  const known = error instanceof ApiFailure ? error : null;
  return new ApiFailure(
    known?.code ?? "DB_ERROR",
    `${emergency.guidance.response}\n\n${known?.message ?? "Không thể lưu phản hồi khẩn cấp"}`,
    known?.status ?? 500,
    known?.extra,
  );
}

type TurnRow = {
  readonly index: number;
  readonly role: string;
  readonly text: string | null;
  readonly emergencyReply: boolean;
};

function turnRow(row: Record<string, unknown> | undefined): TurnRow | undefined {
  if (!row) return undefined;
  return {
    index: asNumber(row.turn_index),
    role: typeof row.role === "string" ? row.role : "",
    text: typeof row.text_content === "string" ? row.text_content : null,
    emergencyReply: asRecord(row.safe_metadata).safety_source === "deterministic_emergency",
  };
}

// Answers a reported emergency on a request the Case cannot take: the customer's words and one deterministic
// reply are recorded, and nothing else about the Case moves. Only the customer decides the booking, so a pending
// confirmation is never touched, and no evidence is consumed or merged.
//
// A write that failed half-way leaves rows the session counter does not know about, and a concurrent duplicate
// races for the same turn index. One bounded retry re-reads the table and finishes what is already there instead
// of repeating it. This is a mitigation inside the existing tables: the guarantee that the exchange is written
// atomically and exactly once needs a database function and is proposed separately.
export async function answerParkedEmergency(input: {
  readonly client: DbClient;
  readonly sessionId: string;
  readonly session: Record<string, unknown>;
  readonly texts: readonly string[];
  readonly emergency: CaseEmergency;
  readonly entry: CaseEmergencyEntry;
  readonly identity?: KaelTurnTraceIdentity;
}): Promise<void> {
  const recorded = sanitizeCustomerCaseEvidenceText(input.texts.join("\n")).slice(0, 5000);
  const trace = emergencyTrace(input.emergency, input.entry, input.identity, input.session);
  for (let attempt = 1;; attempt += 1) {
    try {
      await writeParkedExchange(input, recorded, trace);
      break;
    } catch (error) {
      if (attempt >= 2) {
        throw emergencyWriteFailure(error, input.emergency, input.entry, input.identity, input.session);
      }
    }
  }
  logEmergencyTrace(trace);
}

async function writeParkedExchange(
  input: Parameters<typeof answerParkedEmergency>[0],
  recorded: string,
  trace: KaelTurnTrace | undefined,
) {
  const { client, sessionId } = input;
  const [session, turns] = await Promise.all([
    dbQuery<Record<string, unknown>>(
      client.from("kael_chat_sessions").select("total_turns, status").eq("id", sessionId).single(),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      client.from("kael_chat_turns")
        .select("turn_index, role, text_content, safe_metadata")
        .eq("session_id", sessionId)
        .order("turn_index", { ascending: false })
        .limit(2),
    ),
  ]);
  if (session.error || !session.data || turns.error || !Array.isArray(turns.data)) {
    apiFailure("DB_ERROR", "Không thể tải phiên Kael", 500);
  }
  const counted = asNumber(session.data.total_turns);
  const last = turnRow(turns.data[0]);
  const before = turnRow(turns.data[1]);
  // Turns a failed earlier attempt wrote after the last one the counter recorded.
  const stranded = last !== undefined && last.index > counted;

  if (
    stranded && last.emergencyReply && before?.role === "customer" && before.text === recorded &&
    before.index === last.index - 1
  ) {
    await updateKaelSession(client, sessionId, { total_turns: last.index });
    return;
  }
  const reusable = stranded && last.role === "customer" && last.text === recorded;
  const customerIndex = reusable ? last.index : Math.max(counted, last?.index ?? 0) + 1;
  if (!reusable) {
    await insertKaelTurn(client, {
      session_id: sessionId,
      turn_index: customerIndex,
      role: "customer",
      content_type: "text",
      text_content: recorded,
      media_refs: [],
      safe_metadata: {},
    });
  }
  await appendKaelSystemTurn(client, sessionId, {
    contentType: "analysis",
    text: input.emergency.guidance.response,
    // The reply never moves the Case: it keeps whatever phase and offer time it had.
    nextStatus: asKaelChatStatus(session.data.status),
    afterTurnIndex: customerIndex,
    keepEstimateTimestamp: true,
    telemetry: { replySource: "template" },
    metadata: {
      safety_source: "deterministic_emergency",
      emergency_route: input.emergency.guidance.route,
      ...(trace ? { turn_trace: trace } : {}),
    },
  });
}

// A reply on a turn the Case has already taken: wiring or water advice the intake continues after, or an
// emergency in a first message or booking description that has just been recorded.
export async function answerCaseEmergency(
  client: DbClient,
  sessionId: string,
  emergency: CaseEmergency,
  options: {
    readonly entry: CaseEmergencyEntry;
    readonly identity?: KaelTurnTraceIdentity;
    // The session as it stood before this turn: the trace names its service and phase.
    readonly session?: Record<string, unknown>;
    // A Case whose offer is under review stays under review after advice the turn continues from.
    readonly keepOfferStatus?: boolean;
  },
) {
  const trace = emergencyTrace(emergency, options.entry, options.identity, options.session);
  try {
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "analysis",
      text: emergency.guidance.response,
      nextStatus: options.keepOfferStatus && asKaelChatStatus(options.session?.status) === "estimate_ready"
        ? "estimate_ready"
        : "active",
      telemetry: { replySource: "template" },
      metadata: {
        safety_source: "deterministic_emergency",
        emergency_route: emergency.guidance.route,
        ...(trace ? { turn_trace: trace } : {}),
      },
    });
  } catch (error) {
    throw emergencyWriteFailure(error, emergency, options.entry, options.identity, options.session);
  }
  logEmergencyTrace(trace);
}
