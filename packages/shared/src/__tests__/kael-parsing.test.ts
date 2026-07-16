import { describe, expect, it } from 'vitest'

import { safeParseJSON } from '../../kael/parsing'

function nestedJson(depth: number): string {
  let value = '0'
  for (let index = 0; index < depth; index += 1) {
    value = index % 2 === 0 ? `[${value}]` : `{"value":${value}}`
  }
  return value
}

describe('safeParseJSON structural limits', () => {
  it('skips non-JSON bracketed prose before the first valid payload', () => {
    expect(safeParseJSON('Kael [analysis pending] result: {"ok":true}')).toEqual({ ok: true })
    expect(safeParseJSON('Prefix [ without a closer, then {"ok":true}')).toEqual({ ok: true })
    expect(safeParseJSON('```json\n[not json]\n```\n```json\n{"ok":true}\n```')).toEqual({ ok: true })
  })

  it('accepts mixed object and array nesting at the documented depth limit', () => {
    expect(safeParseJSON(nestedJson(100))).not.toBeNull()
  })

  it('rejects mixed object and array nesting beyond the documented depth limit', () => {
    expect(safeParseJSON(nestedJson(101))).toBeNull()
  })

  it('rejects oversized output before scanning recovery candidates', () => {
    expect(safeParseJSON(`${'x'.repeat(64 * 1024)}{"ok":true}`)).toBeNull()
  })
})
