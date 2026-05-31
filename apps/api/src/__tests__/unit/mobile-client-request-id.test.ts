import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearStableClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from '../../../../../apps/mobile/lib/client-request-id'

describe('mobile stableClientRequestId helper', () => {
  const originalCrypto = globalThis.crypto

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    })
  })

  it('reuses one UUID for the same pending fingerprint', () => {
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID },
    })
    const ref: { current: PendingClientRequestId | null } = { current: null }

    expect(stableClientRequestId(ref, 'same-payload')).toBe('00000000-0000-4000-8000-000000000001')
    expect(stableClientRequestId(ref, 'same-payload')).toBe('00000000-0000-4000-8000-000000000001')
    expect(randomUUID).toHaveBeenCalledTimes(1)

    clearStableClientRequestId(ref, 'same-payload')
    expect(stableClientRequestId(ref, 'same-payload')).toBe('00000000-0000-4000-8000-000000000002')
    expect(randomUUID).toHaveBeenCalledTimes(2)
  })

  it('starts a new UUID when the payload fingerprint changes', () => {
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000011')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000012')
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID },
    })
    const ref: { current: PendingClientRequestId | null } = { current: null }

    expect(stableClientRequestId(ref, 'payload-a')).toBe('00000000-0000-4000-8000-000000000011')
    expect(stableClientRequestId(ref, 'payload-b')).toBe('00000000-0000-4000-8000-000000000012')
    expect(randomUUID).toHaveBeenCalledTimes(2)
  })
})
