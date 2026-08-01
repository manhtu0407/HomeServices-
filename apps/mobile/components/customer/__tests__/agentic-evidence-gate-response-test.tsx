import { render, screen } from '@testing-library/react-native'

import { AgenticEvidenceGateResponse } from '../kael-chat/agentic-evidence-gate-response'
import { getCustomerThemeTokens } from '../customer-theme'

const tokens = getCustomerThemeTokens('light')

describe('Customer Kael evidence gate', () => {
  it('uses compact matching media and voice rows with truthful evidence guidance', () => {
    render(
      <AgenticEvidenceGateResponse
        busy={false}
        language="vi"
        mediaDrafts={[]}
        onAddMedia={jest.fn()}
        onConfirm={jest.fn()}
        onReasonChange={jest.fn()}
        onReject={jest.fn()}
        onRemoveMedia={jest.fn()}
        onSkip={jest.fn()}
        onVoiceTranscriptChange={jest.fn()}
        rejectOpen={false}
        rejectReason=""
        textInputNoOutlineStyle={undefined}
        tokens={tokens}
        voiceTranscript=""
      />,
    )

    expect(screen.getByTestId('customer-v21-agentic-evidence-add-media')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-evidence-add-voice')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-evidence-voice-count')).toHaveTextContent('0')

    const guidance = screen.getByTestId('customer-v21-agentic-evidence-privacy-disclosure')
    expect(guidance).toHaveTextContent(/Kael xử lý trong phạm vi phù hợp\./)
    expect(guidance).toHaveTextContent(/Kiểm tra vùng thấy được và độ rõ\./)
    expect(guidance).toHaveTextContent(
      /Giữ bản gốc riêng tư; chỉ phân tích khung hình tách trên thiết bị\./,
    )
    expect(guidance).toHaveTextContent(
      /Chỉ gửi bản chép lời bạn đã duyệt\./,
    )
    expect(guidance).toHaveTextContent(/Nêu thời điểm nếu lỗi xuất hiện khi chuyển động hoặc có tiếng động\./)
    expect(screen.queryByText('Bản chép lời riêng tư')).toBeNull()
    expect(screen.queryByText(/Preview web không dùng nhận dạng giọng nói/)).toBeNull()
  })
})
