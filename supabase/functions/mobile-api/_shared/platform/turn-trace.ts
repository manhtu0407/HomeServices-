import { checkRateLimit, type RateLimitConfig } from "./rate-limit.ts";

// A Kael turn trace answers "which step refused this, why, and on which release" without any
// customer text. Every value is either a member of a closed set or matches a strict identifier
// pattern, so a value that does not fit is dropped rather than stored.

export const KAEL_TURN_TRACE_SCHEMA = "kael_turn_trace.v1";

export const KAEL_TURN_TRACE_KEYS: readonly string[] = [
  "schema",
  "correlation_id",
  "actor_role_hash",
  "route",
  "stage",
  "outcome",
  "fallback_used",
  "service_code",
  "assistant_service_code",
  "case_phase",
  "pending_slot",
  "missing_fact_count",
  "intent",
  "intent_source",
  "permission_reason",
  "permission_topic",
  "topic_source",
  "boundary_reason",
  "gate_entry",
  "emergency_gate_version",
  "replay_topic",
  "quote_blocker",
  "edge_release_id",
  "edge_deployment_id",
  "client_release_id",
  "client_git_sha",
  "client_build_number",
  "client_eas_build_id",
  "client_platform",
];

const ROUTES = ["case_work_question", "assistant_case", "assistant_normal", "case_emergency"] as const;
const STAGES = [
  "answered",
  "prompt_injection",
  "unsafe_request",
  "permission_gate",
  "boundary_guard",
  "clarification_required",
  "provider_output",
  "answer_unavailable",
  "emergency_gate",
] as const;
const OUTCOMES = [
  "answered",
  "educational_only",
  "redirect",
  "unsupported",
  "fallback",
  "emergency_stop",
  "emergency_advice",
  "emergency_guidance_only",
  "emergency_write_failed",
] as const;
// Where in the Case a reported emergency was caught: the follow-up turn, the evidence submission, the first
// message of a new Case, or the booking confirmation.
const GATE_ENTRIES = ["turn", "evidence", "create", "confirm"] as const;
const EMERGENCY_ROUTES = ["fire", "medical", "police", "electrical_water", "gas", "uncertain"] as const;
const GATE_VERSION = /^[a-z][a-z0-9_.]{2,47}$/;
const SERVICES = ["electrical", "plumbing", "cleaning", "hvac", "upholstery", "handyman"] as const;
const BOUNDARY_REASONS = ["prompt_injection", "out_of_scope", "service_mismatch"] as const;
const INTENT_SOURCES = ["chip", "ai", "fallback"] as const;
const TOPIC_SOURCES = ["deterministic_rule", "llm"] as const;
const PLATFORMS = ["ios", "android", "web-preview"] as const;
// Every value the quote-readiness and price-gap paths can persist today; anything else is "other".
const QUOTE_BLOCKERS = [
  "required_intake_incomplete",
  "validated_price_evidence_unavailable",
  "tier_a_incomplete",
  "worker_quote_or_inspection_ready",
  "case_work_turn_safety_limit",
  "no_published_price",
  "too_few_trusted_sources",
  "mixed_units",
  "stale_sources",
  "sources_disagree",
  "lookup_unavailable",
] as const;

const LOWER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const UPPER_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const TRACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ACTOR_ROLES = ["admin", "admin_operator", "customer", "worker"] as const;
const ACTOR_ROLE_HASH = /^[0-9a-f]{64}$/;
const RELEASE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DEPLOYMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const GIT_SHA = /^[0-9a-f]{7,40}$/;

export type KaelTurnTraceIdentity = {
  readonly user?: { readonly id?: unknown };
  readonly role?: unknown;
  readonly traceId?: unknown;
  readonly releaseId?: unknown;
  readonly deploymentId?: unknown;
  readonly clientPlatform?: unknown;
  readonly clientBuildNumber?: unknown;
  readonly clientEasBuildId?: unknown;
  readonly clientGitSha?: unknown;
  readonly clientReleaseId?: unknown;
};

export type KaelTurnTraceInput = {
  readonly identity?: KaelTurnTraceIdentity;
  readonly route: unknown;
  readonly stage: unknown;
  readonly outcome?: unknown;
  readonly fallbackUsed?: unknown;
  readonly canonicalService?: unknown;
  readonly assistantService?: unknown;
  readonly casePhase?: unknown;
  readonly pendingSlot?: unknown;
  readonly missingFactCount?: unknown;
  readonly intent?: unknown;
  readonly intentSource?: unknown;
  readonly permissionReason?: unknown;
  readonly permissionTopic?: unknown;
  readonly topicSource?: unknown;
  readonly boundaryReason?: unknown;
  readonly gateEntry?: unknown;
  readonly emergencyGateVersion?: unknown;
  readonly replayTopic?: unknown;
  readonly quoteReadiness?: unknown;
  readonly priceGapReason?: unknown;
  readonly nextActionReason?: unknown;
};

export type KaelTurnTrace = Readonly<Record<string, string | number | boolean>>;

function member<T extends string>(set: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" && (set as readonly string[]).includes(value) ? value as T : undefined;
}

function matching(pattern: RegExp, value: unknown): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

function service(value: unknown): string {
  return member(SERVICES, value) ?? "none";
}

function quoteBlocker(...candidates: unknown[]): string | undefined {
  const present = candidates.filter((value) => value !== undefined && value !== null && value !== "");
  if (present.length === 0) return undefined;
  for (const value of present) {
    const known = member(QUOTE_BLOCKERS, value);
    if (known) return known;
  }
  return "other";
}

function buildNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 999_999_999
    ? value
    : undefined;
}

function boundedCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 64 ? value : undefined;
}

export function buildKaelTurnTrace(input: KaelTurnTraceInput): KaelTurnTrace {
  const identity = input.identity ?? {};
  const entries: Array<[string, string | number | boolean | undefined]> = [
    ["schema", KAEL_TURN_TRACE_SCHEMA],
    ["correlation_id", matching(TRACE_ID, identity.traceId)],
    ["route", member(ROUTES, input.route) ?? "other"],
    ["stage", member(STAGES, input.stage) ?? "other"],
    ["outcome", member(OUTCOMES, input.outcome)],
    ["fallback_used", typeof input.fallbackUsed === "boolean" ? input.fallbackUsed : undefined],
    ["service_code", service(input.canonicalService)],
    ["assistant_service_code", input.assistantService === undefined ? undefined : service(input.assistantService)],
    ["case_phase", matching(LOWER_CODE, input.casePhase)],
    ["pending_slot", matching(LOWER_CODE, input.pendingSlot)],
    ["missing_fact_count", boundedCount(input.missingFactCount)],
    ["intent", matching(LOWER_CODE, input.intent)],
    ["intent_source", member(INTENT_SOURCES, input.intentSource)],
    ["permission_reason", matching(UPPER_CODE, input.permissionReason)],
    ["permission_topic", matching(LOWER_CODE, input.permissionTopic)],
    ["topic_source", member(TOPIC_SOURCES, input.topicSource)],
    ["boundary_reason", member(BOUNDARY_REASONS, input.boundaryReason)],
    ["gate_entry", member(GATE_ENTRIES, input.gateEntry)],
    ["emergency_gate_version", matching(GATE_VERSION, input.emergencyGateVersion)],
    ["replay_topic", matching(LOWER_CODE, input.replayTopic)],
    ["quote_blocker", quoteBlocker(input.priceGapReason, input.nextActionReason, input.quoteReadiness)],
    ["edge_release_id", matching(RELEASE_ID, identity.releaseId)],
    ["edge_deployment_id", matching(DEPLOYMENT_ID, identity.deploymentId)],
    ["client_release_id", matching(RELEASE_ID, identity.clientReleaseId)],
    ["client_git_sha", matching(GIT_SHA, identity.clientGitSha)],
    ["client_build_number", buildNumber(identity.clientBuildNumber)],
    ["client_eas_build_id", matching(TRACE_ID, identity.clientEasBuildId)],
    ["client_platform", member(PLATFORMS, identity.clientPlatform)],
  ];
  return Object.freeze(Object.fromEntries(entries.filter(([, value]) => value !== undefined))) as KaelTurnTrace;
}

export type CaseEmergencySummary = {
  // Customer turns the gate looked at in the same window; null when the caller could not count them.
  readonly evaluated_turns: number | null;
  readonly emergency_turns: number;
  readonly stopped_turns: number;
  readonly advised_turns: number;
  // Classified emergencies that were refused with the guidance in the error (nothing persisted), and ones whose
  // reply could not be written. Neither is an answered turn, and neither is ever counted as one.
  readonly guidance_only_turns: number;
  readonly write_failed_turns: number;
  readonly by_route: Readonly<Record<string, number>>;
  readonly by_entry: Readonly<Record<string, number>>;
  // emergency_turns / evaluated_turns; null, never 0, when there is no sample to divide by.
  readonly emergency_rate: number | null;
};

// Counts the Case emergency answers among persisted reply traces. The denominator is supplied by the caller (the
// customer turns of the same Case sessions in the same window) because every route that advances a Case passes the
// gate, so a customer turn is a gate evaluation. A trace that is not a well-formed Case emergency trace is ignored.
export function summarizeCaseEmergencyTraces(
  traces: readonly unknown[],
  evaluatedTurns: unknown,
): CaseEmergencySummary {
  const byRoute: Record<string, number> = {};
  const byEntry: Record<string, number> = {};
  let stopped = 0;
  let advised = 0;
  let guidanceOnly = 0;
  let writeFailed = 0;
  for (const candidate of traces) {
    const trace = candidate !== null && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
    if (
      trace.schema !== KAEL_TURN_TRACE_SCHEMA || trace.route !== "case_emergency" ||
      trace.stage !== "emergency_gate"
    ) continue;
    const outcome = member(
      ["emergency_stop", "emergency_advice", "emergency_guidance_only", "emergency_write_failed"] as const,
      trace.outcome,
    );
    if (!outcome) continue;
    const reason = typeof trace.permission_reason === "string" ? trace.permission_reason.toLowerCase() : "";
    const route = member(EMERGENCY_ROUTES, reason.startsWith("emergency_") ? reason.slice("emergency_".length) : "") ??
      "other";
    byRoute[route] = (byRoute[route] ?? 0) + 1;
    const entry = member(GATE_ENTRIES, trace.gate_entry) ?? "other";
    byEntry[entry] = (byEntry[entry] ?? 0) + 1;
    if (outcome === "emergency_stop") stopped += 1;
    else if (outcome === "emergency_advice") advised += 1;
    else if (outcome === "emergency_guidance_only") guidanceOnly += 1;
    else writeFailed += 1;
  }
  const emergency = stopped + advised + guidanceOnly + writeFailed;
  const evaluated = typeof evaluatedTurns === "number" && Number.isSafeInteger(evaluatedTurns) &&
      evaluatedTurns >= emergency
    ? evaluatedTurns
    : null;
  return {
    evaluated_turns: evaluated,
    emergency_turns: emergency,
    stopped_turns: stopped,
    advised_turns: advised,
    guidance_only_turns: guidanceOnly,
    write_failed_turns: writeFailed,
    by_route: byRoute,
    by_entry: byEntry,
    emergency_rate: evaluated !== null && evaluated > 0 ? emergency / evaluated : null,
  };
}

export async function hashKaelActorRole(
  actorId: unknown,
  actorRole: unknown,
): Promise<string | undefined> {
  if (!matching(ACTOR_ID, actorId) || !member(ACTOR_ROLES, actorRole)) return undefined;
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return undefined;
    const digest = await subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${actorRole}:${actorId}`),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}

// Per isolate: enough to see a pattern, too little to flood the function logs on a burst.
const LOG_ALLOWANCE: RateLimitConfig = { maxTokens: 20, refillRate: 20, refillIntervalMs: 60_000 };

// Answered turns are persisted on the reply row only; the log line exists for refusals and
// redirects, which are the turns an operator is asked about.
export function logKaelTurnTrace(
  trace: KaelTurnTrace,
  write: (...args: unknown[]) => void = console.warn,
  actorRoleHash?: unknown,
): boolean {
  if (trace.stage === "answered") return false;
  const bucket = `kael_turn_trace_log:${trace.route}:${trace.stage}`;
  if (!checkRateLimit(bucket, LOG_ALLOWANCE).allowed) return false;
  // A stable pseudonym beside a health, fire or police emergency code would profile one person.
  const emergencyTurn = typeof trace.permission_reason === "string" && trace.permission_reason.startsWith("EMERGENCY_");
  const safeTrace = !emergencyTurn && typeof actorRoleHash === "string" && ACTOR_ROLE_HASH.test(actorRoleHash)
    ? Object.freeze({ ...trace, actor_role_hash: actorRoleHash })
    : trace;
  write("kael_turn_trace", safeTrace);
  return true;
}
