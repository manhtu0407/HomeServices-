import { describe, expect, it, vi } from 'vitest'

import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'
import {
  createWorkerAvatarUpload,
  updateWorkerAvatar,
  workerAvatarObjectPath,
} from '../../../../../supabase/functions/mobile-api/_shared/services/workers/avatar'
import { recordWorkerAppActiveMinute } from '../../../../../supabase/functions/mobile-api/_shared/services/workers/index'

const workerId = '33333333-3333-4333-8333-333333333333'

function workerContext(supabase: unknown): MobileApiContext {
  return {
    success: true,
    user: { id: workerId },
    role: 'worker',
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
