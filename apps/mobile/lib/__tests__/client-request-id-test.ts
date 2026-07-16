import {
  clearStableClientRequestId,
  shouldRetainClientRequestId,
  stableClientRequestId,
  type PendingClientRequestRef,
} from '../client-request-id'

describe('client request id lifecycle', () => {
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
    [{ code: 'VALIDATION', status: 400 }, false],
    [{ code: 'MEDIA_READ_FAILED' }, false],
  ])('classifies whether %o can hide a completed mutation', (failure, expected) => {
    expect(shouldRetainClientRequestId(failure)).toBe(expected)
  })
})
