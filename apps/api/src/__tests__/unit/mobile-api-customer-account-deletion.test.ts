import { describe, expect, it, vi } from 'vitest'

import { deleteCustomerAccount } from '../../../../../supabase/functions/mobile-api/_shared/services/customer-account-deletion.service'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'

const customerId = '11111111-1111-4111-8111-111111111111'
const clientRequestId = '88888888-8888-4888-8888-888888888888'
const requestId = '77777777-7777-4777-8777-777777777777'
const input = {
  acknowledge_data_loss: true,
  client_request_id: clientRequestId,
  confirmation: 'XÓA TÀI KHOẢN',
} as const

function context({
  deleteUser = vi.fn(async () => ({ error: null })),
  removeAvatar = vi.fn(async () => ({ data: [], error: null })),
  role = 'customer',
  rpc = vi.fn()
    .mockResolvedValueOnce({
      data: [{
        avatar_storage_ref: `supabase://customer-avatars/${customerId}/avatar.jpg`,
        checkpoint: 'database_scrubbed',
        request_id: requestId,
        request_status: 'processing',
      }],
      error: null,
    })
    .mockResolvedValueOnce({
      data: [{
        checkpoint: 'completed',
        request_id: requestId,
        request_status: 'completed',
      }],
      error: null,
    }),
  signedInAt = new Date().toISOString(),
}: {
  deleteUser?: ReturnType<typeof vi.fn>
  removeAvatar?: ReturnType<typeof vi.fn>
  role?: MobileApiContext['role']
  rpc?: ReturnType<typeof vi.fn>
  signedInAt?: string
} = {}) {
  return {
    deleteUser,
    removeAvatar,
    rpc,
    value: {
      role,
      supabase: {
        auth: { admin: { deleteUser } },
        from: vi.fn(),
        rpc,
        storage: {
          from: vi.fn(() => ({ remove: removeAvatar })),
        },
      },
      user: {
        id: customerId,
        lastSignInAt: signedInAt,
      },
    } as MobileApiContext,
  }
}

describe('customer account deletion service', () => {
  it('scrubs database state, soft-deletes authentication, and finalizes the same request', async () => {
    const runtime = context()

    await expect(deleteCustomerAccount(runtime.value, input)).resolves.toEqual({
      account_deleted: true,
      request_id: requestId,
      retained_transaction_records: true,
    })

    expect(runtime.rpc).toHaveBeenNthCalledWith(1, 'prepare_customer_account_deletion', {
      p_client_request_id: clientRequestId,
      p_customer_id: customerId,
    })
    expect(runtime.deleteUser).toHaveBeenCalledWith(customerId, true)
    expect(runtime.removeAvatar).toHaveBeenCalledWith([`${customerId}/avatar.jpg`])
    expect(runtime.rpc).toHaveBeenNthCalledWith(2, 'complete_customer_account_deletion', {
      p_client_request_id: clientRequestId,
      p_customer_id: customerId,
    })
  })

  it('requires a recent sign-in before it mutates any account data', async () => {
    const runtime = context({
      signedInAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    })

    await expect(deleteCustomerAccount(runtime.value, input)).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
      status: 401,
    })
    expect(runtime.rpc).not.toHaveBeenCalled()
    expect(runtime.deleteUser).not.toHaveBeenCalled()
  })

  it('maps an active-job blocker to a safe conflict and never touches authentication', async () => {
    const runtime = context({
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: 'ACCOUNT_DELETION_BLOCKED_ACTIVE_JOB' },
      })),
    })

    await expect(deleteCustomerAccount(runtime.value, input)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_BLOCKED_ACTIVE_JOB',
      status: 409,
    })
    expect(runtime.deleteUser).not.toHaveBeenCalled()
  })

  it('returns an already-completed request without repeating the irreversible deletion', async () => {
    const runtime = context({
      rpc: vi.fn(async () => ({
        data: [{
          checkpoint: 'completed',
          request_id: requestId,
          request_status: 'completed',
        }],
        error: null,
      })),
    })

    await expect(deleteCustomerAccount(runtime.value, input)).resolves.toEqual({
      account_deleted: true,
      request_id: requestId,
      retained_transaction_records: true,
    })
    expect(runtime.rpc).toHaveBeenCalledTimes(1)
    expect(runtime.deleteUser).not.toHaveBeenCalled()
  })

  it('keeps the request retryable when authentication deletion fails', async () => {
    const runtime = context({
      deleteUser: vi.fn(async () => ({
        error: { code: 'provider_unavailable', status: 503 },
      })),
    })

    await expect(deleteCustomerAccount(runtime.value, input)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_PROCESSING',
      status: 503,
    })
    expect(runtime.rpc).toHaveBeenCalledTimes(1)
  })

  it('keeps the request retryable when the private avatar cannot be removed', async () => {
    const runtime = context({
      removeAvatar: vi.fn(async () => ({
        data: null,
        error: { message: 'storage unavailable' },
      })),
    })

    await expect(deleteCustomerAccount(runtime.value, input)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_PROCESSING',
      status: 503,
    })
    expect(runtime.deleteUser).not.toHaveBeenCalled()
    expect(runtime.rpc).toHaveBeenCalledTimes(1)
  })

  it('treats a missing authentication user as an idempotent retry and finishes the marker', async () => {
    const runtime = context({
      deleteUser: vi.fn(async () => ({
        error: { code: 'user_not_found', status: 404 },
      })),
    })

    await expect(deleteCustomerAccount(runtime.value, input)).resolves.toMatchObject({
      account_deleted: true,
      request_id: requestId,
    })
    expect(runtime.rpc).toHaveBeenCalledTimes(2)
  })

  it('does not allow worker or administrator accounts through the self-delete service', async () => {
    for (const role of ['worker', 'admin'] as const) {
      const runtime = context({ role })
      await expect(deleteCustomerAccount(runtime.value, input)).rejects.toMatchObject({
        code: 'AUTH_FORBIDDEN',
        status: 403,
      })
      expect(runtime.rpc).not.toHaveBeenCalled()
      expect(runtime.deleteUser).not.toHaveBeenCalled()
    }
  })
})
