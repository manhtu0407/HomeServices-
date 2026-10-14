// Words a reply whose content the server has already decided. The canned text is the contract: it is what
// the customer reads when the model is unavailable, slow, or says anything the guard or the checks below
// reject. The model may reword and show it read the customer; it may not add a fact, number or promise.

import { z } from "zod";
import { sanitizeForLLM } from "../../../../_shared/domain.ts";
import type { AIRequest, EdgeAiSecrets } from "../../kael/contracts/types.ts";
import { guardOutput } from "../../kael/kael-guardrails/output-gateway.ts";
import { regenerateOnce } from "../../kael/kael-guardrails/guided-regeneration.ts";
import { evaluateKaelPermissionGate } from "../../kael/kael-guardrails/permission-gate.ts";
import { createRuntimeKaelSpendGate } from "../../kael/kael-guardrails/spend-gate.ts";
import { maxTokensForPurpose } from "../../kael/kael-providers/routing.config.ts";
import { circuitAwareProviderCandidatesForPurpose } from "../../kael/kael-providers/routing.ts";
import { callStructuredAI, type StructuredAIInvoker } from "../../kael/kael-providers/structured-call.ts";
import { buildKaelSystemPrompt } from "../../kael/prompts/system-prompt.ts";
import { scrubSensitiveForLLM } from "../../kael/pipeline/utils.ts";
import type { DbClient } from "../../platform/db.ts";
import type { KaelReplySource, KaelTurnTelemetry } from "./session-store.ts";

export type ReplyKind = "ask_detail" | "explain_detail" | "accept_unknown" | "notice";

export type ReplyFacts = Readonly<Record<string, string | number | boolean | null>>;

export type ComposedReply = { readonly text: string; readonly telemetry: KaelTurnTelemetry };

export type ReplyComposer = (request: {
  readonly kind: ReplyKind;
  readonly canonical: string;
  readonly facts?: ReplyFacts;
  // What the customer just wrote, so the reply can show it was read.
  readonly customerSaid?: string;
  // Words the reply must still contain, such as the instruction to press the confirm button.
  readonly mustKeep?: readonly string[];
}) => Promise<ComposedReply>;

const MAX_COMPOSE_MS = 4_000;

const composedSchema = z.object({ text: z.string().trim().min(8).max(600) }).strict();

const COMPOSE_RULES = [
  "You only reword a reply whose content is already decided; 'canonical' is that content.",
  "Keep every fact and instruction in canonical and facts. Add no price, number, promise, guarantee, step, name or link.",
  "Use the customer's own words from customer_said to show you read it, but never repeat personal details.",
  "Ask at most one question, and only when canonical asks one. Natural, warm, plain wording; no greeting, no sign-off.",
  'Return only JSON {"text": "..."}.',
].join(" ");

const KIND_GUIDE: Record<ReplyKind, string> = {
  ask_detail: "Ask for the one detail in canonical, saying briefly why it helps.",
  explain_detail: "Explain why the detail in canonical is needed, then ask for it once.",
  accept_unknown: "Reassure the customer that not knowing is fine and that the detail will be checked on site.",
  notice: "State what canonical says in one or two sentences.",
};

export const canonicalReplyComposer: ReplyComposer = async ({ canonical }) => ({
  text: canonical,
  telemetry: { replySource: "template" },
});

function composerEnabled(): boolean {
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  const value = deno?.env?.get?.("KAEL_REPLY_COMPOSER_DISABLED");
  return !(typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()));
}

export function createReplyComposer(deps: {
  readonly client: DbClient;
  readonly actorId: string;
  readonly secrets: EdgeAiSecrets;
  readonly language: "vi" | "en";
  readonly invoke?: StructuredAIInvoker;
}): ReplyComposer {
  return async (request) => {
    const fallback = { text: request.canonical, telemetry: { replySource: "fallback" as KaelReplySource } };
    if (!composerEnabled()) return { text: request.canonical, telemetry: { replySource: "template" } };
    try {
      return await compose(deps, request) ?? fallback;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      console.warn("kael reply composer unavailable", {
        kind: request.kind,
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return fallback;
    }
  };
}

async function compose(
  deps: Parameters<typeof createReplyComposer>[0],
  request: Parameters<ReplyComposer>[0],
): Promise<ComposedReply | null> {
  const permission = evaluateKaelPermissionGate({
    purpose: "educational_response",
    actor: "customer",
    jobRelation: "none",
    action: "generate_advisory",
    topic: "app_usage_help",
    intentConfidence: 1,
    topicSource: "deterministic_rule",
    boundarySignal: false,
  });
  if (!permission.allowed) return null;
  const route = circuitAwareProviderCandidatesForPurpose("educational_response", {
    routeProfile: "simple_normal_chat",
  })[0];
  if (!route) return null;

  const customerSaid = request.customerSaid
    ? scrubSensitiveForLLM(sanitizeForLLM(request.customerSaid)).slice(0, 400)
    : null;
  const aiRequest: AIRequest = {
    purpose: "educational_response",
    provider: route.provider,
    model: route.model,
    maxTokens: maxTokensForPurpose("educational_response", 320),
    temperature: 0.4,
    timeoutMs: Math.min(route.latencyBudgetMs, MAX_COMPOSE_MS),
    maxRetries: 0,
    messages: [
      {
        role: "system",
        content: buildKaelSystemPrompt({
          purpose: "educational_response",
          actor: "customer",
          language: deps.language,
          permissionSummary: COMPOSE_RULES,
          contextSummary: KIND_GUIDE[request.kind],
        }),
      },
      {
        role: "user",
        content: JSON.stringify({
          canonical: request.canonical,
          facts: request.facts ?? {},
          customer_said: customerSaid,
        }).slice(0, 4_000),
      },
    ],
  };
  const spendGate = {
    ...createRuntimeKaelSpendGate(deps.client, deps.actorId, deps.secrets.harnessTrace),
    estimatedCostUsd: route.costCeilingUsd,
  };
  const allowedNumbers = numbersIn(`${request.canonical} ${JSON.stringify(request.facts ?? {})}`);
  const guard = (text: string) => {
    const checked = guardOutput({
      text,
      actor: "customer",
      language: deps.language,
      surface: "kael_reply_composer",
      fallbackText: request.canonical,
    });
    return checked.allowed && !checked.used_fallback && acceptable(checked.text, request, allowedNumbers)
      ? checked
      : { ...checked, allowed: false, used_fallback: true };
  };
  const ask = async (hint?: string) => {
    const result = await callStructuredAI(
      hint
        ? {
          ...aiRequest,
          messages: [
            aiRequest.messages[0],
            { role: "user", content: `${aiRequest.messages[1].content}\n\nReviewer note on your previous attempt: ${hint}` },
          ],
        }
        : aiRequest,
      composedSchema,
      deps.secrets,
      spendGate,
      deps.invoke,
    );
    if (!result.success) {
      if (result.code === "REQUEST_CANCELLED") {
        const cancellation = new Error("Kael reply composition was cancelled");
        cancellation.name = "AbortError";
        throw cancellation;
      }
      return null;
    }
    return { text: result.data.text, latencyMs: result.latencyMs, costUsd: result.usage.costUsd };
  };

  const first = await ask();
  if (!first) return null;
  let checked = guard(first.text);
  let source: KaelReplySource = "ai";
  let latencyMs = first.latencyMs;
  let costUsd = first.costUsd;
  if (!checked.allowed || checked.used_fallback) {
    const retry = await regenerateOnce({
      failure: { reason: checked.reason ?? "semantic_guardrail", guardrailLabel: checked.trip?.guardrailLabel },
      language: deps.language,
      rewrite: async (hint) => {
        const next = await ask(hint);
        if (!next) return null;
        latencyMs += next.latencyMs;
        costUsd += next.costUsd;
        return next.text;
      },
      guard,
    });
    if (!retry) return null;
    checked = retry;
    source = "guard_regenerated";
  }
  return {
    text: checked.text,
    telemetry: { replySource: source, provider: route.provider, model: route.model, latencyMs, costUsd },
  };
}

const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g;

function numbersIn(text: string): Set<string> {
  return new Set(text.match(NUMBER_PATTERN) ?? []);
}

// A reworded reply keeps the facts it was given: no new number, no extra question, no link.
function acceptable(text: string, request: Parameters<ReplyComposer>[0], allowedNumbers: Set<string>): boolean {
  if ([...numbersIn(text)].some((value) => !allowedNumbers.has(value))) return false;
  if (/https?:\/\/|www\.|@\w/i.test(text)) return false;
  const lowered = text.toLowerCase();
  if ((request.mustKeep ?? []).some((phrase) => !lowered.includes(phrase.toLowerCase()))) return false;
  const questions = (text.match(/\?/g) ?? []).length;
  const allowedQuestions = (request.canonical.match(/\?/g) ?? []).length;
  return questions <= Math.max(allowedQuestions, request.kind === "ask_detail" || request.kind === "explain_detail" ? 1 : 0);
}
