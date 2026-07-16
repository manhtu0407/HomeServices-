import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createAnthropicMessageBatch,
  retrieveAnthropicBatchResults,
  retrieveAnthropicMessageBatch,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/provider-batch'

const secrets = { anthropicApiKey: 'test-key' }
const requests = [{
  custom_id: 'candidate-1',
  params: {
    max_tokens: 100,
    messages: [{ role: 'user', content: 'test' }],
    model: 'claude-sonnet-4-6',
  },
}]

describe('Anthropic batch retry safety', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not replay batch creation after an ambiguous transport failure', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async () => {
      throw new TypeError('connection reset after upload')
    })

    const pending = createAnthropicMessageBatch(secrets, requests, fetcher as typeof fetch)
    const assertion = expect(pending).rejects.toThrow('connection reset after upload')
    await vi.runAllTimersAsync()

    await assertion
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects redirects on credentialed batch requests', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: 'batch-1',
      processing_status: 'in_progress',
    })))

    await retrieveAnthropicMessageBatch(secrets, 'batch-1', fetcher as typeof fetch)

    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'error' }),
    )
  })

  it('does not replay batch creation after an ambiguous server failure', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async () => new Response('{"error":"failed"}', { status: 500 }))

    const pending = createAnthropicMessageBatch(secrets, requests, fetcher as typeof fetch)
    const assertion = expect(pending).rejects.toThrow('Anthropic batch failed: 500')
    await vi.runAllTimersAsync()

    await assertion
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps bounded retries for idempotent batch reads', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError('temporary network failure'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'batch-1',
        processing_status: 'in_progress',
      })))

    const pending = retrieveAnthropicMessageBatch(secrets, 'batch-1', fetcher as typeof fetch)
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ id: 'batch-1' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ redirect: 'error' }),
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ redirect: 'error' }),
    )
  })

  it('does not retry a deterministic oversized batch response', async () => {
    const fetcher = vi.fn(async () => new Response(null, {
      headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
      status: 200,
    }))

    await expect(retrieveAnthropicMessageBatch(secrets, 'batch-1', fetcher as typeof fetch))
      .rejects.toThrow('RESPONSE_BODY_TOO_LARGE')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([null, [], { id: 'batch-1', processing_status: 'unknown' }, {
    id: 'batch-1',
    processing_status: 'ended',
    request_counts: { succeeded: -1 },
  }, {
    id: 'batch-1',
    processing_status: 'ended',
    ended_at: '2026-02-30T00:00:00Z',
  }])('rejects malformed successful batch summaries: %j', async (payload) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))

    await expect(retrieveAnthropicMessageBatch(secrets, 'batch-1', fetcher as typeof fetch))
      .rejects.toThrow('Anthropic batch response invalid shape')
  })

  it.each([
    'not-json',
    'null',
    JSON.stringify({ custom_id: 'candidate-1', result: { type: 'unknown' } }),
    JSON.stringify({ custom_id: 'candidate-1', result: { type: 'succeeded' } }),
  ])('rejects malformed successful batch result rows without casting them: %s', async (line) => {
    const fetcher = vi.fn(async () => new Response(`${line}\n`, { status: 200 }))

    await expect(retrieveAnthropicBatchResults(secrets, 'batch-1', fetcher as typeof fetch))
      .rejects.toThrow(/Anthropic batch result invalid/)
  })

  it('does not expose provider response bodies through HTTP errors', async () => {
    const fetcher = vi.fn(async () => new Response('secret provider detail', { status: 403 }))

    const error = await retrieveAnthropicBatchResults(secrets, 'batch-1', fetcher as typeof fetch)
      .then(() => null, (reason: unknown) => reason)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Anthropic batch results failed: 403')
    expect((error as Error).message).not.toContain('secret provider detail')
  })

  it('rejects malformed UTF-8 in a successful batch results response', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([0xc3, 0x28]), {
      status: 200,
    }))

    await expect(retrieveAnthropicBatchResults(secrets, 'batch-1', fetcher as typeof fetch))
      .rejects.toBeInstanceOf(TypeError)
  })
})
