import { accountTotalDays, customerAccountJourneyDisplay } from '../v21/profile-display-model'

describe('customer profile account journey display', () => {
  it('counts inclusive account days on the Ho Chi Minh City calendar', () => {
    const createdAt = '2026-07-01T16:59:00.000Z'
    const now = new Date('2026-07-02T17:00:00.000Z')

    expect(accountTotalDays(createdAt, now)).toBe(3)
    expect(customerAccountJourneyDisplay({
      activeServiceDays: 2,
      createdAt,
      fallback: 'Chờ dữ liệu',
      language: 'vi',
      now,
    })).toMatchObject({
      activeDaysLabel: 'Dùng dịch vụ',
      activeDaysValue: '2 ngày',
      memberSince: 'Thành viên từ 01/07/2026',
      totalDaysValue: 'Ngày thứ 3',
    })
  })

  it('keeps unavailable activity data honest', () => {
    expect(customerAccountJourneyDisplay({
      activeServiceDays: undefined,
      createdAt: '2026-07-01T00:00:00.000Z',
      fallback: 'Chờ dữ liệu',
      language: 'vi',
      now: new Date('2026-07-02T00:00:00.000Z'),
    }).activeDaysValue).toBe('Chờ dữ liệu')
  })
})
