import type { AIMessageContent, AIRequest, AIResponse } from '../types'
import { AIProviderError } from '../types'
import { env } from '../../env'
import {
  providerUsageCount,
  readBoundedProviderJson,
  readBoundedProviderText,
  requireProviderContent,
} from '../provider-response'

type PerplexityResponse = {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

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
        content: aiMessageContentToText(m.content),
      })),
    }),
    redirect: 'error',
    signal: request.signal,
  })

  const latencyMs = Date.now() - start

  if (!res.ok) {
    const body = await readBoundedProviderText(res)
    throw new AIProviderError('perplexity', res.status, body)
  }

  const data = await readBoundedProviderJson<PerplexityResponse>(res)
  const content = requireProviderContent(data.choices?.[0]?.message?.content)
  const inputTokens = providerUsageCount(data.usage?.prompt_tokens)
  const outputTokens = providerUsageCount(data.usage?.completion_tokens)
  const costUsd = inputTokens * (1 / 1_000_000) + outputTokens * (1 / 1_000_000)

  return {
    content,
    usage: { inputTokens, outputTokens, costUsd },
    latencyMs,
    success: true,
  }
}

function aiMessageContentToText(content: AIMessageContent): string {
  if (typeof content === 'string') return content
  return content
    .flatMap((block) => block.type === 'text' ? [block.text] : [])
    .join('\n')
}
