import type { AIRequest, AIResult, AIResponse, AIProvider } from './types'
import { TIMEOUT_MS, MAX_RETRIES, AIProviderError } from './types'
import { callAnthropic } from './providers/anthropic'
import { callPerplexity } from './providers/perplexity'
import { callDeepSeek } from './providers/deepseek'

const providers: Record<AIProvider, (req: AIRequest) => Promise<AIResponse>> = {
  anthropic: callAnthropic,
  perplexity: callPerplexity,
  deepseek: callDeepSeek,
}

/**
 * Race a provider call against a timeout. Two correctness properties:
 *
 *   1. Timer is always cleared (via .finally) so the event loop is not kept
 *      alive past resolution. Without this, every successful AI call leaves a
 *      pending setTimeout hanging for the full timeout window.
 *
 *   2. On timeout, the provided AbortController is aborted — the underlying
 *      fetch in the provider receives the signal and cancels the request.
 *      Without this, the fetch keeps running in the background and may still
 *      complete (incurring token cost or counting against provider rate
 *      limits) long after we returned a TIMEOUT error to the caller.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  controller: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutP = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`Timeout after ${ms}ms`))
    }, ms)
  })
  try {
    return await Promise.race([promise, timeoutP])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 10_000)
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AIProviderError) return error.retryable
  if (error instanceof Error && error.message.includes('Timeout')) return true
  return false
}

export async function callAI(request: AIRequest): Promise<AIResult> {
  const providerFn = providers[request.provider]
  const timeout = TIMEOUT_MS[request.provider]
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = backoffMs(attempt - 1)
      console.warn('AI retry', {
        provider: request.provider,
        model: request.model,
        attempt,
        backoffMs: delay,
      })
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    // Fresh controller per attempt — aborting on retry would break retried call.
    const controller = new AbortController()

    try {
      const response = await withTimeout(
        providerFn({ ...request, signal: controller.signal }),
        timeout,
        controller,
      )

      console.log('AI call success', {
        provider: request.provider,
        model: request.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: response.usage.costUsd.toFixed(6),
        latencyMs: response.latencyMs,
      })

      return response
    } catch (error) {
      lastError = error

      if (!isRetryable(error) || attempt === MAX_RETRIES) {
        break
      }
    }
  }

  const errorCode =
    lastError instanceof AIProviderError
      ? `HTTP_${lastError.statusCode}`
      : 'AI_CALL_FAILED'

  console.error('AI call failed', {
    provider: request.provider,
    model: request.model,
    error: errorCode,
    code: errorCode,
    retriesExhausted: true,
  })

  return {
    provider: request.provider,
    error: errorCode,
    code: errorCode,
    retryable: false,
    success: false,
  }
}
