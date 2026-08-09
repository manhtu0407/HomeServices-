import { z } from "zod";
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
export type {
  CustomerAssistantJobContext,
  CustomerAssistantSurface,
} from "./customer-assistant-policy.ts";

type AssistantClient = Parameters<typeof retrieveKaelKnowledgeContextIfEnabled>[0];

export type CustomerAssistantInput = {
  readonly actorId?: string | null;
  readonly message: string;
  readonly language?: KaelPromptLanguage;
  readonly serviceType?: ServiceType | null;
  readonly surface?: CustomerAssistantSurface;
  readonly job?: CustomerAssistantJobContext | null;
  readonly client?: AssistantClient | null;
  readonly memorySummary?: string | null;
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
  const serviceType = input.serviceType ?? inferAssistantServiceType(cleanQuestion, input.job);
  const topic = classifyAssistantTopic(cleanQuestion, serviceType);
  const boundary = evaluateMessageBoundary(cleanQuestion, serviceType, {
    semanticInjectionClassifierEnabled: true,
    language,
  });
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

  const boundedLifecycleAnswer = resolveBoundedServiceLifecycleAnswer(
    topic,
    cleanQuestion,
    language,
  );
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
  if (workflowAnswer) {
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

  const routes = circuitAwareProviderCandidatesForPurpose("educational_response", {
    routeProfile: surface === "customer_normal" && isSimpleNormalChatMessage(cleanQuestion)
      ? "simple_normal_chat"
      : "standard",
  });
  if (routes.length === 0) {
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
  const spendGate = createRuntimeKaelSpendGate(
    input.client as SpendGateClient,
    input.actorId ?? null,
    input.secrets.harnessTrace,
  );
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
        memorySummary: input.memorySummary ?? null,
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
            topic,
          );
          if (checked.allowed && !checked.used_fallback) {
            return {
              answer: normalizeKaelResponseBrand(checked.text),
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
      topic,
    );
    if (checked.used_fallback || !checked.allowed) {
      await auditCustomerAssistantGuardTrip(input, surface, route, checked);
      trace.push(buildCustomerAssistantProviderTrace(surface, route, "error", {
        code: checked.reason ?? "SELF_CHECK_FALLBACK",
        latencyMs: result.latencyMs,
        costUsd: result.usage.costUsd,
        fallbackUsed: true,
      }));
      return buildFallbackCustomerAssistantAnswer(
        checked.text,
        topic,
        "fallback",
        true,
        deterministicSafetyNotes(language, topic),
        trace,
      );
    }

    trace.push(buildCustomerAssistantProviderTrace(surface, route, "success", {
      latencyMs: result.latencyMs,
      costUsd: result.usage.costUsd,
      fallbackUsed: false,
    }));
    return {
      answer: normalizeKaelResponseBrand(checked.text),
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

  return buildFallbackCustomerAssistantAnswer(
    fallbackText(language, topic),
    topic,
    "fallback",
    true,
    deterministicSafetyNotes(language, topic),
    trace,
  );
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

