import { describe, expect, it } from 'vitest'

import {
  boundedCanonicalProviderCode,
  boundedProviderIdentifier,
  boundedProviderText,
} from '../../../../../supabase/functions/mobile-api/_shared/provider-boundary'

describe('external provider value boundary', () => {
  it('normalizes control and bidi characters without damaging ordinary Vietnamese text', () => {
    expect(boundedProviderText(
      '  Ch\u1ee3\u202e B\u1ebfn\u0000 Th\u00e0nh, Qu\u1eadn\u0007 1  ',
      80,
    )).toBe('Ch\u1ee3 B\u1ebfn Th\u00e0nh, Qu\u1eadn 1')
  })

  it.each([
    ['place\u0000-id', 64],
    ['\nplace-id', 64],
    ['\u202eplace-id', 64],
    ['x'.repeat(65), 64],
  ])('rejects a tainted or oversized opaque identifier', (value, maxLength) => {
    expect(boundedProviderIdentifier(value, maxLength)).toBe('')
  })

  it('accepts only bounded ASCII identifier-style provider codes', () => {
    expect(boundedCanonicalProviderCode('MessageTooBig', 64)).toBe('MessageTooBig')
    expect(boundedCanonicalProviderCode('Message too big', 64)).toBeNull()
    expect(boundedCanonicalProviderCode('DeviceNotRegistered\u2066', 64)).toBeNull()
    expect(boundedCanonicalProviderCode('A'.repeat(65), 64)).toBeNull()
  })
})
