import { buildKaelTurnTrace, logKaelTurnTrace, type KaelTurnTraceIdentity, type KaelTurnTraceInput } from "../../platform/turn-trace.ts";
import type { CustomerAssistantAnswer } from "./customer-assistant.ts";
import { classifyAssistantTopic, type CustomerAssistantSurface } from "./customer-assistant-policy.ts";
import type { ServiceType } from "../contracts/types.ts";

const SERVICE_CODES: readonly string[] = ["electrical", "plumbing", "cleaning", "hvac", "upholstery", "handyman"];

// Re-classifies the same message with the case's canonical service supplied. A refusal that
// disappears here was caused by missing service context; one that survives is a real unsupported
// request. Pure and deterministic: no provider call, and only the resulting topic code is kept.
function replayTopicWithCanonicalService(
  message: string,
  canonicalService: unknown,
  surface: CustomerAssistantSurface,
): string | undefined {
  if (typeof canonicalService !== "string" || !SERVICE_CODES.includes(canonicalService)) return undefined;
  return classifyAssistantTopic(message.slice(0, 2_000), canonicalService as ServiceType, surface);
}

export function assistantTraceFields(
  answer: Pick<CustomerAssistantAnswer, "boundary" | "fallback_used" | "decision">,
  context: { message: string; canonicalService: unknown; surface: CustomerAssistantSurface },
): Omit<KaelTurnTraceInput, "identity" | "route"> {
  const decision = answer.decision;
  // A decline with no deterministic decision behind it is the model's own scope verdict.
  return {
    stage: decision?.stage ?? (answer.boundary === "unsupported" ? "provider_output" : "answered"),
    outcome: answer.boundary,
    fallbackUsed: answer.fallback_used,
    canonicalService: context.canonicalService,
    ...(decision ? { assistantService: decision.service_resolved } : {}),
    permissionReason: decision?.reason_code,
    permissionTopic: decision?.topic,
    topicSource: decision?.topic_source,
    boundaryReason: decision?.boundary_reason,
    replayTopic: decision?.topic === "out_of_scope_services_anything"
      ? replayTopicWithCanonicalService(context.message, context.canonicalService, context.surface)
      : undefined,
  };
}

// Tracing is observability only. It must never be the reason a customer's turn fails, so any
// failure to read the identity or build the trace degrades to "no trace".
export function traceAssistantTurn(
  route: "assistant_case" | "assistant_normal",
  identity: KaelTurnTraceIdentity,
  answer: Pick<CustomerAssistantAnswer, "boundary" | "fallback_used" | "decision">,
  context: { message: string; canonicalService: unknown; surface: CustomerAssistantSurface },
): void {
  try {
    logKaelTurnTrace(buildKaelTurnTrace({ identity, route, ...assistantTraceFields(answer, context) }));
  } catch {
    return;
  }
}
