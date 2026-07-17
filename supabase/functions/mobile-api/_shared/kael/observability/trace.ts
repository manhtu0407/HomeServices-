import { z } from "zod";
import { KAEL_PURPOSES, type AIProvider, type KaelPurpose, type PipelineInput, type PipelineStageLog } from "../types.ts";
import type { KaelActorRole } from "../guards/permission-gate.ts";

export const KAEL_TRACE_SCHEMA_VERSION = "kael_trace.v1";

export const KAEL_PROMPT_VERSIONS: Record<KaelPurpose, string> = Object.freeze({
  intent_classification: "intent-classification.2026-06-04.v1",
  vision_analysis: "vision-analysis.2026-07-10.v2",
  clarification: "clarification.2026-06-04.v1",
  problem_synthesis: "problem-synthesis.2026-05-25.v1",
  market_lookup: "market-lookup.2026-06-27.v1",
  price_synthesis: "price-synthesis.2026-05-26.v2",
  advisory_generation: "advisory-generation.2026-06-04.v1",
  worker_brief: "worker-brief.2026-05-25.v1",
  scope_change: "scope-change-estimate.2026-05-23.v1",
  job_incident: "job-incident.2026-07-12.v1",
  post_job_learning: "post-job-learning.2026-05-25.v1",
  educational_response: "educational-response.2026-06-04.v1",
  worker_assist: "worker-assist.2026-06-04.v1",
});

export const KAEL_OUTPUT_SCHEMA_VERSIONS: Record<KaelPurpose, string> = Object.freeze({
  intent_classification: "intent_result.v1",
  vision_analysis: "vision_result.v1",
  clarification: "intent_result.v1",
  problem_synthesis: "baseline_candidates.v1",
  market_lookup: "market_price_result.v1",
  price_synthesis: "estimate_card.v3",
  advisory_generation: "kael_advisory.v1",
  worker_brief: "worker_brief.v1",
  scope_change: "scope_change_kael_review.v1",
  job_incident: "job_incident_answer.v1",
  post_job_learning: "kael_learning_candidate.v1",
  educational_response: "educational_response.v1",
  worker_assist: "worker_assist_answer.v1",
});

const aiProviderSchema = z.enum(["anthropic", "perplexity", "deepseek"]);
const kaelPurposeSchema = z.enum(KAEL_PURPOSES);

export const kaelTraceValidationSchema = z.object({
  status: z.enum(["pass", "fail", "skipped"]),
  reason_code: z.string().min(1).max(120).nullable().optional(),
}).strict();

export const kaelTraceFallbackSchema = z.object({
  used: z.boolean(),
  reason_code: z.string().min(1).max(120).nullable().optional(),
}).strict();

export const kaelSafeTraceEventSchema = z.object({
  trace_id: z.string().min(16).max(120),
  trace_schema_version: z.literal(KAEL_TRACE_SCHEMA_VERSION),
  workflow_phase: z.string().min(1).max(80),
  actor_role: z.enum(["customer", "worker", "admin", "system"]),
  action: z.string().min(1).max(80),
  policy_id: z.string().min(1).max(140),
  purpose: kaelPurposeSchema,
  provider: aiProviderSchema.nullable(),
  model: z.string().min(1).max(120).nullable(),
  latency_ms: z.number().nonnegative().nullable(),
  cost_usd: z.number().nonnegative().nullable(),
  prompt_version: z.string().min(3).max(120),
  schema_version: z.string().min(3).max(120),
  validation: kaelTraceValidationSchema,
  fallback: kaelTraceFallbackSchema,
  confidence: z.number().min(0).max(1).nullable(),
  safe_metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type KaelSafeTraceEvent = z.infer<typeof kaelSafeTraceEventSchema>;

type TraceInput = Omit<
  KaelSafeTraceEvent,
  "trace_id" | "trace_schema_version" | "prompt_version" | "schema_version" | "safe_metadata"
> & {
  readonly trace_id?: string;
  readonly prompt_version?: string;
  readonly schema_version?: string;
  readonly safe_metadata?: Record<string, unknown>;
};

const FORBIDDEN_TRACE_KEY =
  /(?:raw|text|content|message|prompt|description|address|phone|cccd|cmnd|password|secret|token|api[_-]?key|authorization|bearer)/i;
const FORBIDDEN_TRACE_VALUE = [
  /\b(?:0|\+?84)[1-9](?:[\s.-]?\d){8,9}\b/,
  /\b\d{9,12}\b/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b(?:sk|pplx|sbp|eyJ)[A-Za-z0-9._-]{16,}\b/,
  /\bSUPABASE_(?:SERVICE_ROLE|SECRET)_KEY\b/i,
];

export function promptVersionForPurpose(purpose: KaelPurpose): string {
  return KAEL_PROMPT_VERSIONS[purpose];
}

export function schemaVersionForPurpose(purpose: KaelPurpose): string {
  return KAEL_OUTPUT_SCHEMA_VERSIONS[purpose];
}

export function buildKaelTraceEvent(input: TraceInput): KaelSafeTraceEvent {
  const event = kaelSafeTraceEventSchema.parse({
    trace_id: input.trace_id ?? `kael-trace:${crypto.randomUUID()}`,
    trace_schema_version: KAEL_TRACE_SCHEMA_VERSION,
    prompt_version: input.prompt_version ?? promptVersionForPurpose(input.purpose),
    schema_version: input.schema_version ?? schemaVersionForPurpose(input.purpose),
    safe_metadata: input.safe_metadata ?? {},
    ...input,
  });
  assertSafeTraceValue(event.safe_metadata, ["safe_metadata"]);
  return event;
}

export function buildProviderAttemptTrace(input: {
  readonly workflowPhase: string;
  readonly actorRole: KaelActorRole;
  readonly action: string;
  readonly policyId: string;
  readonly purpose: KaelPurpose;
  readonly provider: AIProvider;
  readonly model: string;
  readonly latencyMs?: number;
  readonly costUsd?: number;
  readonly result: "success" | "error" | "schema_invalid";
  readonly code?: string;
  readonly fallbackUsed: boolean;
  readonly confidence?: number | null;
  readonly promptVersion?: string;
  readonly safeMetadata?: Record<string, unknown>;
}): KaelSafeTraceEvent {
  return buildKaelTraceEvent({
    workflow_phase: input.workflowPhase,
    actor_role: input.actorRole,
    action: input.action,
    policy_id: input.policyId,
    purpose: input.purpose,
    provider: input.provider,
    model: input.model,
    latency_ms: input.latencyMs ?? null,
    cost_usd: input.costUsd ?? null,
    validation: {
      status: input.result === "success" ? "pass" : "fail",
      reason_code: input.code ?? null,
    },
    fallback: {
      used: input.fallbackUsed,
      reason_code: input.fallbackUsed ? input.code ?? "FALLBACK" : null,
    },
    confidence: input.confidence ?? null,
    ...(input.promptVersion ? { prompt_version: input.promptVersion } : {}),
    safe_metadata: input.safeMetadata ?? {},
  });
}

export function buildNoProviderTrace(input: {
  readonly workflowPhase: string;
  readonly actorRole: KaelActorRole;
  readonly action: string;
  readonly policyId: string;
  readonly purpose: KaelPurpose;
  readonly reasonCode: string;
  readonly safeMetadata?: Record<string, unknown>;
}): KaelSafeTraceEvent {
  return buildKaelTraceEvent({
    workflow_phase: input.workflowPhase,
    actor_role: input.actorRole,
    action: input.action,
    policy_id: input.policyId,
    purpose: input.purpose,
    provider: null,
    model: null,
    latency_ms: null,
    cost_usd: null,
    validation: {
      status: "skipped",
      reason_code: input.reasonCode,
    },
    fallback: {
      used: true,
      reason_code: input.reasonCode,
    },
    confidence: null,
    safe_metadata: input.safeMetadata ?? {},
  });
}

export function pushPipelineStageLog(
  stageLogs: PipelineStageLog[],
  input: PipelineInput,
  log: PipelineStageLog,
  options: { readonly promptVersion?: string } = {},
): void {
  const workflowPhase = input.intakeDiagnosisEnabled ? "offer_ready" : "intake";
  const action = input.intakeDiagnosisEnabled
    ? "customer.open_case_chat"
    : "customer.submit_intake";
  const policyId = input.intakeDiagnosisEnabled
    ? "kael.path.customer_case_chat_revision.v1"
    : "kael.path.customer_intake_to_estimate.v1";
  const purpose = purposeForPipelineStage(log.stage);
  const safeMetadata = {
    stage: log.stage,
    ...(log.cacheStatus ? { cache_status: log.cacheStatus } : {}),
  };
  const trace = log.provider && log.model
    ? buildProviderAttemptTrace({
      workflowPhase,
      actorRole: "customer",
      action,
      policyId,
      purpose,
      provider: log.provider,
      model: log.model,
      latencyMs: log.latencyMs,
      costUsd: log.costUsd,
      result: log.success ? "success" : "error",
      code: log.failureReason,
      fallbackUsed: log.fallbackUsed,
      promptVersion: options.promptVersion,
      safeMetadata,
    })
    : buildKaelTraceEvent({
      workflow_phase: workflowPhase,
      actor_role: "customer",
      action,
      policy_id: policyId,
      purpose,
      provider: null,
      model: null,
      latency_ms: log.latencyMs,
      cost_usd: log.costUsd ?? null,
      validation: {
        status: log.success ? "pass" : "fail",
        reason_code: log.failureReason ?? null,
      },
      fallback: {
        used: log.fallbackUsed,
        reason_code: log.fallbackUsed ? log.failureReason ?? "FALLBACK" : null,
      },
      confidence: null,
      ...(options.promptVersion ? { prompt_version: options.promptVersion } : {}),
      safe_metadata: safeMetadata,
    });
  stageLogs.push({ ...log, trace });
}

function purposeForPipelineStage(stage: PipelineStageLog["stage"]) {
  switch (stage) {
    case "intent":
      return "intent_classification";
    case "vision":
      return "vision_analysis";
    case "baseline":
      return "problem_synthesis";
    case "market":
      return "market_lookup";
    case "synthesis":
      return "price_synthesis";
  }
}

function assertSafeTraceValue(value: unknown, path: readonly string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeTraceValue(item, [...path, String(index)]));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_TRACE_KEY.test(key)) {
        throw new Error(`TRACE_UNSAFE_KEY:${[...path, key].join(".")}`);
      }
      assertSafeTraceValue(nested, [...path, key]);
    }
    return;
  }
  if (typeof value === "string" && FORBIDDEN_TRACE_VALUE.some((pattern) => pattern.test(value))) {
    throw new Error(`TRACE_UNSAFE_VALUE:${path.join(".")}`);
  }
}
