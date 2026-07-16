import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createBufferedResponse,
  fetchBufferedWithTimeout,
  readResponseBytesBounded,
  readResponseJsonBounded,
  readResponseTextBounded,
  ResponseBodyInvalidJsonError,
} from '../../../../../supabase/functions/_shared/network'

describe('Edge network response guard', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps the deadline active while the response body is being read', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('Aborted', 'AbortError'))
          }, { once: true })
        },
      })
      return new Response(body, { status: 200 })
    }))

    const pending = fetchBufferedWithTimeout('https://example.test/data', {}, {
      maxResponseBytes: 1024,
      timeoutMs: 100,
    })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(100)

    await assertion
  })

  it('relays a caller abort to the underlying fetch', async () => {
    let receivedSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      receivedSignal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })
    }))
    const caller = new AbortController()

    const pending = fetchBufferedWithTimeout('https://example.test/data', {
      signal: caller.signal,
    }, { maxResponseBytes: 1024, timeoutMs: 10_000 })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    caller.abort()

    await assertion
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('forces redirect rejection even when a caller requests follow mode', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    await fetchBufferedWithTimeout('https://example.test/data', {
      redirect: 'follow',
    }, { maxResponseBytes: 1024, timeoutMs: 10_000 })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/data',
      expect.objectContaining({ redirect: 'error' }),
    )
  })

  it('strictly validates buffered JSON responses when an SDK opts in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
      { headers: { 'content-type': 'application/json' } },
    )))

    await expect(fetchBufferedWithTimeout('https://example.test/rest/v1/jobs', {}, {
      maxResponseBytes: 1024,
      timeoutMs: 10_000,
      validateJsonResponses: true,
    })).rejects.toBeInstanceOf(ResponseBodyInvalidJsonError)
  })

  it('does not parse non-JSON storage responses when SDK validation is enabled', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, {
      headers: { 'content-type': 'image/jpeg' },
    })))

    const response = await fetchBufferedWithTimeout('https://example.test/storage/v1/object/job.jpg', {}, {
      maxResponseBytes: 1024,
      timeoutMs: 10_000,
      validateJsonResponses: true,
    })

    await expect(response.arrayBuffer()).resolves.toHaveProperty('byteLength', 3)
  })

  it('stops a chunked response as soon as it exceeds the byte limit', async () => {
    let canceled = false
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4))
        controller.enqueue(new Uint8Array(5))
      },
      cancel() {
        canceled = true
      },
    }))

    await expect(readResponseBytesBounded(response, 8)).rejects.toThrow('RESPONSE_BODY_TOO_LARGE')
    expect(canceled).toBe(true)
  })

  it('rejects malformed UTF-8 instead of decoding replacement characters', async () => {
    const response = new Response(new Uint8Array([0xc3, 0x28]))

    await expect(readResponseTextBounded(response, 8)).rejects.toBeInstanceOf(TypeError)
  })

  it.each([
    ['malformed UTF-8', new Uint8Array([0x7b, 0xc3, 0x28, 0x7d])],
    ['malformed JSON', new TextEncoder().encode('{')],
  ])('rejects %s before returning provider JSON', async (_label, bytes) => {
    await expect(readResponseJsonBounded(new Response(bytes), 32))
      .rejects.toBeInstanceOf(ResponseBodyInvalidJsonError)
  })

  it('returns bounded provider JSON only after strict decoding', async () => {
    await expect(readResponseJsonBounded(new Response('{"ok":true}'), 32))
      .resolves.toEqual({ ok: true })
  })

  it('normalizes transport headers when rebuilding a buffered response', async () => {
    const original = new Response('compressed upstream bytes', {
      headers: {
        'content-encoding': 'gzip',
        'content-length': '999',
        'content-type': 'application/json',
      },
    })

    const buffered = createBufferedResponse(original, new TextEncoder().encode('{}'))

    expect(buffered.headers.has('content-encoding')).toBe(false)
    expect(buffered.headers.get('content-length')).toBe('2')
    expect(buffered.headers.get('content-type')).toBe('application/json')
    await expect(buffered.text()).resolves.toBe('{}')
  })
})
