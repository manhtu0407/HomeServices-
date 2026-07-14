import {
  getWorkerKaelEmptyHeroCopy,
  millisecondsUntilNextVietnamTwoHourSlot,
} from '../chat/empty-hero-copy'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const VIETNAM_DAY_START_UTC = Date.UTC(2026, 6, 13, 17)

describe('Worker Kael empty hero copy', () => {
  it.each(['normal', 'intake'] as const)('serves twelve distinct Vietnamese lines across a Vietnam day for %s chat', (mode) => {
    const lines = Array.from({ length: 12 }, (_, slot) => (
      getWorkerKaelEmptyHeroCopy(mode, 'vi', new Date(VIETNAM_DAY_START_UTC + slot * TWO_HOURS_MS)).text
    ))

    expect(new Set(lines).size).toBe(12)
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

  it('rotates the two lines inside a matching four-hour period across Vietnam dates', () => {
    const observedOrders = new Set<string>()
    for (let day = 0; day < 31; day += 1) {
      const dayStart = VIETNAM_DAY_START_UTC + day * 24 * 60 * 60 * 1000
      observedOrders.add([
        getWorkerKaelEmptyHeroCopy('intake', 'vi', new Date(dayStart)).text,
        getWorkerKaelEmptyHeroCopy('intake', 'vi', new Date(dayStart + TWO_HOURS_MS)).text,
      ].join('|'))
    }

    expect(observedOrders.size).toBe(2)
  })

  it('schedules the next update at the real Vietnam slot boundary', () => {
    expect(millisecondsUntilNextVietnamTwoHourSlot(new Date('2026-07-13T22:30:00.000Z'))).toBe(30 * 60 * 1000)
    expect(millisecondsUntilNextVietnamTwoHourSlot(new Date('2026-07-13T23:00:00.000Z'))).toBe(TWO_HOURS_MS)
  })
})
