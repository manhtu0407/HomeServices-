import { describe, it, expect } from 'vitest'
import { safeParseJSON } from '@/lib/kael/parsing'

describe('safeParseJSON — brace-counting parser', () => {
  it('parses simple object', () => {
    expect(safeParseJSON('{"key": "value"}')).toEqual({ key: 'value' })
  })

  it('parses simple array', () => {
    expect(safeParseJSON('[1, 2, 3]')).toEqual([1, 2, 3])
  })

  it('parses nested objects', () => {
    const input = '{"outer": {"inner": {"deep": true}}}'
    expect(safeParseJSON(input)).toEqual({ outer: { inner: { deep: true } } })
  })

  it('parses nested arrays', () => {
    const input = '{"items": [{"id": 1}, {"id": 2}]}'
    expect(safeParseJSON(input)).toEqual({ items: [{ id: 1 }, { id: 2 }] })
  })

  it('extracts first JSON from text with multiple objects', () => {
    const text = 'Result: {"a": 1} and also {"b": 2}'
    expect(safeParseJSON(text)).toEqual({ a: 1 })
  })

  it('does NOT greedily match across two JSON objects (Bug #1)', () => {
    const text = '{"first": true} some text {"second": true}'
    expect(safeParseJSON(text)).toEqual({ first: true })
  })

  it('handles deeply nested JSON that regex would break on (Bug #1)', () => {
    const text = '{"a": {"b": {"c": {"d": "value"}}}}'
    expect(safeParseJSON(text)).toEqual({ a: { b: { c: { d: 'value' } } } })
  })

  it('extracts JSON from markdown fence', () => {
    const text = '```json\n{"key": "value"}\n```'
    expect(safeParseJSON(text)).toEqual({ key: 'value' })
  })

  it('extracts JSON from markdown fence without language tag', () => {
    const text = '```\n{"key": "value"}\n```'
    expect(safeParseJSON(text)).toEqual({ key: 'value' })
  })

  it('handles escaped braces in strings', () => {
    const text = '{"message": "use \\\\{ and \\\\} for braces"}'
    const result = safeParseJSON(text)
    expect(result).not.toBeNull()
  })

  it('handles escaped quotes in strings', () => {
    const text = '{"message": "he said \\"hello\\"", "value": 42}'
    expect(safeParseJSON(text)).toEqual({ message: 'he said "hello"', value: 42 })
  })

  it('handles braces inside string values', () => {
    const text = '{"formula": "{x} + {y} = {z}", "result": 10}'
    expect(safeParseJSON(text)).toEqual({ formula: '{x} + {y} = {z}', result: 10 })
  })

  it('handles multiline JSON', () => {
    const text = `{
  "service_type": "electrical",
  "problem_slug": "breaker_trip",
  "confidence": 0.85,
  "needs_clarification": false
}`
    const result = safeParseJSON(text)
    expect(result).toEqual({
      service_type: 'electrical',
      problem_slug: 'breaker_trip',
      confidence: 0.85,
      needs_clarification: false,
    })
  })

  it('extracts JSON preceded by AI text', () => {
    const text = 'Based on the description, here is my analysis:\n\n{"problem_identified": "Cầu dao bị trip", "severity_indicators": [], "complexity_hint": "medium"}'
    const result = safeParseJSON(text)
    expect(result).toEqual({
      problem_identified: 'Cầu dao bị trip',
      severity_indicators: [],
      complexity_hint: 'medium',
    })
  })

  it('returns null for non-JSON text', () => {
    expect(safeParseJSON('no json here at all')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(safeParseJSON('')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(safeParseJSON('{bad: json}')).toBeNull()
  })

  it('returns null for unclosed brace', () => {
    expect(safeParseJSON('{"key": "value"')).toBeNull()
  })

  it('returns null for unclosed array', () => {
    expect(safeParseJSON('[1, 2, 3')).toBeNull()
  })

  it('handles real Kael intent response shape', () => {
    const text = '```json\n{"service_type": "plumbing", "problem_slug": "pipe_leak", "confidence": 0.92, "needs_clarification": false}\n```'
    const result = safeParseJSON(text) as Record<string, unknown>
    expect(result.service_type).toBe('plumbing')
    expect(result.problem_slug).toBe('pipe_leak')
    expect(result.confidence).toBe(0.92)
  })

  it('handles real Kael vision response shape', () => {
    const text = JSON.stringify({
      problem_identified: 'Ống nước bị rò rỉ tại mối nối bồn rửa',
      severity_indicators: ['rò rỉ lớn', 'có mùi ẩm mốc'],
      complexity_hint: 'medium',
    })
    const result = safeParseJSON(text) as Record<string, unknown>
    expect(result.problem_identified).toContain('rò rỉ')
    expect((result.severity_indicators as string[]).length).toBe(2)
  })

  it('handles real Kael market price response shape', () => {
    const text = JSON.stringify({
      market_range_min: 300000,
      market_range_max: 700000,
      confidence: 0.75,
      sources_summary: 'HCMC local repair shops',
    })
    const result = safeParseJSON(text) as Record<string, unknown>
    expect(result.market_range_min).toBe(300000)
    expect(result.market_range_max).toBe(700000)
  })

  // ──── E10: adversarial input guards ────────────────────────────

  it('rejects input exceeding 64KB length', () => {
    const huge = '{"a":"' + 'x'.repeat(100_000) + '"}'
    expect(safeParseJSON(huge)).toBeNull()
  })

  it('rejects deeply nested input beyond MAX_JSON_DEPTH', () => {
    // Build 150 levels of nesting — beyond our 100 cap
    const open = '{"a":'.repeat(150)
    const close = '0' + '}'.repeat(150)
    const result = safeParseJSON(open + close)
    expect(result).toBeNull()
  })

  it('accepts moderate nesting (5 levels — real Kael shape)', () => {
    const text = JSON.stringify({ a: { b: { c: { d: { e: 'ok' } } } } })
    const result = safeParseJSON(text) as Record<string, unknown>
    expect(result).toEqual({ a: { b: { c: { d: { e: 'ok' } } } } })
  })
})
