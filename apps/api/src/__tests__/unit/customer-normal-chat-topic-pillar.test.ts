import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { runCustomerAssistant } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant'
import { classifyAssistantTopic } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant-policy'
import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import type { AIRequest } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'

export const PILLAR = {
  id: 'P311-customer-normal-chat-topic-gate',
  invariant:
    'a Customer normal-chat message that names no service, with or without a photo, reaches the vision and answer providers instead of the canned out-of-scope refusal; explicit out-of-scope services and forbidden topics are still refused, and a case chat still treats an unnamed request as outside the six services',
  authority: [
    'governance/RULES.md #6-#7 (Kael normal chat answers general questions; booking stays within the six services)',
    'governance/RULES.md #8 (a real photo must not silently degrade into a refusal)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/agents/customer-assistant-policy.ts',
  layer: 'unit',
  siblings: ['P217-customer-assistant-image-analysis'],
  mutation:
    'return out_of_scope_services_anything from the normal-chat fallthrough in classifyAssistantTopic — the photo and general-question cases turn red',
} as const satisfies PillarManifest

const REFUSAL = /ngoài sáu dịch vụ đang hỗ trợ/
const imageUrl = 'https://supabase.example.test/storage/v1/object/sign/kael-chat-media/fixture.jpg?token=short-lived'

function recordingProvider(requests: AIRequest[]) {
  return async (request: AIRequest) => {
    requests.push(request)
    const content = request.purpose === 'normal_chat_vision'
      ? JSON.stringify({
        summary: 'Ảnh chụp một kệ gỗ với khoảng hai mươi cuốn sách đứng thẳng.',
        observations: ['Kệ gỗ màu nâu', 'Nhiều gáy sách nhiều màu'],
        readable_text: [],
        uncertainties: ['Không đọc rõ toàn bộ tên sách.'],
      })
      : JSON.stringify({
        answer: 'Đây là ảnh một kệ sách gỗ với khoảng hai mươi cuốn sách đứng thẳng.',
        public_reasoning_summary: ['Dựa trên mô tả ảnh.'],
      })
    return {
      success: true as const,
      content,
      latencyMs: 10,
      usage: { costUsd: 0, inputTokens: 10, outputTokens: 10 },
    }
  }
}

function stubImageFetch() {
  vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'SUPABASE_URL' ? 'https://supabase.example.test' : undefined } })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]).buffer, {
    headers: { 'content-type': 'image/jpeg', 'content-length': '3' },
    status: 200,
  })))
}

describe('P311 Customer normal-chat topic gate', () => {
  afterEach(() => {
    KAEL_CIRCUIT_BREAKER.reset()
    vi.unstubAllGlobals()
  })

  it('analyzes a photo asked about with no service named, instead of refusing it', async () => {
    stubImageFetch()
    const requests: AIRequest[] = []
    const answer = await runCustomerAssistant({
      callAI: recordingProvider(requests),
      imageUrls: [imageUrl],
      language: 'vi',
      message: 'Ảnh này là ảnh gì?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })
    expect(requests.map((request) => request.purpose), pillarWhy(PILLAR, 'the photo must reach vision, then the answer route'))
      .toEqual(['normal_chat_vision', 'normal_chat_response'])
    expect(answer.answer).toMatch(/kệ sách/)
    expect(answer.answer).not.toMatch(REFUSAL)
    expect(answer.fallback_used).toBe(false)
  })

  it('answers a general question with no photo through the normal-chat route', async () => {
    const requests: AIRequest[] = []
    const answer = await runCustomerAssistant({
      callAI: recordingProvider(requests),
      language: 'vi',
      message: 'Gợi ý giúp mình vài cuốn sách hay để đọc cuối tuần?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })
    expect(requests.map((request) => request.purpose), pillarWhy(PILLAR, 'general conversation is normal chat, not a service request'))
      .toEqual(['normal_chat_response'])
    expect(answer.answer).not.toMatch(REFUSAL)
  })

  it.each([
    ['an explicit out-of-scope service', 'Mình cần thuê người sơn nhà', REFUSAL],
    ['financial advice', 'Có nên đầu tư chứng khoán lúc này không?', /ngoài chuyên môn dịch vụ nhà ở/],
  ])('still refuses %s without calling a provider', async (_label, message, refusal) => {
    const requests: AIRequest[] = []
    const answer = await runCustomerAssistant({
      callAI: recordingProvider(requests),
      language: 'vi',
      message,
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })
    expect(requests, pillarWhy(PILLAR, 'the deterministic refusal must not spend a provider call')).toHaveLength(0)
    expect(answer.answer).toMatch(refusal)
  })

  it('keeps an unnamed request outside the six services in a case chat', () => {
    expect(classifyAssistantTopic('Ảnh này là ảnh gì?', null, 'customer_case'), pillarWhy(PILLAR, 'case chat stays within the six services'))
      .toBe('out_of_scope_services_anything')
    expect(classifyAssistantTopic('Ảnh này là ảnh gì?', null, 'customer_normal')).toBe('normal_chat_general')
  })
})
