import { z } from "zod";
import { apiFailure } from "../../platform/api-failure.ts";
import type {
  AIRequest,
  EdgeAiSecrets,
  ServiceType,
} from "../contracts/types.ts";
import {
  FALLBACK_PROBLEM_SLUG_BY_SERVICE,
  KAEL_BUSINESS_GUARDRAILS,
} from "../contracts/types.ts";
import {
  callStructuredAI,
  callStructuredAIStream,
  createStructuredResponseStreamObserver,
  type StructuredAIInvoker,
} from "../kael-providers/structured-call.ts";
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
} from "../kael-guardrails/permission-gate.ts";
import { evaluateMessageBoundary } from "../kael-guardrails/boundary-guard.ts";
import {
  isKaelKnowledgeRetrievalEnabled,
  type KaelKnowledgeContext,
  retrieveKaelKnowledgeContextIfEnabled,
  retrieveLegalAwareness,
  retrieveKnowledgeSemantic,
} from "../tools/knowledge.ts";
import {
  circuitAwareProviderCandidatesForPurpose,
  isSimpleNormalChatMessage,
  shouldSkipProviderSiblingModels,
  type ProviderChoice,
} from "../kael-providers/routing.ts";
import { maxTokensForPurpose } from "../kael-providers/routing.config.ts";
import { providerAdapterFor } from "../kael-providers/provider-adapter.ts";
import { guardOutput } from "../kael-guardrails/output-gateway.ts";
import {
  auditKaelGuardrailTrip,
  type KaelGuardrailTripClient,
} from "../kael-guardrails/self-check.ts";
import { buildKaelSystemPrompt, type KaelPromptLanguage } from "../prompts/system-prompt.ts";
import { buildRegisterHint, detectRegionalRegister } from "../language/regional-register.ts";
import {
  customerWorkflowStatusLabel,
  resolveCustomerAssistantWorkflowAnswer,
  type CustomerAssistantWorkflowResolution,
} from "./customer-assistant-workflow.ts";
import { type KaelSafeTraceEvent } from "../learning/trace.ts";
import { scrubSensitiveForLLM } from "../pipeline/utils.ts";
import { sanitizeCustomerCaseEvidenceText } from "../evidence/untrusted-evidence.ts";
import { createRuntimeKaelSpendGate, type SpendGateClient } from "../kael-guardrails/spend-gate.ts";
import { normalizeKaelResponseBrand } from "../language/user-facing-copy.ts";
import {
  buildCustomerWorkflowAssistantAnswer,
  buildFallbackCustomerAssistantAnswer,
} from "./customer-assistant-answer.ts";
import {
  deterministicSafetyNotes,
  fallbackText,
} from "./customer-assistant-copy.ts";
import {
  assistantSafeText,
  buildCustomerAssistantNoProviderTrace,
  buildCustomerAssistantProviderTrace,
  classifyAssistantTopic,
  inferAssistantServiceType,
  normalizeActions,
  normalizeCitations,
  normalizeText,
  shouldRetrieveGeneralKnowledge,
  type CustomerAssistantJobContext,
  type CustomerAssistantSurface,
} from "./customer-assistant-policy.ts";
import {
  buildAssistantRequest,
  reflowLongAssistantSentences,
  resolveBoundedServiceLifecycleAnswer,
  retrieveAssistantKnowledgeContext,
} from "./customer-assistant-support.ts";
import {
  isKaelReasoningPublicSummaryItem,
  reportKaelPublicExecutionStep,
  type KaelReasoningReporter,
} from "../reasoning-receipt.ts";
import { type KaelResponseReporter } from "../response-stream.ts";
export type {
  CustomerAssistantJobContext,
  CustomerAssistantSurface,
} from "./customer-assistant-policy.ts";

type AssistantClient = Parameters<typeof retrieveKaelKnowledgeContextIfEnabled>[0];

export type CustomerAssistantInput = {
  readonly actorId?: string | null;
  readonly message: string;
  readonly imageUrls?: readonly string[];
  readonly language?: KaelPromptLanguage;
  readonly serviceType?: ServiceType | null;
  readonly surface?: CustomerAssistantSurface;
  readonly job?: CustomerAssistantJobContext | null;
  readonly client?: AssistantClient | null;
  readonly memorySummary?: string | null;
  readonly secrets: EdgeAiSecrets;
  readonly reasoning?: KaelReasoningReporter;
  readonly response?: KaelResponseReporter;
  readonly callAI?: StructuredAIInvoker;
};

export type CustomerAssistantAnswer = {
  readonly answer: string;
  readonly safety_notes: readonly string[];
  readonly citations: readonly string[];
  readonly suggested_actions: readonly CustomerAssistantSuggestedAction[];
  readonly boundary: CustomerAssistantBoundary;
  readonly fallback_used: boolean;
  readonly public_reasoning_summary?: readonly string[];
  readonly trace?: readonly KaelSafeTraceEvent[];
};

const customerAssistantResponseSchema = z.preprocess(normalizeAssistantPayload, z.object({
  answer: z.string().trim().min(1).max(900),
  safety_notes: z.array(z.string().trim().min(1).max(180)).max(3).default([]),
  citations: z.array(z.string().trim().min(1).max(180)).max(5).default([]),
  public_reasoning_summary: z.array(
    z.string().trim().min(1).max(220).refine(isKaelReasoningPublicSummaryItem),
  ).min(1).max(4).catch([]).default([]),
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

type CustomerAssistantProviderPayload = z.infer<typeof customerAssistantResponseSchema>;

export async function runCustomerAssistant(
  input: CustomerAssistantInput,
): Promise<CustomerAssistantAnswer> {
  const {
    boundary,
    cleanQuestion,
    language,
    registerHint,
    serviceType,
    surface,
    topic,
    workflowQuestion,
  } = buildCustomerAssistantRunContext(input);
  const trace: KaelSafeTraceEvent[] = [];
  if (!boundary.ok && boundary.reason === "prompt_injection") {
    return buildFallbackCustomerAssistantAnswer(
      boundary.declineText,
      topic,
      "unsupported",
      true,
      deterministicSafetyNotes(language, topic),
      trace,
    );
  }
  reportKaelPublicExecutionStep(input.reasoning, {
    detail: customerRequestScopeDetail(language, serviceType),
    id: "request-classified",
    label: customerExecutionLabel(language, "request"),
    sequence: 0,
    stage: "intent",
    status: "completed",
  });
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
  reportKaelPublicExecutionStep(input.reasoning, {
    detail: customerBoundaryDetail(language, permission.allowed),
    id: permission.allowed ? "scope-cleared" : "scope-limited",
    label: customerExecutionLabel(language, "boundary"),
    sequence: 1,
    stage: "context",
    status: "completed",
  });
  if (!permission.allowed) {
    return buildFallbackCustomerAssistantAnswer(
      permission.responseText ?? fallbackText(language, topic),
      topic,
      "unsupported",
      true,
      deterministicSafetyNotes(language, topic),
      trace,
    );
  }

  if (!boundary.ok && (boundary.reason !== "out_of_scope" || topic !== "service_trust_safety")) {
    return buildFallbackCustomerAssistantAnswer(
      boundary.declineText,
      topic,
      "unsupported",
      true,
      deterministicSafetyNotes(language, topic),
      trace,
    );
  }

  const hasImages = Boolean(input.imageUrls?.length);
  const boundedLifecycleAnswer = hasImages
    ? null
    : resolveBoundedServiceLifecycleAnswer(topic, cleanQuestion, language);
  if (boundedLifecycleAnswer) {
    return buildCustomerWorkflowAssistantAnswer(
      boundedLifecycleAnswer,
      surface,
      topic,
      deterministicSafetyNotes(language, topic),
    );
  }

  const workflowAnswer = resolveCustomerAssistantWorkflowAnswer({
    jobStatus: input.job?.status,
    paymentRailAvailable: input.secrets.paymentRailAvailable,
    paymentStatus: input.job?.payment_status,
    question: workflowQuestion,
    language,
  });
  if (!hasImages && workflowAnswer) {
    return buildCustomerWorkflowAssistantAnswer(
      workflowAnswer,
      surface,
      topic,
      deterministicSafetyNotes(language, topic),
    );
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
  if (knowledge?.promptContext) {
    reportKaelPublicExecutionStep(input.reasoning, {
      detail: customerKnowledgeDetail(language, knowledge.semanticCitations.length),
      id: "knowledge-available",
      label: customerExecutionLabel(language, "knowledge"),
      sequence: 2,
      stage: "retrieval",
      status: "completed",
    });
  }
  const routes = customerAssistantProviderRoutes(surface, cleanQuestion).filter((route) =>
    !hasImages || providerAdapterFor(route.provider).capabilities.vision
  );
  if (routes.length === 0) {
    if (hasImages) return failImageAnalysis(language);
    trace.push(buildCustomerAssistantNoProviderTrace(surface));
    return buildFallbackCustomerAssistantAnswer(
      fallbackText(language, topic),
      topic,
      "fallback",
      true,
      deterministicSafetyNotes(language, topic),
      trace,
    );
  }
  return resolveCustomerAssistantProviders(
    input,
    language,
    surface,
    topic,
    trace,
    routes,
    knowledge,
    cleanQuestion,
    serviceType,
    registerHint,
  );
}

function buildCustomerAssistantRunContext(input: CustomerAssistantInput) {
  const language = input.language ?? "vi";
  const surface = input.surface ?? "customer_normal";
  const cleanQuestion = (
    surface === "customer_case"
      ? sanitizeCustomerCaseEvidenceText(input.message)
      : scrubSensitiveForLLM(input.message)
  ).slice(0, 2000);
  const workflowQuestion = scrubSensitiveForLLM(input.message).slice(0, 2000);
  const serviceType = input.serviceType ?? inferAssistantServiceType(cleanQuestion, input.job);
  const topic = classifyAssistantTopic(cleanQuestion, serviceType);
  const boundary = evaluateMessageBoundary(cleanQuestion, serviceType, {
    semanticInjectionClassifierEnabled: true,
    language,
  });
  const registerHint = buildRegisterHint(detectRegionalRegister(cleanQuestion));

  return {
    boundary,
    cleanQuestion,
    language,
    registerHint,
    serviceType,
    surface,
    topic,
    workflowQuestion,
  };
}

function customerAssistantProviderRoutes(
  surface: CustomerAssistantSurface,
  cleanQuestion: string,
) {
  return circuitAwareProviderCandidatesForPurpose("educational_response", {
    routeProfile: surface === "customer_normal" && isSimpleNormalChatMessage(cleanQuestion)
      ? "simple_normal_chat"
      : "standard",
  });
}

async function resolveCustomerAssistantProviders(
  input: CustomerAssistantInput,
  language: KaelPromptLanguage,
  surface: CustomerAssistantSurface,
  topic: KaelTopic,
  trace: KaelSafeTraceEvent[],
  routes: readonly ProviderChoice[],
  knowledge: Awaited<ReturnType<typeof retrieveAssistantKnowledgeContext>>,
  cleanQuestion: string,
  serviceType: ReturnType<typeof inferAssistantServiceType>,
  registerHint: ReturnType<typeof buildRegisterHint>,
): Promise<CustomerAssistantAnswer> {
  const hasImages = Boolean(input.imageUrls?.length)
  const spendGate = createRuntimeKaelSpendGate(
    input.client as SpendGateClient,
    input.actorId ?? null,
    input.secrets.harnessTrace,
  );
  const blockedProviders = new Set<string>();
  for (const route of routes) {
    if (blockedProviders.has(route.provider)) continue;
    const request = buildAssistantRequest({
      route,
      question: cleanQuestion,
      language,
      surface,
      serviceType,
      topic,
      job: input.job ?? null,
      knowledgePrompt: knowledge?.promptContext ?? null,
      memorySummary: input.memorySummary ?? null,
      registerHint,
      imageUrls: input.imageUrls,
    });
    const streamObserver = !hasImages && input.response && !input.callAI
      ? createCustomerResponseStreamObserver(input, language, surface, topic)
      : null;
    const result = streamObserver
      ? await callStructuredAIStream(
        request,
        customerAssistantResponseSchema,
        input.secrets,
        spendGate,
        streamObserver,
      )
      : await callStructuredAI(
        request,
        customerAssistantResponseSchema,
        input.secrets,
        spendGate,
        input.callAI,
      );
    if (!result.success) {
      if (result.code === "REQUEST_CANCELLED") {
        const cancellation = new Error("Customer Kael response was cancelled");
        cancellation.name = "AbortError";
        throw cancellation;
      }
      const schemaResponse = result.code === "SCHEMA_INVALID"
        ? result.response
        : undefined;
      if (input.response?.hasPublished()) {
        trace.push(schemaResponse
          ? buildCustomerAssistantProviderTrace(surface, route, "schema_invalid", {
            code: "INVALID_SCHEMA",
            latencyMs: schemaResponse.latencyMs,
            costUsd: schemaResponse.usage.costUsd,
            fallbackUsed: true,
          })
          : buildCustomerAssistantProviderTrace(surface, route, "error", {
            code: result.code,
            fallbackUsed: true,
        }));
        return buildFallbackCustomerAssistantAnswer(
          input.response.publishedText(),
          topic,
          "fallback",
          true,
          deterministicSafetyNotes(language, topic),
          trace,
        );
      }
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
            topic,
          );
          if (checked.allowed && !checked.used_fallback) {
            return {
              answer: normalizeKaelResponseBrand(checked.text),
              safety_notes: deterministicSafetyNotes(language, topic),
              citations: customerAssistantCitations(knowledge),
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

    return resolveSuccessfulCustomerAssistantProvider({
      input,
      language,
      surface,
      topic,
      trace,
      route,
      knowledge,
      data: result.data,
      latencyMs: result.latencyMs,
      costUsd: result.usage.costUsd,
    });
  }

  if (input.imageUrls?.length) return failImageAnalysis(language);
  return buildFallbackCustomerAssistantAnswer(
    fallbackText(language, topic),
    topic,
    "fallback",
    true,
    deterministicSafetyNotes(language, topic),
    trace,
  );
}

function failImageAnalysis(language: KaelPromptLanguage): never {
  apiFailure(
    "VISION_UNAVAILABLE",
    language === "en"
      ? "Kael could not analyze this photo right now. Please try again."
      : "Kael chưa thể phân tích ảnh lúc này. Vui lòng thử lại.",
    503,
  );
}

async function resolveSuccessfulCustomerAssistantProvider(input: {
  input: CustomerAssistantInput;
  language: KaelPromptLanguage;
  surface: CustomerAssistantSurface;
  topic: KaelTopic;
  trace: KaelSafeTraceEvent[];
  route: ProviderChoice;
  knowledge: Awaited<ReturnType<typeof retrieveAssistantKnowledgeContext>>;
  data: CustomerAssistantProviderPayload;
  latencyMs: number;
  costUsd: number;
}): Promise<CustomerAssistantAnswer> {
  const checked = guardCustomerAssistantOutput(
    input.data.answer,
    input.language,
    input.surface,
    input.topic,
  );
  if (checked.used_fallback || !checked.allowed) {
    if (input.input.imageUrls?.length) return failImageAnalysis(input.language);
    await auditCustomerAssistantGuardTrip(input.input, input.surface, input.route, checked);
    input.trace.push(buildCustomerAssistantProviderTrace(input.surface, input.route, "error", {
      code: checked.reason ?? "SELF_CHECK_FALLBACK",
      latencyMs: input.latencyMs,
      costUsd: input.costUsd,
      fallbackUsed: true,
    }));
    const fallbackAnswer = input.input.response?.hasPublished()
      ? input.input.response.publishedText()
      : checked.text;
    return buildFallbackCustomerAssistantAnswer(
      fallbackAnswer,
      input.topic,
      "fallback",
      true,
      deterministicSafetyNotes(input.language, input.topic),
      input.trace,
    );
  }
  return buildSuccessfulCustomerAssistantAnswer({
    input: input.input,
    language: input.language,
    surface: input.surface,
    topic: input.topic,
    trace: input.trace,
    route: input.route,
    knowledge: input.knowledge,
    data: input.data,
    answer: checked.text,
    latencyMs: input.latencyMs,
    costUsd: input.costUsd,
  });
}

function buildSuccessfulCustomerAssistantAnswer(input: {
  input: Pick<CustomerAssistantInput, "reasoning">;
  language: KaelPromptLanguage;
  surface: CustomerAssistantSurface;
  topic: KaelTopic;
  trace: KaelSafeTraceEvent[];
  route: ProviderChoice;
  knowledge: Awaited<ReturnType<typeof retrieveAssistantKnowledgeContext>>;
  data: CustomerAssistantProviderPayload;
  answer: string;
  latencyMs: number;
  costUsd: number;
}): CustomerAssistantAnswer {
  input.trace.push(buildCustomerAssistantProviderTrace(input.surface, input.route, "success", {
    latencyMs: input.latencyMs,
    costUsd: input.costUsd,
    fallbackUsed: false,
  }));
  const publicReasoningSummary = publicCustomerReasoningSummary(
    input.data.public_reasoning_summary,
    input.language,
  );
  reportCustomerPublicSummary(input.input.reasoning, input.language, publicReasoningSummary);
  return {
    answer: normalizeKaelResponseBrand(input.answer),
    safety_notes: deterministicSafetyNotes(input.language, input.topic),
    citations: customerAssistantCitations(input.knowledge, input.data.citations),
    suggested_actions: normalizeActions(input.data.suggested_actions, input.surface, input.topic),
    boundary: input.data.boundary,
    fallback_used: false,
    public_reasoning_summary: publicReasoningSummary,
    trace: input.trace,
  };
}

function reportCustomerPublicSummary(
  reporter: KaelReasoningReporter | undefined,
  language: KaelPromptLanguage,
  summary: readonly string[],
) {
  summary.forEach((detail, index) => reportKaelPublicExecutionStep(reporter, {
    detail,
    id: `public-summary-${index}`,
    label: customerExecutionLabel(language, "summary"),
    sequence: 3 + index,
    stage: "compose",
    status: "completed",
  }));
}

function createCustomerResponseStreamObserver(
  input: CustomerAssistantInput,
  language: KaelPromptLanguage,
  surface: CustomerAssistantSurface,
  topic: KaelTopic,
) {
  return createStructuredResponseStreamObserver({
    textField: "answer",
    onPublicReasoningSummary(detail, index) {
      if (!isKaelReasoningPublicSummaryItem(detail, language)) return;
      reportKaelPublicExecutionStep(input.reasoning, {
        detail,
        id: `public-summary-${index}`,
        label: customerExecutionLabel(language, "summary"),
        sequence: 3 + index,
        stage: "compose",
        status: "completed",
      });
    },
    onTextUpdate(text) {
      const stablePrefix = completedSentencePrefix(text);
      if (!stablePrefix) return;
      const checked = guardCustomerAssistantOutput(
        stablePrefix,
        language,
        surface,
        topic,
      );
      if (checked.used_fallback || !checked.allowed) return;
      input.response?.preview(normalizeKaelResponseBrand(checked.text));
    },
  });
}

function completedSentencePrefix(text: string) {
  const matches = [...text.matchAll(/[.!?\u2026]["')\]\u2019\u201d]*(?=\s|$)|\n/gu)];
  const boundary = matches.at(-1);
  return boundary && boundary.index !== undefined
    ? text.slice(0, boundary.index + boundary[0].length).trim()
    : "";
}

function customerExecutionLabel(
  language: KaelPromptLanguage,
  kind: "request" | "boundary" | "knowledge" | "summary",
) {
  const copy = language === "en"
    ? {
      boundary: "Support boundary",
      knowledge: "Related knowledge",
      request: "Request classification",
      summary: "Public response note",
    }
    : {
      boundary: "Giới hạn hỗ trợ",
      knowledge: "Thông tin liên quan",
      request: "Phân loại yêu cầu",
      summary: "Ghi chú phản hồi",
    };
  return copy[kind];
}

function customerRequestScopeDetail(
  language: KaelPromptLanguage,
  serviceType: ReturnType<typeof inferAssistantServiceType>,
) {
  const service = serviceType ? customerServiceLabel(language, serviceType) : null;
  if (language === "en") {
    return service
      ? `The request was classified as ${service} support.`
      : "The request was classified as general Kael support.";
  }
  return service
    ? `Yêu cầu được nhận diện thuộc nhóm hỗ trợ ${service}.`
    : "Yêu cầu được nhận diện là hỗ trợ chung của Kael.";
}

function customerBoundaryDetail(language: KaelPromptLanguage, allowed: boolean) {
  if (language === "en") {
    return allowed
      ? "The request is eligible for advisory support within current boundaries."
      : "The request needs a bounded safe response instead of general advisory support.";
  }
  return allowed
    ? "Yêu cầu phù hợp để nhận hỗ trợ tư vấn trong giới hạn hiện tại."
    : "Yêu cầu cần phản hồi an toàn có giới hạn thay vì tư vấn chung.";
}

function customerKnowledgeDetail(language: KaelPromptLanguage, citationCount: number) {
  if (language === "en") {
    return citationCount > 0
      ? `Added ${citationCount} verified related knowledge source${citationCount === 1 ? "" : "s"}.`
      : "Added verified related platform context.";
  }
  return citationCount > 0
    ? `Đã bổ sung ${citationCount} nguồn thông tin liên quan đã được kiểm chứng.`
    : "Đã bổ sung ngữ cảnh nền tảng liên quan đã được kiểm chứng.";
}

function customerServiceLabel(
  language: KaelPromptLanguage,
  serviceType: NonNullable<ReturnType<typeof inferAssistantServiceType>>,
) {
  const copy = language === "en"
    ? {
      cleaning: "home cleaning",
      electrical: "electrical repair",
      handyman: "minor handyman work",
      hvac: "air-conditioner service",
      plumbing: "plumbing repair",
      upholstery: "upholstery care",
    }
    : {
      cleaning: "vệ sinh nhà",
      electrical: "sửa điện",
      handyman: "sửa vặt và lắp đặt nhỏ",
      hvac: "điều hòa",
      plumbing: "sửa nước",
      upholstery: "chăm sóc sofa, nệm, rèm hoặc thảm",
    };
  return copy[serviceType];
}

function customerAssistantCitations(
  knowledge: Awaited<ReturnType<typeof retrieveAssistantKnowledgeContext>>,
  citations: readonly string[] = [],
) {
  const fallback = [
    ...(knowledge?.semanticCitations ?? []),
    "NestScout platform scope",
  ];
  return normalizeCitations([...citations, ...fallback], fallback);
}

function publicCustomerReasoningSummary(
  summary: readonly string[],
  language: KaelPromptLanguage,
) {
  return summary.filter((item) => isKaelReasoningPublicSummaryItem(item, language));
}

function guardCustomerAssistantOutput(
  text: string,
  language: KaelPromptLanguage,
  surface: CustomerAssistantSurface,
  topic: KaelTopic,
) {
  const initial = guardOutput({
    text,
    actor: "customer",
    language,
    surface,
    fallbackText: fallbackText(language, topic),
  });
  if (initial.reason !== "sentence_too_long") return initial;
  return guardOutput({
    text: reflowLongAssistantSentences(text),
    actor: "customer",
    language,
    surface,
    fallbackText: fallbackText(language, topic),
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
