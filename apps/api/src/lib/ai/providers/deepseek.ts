import type { AIMessageContent, AIRequest, AIResponse } from '../types'
import { AIProviderError } from '../types'
import { env } from '../../env'
import {
  providerUsageCount,
  readBoundedProviderJson,
  readBoundedProviderText,
  requireProviderContent,
} from '../provider-response'

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export async function callDeepSeek(request: AIRequest): Promise<AIResponse> {
  const apiKey = env.deepseekApiKey

  const start = Date.now()

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.7,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
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
    throw new AIProviderError('deepseek', res.status, body)
  }

  const data = await readBoundedProviderJson<DeepSeekResponse>(res)
  const content = requireProviderContent(data.choices?.[0]?.message?.content)
  const inputTokens = providerUsageCount(data.usage?.prompt_tokens)
  const outputTokens = providerUsageCount(data.usage?.completion_tokens)
  // DeepSeek: ~$0.14/M input, $0.28/M output (chat model)
  const costUsd =
    inputTokens * (0.14 / 1_000_000) + outputTokens * (0.28 / 1_000_000)

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
