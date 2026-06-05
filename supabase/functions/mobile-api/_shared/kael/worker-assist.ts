import { z } from "zod";
import type { EdgeAiSecrets, AIRequest, AIResponse, AIError } from "./types.ts";
import { callAI as defaultCallAI } from "./provider-client.ts";
import { chooseProvider } from "./routing.ts";
import { buildKaelSystemPrompt } from "./system-prompt.ts";
import { evaluateKaelPermissionGate } from "./permission-gate.ts";
import { runKaelSelfCheckPipeline } from "./self-check.ts";
import { scrubSensitiveForLLM } from "./utils.ts";
import type { KaelPromptLanguage } from "./system-prompt.ts";
import { detectForbiddenAiDecisionText } from "./ai-boundary-contract.ts";

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
  readonly previousTurns?: readonly WorkerAssistPreviousTurn[];
  readonly secrets: EdgeAiSecrets;
  readonly callAI?: (request: AIRequest, secrets: EdgeAiSecrets) => Promise<AIResponse | AIError>;
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
};

const workerAssistResponseSchema = z.object({
  text: z.string().trim().min(1).max(700),
  safety_notes: z.array(z.string().trim().min(1).max(180)).max(3).default([]),
  redirect_scope_change: z.boolean().default(false),
}).strict();

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
  const permission = evaluateKaelPermissionGate({
    purpose: "worker_assist",
    actor: "worker",
    jobRelation: "own_worker_job",
    action: "generate_advisory",
    topic: topicForQuestion(input.question),
    jobId: input.job.id,
  });
  if (!permission.allowed) {
    return fallbackAnswer(permission.reasonCode, shouldRedirectToScopeChange(input.question), language);
  }

  const route = chooseProvider("worker_assist");
  const request: AIRequest = {
    purpose: "worker_assist",
    provider: route.provider,
    model: route.model,
    maxTokens: route.latencyBudgetMs <= 2_000 ? 220 : 320,
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

  const result = await (input.callAI ?? defaultCallAI)(request, input.secrets);
  if (!result.success) {
    return fallbackAnswer(`AI_${result.code}`, shouldRedirectToScopeChange(input.question), language);
  }

  const parsed = workerAssistResponseSchema.safeParse(parseJsonObject(result.content));
  if (!parsed.success) {
    return fallbackAnswer("AI_RESPONSE_INVALID", shouldRedirectToScopeChange(input.question), language);
  }

  const guarded = guardWorkerAssistText(parsed.data.text);
  if (!guarded.allowed) {
    return fallbackAnswer(guarded.reason ?? "WORKER_ASSIST_GUARD", true, language);
  }

  const checked = runKaelSelfCheckPipeline({
    text: guarded.text,
    actor: "worker",
    language,
    semanticGuardEnabled: true,
    fallbackText: fallbackTextForLanguage(language),
  });
  if (checked.used_fallback || !checked.allowed) {
    return fallbackAnswer(checked.reason ?? "SELF_CHECK", parsed.data.redirect_scope_change, language);
  }

  return {
    schema_version: "worker_assist_answer.v1",
    text: checked.text,
    safety_notes: normalizeSafetyNotes(parsed.data.safety_notes, language),
    redirect_scope_change:
      parsed.data.redirect_scope_change || shouldRedirectToScopeChange(input.question),
    fallback_used: false,
    provider: route.provider,
    model: route.model,
    latency_ms: result.latencyMs,
    cost_usd: result.usage.costUsd,
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
): WorkerAssistAnswer {
  return {
    schema_version: "worker_assist_answer.v1",
    text: fallbackTextForLanguage(language),
    safety_notes: safetyNotesForLanguage(language),
    redirect_scope_change: redirectScopeChange,
    fallback_used: true,
    guardrail_reason: reason,
  };
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

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
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
    recent_turns: turns,
  });
}
