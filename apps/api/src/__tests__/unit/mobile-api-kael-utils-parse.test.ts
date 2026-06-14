import { describe, expect, it } from 'vitest'
import { safeParseJSON } from '../../../../../supabase/functions/mobile-api/_shared/kael/utils'

// J-1 (Notes.md): the Edge safeParseJSON fallback now walks the FIRST balanced
// JSON object (string-aware) instead of indexOf("{")..lastIndexOf("}"). These
// are BEHAVIORAL tests against the actual Edge function (it is used on the
// money-sensitive intent/vision/market/scope-change AI-parse paths).

describe('Edge safeParseJSON brace-counting (J-1)', () => {
  it('parses plain JSON directly', () => {
    expect(safeParseJSON('{"a":1}')).toEqual({ a: 1 })
  })

  it('extracts the first balanced object from JSON wrapped in prose', () => {
    expect(safeParseJSON('Here you go:\n{"price_min":100,"price_max":200}\nThanks!')).toEqual({
      price_min: 100,
      price_max: 200,
    })
  })

  it('does NOT widen the window on braces inside string values (the J-1 fix)', () => {
    // indexOf/lastIndexOf would slice to the final "}" and corrupt this; the
    // balanced scan stops at the first top-level close.
    expect(safeParseJSON('{"note":"a } b { c","ok":true} trailing }')).toEqual({
      note: 'a } b { c',
      ok: true,
    })
  })

  it('honours escaped quotes inside strings', () => {
    expect(safeParseJSON('{"q":"she said \\"hi\\" }"}')).toEqual({ q: 'she said "hi" }' })
  })

  it('returns the first balanced object when several are concatenated', () => {
    expect(safeParseJSON('{"a":1}{"b":2}')).toEqual({ a: 1 })
  })

  it('parses nested objects within surrounding prose', () => {
    expect(safeParseJSON('prefix {"a":{"b":{"c":3}}} suffix')).toEqual({ a: { b: { c: 3 } } })
  })

  it('returns null when there is no JSON object', () => {
    expect(safeParseJSON('no json here')).toBeNull()
  })

  it('returns null on an unterminated object', () => {
    expect(safeParseJSON('{"a":1')).toBeNull()
  })
})
