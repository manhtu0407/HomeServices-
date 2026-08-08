import {
  KAEL_ROUTING_CONFIG,
  type ProviderRoute,
} from "../kael-providers/routing.config.ts";
import type { AIProvider, KaelPurpose } from "../contracts/types.ts";
import { emitKaelOpsAlert } from "../ops/alerts.ts";

export type KaelEscalationReason =
  | "low_confidence"
  | "high_stakes"
  | "hard_vision";

export type KaelEscalation = {
  readonly route: ProviderRoute;
  readonly reason: KaelEscalationReason;
};

export function selectKaelEscalation(
  purpose: KaelPurpose,
  input: {
    readonly provider: AIProvider;
    readonly model: string;
    readonly confidence?: number | null;
    readonly highStakes?: boolean;
    readonly hardVision?: boolean;
  },
): KaelEscalation | null {
  const config = KAEL_ROUTING_CONFIG[purpose];
  const escalation = config.escalation;
  if (!escalation || !isPrimaryRoute(config.primary, input)) return null;

  if (input.highStakes === true && config.escalationTrigger.highStakes === true) {
    return { route: escalation, reason: "high_stakes" };
  }
  if (
    typeof input.confidence === "number" &&
    typeof config.escalationTrigger.minConfidence === "number" &&
    input.confidence < config.escalationTrigger.minConfidence
  ) {
    return { route: escalation, reason: "low_confidence" };
  }
  if (purpose === "vision_analysis" && input.hardVision === true) {
    return { route: escalation, reason: "hard_vision" };
  }
  return null;
}

export function logKaelEscalation(
  purpose: KaelPurpose,
  escalation: KaelEscalation,
): void {
  console.info("Kael model escalation", {
    purpose,
    provider: escalation.route.provider,
    model: escalation.route.model,
    reason: escalation.reason,
  });
  void emitKaelOpsAlert({
    code: "model_escalation",
    severity: escalation.reason === "high_stakes" ? "warning" : "info",
    provider: escalation.route.provider,
    purpose,
    reason: escalation.reason,
  });
}

function isPrimaryRoute(
  primary: ProviderRoute,
  input: { provider: AIProvider; model: string },
): boolean {
  return primary.provider === input.provider && primary.model === input.model;
}
