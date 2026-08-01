import {
  accountTotalDays,
  customerAccountJourneyDisplay,
  profileSettingsSectionParam,
  profileUtilityParam,
  profileUtilityTitle,
} from '../v21/profile-display-model'

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

  it('labels the customer banking utility as refunds, not payment', () => {
    expect(profileUtilityTitle('payment', 'vi')).toBe('Hoàn tiền')
    expect(profileUtilityTitle('payment', 'en')).toBe('Refunds')
  })

  it('recognizes and localizes the terms and policies utility', () => {
    expect(profileUtilityParam('legal')).toBe('legal')
    expect(profileUtilityTitle('legal', 'vi')).toBe('Điều khoản & Chính sách')
    expect(profileUtilityTitle('legal', 'en')).toBe('Terms & Policies')
  })

  it('recognizes the new foundational account utilities without aliasing them to Settings', () => {
    expect(profileUtilityParam('appearance')).toBe('appearance')
    expect(profileUtilityParam('language')).toBe('language')
    expect(profileUtilityParam('memory')).toBe('memory')
    expect(profileUtilityParam('notifications')).toBe('notifications')
    expect(profileUtilityParam('password')).toBe('password')
    expect(profileUtilityParam('personal-details')).toBe('personal-details')
    expect(profileUtilityParam('support')).toBe('support')
    expect(profileUtilityParam('delete-account')).toBe('delete-account')
    expect(profileUtilityTitle('appearance', 'vi')).toBe('Giao diện')
    expect(profileUtilityTitle('language', 'vi')).toBe('Ngôn ngữ')
    expect(profileUtilityTitle('memory', 'vi')).toBe('Bộ nhớ Kael')
    expect(profileUtilityTitle('notifications', 'vi')).toBe('Thông báo')
    expect(profileUtilityTitle('password', 'vi')).toBe('Bảo mật đăng nhập')
    expect(profileUtilityTitle('personal-details', 'vi')).toBe('Thông tin cá nhân')
    expect(profileUtilityTitle('support', 'vi')).toBe('Trợ giúp & hỗ trợ')
    expect(profileUtilityTitle('delete-account', 'vi')).toBe('Xóa tài khoản')
  })

  it('accepts only the three focused account-setting sections', () => {
    expect(profileSettingsSectionParam('account')).toBe('account')
    expect(profileSettingsSectionParam('password')).toBe('password')
    expect(profileSettingsSectionParam('memory')).toBe('memory')
    expect(profileSettingsSectionParam('notifications')).toBeNull()
    expect(profileSettingsSectionParam(undefined)).toBeNull()
  })
})
