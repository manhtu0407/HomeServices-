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
    expect(guidance).toHaveTextContent(/Kael xử lý từng loại bằng chứng theo giới hạn phù hợp\./)
    expect(guidance).toHaveTextContent(/Ảnh: Kael kiểm tra vùng nhìn thấy và độ rõ của ảnh\./)
    expect(guidance).toHaveTextContent(
      /Video: bản gốc được giữ riêng tư; Kael phân tích các khung hình đã tách trên thiết bị\./,
    )
    expect(guidance).toHaveTextContent(
      /Giọng nói: nhận dạng trên thiết bị khi được hỗ trợ, rồi bạn kiểm tra bản chép lời trước khi gửi\./,
    )
    expect(screen.queryByText('Bản chép lời riêng tư')).toBeNull()
    expect(screen.queryByText(/Preview web không dùng nhận dạng giọng nói/)).toBeNull()
  })
})
