import { describe, expect, it } from 'vitest'
import {
  safeParseJSON,
  scrubSensitiveForLLM,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/utils'

function nestedJson(depth: number): string {
  let value = '0'
  for (let index = 0; index < depth; index += 1) {
    value = index % 2 === 0 ? `[${value}]` : `{"value":${value}}`
  }
  return value
}

// Behavioral tests run against the parser used by money-sensitive Edge AI paths.

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

  it('recovers the first valid object or array after bracketed prose', () => {
    expect(safeParseJSON('Kael [analysis pending] result: {"ok":true}')).toEqual({ ok: true })
    expect(safeParseJSON('Prefix [ without a closer, then [1,2,3]')).toEqual([1, 2, 3])
  })

  it('enforces input and structural limits before parsing model output', () => {
    expect(safeParseJSON(nestedJson(100))).not.toBeNull()
    expect(safeParseJSON(nestedJson(101))).toBeNull()
    expect(safeParseJSON(`${'x'.repeat(64 * 1024)}{"ok":true}`)).toBeNull()
  })

  it('scrubs long unlabelled bank-account numbers', () => {
    expect(scrubSensitiveForLLM('STK 1234567890123456')).toBe('STK [bank-account]')
    expect(scrubSensitiveForLLM('Tài khoản 12345678901234567890')).toBe('Tài khoản [bank-account]')
  })
})
