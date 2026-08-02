import {
  customerVisibleCaseRequestText,
  customerVisibleIntakeSummaryText,
  customerVisibleKaelTurnText,
} from '../kael-chat/kael-chat-turn-display-model'

describe('customer-visible Kael turn text', () => {
  it('replaces privacy placeholders with localized customer copy', () => {
    const visible = customerVisibleKaelTurnText(
      'Hẹn tại [building], [floor], [unit], [house-no]. Gọi [phone] hoặc [email].',
      'vi',
    )

    expect(visible).toBe(
      'Hẹn tại tòa nhà đã ẩn, tầng đã ẩn, căn hộ đã ẩn, số nhà đã ẩn. Gọi số điện thoại đã ẩn hoặc email đã ẩn.',
    )
    expect(visible).not.toMatch(/\[(?:building|floor|unit|house-no|phone|email)\]/)
  })

  it('repairs the legacy false-positive fragment produced from "căn hộ"', () => {
    expect(customerVisibleKaelTurnText('Vị trí ở đâu trong [unit]ộ?', 'vi')).toBe(
      'Vị trí ở đâu trong căn hộ?',
    )
  })

  it('repairs the legacy false-positive fragment produced from "phòng khách"', () => {
    expect(customerVisibleKaelTurnText('Nằm ở phòng [unit]ách.', 'vi')).toBe(
      'Nằm ở phòng khách.',
    )
  })

  it('repairs the exact legacy fragment already persisted by the old Worker scrubber', () => {
    expect(customerVisibleKaelTurnText('Ở căn hộ tầng đã ẩn. Nằm ở [unit]ách.', 'vi')).toBe(
      'Ở căn hộ tầng đã ẩn. Nằm ở phòng khách.',
    )
  })

  it('uses English labels in English mode', () => {
    expect(customerVisibleKaelTurnText('Meet at [house-no], [unit].', 'en')).toBe(
      'Meet at hidden house number, hidden unit.',
    )
  })

  it('shortens the persisted handyman evidence prompt', () => {
    expect(customerVisibleKaelTurnText(
      'Bạn gửi một ảnh thấy rõ vật cần sửa/lắp và vị trí thi công để Kael kiểm tra bề mặt, kích thước và dụng cụ cần chuẩn bị.',
      'vi',
    )).toBe(
      'Gửi ảnh rõ vật cần sửa/lắp và vị trí thi công để Kael kiểm tra bề mặt, kích thước, dụng cụ cần dùng.',
    )
  })

  it('adds a blank line between Basic Intake rows', () => {
    expect(customerVisibleIntakeSummaryText([
      'Dịch vụ: Sửa điện',
      'Vấn đề: Ổ cắm/công tắc hỏng',
      'Mô tả: Ổ điện bị hư.',
    ].join('\n'), 'vi')).toBe([
      'Dịch vụ: Sửa điện',
      'Vấn đề: Ổ cắm/công tắc hỏng',
      'Mô tả: Ổ điện bị hư.',
    ].join('\n\n'))
  })

  it('restores row boundaries when a persisted Basic Intake summary lost its newlines', () => {
    const flattened = [
      'Dịch vụ: Sửa vặt & Lắp đặt nhỏ',
      'Vấn đề: Theo mô tả',
      'Khu vực: Tòa S1.07, Phường Long Bình, Thành phố Thủ Đức',
      'Thời gian: T3 21/07 · Bắt đầu lúc 10:00',
      'Mô tả: Tôi cần thợ khoan tường để treo máy tập thể dục.',
    ].join(' ')

    expect(customerVisibleIntakeSummaryText(flattened, 'vi')).toBe([
      'Dịch vụ: Sửa vặt & Lắp đặt nhỏ',
      'Vấn đề: Theo mô tả',
      'Khu vực: Tòa S1.07, Phường Long Bình, Thành phố Thủ Đức',
      'Thời gian: T3 21/07 · Bắt đầu lúc 10:00',
      'Mô tả: Tôi cần thợ khoan tường để treo máy tập thể dục.',
    ].join('\n\n'))
  })

  it('leaves ordinary multiline customer chat unchanged', () => {
    const message = 'Ổ cắm phát tia lửa.\nTôi đã ngắt cầu dao.'

    expect(customerVisibleIntakeSummaryText(message, 'vi')).toBe(message)
  })

  it('breaks a detailed freeform Case Work request into readable information rows', () => {
    const message = 'Tôi cần sửa nước. Khớp ren của ống thoát ngay dưới bồn rửa bếp đang rò từng giọt, có nước đọng và đáy tủ bị ẩm nhưng chưa tràn ra sàn. Tôi đã khóa van. Tôi cần thợ kiểm tra từ 10:00 đến 12:00 ngày 05/08/2026 tại Chung cư An Gia, Phường Võ Thị Sáu, Quận 3.'

    expect(customerVisibleCaseRequestText(message, 'vi')).toBe([
      'Tôi cần sửa nước.',
      'Khớp ren của ống thoát ngay dưới bồn rửa bếp đang rò từng giọt, có nước đọng và đáy tủ bị ẩm nhưng chưa tràn ra sàn.',
      'Tôi đã khóa van.',
      'Tôi cần thợ kiểm tra từ 10:00 đến 12:00 ngày 05/08/2026 tại Chung cư An Gia, Phường Võ Thị Sáu, Quận 3.',
    ].join('\n\n'))
  })

  it('does not reformat short Case Work follow-up messages', () => {
    const message = 'Tôi đã khóa van. Bạn cần thêm ảnh không?'

    expect(customerVisibleCaseRequestText(message, 'vi')).toBe(message)
  })

  it('repairs a legacy redacted minute without exposing it as an address token', () => {
    const visible = customerVisibleIntakeSummaryText([
      'Khu vực: [house-no]',
      'Thời gian: CN 19/07 · Bắt đầu lúc 14:[house-no]',
      'Mô tả: Ổ điện bị hư.',
    ].join('\n'), 'vi')

    expect(visible).toContain('Khu vực: số nhà đã ẩn')
    expect(visible).toContain('Bắt đầu khoảng 14 giờ')
    expect(visible).not.toContain('14:số nhà đã ẩn')
  })

  it('uses readable English copy when a persisted minute was redacted', () => {
    expect(customerVisibleIntakeSummaryText([
      'Service: Electrical repair',
      'Issue: Broken outlet or switch',
      'Time: Sun 19/07 · Starts at 09:[house-no]',
    ].join('\n'), 'en')).toContain('Starts around 09:00')
  })
})
