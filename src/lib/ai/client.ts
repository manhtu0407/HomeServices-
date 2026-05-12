import type { AIRequest, AIResult, AIResponse, AIProvider } from './types'
import { TIMEOUT_MS, MAX_RETRIES } from './types'
import { callAnthropic } from './providers/anthropic'
import { callPerplexity } from './providers/perplexity'
import { callDeepSeek } from './providers/deepseek'

const providers: Record<AIProvider, (req: AIRequest) => Promise<AIResponse>> = {
  anthropic: callAnthropic,
  perplexity: callPerplexity,
  deepseek: callDeepSeek,
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ])
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 10_000)
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message
    if (msg.includes('429') || msg.includes('500') || msg.includes('502') || msg.includes('503')) return true
    if (msg.includes('Timeout')) return true
  }
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

    try {
      const response = await withTimeout(providerFn(request), timeout)

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

  const errorMessage =
    lastError instanceof Error ? lastError.message : 'Unknown error'

  console.error('AI call failed', {
    provider: request.provider,
    model: request.model,
    error: errorMessage,
    retriesExhausted: true,
  })

  return {
    provider: request.provider,
    error: errorMessage,
    code: 'AI_CALL_FAILED',
    retryable: false,
    success: false,
  }
}
