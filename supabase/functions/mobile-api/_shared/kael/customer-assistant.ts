import { z } from "zod";
import type {
  AIRequest,
  EdgeAiSecrets,
  ServiceType,
} from "./types.ts";
import {
  FALLBACK_PROBLEM_SLUG_BY_SERVICE,
  KAEL_BUSINESS_GUARDRAILS,
} from "./types.ts";
import {
  callStructuredAI,
  type StructuredAIInvoker,
} from "./structured-call.ts";
import {
  normalizeAssistantPayload,
  recoverAssistantProviderAnswer,
  type CustomerAssistantBoundary,
  type CustomerAssistantSuggestedAction,
} from "./customer-assistant-provider-output.ts";
import {
  evaluateKaelPermissionGateWithBoundaries,
  hasKaelForbiddenTopicBoundarySignal,
  type KaelTopic,
} from "./permission-gate.ts";
import {
  isKaelKnowledgeRetrievalEnabled,
  type KaelKnowledgeContext,
  retrieveKaelKnowledgeContextIfEnabled,
  retrieveLegalAwareness,
  retrieveKnowledgeSemantic,
} from "./knowledge.ts";
import {
  circuitAwareProviderCandidatesForPurpose,
  shouldSkipProviderSiblingModels,
  type ProviderChoice,
} from "./routing.ts";
import { maxTokensForPurpose } from "./routing.config.ts";
import { guardOutput } from "./output-gateway.ts";
import {
  auditKaelGuardrailTrip,
  type KaelGuardrailTripClient,
} from "./self-check.ts";
import { buildKaelSystemPrompt, type KaelPromptLanguage } from "./system-prompt.ts";
import { buildRegisterHint, detectRegionalRegister } from "./regional-register.ts";
import { getKaelPerformanceProfile } from "./performance-profiles.ts";
import {
  customerWorkflowStatusLabel,
  resolveCustomerAssistantWorkflowAnswer,
  type CustomerAssistantWorkflowResolution,
} from "./customer-assistant-workflow.ts";
import {
  buildNoProviderTrace,
  buildProviderAttemptTrace,
  type KaelSafeTraceEvent,
} from "./trace.ts";
import { scrubSensitiveForLLM } from "./utils.ts";
import { sanitizeCustomerCaseEvidenceText } from "./untrusted-evidence.ts";
import type { KaelSpendGate, SpendGateClient } from "./spend-gate.ts";

type AssistantClient = Parameters<typeof retrieveKaelKnowledgeContextIfEnabled>[0];

export type CustomerAssistantSurface = "customer_normal" | "customer_case";

export type CustomerAssistantJobContext = {
  readonly id: string;
  readonly status?: string | null;
  readonly service_type?: string | null;
  readonly description?: string | null;
  readonly address_district?: string | null;
  readonly kael_problem_identified?: string | null;
  readonly kael_complexity?: string | null;
  readonly kael_advisory?: string | null;
  readonly payment_status?: string | null;
};

export type CustomerAssistantInput = {
  readonly actorId?: string | null;
  readonly message: string;
  readonly language?: KaelPromptLanguage;
  readonly surface?: CustomerAssistantSurface;
  readonly job?: CustomerAssistantJobContext | null;
  readonly client?: AssistantClient | null;
  readonly secrets: EdgeAiSecrets;
  readonly callAI?: StructuredAIInvoker;
};

export type CustomerAssistantAnswer = {
  readonly answer: string;
  readonly safety_notes: readonly string[];
  readonly citations: readonly string[];
  readonly suggested_actions: readonly CustomerAssistantSuggestedAction[];
  readonly boundary: CustomerAssistantBoundary;
  readonly fallback_used: boolean;
  readonly trace?: readonly KaelSafeTraceEvent[];
};

const customerAssistantResponseSchema = z.preprocess(normalizeAssistantPayload, z.object({
  answer: z.string().trim().min(1).max(900),
  safety_notes: z.array(z.string().trim().min(1).max(180)).max(3).default([]),
  citations: z.array(z.string().trim().min(1).max(180)).max(5).default([]),
  suggested_actions: z.array(z.enum([
    "open_booking",
    "check_job",
    "message_worker",
    "contact_support",
    "request_scope_change",
  ])).max(3).default([]),
  boundary: z.enum([
    "answered",
    "educational_only",
    "redirect",
    "unsupported",
    "fallback",
  ]).default("answered"),
}).strip());

const FALLBACK_VI =
  "Kael có thể giải thích trong phạm vi sáu dịch vụ nhà ở NestScout tại TP.HCM. Nếu câu hỏi liên quan đến công việc đang chạy, hãy mở hồ sơ công việc để Kael đọc đúng ngữ cảnh.";
const FALLBACK_EN =
  "Kael can help with NestScout's six HCMC home-service categories. If this is about an active job, open that job so Kael can use the right context.";
const LEGAL_NOTE_VI =
  "Kael chỉ cung cấp nhận biết an toàn/pháp lý chung, không thay thế tư vấn luật sư.";
const LEGAL_NOTE_EN =
  "Kael gives general safety/legal-awareness guidance only, not legal advice.";

export async function runCustomerAssistant(
  input: CustomerAssistantInput,
): Promise<CustomerAssistantAnswer> {
  const language = input.language ?? "vi";
  const surface = input.surface ?? "customer_normal";
  const trace: KaelSafeTraceEvent[] = [];
  const cleanQuestion = (
    surface === "customer_case"
      ? sanitizeCustomerCaseEvidenceText(input.message)
      : scrubSensitiveForLLM(input.message)
  ).slice(0, 2000);
  const workflowQuestion = scrubSensitiveForLLM(input.message).slice(0, 2000);
  const serviceType = inferAssistantServiceType(cleanQuestion, input.job);
  const topic = classifyAssistantTopic(cleanQuestion, serviceType);
  // Deterministic per-conversation register (KC2): read the customer's own words
  // to produce a mirror-lite hint. No region label, no PII, nothing logged.
  const registerHint = buildRegisterHint(detectRegionalRegister(cleanQuestion));
  const permission = await evaluateKaelPermissionGateWithBoundaries({
    purpose: "educational_response",
    actor: "customer",
    jobRelation: input.job ? "own_customer_job" : "none",
    action: input.job ? "read_context" : "generate_advisory",
    topic,
    intentConfidence: 1,
    topicSource: "deterministic_rule",
    boundarySignal: hasKaelForbiddenTopicBoundarySignal(topic, cleanQuestion),
    jobId: input.job?.id ?? null,
    language,
  }, input.client ?? undefined);

  if (!permission.allowed) {
    return fallbackAnswer(
      permission.responseText ?? fallbackText(language),
      language,
      topic,
      "unsupported",
      true,
      trace,
    );
  }

  const workflowAnswer = resolveCustomerAssistantWorkflowAnswer({
    jobStatus: input.job?.status,
    paymentStatus: input.job?.payment_status,
    question: workflowQuestion,
    language,
  });
  if (workflowAnswer) {
    return buildCustomerWorkflowAnswer(workflowAnswer, language, surface, topic);
  }

  const knowledge = await retrieveAssistantKnowledgeContext({
    client: input.client,
    jobId: input.job?.id ?? null,
    queryText: cleanQuestion,
    secrets: input.secrets,
    serviceType,
    surface,
    topic,
  });

  const routes = circuitAwareProviderCandidatesForPurpose("educational_response");
  if (routes.length === 0) {
    trace.push(buildCustomerAssistantNoProviderTrace(surface));
    return fallbackAnswer(fallbackText(language), language, topic, "fallback", true, trace);
  }
  const spendGate: KaelSpendGate = {
    client: input.client as SpendGateClient,
    actorId: input.actorId ?? null,
  };
  const blockedProviders = new Set<string>();
  for (const route of routes) {
    if (blockedProviders.has(route.provider)) continue;
    const result = await callStructuredAI(
      buildAssistantRequest({
        route,
        question: cleanQuestion,
        language,
        surface,
        serviceType,
        topic,
        job: input.job ?? null,
        knowledgePrompt: knowledge?.promptContext ?? null,
        registerHint,
      }),
      customerAssistantResponseSchema,
      input.secrets,
      spendGate,
      input.callAI,
    );
    if (!result.success) {
      const schemaResponse = result.code === "SCHEMA_INVALID"
        ? result.response
        : undefined;
      if (schemaResponse) {
        trace.push(buildCustomerAssistantProviderTrace(surface, route, "schema_invalid", {
          code: "INVALID_SCHEMA",
          latencyMs: schemaResponse.latencyMs,
          costUsd: schemaResponse.usage.costUsd,
          fallbackUsed: true,
        }));
        const recoveredAnswer = recoverAssistantProviderAnswer(result);
        if (recoveredAnswer) {
          const checked = guardCustomerAssistantOutput(
            recoveredAnswer,
            language,
            surface,
          );
          if (checked.allowed && !checked.used_fallback) {
            return {
              answer: checked.text,
              safety_notes: deterministicSafetyNotes(language, topic),
              citations: normalizeCitations([
                ...(knowledge?.semanticCitations ?? []),
                "NestScout platform scope",
              ], [
                ...(knowledge?.semanticCitations ?? []),
                "NestScout platform scope",
              ]),
              suggested_actions: normalizeActions([], surface, topic),
              boundary: "answered",
              fallback_used: true,
              trace,
            };
          }
          await auditCustomerAssistantGuardTrip(input, surface, route, checked);
        }
        continue;
      }
      trace.push(buildCustomerAssistantProviderTrace(surface, route, "error", {
        code: result.code,
        fallbackUsed: true,
      }));
      if (shouldSkipProviderSiblingModels(result.code)) {
        blockedProviders.add(route.provider);
      }
      continue;
    }

    const checked = guardCustomerAssistantOutput(
      result.data.answer,
      language,
      surface,
    );
    if (checked.used_fallback || !checked.allowed) {
      await auditCustomerAssistantGuardTrip(input, surface, route, checked);
      trace.push(buildCustomerAssistantProviderTrace(surface, route, "error", {
        code: checked.reason ?? "SELF_CHECK_FALLBACK",
        latencyMs: result.latencyMs,
        costUsd: result.usage.costUsd,
        fallbackUsed: true,
      }));
      return fallbackAnswer(checked.text, language, topic, "fallback", true, trace);
    }

    trace.push(buildCustomerAssistantProviderTrace(surface, route, "success", {
      latencyMs: result.latencyMs,
      costUsd: result.usage.costUsd,
      fallbackUsed: false,
    }));
    return {
      answer: checked.text,
      safety_notes: deterministicSafetyNotes(language, topic),
      citations: normalizeCitations([
        ...result.data.citations,
        ...(knowledge?.semanticCitations ?? []),
        "NestScout platform scope",
      ], [
        ...(knowledge?.semanticCitations ?? []),
        "NestScout platform scope",
      ]),
      suggested_actions: normalizeActions(result.data.suggested_actions, surface, topic),
      boundary: result.data.boundary,
      fallback_used: false,
      trace,
    };
  }

  return fallbackAnswer(fallbackText(language), language, topic, "fallback", true, trace);
}

function buildAssistantRequest(input: {
  route: ProviderChoice;
  question: string;
  language: KaelPromptLanguage;
  surface: CustomerAssistantSurface;
  serviceType: ServiceType | null;
  topic: KaelTopic;
  job: CustomerAssistantJobContext | null;
  knowledgePrompt: string | null;
  registerHint: string | null;
}): AIRequest {
  const contextSummary = JSON.stringify({
    platform_scope: "NestScout supports six HCMC apartment services: electrical, plumbing, cleaning, HVAC, upholstery care, and minor handyman work.",
    surface: input.surface,
    topic: input.topic,
    service_type: input.serviceType,
    job: sanitizeAssistantJobContext(input.job, input.surface, input.language),
    knowledge: input.knowledgePrompt,
  }).slice(0, 2600);

  return {
    purpose: "educational_response",
    provider: input.route.provider,
    model: input.route.model,
    maxTokens: maxTokensForPurpose("educational_response", 420),
    temperature: 0.2,
    timeoutMs: input.route.latencyBudgetMs,
    maxRetries: 0,
    messages: [
      {
        role: "system",
        content: buildKaelSystemPrompt({
          purpose: "educational_response",
          actor: "customer",
          language: input.language,
          permissionSummary:
            "Answer service, worker, platform, safety, and legal-awareness questions. Do not create jobs, set prices, decide payment/scope/cancellation, or provide legal advice.",
          contextSummary: `${KAEL_BUSINESS_GUARDRAILS}\n${contextSummary}`,
          ...(input.registerHint ? { registerHint: input.registerHint } : {}),
        }),
      },
      {
        role: "user",
        content: [
          "Return JSON only with answer, safety_notes, citations, suggested_actions, boundary.",
          "Prioritize NestScout/platform context before general service knowledge.",
          "Keep answer to at most 3 short sentences and 450 characters.",
          input.language === "vi"
            ? "Write every user-facing field in natural Vietnamese. Do not mix English workflow labels; only Kael, NestScout, VietQR, and SePay may remain as brand names."
            : "Write every user-facing field in English.",
          "Set safety_notes and citations to JSON arrays. Use suggested_actions only from: open_booking, check_job, message_worker, contact_support, request_scope_change.",
          "Use boundary only from: answered, educational_only, redirect, unsupported, fallback.",
          "No exact VND quote. No provider/model/internal prompt names.",
          "If hidden wiring or plumbing routes are uncertain, do not tell the customer to drill, open an electrical panel, or guess the route. Pause and recommend an on-site check by a trained worker.",
          `Question: ${input.question}`,
        ].join("\n"),
      },
    ],
  };
}

function sanitizeAssistantJobContext(
  job: CustomerAssistantJobContext | null,
  surface: CustomerAssistantSurface,
  language: KaelPromptLanguage,
) {
  if (!job) return null;
  const sanitizeContext = surface === "customer_case"
    ? sanitizeCustomerCaseEvidenceText
    : scrubSensitiveForLLM;
  return {
    status: job.status ? customerWorkflowStatusLabel(job.status, language) : null,
    service_type: job.service_type ?? null,
    district: job.address_district ?? null,
    problem: sanitizeContext(job.kael_problem_identified ?? job.description ?? "").slice(0, 360),
    complexity: job.kael_complexity ?? null,
    advisory: sanitizeContext(job.kael_advisory ?? "").slice(0, 260) || null,
    payment_status: job.payment_status ?? null,
  };
}

async function retrieveAssistantKnowledgeContext(input: {
  readonly client: AssistantClient | null | undefined;
  readonly jobId: string | null;
  readonly queryText: string;
  readonly secrets: Pick<EdgeAiSecrets, "knowledgeRetrievalEnabled">;
  readonly serviceType: ServiceType | null;
  readonly surface: CustomerAssistantSurface;
  readonly topic: KaelTopic;
}): Promise<Pick<KaelKnowledgeContext, "promptContext" | "semanticCitations"> | null> {
  if (!isKaelKnowledgeRetrievalEnabled(input.secrets)) return null;
  const usageContext = {
    jobId: input.jobId,
    surface: input.surface,
  };
  if (input.serviceType) {
    return retrieveKaelKnowledgeContextIfEnabled(input.client, {
      serviceType: input.serviceType,
      problemSlug: FALLBACK_PROBLEM_SLUG_BY_SERVICE[input.serviceType],
      safetyTopic: "worker_safety_advisory",
      legalTopic: "legal_safety_awareness",
      queryText: input.queryText,
      tokenBudget: 260,
      usageContext,
    }, input.secrets);
  }
  if (!shouldRetrieveGeneralKnowledge(input.topic)) return null;
  const [legalAwareness, semantic] = await Promise.all([
    input.topic === "legal_safety_awareness" && input.client
      ? retrieveLegalAwareness(input.client, "legal_safety_awareness")
      : Promise.resolve({ rows: [] }),
    retrieveKnowledgeSemantic(input.client, {
      queryText: input.queryText,
      limit: 4,
      minSimilarity: 0.62,
      usageContext,
    }),
  ]);
  const legalLines = legalAwareness.rows.slice(0, 2).map((row) => {
    const boundary = assistantSafeText(row.boundary_type, 80);
    const guidance = assistantSafeText(row.response_guidance, 320);
    return guidance ? `Legal boundary ${boundary}: ${guidance}.` : "";
  }).filter(Boolean);
  const lines = semantic.rows.slice(0, 3).map((row) => {
    const citation = assistantSafeText(row.citation_id, 180);
    const content = assistantSafeText(row.content, 320);
    return content ? `Semantic citation ${citation}: ${content}.` : "";
  }).filter(Boolean);
  const promptLines = [...legalLines, ...lines];
  return {
    promptContext: promptLines.length > 0
      ? [
        "Runtime knowledge (admin-reviewed, sanitized; platform/legal/worker context first):",
        ...promptLines.map((line) => `- ${line}`),
      ].join("\n")
      : null,
    semanticCitations: semantic.rows
      .map((row) => assistantSafeText(row.citation_id, 180))
      .filter(Boolean)
      .slice(0, 5),
  };
}

function shouldRetrieveGeneralKnowledge(topic: KaelTopic) {
  return topic === "worker_qualification_explain" ||
    topic === "legal_safety_awareness" ||
    topic === "service_pricing_general_info" ||
    topic === "support_redirect";
}

function assistantSafeText(value: unknown, maxLength: number) {
  return scrubSensitiveForLLM(typeof value === "string" ? value : "")
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .trim();
}

function fallbackAnswer(
  answer: string,
  language: KaelPromptLanguage,
  topic: KaelTopic,
  boundary: CustomerAssistantBoundary,
  fallbackUsed: boolean,
  trace?: readonly KaelSafeTraceEvent[],
): CustomerAssistantAnswer {
  return {
    answer,
    safety_notes: deterministicSafetyNotes(language, topic),
    citations: ["NestScout platform scope"],
    suggested_actions: normalizeActions([], "customer_normal", topic),
    boundary,
    fallback_used: fallbackUsed,
    ...(trace && trace.length > 0 ? { trace } : {}),
  };
}

function buildCustomerWorkflowAnswer(
  workflowAnswer: CustomerAssistantWorkflowResolution,
  language: KaelPromptLanguage,
  surface: CustomerAssistantSurface,
  topic: KaelTopic,
): CustomerAssistantAnswer {
  return {
    answer: workflowAnswer.answer,
    safety_notes: deterministicSafetyNotes(language, topic),
    citations: ["NestScout platform scope"],
    suggested_actions: normalizeActions(workflowAnswer.suggestedActions, surface, topic),
    boundary: "answered",
    fallback_used: false,
  };
}

function customerAssistantPath(surface: CustomerAssistantSurface) {
  return surface === "customer_case"
    ? {
      workflowPhase: "offer_ready",
      action: "customer.open_case_chat",
      policyId: "kael.path.customer_case_chat_revision.v1",
    } as const
    : {
      workflowPhase: "intake",
      action: "customer.submit_intake",
      policyId: "kael.path.customer_intake_to_estimate.v1",
    } as const;
}

function buildCustomerAssistantNoProviderTrace(surface: CustomerAssistantSurface) {
  const path = customerAssistantPath(surface);
  return buildNoProviderTrace({
    workflowPhase: path.workflowPhase,
    actorRole: "customer",
    action: path.action,
    policyId: path.policyId,
    purpose: "educational_response",
    reasonCode: "NO_PROVIDER_AVAILABLE",
    safeMetadata: { surface },
  });
}

function buildCustomerAssistantProviderTrace(
  surface: CustomerAssistantSurface,
  route: ProviderChoice,
  result: "success" | "error" | "schema_invalid",
  options: {
    readonly code?: string;
    readonly latencyMs?: number;
    readonly costUsd?: number;
    readonly fallbackUsed: boolean;
  },
) {
  const path = customerAssistantPath(surface);
  return buildProviderAttemptTrace({
    workflowPhase: path.workflowPhase,
    actorRole: "customer",
    action: path.action,
    policyId: path.policyId,
    purpose: "educational_response",
    provider: route.provider,
    model: route.model,
    latencyMs: options.latencyMs,
    costUsd: options.costUsd,
    result,
    code: options.code,
    fallbackUsed: options.fallbackUsed,
    safeMetadata: { surface },
  });
}

function fallbackText(language: KaelPromptLanguage) {
  return language === "en" ? FALLBACK_EN : FALLBACK_VI;
}

function deterministicSafetyNotes(
  language: KaelPromptLanguage,
  topic: KaelTopic,
) {
  if (topic === "legal_safety_awareness" || topic === "legal_advice") {
    return [language === "en" ? LEGAL_NOTE_EN : LEGAL_NOTE_VI];
  }
  return language === "en"
    ? ["Use NestScout's in-app workflow for booking, scope, payment, and support."]
    : ["Hãy dùng luồng trong ứng dụng NestScout cho đặt lịch, phạm vi, thanh toán và hỗ trợ."];
}

function normalizeCitations(
  values: readonly string[],
  allowlistedValues: readonly string[],
) {
  const allowlist = new Set(allowlistedValues
    .map((value) => assistantSafeText(value, 180))
    .filter(Boolean));
  return Array.from(new Set(values
    .map((value) => assistantSafeText(value, 180))
    .filter((value) => Boolean(value) && allowlist.has(value))))
    .slice(0, 5);
}

function normalizeActions(
  actions: readonly CustomerAssistantSuggestedAction[],
  surface: CustomerAssistantSurface,
  topic: KaelTopic,
) {
  const defaults: CustomerAssistantSuggestedAction[] = surface === "customer_case"
    ? ["check_job", "message_worker"]
    : topic === "service_pricing_general_info"
    ? ["open_booking"]
    : [];
  return Array.from(new Set([...actions, ...defaults])).slice(0, 3);
}

function inferAssistantServiceType(
  text: string,
  job?: CustomerAssistantJobContext | null,
): ServiceType | null {
  const jobProfile = getKaelPerformanceProfile(job?.service_type ?? "");
  if (jobProfile) return jobProfile.service_type;
  const normalized = normalizeText(text);
  if (/\b(dieu hoa|may lanh|dan lanh|dan nong|khong mat|lam lanh yeu|ma loi|air conditioner|air conditioning|hvac|ac unit|not cooling)\b/.test(normalized)) {
    return "hvac";
  }
  if (/\b(sofa|nem|rem|tham|vai boc|giat sofa|giat nem|vet ban|mui hoi|am moc|upholstery|mattress|curtain|carpet|fabric stain)\b/.test(normalized)) {
    return "upholstery";
  }
  if (/\b(khoan tuong|lap ke|lap thanh rem|ban le|tay nam|treo tv|lap tv|sua vat|handyman|mount shelf|hang tv|door hinge|cabinet handle)\b/.test(normalized)) {
    return "handyman";
  }
  if (/\b(dien|o cam|o dien|cong tac|cau dao|aptomat|mat dien|den|chap|electrical|outlet|socket|circuit breaker|power outage|light switch)\b/.test(normalized)) {
    return "electrical";
  }
  if (/\b(nuoc|ong|voi|lavabo|bon|toilet|ro|ri|tac|ap nuoc|plumbing|pipe|faucet|leak|clog|water pressure)\b/.test(normalized)) {
    return "plumbing";
  }
  if (/\b(don dep|ve sinh|lau don|bep|phong tam|cua kinh|sau sua chua|rac|bui|cleaning|housekeeping|kitchen|bathroom|dust|trash)\b/.test(normalized)) {
    return "cleaning";
  }
  return null;
}

function classifyAssistantTopic(text: string, serviceType: ServiceType | null): KaelTopic {
  const normalized = normalizeText(text);
  if (/\b(son nha|khoa cua|chuyen nha|diet con trung|internet|camera|tu lanh|house painting|locksmith|moving service|pest control|refrigerator)\b/.test(normalized)) {
    return "out_of_scope_services_anything";
  }
  if (/\b(khoi kien|luat su|toa an|don kien|hop dong phap ly|legal advice|lawyer|attorney|sue|lawsuit|court filing)\b/.test(normalized)) {
    return "legal_advice";
  }
  if (/\b(luat|phap ly|trach nhiem|bao hanh|boi thuong|hoa don|bien ban|legal awareness|warranty|liability|compensation|invoice)\b/.test(normalized)) {
    return "legal_safety_awareness";
  }
  if (/\b(gia|bao nhieu|uoc tinh|phi|tien cong|bao gia|price|pricing|estimate|cost|fee|quote)\b/.test(normalized)) {
    return "service_pricing_general_info";
  }
  if (/\b(tho|worker|xac minh|danh gia|tay nghe|chap nhan|huy viec)\b/.test(normalized)) {
    return "worker_qualification_explain";
  }
  if (serviceType === "electrical") return "electrical_repair";
  if (serviceType === "plumbing") return "plumbing_repair";
  if (serviceType === "cleaning") return "home_cleaning";
  if (serviceType === "hvac") return "hvac_service";
  if (serviceType === "upholstery") return "upholstery_care";
  if (serviceType === "handyman") return "handyman_service";
  return "support_redirect";
}

function guardCustomerAssistantOutput(
  text: string,
  language: KaelPromptLanguage,
  surface: CustomerAssistantSurface,
) {
  const initial = guardOutput({
    text,
    actor: "customer",
    language,
    surface,
    fallbackText: fallbackText(language),
  });
  if (initial.reason !== "sentence_too_long") return initial;
  return guardOutput({
    text: reflowLongAssistantSentences(text),
    actor: "customer",
    language,
    surface,
    fallbackText: fallbackText(language),
  });
}

async function auditCustomerAssistantGuardTrip(
  input: CustomerAssistantInput,
  surface: CustomerAssistantSurface,
  route: ProviderChoice,
  checked: ReturnType<typeof guardOutput>,
) {
  if (!input.client || !checked.trip) return;
  await auditKaelGuardrailTrip(
    input.client as unknown as KaelGuardrailTripClient,
    {
      jobId: input.job?.id ?? null,
      actorId: input.actorId ?? null,
      actorRole: "customer",
      surface,
      reason: checked.trip.reason,
      guardrailLabel: checked.trip.guardrailLabel ?? null,
      source: checked.trip.source,
      safeMetadata: {
        purpose: "educational_response",
        provider: route.provider,
      },
    },
  );
}

function reflowLongAssistantSentences(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]?/g) ?? [text];
  return sentences
    .flatMap((sentence) => splitAssistantSentence(sentence.trim(), 18))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function splitAssistantSentence(sentence: string, maxWords: number): string[] {
  const terminal = sentence.match(/[.!?]$/)?.[0] ?? ".";
  const words = sentence.replace(/[.!?]$/, "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [sentence];
  const chunks: string[] = [];
  while (words.length > maxWords) {
    let balancedClauseCut = -1;
    for (let index = 2; index < Math.min(maxWords, words.length - 1); index += 1) {
      if (
        words.length - index - 1 <= maxWords &&
        /[,;:]$/.test(words[index] ?? "") &&
        !isCoordinatingConnector(words[index] ?? "")
      ) {
        balancedClauseCut = index;
      }
    }
    let cut = balancedClauseCut >= 0 ? balancedClauseCut + 1 : maxWords;
    if (balancedClauseCut < 0) {
      for (let index = maxWords; index >= 8; index -= 1) {
        if (
          /[,;:]$/.test(words[index - 1] ?? "") &&
          !isCoordinatingConnector(words[index - 1] ?? "")
        ) {
          cut = index;
          break;
        }
      }
    }
    if (cut > 8 && isCoordinatingConnector(words[cut - 1] ?? "")) {
      cut -= 1;
    }
    const chunk = words.splice(0, cut).join(" ").replace(/[,;:]+$/, "");
    if (chunk) chunks.push(`${capitalizeSentenceStart(chunk)}.`);
    normalizeLeadingConnector(words);
  }
  if (words.length > 0) {
    chunks.push(`${capitalizeSentenceStart(words.join(" "))}${terminal}`);
  }
  return chunks;
}

function isCoordinatingConnector(value: string) {
  const normalized = normalizeText(value.replace(/[,;:]+$/, ""));
  return ["va", "hoac", "hay", "nhung", "and", "or", "but"].includes(normalized);
}

function normalizeLeadingConnector(words: string[]) {
  const first = words[0];
  if (!first) return;
  const normalized = normalizeText(first.replace(/[,;:]+$/, ""));
  if (["va", "hoac", "hay", "and", "or"].includes(normalized)) {
    words.shift();
    return;
  }
  if (normalized === "nhung") words[0] = "Tuy nhiên,";
  if (normalized === "but") words[0] = "However,";
}

function capitalizeSentenceStart(value: string) {
  return value ? `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}` : value;
}

function normalizeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
