// Deterministic emergency handling for Case intake turns. It runs before the boundary guard, the
// intent router and the pipeline, and it does not depend on a playbook flag or on a model.

import { sanitizeForLLM } from "../../../../_shared/domain.ts";
import { sanitizeCustomerCaseEvidenceText } from "../../kael/evidence/untrusted-evidence.ts";
import {
  EMERGENCY_GATE_VERSION,
  resolveReportedEmergencyGuidanceFromTexts,
  type EmergencyGuidance,
} from "../../kael/kael-guardrails/emergency-guidance.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { asKaelChatStatus, asNumber, asRecord, nullableServiceType } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import {
  buildKaelTurnTrace,
  logKaelTurnTrace,
  type KaelTurnTrace,
  type KaelTurnTraceIdentity,
} from "../../platform/turn-trace.ts";
import { requiresImmediateKaelSafetyPathForTexts } from "./intake-safety.ts";
import { appendKaelSystemTurn, insertKaelTurn, updateKaelSession } from "./session-store.ts";

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

function emergencyTrace(
  emergency: CaseEmergency,
  entry: CaseEmergencyEntry,
  identity: KaelTurnTraceIdentity | undefined,
  session: Record<string, unknown> | undefined,
): KaelTurnTrace | undefined {
  // Tracing is observability only: it must never be the reason a customer's emergency goes unanswered.
  try {
    return buildKaelTurnTrace({
      identity,
      route: "case_emergency",
      stage: "emergency_gate",
      outcome: emergency.stopsTurn ? "emergency_stop" : "emergency_advice",
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
      if (attempt >= 2) throw error;
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
  logEmergencyTrace(trace);
}
