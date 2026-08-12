import { describe, expect, it } from 'vitest'

import { providerStreamRequestFor } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/provider-adapter'
import { readProviderSseResponse } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/provider-stream'
import type { AIRequest } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'

function requestFor(provider: AIRequest['provider']): AIRequest {
  return {
    provider,
    model: provider === 'anthropic'
      ? 'claude-sonnet-5'
      : provider === 'deepseek'
      ? 'deepseek-v4-flash'
      : 'sonar-pro',
    messages: [{ role: 'user', content: 'Return a safe structured response.' }],
    maxRetries: 0,
  }
}

function sseResponse(frames: readonly string[]) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      frames.forEach((frame) => controller.enqueue(encoder.encode(frame)))
      controller.close()
    },
  }))
}

describe('mobile-api native provider response stream', () => {
  it('requests native SSE while preserving each provider adapter contract', () => {
    const anthropic = providerStreamRequestFor({
      request: requestFor('anthropic'),
      apiKey: 'anthropic-key',
    })
    const deepseek = providerStreamRequestFor({
      request: requestFor('deepseek'),
      apiKey: 'deepseek-key',
    })
    const perplexity = providerStreamRequestFor({
      request: requestFor('perplexity'),
      apiKey: 'perplexity-key',
    })

    expect(anthropic.headers).toMatchObject({ Accept: 'text/event-stream' })
    expect(anthropic.body).toMatchObject({ stream: true })
    expect(deepseek.body).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    })
    expect(perplexity.body).toMatchObject({ stream: true, stream_mode: 'concise' })
  })

  it('forwards only Anthropic text deltas and leaves thinking events server-side', async () => {
    const deltas: string[] = []
    const result = await readProviderSseResponse({
      provider: 'anthropic',
      response: sseResponse([
        'event: content_block_delta\n' +
          'data: {"delta":{"type":"thinking_delta","thinking":"private rationale"}}\n\n',
        'event: content_block_delta\n' +
          'data: {"delta":{"type":"text_delta","text":"{\\"public_reasoning_summary\\":[\\"safe update\\"],"}}\n\n',
        'event: content_block_delta\n' +
          'data: {"delta":{"type":"text_delta","text":"\\"answer\\":\\"safe answer\\"}"}}\n\n',
        'event: message_delta\n' +
          'data: {"usage":{"output_tokens":12}}\n\n',
      ]),
      onTextDelta: (delta) => deltas.push(delta),
    })

    expect(deltas.join('')).toBe('{"public_reasoning_summary":["safe update"],"answer":"safe answer"}')
    expect(deltas.join('')).not.toContain('private rationale')
    expect(result.data).toMatchObject({
      content: [{ type: 'text', text: deltas.join('') }],
      usage: { output_tokens: 12 },
    })
  })

  it('forwards only OpenAI-compatible content deltas and ignores reasoning fields', async () => {
    const deltas: string[] = []
    const result = await readProviderSseResponse({
      provider: 'deepseek',
      response: sseResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"private rationale","content":"{\\"text\\":\\"safe"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" answer\\"}"}}],"usage":{"completion_tokens":3}}\n\n',
        'data: [DONE]\n\n',
      ]),
      onTextDelta: (delta) => deltas.push(delta),
    })

    expect(deltas.join('')).toBe('{"text":"safe answer"}')
    expect(deltas.join('')).not.toContain('private rationale')
    expect(result.data).toMatchObject({
      choices: [{ message: { content: deltas.join('') } }],
      usage: { completion_tokens: 3 },
    })
  })
})
