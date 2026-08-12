import { describe, expect, it } from 'vitest'
import { customerConversationDb } from '../../../../../supabase/functions/mobile-api/_shared/domains/customer/kael-conversation-turn'

describe('customer Kael conversation database access', () => {
  it('uses the authenticated Edge service client for server-owned conversation writes', () => {
    const serviceClient = { from: () => serviceClient }

    const client = customerConversationDb({
      role: 'customer',
      supabase: serviceClient,
    } as never)

    expect(client).toBe(serviceClient)
  })

  it('keeps a direct service invocation compatible when no privileged client exists', () => {
    const userClient = { from: () => userClient }

    const client = customerConversationDb({
      role: 'customer',
      supabase: userClient,
    } as never)

    expect(client).toBe(userClient)
  })

  it('rejects a non-customer before exposing any database client', () => {
    expect(() => customerConversationDb({
      role: 'admin',
      supabase: {},
    } as never)).toThrow('Chỉ khách hàng mới được dùng cuộc trò chuyện Kael này')
  })
})
