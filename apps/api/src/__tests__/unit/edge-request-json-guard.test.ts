import { describe, expect, it } from 'vitest'

import {
  readJsonRequestBounded,
  RequestJsonError,
} from '../../../../../supabase/functions/_shared/request-json'

function jsonRequest(body: BodyInit, headers: HeadersInit = {}) {
  return new Request('https://example.test/functions/v1/mobile-api/jobs', {
    body,
    headers: { 'content-type': 'application/json', ...headers },
    method: 'POST',
  })
}

describe('Edge bounded JSON request guard', () => {
  it('parses standard and structured-suffix JSON media types', async () => {
    await expect(readJsonRequestBounded(jsonRequest('{"ok":true}'), 1024))
      .resolves.toEqual({ ok: true })
    await expect(readJsonRequestBounded(
      jsonRequest('{"ok":true}', { 'content-type': 'application/merge-patch+json; charset=utf-8' }),
      1024,
    )).resolves.toEqual({ ok: true })
  })

  it.each([
    ['missing content type', new Request('https://example.test/jobs', {
      body: new TextEncoder().encode('{}'),
      method: 'POST',
    })],
    ['wrong content type', jsonRequest('{}', { 'content-type': 'text/plain' })],
  ])('rejects %s before parsing', async (_label, request) => {
    await expect(readJsonRequestBounded(request, 1024)).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      status: 415,
    })
  })

  it.each([
    ['malformed JSON', jsonRequest('{')],
    ['invalid UTF-8', jsonRequest(new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]))],
    ['invalid content length', jsonRequest('{}', { 'content-length': 'invalid' })],
  ])('rejects %s as invalid JSON', async (_label, request) => {
    await expect(readJsonRequestBounded(request, 1024)).rejects.toMatchObject({
      code: 'INVALID_JSON',
      status: 400,
    })
  })

  it('rejects a declared oversized body before reading it', async () => {
    await expect(readJsonRequestBounded(
      jsonRequest('{}', { 'content-length': '1025' }),
      1024,
    )).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 })
  })

  it('cancels a chunked body as soon as the byte budget is exceeded', async () => {
    let pulls = 0
    let canceled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(8))
      },
      cancel() {
        canceled = true
      },
    })
    const request = new Request('https://example.test/jobs', {
      body,
      duplex: 'half',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    } as RequestInit & { duplex: 'half' })

    await expect(readJsonRequestBounded(request, 16)).rejects.toBeInstanceOf(RequestJsonError)
    expect(pulls).toBeLessThan(10)
    expect(canceled).toBe(true)
  })

  it('rejects an invalid internal byte budget', async () => {
    await expect(readJsonRequestBounded(jsonRequest('{}'), 0)).rejects.toBeInstanceOf(RangeError)
  })
})
