import type { AIRequest, AIResponse } from '../types'
import { AIProviderError } from '../types'
import { env } from '../../env'

export async function callAnthropic(request: AIRequest): Promise<AIResponse> {
  const apiKey = env.anthropicApiKey

  const start = Date.now()

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.7,
      messages: request.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
      system: request.messages.find((m) => m.role === 'system')?.content,
    }),
    signal: request.signal,
  })

  const latencyMs = Date.now() - start

  if (!res.ok) {
    const body = await res.text()
    throw new AIProviderError('anthropic', res.status, body)
  }

  const data = await res.json()
  const content = data.content?.[0]?.text ?? ''
  const inputTokens = data.usage?.input_tokens ?? 0
  const outputTokens = data.usage?.output_tokens ?? 0

  // Sonnet: $3/M input, $15/M output | Haiku: $0.25/M input, $1.25/M output
  const isHaiku = request.model.includes('haiku')
  const inputRate = isHaiku ? 0.25 / 1_000_000 : 3 / 1_000_000
  const outputRate = isHaiku ? 1.25 / 1_000_000 : 15 / 1_000_000
  const costUsd = inputTokens * inputRate + outputTokens * outputRate

  return {
    content,
    usage: { inputTokens, outputTokens, costUsd },
    latencyMs,
    success: true,
  }
}
