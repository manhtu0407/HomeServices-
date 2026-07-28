import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import { getCustomerThemeTokens } from '../customer-theme'
import { AgenticCaseThreadPanel } from '../kael-chat/chat-case-thread-stateful-surfaces'

describe('Case Work phase controls', () => {
  it('does not expose scope decisions before Kael finishes reviewing the change', () => {
    renderPanel(dealFixture('scope_change_pending', 'reviewing_by_kael'))

    expect(screen.queryByTestId('customer-v21-case-work-scope-approve')).not.toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-work-scope-reject')).not.toBeOnTheScreen()
  })

  it('exposes scope decisions only at the authoritative customer-decision state', () => {
    renderPanel(dealFixture('scope_change_pending', 'waiting_customer_decision'))

    expect(screen.getByTestId('customer-v21-case-work-scope-approve')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-scope-reject')).toBeOnTheScreen()
  })

  it('keeps Production in an honest unavailable payment state without losing the Case Work context', () => {
    const onOpenActivity = jest.fn()
    renderPanel(dealFixture('confirmed_by_customer'), onOpenActivity)

    expect(screen.getByText('Phương thức thanh toán chưa khả dụng cho công việc này.')).toBeOnTheScreen()
    expect(onOpenActivity).not.toHaveBeenCalled()
  })

  it('keeps a legacy test payment unavailable instead of exposing a customer confirmation', () => {
    const onCreatePaymentIntent = jest.fn(async () => true)
    const pendingDeal = dealFixture('payment_pending')
    if (pendingDeal.payment) pendingDeal.payment.provider = 'staging_simulator'
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      onCreatePaymentIntent,
    })

    expect(screen.getByText('Thanh toán chưa sẵn sàng')).toBeOnTheScreen()
    expect(screen.queryByText(/mô phỏng/i)).not.toBeOnTheScreen()
    expect(onCreatePaymentIntent).not.toHaveBeenCalled()
  })

  it('opens a production VietQR intent but never exposes a customer-paid confirmation', async () => {
    const onCreatePaymentIntent = jest.fn(async () => true)
    renderPanel(dealFixture('confirmed_by_customer'), jest.fn(), jest.fn(), jest.fn(), {
      onCreatePaymentIntent,
      paymentRailProvider: 'sepay_vietqr',
    })

    fireEvent.press(screen.getByTestId('customer-v21-case-sepay-payment-start'))
    await waitFor(() => expect(onCreatePaymentIntent).toHaveBeenCalledTimes(1))

    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = verifiedVietQrPayment()
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      paymentRailProvider: 'sepay_vietqr',
    })

    expect(screen.getByTestId('customer-v21-case-sepay-qr')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-case-sepay-qr-frame').props.style)).toMatchObject({
      height: 232,
      width: 232,
    })
    expect(screen.getByTestId('customer-v21-case-sepay-transfer-content')).toHaveTextContent('NS1234567890ABCDEF12345678')
    expect(screen.queryByTestId('customer-v21-case-sepay-payment-confirm')).not.toBeOnTheScreen()
  })

  it('shows only verified VietQR instructions and refreshes payment state without creating another intent', async () => {
    const onCreatePaymentIntent = jest.fn(async () => true)
    const onRefreshPayment = jest.fn(async () => true)
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = verifiedVietQrPayment()
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      onCreatePaymentIntent,
      onRefreshPayment,
      paymentRailProvider: 'sepay_vietqr',
    })

    expect(screen.getByText('Thanh toán qua VietQR')).toBeOnTheScreen()
    expect(screen.getByText('Số tiền cần chuyển')).toBeOnTheScreen()
    expect(screen.getByText('450.000đ')).toBeOnTheScreen()
    expect(screen.getByText('Nội dung chuyển khoản')).toBeOnTheScreen()
    expect(screen.getByText(/Không cần bấm xác nhận thanh toán\./)).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-v21-case-sepay-payment-refresh'))
    await waitFor(() => expect(onRefreshPayment).toHaveBeenCalledTimes(1))
    expect(onCreatePaymentIntent).not.toHaveBeenCalled()
    expect(screen.queryByTestId('customer-v21-case-sepay-payment-confirm')).not.toBeOnTheScreen()
  })

  it('hides an unverified QR and prevents a new transfer instruction from being shown', async () => {
    const onRefreshPayment = jest.fn(async () => true)
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = verifiedVietQrPayment({
      qrImageUrl: 'https://vietqr.app/img?acc=1234567890&bank=MB&amount=450001&des=NS1234567890ABCDEF12345678',
    })
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      onRefreshPayment,
      paymentRailProvider: 'sepay_vietqr',
    })

    expect(screen.queryByTestId('customer-v21-case-sepay-qr')).not.toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-sepay-transfer-content')).not.toBeOnTheScreen()
    expect(screen.getByText('Thông tin VietQR chưa thể xác minh.')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-v21-case-sepay-payment-refresh'))
    await waitFor(() => expect(onRefreshPayment).toHaveBeenCalledTimes(1))
  })

  it('fails closed when the server no longer enables the VietQR rail', () => {
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = verifiedVietQrPayment()
    renderPanel(pendingDeal)

    expect(screen.queryByTestId('customer-v21-case-sepay-qr')).not.toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-sepay-transfer-content')).not.toBeOnTheScreen()
    expect(screen.getByText('Thanh toán chưa thể tiếp tục')).toBeOnTheScreen()
  })

  it('removes the QR if the image cannot load and keeps the safe refresh action', async () => {
    const onRefreshPayment = jest.fn(async () => true)
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = verifiedVietQrPayment()
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      onRefreshPayment,
      paymentRailProvider: 'sepay_vietqr',
    })

    fireEvent(screen.getByTestId('customer-v21-case-sepay-qr'), 'error', {
      nativeEvent: { error: 'image unavailable' },
    })

    await waitFor(() => {
      expect(screen.queryByTestId('customer-v21-case-sepay-qr')).not.toBeOnTheScreen()
      expect(screen.getByText('Thông tin VietQR chưa thể xác minh.')).toBeOnTheScreen()
    })

    fireEvent.press(screen.getByTestId('customer-v21-case-sepay-payment-refresh'))
    await waitFor(() => expect(onRefreshPayment).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('customer-v21-case-sepay-qr')).toBeOnTheScreen())
  })

  it('does not offer the QR again after an amount mismatch', async () => {
    const onRefreshPayment = jest.fn(async () => true)
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = verifiedVietQrPayment({
      amountReceived: 400_000,
      status: 'amount_mismatch',
    })
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      onRefreshPayment,
      paymentRailProvider: 'sepay_vietqr',
    })

    expect(screen.getByText('Số tiền nhận được chưa khớp')).toBeOnTheScreen()
    expect(screen.getByText(/Không chuyển thêm tiền cho công việc này\./)).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-sepay-qr')).not.toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-sepay-transfer-content')).not.toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-v21-case-sepay-payment-refresh'))
    await waitFor(() => expect(onRefreshPayment).toHaveBeenCalledTimes(1))
  })

  it('submits a real review inline after the server reports paid', async () => {
    const onSubmitReview = jest.fn(async () => true)
    renderPanel(dealFixture('paid'), jest.fn(), jest.fn(), jest.fn(), { onSubmitReview })

    fireEvent.press(screen.getByTestId('customer-v21-case-review-rating-5'))
    fireEvent.changeText(screen.getByTestId('customer-v21-case-review-comment'), 'Làm việc cẩn thận và đúng phạm vi.')
    fireEvent.press(screen.getByTestId('customer-v21-case-review-submit'))

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith({
      comment: 'Làm việc cẩn thận và đúng phạm vi.',
      rating: 5,
      tags: [],
    }))
  })

  it('keeps completed Case Work phases visible while the next phase remains actionable', () => {
    renderPanel(dealFixture('paid'))

    expect(screen.getByTestId('customer-v21-case-work-phase-history')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-history-ticket_review')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-history-payment_pending')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-review-controls')).toBeOnTheScreen()
  })

  it('shows phase history as soon as phase two is completed', () => {
    renderPanel(dealFixture('analyzing'))

    expect(screen.getByTestId('customer-v21-case-work-phase-history')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-history-intake_started')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-history-kael_collecting')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-work-history-kael_estimating')).not.toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-response-status')).toHaveTextContent('Đang phân tích')
  })

  it('offers one explicit retry only after the worker broadcast expires', () => {
    const onRetryWorkerSearch = jest.fn()
    renderPanel(dealFixture('broadcasting', 'waiting_customer_decision', 'expired'), jest.fn(), onRetryWorkerSearch)

    fireEvent.press(screen.getByTestId('customer-v21-case-retry-worker-search'))
    expect(onRetryWorkerSearch).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Tìm lại thợ')).toBeOnTheScreen()
  })

  it('keeps retry hidden while a worker broadcast is still active', () => {
    renderPanel(dealFixture('broadcasting', 'waiting_customer_decision', 'sent'))

    expect(screen.queryByTestId('customer-v21-case-retry-worker-search')).not.toBeOnTheScreen()
  })

  it('lets the customer release the unit only after the worker lobby check-in', async () => {
    const onAuthorizeApartmentAccess = jest.fn()
    const deal = dealFixture('arrived')
    deal.broadcast = {
      addressAccess: {
        access_profile: {},
        check_in_required: false,
        customer_handoff_required: true,
        evidence_mode: 'manual_photo',
        exact_unit_released: false,
        identity_check_required: true,
        release_stage: 'building_released',
        worker_checked_in: true,
      },
      fullAddressLabel: 'Tòa A, Quận 1',
      fullAddressVisible: false,
      generalArea: 'Quận 1',
      prebrief: [],
      problemSummary: 'Ổ cắm bị cháy xém',
      secondsRemaining: null,
      serviceType: 'electrical',
      status: 'accepted',
    }

    renderPanel(deal, jest.fn(), jest.fn(), onAuthorizeApartmentAccess)

    fireEvent.press(screen.getByTestId('customer-v21-case-authorize-apartment-access'))
    await waitFor(() => expect(onAuthorizeApartmentAccess).toHaveBeenCalledTimes(1))
  })
})

function renderPanel(
  deal: LocalDeal,
  onOpenActivity = jest.fn(),
  onRetryWorkerSearch = jest.fn(),
  onAuthorizeApartmentAccess = jest.fn(),
  options: {
    onCreatePaymentIntent?: () => Promise<boolean>
    onRefreshPayment?: () => Promise<boolean>
    onSubmitReview?: (input: { rating: number; tags: string[]; comment?: string }) => Promise<boolean>
    paymentRailProvider?: 'sepay_vietqr' | null
  } = {},
) {
  return render(
    <AgenticCaseThreadPanel
      activityLabel="Xem hoạt động"
      caseEvidenceGateActive={false}
      caseEvidenceGateNode={null}
      caseOptionsAcknowledged
      caseQuoteRejectOpen={false}
      caseQuoteRejectReason=""
      completionReviewNode={null}
      confirmingCaseQuote={false}
      deal={deal}
      language="vi"
      onAcknowledgeOptions={jest.fn()}
      onAuthorizeApartmentAccess={onAuthorizeApartmentAccess}
      onCreatePaymentIntent={options.onCreatePaymentIntent ?? jest.fn(async () => false)}
      onRefreshPayment={options.onRefreshPayment ?? jest.fn(async () => false)}
      onApproveQuote={jest.fn()}
      onApproveScopeChange={jest.fn()}
      onOpenActivity={onOpenActivity}
      onQuoteRejectReasonChange={jest.fn()}
      onQuoteRejectReasonSubmit={jest.fn()}
      onRejectQuote={jest.fn()}
      onRejectScopeChange={jest.fn()}
      onRetryWorkerSearch={onRetryWorkerSearch}
      onSubmitReview={options.onSubmitReview ?? jest.fn(async () => false)}
      reduceMotion
      retryingWorkerSearch={false}
      submittingCaseQuoteRejectReason={false}
      paymentRailProvider={options.paymentRailProvider ?? null}
      textInputStyle={{}}
      tokens={getCustomerThemeTokens('light')}
    />,
  )
}

function verifiedVietQrPayment(
  overrides: Partial<NonNullable<LocalDeal['payment']>> = {},
): NonNullable<LocalDeal['payment']> {
  const paymentCode = 'NS1234567890ABCDEF12345678'
  return {
    grossAmount: 450_000,
    paymentCode,
    platformFee: 45_000,
    provider: 'sepay_vietqr',
    qrImageUrl: `https://vietqr.app/img?acc=1234567890&bank=MB&amount=450000&des=${paymentCode}&template=compact&showinfo=true&holder=NestScout&store=NestScout`,
    status: 'vietqr_ready',
    transferContent: paymentCode,
    workerNet: 405_000,
    ...overrides,
  }
}

function dealFixture(
  status: LocalDeal['status'],
  scopeStatus: NonNullable<LocalDeal['scopeChange']>['status'] = 'waiting_customer_decision',
  broadcastStatus: NonNullable<LocalDeal['broadcast']>['status'] | null = null,
): LocalDeal {
  return {
    broadcast: broadcastStatus
      ? {
          fullAddressLabel: null,
          fullAddressVisible: false,
          generalArea: 'Thành phố Thủ Đức',
          prebrief: [],
          problemSummary: 'Ổ cắm bị cháy xém',
          secondsRemaining: broadcastStatus === 'expired' ? 0 : 42,
          serviceType: 'electrical',
          status: broadcastStatus,
        }
      : null,
    createdAt: '2026-07-19T08:00:00.000Z',
    draft: {
      addressLabel: 'Vinhomes Grand Park',
      description: 'Lắp xà đơn trên tường bê tông',
      districtLabel: 'Thành phố Thủ Đức',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: [],
      serviceType: 'handyman',
      source: 'kael',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: null,
    id: 'job-1',
    payment: status === 'payment_pending' || status === 'paid'
      ? {
          grossAmount: 450000,
          platformFee: 45000,
          provider: 'sepay_vietqr',
          status: status === 'paid' ? 'received' : 'pending',
          workerNet: 405000,
        }
      : null,
    scopeChange: status === 'scope_change_pending'
      ? {
          createdAt: '2026-07-19T08:10:00.000Z',
          evidencePhotoUrls: [],
          id: 'scope-1',
          kaelProgress: null,
          kaelReview: { confidence: 0.9 },
          priceMax: 520000,
          priceMin: 480000,
          reason: 'Cần đổi vị trí khoan để tránh đường điện âm tường.',
          requestedDescription: 'Dời vị trí khoan sang trái 20 cm.',
          status: scopeStatus,
        }
      : null,
    status,
  }
}
