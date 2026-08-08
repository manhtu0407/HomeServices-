import { afterEach, describe, expect, it, vi } from 'vitest'

import { queueAdminFetch } from '@/app/admin/kael-queue/client'

const trustedSupabaseUrl = 'https://abcdefghijklmnopqrst.supabase.co'
const trustedMobileApiBase = `${trustedSupabaseUrl}/functions/v1/mobile-api`
const queueItem = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  job_id: null,
  queue_type: 'demanding_customer',
  priority: 'high',
  status: 'open',
  escalation_level: 'hard',
  reason_code: 'high_stakes',
  response_summary: 'Needs a human decision.',
  safe_metadata: { purpose: 'price_synthesis' },
  created_at: '2026-08-07T00:00:00.000Z',
  updated_at: '2026-08-07T00:00:00.000Z',
  resolved_at: null,
  resolved_by: null,
  resolution_note: null,
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Kael queue admin client boundary', () => {
  it('accepts only canonical queue list and resolve paths', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      items: [queueItem], page: 1, limit: 30, next_page: null,
    }), { status: 200 }))

    await expect(queueAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      '/admin/kael-queue?status=open&limit=30',
      { fetchImpl, trustedSupabaseUrl },
    )).resolves.toMatchObject({ items: [queueItem] })

    await expect(queueAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      `/admin/kael-queue/${queueItem.id}/resolve`,
      {
        body: { note: 'Reviewed safely.' },
        fetchImpl: vi.fn(async () => new Response(JSON.stringify({
          ok: true,
          item: { ...queueItem, status: 'resolved', resolution_note: 'Reviewed safely.' },
        }), { status: 200 })),
        method: 'POST',
        trustedSupabaseUrl,
      },
    )).resolves.toMatchObject({ ok: true })
  })

  it.each([
    '/jobs',
    '/admin/kael-queue/../../jobs',
    '/admin/kael-queue/not-a-uuid/resolve',
    `/admin/kael-queue/${queueItem.id}/resolve?next=/jobs`,
    '/admin/kael-queue?status=open&status=resolved',
    '/admin/kael-queue?next=https://attacker.test',
    '/admin/kael-queue?limit=101',
    '/admin/kael-queue#fragment',
  ])('rejects a non-canonical path before attaching the token', async (path) => {
    const fetchImpl = vi.fn()
    await expect(queueAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      path,
      { fetchImpl, trustedSupabaseUrl },
    )).rejects.toThrow('Đường dẫn hàng đợi Kael không hợp lệ')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects untrusted origins and unsafe tokens before network I/O', async () => {
    const fetchImpl = vi.fn()
    await expect(queueAdminFetch(
      'https://attacker.test/functions/v1/mobile-api',
      'admin-token',
      '/admin/kael-queue',
      { fetchImpl, trustedSupabaseUrl },
    )).rejects.toThrow('Cấu hình mobile-api không hợp lệ')
    await expect(queueAdminFetch(
      trustedMobileApiBase,
      'token\nwith-control',
      '/admin/kael-queue',
      { fetchImpl, trustedSupabaseUrl },
    )).rejects.toThrow('Cần token phiên admin hợp lệ')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects malformed and oversized successful responses', async () => {
    await expect(queueAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      '/admin/kael-queue',
      {
        fetchImpl: vi.fn(async () => new Response('{broken', { status: 200 })),
        trustedSupabaseUrl,
      },
    )).rejects.toThrow('Phản hồi hàng đợi Kael không hợp lệ')

    const text = vi.fn(async () => '{"items":[]}')
    await expect(queueAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      '/admin/kael-queue',
      {
        fetchImpl: vi.fn(async () => ({
          headers: new Headers({ 'content-length': '99999999' }),
          ok: true,
          status: 200,
          text,
        } as unknown as Response)),
        trustedSupabaseUrl,
      },
    )).rejects.toThrow('Phản hồi hàng đợi Kael quá lớn')
    expect(text).not.toHaveBeenCalled()
  })

  it('aborts a stalled request', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const request = queueAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      '/admin/kael-queue',
      { fetchImpl, timeoutMs: 25, trustedSupabaseUrl },
    )
    const assertion = expect(request).rejects.toThrow('Quá thời gian kết nối mobile-api')
    await vi.advanceTimersByTimeAsync(26)
    await assertion
  })
})
