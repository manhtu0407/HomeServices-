import { elapsedSeconds, formatElapsedClock, msToNextSecond } from '../kael-chat/work-progress-model'

const START = Date.parse('2026-10-13T06:00:00.000Z')
const at = (seconds: number) => new Date(START + seconds * 1000).toISOString()

describe('elapsedSeconds', () => {
  it('counts whole seconds since the start', () => {
    expect(elapsedSeconds({ now: START + 90_999, startedAt: at(0) })).toBe(90)
  })

  it('subtracts the pauses already taken', () => {
    expect(elapsedSeconds({ now: START + 600_000, pausedMs: 120_000, startedAt: at(0) })).toBe(480)
  })

  it('stands still at the open pause instead of counting on', () => {
    const base = { pausedAt: at(300), pausedMs: 60_000, startedAt: at(0) }
    expect(elapsedSeconds({ ...base, now: START + 301_000 })).toBe(240)
    expect(elapsedSeconds({ ...base, now: START + 9_000_000 })).toBe(240)
  })

  it('never reads past now when a pause is stamped in the future', () => {
    expect(elapsedSeconds({ now: START + 100_000, pausedAt: at(500), startedAt: at(0) })).toBe(100)
  })

  it('is null without a usable start and clamps a start in the future to zero', () => {
    expect(elapsedSeconds({ now: START, startedAt: null })).toBeNull()
    expect(elapsedSeconds({ now: START, startedAt: 'not-a-date' })).toBeNull()
    expect(elapsedSeconds({ now: START, startedAt: at(60) })).toBe(0)
  })

  it('ignores a negative or missing pause total', () => {
    expect(elapsedSeconds({ now: START + 60_000, pausedMs: -5_000, startedAt: at(0) })).toBe(60)
    expect(elapsedSeconds({ now: START + 60_000, pausedMs: null, startedAt: at(0) })).toBe(60)
  })
})

describe('formatElapsedClock', () => {
  it('writes hours, minutes and seconds with leading zeros', () => {
    expect(formatElapsedClock(0)).toBe('00:00:00')
    expect(formatElapsedClock(59)).toBe('00:00:59')
    expect(formatElapsedClock(3661)).toBe('01:01:01')
    expect(formatElapsedClock(-4)).toBe('00:00:00')
  })
})

describe('msToNextSecond', () => {
  it('waits for the next whole second and never returns zero', () => {
    expect(msToNextSecond(10_250)).toBe(750)
    expect(msToNextSecond(10_000)).toBe(1000)
  })
})
