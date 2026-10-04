import { describe, expect, it, vi } from 'vitest'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P301-normal-chat-suggestions-router',
  invariant: 'Customer and Worker normal-chat suggestion requests reach only their matching authenticated role service, while cross-role routes and actor-supplied scope fields are refused before service dispatch',
  authority: [
    'governance/RULES.md #0 (mobile-api is the store-bound runtime boundary)',
    'governance/Plan.md normal-chat suggestions API contract',
  ],
  target: 'supabase/functions/mobile-api/_shared/http.ts',
  layer: 'integration',
  siblings: ['P252-kael-chat-http-roundtrip', 'P300-normal-chat-suggestions'],
  mutation: 'swap either role-specific suggestions dispatch case or route role; the successful route or cross-role refusal assertion fails',
} as const satisfies PillarManifest

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111'
const WORKER_ID = '33333333-3333-4333-8333-333333333333'
const CUSTOMER_CONVERSATION_ID = 'c300abcd-0000-4000-8000-0000000000c1'
const WORKER_SESSION_ID = 'c300abcd-0000-4000-8000-0000000000d1'
const SOURCE_TURN_ID = 'c300abcd-0000-4000-8000-0000000000a1'
const REQUEST_BODY = { language: 'vi', source_turn_id: SOURCE_TURN_ID }

const CUSTOMER_URL = `https://example.test/mobile-api/me/kael/conversations/${CUSTOMER_CONVERSATION_ID}/suggestions`
const WORKER_URL = `https://example.test/mobile-api/workers/me/kael/chat/${WORKER_SESSION_ID}/suggestions`

function authFor(role: 'customer' | 'worker'): MobileApiAuthResult {
  return {
    success: true,
    user: { id: role === 'customer' ? CUSTOMER_ID : WORKER_ID },
    role,
    supabase: {},
    userSupabase: {},
  }
}

function handlerFor(role: 'customer' | 'worker', service: ReturnType<typeof vi.fn>) {
  const services = role === 'customer'
    ? { createCustomerKaelConversationSuggestions: service }
    : { createWorkerKaelChatSuggestions: service }

  return createMobileApiHandler({
    authenticate: vi.fn(async () => authFor(role)),
    services: services as unknown as MobileApiServices,
  })
}

function withPillarContext<T>(run: () => Promise<T>, detail: string) {
  return run().catch((error) => {
    if (error instanceof Error) error.message = `${pillarWhy(PILLAR, detail)}\n\n${error.message}`
    throw error
  })
}

describe('P301 normal-chat suggestion route dispatch', () => {
  it('dispatches Customer and Worker requests to their own authenticated services', async () => {
    const customerSuggestions = vi.fn(async (
      _ctx: Parameters<MobileApiServices['createCustomerKaelConversationSuggestions']>[0],
      conversationId: string,
      input: Parameters<MobileApiServices['createCustomerKaelConversationSuggestions']>[2],
    ) => ({
      status: 'ready' as const,
      session_id: conversationId,
      source_turn_id: input.source_turn_id,
      language: input.language,
      suggestions: [{ id: 'customer-suggestion', text: 'Tôi muốn hỏi thêm.' }],
    }))
    const workerSuggestions = vi.fn(async (
      _ctx: Parameters<MobileApiServices['createWorkerKaelChatSuggestions']>[0],
      sessionId: string,
      input: Parameters<MobileApiServices['createWorkerKaelChatSuggestions']>[2],
    ) => ({
      status: 'ready' as const,
      session_id: sessionId,
      source_turn_id: input.source_turn_id,
      language: input.language,
      suggestions: [{ id: 'worker-suggestion', text: 'Tôi muốn hỏi thêm.' }],
    }))
    const customerHandler = handlerFor('customer', customerSuggestions)
    const workerHandler = handlerFor('worker', workerSuggestions)

    await withPillarContext(async () => {
      const customerResponse = await customerHandler(new Request(CUSTOMER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(REQUEST_BODY),
      }))
      const workerResponse = await workerHandler(new Request(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(REQUEST_BODY),
      }))

      expect(customerResponse.status).toBe(200)
      expect(await customerResponse.json()).toMatchObject({
        status: 'ready',
        session_id: CUSTOMER_CONVERSATION_ID,
        source_turn_id: SOURCE_TURN_ID,
        language: 'vi',
        suggestions: [{ id: 'customer-suggestion' }],
      })
      expect(workerResponse.status).toBe(200)
      expect(await workerResponse.json()).toMatchObject({
        status: 'ready',
        session_id: WORKER_SESSION_ID,
        source_turn_id: SOURCE_TURN_ID,
        language: 'vi',
        suggestions: [{ id: 'worker-suggestion' }],
      })
      expect(customerSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'customer' }),
        CUSTOMER_CONVERSATION_ID,
        REQUEST_BODY,
      )
      expect(workerSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'worker' }),
        WORKER_SESSION_ID,
        REQUEST_BODY,
      )
    }, 'each endpoint returns only the matching role-scoped service response')
  })

  it('refuses cross-role routes and actor-supplied scope before service dispatch', async () => {
    const customerSuggestions = vi.fn()
    const workerSuggestions = vi.fn()
    const customerHandler = handlerFor('customer', customerSuggestions)
    const workerHandler = handlerFor('worker', workerSuggestions)

    await withPillarContext(async () => {
      const customerBodyWithActor = await customerHandler(new Request(CUSTOMER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...REQUEST_BODY, actor_id: CUSTOMER_ID }),
      }))
      const workerBodyWithActor = await workerHandler(new Request(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...REQUEST_BODY, actor_id: WORKER_ID }),
      }))
      const customerToWorker = await customerHandler(new Request(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(REQUEST_BODY),
      }))
      const workerToCustomer = await workerHandler(new Request(CUSTOMER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(REQUEST_BODY),
      }))

      expect(customerBodyWithActor.status).toBe(400)
      expect(workerBodyWithActor.status).toBe(400)
      expect(customerToWorker.status).toBe(403)
      expect(workerToCustomer.status).toBe(403)
      expect(customerSuggestions).not.toHaveBeenCalled()
      expect(workerSuggestions).not.toHaveBeenCalled()
    }, 'unauthorized role and caller-selected actor scope never reach either service')
  })
})
