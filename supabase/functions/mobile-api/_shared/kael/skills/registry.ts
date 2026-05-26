import { z } from "zod";
import type { ComplexityLevel, ServiceType } from "../../../../_shared/domain.ts";
import { buildLS1MarketMemoryCandidate } from "./LS1-market-memory.ts";
import { buildLS2CaseReviewCandidate } from "./LS2-case-review.ts";
import { buildLS3WorkerPatternCandidate } from "./LS3-worker-pattern.ts";
import { buildLS4CustomerPreferenceCandidate } from "./LS4-customer-preference.ts";
import { buildLS5ServiceKnowledgeCandidate } from "./LS5-service-knowledge.ts";
import { buildLS6SafetyPatternCandidate } from "./LS6-safety-pattern.ts";
import { buildLS7DeclineReasonCandidate } from "./LS7-decline-reason.ts";

export const LEARNING_SKILL_IDS = ["LS1", "LS2", "LS3", "LS4", "LS5", "LS6", "LS7"] as const;
export type LearningSkillId = (typeof LEARNING_SKILL_IDS)[number];

export const ALLOWED_LEARNING_TARGETS = [
  "analysis_prompt",
  "price_prior",
  "clarification_pattern",
  "advisory_pattern",
  "detection_pattern",
  "intent_category",
] as const;
export type LearningAllowedTarget = (typeof ALLOWED_LEARNING_TARGETS)[number];

export const FORBIDDEN_LEARNING_EFFECTS = [
  "auto_charge_payment",
  "auto_confirm_booking",
  "auto_cancel_job",
  "auto_approve_worker",
  "auto_suspend_worker",
  "auto_change_final_price",
  "auto_expand_service_scope",
  "hide_learning_changes_from_admin",
] as const;
export type LearningForbiddenEffect = (typeof FORBIDDEN_LEARNING_EFFECTS)[number];

export const LEARNING_LIFECYCLE_STATES = [
  "candidate",
  "pending_evidence",
  "evidence_gate_check",
  "auto_promoted",
  "manual_review",
  "active",
  "monitoring",
  "degraded",
  "rolled_back",
  "archived",
  "rejected",
] as const;
export type LearningLifecycleState = (typeof LEARNING_LIFECYCLE_STATES)[number];

export type LearningSkillTrigger =
  | "post-A14"
  | "post-B6"
  | "post-B7"
  | "post-decline"
  | "admin-trigger"
  | "admin-safety-tag";

export type LearningSkillInput = {
  actor_id?: string;
  actor_role?: string;
  admin_user_id?: string;
  job_id?: string;
  customer_id?: string;
  worker_id?: string;
  service_type?: ServiceType;
  problem_slug?: string;
  district_code?: string;
  complexity?: ComplexityLevel;
  baseline_min?: number;
  baseline_max?: number;
  final_price?: number | null;
  rating?: number;
  review_tags?: string[];
  scope_change_requested?: boolean;
  reviewed_at?: string;
  worker_report?: Record<string, unknown>;
  decline_reason?: string;
  feedback_present?: boolean;
  [key: string]: unknown;
};

export type LearningSkillCandidate = {
  skill_id: LearningSkillId;
  candidate_type: string;
  trigger: LearningSkillTrigger;
  target: LearningAllowedTarget;
  effects: readonly LearningForbiddenEffect[];
  payload: Record<string, unknown>;
  prompt_version: string;
  requires_manual_review: boolean;
  lifecycle_state: LearningLifecycleState;
};

export const learningSkillInputSchema = z.record(z.string(), z.unknown());
const skillIdSchema = z.enum(LEARNING_SKILL_IDS);
const targetSchema = z.enum(ALLOWED_LEARNING_TARGETS);
const effectSchema = z.enum(FORBIDDEN_LEARNING_EFFECTS);
const lifecycleSchema = z.enum(LEARNING_LIFECYCLE_STATES);

export const learningSkillCandidateSchema = z.object({
  skill_id: skillIdSchema,
  candidate_type: z.string().min(2).max(80),
  trigger: z.enum([
    "post-A14",
    "post-B6",
    "post-B7",
    "post-decline",
    "admin-trigger",
    "admin-safety-tag",
  ]),
  target: targetSchema,
  effects: z.array(effectSchema).max(FORBIDDEN_LEARNING_EFFECTS.length),
  payload: z.record(z.string(), z.unknown()),
  prompt_version: z.string().min(3).max(120),
  requires_manual_review: z.boolean(),
  lifecycle_state: lifecycleSchema,
});

export type LearningEvidenceGateConfig = {
  min_evidence_count: number;
  confidence_threshold: number;
  recency_window_days: number;
  require_completed_transactions: true;
  quality_filter?: (evidence: unknown[]) => unknown[];
};

export type KaelLearningSkill = {
  id: LearningSkillId;
  name: string;
  trigger: readonly LearningSkillTrigger[];
  status: "PR12" | "NEW";
  effect: string;
  inputs_schema: z.ZodType<unknown>;
  outputs_schema: typeof learningSkillCandidateSchema;
  evidence_gate: LearningEvidenceGateConfig;
  scope_limits: {
    forbidden_effects: readonly LearningForbiddenEffect[];
    allowed_targets: readonly LearningAllowedTarget[];
  };
  rollback: {
    available: boolean;
    auto_rollback_trigger?: {
      accuracy_drop_pct: number;
      satisfaction_drop_pts: number;
      monitor_window_days: number;
    };
  };
  performance_metrics: readonly (
    | "applied_count"
    | "override_count"
    | "accuracy_delta"
    | "satisfaction_delta"
  )[];
  enabled: boolean;
  version: number;
  prompt: {
    version: string;
    template: string;
  };
  manual_review_required: boolean;
};

const PERFORMANCE_METRICS = [
  "applied_count",
  "override_count",
  "accuracy_delta",
  "satisfaction_delta",
] as const;

function evidenceGate(): LearningEvidenceGateConfig {
  return {
    min_evidence_count: 5,
    confidence_threshold: 0.6,
    recency_window_days: 90,
    require_completed_transactions: true,
  };
}

function rollback(available = true): KaelLearningSkill["rollback"] {
  return {
    available,
    auto_rollback_trigger: {
      accuracy_drop_pct: 10,
      satisfaction_drop_pts: 0.3,
      monitor_window_days: 30,
    },
  };
}

function skill(input: Omit<KaelLearningSkill, "inputs_schema" | "outputs_schema" | "evidence_gate" | "scope_limits" | "rollback" | "performance_metrics" | "enabled" | "version" | "manual_review_required"> & {
  targets: readonly LearningAllowedTarget[];
  manual_review_required?: boolean;
}): KaelLearningSkill {
  return {
    id: input.id,
    name: input.name,
    trigger: input.trigger,
    status: input.status,
    effect: input.effect,
    inputs_schema: learningSkillInputSchema,
    outputs_schema: learningSkillCandidateSchema,
    evidence_gate: evidenceGate(),
    scope_limits: {
      forbidden_effects: FORBIDDEN_LEARNING_EFFECTS,
      allowed_targets: input.targets,
    },
    rollback: rollback(true),
    performance_metrics: PERFORMANCE_METRICS,
    enabled: true,
    version: 1,
    prompt: input.prompt,
    manual_review_required: input.manual_review_required ?? false,
  };
}

export const KAEL_LEARNING_SKILLS: readonly KaelLearningSkill[] = Object.freeze([
  skill({
    id: "LS1",
    name: "Price prior learning",
    trigger: ["post-A14"],
    status: "PR12",
    effect: "Adjust baseline range",
    targets: ["price_prior"],
    prompt: {
      version: "ls1-market-memory.2026-05-25.v1",
      template: "Learn safe price-prior patterns only from completed reviewed jobs.",
    },
  }),
  skill({
    id: "LS2",
    name: "Case review learning",
    trigger: ["post-A14"],
    status: "PR12",
    effect: "Detect missing questions, advisory, and fraud patterns",
    targets: ["clarification_pattern", "advisory_pattern", "detection_pattern"],
    prompt: {
      version: "ls2-case-review.2026-05-25.v1",
      template: "Review completed cases for clarification, advisory, and overclaim patterns.",
    },
  }),
  skill({
    id: "LS3",
    name: "Worker pattern learning",
    trigger: ["post-B6", "post-B7"],
    status: "NEW",
    effect: "Update worker memory red-flag signals",
    targets: ["detection_pattern"],
    prompt: {
      version: "ls3-worker-pattern.2026-05-25.v1",
      template: "Track worker scope-change and completion patterns without punishment.",
    },
  }),
  skill({
    id: "LS4",
    name: "Customer preference learning",
    trigger: ["post-A14"],
    status: "NEW",
    effect: "Update customer memory preferences",
    targets: ["analysis_prompt"],
    prompt: {
      version: "ls4-customer-preference.2026-05-25.v1",
      template: "Summarize durable customer preferences from safe reviewed-job metadata.",
    },
  }),
  skill({
    id: "LS5",
    name: "Service knowledge learning",
    trigger: ["post-A14", "admin-trigger"],
    status: "NEW",
    effect: "Update service knowledge boxes",
    targets: ["advisory_pattern"],
    manual_review_required: true,
    prompt: {
      version: "ls5-service-knowledge.2026-05-25.v1",
      template: "Propose service knowledge updates for admin review only.",
    },
  }),
  skill({
    id: "LS6",
    name: "Safety pattern learning",
    trigger: ["admin-safety-tag"],
    status: "NEW",
    effect: "Extend worker safety and legal-awareness patterns",
    targets: ["detection_pattern", "advisory_pattern"],
    manual_review_required: true,
    prompt: {
      version: "ls6-safety-pattern.2026-05-25.v1",
      template: "Propose safety or legal-awareness patterns for admin review only.",
    },
  }),
  skill({
    id: "LS7",
    name: "Decline reason learning",
    trigger: ["post-decline"],
    status: "NEW",
    effect: "Improve intent categories and decline templates",
    targets: ["intent_category"],
    manual_review_required: true,
    prompt: {
      version: "ls7-decline-reason.2026-05-25.v1",
      template: "Learn safe decline categorization patterns for admin review only.",
    },
  }),
]);

const SKILLS_BY_ID = new Map(KAEL_LEARNING_SKILLS.map((item) => [item.id, item]));

export function listLearningSkills(): readonly KaelLearningSkill[] {
  return KAEL_LEARNING_SKILLS;
}

export function getLearningSkill(id: LearningSkillId): KaelLearningSkill | null {
  return SKILLS_BY_ID.get(id) ?? null;
}

const CANDIDATE_BUILDERS: Record<LearningSkillId, (input: LearningSkillInput) => LearningSkillCandidate> = {
  LS1: buildLS1MarketMemoryCandidate,
  LS2: buildLS2CaseReviewCandidate,
  LS3: buildLS3WorkerPatternCandidate,
  LS4: buildLS4CustomerPreferenceCandidate,
  LS5: buildLS5ServiceKnowledgeCandidate,
  LS6: buildLS6SafetyPatternCandidate,
  LS7: buildLS7DeclineReasonCandidate,
};

export function createLearningSkillCandidate(
  skillId: LearningSkillId,
  input: LearningSkillInput,
): LearningSkillCandidate {
  const candidate = CANDIDATE_BUILDERS[skillId](input);
  return learningSkillCandidateSchema.parse(candidate);
}

export type LearningEvidenceSnapshot = {
  evidence_count: number;
  confidence: number;
  completed_transaction_count: number;
  recent_contradiction_ratio: number;
};

export type LearningEvidenceGateDecision =
  | { promote: true; next_state: "auto_promoted" | "manual_review"; reason: "gate_passed" }
  | {
    promote: false;
    next_state: "pending_evidence" | "manual_review" | "rejected";
    reason:
      | "insufficient_evidence"
      | "low_confidence"
      | "incomplete_transactions"
      | "contradicted_by_recent";
  };

export function evaluateLearningEvidenceGate(
  skill: KaelLearningSkill,
  evidence: LearningEvidenceSnapshot,
): LearningEvidenceGateDecision {
  if (evidence.evidence_count < skill.evidence_gate.min_evidence_count) {
    return { promote: false, next_state: "pending_evidence", reason: "insufficient_evidence" };
  }
  if (
    skill.evidence_gate.require_completed_transactions &&
    evidence.completed_transaction_count < skill.evidence_gate.min_evidence_count
  ) {
    return { promote: false, next_state: "pending_evidence", reason: "incomplete_transactions" };
  }
  if (evidence.recent_contradiction_ratio > 0.2) {
    return { promote: false, next_state: "manual_review", reason: "contradicted_by_recent" };
  }
  if (evidence.confidence < skill.evidence_gate.confidence_threshold) {
    return { promote: false, next_state: "manual_review", reason: "low_confidence" };
  }
  return {
    promote: true,
    next_state: skill.manual_review_required ? "manual_review" : "auto_promoted",
    reason: "gate_passed",
  };
}

export type LearningScopeDecision =
  | { allowed: true }
  | {
    allowed: false;
    reason: "forbidden_effect" | "target_not_allowed";
    audit: {
      event_type: "learning_scope_rejected";
      skill_id: LearningSkillId;
      safe_metadata: Record<string, unknown>;
    };
  };

export function enforceLearningScopeLimits(
  skill: KaelLearningSkill,
  candidate: LearningSkillCandidate,
): LearningScopeDecision {
  const forbiddenEffect = candidate.effects.find((effect) =>
    skill.scope_limits.forbidden_effects.includes(effect)
  );
  if (forbiddenEffect) {
    return {
      allowed: false,
      reason: "forbidden_effect",
      audit: {
        event_type: "learning_scope_rejected",
        skill_id: skill.id,
        safe_metadata: { effect: forbiddenEffect },
      },
    };
  }
  if (!skill.scope_limits.allowed_targets.includes(candidate.target)) {
    return {
      allowed: false,
      reason: "target_not_allowed",
      audit: {
        event_type: "learning_scope_rejected",
        skill_id: skill.id,
        safe_metadata: { target: candidate.target },
      },
    };
  }
  return { allowed: true };
}

const LIFECYCLE_TRANSITIONS: Record<LearningLifecycleState, readonly LearningLifecycleState[]> = {
  candidate: ["pending_evidence"],
  pending_evidence: ["evidence_gate_check"],
  evidence_gate_check: ["auto_promoted", "manual_review", "rejected"],
  auto_promoted: ["active"],
  manual_review: ["active", "rejected"],
  active: ["monitoring"],
  monitoring: ["degraded", "archived"],
  degraded: ["rolled_back"],
  rolled_back: ["archived"],
  archived: [],
  rejected: ["archived"],
};

export function transitionLearningLifecycle(
  from: LearningLifecycleState,
  to: LearningLifecycleState,
): { valid: true } | { valid: false; reason: "invalid_transition" } {
  return LIFECYCLE_TRANSITIONS[from]?.includes(to)
    ? { valid: true }
    : { valid: false, reason: "invalid_transition" };
}

export function recordLearningPerformanceSample(
  ruleId: string,
  sample: {
    applied: boolean;
    overridden: boolean;
    accuracy_delta: number;
    satisfaction_delta: number;
  },
) {
  return {
    rule_id: ruleId,
    applied_count: sample.applied ? 1 : 0,
    override_count: sample.overridden ? 1 : 0,
    accuracy_delta: sample.accuracy_delta,
    satisfaction_delta: sample.satisfaction_delta,
  };
}

export function shouldAutoRollbackLearningRule(
  skill: KaelLearningSkill,
  monitor: {
    accuracy_drop_pct: number;
    satisfaction_drop_pts: number;
    monitor_window_days: number;
  },
): boolean {
  const trigger = skill.rollback.auto_rollback_trigger;
  if (!skill.rollback.available || !trigger) return false;
  if (monitor.monitor_window_days > trigger.monitor_window_days) return false;
  return monitor.accuracy_drop_pct >= trigger.accuracy_drop_pct ||
    monitor.satisfaction_drop_pts >= trigger.satisfaction_drop_pts;
}

export type LearningRuntimeConfig = {
  read_enabled: boolean;
  write_enabled: boolean;
  kill_switch: boolean;
  ab_percentage: number;
  auto_rollback_enabled: boolean;
  enabled: boolean;
  enabled_for_actor: boolean;
};

export function resolveLearningRuntimeConfig(
  getEnv: (name: string) => string | undefined,
  actorId?: string,
): LearningRuntimeConfig {
  const readEnabled = readBoolean(getEnv("KAEL_LEARNING_READ_ENABLED"), false);
  const writeEnabled = readBoolean(getEnv("KAEL_LEARNING_WRITE_ENABLED"), false);
  const killSwitch = readBoolean(getEnv("KAEL_LEARNING_KILL_SWITCH"), false);
  const abPercentage = clampPercent(getEnv("KAEL_LEARNING_AB_PERCENTAGE"));
  const autoRollbackEnabled = readBoolean(getEnv("KAEL_LEARNING_AUTO_ROLLBACK"), true);
  const base: LearningRuntimeConfig = {
    read_enabled: readEnabled,
    write_enabled: writeEnabled,
    kill_switch: killSwitch,
    ab_percentage: abPercentage,
    auto_rollback_enabled: autoRollbackEnabled,
    enabled: readEnabled && writeEnabled && !killSwitch,
    enabled_for_actor: false,
  };
  return {
    ...base,
    enabled_for_actor: actorId ? shouldRunLearningForActor(actorId, base) : base.enabled,
  };
}

export function shouldRunLearningForActor(
  actorId: string,
  config: LearningRuntimeConfig,
): boolean {
  if (!config.enabled) return false;
  if (config.ab_percentage >= 100) return true;
  if (config.ab_percentage <= 0) return false;
  return stableLearningBucket(actorId) < config.ab_percentage;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

function clampPercent(value: string | undefined): number {
  if (!value) return 100;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function stableLearningBucket(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}

export type PlannedLearningTrigger = {
  skill: KaelLearningSkill;
  candidate: LearningSkillCandidate;
  queue_state: "queued" | "manual_review" | "rejected";
  audit?: Extract<LearningScopeDecision, { allowed: false }>;
};

const SKILLS_BY_EVENT: Record<LearningSkillTrigger, readonly LearningSkillId[]> = {
  "post-A14": ["LS1", "LS2", "LS4", "LS5"],
  "post-B6": ["LS3"],
  "post-B7": ["LS3"],
  "post-decline": ["LS7"],
  "admin-trigger": ["LS5"],
  "admin-safety-tag": ["LS6"],
};

export function planLearningSkillTriggers(
  event: LearningSkillTrigger,
  input: LearningSkillInput,
  config: LearningRuntimeConfig = resolveLearningRuntimeConfig(readEdgeRuntimeEnv, learningActorId(input)),
): PlannedLearningTrigger[] {
  const actorId = learningActorId(input);
  if (!shouldRunLearningForActor(actorId, config)) return [];

  return (SKILLS_BY_EVENT[event] ?? []).flatMap((skillId) => {
    const skill = getLearningSkill(skillId);
    if (!skill?.enabled) return [];
    const candidate = createLearningSkillCandidate(skillId, input);
    const scopeDecision = enforceLearningScopeLimits(skill, candidate);
    if (!scopeDecision.allowed) {
      const planned: PlannedLearningTrigger = {
        skill,
        candidate,
        queue_state: "rejected" as const,
        audit: scopeDecision,
      };
      return [planned];
    }
    const planned: PlannedLearningTrigger = {
      skill,
      candidate,
      queue_state: candidate.requires_manual_review ? "manual_review" as const : "queued" as const,
    };
    return [planned];
  });
}

type DbError = { code?: string; message?: string };
type DbResult<T = unknown> = { data: T | null; error: DbError | null; count?: number | null };
type QueryLike = PromiseLike<DbResult<unknown>>;
type LearningQueueDbClient = {
  from(table: string): { insert(value: unknown): QueryLike };
  rpc?(name: string, args?: Record<string, unknown>): QueryLike;
};

export type QueueLearningSummary = {
  queued: number;
  manual_review: number;
  rejected: number;
  skill_ids: LearningSkillId[];
  error_code?: string;
};

export async function queueLearningSkillTriggers(
  client: LearningQueueDbClient,
  event: LearningSkillTrigger,
  input: LearningSkillInput,
  config: LearningRuntimeConfig = resolveLearningRuntimeConfig(readEdgeRuntimeEnv, learningActorId(input)),
): Promise<QueueLearningSummary> {
  const planned = planLearningSkillTriggers(event, input, config);
  const summary = summarizePlanned(planned);
  if (planned.length === 0) return summary;

  const rows = planned.map((item) => ({
    skill_id: item.skill.id,
    job_id: nullableString(input.job_id),
    rule_id: null,
    candidate_id: null,
    previous_state: null,
    next_state: queueStateToLifecycle(item.queue_state),
    transition_reason: `queued from ${event}`,
    actor_id: nullableString(input.actor_id) ?? nullableString(input.customer_id) ??
      nullableString(input.worker_id),
    actor_role: nullableString(input.actor_role),
    safe_metadata: {
      event_type: event,
      target: item.candidate.target,
      prompt_version: item.candidate.prompt_version,
      requires_manual_review: item.candidate.requires_manual_review,
      payload: item.candidate.payload,
      rejected_reason: item.queue_state === "rejected" ? item.audit?.reason ?? null : null,
    },
  }));

  const result = await Promise.resolve(client.from("kael_rule_lifecycle_log").insert(rows));
  if (result.error) {
    return { ...summary, error_code: result.error.code ?? "DB_ERROR" };
  }
  await notifyManualReviewIfConfigured(client, planned, input);
  return summary;
}

function summarizePlanned(planned: PlannedLearningTrigger[]): QueueLearningSummary {
  return {
    queued: planned.filter((item) => item.queue_state === "queued").length,
    manual_review: planned.filter((item) => item.queue_state === "manual_review").length,
    rejected: planned.filter((item) => item.queue_state === "rejected").length,
    skill_ids: planned.map((item) => item.skill.id),
  };
}

function queueStateToLifecycle(state: PlannedLearningTrigger["queue_state"]): LearningLifecycleState {
  if (state === "manual_review") return "manual_review";
  if (state === "rejected") return "rejected";
  return "candidate";
}

async function notifyManualReviewIfConfigured(
  client: LearningQueueDbClient,
  planned: PlannedLearningTrigger[],
  input: LearningSkillInput,
) {
  if (!client.rpc) return;
  const adminUserId = nullableString(input.admin_user_id);
  if (!adminUserId) return;
  const manualSkillIds = planned
    .filter((item) => item.queue_state === "manual_review")
    .map((item) => item.skill.id);
  if (manualSkillIds.length === 0) return;
  await Promise.resolve(client.rpc("insert_notification_atomic", {
    p_user_id: adminUserId,
    p_job_id: nullableString(input.job_id),
    p_event_type: "kael_learning_manual_review",
    p_title: "Kael learning review",
    p_body: "A Kael learning candidate needs admin review.",
    p_safe_metadata: { skill_ids: manualSkillIds },
  })).catch(() => undefined);
}

function readEdgeRuntimeEnv(name: string): string | undefined {
  const denoGet = (globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  }).Deno?.env?.get;
  return denoGet?.(name);
}

function learningActorId(input: LearningSkillInput): string {
  return nullableString(input.actor_id) ?? nullableString(input.customer_id) ??
    nullableString(input.worker_id) ?? nullableString(input.job_id) ?? "system";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
