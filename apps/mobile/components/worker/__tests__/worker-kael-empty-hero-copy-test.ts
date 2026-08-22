import {
  getWorkerKaelEmptyHeroCopy,
  millisecondsUntilNextVietnamTwoHourSlot,
} from '../chat/empty-hero-copy'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const VIETNAM_DAY_START_UTC = Date.UTC(2026, 6, 13, 17)

describe('Worker Kael empty hero copy', () => {
  it.each(['normal', 'intake'] as const)('keeps twenty English Worker quotes for %s chat', (mode) => {
    for (let slot = 0; slot < 12; slot += 1) {
      const now = new Date(VIETNAM_DAY_START_UTC + slot * TWO_HOURS_MS)
      const vietnamese = getWorkerKaelEmptyHeroCopy(mode, 'vi', now)
      const english = getWorkerKaelEmptyHeroCopy(mode, 'en', now)

      expect(vietnamese.slot).toBe(english.slot)
      expect(vietnamese.text).toBe(english.text)
      expect(vietnamese.text).not.toMatch(/[À-ỹĐđ]/)
      expect(english.text).not.toMatch(/[À-ỹĐđ]/)
    }
  })

  it('keeps normal chat and job intake language independent in every time slot', () => {
    for (let slot = 0; slot < 12; slot += 1) {
      const now = new Date(VIETNAM_DAY_START_UTC + slot * TWO_HOURS_MS)
      expect(getWorkerKaelEmptyHeroCopy('normal', 'vi', now).text).not.toBe(
        getWorkerKaelEmptyHeroCopy('intake', 'vi', now).text,
      )
      expect(getWorkerKaelEmptyHeroCopy('normal', 'en', now).text).not.toBe(
        getWorkerKaelEmptyHeroCopy('intake', 'en', now).text,
      )
    }
  })

  it('stays stable inside one slot and changes at the next Vietnam two-hour boundary', () => {
    const beforeBoundary = new Date('2026-07-14T02:59:59.000Z') // 09:59:59 in Vietnam
    const sameSlot = new Date('2026-07-14T01:01:00.000Z') // 08:01 in Vietnam
    const afterBoundary = new Date('2026-07-14T03:00:00.000Z') // 10:00 in Vietnam

    expect(getWorkerKaelEmptyHeroCopy('normal', 'vi', beforeBoundary)).toEqual(
      getWorkerKaelEmptyHeroCopy('normal', 'vi', sameSlot),
    )
    expect(getWorkerKaelEmptyHeroCopy('normal', 'vi', afterBoundary).slot).toBe(5)
    expect(getWorkerKaelEmptyHeroCopy('normal', 'vi', afterBoundary).text).not.toBe(
      getWorkerKaelEmptyHeroCopy('normal', 'vi', beforeBoundary).text,
    )
  })

  it('keeps the intake quote rotation stable across Vietnam dates', () => {
    const observedQuotes = new Set<string>()
    for (let day = 0; day < 31; day += 1) {
      const dayStart = VIETNAM_DAY_START_UTC + day * 24 * 60 * 60 * 1000
      observedQuotes.add(getWorkerKaelEmptyHeroCopy('intake', 'vi', new Date(dayStart)).text)
    }

    expect(observedQuotes.size).toBeGreaterThan(1)
  })

  it('keeps Worker quotes short and punctuated in both chat modes', () => {
    for (const mode of ['normal', 'intake'] as const) {
      for (let slot = 0; slot < 12; slot += 1) {
        const quote = getWorkerKaelEmptyHeroCopy(mode, 'vi', new Date(VIETNAM_DAY_START_UTC + slot * TWO_HOURS_MS)).text

        expect(quote.length).toBeLessThanOrEqual(44)
        expect(quote).toMatch(/[.!]+$/)
        expect(quote).not.toMatch(/[À-ỹĐđ]/)
      }
    }
  })

  it('schedules the next update at the real Vietnam slot boundary', () => {
    expect(millisecondsUntilNextVietnamTwoHourSlot(new Date('2026-07-13T22:30:00.000Z'))).toBe(30 * 60 * 1000)
    expect(millisecondsUntilNextVietnamTwoHourSlot(new Date('2026-07-13T23:00:00.000Z'))).toBe(TWO_HOURS_MS)
  })
})
