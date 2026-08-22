import { describe, expect, it, vi } from 'vitest'

import { deleteAccount } from '../../../../../supabase/functions/mobile-api/_shared/domains/account/account-deletion'
import { matchMeRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/me'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P40-role-aware-account-deletion',
  invariant:
    'customer and worker self-deletion share one authenticated idempotent boundary, preserve unresolved work and settlement blockers, and fail closed until every owned private storage object is removed',
  authority: [
    'App Store Review Guideline 5.1.1(v) (apps supporting account creation must offer account deletion in-app)',
    'governance/RULES.md #1 and #3 (server authority and idempotent workflow writes)',
    'governance/protocols/ai-data-security.md (PII is removed server-side without weakening financial evidence)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/account/account-deletion.ts',
  layer: 'security-negative',
  siblings: ['P10-per-actor-rls', 'P41-worker-account-deletion-ui'],
  mutation:
    'remove worker from the route roles, skip one storage bucket, or finalize after a storage removal error — the role, storage, or fail-closed case turns red',
} as const satisfies PillarManifest

const customerId = '11111111-1111-4111-8111-111111111111'
const workerId = '33333333-3333-4333-8333-333333333333'
const clientRequestId = '88888888-8888-4888-8888-888888888888'
const requestId = '77777777-7777-4777-8777-777777777777'
const input = {
  acknowledge_data_loss: true,
  client_request_id: clientRequestId,
  confirmation: 'XÓA TÀI KHOẢN',
} as const

function context({
  role,
  rpc,
  deleteUser = vi.fn(async () => ({ error: null })),
  remove = vi.fn(async (_bucket: string, _paths: string[]) => ({ data: [], error: null })),
}: {
  role: 'customer' | 'worker' | 'admin'
  rpc: ReturnType<typeof vi.fn>
  deleteUser?: ReturnType<typeof vi.fn>
  remove?: (bucket: string, paths: string[]) => Promise<{ data: unknown; error: unknown }>
}) {
  const userId = role === 'worker' ? workerId : customerId
  const fromStorage = vi.fn((bucket: string) => ({
    remove: (paths: string[]) => remove(bucket, paths),
  }))
  return {
    deleteUser,
    fromStorage,
    remove,
    rpc,
    value: {
      role,
      supabase: {
        auth: { admin: { deleteUser } },
        from: vi.fn(),
        rpc,
        storage: { from: fromStorage },
      },
      user: {
        id: userId,
        lastSignInAt: new Date().toISOString(),
      },
    } as MobileApiContext,
  }
}

function successfulRpc(prepared: Record<string, unknown>) {
  return vi.fn()
    .mockResolvedValueOnce({ data: [{
      checkpoint: 'database_scrubbed',
      request_id: requestId,
      request_status: 'processing',
      ...prepared,
    }], error: null })
    .mockResolvedValueOnce({ data: [{
      checkpoint: 'completed',
      request_id: requestId,
      request_status: 'completed',
    }], error: null })
}

describe('role-aware account deletion', () => {
  it('advertises the same authenticated route to customer and worker, never admin', () => {
    expect(
      matchMeRoute('/me/account-deletion', 'POST'),
      pillarWhy(PILLAR, 'route-level roles are the first authorization boundary'),
    ).toMatchObject({ roles: ['customer', 'worker'] })
  })

  it('keeps the customer RPC and removes both avatar and private Kael media', async () => {
    const runtime = context({
      role: 'customer',
      rpc: successfulRpc({
        avatar_storage_ref: `supabase://customer-avatars/${customerId}/avatar.jpg`,
        storage_refs: [
          `supabase://kael-chat-media/${customerId}/kael-chat/private_video_original/evidence.mov`,
          `supabase://kael-chat-media/${customerId}/kael-chat/model_vision/evidence.jpg`,
        ],
      }),
    })

    await expect(deleteAccount(runtime.value, input)).resolves.toEqual({
      account_deleted: true,
      request_id: requestId,
      retained_transaction_records: true,
    })

    expect(runtime.rpc).toHaveBeenNthCalledWith(1, 'prepare_customer_account_deletion_v2', {
      p_client_request_id: clientRequestId,
      p_customer_id: customerId,
    })
    expect(runtime.remove).toHaveBeenCalledWith('customer-avatars', [`${customerId}/avatar.jpg`])
    expect(runtime.remove).toHaveBeenCalledWith('kael-chat-media', [
      `${customerId}/kael-chat/private_video_original/evidence.mov`,
      `${customerId}/kael-chat/model_vision/evidence.jpg`,
    ])
    expect(runtime.rpc).toHaveBeenNthCalledWith(2, 'complete_customer_account_deletion', {
      p_client_request_id: clientRequestId,
      p_customer_id: customerId,
    })
  })

  it('removes every allow-listed worker object before soft-deleting auth and completing', async () => {
    const runtime = context({
      role: 'worker',
      rpc: successfulRpc({
        storage_refs: [
          `supabase://worker-avatars/${workerId}/avatar.jpg`,
          `supabase://worker-verification/${workerId}/cccd-front/front.jpg`,
          `supabase://worker-verification/${workerId}/cccd-back/back.jpg`,
          `supabase://kael-chat-media/${workerId}/kael-chat/model_vision/evidence.jpg`,
        ],
      }),
    })

    await expect(deleteAccount(runtime.value, input)).resolves.toMatchObject({
      account_deleted: true,
      request_id: requestId,
    })

    expect(runtime.rpc).toHaveBeenNthCalledWith(1, 'prepare_worker_account_deletion', {
      p_client_request_id: clientRequestId,
      p_worker_id: workerId,
    })
    expect(runtime.remove).toHaveBeenCalledWith('worker-avatars', [`${workerId}/avatar.jpg`])
    expect(runtime.remove).toHaveBeenCalledWith('worker-verification', [
      `${workerId}/cccd-front/front.jpg`,
      `${workerId}/cccd-back/back.jpg`,
    ])
    expect(runtime.remove).toHaveBeenCalledWith('kael-chat-media', [
      `${workerId}/kael-chat/model_vision/evidence.jpg`,
    ])
    expect(runtime.deleteUser).toHaveBeenCalledWith(workerId, true)
    expect(runtime.rpc).toHaveBeenNthCalledWith(2, 'complete_worker_account_deletion', {
      p_client_request_id: clientRequestId,
      p_worker_id: workerId,
    })
  })

  it('fails closed without deleting auth when a worker storage bucket cannot be cleaned', async () => {
    const remove = vi.fn(async (bucket: string) => ({
      data: null,
      error: bucket === 'worker-verification' ? { message: 'storage unavailable' } : null,
    }))
    const runtime = context({
      role: 'worker',
      remove,
      rpc: successfulRpc({
        storage_refs: [`supabase://worker-verification/${workerId}/selfie/selfie.jpg`],
      }),
    })

    await expect(deleteAccount(runtime.value, input)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_PROCESSING',
      status: 503,
    })
    expect(runtime.deleteUser).not.toHaveBeenCalled()
    expect(runtime.rpc).toHaveBeenCalledTimes(1)
  })

  it('keeps unresolved worker settlement as a conflict and never touches auth', async () => {
    const runtime = context({
      role: 'worker',
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: 'ACCOUNT_DELETION_BLOCKED_SETTLEMENT' },
      })),
    })

    await expect(deleteAccount(runtime.value, input)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_BLOCKED_SETTLEMENT',
      status: 409,
    })
    expect(runtime.deleteUser).not.toHaveBeenCalled()
  })

  it('rejects administrative accounts before any database or auth mutation', async () => {
    const runtime = context({ role: 'admin', rpc: vi.fn() })

    await expect(deleteAccount(runtime.value, input)).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
      status: 403,
    })
    expect(runtime.rpc).not.toHaveBeenCalled()
    expect(runtime.deleteUser).not.toHaveBeenCalled()
  })
})
