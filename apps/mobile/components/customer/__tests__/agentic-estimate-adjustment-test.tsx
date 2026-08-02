import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { AgenticChatEstimateResponsePanel } from '../kael-chat/agentic-decision-surfaces'

function renderPanel({
  adjustmentOpen = false,
  adjustmentText = '',
  canSubmitAdjustment = false,
  onAdjust = jest.fn(),
  onAdjustmentChange = jest.fn(),
  onSubmitAdjustment = jest.fn(),
} = {}) {
  render(
    <AgenticChatEstimateResponsePanel
      adjustmentOpen={adjustmentOpen}
      adjustmentText={adjustmentText}
      canConfirm
      canSubmitAdjustment={canSubmitAdjustment}
      canSubmitRejectReason={false}
      confirmed={false}
      confirming={false}
      confirmLabel="Xac nhan"
      disclaimer="Uoc tinh co the cap nhat khi co them bang chung."
      language="vi"
      moreInfoText=""
      needsMoreInfo={false}
      onAdjust={onAdjust}
      onAdjustmentChange={onAdjustmentChange}
      onConfirm={jest.fn()}
      onReasonChange={jest.fn()}
      onReject={jest.fn()}
      onSubmitAdjustment={onSubmitAdjustment}
      onSubmitRejectReason={jest.fn()}
      price="150.000d - 350.000d"
      priceExplanation="Khoang gia theo pham vi da xac nhan."
      rejected={false}
      rejectLabel="Tu choi"
      rejectReason=""
      serviceLabel="Sua nuoc"
      sourceExplanation=""
      statusLabel="Can ban chot"
      submittingAdjustment={false}
      submittingRejectReason={false}
      supportingPhase={null}
      textInputStyle={undefined}
    />,
  )
}

describe('Agentic estimate adjustment', () => {
  it('offers a distinct adjustment action beside decline and confirm', () => {
    const onAdjust = jest.fn()
    renderPanel({ onAdjust })

    fireEvent.press(screen.getByTestId('customer-v21-agentic-estimate-adjust'))

    expect(onAdjust).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('customer-v21-agentic-estimate-reject')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-estimate-confirm')).toBeOnTheScreen()
  })

  it('collects additional information and submits it for re-analysis', () => {
    const onAdjustmentChange = jest.fn()
    const onSubmitAdjustment = jest.fn()
    renderPanel({
      adjustmentOpen: true,
      adjustmentText: 'Nuoc chi ro khi xa bon.',
      canSubmitAdjustment: true,
      onAdjustmentChange,
      onSubmitAdjustment,
    })

    fireEvent.changeText(
      screen.getByTestId('customer-v21-agentic-adjustment-input'),
      'Vet am lan rong hon.',
    )
    fireEvent.press(screen.getByTestId('customer-v21-agentic-adjustment-send'))

    expect(onAdjustmentChange).toHaveBeenCalledWith('Vet am lan rong hon.')
    expect(onSubmitAdjustment).toHaveBeenCalledTimes(1)
  })

  it('keeps the estimate headings visibly prioritized', () => {
    renderPanel()

    const serviceTitleStyle = StyleSheet.flatten(
      screen.getByTestId('customer-v21-case-work-response-title').props.style,
    )
    const noteTitleStyle = StyleSheet.flatten(screen.getByText('Phạm vi và ước tính').props.style)

    expect(serviceTitleStyle).toMatchObject({ fontSize: 25, fontWeight: '600' })
    expect(noteTitleStyle.fontWeight).toBe('700')
  })
})
