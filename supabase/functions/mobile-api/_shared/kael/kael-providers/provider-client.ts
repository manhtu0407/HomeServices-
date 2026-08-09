import type { AIProvider, AIRequest, AIResponse, AIError, EdgeAiSecrets } from "../contracts/types.ts";
import { KAEL_CIRCUIT_BREAKER } from "./circuit-breaker.ts";
import {
  isDurableCircuitOpen,
  recordDurableCircuitFailure,
  recordDurableCircuitSuccess,
} from "../kael-guardrails/durable-guards.ts";
import { KAEL_ROUTING_CONFIG } from "./routing.config.ts";
import {
  estimateModelRequestCostUsd,
  resolveModelPrice,
  runtimeUnknownModelPolicy,
} from "../kael-usage/model-pricing.ts";
import { providerAdapterFor } from "./provider-adapter.ts";
import {
  finalizeAiSpend,
  isKaelAiKillSwitchEnabled,
  type KaelSpendGate,
  reserveAiSpend,
} from "../kael-guardrails/spend-gate.ts";
import { readResponseTextBounded } from "../../../../_shared/network.ts";
import {
  beginHarnessRun,
  recordHarnessEvent,
} from "../../../../_shared/harness/trace.ts";
import {
  acquireDependencyPermit,
  recordDependencyResult,
  type ReliabilityClient,
} from "../../../../_shared/harness/reliability.ts";
import {
  assertHarnessCapabilityEnabled,
  type HarnessKillSwitch,
  type HarnessPromotionClient,
} from "../../../../_shared/harness/promotion.ts";
import { emitKaelOpsAlert } from "../ops/alerts.ts";

const AI_PROVIDER_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type CallAIOptions = {
  readonly deferCircuitSuccess?: boolean;
};

export async function callAI(
  request: AIRequest,
  secrets: EdgeAiSecrets,
  gate?: KaelSpendGate,
  options: CallAIOptions = {},
): Promise<AIResponse | AIError> {
  const prepared = await prepareAiProviderCall(request, secrets, gate);
  if ("success" in prepared) return prepared;
  return executePreparedAiProviderCall(request, secrets, gate, options, prepared);
}

type PreparedAiProviderCall = {
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

async function prepareAiProviderCall(
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

type ProviderAttemptContext = {
  request: AIRequest;
  secrets: EdgeAiSecrets;
  gate?: KaelSpendGate;
  options: CallAIOptions;
  prepared: PreparedAiProviderCall;
  timeout: number;
  permit: Awaited<ReturnType<typeof acquireDependencyPermit>>;
};
type ProviderAttemptOutcome =
  | { attemptNumber: number; response: AIResponse }
  | { attemptNumber: number; error: unknown };
type ProviderAttemptSummary =
  | { response: AIResponse }
  | { lastError: unknown; attemptsStarted: number };

async function executePreparedAiProviderCall(
  request: AIRequest,
  secrets: EdgeAiSecrets,
  gate: KaelSpendGate | undefined,
  options: CallAIOptions,
  prepared: PreparedAiProviderCall,
): Promise<AIResponse | AIError> {
  const timeout = request.timeoutMs ?? (request.provider === "anthropic"
    ? 20_000
    : request.provider === "perplexity"
    ? 15_000
    : 10_000);
  const permit = await acquireDependencyPermit(prepared.reliabilityClient, {
    dependency: request.provider,
    environment: prepared.environment,
  });
  if (!permit.allowed) {
    void emitKaelOpsAlert({
      code: "circuit_breaker_open",
      severity: "warning",
      provider: request.provider,
      purpose: request.purpose,
    });
    await recordHarnessEvent(secrets.harnessTrace, {
      eventId: prepared.providerAttemptId,
      eventClass: "provider.call",
      stage: request.purpose ?? "unknown",
      status: "blocked",
      provider: request.provider,
      model: request.model,
      errorCode: "OPEN_CIRCUIT",
      safeMetadata: {
        circuit_state: permit.state,
        retry_after_ms: permit.retryAfterMs,
      },
    });
    if (gate) {
      await finalizeAiSpend(gate.client, {
        reservationId: prepared.reservationId,
        actorId: gate.actorId,
        purpose: request.purpose ?? "unknown",
        actualUsd: 0,
        runId: secrets.harnessTrace?.runId,
        traceId: secrets.harnessTrace?.traceId,
        releaseId: secrets.harnessTrace?.releaseId,
        providerAttemptId: prepared.providerAttemptId,
      });
    }
    return {
      success: false,
      provider: request.provider,
      code: "OPEN_CIRCUIT",
      error: "open_circuit",
    };
  }
  const context: ProviderAttemptContext = {
    request,
    secrets,
    gate,
    options,
    prepared,
    timeout,
    permit,
  };
  const attempts = await runProviderAttempts(context);
  if ("response" in attempts) return attempts.response;
  return finalizeProviderFailure(context, attempts.lastError, attempts.attemptsStarted);
}

async function runProviderAttempts(
  context: ProviderAttemptContext,
): Promise<ProviderAttemptSummary> {
  const maxRetries = context.permit.state === "half_open"
    ? 0
    : context.prepared.maxRetries;
  let lastError: unknown;
  let attemptsStarted = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
      console.warn("AI retry", {
        provider: context.request.provider,
        model: context.request.model,
        attempt,
        backoffMs: delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const outcome = await executeProviderAttempt(context, attemptsStarted + 1);
    attemptsStarted = outcome.attemptNumber;
    if ("response" in outcome) return { response: outcome.response };
    lastError = outcome.error;
    if (!isRetryableProviderError(outcome.error) || attempt === maxRetries) break;
  }
  return { lastError, attemptsStarted };
}

async function executeProviderAttempt(
  context: ProviderAttemptContext,
  attemptNumber: number,
): Promise<ProviderAttemptOutcome> {
  const { request, secrets, prepared, gate, options } = context;
  const controller = new AbortController();
  const attemptEventId = crypto.randomUUID();
  await recordHarnessEvent(secrets.harnessTrace, {
    eventId: attemptEventId,
    parentEventId: prepared.providerAttemptId,
    eventClass: "provider.attempt",
    stage: request.purpose ?? "unknown",
    status: "started",
    attemptNumber,
    provider: request.provider,
    model: request.model,
  });
  try {
    const response = await withTimeout(
      callProvider(
        request,
        prepared.apiKey,
        controller.signal,
        prepared.pricingAt,
        prepared.unknownModelPolicy,
      ),
      context.timeout,
      controller,
    );
    console.info(
      options.deferCircuitSuccess
        ? "AI provider transport success; structured validation pending"
        : "AI call success",
      {
        provider: request.provider,
        model: request.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: response.usage.costUsd.toFixed(6),
        latencyMs: response.latencyMs,
      },
    );
    await recordHarnessEvent(secrets.harnessTrace, {
      eventId: attemptEventId,
      parentEventId: prepared.providerAttemptId,
      eventClass: "provider.attempt",
      stage: request.purpose ?? "unknown",
      status: "succeeded",
      attemptNumber,
      provider: request.provider,
      model: request.model,
      costUsd: response.usage.costUsd,
      latencyMs: response.latencyMs,
      safeMetadata: { cache_status: response.usage.cacheStatus ?? "none" },
    });
    await recordDependencyResult(prepared.reliabilityClient, {
      dependency: request.provider,
      environment: prepared.environment,
      releaseId: prepared.releaseId,
      success: true,
      probeToken: context.permit.probeToken,
    });
    if (request.purpose && !options.deferCircuitSuccess) {
      if (prepared.durableGuardsEnabled) {
        await recordDurableCircuitSuccess(
          secrets.durableGuardClient,
          request.purpose,
          request.provider,
        );
      } else {
        KAEL_CIRCUIT_BREAKER.recordSuccess(request.purpose, request.provider);
      }
    }
    if (gate) {
      const successfulAttemptCostUsd = Number.isFinite(response.usage.costUsd) &&
          response.usage.costUsd > 0
        ? response.usage.costUsd
        : prepared.estimatedCostPerAttemptUsd;
      await finalizeAiSpend(gate.client, {
        reservationId: prepared.reservationId,
        actorId: gate.actorId,
        purpose: request.purpose ?? "unknown",
        actualUsd: successfulAttemptCostUsd +
          prepared.estimatedCostPerAttemptUsd * (attemptNumber - 1),
        runId: secrets.harnessTrace?.runId,
        traceId: secrets.harnessTrace?.traceId,
        releaseId: secrets.harnessTrace?.releaseId,
        providerAttemptId: prepared.providerAttemptId,
      });
    }
    return { attemptNumber, response };
  } catch (error) {
    await recordHarnessEvent(secrets.harnessTrace, {
      eventId: attemptEventId,
      parentEventId: prepared.providerAttemptId,
      eventClass: "provider.attempt",
      stage: request.purpose ?? "unknown",
      status: "failed",
      attemptNumber,
      provider: request.provider,
      model: request.model,
      errorCode: providerErrorCode(error),
    });
    return { attemptNumber, error };
  }
}

async function finalizeProviderFailure(
  context: ProviderAttemptContext,
  lastError: unknown,
  attemptsStarted: number,
): Promise<AIError> {
  const { request, secrets, prepared, gate } = context;
  const httpStatus = lastError instanceof ProviderHttpError
    ? lastError.status
    : undefined;
  const timedOut = isProviderTimeout(lastError);
  const code = typeof httpStatus === "number"
    ? `HTTP_${httpStatus}`
    : timedOut
    ? "TIMEOUT"
    : "AI_CALL_FAILED";
  console.error("AI call failed", {
    provider: request.provider,
    model: request.model,
    code,
    retriesExhausted: true,
  });
  await recordDependencyResult(prepared.reliabilityClient, {
    dependency: request.provider,
    environment: prepared.environment,
    releaseId: prepared.releaseId,
    success: false,
    errorCode: code,
    probeToken: context.permit.probeToken,
  });
  if (request.purpose) {
    const failure = {
      purpose: request.purpose,
      provider: request.provider,
      errorCode: code,
      kind: providerAdapterFor(request.provider).classifyFailure({
        httpStatus,
        timedOut,
      }),
    };
    if (prepared.durableGuardsEnabled) {
      await recordDurableCircuitFailure(secrets.durableGuardClient, failure);
    } else {
      KAEL_CIRCUIT_BREAKER.recordFailure(failure);
    }
  }
  if (gate) {
    await finalizeAiSpend(gate.client, {
      reservationId: prepared.reservationId,
      actorId: gate.actorId,
      purpose: request.purpose ?? "unknown",
      actualUsd: prepared.estimatedCostPerAttemptUsd * attemptsStarted,
      runId: secrets.harnessTrace?.runId,
      traceId: secrets.harnessTrace?.traceId,
      releaseId: secrets.harnessTrace?.releaseId,
      providerAttemptId: prepared.providerAttemptId,
    });
  }
  return {
    success: false,
    provider: request.provider,
    code,
    error: code,
  };
}

function boundedRetryCount(value: number | undefined): number {
  if (value === undefined) return 2;
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), 2);
}

async function callProvider(
  request: AIRequest,
  apiKey: string,
  signal: AbortSignal,
  pricingAt: Date,
  unknownModelPolicy: "throw" | "safe-high",
): Promise<AIResponse> {
  const start = Date.now();
  const adapter = providerAdapterFor(request.provider);
  const { url, headers, body } = adapter.buildRequest({ request, apiKey });
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    redirect: "error",
    signal,
  });
  const latencyMs = Date.now() - start;
  const text = await readResponseTextBounded(
    response,
    AI_PROVIDER_MAX_RESPONSE_BYTES,
  );

  if (!response.ok) {
    throw new ProviderHttpError(response.status);
  }

  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI_PROVIDER_RESPONSE_INVALID");
  }

  return adapter.parseResponse({
    request,
    data: parsed as Record<string, unknown>,
    latencyMs,
    model: request.model,
    pricingAt,
    unknownModelPolicy,
  });
}

function providerErrorCode(error: unknown): string {
  if (error instanceof ProviderHttpError) return `HTTP_${error.status}`;
  if (isProviderTimeout(error)) return "TIMEOUT";
  return error instanceof Error && /^[A-Za-z0-9_.:-]{1,120}$/.test(error.name)
    ? error.name
    : "AI_CALL_FAILED";
}

function providerKey(
  provider: AIProvider,
  secrets: EdgeAiSecrets,
): string | undefined {
  if (provider === "anthropic") return secrets.anthropicApiKey;
  if (provider === "perplexity") return secrets.perplexityApiKey;
  return secrets.deepseekApiKey;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  controller: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof ProviderHttpError) {
    return error.status === 429 || error.status >= 500;
  }
  return isProviderTimeout(error);
}

function isProviderTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Timeout|Abort/i.test(String(error));
}

class ProviderHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}
