import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { AgenticChatEstimateResponsePanel } from '../kael-chat/agentic-decision-surfaces'
import type { AgenticEstimateSupportingPhaseModel } from '../kael-chat/agentic-estimate-display-model'

const priceReasoning: AgenticEstimateSupportingPhaseModel = {
  receiptId: 'receipt_kael_price_20260811_01',
  rows: [{ detail: 'Khoảng giá dựa trên phạm vi đã xác nhận.', key: 'price', label: 'Cơ sở giá' }],
  title: 'Kael kiểm tra thông tin và cơ sở giá',
  valueStatement: 'Không có giá phát sinh nào được tự cộng.',
}

function renderPanel({
  adjustmentOpen = false,
  adjustmentText = '',
  canConfirm = true,
  canSubmitAdjustment = false,
  onAskPrice = jest.fn(),
  onAdjust = jest.fn(),
  onAdjustmentChange = jest.fn(),
  onSubmitAdjustment = jest.fn(),
  onSubmitSchedule = jest.fn(),
  requiresSchedule = false,
  supportingPhase: suppliedSupportingPhase = null,
}: {
  adjustmentOpen?: boolean
  adjustmentText?: string
  canConfirm?: boolean
  canSubmitAdjustment?: boolean
  onAdjust?: jest.Mock
  onAskPrice?: jest.Mock
  onAdjustmentChange?: jest.Mock
  onSubmitAdjustment?: jest.Mock
  onSubmitSchedule?: jest.Mock
  requiresSchedule?: boolean
  supportingPhase?: AgenticEstimateSupportingPhaseModel | null
} = {}) {
  render(
    <AgenticChatEstimateResponsePanel
      adjustmentOpen={adjustmentOpen}
      adjustmentText={adjustmentText}
      canConfirm={canConfirm}
      canSubmitAdjustment={canSubmitAdjustment}
      canSubmitRejectReason={false}
      confirmed={false}
      confirming={false}
      confirmLabel="Xac nhan"
      disclaimer="Uoc tinh co the cap nhat khi co them bang chung."
      language="vi"
      moreInfoText=""
      needsMoreInfo={false}
      onAskPrice={onAskPrice}
      onAdjust={onAdjust}
      onAdjustmentChange={onAdjustmentChange}
      onConfirm={jest.fn()}
      onReasonChange={jest.fn()}
      onReject={jest.fn()}
      onSubmitAdjustment={onSubmitAdjustment}
      onSubmitRejectReason={jest.fn()}
      onSubmitSchedule={onSubmitSchedule}
      priceExplanation="Khoang gia theo pham vi da xac nhan."
      priceQuestionOpen={false}
      rejected={false}
      rejectLabel="Tu choi"
      rejectReason=""
      serviceLabel="Sua nuoc"
      sourceExplanation=""
      statusLabel="Can ban chot"
      requiresSchedule={requiresSchedule}
      submittingAdjustment={false}
      submittingRejectReason={false}
      supportingPhase={suppliedSupportingPhase}
      textInputStyle={undefined}
    />,
  )
}

describe('Agentic estimate adjustment', () => {
  it('offers a distinct adjustment action beside decline and confirm', () => {
    const onAdjust = jest.fn()
    renderPanel({ onAdjust })

    fireEvent.press(screen.getByTestId('customer-v21-agentic-estimate-adjust-scope'))

    expect(onAdjust).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('customer-v21-agentic-estimate-reject')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-estimate-confirm')).toBeOnTheScreen()
  })

  it('blocks confirmation until a validated price reasoning receipt is available', () => {
    renderPanel()

    expect(screen.getByTestId('customer-v21-agentic-estimate-confirm'))
      .toHaveProp('accessibilityState', { busy: false, disabled: true })
    expect(screen.getByTestId('customer-v21-agentic-estimate-price-reasoning-required'))
      .toHaveTextContent(/Kael chưa có biên nhận phân tích giá đã xác thực/)
  })

  it('opens a price explanation without treating it as a scope adjustment', () => {
    const onAskPrice = jest.fn()
    renderPanel({ onAskPrice })

    fireEvent.press(screen.getByTestId('customer-v21-agentic-estimate-ask-price'))

    expect(onAskPrice).toHaveBeenCalledTimes(1)
  })

  it('enables confirmation once the validated price reasoning receipt is available', () => {
    renderPanel({ supportingPhase: priceReasoning })

    expect(screen.getByTestId('customer-v21-agentic-estimate-confirm'))
      .toHaveProp('accessibilityState', { busy: false, disabled: false })
    expect(screen.queryByTestId('customer-v21-agentic-estimate-price-reasoning-required')).toBeNull()
  })

  it('blocks confirmation until the customer chooses a service time', () => {
    renderPanel({ requiresSchedule: true, supportingPhase: priceReasoning })

    expect(screen.getByTestId('customer-v21-agentic-estimate-confirm'))
      .toHaveProp('accessibilityState', { busy: false, disabled: true })
    expect(screen.getByTestId('customer-v21-agentic-schedule-required'))
      .toHaveTextContent(/chọn thời gian hẹn/i)
  })

  it('sends a customer-selected HCMC time back for re-analysis', async () => {
    const onSubmitSchedule = jest.fn().mockResolvedValue(undefined)
    renderPanel({
      onSubmitSchedule,
      requiresSchedule: true,
      supportingPhase: priceReasoning,
    })

    fireEvent.changeText(
      screen.getByTestId('customer-v21-agentic-schedule-custom-date'),
      '12/08/2030',
    )
    fireEvent.changeText(
      screen.getByTestId('customer-v21-agentic-schedule-custom-time'),
      '09:00',
    )
    fireEvent.press(screen.getByTestId('customer-v21-agentic-schedule-submit'))

    await waitFor(() => expect(onSubmitSchedule).toHaveBeenCalledTimes(1))
    expect(onSubmitSchedule).toHaveBeenCalledWith({
      message: 'Tôi muốn hẹn 2030-08-12 từ 09:00 đến 11:00.',
      scheduled_at: '2030-08-12T02:00:00.000Z',
      schedule_window: {
        date: '2030-08-12',
        end: '11:00',
        start: '09:00',
        time_zone: 'Asia/Ho_Chi_Minh',
      },
    })
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
