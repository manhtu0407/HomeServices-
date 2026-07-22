import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { LocalDeal } from '@nestscout/shared'

import { getCustomerThemeTokens } from '../customer-theme'
import { AgenticCaseThreadPanel } from '../v21/chat-case-thread-stateful-surfaces'

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
    expect(screen.queryByTestId('customer-v21-case-staging-payment-start')).not.toBeOnTheScreen()
    expect(onOpenActivity).not.toHaveBeenCalled()
  })

  it('runs the explicit two-step payment simulator only when the staging capability is visible', async () => {
    const onCreatePaymentIntent = jest.fn(async () => true)
    const onConfirmStagingPayment = jest.fn(async () => true)
    renderPanel(dealFixture('confirmed_by_customer'), jest.fn(), jest.fn(), jest.fn(), {
      onConfirmStagingPayment,
      onCreatePaymentIntent,
      stagingPaymentRailEnabled: true,
    })

    fireEvent.press(screen.getByTestId('customer-v21-case-staging-payment-start'))
    await waitFor(() => expect(onCreatePaymentIntent).toHaveBeenCalledTimes(1))

    const pendingDeal = dealFixture('payment_pending')
    if (pendingDeal.payment) pendingDeal.payment.provider = 'staging_simulator'
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      onConfirmStagingPayment,
      onCreatePaymentIntent,
      stagingPaymentRailEnabled: true,
    })
    fireEvent.press(screen.getByTestId('customer-v21-case-staging-payment-confirm'))
    await waitFor(() => expect(onConfirmStagingPayment).toHaveBeenCalledTimes(1))
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
    onConfirmStagingPayment?: () => Promise<boolean>
    onCreatePaymentIntent?: () => Promise<boolean>
    onSubmitReview?: (input: { rating: number; tags: string[]; comment?: string }) => Promise<boolean>
    stagingPaymentRailEnabled?: boolean
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
      onConfirmStagingPayment={options.onConfirmStagingPayment ?? jest.fn(async () => false)}
      onCreatePaymentIntent={options.onCreatePaymentIntent ?? jest.fn(async () => false)}
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
      stagingPaymentRailEnabled={options.stagingPaymentRailEnabled ?? false}
      textInputStyle={{}}
      tokens={getCustomerThemeTokens('light')}
    />,
  )
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
