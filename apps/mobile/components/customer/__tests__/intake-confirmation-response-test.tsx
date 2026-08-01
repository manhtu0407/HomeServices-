import { fireEvent, render, screen } from '@testing-library/react-native'
import type { KaelIntakeConfirmation } from '@nestscout/shared'

import { IntakeConfirmationResponse } from '../kael-chat/intake-confirmation-response'
import { getCustomerThemeTokens } from '../customer-theme'

const confirmation: KaelIntakeConfirmation = {
  version: 1,
  source: 'booking',
  status: 'pending',
  blocking: false,
  checked_at: '2026-07-29T00:00:00.000Z',
  confirmed_at: null,
  correction_requested_at: null,
  focus: 'Kael sẽ đối chiếu nguồn điện, thiết bị bị ảnh hưởng và khả năng tiếp cận an toàn.',
  question: 'Bạn xác nhận các thông tin trên đã đúng để Kael bắt đầu phân tích nhé.',
  fields: [
    { key: 'service', label: 'Dịch vụ', value: 'Sửa điện', state: 'clear', note: null },
    { key: 'problem', label: 'Vấn đề', value: 'Ổ cắm/công tắc hỏng', state: 'clear', note: null },
    { key: 'description', label: 'Mô tả', value: 'Ổ cắm phát tiếng lẹt xẹt.', state: 'attention', note: 'Không tiếp tục sử dụng ổ cắm.' },
    { key: 'location', label: 'Khu vực', value: 'Chung cư An Gia, Quận 3', state: 'clear', note: null },
    { key: 'schedule', label: 'Thời gian', value: '30/07/2026 · 10:00–12:00', state: 'clear', note: null },
  ],
  issues: [{
    code: 'safety_attention',
    field: 'description',
    severity: 'attention',
    message: 'Không tiếp tục sử dụng ổ cắm.',
  }],
  intake: {
    service_type: 'electrical',
    profile_id: 'electric_diagnose',
    description: 'Ổ cắm phát tiếng lẹt xẹt.',
    problem_chips: ['Ổ cắm/công tắc hỏng'],
    address_label: 'Chung cư An Gia, Quận 3',
    address_district: 'Quận 3',
    scheduled_at: '2026-07-30T03:00:00.000Z',
    schedule_window: {
      date: '2026-07-30',
      start: '10:00',
      end: '12:00',
      time_zone: 'Asia/Ho_Chi_Minh',
    },
  },
}

describe('Customer Kael intake confirmation Pre-Step', () => {
  it('renders the five structured fields and both explicit decisions', () => {
    const onConfirm = jest.fn()
    const onCorrection = jest.fn()
    render(
      <IntakeConfirmationResponse
        busy={false}
        confirmation={confirmation}
        language="vi"
        onConfirm={onConfirm}
        onCorrection={onCorrection}
        tokens={getCustomerThemeTokens('light')}
      />,
    )

    expect(screen.getByTestId('customer-kael-intake-confirmation')).toBeOnTheScreen()
    expect(screen.queryByText('Bước kiểm tra · Thông tin đầu vào')).not.toBeOnTheScreen()
    expect(screen.queryByText('Kiểm tra lại thông tin')).not.toBeOnTheScreen()
    expect(screen.queryByText('Đã đối chiếu')).not.toBeOnTheScreen()
    for (const field of confirmation.fields) {
      expect(screen.getByTestId(`customer-kael-intake-field-${field.key}`)).toBeOnTheScreen()
      expect(screen.getByText(field.value)).toBeOnTheScreen()
    }
    fireEvent.press(screen.getByTestId('customer-kael-intake-confirm'))
    fireEvent.press(screen.getByTestId('customer-kael-intake-correction'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCorrection).toHaveBeenCalledTimes(1)
  })

  it('prevents confirmation while a blocking issue remains', () => {
    render(
      <IntakeConfirmationResponse
        busy={false}
        confirmation={{ ...confirmation, blocking: true }}
        language="vi"
        onConfirm={jest.fn()}
        onCorrection={jest.fn()}
        tokens={getCustomerThemeTokens('dark')}
      />,
    )

    expect(screen.getByTestId('customer-kael-intake-confirm')).toBeDisabled()
    expect(screen.getByTestId('customer-kael-intake-correction')).toBeEnabled()
  })
})
