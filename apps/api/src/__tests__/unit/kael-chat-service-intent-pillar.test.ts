import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { runCustomerAssistant } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant'
import {
  customerConversationNextActions,
  startCaseNextAction,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/customer/kael-conversation-next-actions'
import type { AIRequest } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'

export const PILLAR = {
  id: 'P373-kael-chat-service-intent',
  invariant:
    'normal chat may name one of the six services the customer needs and offer to start it as a single chip that only opens booking; any other value, and any case-chat answer, carries no service intent, and the chip reaches only the Kael reply it belongs to',
  authority: [
    'governance/RULES.md #6 (exactly six services)',
    'governance/RULES.md #7 (an offer to start never starts anything)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/customer/kael-conversation-next-actions.ts',
  layer: 'unit',
  siblings: ['P370-kael-chat-next-steps', 'P311-customer-normal-chat-topic-gate'],
  mutation:
    'drop the .catch(null) on service_intent — an unsupported service fails the whole answer and the out-of-scope case turns red; read next_actions from the Kael row itself — the pairing case turns red',
} as const satisfies PillarManifest

function provider(serviceIntent: unknown) {
  return async (request: AIRequest) => ({
    success: true as const,
    content: JSON.stringify({
      public_reasoning_summary: ['Dựa trên mô tả của bạn.'],
      answer: 'Máy lạnh chảy nước thường do ống thoát nước bị nghẹt. Bạn tắt máy và lau khô trước nhé.',
      service_intent: serviceIntent,
      purpose: request.purpose,
    }),
    latencyMs: 10,
    usage: { costUsd: 0, inputTokens: 10, outputTokens: 10 },
  })
}

const ask = (surface: 'customer_normal' | 'customer_case', serviceIntent: unknown) => runCustomerAssistant({
  callAI: provider(serviceIntent),
  language: 'vi',
  message: 'Máy lạnh nhà mình bị chảy nước ở dàn lạnh',
  secrets: { knowledgeRetrievalEnabled: false },
  surface,
  ...(surface === 'customer_case' ? { serviceType: 'hvac' as const } : {}),
})

describe(`${PILLAR.id}: normal chat can offer to start a service, nothing more`, () => {
  it('keeps a supported service intent from normal chat', async () => {
    const answer = await ask('customer_normal', 'hvac')
    expect(answer.service_intent, pillarWhy(PILLAR, 'the customer described an air-conditioner problem')).toBe('hvac')
  })

  it('drops a service outside the six instead of failing the answer', async () => {
    const answer = await ask('customer_normal', 'gardening')
    expect(answer.answer).toContain('ống thoát nước')
    expect(answer.service_intent, pillarWhy(PILLAR, 'gardening is not a NestScout service')).toBeNull()
  })

  it('never offers to start a service from a case chat', async () => {
    const answer = await ask('customer_case', 'hvac')
    expect(answer.service_intent ?? null, pillarWhy(PILLAR, 'the case already has its service')).toBeNull()
  })

  it('pairs the start chip with the Kael reply that follows the customer turn carrying it', () => {
    const chip = startCaseNextAction('hvac', 'vi')
    expect(chip).toEqual({ id: 'start_case', kind: 'start_case', label: 'Bắt đầu xử lý: Điều hòa', service_type: 'hvac' })
    const customerTurnMetadata = { reply_next_actions: [chip] }
    expect(customerConversationNextActions('kael', customerTurnMetadata), pillarWhy(PILLAR, 'the exchange RPC stores metadata on the customer turn'))
      .toEqual({ next_actions: [chip] })
    expect(customerConversationNextActions('customer', customerTurnMetadata)).toEqual({})
    expect(customerConversationNextActions('kael', { reply_next_actions: [{ id: 'x', kind: 'confirm_offer', label: 'Xác nhận' }] })).toEqual({})
  })
})
