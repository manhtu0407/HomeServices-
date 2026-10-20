import type { CustomerAssistantAnswer } from "./customer-assistant.ts";
import type { CustomerAssistantBoundary } from "./customer-assistant-provider-output.ts";
import type { KaelTopic } from "../kael-guardrails/permission-gate.ts";
import type { BoundaryReason } from "../kael-guardrails/boundary-guard.ts";
import type { ServiceType } from "../contracts/types.ts";
import type { CustomerAssistantWorkflowResolution } from "./customer-assistant-workflow.ts";
import { normalizeActions, type CustomerAssistantSurface } from "./customer-assistant-policy.ts";
import type { KaelSafeTraceEvent } from "../learning/trace.ts";
import { normalizeKaelResponseBrand } from "../language/user-facing-copy.ts";

// Why a turn was declined or redirected, for operators. Codes and enums only, never message text.
export type CustomerAssistantDecision = {
  readonly stage: "prompt_injection" | "unsafe_request" | "permission_gate" | "boundary_guard" | "clarification_required";
  readonly topic: KaelTopic;
  readonly service_resolved: ServiceType | null;
  readonly reason_code?: string;
  readonly topic_source?: "deterministic_rule" | "llm";
  readonly boundary_reason?: BoundaryReason;
};

export function buildFallbackCustomerAssistantAnswer(
  answer: string,
  topic: KaelTopic,
  boundary: CustomerAssistantBoundary,
  fallbackUsed: boolean,
  safetyNotes: readonly string[],
  trace?: readonly KaelSafeTraceEvent[],
  decision?: CustomerAssistantDecision,
): CustomerAssistantAnswer {
  return {
    answer: normalizeKaelResponseBrand(answer),
    safety_notes: safetyNotes,
    citations: ["NestScout platform scope"],
    suggested_actions: normalizeActions([], "customer_normal", topic),
    boundary,
    fallback_used: fallbackUsed,
    ...(trace && trace.length > 0 ? { trace } : {}),
    ...(decision ? { decision } : {}),
  };
}

export function buildCustomerWorkflowAssistantAnswer(
  workflowAnswer: CustomerAssistantWorkflowResolution,
  surface: CustomerAssistantSurface,
  topic: KaelTopic,
  safetyNotes: readonly string[],
): CustomerAssistantAnswer {
  return {
    answer: normalizeKaelResponseBrand(workflowAnswer.answer),
    safety_notes: safetyNotes,
    citations: ["NestScout platform scope"],
    suggested_actions: normalizeActions(workflowAnswer.suggestedActions, surface, topic),
    boundary: "answered",
    fallback_used: false,
  };
}
