import { render, screen } from '@testing-library/react-native'

import { AgenticEvidenceGateResponse } from '../kael-chat/agentic-evidence-gate-response'
import { getCustomerThemeTokens } from '../customer-theme'

const tokens = getCustomerThemeTokens('light')

describe('Customer Kael evidence gate', () => {
  it('uses compact matching media and voice rows without the legacy transcript card', () => {
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
    expect(screen.getByTestId('customer-v21-agentic-evidence-privacy-disclosure')).toHaveTextContent(
      'Video gốc lưu riêng tư cho người có quyền xem lại, Kael chỉ phân tích 1–3 khung hình tách trên thiết bị. Giọng nói được nhận trên thiết bị, chỉ bản chép lời bạn đã kiểm tra được gửi cho Kael.',
    )
    expect(screen.getByTestId('customer-v21-agentic-evidence-privacy-disclosure')).not.toHaveTextContent(';')
    expect(screen.queryByText('Bản chép lời riêng tư')).toBeNull()
    expect(screen.queryByText(/Preview web không dùng nhận giọng nói/)).toBeNull()
  })
})
