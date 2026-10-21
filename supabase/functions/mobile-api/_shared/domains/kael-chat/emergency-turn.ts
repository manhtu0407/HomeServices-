
import { sanitizeForLLM } from "../../../../_shared/domain.ts";
import { sanitizeCustomerCaseEvidenceText } from "../../kael/evidence/untrusted-evidence.ts";
import {
  EMERGENCY_GATE_VERSION,
  resolveReportedEmergencyGuidanceFromTexts,
  type EmergencyGuidance,
} from "../../kael/kael-guardrails/emergency-guidance.ts";
import { setRequestEmergencyGuidance } from "../../platform/emergency-guidance.ts";
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
  readonly stopsTurn: boolean;
};

export type CaseEmergencyEntry = "turn" | "evidence" | "create" | "confirm";

type CaseEmergencyInput = {
  readonly message: string | readonly string[];
  readonly language: "vi" | "en";
  readonly serviceType: unknown;
  readonly persistedSafetySignals?: readonly string[];
  readonly actorId?: string | null;
  readonly parked?: boolean;
};

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

export function registerCaseEmergencyDelivery(ctx: MobileApiContext, texts: readonly string[], serviceType: unknown): void {
  if (ctx.role !== "customer") return;
  const guidance = resolveReportedEmergencyGuidanceFromTexts(texts, "vi", {
    serviceType: typeof serviceType === "string" ? serviceType : null,
  });
  if (guidance) setRequestEmergencyGuidance(ctx, { version: "v1", route: guidance.route });
}

export async function registerRejectedCaseEmergencyDelivery(ctx: MobileApiContext, raw: unknown, sessionId?: string): Promise<void> {
  if (ctx.role !== "customer" || !raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const input = raw as Record<string, unknown>;
  const bounded = (value: unknown) => typeof value === "string" && value.length <= 5000 ? value : undefined;
  const evidenceItems = Array.isArray(input.evidence_items) ? input.evidence_items.slice(0, 10).map(item => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { transcript: bounded(value.transcript), summary: bounded(value.summary) };
  }) : [];
  const texts = customerAuthoredTexts({
    message: bounded(input.message), intakeDescription: bounded(input.intake_description),
    skipReason: bounded(input.skip_reason), evidenceItems,
  });
  if (!texts.length) return;
  const referenced = sessionId ?? input.session_id;
  let serviceType: unknown = input.service_type;
  if (referenced !== undefined && referenced !== null) {
    if (typeof referenced !== "string" || referenced.length > 64) return;
    const owned = await ownedSessionForRefusal(ctx, referenced);
    if (!owned) return;
    serviceType = owned.service_type;
  }
  registerCaseEmergencyDelivery(ctx, texts, serviceType);
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
  try {
    if (trace) logKaelTurnTrace(trace, console.warn);
  } catch {
    return;
  }
}

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
  registerCaseEmergencyDelivery(ctx, input.texts, session.service_type);
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

export async function answerEmergencyOnOpenSession(
  ctx: MobileApiContext,
  sessionId: string,
  session: Record<string, unknown>,
  input: { readonly texts: readonly string[]; readonly language: "vi" | "en"; readonly entry: CaseEmergencyEntry },
): Promise<boolean> {
  registerCaseEmergencyDelivery(ctx, input.texts, session.service_type);
  if (CLOSED_STATUSES.has(asKaelChatStatus(session.status))) return false;
  const emergency = resolveCaseEmergency({
    message: input.texts,
    language: input.language,
    serviceType: session.service_type,
    parked: true,
  });
  if (!emergency) return false;
  await answerParkedEmergency({
    client: db(ctx),
    sessionId,
    session,
    texts: input.texts,
    emergency,
    entry: input.entry,
    identity: ctx,
  });
  return true;
}

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

export async function answerCaseEmergency(
  client: DbClient,
  sessionId: string,
  emergency: CaseEmergency,
  options: {
    readonly entry: CaseEmergencyEntry;
    readonly identity?: KaelTurnTraceIdentity;
    readonly session?: Record<string, unknown>;
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
