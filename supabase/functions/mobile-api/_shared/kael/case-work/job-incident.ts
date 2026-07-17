import { z } from "zod";
import type { AIRequest, EdgeAiSecrets } from "../types.ts";
import { callStructuredAI, type StructuredAIInvoker } from "../provider/structured-call.ts";
import type { KaelSpendGate } from "../guards/spend-gate.ts";
import { circuitAwareProviderCandidatesForPurpose, type ProviderChoice } from "../routing/routing.ts";
import { maxTokensForPurpose } from "../routing/routing.config.ts";
import { buildKaelSystemPrompt, type KaelPromptLanguage } from "../charter/system-prompt.ts";
import { evaluateKaelPermissionGate } from "../guards/permission-gate.ts";
import { guardOutput } from "../guards/output-gateway.ts";
import { scrubSensitiveForLLM } from "../_runtime/utils.ts";

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

  for (const route of circuitAwareProviderCandidatesForPurpose("job_incident")) {
    const result = await callStructuredAI(
      buildRequest(input, route, language),
      jobIncidentAnswerSchema,
      input.secrets,
      input.spendGate,
      input.callAI,
    );
    if (!result.success) continue;

    const guarded = guardIncidentAnswer(result.data, input.event.actor, language);
    if (!guarded) return fallback(language);
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
  return fallback(language);
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
    maxRetries: 1,
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

function fallback(language: KaelPromptLanguage): JobIncidentAssistantAnswer {
  return {
    schema_version: "job_incident_answer.v1",
    ...FALLBACKS[language],
    fallback_used: true,
    provider: null,
    model: null,
  };
}
