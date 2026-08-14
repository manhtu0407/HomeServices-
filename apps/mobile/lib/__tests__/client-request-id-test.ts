import {
  clearStableClientRequestId,
  generateClientRequestId,
  shouldRetainClientRequestId,
  stableClientRequestId,
  type PendingClientRequestRef,
} from '../client-request-id'

describe('client request id lifecycle', () => {
  it('falls back to a UUID v4 when the runtime randomUUID implementation returns another version', () => {
    const originalCrypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        randomUUID: () => '018f48a0-0000-7000-8000-000000000001',
      },
    })

    try {
      expect(generateClientRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: originalCrypto,
      })
    }
  })

  it('keeps one key for one fingerprint and rotates it only when the operation changes', () => {
    const requestRef: PendingClientRequestRef = { current: null }
    const firstKey = stableClientRequestId(requestRef, 'operation-a')

    expect(stableClientRequestId(requestRef, 'operation-a')).toBe(firstKey)
    expect(stableClientRequestId(requestRef, 'operation-b')).not.toBe(firstKey)
  })

  it('clears only the fingerprint that completed', () => {
    const requestRef: PendingClientRequestRef = { current: null }
    const activeKey = stableClientRequestId(requestRef, 'operation-a')

    clearStableClientRequestId(requestRef, 'stale-operation')
    expect(stableClientRequestId(requestRef, 'operation-a')).toBe(activeKey)

    clearStableClientRequestId(requestRef, 'operation-a')
    expect(stableClientRequestId(requestRef, 'operation-a')).not.toBe(activeKey)
  })

  it.each([
    [{ code: 'NETWORK_ERROR', status: 0 }, true],
    [{ code: 'TIMEOUT', status: 0 }, true],
    [{ code: 'REQUEST_IN_PROGRESS', status: 409 }, true],
    [{ code: 'DB_ERROR', status: 500 }, true],
    [{ code: 'RATE_LIMITED', status: 429 }, true],
    [{ code: 'KAEL_ESTIMATE_UNAVAILABLE', status: 503 }, false],
    [{ code: 'VALIDATION', status: 400 }, false],
    [{ code: 'MEDIA_READ_FAILED' }, false],
  ])('classifies whether %o can hide a completed mutation', (failure, expected) => {
    expect(shouldRetainClientRequestId(failure)).toBe(expected)
  })
})
