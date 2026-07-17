import type { AIProvider, AIRequest, AIResponse, AIError, EdgeAiSecrets } from "./types.ts";
import { KAEL_CIRCUIT_BREAKER } from "./guards/circuit-breaker.ts";
import {
  isDurableCircuitOpen,
  recordDurableCircuitFailure,
  recordDurableCircuitSuccess,
} from "./guards/durable-guards.ts";
import { KAEL_ROUTING_CONFIG } from "./routing.config.ts";
import {
  estimateModelRequestCostUsd,
  resolveModelPrice,
  runtimeUnknownModelPolicy,
} from "./model-pricing.ts";
import { providerAdapterFor } from "./provider-adapter.ts";
import {
  finalizeAiSpend,
  isKaelAiKillSwitchEnabled,
  type KaelSpendGate,
  reserveAiSpend,
} from "./guards/spend-gate.ts";
import { readResponseTextBounded } from "../../../_shared/network.ts";

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
  // The kill-switch stops provider I/O before any cost and returns an honest failure.
  if (isKaelAiKillSwitchEnabled()) {
    console.warn("AI call blocked by KAEL_AI_KILL_SWITCH", {
      provider: request.provider,
      purpose: request.purpose,
    });
    return {
      success: false,
      provider: request.provider,
      code: "AI_DISABLED",
      error: "kill_switch",
    };
  }

  const durableGuardsEnabled = secrets.durableGuardsEnabled === true;
  const circuitOpen = request.purpose
    ? durableGuardsEnabled
      ? await isDurableCircuitOpen(
        secrets.durableGuardClient,
        request.purpose,
        request.provider,
      )
      : KAEL_CIRCUIT_BREAKER.isOpen(request.purpose, request.provider)
    : false;
  if (circuitOpen) {
    console.warn("AI call blocked by open provider circuit", {
      provider: request.provider,
      purpose: request.purpose,
    });
    return {
      success: false,
      provider: request.provider,
      code: "OPEN_CIRCUIT",
      error: "open_circuit",
    };
  }

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
    return {
      success: false,
      provider: request.provider,
      code: "KEY_MISSING",
      error: "provider key missing",
    };
  }

  const maxRetries = boundedRetryCount(request.maxRetries);

  // The ledger must cover the entire retry envelope before any provider I/O.
  let reservationId: number | null = null;
  let estimatedCostPerAttemptUsd = 0;
  if (gate) {
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
    estimatedCostPerAttemptUsd = Math.max(configuredEstimate, modelEstimate);
    const estimatedCostUsd = estimatedCostPerAttemptUsd *
      (maxRetries + 1);
    const reservation = await reserveAiSpend(gate.client, {
      actorId: gate.actorId,
      estimatedCostUsd,
      purpose: request.purpose,
    });
    if (!reservation.allowed) {
      console.warn("AI call blocked by spend cap", {
        provider: request.provider,
        purpose: request.purpose,
        scope: reservation.scope,
      });
      return {
        success: false,
        provider: request.provider,
        code: "SPEND_CAP",
        error: reservation.scope ?? "spend_cap",
      };
    }
    reservationId = reservation.reservationId;
  }

  const timeout = request.timeoutMs ?? (request.provider === "anthropic"
    ? 20_000
    : request.provider === "perplexity"
    ? 15_000
    : 10_000);
  let lastError: unknown;
  let attemptsStarted = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
      console.warn("AI retry", {
        provider: request.provider,
        model: request.model,
        attempt,
        backoffMs: delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const controller = new AbortController();
    attemptsStarted += 1;
    try {
      const response = await withTimeout(
        callProvider(
          request,
          apiKey,
          controller.signal,
          pricingAt,
          unknownModelPolicy,
        ),
        timeout,
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
      if (request.purpose && !options.deferCircuitSuccess) {
        if (durableGuardsEnabled) {
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
        // Zero usage can mean omitted billing metadata, not a free request.
        const successfulAttemptCostUsd = Number.isFinite(response.usage.costUsd) &&
            response.usage.costUsd > 0
          ? response.usage.costUsd
          : estimatedCostPerAttemptUsd;
        await finalizeAiSpend(gate.client, {
          reservationId,
          actorId: gate.actorId,
          purpose: request.purpose ?? "unknown",
          actualUsd: successfulAttemptCostUsd +
            estimatedCostPerAttemptUsd * (attemptsStarted - 1),
        });
      }
      return response;
    } catch (err) {
      lastError = err;
      if (!isRetryableProviderError(err) || attempt === maxRetries) break;
    }
  }

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
    if (durableGuardsEnabled) {
      await recordDurableCircuitFailure(secrets.durableGuardClient, failure);
    } else {
      KAEL_CIRCUIT_BREAKER.recordFailure(failure);
    }
  }
  // Provider-side cost is unknowable after transport failure, so retain the
  // conservative estimate for every attempt that crossed the network boundary.
  if (gate) {
    await finalizeAiSpend(gate.client, {
      reservationId,
      actorId: gate.actorId,
      purpose: request.purpose ?? "unknown",
      actualUsd: estimatedCostPerAttemptUsd * attemptsStarted,
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
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
  }
}
