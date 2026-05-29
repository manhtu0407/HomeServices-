import { formatVnd, formatVndRange } from '../format'

// Currency presentation is a money-honesty surface (RULES.md bans fake/ambiguous
// currency). These assert real, locale-specific behavior — not existence checks.
describe('formatVnd', () => {
  it('groups thousands the Vietnamese way and appends the đồng sign', () => {
    expect(formatVnd(150000, 'vi')).toBe('150.000 ₫')
  })

  it('uses US grouping and a VND suffix in English mode', () => {
    expect(formatVnd(150000, 'en')).toBe('150,000 VND')
  })

  it('defaults to Vietnamese when no language is given', () => {
    expect(formatVnd(2000)).toBe('2.000 ₫')
  })

  it('rounds to whole đồng so no fractional currency leaks to the UI', () => {
    expect(formatVnd(150000.6, 'vi')).toBe('150.001 ₫')
  })

  it('falls back to a safe zero for non-finite input instead of showing NaN', () => {
    expect(formatVnd(Number.NaN, 'vi')).toBe('0 ₫')
    expect(formatVnd(Number.POSITIVE_INFINITY, 'en')).toBe('0 VND')
  })
})

describe('formatVndRange', () => {
  it('joins the localized min and max with a dash', () => {
    expect(formatVndRange(100000, 200000, 'vi')).toBe('100.000 ₫ - 200.000 ₫')
    expect(formatVndRange(100000, 200000, 'en')).toBe('100,000 VND - 200,000 VND')
  })
})
