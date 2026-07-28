import {
  availableBookingTimeSlots,
  bookingScheduleDraft,
  buildBookingScheduleDateOptions,
} from '../booking/booking-intake-display-model'
import { timeChoiceLabel } from '../kael-chat/case-work-display-model'
import { workerV5TimeChoiceLabel } from '../../worker/ui/labels'

describe('HCMC booking schedule integrity', () => {
  it.each([
    ['2026-07-14T18:30:00.000Z', '2026-07-15'],
    ['2026-07-14T16:30:00.000Z', '2026-07-14'],
  ])('builds the first booking date from the HCMC calendar at %s', (now, expectedDate) => {
    const [firstOption] = buildBookingScheduleDateOptions('vi', new Date(now))

    expect(firstOption?.value).toBe(expectedDate)
  })

  it('disables elapsed HCMC slots and keeps future slots for the same calendar date', () => {
    const now = new Date('2026-07-15T04:30:00.000Z')

    expect(availableBookingTimeSlots('2026-07-15', now)).toEqual([
      '14:00',
      '16:00',
    ])
  })

  it.each([
    ['2026-07-15', '08:00', '2026-07-15T02:00:00.000Z'],
    ['2026-07-15', '10:00', '2026-07-15T03:00:00.000Z'],
  ])('rejects a slot whose HCMC start is not in the future', (date, slot, now) => {
    expect(bookingScheduleDraft(date, slot, new Date(now))).toEqual({})
  })

  it('creates the scheduled instant from the HCMC wall clock on a device-independent boundary', () => {
    expect(bookingScheduleDraft(
      '2026-07-15',
      '08:00',
      new Date('2026-07-14T18:30:00.000Z'),
    )).toEqual({
      scheduledAt: '2026-07-15T01:00:00.000Z',
      scheduleWindow: {
        date: '2026-07-15',
        end: '10:00',
        start: '08:00',
        timeZone: 'Asia/Ho_Chi_Minh',
      },
    })
  })

  it.each([
    ['vi' as const, '15/07 · 08:00'],
    ['en' as const, '15/07 · 08:00'],
  ])('renders a real future timestamp for customer and worker in %s', (language, expected) => {
    const scheduledAt = '2026-07-15T01:00:00.000Z'

    expect(timeChoiceLabel('now', language, scheduledAt)).toBe(expected)
    expect(workerV5TimeChoiceLabel('now', language, scheduledAt)).toBe(expected)
  })

  it.each([
    ['vi' as const, 'Chưa có lịch'],
    ['en' as const, 'Schedule pending'],
  ])('does not claim an immediate worker schedule when no timestamp exists in %s', (language, expected) => {
    expect(workerV5TimeChoiceLabel(undefined, language)).toBe(expected)
  })
})
