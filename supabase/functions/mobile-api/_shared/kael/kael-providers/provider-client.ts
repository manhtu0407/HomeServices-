import type { AIProvider, AIRequest, AIResponse, AIError, EdgeAiSecrets } from "../contracts/types.ts";
import { KAEL_CIRCUIT_BREAKER } from "./circuit-breaker.ts";
import {
  recordDurableCircuitFailure,
  recordDurableCircuitSuccess,
} from "../kael-guardrails/durable-guards.ts";
import { providerAdapterFor, providerStreamRequestFor } from "./provider-adapter.ts";
import { readProviderSseResponse } from "./provider-stream.ts";
import {
  bindRequestAbort,
  isAbortError,
  requestCancelled,
  requestCancelledError,
  throwIfRequestAborted,
  waitForProviderRetry,
} from "./provider-cancellation.ts";
import {
  prepareAiProviderCall,
  type PreparedAiProviderCall,
} from "./provider-preflight.ts";
import {
  finalizeAiSpend,
  type KaelSpendGate,
} from "../kael-guardrails/spend-gate.ts";
import { readResponseTextBounded } from "../../../../_shared/network.ts";
import { recordHarnessEvent } from "../../../../_shared/harness/trace.ts";
import {
  acquireDependencyPermit,
  recordDependencyResult,
} from "../../../../_shared/harness/reliability.ts";
import { emitKaelOpsAlert } from "../ops/alerts.ts";
const AI_PROVIDER_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type CallAIOptions = {
  readonly deferCircuitSuccess?: boolean;
};

export type CallAIStreamOptions = CallAIOptions & {
  readonly onTextDelta: (delta: string) => void;
};

export type AIStreamError = AIError & {
  readonly streamStarted: boolean;
};

export async function callAI(
  request: AIRequest,
  secrets: EdgeAiSecrets,
  gate?: KaelSpendGate,
  options: CallAIOptions = {},
): Promise<AIResponse | AIError> {
  if (secrets.requestSignal?.aborted) return requestCancelled(request.provider);
  const prepared = await prepareAiProviderCall(request, secrets, gate);
  if ("success" in prepared) return prepared;
  if (secrets.requestSignal?.aborted) {
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
    return requestCancelled(request.provider);
  }
  return executePreparedAiProviderCall(request, secrets, gate, options, prepared);
}

/**
 * Executes the same guarded, metered provider call as callAI while consuming a
 * provider-native SSE body. Text stays server-side until the caller's
 * structured/public-output guards release an allowed delta.
 */
export async function callAIStream(
  request: AIRequest,
  secrets: EdgeAiSecrets,
  gate: KaelSpendGate | undefined,
  options: CallAIStreamOptions,
): Promise<AIResponse | AIStreamError> {
  if (secrets.requestSignal?.aborted) return { ...requestCancelled(request.provider), streamStarted: false };
  const prepared = await prepareAiProviderCall(request, secrets, gate);
  if ("success" in prepared) return { ...prepared, streamStarted: false };
  if (secrets.requestSignal?.aborted) {
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
    return { ...requestCancelled(request.provider), streamStarted: false };
  }
  return executePreparedAiProviderStreamCall(request, secrets, gate, options, prepared);
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
      eventId: crypto.randomUUID(),
      parentEventId: prepared.providerAttemptId,
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

async function executePreparedAiProviderStreamCall(
  request: AIRequest,
  secrets: EdgeAiSecrets,
  gate: KaelSpendGate | undefined,
  options: CallAIStreamOptions,
  prepared: PreparedAiProviderCall,
): Promise<AIResponse | AIStreamError> {
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
      eventId: crypto.randomUUID(),
      parentEventId: prepared.providerAttemptId,
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
      streamStarted: false,
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
  const streamState = { started: false };
  const attempts = await runProviderStreamAttempts(
    context,
    options.onTextDelta,
    streamState,
  );
  if ("response" in attempts) return attempts.response;
  const failure = await finalizeProviderFailure(
    context,
    attempts.lastError,
    attempts.attemptsStarted,
  );
  return { ...failure, streamStarted: streamState.started };
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
    if (context.secrets.requestSignal?.aborted) {
      lastError = requestCancelledError();
      break;
    }
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
      console.warn("AI retry", {
        provider: context.request.provider,
        model: context.request.model,
        attempt,
        backoffMs: delay,
      });
      try {
        await waitForProviderRetry(delay, context.secrets.requestSignal);
      } catch (error) {
        lastError = error;
        break;
      }
    }
    const outcome = await executeProviderAttempt(context, attemptsStarted + 1);
    attemptsStarted = outcome.attemptNumber;
    if ("response" in outcome) return { response: outcome.response };
    lastError = outcome.error;
    if (!isRetryableProviderError(outcome.error) || attempt === maxRetries) break;
  }
  return { lastError, attemptsStarted };
}

async function runProviderStreamAttempts(
  context: ProviderAttemptContext,
  onTextDelta: (delta: string) => void,
  streamState: { started: boolean },
): Promise<ProviderAttemptSummary> {
  const maxRetries = context.permit.state === "half_open"
    ? 0
    : context.prepared.maxRetries;
  let lastError: unknown;
  let attemptsStarted = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (context.secrets.requestSignal?.aborted) {
      lastError = requestCancelledError();
      break;
    }
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
      console.warn("AI stream retry", {
        provider: context.request.provider,
        model: context.request.model,
        attempt,
        backoffMs: delay,
      });
      try {
        await waitForProviderRetry(delay, context.secrets.requestSignal);
      } catch (error) {
        lastError = error;
        break;
      }
    }
    const outcome = await executeProviderStreamAttempt(
      context,
      attemptsStarted + 1,
      onTextDelta,
      streamState,
    );
    attemptsStarted = outcome.attemptNumber;
    if ("response" in outcome) return { response: outcome.response };
    lastError = outcome.error;
    // A second provider attempt after any provider text can create a mixed
    // response if a caller safely released a prefix. End the stream instead.
    if (
      streamState.started ||
      !isRetryableProviderError(outcome.error) ||
      attempt === maxRetries
    ) break;
  }
  return { lastError, attemptsStarted };
}

async function executeProviderAttempt(
  context: ProviderAttemptContext,
  attemptNumber: number,
): Promise<ProviderAttemptOutcome> {
  const { request, secrets, prepared, gate, options } = context;
  const controller = new AbortController();
  const unbindRequestAbort = bindRequestAbort(secrets.requestSignal, controller);
  const attemptStartEventId = crypto.randomUUID();
  await recordHarnessEvent(secrets.harnessTrace, {
    eventId: attemptStartEventId,
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
    throwIfRequestAborted(secrets.requestSignal);
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
      eventId: crypto.randomUUID(),
      parentEventId: attemptStartEventId,
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
      eventId: crypto.randomUUID(),
      parentEventId: attemptStartEventId,
      eventClass: "provider.attempt",
      stage: request.purpose ?? "unknown",
      status: "failed",
      attemptNumber,
      provider: request.provider,
      model: request.model,
      errorCode: providerErrorCode(error),
    });
    return { attemptNumber, error };
  } finally {
    unbindRequestAbort();
  }
}

async function executeProviderStreamAttempt(
  context: ProviderAttemptContext,
  attemptNumber: number,
  onTextDelta: (delta: string) => void,
  streamState: { started: boolean },
): Promise<ProviderAttemptOutcome> {
  const { request, secrets, prepared, gate, options } = context;
  const controller = new AbortController();
  const unbindRequestAbort = bindRequestAbort(secrets.requestSignal, controller);
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
      callProviderStream(
        request,
        prepared.apiKey,
        controller.signal,
        prepared.pricingAt,
        prepared.unknownModelPolicy,
        (delta) => {
          streamState.started = true;
          onTextDelta(delta);
        },
      ),
      context.timeout,
      controller,
    );
    throwIfRequestAborted(secrets.requestSignal);
    console.info(
      options.deferCircuitSuccess
        ? "AI provider stream transport success; structured validation pending"
        : "AI stream call success",
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
      eventId: crypto.randomUUID(),
      parentEventId: attemptEventId,
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
      eventId: crypto.randomUUID(),
      parentEventId: attemptEventId,
      eventClass: "provider.attempt",
      stage: request.purpose ?? "unknown",
      status: "failed",
      attemptNumber,
      provider: request.provider,
      model: request.model,
      errorCode: providerErrorCode(error),
    });
    return { attemptNumber, error };
  } finally {
    unbindRequestAbort();
  }
}

async function finalizeProviderFailure(
  context: ProviderAttemptContext,
  lastError: unknown,
  attemptsStarted: number,
): Promise<AIError> {
  const { request, secrets, prepared, gate } = context;
  if (secrets.requestSignal?.aborted || isAbortError(lastError)) {
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
      code: "REQUEST_CANCELLED",
      error: "REQUEST_CANCELLED",
    };
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

async function callProviderStream(
  request: AIRequest,
  apiKey: string,
  signal: AbortSignal,
  pricingAt: Date,
  unknownModelPolicy: "throw" | "safe-high",
  onTextDelta: (delta: string) => void,
): Promise<AIResponse> {
  const start = Date.now();
  const adapter = providerAdapterFor(request.provider);
  const { url, headers, body } = providerStreamRequestFor({ request, apiKey });
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    redirect: "error",
    signal,
  });
  if (!response.ok) {
    await readResponseTextBounded(response, AI_PROVIDER_MAX_RESPONSE_BYTES);
    throw new ProviderHttpError(response.status);
  }
  const streamed = await readProviderSseResponse({
    provider: request.provider,
    response,
    onTextDelta,
  });
  return adapter.parseResponse({
    request,
    data: streamed.data,
    latencyMs: Date.now() - start,
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
