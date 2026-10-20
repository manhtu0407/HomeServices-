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

const ROUTES = ["case_work_question", "assistant_case", "assistant_normal"] as const;
const STAGES = [
  "answered",
  "prompt_injection",
  "unsafe_request",
  "permission_gate",
  "boundary_guard",
  "clarification_required",
  "provider_output",
  "answer_unavailable",
] as const;
const OUTCOMES = ["answered", "educational_only", "redirect", "unsupported", "fallback"] as const;
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
  const safeTrace = typeof actorRoleHash === "string" && ACTOR_ROLE_HASH.test(actorRoleHash)
    ? Object.freeze({ ...trace, actor_role_hash: actorRoleHash })
    : trace;
  write("kael_turn_trace", safeTrace);
  return true;
}
