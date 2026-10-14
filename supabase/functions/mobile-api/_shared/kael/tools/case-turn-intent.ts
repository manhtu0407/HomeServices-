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

export type CaseSlotAnswerKind = "answered" | "unknown" | "asks_why" | "other";

const slotAnswerSchema = z.object({
  kind: z.enum(["answered", "unknown", "asks_why", "other"]),
  slot: z.string().max(80).nullable().optional(),
  value: z.string().max(200).nullable().optional(),
  confidence: z.number().min(0).max(1),
}).strict();

const intentOutputSchema = z.object({
  intent: kaelTurnIntentSchema,
  confidence: z.number().min(0).max(1),
  pending_slot_answer: slotAnswerSchema.nullable().optional(),
  answered_slots: z.array(z.object({
    slot: z.string().min(1).max(80),
    value: z.string().min(1).max(200),
  }).strict()).max(4).optional(),
}).strict();

// How the customer's reply relates to the question Kael is waiting on.
export type CaseSlotUnderstanding = {
  readonly kind: CaseSlotAnswerKind;
  readonly slot: string | null;
  readonly value: string | null;
  readonly answeredSlots: readonly { readonly slot: string; readonly value: string }[];
};

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
  readonly slotUnderstanding?: CaseSlotUnderstanding;
  readonly telemetry?: {
    readonly provider: "deepseek";
    readonly model: string;
    readonly latencyMs: number;
    readonly costUsd: number;
  };
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
  // The detail Kael last asked for; set only while a question is waiting for an answer.
  pendingSlot?: { readonly slot: string; readonly question: string | null } | null;
  // Other details still missing, so one message can answer several.
  openSlots?: readonly string[];
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
    maxTokens: maxTokensForPurpose("case_turn_intent", 400),
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
          contextSummary: `Return strict JSON {"intent": one of ${KAEL_TURN_INTENTS.join(", ")}, "confidence": 0..1${
            input.pendingSlot ? ', "pending_slot_answer": {...}, "answered_slots": [...]' : ""
          }}. ` +
            `Intent meanings: ${JSON.stringify(INTENT_GUIDE)}. The latest customer message decides the intent; earlier turns only give context.` +
            (input.pendingSlot ? SLOT_ANSWER_GUIDE : ""),
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
          ...(input.pendingSlot
            ? {
              pending_slot: input.pendingSlot.slot,
              pending_question: input.pendingSlot.question?.slice(0, 300) ?? null,
              open_slots: (input.openSlots ?? []).slice(0, 8),
            }
            : {}),
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
  const slotUnderstanding = input.pendingSlot
    ? understandSlotAnswer(result.data, input.pendingSlot.slot, input.openSlots ?? [])
    : undefined;
  const telemetry = {
    provider: "deepseek" as const,
    model: route.model,
    latencyMs: result.latencyMs,
    costUsd: result.usage.costUsd,
  };
  if (result.data.confidence < CASE_TURN_INTENT_MIN_CONFIDENCE) {
    return { intent: "provide_information", confidence: result.data.confidence, fallbackUsed: true, slotUnderstanding, telemetry };
  }
  return { intent: result.data.intent, confidence: result.data.confidence, fallbackUsed: false, slotUnderstanding, telemetry };
}

const SLOT_ANSWER_GUIDE = " pending_slot is the detail Kael just asked about (pending_question). " +
  "pending_slot_answer = {kind, slot, value, confidence}: kind answered = the message gives that detail, " +
  "and value is the customer's own words for it (200 characters at most, no invented facts); " +
  "unknown = the customer says they do not know or cannot tell; asks_why = they ask why it is needed or what it means; " +
  "other = the message does not address it. answered_slots lists any other open_slots the message also answers, " +
  "each with the customer's own words as value. Use only slot names from pending_slot and open_slots.";

export const CASE_SLOT_ANSWER_MIN_CONFIDENCE = 0.6;

function understandSlotAnswer(
  data: z.infer<typeof intentOutputSchema>,
  pendingSlot: string,
  openSlots: readonly string[],
): CaseSlotUnderstanding | undefined {
  const answer = data.pending_slot_answer;
  if (!answer || answer.confidence < CASE_SLOT_ANSWER_MIN_CONFIDENCE) return undefined;
  const allowed = new Set([pendingSlot, ...openSlots]);
  const answeredSlots = (data.answered_slots ?? []).filter((item) =>
    item.slot !== pendingSlot && allowed.has(item.slot)
  );
  const value = answer.value?.trim() || null;
  return {
    kind: answer.kind === "answered" && !value ? "other" : answer.kind,
    slot: pendingSlot,
    value,
    answeredSlots,
  };
}
