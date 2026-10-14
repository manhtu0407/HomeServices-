import type { z } from "zod";
import type { AIRequest, EdgeAiSecrets } from "../contracts/types.ts";
import { guardOutput } from "../kael-guardrails/output-gateway.ts";
import { regenerateOnce } from "../kael-guardrails/guided-regeneration.ts";
import {
  auditKaelGuardrailTrip,
  type KaelGuardrailTripClient,
} from "../kael-guardrails/self-check.ts";
import type { KaelTopic } from "../kael-guardrails/permission-gate.ts";
import type { KaelSpendGate } from "../kael-guardrails/spend-gate.ts";
import type { ProviderChoice } from "../kael-providers/routing.ts";
import { callStructuredAI, type StructuredAIInvoker } from "../kael-providers/structured-call.ts";
import type { KaelPromptLanguage } from "../prompts/system-prompt.ts";
import { fallbackText } from "./customer-assistant-copy.ts";
import type { CustomerAssistantSurface } from "./customer-assistant-policy.ts";
import { reflowLongAssistantSentences } from "./customer-assistant-support.ts";

type GuardedAnswer = ReturnType<typeof guardOutput>;

export function guardCustomerAssistantOutput(
  text: string,
  language: KaelPromptLanguage,
  surface: CustomerAssistantSurface,
  topic: KaelTopic,
): GuardedAnswer {
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

/**
 * Guards a finished answer; when the guard rejects it, asks the model for one guided rewrite before
 * the canned text is used.
 */
export async function guardCustomerAssistantAnswer(input: {
  readonly text: string;
  readonly language: KaelPromptLanguage;
  readonly surface: CustomerAssistantSurface;
  readonly topic: KaelTopic;
  readonly rewrite?: (hint: string) => Promise<string | null>;
}): Promise<{ readonly checked: GuardedAnswer; readonly regenerated: boolean; readonly firstTrip?: GuardedAnswer }> {
  const first = guardCustomerAssistantOutput(input.text, input.language, input.surface, input.topic);
  if (!input.rewrite || (first.allowed && !first.used_fallback)) {
    return { checked: first, regenerated: false };
  }
  const retry = await regenerateOnce({
    failure: { reason: first.reason, guardrailLabel: first.trip?.guardrailLabel },
    language: input.language,
    rewrite: input.rewrite,
    guard: (text) => guardCustomerAssistantOutput(text, input.language, input.surface, input.topic),
  });
  return retry ? { checked: retry, regenerated: true, firstTrip: first } : { checked: first, regenerated: false };
}

/**
 * Calls the same provider route again with the guard's complaint appended to the user prompt.
 * Image requests carry structured content and are never retried.
 */
export async function rewriteAssistantAnswer(input: {
  readonly request: AIRequest;
  readonly schema: z.ZodType<{ answer: string }>;
  readonly secrets: EdgeAiSecrets;
  readonly spendGate: KaelSpendGate;
  readonly callAI?: StructuredAIInvoker;
  readonly hint: string;
}): Promise<string | null> {
  const last = input.request.messages.at(-1);
  if (!last || typeof last.content !== "string") return null;
  const result = await callStructuredAI(
    {
      ...input.request,
      maxRetries: 0,
      messages: [
        ...input.request.messages.slice(0, -1),
        { ...last, content: `${last.content}\n\nReviewer note on your previous attempt: ${input.hint}` },
      ],
    },
    input.schema,
    input.secrets,
    input.spendGate,
    input.callAI,
  );
  if (!result.success) {
    if (result.code === "REQUEST_CANCELLED") {
      const cancellation = new Error("Customer Kael response was cancelled");
      cancellation.name = "AbortError";
      throw cancellation;
    }
    return null;
  }
  return result.data.answer;
}

export async function auditCustomerAssistantGuardTrip(
  input: {
    readonly client?: unknown;
    readonly actorId?: string | null;
    readonly job?: { readonly id: string } | null;
  },
  surface: CustomerAssistantSurface,
  route: ProviderChoice,
  checked: GuardedAnswer,
  regenerated = false,
) {
  if (!input.client || !checked.trip) return;
  await auditKaelGuardrailTrip(
    input.client as KaelGuardrailTripClient,
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
        ...(regenerated ? { regenerated: true } : {}),
      },
    },
  );
}
