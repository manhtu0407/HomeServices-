import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  ResponseBodyInvalidEncodingError,
  ResponseBodyTooLargeError,
  readResponseBytesBounded,
  readResponseTextBounded,
} from '@/lib/http/response'

export const PILLAR = {
  id: 'P02-bounded-response-read',
  invariant:
    'a provider response is read only up to maxBytes; an oversized body is refused and its stream cancelled, whatever the content-length header claims',
  authority: [
    'governance/RULES.md #10 (no unbounded network call)',
    'governance/RULES.md #8 (no silent degradation)',
  ],
  target: 'apps/api/src/lib/http/response.ts',
  layer: 'security-negative',
  siblings: ['P03-direct-payment-availability', 'P04-remote-snapshot-validation'],
  mutation:
    'delete the in-loop `if (totalBytes > maxBytes) throw` guard — the four streamed-bound cases turn red while the declared-oversize case stays green, since that one is caught by the content-length check instead',
} as const satisfies PillarManifest

function streamOf(chunks: Uint8Array[], headers?: Record<string, string>): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return new Response(stream, headers === undefined ? undefined : { headers })
}

describe('readResponseBytesBounded', () => {
  it('returns the whole body when it fits inside the limit', async () => {
    const bytes = await readResponseBytesBounded(streamOf([Uint8Array.from([1, 2, 3])]), 100)
    expect(Array.from(bytes), pillarWhy(PILLAR, 'a 3-byte body under a 100-byte cap')).toEqual([1, 2, 3])
  })

  it('reassembles a body delivered across several chunks in order', async () => {
    const response = streamOf([Uint8Array.from([1, 2]), Uint8Array.from([3]), Uint8Array.from([4, 5])])
    const bytes = await readResponseBytesBounded(response, 100)
    expect(Array.from(bytes), pillarWhy(PILLAR, 'chunk boundaries must not reorder or drop bytes')).toEqual([
      1, 2, 3, 4, 5,
    ])
  })

  it('accepts a body of exactly the permitted size', async () => {
    const bytes = await readResponseBytesBounded(streamOf([new Uint8Array(64)]), 64)
    expect(bytes.byteLength, pillarWhy(PILLAR, 'maxBytes is inclusive; 64 of 64 must pass')).toBe(64)
  })

  it('refuses a body one byte over the permitted size', async () => {
    await expect(
      readResponseBytesBounded(streamOf([new Uint8Array(65)]), 64),
      pillarWhy(PILLAR, '65 of 64 must be refused, proving the bound is not off by one'),
    ).rejects.toBeInstanceOf(ResponseBodyTooLargeError)
  })

  it('returns an empty result when the response carries no body at all', async () => {
    const bytes = await readResponseBytesBounded(new Response(null, { status: 204 }), 64)
    expect(bytes.byteLength, pillarWhy(PILLAR, 'a bodyless response is empty, not an error')).toBe(0)
  })

  it('refuses a declared-oversize body without reading it, and cancels the stream', async () => {
    const response = streamOf([new Uint8Array(8)], { 'content-length': '999999' })
    const cancel = vi.spyOn(response.body as ReadableStream<Uint8Array>, 'cancel')

    await expect(
      readResponseBytesBounded(response, 64),
      pillarWhy(PILLAR, 'a content-length above the cap must short-circuit before any read'),
    ).rejects.toBeInstanceOf(ResponseBodyTooLargeError)
    expect(cancel, pillarWhy(PILLAR, 'the unread stream must be released, not left dangling')).toHaveBeenCalled()
  })

  // The header is attacker-controlled. A server that understates its body must still be
  // stopped by the streamed byte count, which is the guard the recorded mutation removes.
  it('refuses an oversize body that understated its own content-length', async () => {
    const response = streamOf([new Uint8Array(5_000)], { 'content-length': '4' })
    await expect(
      readResponseBytesBounded(response, 64),
      pillarWhy(PILLAR, 'declared 4 bytes, streamed 5000 — the streamed guard must still fire'),
    ).rejects.toBeInstanceOf(ResponseBodyTooLargeError)
  })

  it('refuses an oversize body that declared no content-length', async () => {
    await expect(
      readResponseBytesBounded(streamOf([new Uint8Array(5_000)]), 64),
      pillarWhy(PILLAR, 'no header at all must not disable the cap'),
    ).rejects.toBeInstanceOf(ResponseBodyTooLargeError)
  })

  it('propagates an upstream stream failure instead of returning a short read', async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.from([1, 2]))
          controller.error(new Error('upstream reset'))
        },
      }),
    )
    await expect(
      readResponseBytesBounded(response, 64),
      pillarWhy(PILLAR, 'a truncated transfer must raise, never resolve with the partial bytes'),
    ).rejects.toThrow('upstream reset')
  })
})

describe('readResponseTextBounded', () => {
  it('decodes a valid UTF-8 body including Vietnamese diacritics', async () => {
    const body = new TextEncoder().encode('Đã xác nhận')
    const text = await readResponseTextBounded(streamOf([body]), 100)
    expect(text, pillarWhy(PILLAR, 'multi-byte VI text must survive the bounded read')).toBe('Đã xác nhận')
  })

  it('rejects malformed UTF-8 rather than returning replacement characters', async () => {
    const response = streamOf([Uint8Array.from([0xff, 0xfe, 0xfd])])
    await expect(
      readResponseTextBounded(response, 100),
      pillarWhy(PILLAR, 'lenient decoding would hand callers silent U+FFFD corruption'),
    ).rejects.toBeInstanceOf(ResponseBodyInvalidEncodingError)
  })

  it('applies the byte cap before it attempts to decode', async () => {
    await expect(
      readResponseTextBounded(streamOf([new Uint8Array(5_000)]), 64),
      pillarWhy(PILLAR, 'the size failure must win over the encoding failure'),
    ).rejects.toBeInstanceOf(ResponseBodyTooLargeError)
  })
})
