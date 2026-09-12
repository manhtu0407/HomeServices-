import {
  CUSTOMER_KAEL_EMPTY_HERO_LINE_COUNT,
  getCustomerKaelEmptyHeroCopy,
  millisecondsUntilNextVietnamTwoHourSlot,
} from '../kael-chat/kael-empty-hero-copy'
import { getWorkerKaelEmptyHeroCopy } from '../../worker/chat/empty-hero-copy'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const VIETNAM_DAY_START_UTC = Date.UTC(2026, 6, 13, 17)

describe('Customer Kael empty hero copy', () => {
  it('provides twenty localized lines for each mode', () => {
    expect(CUSTOMER_KAEL_EMPTY_HERO_LINE_COUNT.normal).toBe(20)
    expect(CUSTOMER_KAEL_EMPTY_HERO_LINE_COUNT.case).toBe(20)
  })

  it.each([
    ['normal', '2026-07-12T17:00:00.000Z', 0],
    ['normal', '2026-07-12T19:00:00.000Z', 1],
    ['case', '2026-07-13T03:00:00.000Z', 5],
    ['case', '2026-07-13T15:00:00.000Z', 11],
  ] as const)('maps %s copy to the real Vietnam two-hour slot', (mode, iso, expectedSlot) => {
    expect(getCustomerKaelEmptyHeroCopy(mode, 'vi', new Date(iso)).slot).toBe(expectedSlot)
  })

  it('keeps normal and Agentic copy role-specific in the same time slot', () => {
    const now = new Date('2026-07-13T03:00:00.000Z')
    const normal = getCustomerKaelEmptyHeroCopy('normal', 'vi', now).text
    const agentic = getCustomerKaelEmptyHeroCopy('case', 'vi', now).text

    expect(normal).not.toBe(agentic)
    expect(agentic).toMatch(/dịch vụ|phạm vi|yêu cầu|phối hợp|thông tin|hỗ trợ/i)
    expect(agentic).not.toMatch(/\b(worker|job|scope|service)\b/i)
  })

  it('uses genuine Vietnamese in VI mode and a separate English translation in EN mode', () => {
    const now = new Date('2026-07-13T03:00:00.000Z')
    const vietnameseMode = getCustomerKaelEmptyHeroCopy('normal', 'vi', now).text
    const englishMode = getCustomerKaelEmptyHeroCopy('normal', 'en', now).text

    expect(vietnameseMode).not.toBe(englishMode)
    expect(vietnameseMode).toMatch(/[.!]+$/)
    expect(vietnameseMode).toMatch(/[À-ỹĐđ]/)
    expect(englishMode).not.toMatch(/[À-ỹĐđ]/)
  })

  it('keeps every rotated quote short, correctly localized, and supportively punctuated', () => {
    for (const mode of ['normal', 'case'] as const) {
      for (let day = 0; day < 31; day += 1) {
        for (let slot = 0; slot < 12; slot += 1) {
          const now = new Date(VIETNAM_DAY_START_UTC + (day * 12 + slot) * TWO_HOURS_MS)
          const vietnameseQuote = getCustomerKaelEmptyHeroCopy(mode, 'vi', now).text
          const englishQuote = getCustomerKaelEmptyHeroCopy(mode, 'en', now).text

          expect(vietnameseQuote.length).toBeLessThanOrEqual(44)
          expect(englishQuote.length).toBeLessThanOrEqual(44)
          expect(vietnameseQuote).toMatch(/[.!]+$/)
          expect(englishQuote).toMatch(/[.!]+$/)
          expect(vietnameseQuote).toMatch(/[À-ỹĐđ]/)
          expect(vietnameseQuote).not.toMatch(/\b(scope|service|request|help|details|worker|today)\b/i)
          expect(englishQuote).not.toMatch(/[À-ỹĐđ]/)
        }
      }
    }
  })

  it('keeps Customer normal and case copy exactly aligned with Worker normal and intake copy', () => {
    for (const mode of ['normal', 'case'] as const) {
      const workerMode = mode === 'case' ? 'intake' : 'normal'

      for (let slot = 0; slot < 12; slot += 1) {
        const now = new Date(VIETNAM_DAY_START_UTC + slot * TWO_HOURS_MS)

        for (const language of ['vi', 'en'] as const) {
          expect(getCustomerKaelEmptyHeroCopy(mode, language, now)).toEqual(
            getWorkerKaelEmptyHeroCopy(workerMode, language, now),
          )
        }
      }
    }
  })

  it('schedules the next refresh at the following even Vietnam hour', () => {
    const now = new Date('2026-07-13T03:15:00.000Z') // 10:15 in Vietnam

    expect(millisecondsUntilNextVietnamTwoHourSlot(now)).toBe(105 * 60 * 1000)
  })
})
