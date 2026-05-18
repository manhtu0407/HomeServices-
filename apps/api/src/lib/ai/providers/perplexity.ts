import type { AIRequest, AIResponse } from '../types'
import { AIProviderError } from '../types'
import { env } from '../../env'

export async function callPerplexity(request: AIRequest): Promise<AIResponse> {
  const apiKey = env.perplexityApiKey

  const start = Date.now()

  const res = await fetch('https://api.perplexity.ai/v1/sonar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.2,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
    signal: request.signal,
  })

  const latencyMs = Date.now() - start

  if (!res.ok) {
    const body = await res.text()
    throw new AIProviderError('perplexity', res.status, body)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  const inputTokens = data.usage?.prompt_tokens ?? 0
  const outputTokens = data.usage?.completion_tokens ?? 0
  const costUsd = inputTokens * (1 / 1_000_000) + outputTokens * (1 / 1_000_000)

  return {
    content,
    usage: { inputTokens, outputTokens, costUsd },
    latencyMs,
    success: true,
  }
}
