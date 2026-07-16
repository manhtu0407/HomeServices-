import { describe, expect, it } from 'vitest'
import { InvalidJsonRequestError, readJsonRequestBounded } from '@/lib/http/request-json'

function jsonRequest(body: BodyInit, headers?: HeadersInit) {
  return new Request('https://example.test/api/jobs', {
    body,
    headers: { 'content-type': 'application/json', ...headers },
    method: 'POST',
  })
}

describe('bounded JSON request reader', () => {
  it('parses a JSON object inside the byte budget', async () => {
    await expect(readJsonRequestBounded(jsonRequest('{"service_type":"plumbing"}'))).resolves.toEqual({
      service_type: 'plumbing',
    })
  })

  it.each([
    ['malformed JSON', jsonRequest('{')],
    ['invalid UTF-8', jsonRequest(new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]))],
    ['invalid content length', jsonRequest('{}', { 'content-length': 'not-a-number' })],
    ['oversized declared content length', jsonRequest('{}', { 'content-length': '65537' })],
  ])('rejects %s', async (_label, request) => {
    await expect(readJsonRequestBounded(request)).rejects.toBeInstanceOf(InvalidJsonRequestError)
  })

  it('stops a chunked body once the streamed byte budget is exceeded', async () => {
    const request = jsonRequest('123456789')

    await expect(readJsonRequestBounded(request, 8)).rejects.toBeInstanceOf(InvalidJsonRequestError)
  })

  it('rejects an invalid internal byte budget', async () => {
    await expect(readJsonRequestBounded(jsonRequest('{}'), 0)).rejects.toBeInstanceOf(RangeError)
  })
})
