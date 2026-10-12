import { z } from "zod";
import { sanitizeForLLM } from "../../../../_shared/domain.ts";
import {
  KAEL_TURN_INTENTS,
  kaelTurnIntentSchema,
  type EdgeKaelTurnIntent,
} from "../../../../_shared/contracts/kael-next-actions.ts";
import type { AIRequest, EdgeAiSecrets } from "../contracts/types.ts";
import { createRuntimeKaelSpendGate } from "../kael-guardrails/spend-gate.ts";
import { evaluateKaelPermissionGate } from "../kael-guardrails/permission-gate.ts";
import { circuitAwareProviderCandidatesForPurpose } from "../kael-providers/routing.ts";
import { maxTokensForPurpose } from "../kael-providers/routing.config.ts";
import { callStructuredAI, type StructuredAIInvoker } from "../kael-providers/structured-call.ts";
import { buildKaelSystemPrompt } from "../prompts/system-prompt.ts";
import { scrubSensitiveForLLM } from "../pipeline/utils.ts";
import type { DbClient } from "../../platform/db.ts";

// Below this the router keeps today's behaviour and treats the turn as new case information.
export const CASE_TURN_INTENT_MIN_CONFIDENCE = 0.6;

const intentOutputSchema = z.object({
  intent: kaelTurnIntentSchema,
  confidence: z.number().min(0).max(1),
}).strict();

export type CaseTurnIntentState = {
  readonly casePhase: string | null;
  readonly quoteReadiness: string | null;
  readonly missingFacts: readonly string[];
  readonly hasEstimate: boolean;
  readonly quoteMode: string | null;
};

export type CaseTurnIntentResult = {
  readonly intent: EdgeKaelTurnIntent;
  readonly confidence: number;
  readonly fallbackUsed: boolean;
};

const FALLBACK: CaseTurnIntentResult = {
  intent: "provide_information",
  confidence: 0,
  fallbackUsed: true,
};

const INTENT_GUIDE = {
  provide_information: "adds or answers details about the problem, item, size, location, time or photo",
  ask_question: "asks why, how, what happens next, or about Kael/NestScout, without adding case details",
  request_reference_price: "asks for an indicative, reference or rough price, or how much it usually costs",
  request_worker_quote: "asks to send the request to workers so a worker can quote or inspect",
  proceed_or_confirm: "says go ahead, book, agree or confirm",
  correction: "says earlier information was wrong and gives the corrected value",
  request_human_or_complaint: "complains, is frustrated, or asks for a human or support",
  off_topic_or_smalltalk: "greets, thanks, jokes, or talks about something unrelated to this case",
} satisfies Record<EdgeKaelTurnIntent, string>;

export async function classifyCaseTurnIntent(input: {
  actorId: string;
  hasLinkedJob: boolean;
  language: "vi" | "en";
  message: string;
  recentTurns: readonly { role: string; text: string | null }[];
  state: CaseTurnIntentState;
  client: DbClient;
  secrets: EdgeAiSecrets;
  invoke?: StructuredAIInvoker;
}): Promise<CaseTurnIntentResult> {
  const message = scrubSensitiveForLLM(sanitizeForLLM(input.message)).slice(0, 1_000);
  if (!message.trim()) return FALLBACK;
  const permission = evaluateKaelPermissionGate({
    purpose: "case_turn_intent",
    actor: "customer",
    jobRelation: input.hasLinkedJob ? "own_customer_job" : "none",
    action: "classify_intent",
    topic: "app_usage_help",
    intentConfidence: 1,
    topicSource: "deterministic_rule",
    boundarySignal: false,
  });
  if (!permission.allowed) return FALLBACK;

  const route = circuitAwareProviderCandidatesForPurpose("case_turn_intent")[0];
  if (!route || route.provider !== "deepseek") return FALLBACK;

  const transcript = input.recentTurns
    .filter((turn) => turn.text?.trim())
    .slice(-6)
    .map((turn) => ({
      role: turn.role === "customer" ? "customer" : "kael",
      text: scrubSensitiveForLLM(sanitizeForLLM(turn.text ?? "")).slice(0, 600),
    }));
  const request: AIRequest = {
    purpose: "case_turn_intent",
    provider: route.provider,
    model: route.model,
    maxTokens: maxTokensForPurpose("case_turn_intent", 200),
    temperature: 0,
    timeoutMs: Math.min(route.latencyBudgetMs, 6_000),
    maxRetries: 0,
    messages: [
      {
        role: "system",
        content: buildKaelSystemPrompt({
          purpose: "case_turn_intent",
          actor: "customer",
          language: input.language,
          permissionSummary: "Classify only. Never answer the customer, never quote a price, never trigger a workflow action.",
          contextSummary: `Return strict JSON {"intent": one of ${KAEL_TURN_INTENTS.join(", ")}, "confidence": 0..1}. ` +
            `Intent meanings: ${JSON.stringify(INTENT_GUIDE)}. The latest customer message decides the intent; earlier turns only give context.`,
        }),
      },
      {
        role: "user",
        content: JSON.stringify({
          case_state: {
            case_phase: input.state.casePhase,
            quote_readiness: input.state.quoteReadiness,
            missing_facts: input.state.missingFacts.slice(0, 6),
            has_estimate: input.state.hasEstimate,
            quote_mode: input.state.quoteMode,
          },
          recent_turns: transcript,
          latest_customer_message: message,
        }).slice(0, 8_000),
      },
    ],
  };
  const result = await callStructuredAI(
    request,
    intentOutputSchema,
    input.secrets,
    {
      ...createRuntimeKaelSpendGate(input.client, input.actorId, input.secrets.harnessTrace),
      estimatedCostUsd: route.costCeilingUsd,
    },
    input.invoke,
  ).catch((error) => {
    console.warn("case turn intent unavailable", {
      purpose: request.purpose,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  });
  if (!result?.success) {
    if (result) {
      console.warn("case turn intent unavailable", { purpose: request.purpose, code: result.code });
    }
    return FALLBACK;
  }
  if (result.data.confidence < CASE_TURN_INTENT_MIN_CONFIDENCE) {
    return { intent: "provide_information", confidence: result.data.confidence, fallbackUsed: true };
  }
  return { intent: result.data.intent, confidence: result.data.confidence, fallbackUsed: false };
}
