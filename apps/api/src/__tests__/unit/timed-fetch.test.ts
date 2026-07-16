import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTimedFetch } from '@/lib/supabase/timed-fetch'

describe('createTimedFetch', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('aborts an unresolved fetch at the configured deadline', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    )))

    const pending = createTimedFetch(100)('http://localhost/health')
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(100)

    await assertion
  })

  it('relays an upstream abort signal', async () => {
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    )))
    const controller = new AbortController()

    const pending = createTimedFetch(10_000)('http://localhost/profile', {
      signal: controller.signal,
    })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()

    await assertion
  })

  it('clears the deadline after a successful response', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))

    const response = await createTimedFetch(100)('http://localhost/health')

    expect(response.status).toBe(204)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects redirects before a privileged Supabase request can follow them', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await createTimedFetch(100)('https://project.supabase.co/rest/v1/profiles', {
      headers: { authorization: 'Bearer service-role-token' },
      redirect: 'follow',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/profiles',
      expect.objectContaining({ redirect: 'error' }),
    )
  })

  it('keeps the deadline active while Supabase consumes the response body', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
      new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('Aborted', 'AbortError'))
          }, { once: true })
        },
      }))
    )))

    const pending = createTimedFetch(100)('http://localhost/profile')
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(100)

    await assertion
  })

  it('rejects an oversized Supabase response before buffering it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', {
      headers: { 'content-length': '99999999' },
    })))

    await expect(createTimedFetch(10_000)('http://localhost/profile'))
      .rejects.toThrow('RESPONSE_BODY_TOO_LARGE')
  })
})
