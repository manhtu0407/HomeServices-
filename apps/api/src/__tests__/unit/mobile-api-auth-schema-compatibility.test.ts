import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createEdgeAuthenticator } from '../../../../../supabase/functions/mobile-api/_shared/platform/auth'

describe('mobile-api auth schema compatibility', () => {
  const createClient = vi.fn()

  beforeEach(() => {
    createClient.mockReset()
  })

  it('keeps existing accounts active while account_state migration is pending', async () => {
    const single = vi.fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '42703',
          message: 'column profiles.account_state does not exist',
        },
      })
      .mockResolvedValueOnce({
        data: { role: 'customer' },
        error: null,
      })
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({ single })),
    }))
    createClient.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: '11111111-1111-4111-8111-111111111111',
              email: 'customer@example.com',
            },
          },
          error: null,
        })),
      },
      from: vi.fn(() => ({ select })),
    })

    const authenticate = createEdgeAuthenticator({
      supabaseUrl: 'https://staging.example.test',
      supabaseSecretKey: 'service-role-key',
    } as never, createClient as never)
    const result = await authenticate(new Request('https://api.example.test/services', {
      headers: { Authorization: 'Bearer customer-session-token' },
    }), ['customer'])

    expect(result).toMatchObject({
      success: true,
      role: 'customer',
      accountState: 'active',
    })
    expect(select).toHaveBeenNthCalledWith(1, 'role, account_state')
    expect(select).toHaveBeenNthCalledWith(2, 'role')
  })

  it('fails closed for profile errors unrelated to the pending migration', async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied',
      },
    })
    createClient.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: '11111111-1111-4111-8111-111111111111',
            },
          },
          error: null,
        })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single })),
        })),
      })),
    })

    const authenticate = createEdgeAuthenticator({
      supabaseUrl: 'https://staging.example.test',
      supabaseSecretKey: 'service-role-key',
    } as never, createClient as never)
    const result = await authenticate(new Request('https://api.example.test/services', {
      headers: { Authorization: 'Bearer customer-session-token' },
    }), ['customer'])

    expect(result).toEqual({
      success: false,
      error: 'Phiên đăng nhập hết hạn',
      status: 401,
    })
    expect(single).toHaveBeenCalledTimes(1)
  })
})
