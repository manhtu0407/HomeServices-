const mockFetch = jest.fn()

function captureExpectedRetryWarning(path: string) {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  return () => {
    expect(warning).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalledWith('mobile-api retry', {
      attempt: 1,
      backoffMs: 500,
      method: 'POST',
      path,
      reason: 'NETWORK_ERROR',
    })
    warning.mockRestore()
  }
}

jest.mock('../runtime-config', () => ({
  mobileRuntimeConfig: {
    apiBaseUrl: 'https://api.test/functions/v1/mobile-api',
    supabasePublishableKey: 'publishable-test',
  },
}))

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
    },
  },
}))

import { api } from '../api'
import { supabase } from '../supabase'

const mockGetSession = supabase?.auth.getSession as jest.Mock
const emptyResponseMeta = {
  operationId: null,
  releaseId: null,
  runId: null,
  supportCode: null,
  traceId: null,
}

describe('mobile API response guard', () => {
  beforeAll(() => {
    global.fetch = mockFetch as typeof fetch
  })

  beforeEach(() => {
    jest.useRealTimers()
    mockFetch.mockReset()
    mockGetSession.mockReset()
    mockGetSession.mockResolvedValue({ data: { session: null } })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('rejects an oversized API response before buffering it', async () => {
    const text = jest.fn(async () => '{"unreachable":true}')
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => '999999999' },
      ok: true,
      status: 200,
      text,
    })

    await expect(api.get('/services')).resolves.toMatchObject({
      success: false,
      code: 'RESPONSE_TOO_LARGE',
    })
    expect(text).not.toHaveBeenCalled()
  })

  it('refuses redirects for authenticated mobile API requests', async () => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: true,
      status: 200,
      text: jest.fn(async () => '{}'),
    })

    await api.postAuthenticated('/notifications/device-token', {}, 'session-token')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test/functions/v1/mobile-api/notifications/device-token',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
        redirect: 'error',
      }),
    )
  })

  it('uses a body client request id as the stable idempotency header for writes', async () => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: true,
      status: 201,
      text: jest.fn(async () => '{}'),
    })

    await api.post('/workers/me/kael/chat', {
      client_request_id: 'd6c9fe68-ae24-4f17-8d15-6eecaa9b7c70',
      language: 'vi',
      mode: 'normal',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test/functions/v1/mobile-api/workers/me/kael/chat',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'mobile:d6c9fe68-ae24-4f17-8d15-6eecaa9b7c70',
        }),
      }),
    )
  })

  it('uses the supplied token for an authenticated mobile API read', async () => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: true,
      status: 200,
      text: jest.fn(async () => '{}'),
    })

    await api.getAuthenticated('/kael/chat/session-a', 'session-token')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test/functions/v1/mobile-api/kael/chat/session-a',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
        redirect: 'error',
      }),
    )
  })

  it('rejects malformed successful JSON instead of casting it to the requested contract', async () => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: true,
      status: 200,
      text: jest.fn(async () => '{"broken":'),
    })

    await expect(api.get('/services')).resolves.toMatchObject({
      success: false,
      code: 'INVALID_RESPONSE',
      status: 200,
    })
  })

  it('rejects a successful top-level array when the mobile API contract requires an object', async () => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: true,
      status: 200,
      text: jest.fn(async () => '[]'),
    })

    await expect(api.get('/services')).resolves.toMatchObject({
      success: false,
      code: 'INVALID_RESPONSE',
      status: 200,
    })
  })

  it('rejects invalid UTF-8 response bytes as an invalid API response', async () => {
    let readCount = 0
    mockFetch.mockResolvedValue({
      body: {
        getReader: () => ({
          cancel: jest.fn(async () => undefined),
          read: jest.fn(async () => readCount++ === 0
            ? { done: false, value: new Uint8Array([0xc3, 0x28]) }
            : { done: true, value: undefined }),
          releaseLock: jest.fn(),
        }),
      },
      headers: { get: () => null },
      ok: true,
      status: 200,
    })

    await expect(api.get('/services')).resolves.toEqual({
      success: false,
      error: 'Phản hồi từ hệ thống không hợp lệ',
      code: 'INVALID_RESPONSE',
      meta: emptyResponseMeta,
      status: 200,
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('does not expose a non-string server error payload as a mobile error message', async () => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: false,
      status: 400,
      text: jest.fn(async () => JSON.stringify({
        code: 'INVALID_REQUEST',
        error: { private: 'unexpected provider detail' },
      })),
    })

    await expect(api.post('/places/autocomplete', {})).resolves.toEqual({
      success: false,
      error: 'Lỗi không xác định',
      code: 'INVALID_REQUEST',
      meta: emptyResponseMeta,
      status: 400,
    })
  })

  it('preserves a bounded human-readable server error and canonical code', async () => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: false,
      status: 409,
      text: jest.fn(async () => JSON.stringify({
        code: 'REQUEST_IN_PROGRESS',
        error: 'Yêu cầu này đang được xử lý',
      })),
    })

    await expect(api.post('/jobs', {})).resolves.toEqual({
      success: false,
      error: 'Yêu cầu này đang được xử lý',
      code: 'REQUEST_IN_PROGRESS',
      meta: emptyResponseMeta,
      status: 409,
    })
  })

  it.each([
    ['oversized', 'x'.repeat(513)],
    ['C0 control', 'Chi tiết riêng\u001b[31m'],
    ['bidi control', 'Chi tiết riêng\u202Ehidden'],
  ])('replaces an %s server error instead of exposing it', async (_label, error) => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: false,
      status: 400,
      text: jest.fn(async () => JSON.stringify({ code: 'VALIDATION', error })),
    })

    await expect(api.post('/places/autocomplete', {})).resolves.toEqual({
      success: false,
      error: 'Lỗi không xác định',
      code: 'VALIDATION',
      meta: emptyResponseMeta,
      status: 400,
    })
  })

  it.each([
    ['oversized', `NOT_FOUND_${'X'.repeat(64)}`],
    ['control-bearing', 'NOT_FOUND\u0000ADMIN'],
    ['non-canonical casing', 'not_found'],
    ['Unicode lookalike', 'N\u041ET_FOUND'],
  ])('replaces an %s error code so it cannot steer client branches', async (_label, code) => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: false,
      status: 404,
      text: jest.fn(async () => JSON.stringify({ code, error: 'Không tìm thấy yêu cầu' })),
    })

    await expect(api.get('/jobs/missing')).resolves.toEqual({
      success: false,
      error: 'Không tìm thấy yêu cầu',
      code: 'HTTP_404',
      meta: emptyResponseMeta,
      status: 404,
    })
  })

  it('enforces the request deadline while auth headers are still loading', async () => {
    jest.useFakeTimers()
    mockGetSession.mockImplementation(() => new Promise(() => undefined))

    const pending = api.post('/admin/kael/learning/candidates/test/approve', {})
    await jest.advanceTimersByTimeAsync(15_000)
    const outcome = await Promise.race([
      pending,
      Promise.resolve({ code: 'STILL_PENDING' }),
    ])

    expect(outcome).toMatchObject({ success: false, code: 'TIMEOUT' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('gives Agentic session creation one complete deadline without retrying an in-flight timeout', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(0)
    const abortTimes: number[] = []
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        abortTimes.push(Date.now())
        const error = new Error('request aborted')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    }))

    const pending = api.post('/kael/chat', {
      client_request_id: 'd6c9fe68-ae24-4f17-8d15-6eecaa9b7c70',
      message: 'Air conditioner is leaking water.',
      service_type: 'hvac',
    })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: false, code: 'TIMEOUT' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(abortTimes).toEqual([30_000])
  })

  it('gives a persisted Customer Kael turn one complete deadline without retrying an in-flight timeout', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(0)
    const abortTimes: number[] = []
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        abortTimes.push(Date.now())
        const error = new Error('request aborted')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    }))

    const pending = api.post('/me/kael/conversations/conversation-1/turn', {
      client_request_id: '4d390451-29df-4bb1-b05b-b7446f9237db',
      language: 'vi',
      message: 'Ổ cắm kêu lép bép.',
    })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: false, code: 'TIMEOUT' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(abortTimes).toEqual([30_000])
  })

  it('gives a scope-price preview enough time for one bounded escalation without retrying in flight', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(0)
    const abortTimes: number[] = []
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        abortTimes.push(Date.now())
        const error = new Error('request aborted')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    }))

    const pending = api.post('/jobs/job-1/kael-incident/preview-scope', {
      client_request_id: '4d390451-29df-4bb1-b05b-b7446f9237dc',
    })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: false, code: 'TIMEOUT' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(abortTimes).toEqual([45_000])
  })

  it('does not automatically replay a failed scope-price preview with the same durable id', async () => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: false,
      status: 503,
      text: jest.fn(async () => JSON.stringify({
        code: 'KAEL_ESTIMATE_UNAVAILABLE',
        error: 'Kael chưa tính được mức giá cân bằng.',
      })),
    })

    await expect(api.post('/jobs/job-1/kael-incident/preview-scope', {
      client_request_id: '4d390451-29df-4bb1-b05b-b7446f9237dd',
    })).resolves.toMatchObject({
      success: false,
      code: 'KAEL_ESTIMATE_UNAVAILABLE',
      status: 503,
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('gives idempotent Kael estimate confirmation the complete Agentic deadline', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(0)
    const abortTimes: number[] = []
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        abortTimes.push(Date.now())
        const error = new Error('request aborted')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    }))

    const pending = api.post('/kael/chat/session-1/confirm')
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: false, code: 'TIMEOUT' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(abortTimes).toEqual([30_000])
  })

  it('gives intake confirmation one complete Agentic deadline without retrying an in-flight timeout', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(0)
    const abortTimes: number[] = []
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        abortTimes.push(Date.now())
        const error = new Error('request aborted')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    }))

    const pending = api.post('/kael/chat/session-1/intake-confirmation', { decision: 'confirmed' })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: false, code: 'TIMEOUT' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(abortTimes).toEqual([30_000])
  })

  it('retries Kael estimate confirmation after a lost response', async () => {
    jest.useFakeTimers()
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockFetch
      .mockRejectedValueOnce(new TypeError('response lost after confirmation commit'))
      .mockResolvedValueOnce({
        body: null,
        headers: { get: () => null },
        ok: true,
        status: 200,
        text: jest.fn(async () => '{"job_id":"job-1","status":"broadcasting"}'),
      })

    const pending = api.post('/kael/chat/session-1/confirm')
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const firstHeaders = mockFetch.mock.calls[0][1]?.headers as Record<string, string>
    const retryHeaders = mockFetch.mock.calls[1][1]?.headers as Record<string, string>
    expect(firstHeaders['Idempotency-Key']).toMatch(
      /^mobile:post:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(retryHeaders['Idempotency-Key']).toBe(firstHeaders['Idempotency-Key'])
    expect(warning).toHaveBeenCalledWith('mobile-api retry', expect.objectContaining({
      method: 'POST',
      path: '/kael/chat/session-1/confirm',
      reason: 'NETWORK_ERROR',
    }))
  })

  it('does not automatically retry an HTTP failure from Kael estimate confirmation', async () => {
    jest.useFakeTimers()
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: false,
      status: 500,
      text: jest.fn(async () => '{"error":"confirmation failed","code":"DB_ERROR"}'),
    })

    const pending = api.post('/kael/chat/session-1/confirm')
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({
      success: false,
      code: 'DB_ERROR',
      status: 500,
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(warning).not.toHaveBeenCalled()
  })

  it('derives the idempotency key from a durable client request id', async () => {
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: true,
      status: 200,
      text: jest.fn(async () => '{"job_id":"job-1"}'),
    })

    await api.post('/jobs', {
      client_request_id: 'd6c9fe68-ae24-4f17-8d15-6eecaa9b7c67',
      description: 'The kitchen pipe keeps leaking.',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'mobile:d6c9fe68-ae24-4f17-8d15-6eecaa9b7c67',
        }),
      }),
    )
  })

  it('retries intake confirmation after a lost response', async () => {
    jest.useFakeTimers()
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockFetch
      .mockRejectedValueOnce(new TypeError('response lost after intake confirmation'))
      .mockResolvedValueOnce({
        body: null,
        headers: { get: () => null },
        ok: true,
        status: 200,
        text: jest.fn(async () => '{"session":{"id":"session-1"},"turns":[]}'),
      })

    const pending = api.post('/kael/chat/session-1/intake-confirmation', { decision: 'confirmed' })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const firstHeaders = mockFetch.mock.calls[0][1]?.headers as Record<string, string>
    const retryHeaders = mockFetch.mock.calls[1][1]?.headers as Record<string, string>
    expect(firstHeaders['Idempotency-Key']).toMatch(
      /^mobile:post:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(retryHeaders['Idempotency-Key']).toBe(firstHeaders['Idempotency-Key'])
    expect(warning).toHaveBeenCalledWith('mobile-api retry', expect.objectContaining({
      method: 'POST',
      path: '/kael/chat/session-1/intake-confirmation',
      reason: 'NETWORK_ERROR',
    }))
  })

  it('does not retry worker application creation without an idempotency key', async () => {
    jest.useFakeTimers()
    mockFetch.mockRejectedValue(new TypeError('connection reset after upload'))

    const pending = api.post('/worker-applications', {
      contact: 'worker@example.com',
      language: 'vi',
      source: 'auth_worker_create',
    })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({
      success: false,
      code: 'NETWORK_ERROR',
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('keeps retrying worker application creation when the request is idempotent', async () => {
    jest.useFakeTimers()
    const assertRetryWarning = captureExpectedRetryWarning('/worker-applications')
    mockFetch
      .mockRejectedValueOnce(new TypeError('temporary connection failure'))
      .mockResolvedValueOnce({
        body: null,
        headers: { get: () => null },
        ok: true,
        status: 200,
        text: jest.fn(async () => '{"application_id":"application-1"}'),
      })

    const pending = api.post('/worker-applications', {
      client_request_id: 'd6c9fe68-ae24-4f17-8d15-6eecaa9b7c66',
      contact: 'worker@example.com',
      language: 'vi',
      source: 'auth_worker_create',
    })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    assertRetryWarning()
  })

  it('retries job creation only when it carries the durable submit id', async () => {
    jest.useFakeTimers()
    const assertRetryWarning = captureExpectedRetryWarning('/jobs')
    mockFetch
      .mockRejectedValueOnce(new TypeError('response lost after job commit'))
      .mockResolvedValueOnce({
        body: null,
        headers: { get: () => null },
        ok: true,
        status: 200,
        text: jest.fn(async () => '{"job_id":"job-1"}'),
      })

    const pending = api.post('/jobs', {
      client_request_id: 'd6c9fe68-ae24-4f17-8d15-6eecaa9b7c67',
      description: 'The kitchen pipe keeps leaking.',
    })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    assertRetryWarning()
  })

  it('retries normal Customer Kael session creation with its durable request id', async () => {
    jest.useFakeTimers()
    const assertRetryWarning = captureExpectedRetryWarning('/me/kael/conversations')
    mockFetch
      .mockRejectedValueOnce(new TypeError('response lost after conversation creation'))
      .mockResolvedValueOnce({
        body: null,
        headers: { get: () => null },
        ok: true,
        status: 201,
        text: jest.fn(async () => '{"session":{"id":"conversation-1"},"turns":[]}'),
      })

    const pending = api.post('/me/kael/conversations', {
      client_request_id: 'b7500000-0000-4000-8000-000000000002',
      mode: 'normal',
    })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const headers = mockFetch.mock.calls.map(([, init]) => (
      (init?.headers as Record<string, string>)['Idempotency-Key']
    ))
    expect(headers).toEqual([
      'mobile:b7500000-0000-4000-8000-000000000002',
      'mobile:b7500000-0000-4000-8000-000000000002',
    ])
    assertRetryWarning()
  })

  it('retries a worker scope change protected by its required request id', async () => {
    jest.useFakeTimers()
    const assertRetryWarning = captureExpectedRetryWarning('/jobs/job-1/scope-change')
    mockFetch
      .mockRejectedValueOnce(new TypeError('response lost after scope commit'))
      .mockResolvedValueOnce({
        body: null,
        headers: { get: () => null },
        ok: true,
        status: 200,
        text: jest.fn(async () => '{"scope_change_id":"scope-1"}'),
      })

    const pending = api.post('/jobs/job-1/scope-change', {
      client_request_id: 'd6c9fe68-ae24-4f17-8d15-6eecaa9b7c68',
      new_description: 'Replace the damaged cable.',
      reason: 'The insulation is burned.',
      photo_urls: [],
    })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    assertRetryWarning()
  })

  it('retries worker Kael turns protected by the atomic turn request id', async () => {
    jest.useFakeTimers()
    const assertRetryWarning = captureExpectedRetryWarning('/workers/me/kael/chat/session-1')
    mockFetch
      .mockRejectedValueOnce(new TypeError('response lost after Kael turn commit'))
      .mockResolvedValueOnce({
        body: null,
        headers: { get: () => null },
        ok: true,
        status: 200,
        text: jest.fn(async () => '{"session":{"id":"session-1"}}'),
      })

    const pending = api.post('/workers/me/kael/chat/session-1', {
      client_request_id: 'd6c9fe68-ae24-4f17-8d15-6eecaa9b7c69',
      message: 'Should I isolate this breaker?',
      media_refs: [],
      language: 'en',
    })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    assertRetryWarning()
  })

  it('retries a Kael incident signal only when it carries a durable request id', async () => {
    jest.useFakeTimers()
    const assertRetryWarning = captureExpectedRetryWarning('/jobs/job-1/kael-incident')
    mockFetch
      .mockRejectedValueOnce(new TypeError('temporary connection failure'))
      .mockResolvedValueOnce({
        body: null,
        headers: { get: () => null },
        ok: true,
        status: 200,
        text: jest.fn(async () => '{"incident":{"id":"incident-1"}}'),
      })

    const pending = api.post('/jobs/job-1/kael-incident', {
      client_request_id: 'b7600000-0000-4000-8000-000000000001',
      new_description: 'Replace the damaged cable.',
      photo_urls: [],
      reason: 'The insulation is burned.',
    })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    assertRetryWarning()
  })

  it('retries a finalized incident scope proposal only with its durable request id', async () => {
    jest.useFakeTimers()
    const assertRetryWarning = captureExpectedRetryWarning('/jobs/job-1/kael-incident/propose-scope')
    mockFetch
      .mockRejectedValueOnce(new TypeError('response lost after commit'))
      .mockResolvedValueOnce({
        body: null,
        headers: { get: () => null },
        ok: true,
        status: 200,
        text: jest.fn(async () => '{"incident":{"id":"incident-1","status":"scope_proposed"},"scope_change":{"scope_change_id":"scope-1"}}'),
      })

    const pending = api.post('/jobs/job-1/kael-incident/propose-scope', {
      client_request_id: 'b7500000-0000-4000-8000-000000000001',
    })
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    assertRetryWarning()
  })

  it('does not retry an incident scope proposal without a durable request id', async () => {
    jest.useFakeTimers()
    mockFetch.mockRejectedValue(new TypeError('response lost after upload'))

    const pending = api.post('/jobs/job-1/kael-incident/propose-scope', {})
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ success: false, code: 'NETWORK_ERROR' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
