import { z } from "zod";
import type { EdgeAiSecrets, AIRequest } from "./types.ts";
import {
  callStructuredAI,
  type StructuredAIInvoker,
  type StructuredValidationIssue,
} from "./structured-call.ts";
import { circuitAwareProviderCandidatesForPurpose, type ProviderChoice } from "./routing.ts";
import { maxTokensForPurpose } from "./routing.config.ts";
import { buildKaelSystemPrompt } from "./system-prompt.ts";
import {
  evaluateKaelPermissionGate,
  hasKaelForbiddenTopicBoundarySignal,
} from "./permission-gate.ts";
import { guardOutput } from "./output-gateway.ts";
import { scrubSensitiveForLLM } from "./utils.ts";
import type { KaelPromptLanguage } from "./system-prompt.ts";
import { detectForbiddenAiDecisionText } from "./ai-boundary-contract.ts";
import {
  buildNoProviderTrace,
  buildProviderAttemptTrace,
  promptVersionForPurpose,
  schemaVersionForPurpose,
  type KaelSafeTraceEvent,
} from "./trace.ts";

export type WorkerAssistJobContext = {
  readonly id: string;
  readonly status?: string | null;
  readonly service_type?: string | null;
  readonly description?: string | null;
  readonly address_district?: string | null;
  readonly kael_problem_identified?: string | null;
  readonly kael_complexity?: string | null;
  readonly kael_worker_brief_core?: Record<string, unknown> | null;
  readonly kael_worker_brief_guidance?: Record<string, unknown> | null;
};

export type WorkerAssistInput = {
  readonly job: WorkerAssistJobContext;
  readonly question: string;
  readonly language?: KaelPromptLanguage;
  readonly mediaRefs?: readonly string[];
  // a short, server-side, schema-validated summary of what Kael
  // actually saw in the worker's photos (problem + severity + complexity). The
  // handler runs vision and passes this; worker-assist itself never calls a
  // provider for images. Null when there were no photos or vision did not
  // succeed (no fabricated findings).
  readonly visionSummary?: string | null;
  readonly previousTurns?: readonly WorkerAssistPreviousTurn[];
  readonly secrets: EdgeAiSecrets;
  readonly callAI?: StructuredAIInvoker;
};

export type WorkerAssistPreviousTurn = {
  readonly role: "worker" | "kael" | "system";
  readonly text: string | null;
};

export type WorkerAssistAnswer = {
  readonly schema_version: "worker_assist_answer.v1";
  readonly text: string;
  readonly safety_notes: readonly string[];
  readonly redirect_scope_change: boolean;
  readonly fallback_used: boolean;
  readonly provider?: string;
  readonly model?: string;
  readonly latency_ms?: number;
  readonly cost_usd?: number;
  readonly guardrail_reason?: string;
  readonly guardrail_source?: "boundary_guard" | "self_check" | "semantic_self_check";
  readonly provider_attempts?: readonly WorkerAssistProviderAttempt[];
  readonly trace?: readonly KaelSafeTraceEvent[];
};

export type WorkerAssistProviderAttempt = {
  readonly provider: string;
  readonly model: string;
  readonly role: "primary" | "fallback";
  readonly timeout_ms: number;
  readonly prompt_version: string;
  readonly schema_version: string;
  readonly result: "success" | "error" | "schema_invalid";
  readonly code?: string;
  readonly latency_ms?: number;
  readonly cost_usd?: number;
};

const workerAssistResponseSchema = z.preprocess(normalizeWorkerAssistPayload, z.object({
  text: z.string().trim().min(1).max(700),
  safety_notes: z.array(z.string().trim().min(1).max(180)).max(3).default([]),
  redirect_scope_change: z.boolean().default(false),
}).strip());

const FALLBACK_TEXT =
  "Kael ch\u1ec9 c\u00f3 th\u1ec3 h\u01b0\u1edbng d\u1eabn theo vi\u1ec7c \u0111\u00e3 nh\u1eadn trong app. H\u00e3y ki\u1ec3m tra ph\u1ea1m vi, ghi b\u1eb1ng ch\u1ee9ng th\u1ef1c t\u1ebf, v\u00e0 g\u1eedi scope-change n\u1ebfu c\u00f3 ph\u1ea7n ph\u00e1t sinh.";
const FALLBACK_TEXT_EN =
  "Kael can only guide you inside the accepted job in the app. Check the agreed scope, save real evidence, and send a scope-change request if new work appears.";
const DEFAULT_SAFETY_NOTES = [
  "Kh\u00f4ng t\u1ef1 b\u00e1o gi\u00e1 m\u1edbi ngo\u00e0i lu\u1ed3ng Kael trong app.",
  "Kh\u00f4ng chuy\u1ec3n tr\u1ea1ng th\u00e1i thay cho b\u1eb1ng ch\u1ee9ng th\u1ef1c t\u1ebf.",
] as const;
const DEFAULT_SAFETY_NOTES_EN = [
  "Do not quote a new price outside the Kael flow in the app.",
  "Do not change lifecycle status without real evidence.",
] as const;

export async function runWorkerAssist(
  input: WorkerAssistInput,
): Promise<WorkerAssistAnswer> {
  const language = input.language ?? "vi";
  const topic = topicForQuestion(input.question);
  const permission = evaluateKaelPermissionGate({
    purpose: "worker_assist",
    actor: "worker",
    jobRelation: "own_worker_job",
    action: "generate_advisory",
    topic,
    intentConfidence: 1,
    topicSource: "deterministic_rule",
    boundarySignal: hasKaelForbiddenTopicBoundarySignal(topic, input.question),
    jobId: input.job.id,
  });
  if (!permission.allowed) {
    return fallbackAnswer(permission.reasonCode, shouldRedirectToScopeChange(input.question), language);
  }

  const routes = circuitAwareProviderCandidatesForPurpose("worker_assist");
  let lastProviderFailure = "AI_UNAVAILABLE";
  const providerAttempts: WorkerAssistProviderAttempt[] = [];
  const trace: KaelSafeTraceEvent[] = [];

  if (routes.length === 0) {
    trace.push(buildNoProviderTrace({
      workflowPhase: "in_progress",
      actorRole: "worker",
      action: "worker.ask_kael",
      policyId: "kael.path.worker_assist_own_job.v1",
      purpose: "worker_assist",
      reasonCode: "NO_PROVIDER_AVAILABLE",
      safeMetadata: {
        circuit_open: true,
      },
    }));
    return fallbackAnswer(
      "NO_PROVIDER_AVAILABLE",
      shouldRedirectToScopeChange(input.question),
      language,
      providerAttempts,
      trace,
    );
  }

  for (const route of routes) {
    const request = buildWorkerAssistRequest(input, route, language);
    const result = await callStructuredAI(
      request,
      workerAssistResponseSchema,
      input.secrets,
      undefined,
      input.callAI,
    );
    if (!result.success) {
      const schemaResponse = result.code === "SCHEMA_INVALID"
        ? result.response
        : undefined;
      if (schemaResponse) {
        lastProviderFailure = "AI_RESPONSE_INVALID";
        const attempt = providerAttempt(route, "schema_invalid", {
          latencyMs: schemaResponse.latencyMs,
          code: describeWorkerAssistShape(
            result.parsedValue,
            result.validationIssues ?? [],
          ),
          costUsd: schemaResponse.usage.costUsd,
        });
        providerAttempts.push(attempt);
        trace.push(traceForAttempt(attempt, "worker.ask_kael", true));
        continue;
      }
      lastProviderFailure = `AI_${result.code}`;
      const attempt = providerAttempt(route, "error", {
        code: result.code,
      });
      providerAttempts.push(attempt);
      trace.push(traceForAttempt(attempt, "worker.ask_kael", true));
      continue;
    }

    const attempt = providerAttempt(route, "success", {
      latencyMs: result.latencyMs,
      costUsd: result.usage.costUsd,
    });
    providerAttempts.push(attempt);
    trace.push(traceForAttempt(attempt, "worker.ask_kael", false));

    const guarded = guardWorkerAssistText(result.data.text);
    if (!guarded.allowed) {
      return fallbackAnswer(
        guarded.reason ?? "WORKER_ASSIST_GUARD",
        true,
        language,
        providerAttempts,
        trace,
        "boundary_guard",
      );
    }

    const checked = guardOutput({
      text: guarded.text,
      actor: "worker",
      language,
      surface: "worker_assist",
      fallbackText: fallbackTextForLanguage(language),
    });
    if (checked.used_fallback || !checked.allowed) {
      return fallbackAnswer(
        checked.reason ?? "SELF_CHECK",
        result.data.redirect_scope_change,
        language,
        providerAttempts,
        trace,
        checked.trip?.source,
      );
    }

    return {
      schema_version: "worker_assist_answer.v1",
      text: checked.text,
      safety_notes: normalizeSafetyNotes(result.data.safety_notes, language),
      redirect_scope_change:
        result.data.redirect_scope_change || shouldRedirectToScopeChange(input.question),
      fallback_used: false,
      provider: route.provider,
      model: route.model,
      latency_ms: result.latencyMs,
      cost_usd: result.usage.costUsd,
      provider_attempts: providerAttempts,
      trace,
    };
  }

  return fallbackAnswer(
    lastProviderFailure,
    shouldRedirectToScopeChange(input.question),
    language,
    providerAttempts,
    trace,
  );
}

function buildWorkerAssistRequest(
  input: WorkerAssistInput,
  route: ProviderChoice,
  language: KaelPromptLanguage,
): AIRequest {
  return {
    purpose: "worker_assist",
    provider: route.provider,
    model: route.model,
    maxTokens: maxTokensForPurpose("worker_assist", 220),
    temperature: 0.2,
    timeoutMs: route.latencyBudgetMs,
    maxRetries: 1,
    messages: [
      {
        role: "system",
        content: buildKaelSystemPrompt({
          purpose: "worker_assist",
          actor: "worker",
          language,
          permissionSummary:
            "Worker can read only the accepted job context and receive advisory guidance. Worker cannot set price, approve/reject scope change, change lifecycle status, or move support off app.",
          contextSummary: buildWorkerAssistContext(input),
        }),
      },
      {
        role: "user",
        content: [
          "Return JSON only with text, safety_notes, redirect_scope_change.",
          "Do not include VND amounts, exact prices, direct contact, or lifecycle status updates.",
          `Worker question: ${scrubSensitiveForLLM(input.question).slice(0, 1200)}`,
        ].join("\n"),
      },
    ],
  };
}

export function guardWorkerAssistText(text: string): {
  readonly allowed: boolean;
  readonly text: string;
  readonly reason?: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { allowed: false, text: trimmed, reason: "EMPTY" };
  if (!detectForbiddenAiDecisionText(trimmed).allowed) {
    return { allowed: false, text: trimmed, reason: "MONEY_OR_STATUS_MUTATION" };
  }
  return { allowed: true, text: trimmed };
}

function fallbackAnswer(
  reason: string,
  redirectScopeChange: boolean,
  language: KaelPromptLanguage,
  providerAttempts: readonly WorkerAssistProviderAttempt[] = [],
  trace: readonly KaelSafeTraceEvent[] = [],
  guardrailSource?: WorkerAssistAnswer["guardrail_source"],
): WorkerAssistAnswer {
  return {
    schema_version: "worker_assist_answer.v1",
    text: fallbackTextForLanguage(language),
    safety_notes: safetyNotesForLanguage(language),
    redirect_scope_change: redirectScopeChange,
    fallback_used: true,
    guardrail_reason: reason,
    ...(guardrailSource ? { guardrail_source: guardrailSource } : {}),
    provider_attempts: providerAttempts,
    trace,
  };
}

function providerAttempt(
  route: ProviderChoice,
  result: WorkerAssistProviderAttempt["result"],
  options: { code?: string; latencyMs?: number; costUsd?: number } = {},
): WorkerAssistProviderAttempt {
  return {
    provider: route.provider,
    model: route.model,
    role: route.role,
    timeout_ms: route.latencyBudgetMs,
    prompt_version: promptVersionForPurpose("worker_assist"),
    schema_version: schemaVersionForPurpose("worker_assist"),
    result,
    ...(options.code ? { code: options.code } : {}),
    ...(options.latencyMs !== undefined ? { latency_ms: options.latencyMs } : {}),
    ...(options.costUsd !== undefined ? { cost_usd: options.costUsd } : {}),
  };
}

function traceForAttempt(
  attempt: WorkerAssistProviderAttempt,
  action: "worker.ask_kael",
  fallbackUsed: boolean,
): KaelSafeTraceEvent {
  return buildProviderAttemptTrace({
    workflowPhase: "in_progress",
    actorRole: "worker",
    action,
    policyId: "kael.path.worker_assist_own_job.v1",
    purpose: "worker_assist",
    provider: attempt.provider as "anthropic" | "perplexity" | "deepseek",
    model: attempt.model,
    latencyMs: attempt.latency_ms,
    costUsd: attempt.cost_usd,
    result: attempt.result,
    code: attempt.code,
    fallbackUsed,
  });
}

function normalizeWorkerAssistPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const text = firstString(
    record.text,
    record.answer,
    record.message,
    record.guidance,
    record.advisory,
    record.response,
    record.content,
  );
  const safetyNotes = normalizeProviderSafetyNotes(record);
  const redirectScopeChange = firstBoolean(
    record.redirect_scope_change,
    record.redirectScopeChange,
    record.scope_change_required,
    record.scopeChangeRequired,
    record.requires_scope_change,
    record.requiresScopeChange,
  );
  return {
    ...record,
    ...(text ? { text } : {}),
    safety_notes: safetyNotes ?? [],
    redirect_scope_change: redirectScopeChange ?? false,
  };
}

function normalizeProviderSafetyNotes(record: Record<string, unknown>) {
  for (const value of [record.safety_notes, record.safetyNotes]) {
    if (Array.isArray(value)) {
      const notes = value
        .map((item) =>
          typeof item === "string"
            ? item
            : item && typeof item === "object"
            ? firstString(
              (item as Record<string, unknown>).text,
              (item as Record<string, unknown>).note,
              (item as Record<string, unknown>).message,
            )
            : undefined
        )
        .filter((item): item is string => Boolean(item && item.trim()))
        .slice(0, 3);
      return notes.length > 0 ? notes : undefined;
    }
  }
  const note = firstString(record.safety_note, record.safetyNote);
  return note ? [note] : undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "1"].includes(normalized)) return true;
      if (["false", "no", "0"].includes(normalized)) return false;
    }
  }
  return undefined;
}

function describeWorkerAssistShape(
  value: unknown,
  issues: readonly StructuredValidationIssue[],
) {
  const shape = !value || typeof value !== "object"
    ? `type=${typeof value}`
    : Array.isArray(value)
    ? `array:${value.length}`
    : `keys=${Object.keys(value as Record<string, unknown>).slice(0, 8).join("|") || "none"}`;
  const issueSummary = issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "root"}:${issue.code}`)
    .join("|");
  return `schema:${shape}${issueSummary ? `:${issueSummary}` : ""}`.slice(0, 180);
}

function normalizeSafetyNotes(notes: readonly string[], language: KaelPromptLanguage) {
  const normalized = notes
    .map((note) => guardWorkerAssistText(note).text)
    .filter((note) => note.length > 0 && detectForbiddenAiDecisionText(note).allowed)
    .slice(0, 3);
  return normalized.length > 0 ? normalized : safetyNotesForLanguage(language);
}

function fallbackTextForLanguage(language: KaelPromptLanguage) {
  return language === "en" ? FALLBACK_TEXT_EN : FALLBACK_TEXT;
}

function safetyNotesForLanguage(language: KaelPromptLanguage) {
  return language === "en" ? DEFAULT_SAFETY_NOTES_EN : DEFAULT_SAFETY_NOTES;
}

function topicForQuestion(question: string) {
  const lower = question.toLowerCase();
  if (/scope|ph[a\u1ea1]m vi|phat sinh|ph[a\u00e1]t sinh|b\u1ed5 sung/i.test(lower)) {
    return "scope_change" as const;
  }
  if (/an toan|safety|\u0111i\u1ec7n|dien|r\u00f2|ro|leak|n\u01b0\u1edbc|nuoc/i.test(lower)) {
    return "worker_safety_advisory" as const;
  }
  if (/app|n[u\u00fa]t|b[a\u1ea5]m|button|khong thay|kh\u00f4ng th\u1ea5y/i.test(lower)) {
    return "app_usage_help" as const;
  }
  return "worker_brief" as const;
}

function shouldRedirectToScopeChange(question: string) {
  return /scope|ph[a\u1ea1]m vi|phat sinh|ph[a\u00e1]t sinh|b\u1ed5 sung|th[e\u00ea]m vi[e\u1ec7]c|them viec|gi[a\u00e1]|price/i
    .test(question);
}

function buildWorkerAssistContext(input: WorkerAssistInput) {
  const job = input.job;
  const brief = JSON.stringify({
    core: job.kael_worker_brief_core ?? null,
    guidance: job.kael_worker_brief_guidance ?? null,
  }).slice(0, 1600);
  const turns = (input.previousTurns ?? []).slice(-6).map((turn) => ({
    role: turn.role,
    text: turn.text ? scrubSensitiveForLLM(turn.text).slice(0, 240) : null,
  }));
  return JSON.stringify({
    job_id: job.id,
    status: job.status ?? null,
    service_type: job.service_type ?? null,
    district: job.address_district ?? null,
    problem: job.kael_problem_identified ?? job.description ?? null,
    complexity: job.kael_complexity ?? null,
    worker_brief: brief,
    media_ref_count: input.mediaRefs?.length ?? 0,
    vision_findings: input.visionSummary ?? null,
    recent_turns: turns,
  });
}
