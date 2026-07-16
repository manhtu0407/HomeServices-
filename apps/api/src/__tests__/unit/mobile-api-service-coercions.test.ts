import { describe, expect, it } from 'vitest'

import {
  asNumber,
  nullableNumber,
} from '../../../../../supabase/functions/mobile-api/_shared/services/coercions'

describe('mobile-api service numeric coercions', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 'Infinity'])(
    'maps non-finite required numbers to the safe zero default: %s',
    (value) => {
      expect(asNumber(value)).toBe(0)
    },
  )

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 'Infinity'])(
    'rejects non-finite nullable numbers: %s',
    (value) => {
      expect(nullableNumber(value)).toBeNull()
    },
  )
})
