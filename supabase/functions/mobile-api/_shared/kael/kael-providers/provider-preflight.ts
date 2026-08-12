import type { AIError, AIProvider, AIRequest, EdgeAiSecrets } from "../contracts/types.ts";
import { KAEL_CIRCUIT_BREAKER } from "./circuit-breaker.ts";
import { isDurableCircuitOpen } from "../kael-guardrails/durable-guards.ts";
import { KAEL_ROUTING_CONFIG } from "./routing.config.ts";
import {
  estimateModelRequestCostUsd,
  resolveModelPrice,
  runtimeUnknownModelPolicy,
} from "../kael-usage/model-pricing.ts";
import {
  isKaelAiKillSwitchEnabled,
  type KaelSpendGate,
  reserveAiSpend,
} from "../kael-guardrails/spend-gate.ts";
import {
  beginHarnessRun,
  recordHarnessEvent,
} from "../../../../_shared/harness/trace.ts";
import type { ReliabilityClient } from "../../../../_shared/harness/reliability.ts";
import {
  assertHarnessCapabilityEnabled,
  type HarnessKillSwitch,
  type HarnessPromotionClient,
} from "../../../../_shared/harness/promotion.ts";
import { emitKaelOpsAlert } from "../ops/alerts.ts";
export type PreparedAiProviderCall = {
  durableGuardsEnabled: boolean;
  pricingAt: Date;
  unknownModelPolicy: ReturnType<typeof runtimeUnknownModelPolicy>;
  apiKey: string;
  maxRetries: number;
  reservationId: number | null;
  estimatedCostPerAttemptUsd: number;
  providerAttemptId: string;
  environment: string;
  releaseId: string;
  reliabilityClient: ReliabilityClient | null;
};

export async function prepareAiProviderCall(
  request: AIRequest,
  secrets: EdgeAiSecrets,
  gate?: KaelSpendGate,
): Promise<PreparedAiProviderCall | AIError> {
  const providerAttemptId = crypto.randomUUID();
  const environment = secrets.harnessTrace?.environment ?? "local";
  await beginHarnessRun(secrets.harnessTrace, {
    routeKind: "kael.provider",
    capability: `kael.provider.${request.purpose ?? "unknown"}`,
    safeMetadata: {
      provider: request.provider,
      purpose: request.purpose ?? "unknown",
    },
  });
  const blocked = await providerCallBlocker(
    request,
    secrets,
    environment,
    providerAttemptId,
  );
  if (blocked) return blocked;

  const durableGuardsEnabled = secrets.durableGuardsEnabled === true;
  const reliabilityClient = (secrets.durableGuardClient ?? null) as unknown as ReliabilityClient | null;
  const pricingAt = new Date();
  const unknownModelPolicy = runtimeUnknownModelPolicy();
  const resolvedPrice = resolveModelPrice({
    provider: request.provider,
    model: request.model,
    at: pricingAt,
    unknownModelPolicy,
  });
  if (resolvedPrice.fallback) {
    console.warn("Unknown AI model price; using safe-high registry fallback", {
      provider: request.provider,
      model: request.model,
    });
  }

  const apiKey = providerKey(request.provider, secrets);
  if (!apiKey) {
    await recordHarnessEvent(secrets.harnessTrace, {
      eventId: providerAttemptId,
      eventClass: "provider.call",
      stage: request.purpose ?? "unknown",
      status: "blocked",
      provider: request.provider,
      model: request.model,
      errorCode: "KEY_MISSING",
    });
    return {
      success: false,
      provider: request.provider,
      code: "KEY_MISSING",
      error: "provider key missing",
    };
  }

  const maxRetries = boundedRetryCount(request.maxRetries);
  const spend = await reserveProviderSpend(
    request,
    secrets,
    gate,
    pricingAt,
    unknownModelPolicy,
    maxRetries,
    providerAttemptId,
  );
  if ("success" in spend) return spend;
  await recordHarnessEvent(secrets.harnessTrace, {
    eventId: providerAttemptId,
    eventClass: "provider.call",
    stage: request.purpose ?? "unknown",
    status: "started",
    provider: request.provider,
    model: request.model,
  });
  return {
    durableGuardsEnabled,
    pricingAt,
    unknownModelPolicy,
    apiKey,
    maxRetries,
    reservationId: spend.reservationId,
    estimatedCostPerAttemptUsd: spend.estimatedCostPerAttemptUsd,
    providerAttemptId,
    environment,
    releaseId: secrets.harnessTrace?.releaseId ?? "unreleased",
    reliabilityClient,
  };
}

async function providerCallBlocker(
  request: AIRequest,
  secrets: EdgeAiSecrets,
  environment: string,
  providerAttemptId: string,
): Promise<AIError | null> {
  const switches: HarnessKillSwitch[] = [
    "global_ai",
    `provider_${request.provider}` as HarnessKillSwitch,
    ...(request.purpose === "market_lookup" ? ["tool_market_lookup" as const] : []),
    ...(request.purpose === "vision_analysis" ? ["tool_vision" as const] : []),
  ];
  const killSwitch = await assertHarnessCapabilityEnabled(
    secrets.durableGuardClient as unknown as HarnessPromotionClient,
    { environment, switches },
  );
  if (!killSwitch.allowed || isKaelAiKillSwitchEnabled()) {
    console.warn("AI call blocked by KAEL_AI_KILL_SWITCH", {
      provider: request.provider,
      purpose: request.purpose,
    });
    void emitKaelOpsAlert({
      code: "kill_switch_block",
      severity: "critical",
      provider: request.provider,
      purpose: request.purpose,
    });
    await recordHarnessEvent(secrets.harnessTrace, {
      eventId: providerAttemptId,
      eventClass: "provider.call",
      stage: request.purpose ?? "unknown",
      status: "blocked",
      provider: request.provider,
      model: request.model,
      errorCode: "AI_DISABLED",
    });
    return {
      success: false,
      provider: request.provider,
      code: "AI_DISABLED",
      error: killSwitch.allowed ? "kill_switch" : killSwitch.reasonCode,
    };
  }

  const circuitOpen = request.purpose
    ? secrets.durableGuardsEnabled === true
      ? await isDurableCircuitOpen(
        secrets.durableGuardClient,
        request.purpose,
        request.provider,
      )
      : KAEL_CIRCUIT_BREAKER.isOpen(request.purpose, request.provider)
    : false;
  if (!circuitOpen) return null;
  console.warn("AI call blocked by open provider circuit", {
    provider: request.provider,
    purpose: request.purpose,
  });
  void emitKaelOpsAlert({
    code: "circuit_breaker_open",
    severity: "warning",
    provider: request.provider,
    purpose: request.purpose,
  });
  await recordHarnessEvent(secrets.harnessTrace, {
    eventId: providerAttemptId,
    eventClass: "provider.call",
    stage: request.purpose ?? "unknown",
    status: "blocked",
    provider: request.provider,
    model: request.model,
    errorCode: "OPEN_CIRCUIT",
  });
  return {
    success: false,
    provider: request.provider,
    code: "OPEN_CIRCUIT",
    error: "open_circuit",
  };
}

type ProviderSpendReservation = {
  reservationId: number | null;
  estimatedCostPerAttemptUsd: number;
};

async function reserveProviderSpend(
  request: AIRequest,
  secrets: EdgeAiSecrets,
  gate: KaelSpendGate | undefined,
  pricingAt: Date,
  unknownModelPolicy: ReturnType<typeof runtimeUnknownModelPolicy>,
  maxRetries: number,
  providerAttemptId: string,
): Promise<ProviderSpendReservation | AIError> {
  if (!gate) return { reservationId: null, estimatedCostPerAttemptUsd: 0 };
  const configuredEstimate = gate.estimatedCostUsd ??
    (request.purpose ? KAEL_ROUTING_CONFIG[request.purpose]?.costCeilingUsd ?? 0 : 0);
  const modelEstimate = estimateModelRequestCostUsd({
    provider: request.provider,
    model: request.model,
    messages: request.messages,
    maxTokens: request.maxTokens,
    searchContextSize: request.searchContextSize,
    at: pricingAt,
    unknownModelPolicy,
  });
  const estimatedCostPerAttemptUsd = Math.max(configuredEstimate, modelEstimate);
  const reservation = await reserveAiSpend(gate.client, {
    actorId: gate.actorId,
    estimatedCostUsd: estimatedCostPerAttemptUsd * (maxRetries + 1),
    purpose: request.purpose,
    failureMode: gate.failureMode,
    runId: secrets.harnessTrace?.runId,
    traceId: secrets.harnessTrace?.traceId,
    releaseId: secrets.harnessTrace?.releaseId,
    providerAttemptId,
  });
  if (reservation.allowed) {
    return {
      reservationId: reservation.reservationId,
      estimatedCostPerAttemptUsd,
    };
  }
  console.warn("AI call blocked by spend cap", {
    provider: request.provider,
    purpose: request.purpose,
    scope: reservation.scope,
  });
  void emitKaelOpsAlert({
    code: "spend_cap_reached",
    severity: "critical",
    provider: request.provider,
    purpose: request.purpose,
    scope: reservation.scope ?? undefined,
  });
  await recordHarnessEvent(secrets.harnessTrace, {
    eventId: providerAttemptId,
    eventClass: "provider.call",
    stage: request.purpose ?? "unknown",
    status: "blocked",
    provider: request.provider,
    model: request.model,
    errorCode: "SPEND_CAP",
    safeMetadata: { scope: reservation.scope ?? "spend_cap" },
  });
  return {
    success: false,
    provider: request.provider,
    code: "SPEND_CAP",
    error: reservation.scope ?? "spend_cap",
  };
}

function boundedRetryCount(value: number | undefined): number {
  if (value === undefined) return 2;
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), 2);
}

function providerKey(
  provider: AIProvider,
  secrets: EdgeAiSecrets,
): string | undefined {
  if (provider === "anthropic") return secrets.anthropicApiKey;
  if (provider === "perplexity") return secrets.perplexityApiKey;
  return secrets.deepseekApiKey;
}
