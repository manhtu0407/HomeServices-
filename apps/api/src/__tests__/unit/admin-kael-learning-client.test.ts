import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  edgeAdminFetch,
  resolveTrustedMobileApiBase,
  serviceLabel,
} from '@/app/admin/kael-learning/client'

describe('Kael learning admin client boundary', () => {
  const trustedSupabaseUrl = 'https://abcdefghijklmnopqrst.supabase.co'
  const trustedMobileApiBase = `${trustedSupabaseUrl}/functions/v1/mobile-api`

  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts only a fixed mobile-api endpoint without credentials, query, or hash', () => {
    expect(resolveTrustedMobileApiBase(
      `${trustedMobileApiBase}/`,
      trustedSupabaseUrl,
    ))
      .toBe(trustedMobileApiBase)
    expect(resolveTrustedMobileApiBase(
      'http://127.0.0.1:54321/functions/v1/mobile-api',
      'http://127.0.0.1:54321',
    ))
      .toBe('http://127.0.0.1:54321/functions/v1/mobile-api')

    expect(resolveTrustedMobileApiBase('https://attacker.test/collect')).toBeNull()
    expect(resolveTrustedMobileApiBase(
      'https://attacker.test/functions/v1/mobile-api',
      trustedSupabaseUrl,
    )).toBeNull()
    expect(resolveTrustedMobileApiBase(
      'https://attacker.test/functions/v1/mobile-api',
      'https://attacker.test',
    )).toBeNull()
    expect(resolveTrustedMobileApiBase(
      'http://127.0.0.1:54322/functions/v1/mobile-api',
      'http://127.0.0.1:54321',
    )).toBeNull()
    expect(resolveTrustedMobileApiBase('http://abcdefghijklmnopqrst.supabase.co/functions/v1/mobile-api')).toBeNull()
    expect(resolveTrustedMobileApiBase('https://user:pass@abcdefghijklmnopqrst.supabase.co/functions/v1/mobile-api')).toBeNull()
    expect(resolveTrustedMobileApiBase(`${trustedMobileApiBase}?next=evil`)).toBeNull()
  })

  it('refuses to attach the admin bearer token to an untrusted origin with the exact mobile-api path', async () => {
    const fetchImpl = vi.fn()

    await expect(edgeAdminFetch(
      'https://attacker.test/functions/v1/mobile-api',
      'admin-token',
      '/admin/kael/learning/candidates?state=manual_review',
      { fetchImpl, trustedSupabaseUrl },
    )).rejects.toThrow('Cấu hình mobile-api không hợp lệ')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses to attach the admin bearer token to non-learning routes', async () => {
    const fetchImpl = vi.fn()

    await expect(edgeAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      '/jobs',
      { fetchImpl, trustedSupabaseUrl },
    )).rejects.toThrow('Đường dẫn quản trị không hợp lệ')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    '/admin/kael/learning/../../jobs',
    '/admin/kael/learning/%2e%2e/%2e%2e/jobs',
    '/admin/kael/learning/candidates?state=manual_review#ignored',
    '/admin/kael/learning/candidates/not-a-uuid/approve',
    '/admin/kael/learning/candidates?state=manual_review&next=/jobs',
  ])('rejects a non-canonical admin learning path before attaching the token', async (path) => {
    const fetchImpl = vi.fn()

    await expect(edgeAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      path,
      { fetchImpl, trustedSupabaseUrl },
    )).rejects.toThrow('Đường dẫn quản trị không hợp lệ.')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('aborts a stalled admin request instead of retaining the token indefinitely', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))

    const request = edgeAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      '/admin/kael/learning/candidates?state=manual_review',
      { fetchImpl, timeoutMs: 25, trustedSupabaseUrl },
    )
    const assertion = expect(request).rejects.toThrow('Quá thời gian kết nối mobile-api')
    await vi.advanceTimersByTimeAsync(26)
    await assertion
  })

  it('rejects an oversized admin response before buffering it', async () => {
    const text = vi.fn(async () => '{"unreachable":true}')
    const fetchImpl = vi.fn(async () => ({
      headers: new Headers({ 'content-length': '99999999' }),
      ok: true,
      status: 200,
      text,
    } as unknown as Response))

    await expect(edgeAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      '/admin/kael/learning/candidates?state=manual_review',
      { fetchImpl, trustedSupabaseUrl },
    )).rejects.toThrow('Phản hồi mobile-api quá lớn.')
    expect(text).not.toHaveBeenCalled()
  })

  it.each(['{broken', '[]', '', '{"candidates":[{"id":7}]}'])('rejects a malformed successful admin response', async (body) => {
    const fetchImpl = vi.fn(async () => new Response(body, {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }))

    await expect(edgeAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      '/admin/kael/learning/candidates?state=manual_review',
      { fetchImpl, trustedSupabaseUrl },
    )).rejects.toThrow('Phản hồi mobile-api không hợp lệ.')
  })

  it('rejects a successful review response that omits its candidate identity', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":true,"status":"approved"}', {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }))

    await expect(edgeAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      '/admin/kael/learning/candidates/123e4567-e89b-12d3-a456-426614174000/approve',
      { fetchImpl, trustedSupabaseUrl },
    )).rejects.toThrow('Phản hồi mobile-api không hợp lệ.')
  })

  it('accepts a bounded candidate response with the production contract', async () => {
    const body = {
      candidates: [{
        id: '123e4567-e89b-42d3-a456-426614174000',
        candidate_type: 'service_knowledge_candidate',
        affected_service: 'plumbing',
        affected_problem: 'leaking_pipe',
        affected_district: 'quan_7',
        confidence: 0.87,
        evidence_count: 12,
        status: 'manual_review',
        audit_reason: null,
        created_at: '2026-07-15T01:02:03.000Z',
        suggested_payload: { skill_id: 'LS5-service-knowledge' },
        evidence_snapshot: { source: 'completed_reviewed_jobs' },
      }],
    }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))

    await expect(edgeAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      '/admin/kael/learning/candidates?state=manual_review',
      { fetchImpl, trustedSupabaseUrl },
    )).resolves.toEqual(body)
  })

  it('rejects redirects before attaching an admin bearer token to another hop', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"candidates":[]}', { status: 200 }))

    await edgeAdminFetch(
      trustedMobileApiBase,
      'admin-token',
      '/admin/kael/learning/candidates?state=manual_review',
      { fetchImpl, trustedSupabaseUrl },
    )

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'error' }),
    )
  })

  it.each(['token\nwith-control', 'x'.repeat(8_193)])(
    'rejects an unsafe admin bearer token before network I/O',
    async (token) => {
      const fetchImpl = vi.fn()

      await expect(edgeAdminFetch(
        trustedMobileApiBase,
        token,
        '/admin/kael/learning/candidates?state=manual_review',
        { fetchImpl, trustedSupabaseUrl },
      )).rejects.toThrow('Cần token phiên admin hợp lệ.')
      expect(fetchImpl).not.toHaveBeenCalled()
    },
  )

  it.each([`spoof\u202Egnp.exe`, 'x'.repeat(513)])(
    'does not surface unsafe server error text in the admin UI',
    async (serverError) => {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: serverError }), {
        status: 400,
      }))

      await expect(edgeAdminFetch(
        trustedMobileApiBase,
        'admin-token',
        '/admin/kael/learning/candidates?state=manual_review',
        { fetchImpl, trustedSupabaseUrl },
      )).rejects.toThrow('HTTP 400')
    },
  )

  it('labels all six supported services distinctly', () => {
    const labels = [
      serviceLabel('electrical'),
      serviceLabel('plumbing'),
      serviceLabel('cleaning'),
      serviceLabel('hvac'),
      serviceLabel('upholstery'),
      serviceLabel('handyman'),
    ]

    expect(new Set(labels).size).toBe(6)
    expect(serviceLabel(null)).toBe('Toàn hệ thống')
  })
})
