import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { getCustomerThemeTokens } from '../customer-theme'
import { CaseWorkResponse } from '../kael-chat/case-work-response'

describe('CaseWorkResponse', () => {
  it('puts Kael in a one-line header card above the note rail', () => {
    render(
      <CaseWorkResponse
        model={{
          actionKind: 'none',
          noteCopy: 'Cần xác định vị trí dây điện và đường ống âm tường để đảm bảo an toàn.',
          noteTitle: 'Kiểm tra trước khi khoan',
          phase: 'intake_started',
          status: 'Đã tiếp nhận',
          title: 'Lắp xà đơn trên tường bê tông',
        }}
        reduceMotion
        tokens={getCustomerThemeTokens('light')}
      />,
    )

    expect(screen.getByTestId('customer-v21-case-work-response')).toHaveStyle({ maxWidth: 680, width: '100%' })
    expect(screen.getByTestId('customer-v21-case-work-response-title')).toHaveTextContent('Lắp xà đơn trên tường bê tông')
    expect(screen.getByTestId('customer-v21-case-work-response-status')).toHaveTextContent('Đã tiếp nhận')
    expect(screen.getByTestId('customer-v21-case-work-response-note')).toHaveStyle({ borderLeftWidth: 2 })
    expect(screen.getByText('Kiểm tra trước khi khoan')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-response-header')).toContainElement(screen.getByTestId('customer-v21-case-work-response-avatar'))
    expect(screen.getByTestId('customer-v21-case-work-response-header')).toContainElement(screen.getByTestId('customer-v21-case-work-response-title'))
    expect(screen.getByTestId('customer-v21-case-work-response-avatar-bow')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-response-avatar-blink')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-response-title').props.numberOfLines).toBe(1)
    expect(screen.getByTestId('customer-v21-case-work-response-title').props.adjustsFontSizeToFit).toBe(true)
    expect(screen.queryByTestId('customer-v21-case-work-response-badge')).not.toBeOnTheScreen()
  })

  it('keeps phase-specific controls inside a light extension below the note', () => {
    render(
      <CaseWorkResponse
        controls={<Text testID="phase-control">Quyết định của bạn</Text>}
        model={{
          actionKind: 'offer',
          noteCopy: 'Chỉ xác nhận khi phạm vi và ước tính đã rõ.',
          noteTitle: 'Quyền quyết định của bạn',
          phase: 'ticket_review',
          status: 'Cần xác nhận',
          title: 'Chờ bạn chốt phương án',
        }}
        reduceMotion
        tokens={getCustomerThemeTokens('light')}
      />,
    )

    expect(screen.getByTestId('customer-v21-case-work-response-controls')).toContainElement(screen.getByTestId('phase-control'))
  })

  it('uses theme tokens and preserves readable dark-mode text', () => {
    const tokens = getCustomerThemeTokens('dark')
    render(
      <CaseWorkResponse
        model={{
          actionKind: 'none',
          noteCopy: 'Kael chỉ cập nhật khi có thay đổi quan trọng.',
          noteTitle: 'Theo dõi thay đổi',
          phase: 'repairing',
          status: 'Đang thực hiện',
          title: 'Công việc đã bắt đầu',
        }}
        reduceMotion
        tokens={tokens}
      />,
    )

    expect(screen.getByTestId('customer-v21-case-work-response-title')).toHaveStyle({ color: tokens.text })
    expect(screen.getByTestId('customer-v21-case-work-response-note-copy')).toHaveStyle({ color: tokens.muted })
  })
})
