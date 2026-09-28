import { waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

const mockExpoFetch = jest.fn()
const previousReadableStream = globalThis.ReadableStream
const previousTextDecoder = globalThis.TextDecoder

jest.mock('../api', () => {
  const actual = jest.requireActual('../api')
  return {
    ...actual,
    getMobileApiAuthHeaders: jest.fn(async () => ({ authorization: 'Bearer test' })),
    mobileApiConfigError: jest.fn(() => null),
    mobileApiUrl: jest.fn((path: string) => `https://mobile-api.test${path}`),
  }
})

import { streamCustomerKaelConversationTurn } from '../kael-stream'

export const PILLAR = {
  id: 'P204-customer-kael-request-abort',
  invariant: 'Stopping a Customer Kael SSE turn aborts its in-flight fetch and returns a cancellation result rather than a network failure',
  authority: ['governance/RULES.md #3 and #8', 'governance/protocols/frontend-test.md G3 and G6'],
  target: 'apps/mobile/lib/kael-stream.ts',
  layer: 'integration',
  siblings: ['P181-rfq-price-mobile-receipts', 'P205-kael-composer-and-failure-boundary'],
  mutation: 'remove the external abort listener or classify its rejection as STREAM_NETWORK; the request signal remains live or the cancellation result changes',
} as const satisfies PillarManifest

describe('Customer Kael request cancellation', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'ReadableStream', {
      configurable: true,
      value: class ReadableStreamCapability {},
    })
    Object.defineProperty(globalThis, 'TextDecoder', {
      configurable: true,
      value: class TextDecoderCapability {},
    })
  })

  afterAll(() => {
    Object.defineProperty(globalThis, 'ReadableStream', { configurable: true, value: previousReadableStream })
    Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: previousTextDecoder })
  })

  beforeEach(() => {
    mockExpoFetch.mockReset()
  })

  it('aborts the active SSE fetch and reports a user cancellation', async () => {
    mockExpoFetch.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('request aborted'), { name: 'AbortError' }))
      }, { once: true })
    }))
    const cancellation = new AbortController()
    const resultPromise = streamCustomerKaelConversationTurn(
      'conversation-1',
      { client_request_id: 'request-1', language: 'vi', message: 'Chào Kael' },
      {},
      cancellation.signal,
      mockExpoFetch as unknown as typeof fetch,
    )

    await waitFor(() => expect(mockExpoFetch).toHaveBeenCalledTimes(1))
    const requestSignal = mockExpoFetch.mock.calls[0][1].signal as AbortSignal
    cancellation.abort()
    const result = await resultPromise

    withPillarContext(PILLAR, () => {
      expect(result).toMatchObject({
        code: 'REQUEST_CANCELLED',
        success: false,
      })
      expect(requestSignal.aborted).toBe(true)
      expect(mockExpoFetch).toHaveBeenCalledTimes(1)
    })
  })
})
