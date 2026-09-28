import { afterEach, describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { runCustomerAssistant } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant'
import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import type { AIRequest } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'

export const PILLAR = {
  id: 'P217-customer-assistant-image-analysis',
  invariant:
    'a Customer normal-chat image reaches a vision-capable provider as an image content block and returns a validated answer without entering the response stream path',
  authority: [
    'governance/RULES.md #2 (all AI API calls go through the centralized wrapper)',
    'governance/RULES.md #8 (real image evidence must not silently degrade to text-only handling)',
    'governance/protocols/frontend-test.md G3 (the real Customer image-analysis path stays functional)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/agents/customer-assistant.ts',
  layer: 'unit',
  siblings: ['P32-kael-request-provenance', 'P205-kael-composer-and-failure-boundary'],
  mutation:
    'remove the resolver-local image state and let the stream decision read an out-of-scope hasImages name; the one-turn image request throws before the injected provider can receive the image block',
} as const satisfies PillarManifest

const imageUrl = 'https://images.example.test/customer/fixture.jpg'

describe('P217 Customer assistant image analysis', () => {
  afterEach(() => {
    KAEL_CIRCUIT_BREAKER.reset()
  })

  it('sends the attached image to a vision provider and returns the validated reply', async () => {
    const requests: AIRequest[] = []
    const answer = await runCustomerAssistant({
      callAI: async (request) => {
        requests.push(request)
        return {
          success: true as const,
          content: JSON.stringify({
            answer: 'The photo shows a wall-mounted air conditioner. Kael cannot confirm its condition from this image alone.',
            public_reasoning_summary: ['Identify visible equipment and note limits of the image.'],
          }),
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
    expect(requests, pillarWhy(PILLAR, 'the attached image must reach a vision-capable model')).toHaveLength(1)
    expect(requests[0]?.provider, pillarWhy(PILLAR, 'a text-only provider cannot analyze the attachment')).toBe('anthropic')
    const userMessage = requests[0]?.messages.find((message) => message.role === 'user')
    expect(userMessage?.content, pillarWhy(PILLAR, 'the image must remain multimodal request content')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          source: expect.objectContaining({ type: 'url', url: imageUrl }),
        }),
      ]),
    )
  })
})
