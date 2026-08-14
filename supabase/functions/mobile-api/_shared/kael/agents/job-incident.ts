import { z } from "zod";
import type { AIRequest, EdgeAiSecrets } from "../contracts/types.ts";
import { callStructuredAI, type StructuredAIInvoker } from "../kael-providers/structured-call.ts";
import type { KaelSpendGate } from "../kael-guardrails/spend-gate.ts";
import {
  circuitAwareProviderCandidatesForPurpose,
  shouldSkipProviderSiblingModels,
  type ProviderChoice,
} from "../kael-providers/routing.ts";
import { maxTokensForPurpose } from "../kael-providers/routing.config.ts";
import { buildKaelSystemPrompt, type KaelPromptLanguage } from "../prompts/system-prompt.ts";
import { evaluateKaelPermissionGate } from "../kael-guardrails/permission-gate.ts";
import { guardOutput } from "../kael-guardrails/output-gateway.ts";
import { scrubSensitiveForLLM } from "../pipeline/utils.ts";

export type JobIncidentAssistantInput = {
  readonly job: {
    readonly id: string;
    readonly service_type?: string | null;
    readonly description?: string | null;
    readonly kael_problem_identified?: string | null;
  };
  readonly incident: {
    readonly description: string;
    readonly reason: string;
    readonly evidence_count: number;
  };
  readonly event: {
    readonly actor: "customer" | "worker";
    readonly text: string;
  };
  readonly history?: readonly {
    readonly source_kind: "incident_opened" | "incident_updated" | "job_chat_message";
    readonly actor_role: "customer" | "worker";
    readonly content: string;
    readonly evidence_count: number;
  }[];
  readonly language?: KaelPromptLanguage;
  readonly secrets: EdgeAiSecrets;
  readonly spendGate: KaelSpendGate;
  readonly callAI?: StructuredAIInvoker;
};

export type JobIncidentAssistantAnswer = {
  readonly schema_version: "job_incident_answer.v1";
  readonly summary: string;
  readonly next_actor: "customer" | "worker";
  readonly question: string;
  readonly evidence_status: "needs_more" | "ready";
  readonly evidence_gaps: readonly string[];
  readonly fallback_used: boolean;
  readonly provider: string | null;
  readonly model: string | null;
  readonly latency_ms?: number;
  readonly cost_usd?: number;
};

const jobIncidentAnswerSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  next_actor: z.enum(["customer", "worker"]),
  question: z.string().trim().min(1).max(420),
  evidence_status: z.enum(["needs_more", "ready"]),
  evidence_gaps: z.array(z.string().trim().min(1).max(180)).max(3).default([]),
}).strict();

const FALLBACKS: Record<KaelPromptLanguage, Pick<JobIncidentAssistantAnswer, "summary" | "next_actor" | "question" | "evidence_status" | "evidence_gaps">> = {
  vi: {
    summary: "Kael đã mở hồ sơ kiểm tra riêng cho thay đổi này.",
    next_actor: "worker",
    question: "Thợ vui lòng nêu rõ phần việc phát sinh và gửi bằng chứng thực tế trước khi tạo đề xuất.",
    evidence_status: "needs_more",
    evidence_gaps: ["Cần thêm mô tả hoặc bằng chứng có thể kiểm tra."],
  },
  en: {
    summary: "Kael opened a separate review case for this change.",
    next_actor: "worker",
    question: "Please state the additional work and provide verifiable evidence before a proposal is created.",
    evidence_status: "needs_more",
    evidence_gaps: ["More verifiable description or evidence is required."],
  },
};

const READY_FALLBACKS: Record<KaelPromptLanguage, Pick<JobIncidentAssistantAnswer, "summary" | "next_actor" | "question" | "evidence_status" | "evidence_gaps">> = {
  vi: {
    summary: "Kael đã đối chiếu phần việc phát sinh, lý do và bằng chứng hiện trường.",
    next_actor: "worker",
    question: "Thợ có thể chủ động yêu cầu Kael tính đề xuất phạm vi và giá để gửi khách xem xét.",
    evidence_status: "ready",
    evidence_gaps: [],
  },
  en: {
    summary: "Kael matched the additional work, its reason, and the field evidence.",
    next_actor: "worker",
    question: "The worker may explicitly ask Kael to compute a scope and price proposal for customer review.",
    evidence_status: "ready",
    evidence_gaps: [],
  },
};

export async function runJobIncidentAssistant(
  input: JobIncidentAssistantInput,
): Promise<JobIncidentAssistantAnswer> {
  const language = input.language ?? "vi";
  const permission = evaluateKaelPermissionGate({
    purpose: "job_incident",
    actor: input.event.actor,
    jobRelation: input.event.actor === "worker" ? "own_worker_job" : "own_customer_job",
    action: "ask_clarification",
    topic: "scope_change",
    intentConfidence: 1,
    topicSource: "deterministic_rule",
    boundarySignal: false,
    jobId: input.job.id,
    language,
  });
  if (!permission.allowed) return fallback(language);

  const blockedProviders = new Set<string>();
  for (const route of circuitAwareProviderCandidatesForPurpose("job_incident")) {
    if (blockedProviders.has(route.provider)) continue;
    const result = await callStructuredAI(
      buildRequest(input, route, language),
      jobIncidentAnswerSchema,
      input.secrets,
      input.spendGate,
      input.callAI,
    );
    if (!result.success) {
      if (shouldSkipProviderSiblingModels(result.code)) {
        blockedProviders.add(route.provider);
      }
      continue;
    }

    const guarded = guardIncidentAnswer(result.data, input.event.actor, language);
    if (!guarded) return fallback(language, input);
    return {
      schema_version: "job_incident_answer.v1",
      ...guarded,
      fallback_used: false,
      provider: route.provider,
      model: route.model,
      latency_ms: result.latencyMs,
      cost_usd: result.usage.costUsd,
    };
  }
  return fallback(language, input);
}

function buildRequest(
  input: JobIncidentAssistantInput,
  route: ProviderChoice,
  language: KaelPromptLanguage,
): AIRequest {
  return {
    purpose: "job_incident",
    provider: route.provider,
    model: route.model,
    maxTokens: maxTokensForPurpose("job_incident", 250),
    temperature: 0.1,
    timeoutMs: route.latencyBudgetMs,
    maxRetries: 0,
    messages: [
      {
        role: "system",
        content: buildKaelSystemPrompt({
          purpose: "job_incident",
          actor: input.event.actor,
          language,
          permissionSummary: "This is a shared incident review for one accepted job. Ask exactly one neutral evidence question. Do not quote a price, approve/reject a scope change, change job status, rewrite normal human chat, expose PII, or claim a customer decision.",
          contextSummary: JSON.stringify({
            job_id: input.job.id,
            service_type: input.job.service_type ?? null,
            original_problem: scrubSensitiveForLLM(input.job.kael_problem_identified ?? input.job.description ?? "").slice(0, 480),
            reported_description: scrubSensitiveForLLM(input.incident.description).slice(0, 900),
            reported_reason: scrubSensitiveForLLM(input.incident.reason).slice(0, 500),
            evidence_count: input.incident.evidence_count,
            recent_allowed_events: (input.history ?? []).slice(-8).map((event) => ({
              source_kind: event.source_kind,
              actor_role: event.actor_role,
              content: scrubSensitiveForLLM(event.content).slice(0, 600),
              evidence_count: event.evidence_count,
            })),
          }),
        }),
      },
      {
        role: "user",
        content: [
          "Return JSON only with summary, next_actor, question, evidence_status, evidence_gaps.",
          "evidence_status may be ready only when the case has a clear reported difference and enough evidence to let the worker explicitly request a Kael-computed proposal. It never approves the proposal.",
          `Latest ${input.event.actor} event: ${scrubSensitiveForLLM(input.event.text).slice(0, 1200)}`,
        ].join("\n"),
      },
    ],
  };
}

function guardIncidentAnswer(
  answer: z.infer<typeof jobIncidentAnswerSchema>,
  actor: "customer" | "worker",
  language: KaelPromptLanguage,
): Pick<JobIncidentAssistantAnswer, "summary" | "next_actor" | "question" | "evidence_status" | "evidence_gaps"> | null {
  const summary = guardIncidentText(answer.summary, actor, language);
  const question = guardIncidentText(answer.question, actor, language);
  if (!summary || !question) return null;
  return {
    summary,
    next_actor: answer.next_actor,
    question,
    evidence_status: answer.evidence_status,
    evidence_gaps: answer.evidence_gaps.map((gap) => scrubSensitiveForLLM(gap)).filter(Boolean),
  };
}

function guardIncidentText(text: string, actor: "customer" | "worker", language: KaelPromptLanguage): string | null {
  if (/(?:₫|\bVND\b|\b\d[\d.,\s]*đ\b|\bgiá\s+(?:mới|tăng|giảm)\b|\bđã\s+(?:duyệt|từ chối|chấp nhận)\b)/i.test(text)) {
    return null;
  }
  const checked = guardOutput({
    text,
    actor,
    language,
    surface: "job_incident",
    fallbackText: "",
  });
  return checked.allowed && !checked.used_fallback ? checked.text : null;
}

function fallback(
  language: KaelPromptLanguage,
  input?: JobIncidentAssistantInput,
): JobIncidentAssistantAnswer {
  const ready = Boolean(input && hasMinimumProposalEvidence(input.incident));
  return {
    schema_version: "job_incident_answer.v1",
    ...(ready
      ? READY_FALLBACKS[language]
      : FALLBACKS[language]),
    ...(ready && input
      ? { summary: readyFallbackSummary(language, input.incident.evidence_count) }
      : {}),
    fallback_used: true,
    provider: null,
    model: null,
  };
}

function readyFallbackSummary(
  language: KaelPromptLanguage,
  evidenceCount: number,
): string {
  if (language === "vi") {
    return `Kael đã đối chiếu phần việc và lý do thợ báo với ${evidenceCount} ảnh hiện trường đã gắn với hồ sơ. Dữ liệu đủ để lập đề xuất cho khách xem xét; Kael chưa xác minh vật lý độc lập và chưa cho phép thi công phát sinh.`;
  }
  return `Kael compared the worker-reported work and reason with ${evidenceCount} linked on-site photo${evidenceCount === 1 ? "" : "s"}. The data is sufficient to draft a proposal for Customer review; Kael has not independently verified the physical site or authorized the changed work.`;
}

function hasMinimumProposalEvidence(
  incident: JobIncidentAssistantInput["incident"],
): boolean {
  return incident.evidence_count > 0 &&
    incident.description.trim().length >= 24 &&
    incident.reason.trim().length >= 24;
}
