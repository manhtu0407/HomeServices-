import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { runCustomerAssistant } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant'
import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import type { AIRequest } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'
import { customerKaelConversationTurnSchema } from '../../../../../packages/shared/src/contracts/customer'
import { workerKaelChatTurnSchema } from '../../../../../packages/shared/src/contracts/worker'

export const PILLAR = {
  id: 'P217-customer-assistant-image-analysis',
  invariant:
    'a Customer normal-chat image is analyzed by the dedicated Sonnet vision route, then DeepSeek writes a validated answer from the finding without seeing the original image',
  authority: [
    'governance/RULES.md #2 (all AI API calls go through the centralized wrapper)',
    'governance/RULES.md #8 (real image evidence must not silently degrade to text-only handling)',
    'governance/protocols/frontend-test.md G3 (the real Customer image-analysis path stays functional)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/agents/customer-assistant.ts',
  layer: 'unit',
  siblings: ['P32-kael-request-provenance', 'P205-kael-composer-and-failure-boundary'],
  mutation:
    'route the original image to DeepSeek or let Sonnet write the user-visible answer; provider-purpose and image-boundary assertions turn red',
} as const satisfies PillarManifest

const imageUrl = 'https://supabase.example.test/storage/v1/object/sign/customer/fixture.jpg?token=short-lived'

describe('P217 Customer assistant image analysis', () => {
  afterEach(() => {
    KAEL_CIRCUIT_BREAKER.reset()
    vi.unstubAllGlobals()
  })

  it('uses Sonnet only for image analysis and DeepSeek for the visible answer', async () => {
    vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'SUPABASE_URL' ? 'https://supabase.example.test' : undefined } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]).buffer, {
      headers: { 'content-type': 'image/jpeg', 'content-length': '3' },
      status: 200,
    })))
    const requests: AIRequest[] = []
    const answer = await runCustomerAssistant({
      callAI: async (request) => {
        requests.push(request)
        const content = request.purpose === 'normal_chat_vision'
          ? JSON.stringify({
            summary: 'The photo shows a wall-mounted air conditioner.',
            observations: ['A wall-mounted air conditioner is visible.'],
            readable_text: [],
            uncertainties: ['The photo cannot confirm whether it is operating.'],
          })
          : JSON.stringify({
            answer: 'The photo shows a wall-mounted air conditioner. Kael cannot confirm its condition from this image alone.',
            public_reasoning_summary: ['Use the visual finding and state its limits.'],
          })
        return {
          success: true as const,
          content,
          latencyMs: 12,
          usage: { costUsd: 0, inputTokens: 20, outputTokens: 22 },
        }
      },
      imageUrls: [imageUrl],
      language: 'en',
      message: 'What can you see about this air conditioner in the attached photo?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(answer, pillarWhy(PILLAR, 'the image must complete one validated Customer chat turn')).toMatchObject({
      answer: expect.stringContaining('wall-mounted air conditioner'),
      fallback_used: false,
    })
    expect(requests, pillarWhy(PILLAR, 'vision and answer generation are separate provider calls')).toHaveLength(2)
    expect(requests[0]).toMatchObject({ purpose: 'normal_chat_vision', provider: 'anthropic', model: 'claude-sonnet-5-5' })
    expect(requests[1]).toMatchObject({ purpose: 'normal_chat_response', provider: 'deepseek' })
    expect(requests[1]?.messages.flatMap((message) => typeof message.content === 'string' ? [message.content] : []))
      .toEqual(expect.arrayContaining([expect.stringContaining('wall-mounted air conditioner')]))
    const userMessage = requests[0]?.messages.find((message) => message.role === 'user')
    expect(userMessage?.content, pillarWhy(PILLAR, 'the image must remain multimodal request content')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          source: expect.objectContaining({ type: 'base64', media_type: 'image/jpeg' }),
        }),
      ]),
    )
    expect(requests[1]?.messages.flatMap((message) => Array.isArray(message.content) ? message.content : []))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'image' })]))
  })

  it('allows image-only normal-chat contracts and still rejects empty turns without private images', () => {
    const actorId = 'e2460000-0000-4000-8000-000000000002'
    const customerRef = `supabase://kael-chat-media/${actorId}/kael-chat/model_vision/customer.jpg`
    const workerRef = `supabase://kael-chat-media/${actorId}/kael-chat/model_vision/worker.jpg`
    const requestId = 'e2460000-0000-4000-8000-000000000003'

    expect(customerKaelConversationTurnSchema.safeParse({
      client_request_id: requestId,
      language: 'en',
      message: '',
      media_refs: [customerRef],
    }).success).toBe(true)
    expect(customerKaelConversationTurnSchema.safeParse({
      client_request_id: requestId,
      language: 'en',
      message: '',
      media_refs: [],
    }).success).toBe(false)
    expect(workerKaelChatTurnSchema.safeParse({
      client_request_id: requestId,
      language: 'en',
      message: '',
      media_refs: [workerRef],
    }).success).toBe(true)
    expect(workerKaelChatTurnSchema.safeParse({
      client_request_id: requestId,
      language: 'en',
      message: '',
      media_refs: [],
    }).success).toBe(false)
  })
})
