import type { AIMessageContent, AIRequest, AIResponse } from '../types'
import { AIProviderError } from '../types'
import { env } from '../../env'
import {
  providerUsageCount,
  readBoundedProviderJson,
  readBoundedProviderText,
  requireProviderContent,
} from '../provider-response'

type AnthropicResponse = {
  content?: Array<{ text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

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
      messages: request.messages.flatMap((m) =>
        m.role === 'system' ? [] : [{ role: m.role, content: m.content }],
      ),
      system: aiMessageContentToText(request.messages.find((m) => m.role === 'system')?.content),
    }),
    redirect: 'error',
    signal: request.signal,
  })

  const latencyMs = Date.now() - start

  if (!res.ok) {
    const body = await readBoundedProviderText(res)
    throw new AIProviderError('anthropic', res.status, body)
  }

  const data = await readBoundedProviderJson<AnthropicResponse>(res)
  const content = requireProviderContent(data.content?.[0]?.text)
  const inputTokens = providerUsageCount(data.usage?.input_tokens)
  const outputTokens = providerUsageCount(data.usage?.output_tokens)

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

function aiMessageContentToText(content: AIMessageContent | undefined): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content
    .flatMap((block) => block.type === 'text' ? [block.text] : [])
    .join('\n')
}
