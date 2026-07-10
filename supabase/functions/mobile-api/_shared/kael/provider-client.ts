import type { AIProvider, AIRequest, AIResponse, AIError, EdgeAiSecrets } from "./types.ts";
import { KAEL_CIRCUIT_BREAKER } from "./circuit-breaker.ts";
import {
  isDurableCircuitOpen,
  recordDurableCircuitFailure,
  recordDurableCircuitSuccess,
} from "./durable-guards.ts";
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
} from "./spend-gate.ts";

export type CallAIOptions = {
  readonly deferCircuitSuccess?: boolean;
};

export async function callAI(
  request: AIRequest,
  secrets: EdgeAiSecrets,
  gate?: KaelSpendGate,
  options: CallAIOptions = {},
): Promise<AIResponse | AIError> {
  // S4/F1 (§38): global kill-switch — hard-stop ALL provider calls during an
  // incident, before any network/cost. Honest failure (no fake success, RULES #8);
  // callers map AIError -> safe fallback / VI unavailable state.
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

  // S4/F1 (§38) — Codex PR#68 P1/P2: reserve spend ATOMICALLY before the provider call.
  // The estimate comes from the purpose's route cost ceiling when the caller didn't
  // override it, so a call that WOULD push past a cap is blocked up-front (not only
  // after it has already overshot). Reconciled to actual on success / released on
  // failure below. reservationId stays null on any fail-open path (nothing to reconcile).
  let reservationId: number | null = null;
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
    const estimatedCostUsd = Math.max(configuredEstimate, modelEstimate);
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
  const maxRetries = request.maxRetries ?? 2;
  let lastError: unknown;
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
      // S4/F1 (§38): reconcile the reservation to ACTUAL cost (best-effort).
      if (gate) {
        await finalizeAiSpend(gate.client, {
          reservationId,
          actorId: gate.actorId,
          purpose: request.purpose ?? "unknown",
          actualUsd: response.usage.costUsd,
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
  // S4/F1 (§38) — Codex PR#68 P1: release the reservation. A failed/aborted call must
  // not permanently count against the user's or global cap (reconcile-or-release).
  if (gate) {
    await finalizeAiSpend(gate.client, {
      reservationId,
      actorId: gate.actorId,
      purpose: request.purpose ?? "unknown",
      actualUsd: 0,
    });
  }
  return {
    success: false,
    provider: request.provider,
    code,
    error: code,
  };
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
    signal,
  });
  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const text = await response.text();
    throw new ProviderHttpError(response.status, text);
  }

  return adapter.parseResponse({
    request,
    data: await response.json(),
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
  constructor(public readonly status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 160)}`);
  }
}
