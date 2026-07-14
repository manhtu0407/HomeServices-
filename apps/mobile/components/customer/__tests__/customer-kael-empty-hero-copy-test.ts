import {
  CUSTOMER_KAEL_EMPTY_HERO_LINE_COUNT,
  getCustomerKaelEmptyHeroCopy,
  millisecondsUntilNextVietnamTwoHourSlot,
} from '../v21/kael-empty-hero-copy'

describe('Customer Kael empty hero copy', () => {
  it('provides twelve Customer-specific lines for each mode', () => {
    expect(CUSTOMER_KAEL_EMPTY_HERO_LINE_COUNT.normal).toBe(12)
    expect(CUSTOMER_KAEL_EMPTY_HERO_LINE_COUNT.case).toBe(12)
  })

  it.each([
    ['normal', '2026-07-12T17:00:00.000Z', 0],
    ['normal', '2026-07-12T19:00:00.000Z', 1],
    ['case', '2026-07-13T03:00:00.000Z', 5],
    ['case', '2026-07-13T15:00:00.000Z', 11],
  ] as const)('maps %s copy to the real Vietnam two-hour slot', (mode, iso, expectedSlot) => {
    expect(getCustomerKaelEmptyHeroCopy(mode, 'vi', new Date(iso)).slot).toBe(expectedSlot)
  })

  it('keeps normal and Agentic language role-specific in the same time slot', () => {
    const now = new Date('2026-07-13T03:00:00.000Z')
    const normal = getCustomerKaelEmptyHeroCopy('normal', 'vi', now).text
    const agentic = getCustomerKaelEmptyHeroCopy('case', 'vi', now).text

    expect(normal).not.toBe(agentic)
    expect(agentic).toMatch(/dịch vụ|nhu cầu|phạm vi|điều phối/)
    expect(agentic).not.toMatch(/nhận việc|cơ hội việc/)
  })

  it('schedules the next refresh at the following even Vietnam hour', () => {
    const now = new Date('2026-07-13T03:15:00.000Z') // 10:15 in Vietnam

    expect(millisecondsUntilNextVietnamTwoHourSlot(now)).toBe(105 * 60 * 1000)
  })
})
