import { render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { WorkerV5KaelOrbBubble } from '../chat/orb-surfaces'

describe('WorkerV5KaelOrbBubble', () => {
  it('renders a normal Kael reply without a bubble surface while retaining its accessible sender name', () => {
    render(
      <WorkerV5KaelOrbBubble
        appearance="bare"
        body="Phản hồi của Kael hiển thị trực tiếp trên nền chat."
        speakerLabel="Kael"
      />,
    )

    const reply = screen.getByTestId('worker-v5-kael-bubble-kael')
    expect(reply).toHaveProp('accessibilityLabel', 'Kael')
    expect(reply).toHaveTextContent('Phản hồi của Kael hiển thị trực tiếp trên nền chat.')
    expect(StyleSheet.flatten(reply.props.style)).toMatchObject({
      alignSelf: 'flex-start',
      maxWidth: '100%',
      paddingHorizontal: 4,
      paddingVertical: 4,
    })
  })

  it('breaks a dense normal reply into a lead and readable steps', () => {
    render(
      <WorkerV5KaelOrbBubble
        appearance="bare"
        body="Trước khi nhận việc, bạn nên chuẩn bị: Kiểm tra hồ sơ. Chuẩn bị dụng cụ cơ bản. Đọc kỹ mô tả công việc."
        speakerLabel="Kael"
      />,
    )

    expect(screen.getByText('Trước khi nhận việc, bạn nên chuẩn bị:')).toBeTruthy()
    expect(screen.getByText('Kiểm tra hồ sơ.')).toBeTruthy()
    expect(screen.getByText('Chuẩn bị dụng cụ cơ bản.')).toBeTruthy()
    expect(screen.getByText('Đọc kỹ mô tả công việc.')).toBeTruthy()
  })
})
