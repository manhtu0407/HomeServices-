import { describe, expect, it, vi } from 'vitest'

import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/http'
import {
  createCustomerAvatarUpload,
  createWorkerAvatarUpload,
  customerAvatarObjectPath,
  updateCustomerAvatar,
  updateWorkerAvatar,
  workerAvatarObjectPath,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/worker/avatar'
import { recordWorkerAppActiveMinute } from '../../../../../supabase/functions/mobile-api/_shared/domains/worker/workers'

const workerId = '33333333-3333-4333-8333-333333333333'
const customerId = '11111111-1111-4111-8111-111111111111'

function workerContext(supabase: unknown): MobileApiContext {
  return {
    success: true,
    user: { id: workerId },
    role: 'worker',
    supabase,
  }
}

function customerContext(supabase: unknown): MobileApiContext {
  return {
    success: true,
    user: { id: customerId },
    role: 'customer',
    supabase,
  }
}

describe('worker avatar and app-activity Edge boundary', () => {
  it('creates a signed private upload path owned by the authenticated worker', async () => {
    const createSignedUploadUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://storage.example.test/upload', token: 'signed-token' },
      error: null,
    }))
    const ctx = workerContext({
      storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
    })

    const result = await createWorkerAvatarUpload(ctx, {
      file_name: 'worker.jpg',
      file_size_bytes: 1234,
      mime_type: 'image/jpeg',
    })

    expect(result.object_path).toMatch(new RegExp(`^${workerId}/[0-9a-f-]+\\.jpg$`, 'i'))
    expect(result.avatar_ref).toBe(`supabase://worker-avatars/${result.object_path}`)
    expect(createSignedUploadUrl).toHaveBeenCalledWith(result.object_path)
  })

  it('rejects another worker path before touching Storage or the database', async () => {
    const storageFrom = vi.fn()
    const ctx = workerContext({ storage: { from: storageFrom } })

    await expect(updateWorkerAvatar(ctx, {
      avatar_ref: 'supabase://worker-avatars/44444444-4444-4444-8444-444444444444/avatar.jpg',
    })).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
    expect(storageFrom).not.toHaveBeenCalled()
  })

  it('rejects spoofed non-image bytes even when the object uses an image extension', async () => {
    const from = vi.fn(() => ({
      download: vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2, 3, 4])]), error: null })),
    }))
    const ctx = workerContext({ storage: { from } })

    await expect(updateWorkerAvatar(ctx, {
      avatar_ref: `supabase://worker-avatars/${workerId}/avatar.jpg`,
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA', status: 400 })
  })

  it('records activity only for the authenticated worker id passed by Edge', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        active_minutes: 18,
        incremented: true,
        last_active_at: '2026-07-13T14:01:00.000Z',
        worker_id: workerId,
      }],
      error: null,
    }))

    await expect(recordWorkerAppActiveMinute(workerContext({ rpc }))).resolves.toEqual({
      active_minutes: 18,
      incremented: true,
      last_active_at: '2026-07-13T14:01:00.000Z',
      worker_id: workerId,
    })
    expect(rpc).toHaveBeenCalledWith('record_worker_app_active_minute', { p_worker_id: workerId })
  })

  it('parses only canonical avatar refs with an optional exact owner check', () => {
    expect(workerAvatarObjectPath(`supabase://worker-avatars/${workerId}/avatar.webp`, workerId))
      .toBe(`${workerId}/avatar.webp`)
    expect(workerAvatarObjectPath(`supabase://worker-avatars/${workerId}/../avatar.webp`, workerId))
      .toBeNull()
  })
})

describe('customer avatar Edge boundary', () => {
  it('creates a signed private upload path in the customer avatar bucket', async () => {
    const createSignedUploadUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://storage.example.test/upload', token: 'signed-token' },
      error: null,
    }))
    const from = vi.fn(() => ({ createSignedUploadUrl }))

    const result = await createCustomerAvatarUpload(
      customerContext({ storage: { from } }),
      {
        file_name: 'customer.webp',
        file_size_bytes: 2345,
        mime_type: 'image/webp',
      },
    )

    expect(from).toHaveBeenCalledWith('customer-avatars')
    expect(result.object_path).toMatch(new RegExp(`^${customerId}/[0-9a-f-]+\\.webp$`, 'i'))
    expect(result.avatar_ref).toBe(`supabase://customer-avatars/${result.object_path}`)
  })

  it('rejects another customer path before touching Storage or the database', async () => {
    const storageFrom = vi.fn()

    await expect(updateCustomerAvatar(
      customerContext({ storage: { from: storageFrom } }),
      {
        avatar_ref: 'supabase://customer-avatars/22222222-2222-4222-8222-222222222222/avatar.jpg',
      },
    )).rejects.toMatchObject({ code: 'VALIDATION', status: 400 })
    expect(storageFrom).not.toHaveBeenCalled()
  })

  it('rejects non-image bytes and parses only canonical customer refs', async () => {
    const from = vi.fn(() => ({
      download: vi.fn(async () => ({
        data: new Blob([new Uint8Array([1, 2, 3, 4])]),
        error: null,
      })),
    }))

    await expect(updateCustomerAvatar(
      customerContext({ storage: { from } }),
      {
        avatar_ref: `supabase://customer-avatars/${customerId}/avatar.jpg`,
      },
    )).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA', status: 400 })

    expect(customerAvatarObjectPath(
      `supabase://customer-avatars/${customerId}/avatar.webp`,
      customerId,
    )).toBe(`${customerId}/avatar.webp`)
    expect(customerAvatarObjectPath(
      `supabase://customer-avatars/${customerId}/../avatar.webp`,
      customerId,
    )).toBeNull()
  })
})
