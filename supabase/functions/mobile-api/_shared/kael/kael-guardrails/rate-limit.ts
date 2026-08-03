import type { KaelActorRole, DeclineTemplateKey, KaelPermissionGateDecision } from "./permission-gate.ts";
import { renderDeclineTemplate } from "./permission-gate.ts";

export type KaelRateLimitAction =
  | "customer_intent_classification"
  | "customer_full_estimate_request"
  | "customer_clarification"
  | "customer_scope_change"
  | "worker_brief_clarification"
  | "worker_scope_change_submit"
  | "admin"
  | "system_background_learning";

export type KaelRateLimitRequest = {
  actor: KaelActorRole;
  actorId: string;
  action: KaelRateLimitAction;
  jobId?: string;
  estimatedCostUsd?: number;
};

type LimitConfig = {
  perMinute?: number;
  perDay?: number;
  perJob?: number;
  monthlyCostCapUsd?: number;
  dailyCostCapUsd?: number;
};

type Counter = { count: number; windowStart: number };

const LIMITS: Record<KaelRateLimitAction, LimitConfig> = {
  customer_intent_classification: { perMinute: 30 },
  customer_full_estimate_request: { perMinute: 5, perDay: 50, monthlyCostCapUsd: 5 },
  customer_clarification: { perMinute: 10, perDay: 100 },
  customer_scope_change: { perJob: 3 },
  worker_brief_clarification: { perJob: 3 },
  worker_scope_change_submit: { perJob: 1 },
  admin: {},
  system_background_learning: { dailyCostCapUsd: 30 },
};

const counters = new Map<string, Counter>();
const costCounters = new Map<string, number>();

export function checkKaelActorRateLimit(
  request: KaelRateLimitRequest,
): KaelPermissionGateDecision {
  const config = LIMITS[request.action];
  if (!config || request.actor === "admin" || request.action === "admin") {
    return allowRate(request);
  }

  const costBlocked = checkCostCap(request, config);
  if (costBlocked) return costBlocked;

  const minute = config.perMinute
    ? consumeCounter(`minute:${request.actor}:${request.actorId}:${request.action}`, 60_000, config.perMinute)
    : null;
  if (minute && !minute.allowed) return denyRate(request, "RATE_LIMIT_HIT", "rate_limit_hit", minute.retryAfterMs);

  const day = config.perDay
    ? consumeCounter(`day:${request.actor}:${request.actorId}:${request.action}`, 86_400_000, config.perDay)
    : null;
  if (day && !day.allowed) return denyRate(request, "RATE_LIMIT_HIT", "rate_limit_hit", day.retryAfterMs);

  const perJob = config.perJob && request.jobId
    ? consumeCounter(`job:${request.actor}:${request.actorId}:${request.action}:${request.jobId}`, 86_400_000, config.perJob)
    : null;
  if (perJob && !perJob.allowed) return denyRate(request, "RATE_LIMIT_HIT", "rate_limit_hit", perJob.retryAfterMs);

  if (request.estimatedCostUsd && request.estimatedCostUsd > 0) {
    addCost(request.actor, request.actorId, request.action, request.estimatedCostUsd);
  }
  return allowRate(request);
}

export function recordKaelCostForTests(
  actor: KaelActorRole,
  actorId: string,
  action: KaelRateLimitAction,
  amountUsd: number,
) {
  addCost(actor, actorId, action, amountUsd);
}

export function resetKaelRateLimitForTests() {
  counters.clear();
  costCounters.clear();
}

function checkCostCap(
  request: KaelRateLimitRequest,
  config: LimitConfig,
): KaelPermissionGateDecision | null {
  const estimated = request.estimatedCostUsd ?? 0;
  if (estimated <= 0) return null;
  const monthCap = config.monthlyCostCapUsd;
  if (monthCap !== undefined) {
    const current = costCounters.get(costKey("month", request.actor, request.actorId, request.action)) ?? 0;
    if (current + estimated > monthCap) {
      return denyRate(request, "COST_CAP_HIT", "cost_cap_hit", 0);
    }
  }
  const dayCap = config.dailyCostCapUsd;
  if (dayCap !== undefined) {
    const current = costCounters.get(costKey("day", request.actor, request.actorId, request.action)) ?? 0;
    if (current + estimated > dayCap) {
      return denyRate(request, "COST_CAP_HIT", "cost_cap_hit", 0);
    }
  }
  return null;
}

function consumeCounter(
  key: string,
  windowMs: number,
  limit: number,
) {
  const now = Date.now();
  const current = counters.get(key);
  const counter = !current || now - current.windowStart >= windowMs
    ? { count: 0, windowStart: now }
    : current;
  if (counter.count >= limit) {
    return { allowed: false, retryAfterMs: Math.max(1_000, windowMs - (now - counter.windowStart)) };
  }
  counter.count += 1;
  counters.set(key, counter);
  return { allowed: true, retryAfterMs: 0 };
}

function addCost(
  actor: KaelActorRole,
  actorId: string,
  action: KaelRateLimitAction,
  amountUsd: number,
) {
  for (const period of ["month", "day"] as const) {
    const key = costKey(period, actor, actorId, action);
    costCounters.set(key, (costCounters.get(key) ?? 0) + amountUsd);
  }
}

function costKey(
  period: "month" | "day",
  actor: KaelActorRole,
  actorId: string,
  action: KaelRateLimitAction,
) {
  return `${period}:${actor}:${actorId}:${action}`;
}

function allowRate(request: KaelRateLimitRequest): KaelPermissionGateDecision {
  return {
    purpose: "clarification",
    actor: request.actor,
    actorId: request.actorId,
    jobId: request.jobId,
    jobRelation: "none",
    action: "ask_clarification",
    topic: "app_usage_help",
    intentConfidence: 1,
    topicSource: "deterministic_rule",
    boundarySignal: false,
    allowed: true,
    decision: "allow",
    reasonCode: "RATE_LIMIT_ALLOW",
  };
}

function denyRate(
  request: KaelRateLimitRequest,
  reasonCode: "RATE_LIMIT_HIT" | "COST_CAP_HIT",
  declineTemplateKey: DeclineTemplateKey,
  retryAfterMs: number,
): KaelPermissionGateDecision {
  return {
    purpose: "clarification",
    actor: request.actor,
    actorId: request.actorId,
    jobId: request.jobId,
    jobRelation: "none",
    action: "ask_clarification",
    topic: "app_usage_help",
    intentConfidence: 1,
    topicSource: "deterministic_rule",
    boundarySignal: false,
    allowed: false,
    decision: reasonCode === "RATE_LIMIT_HIT" ? "rate_limit" : "deny",
    reasonCode,
    declineTemplateKey,
    responseText: renderDeclineTemplate(declineTemplateKey, {
      seconds: Math.ceil(retryAfterMs / 1000),
    }),
    retryAfterMs,
    safeMetadata: {
      rate_limit_action: request.action,
      estimated_cost_usd: request.estimatedCostUsd ?? null,
    },
  };
}
