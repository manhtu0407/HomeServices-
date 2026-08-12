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

    expect(screen.getByTestId('customer-v21-case-payment-unavailable')).toBeOnTheScreen()
    expect(onOpenActivity).not.toHaveBeenCalled()
  })

  it('keeps a legacy test payment unavailable instead of exposing a customer confirmation', () => {
    const onCreatePaymentIntent = jest.fn(async () => true)
    const pendingDeal = dealFixture('payment_pending')
    if (pendingDeal.payment) pendingDeal.payment.provider = 'staging_simulator'
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), { onCreatePaymentIntent })

    expect(screen.getByTestId('customer-v21-case-payment-unavailable')).toBeOnTheScreen()
    expect(onCreatePaymentIntent).not.toHaveBeenCalled()
  })

  it('creates a manual platform order only after completion confirmation', async () => {
    const onCreateManualBankPaymentOrder = jest.fn(async () => true)
    renderPanel(dealFixture('confirmed_by_customer'), jest.fn(), jest.fn(), jest.fn(), {
      onCreateManualBankPaymentOrder,
      paymentRailProvider: 'platform_bank_manual',
    })

    fireEvent.press(screen.getByTestId('customer-v21-case-manual-payment-create'))
    await waitFor(() => expect(onCreateManualBankPaymentOrder).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('customer-v21-case-payment-confirmed')).not.toBeOnTheScreen()
  })

  it('shows a per-job QR receipt and only lets the customer claim the transfer', async () => {
    const onClaimManualBankPayment = jest.fn(async () => true)
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = manualBankPayment()
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      onClaimManualBankPayment,
      paymentRailProvider: 'platform_bank_manual',
    })

    expect(screen.getByTestId('customer-v21-case-manual-payment-ready')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-manual-payment-ready-formula-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-manual-qr')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-case-manual-qr-frame').props.style)).toMatchObject({
      aspectRatio: 1,
      maxWidth: 256,
      width: '100%',
    })
    expect(screen.getByTestId('customer-v21-case-direct-payment-warning')).toBeOnTheScreen()
    expect(screen.getByText('Chỉ chọn khi chưa báo đã chuyển QR. Kael giữ 15% hoa hồng đến khi hai bên cùng xác nhận.')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-case-direct-payment-warning').props.style)).toMatchObject({
      paddingHorizontal: 16,
      paddingVertical: 16,
    })
    fireEvent.press(screen.getByTestId('customer-v21-case-manual-payment-claim'))
    await waitFor(() => expect(onClaimManualBankPayment).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('customer-v21-case-payment-confirmed')).not.toBeOnTheScreen()
  })

  it('keeps the dark payment receipt solid instead of applying the light Formula Mint aura', () => {
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = manualBankPayment()
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      paymentRailProvider: 'platform_bank_manual',
      themeMode: 'dark',
    })

    expect(screen.getByTestId('customer-v21-case-manual-payment-ready')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-manual-payment-ready-formula-mint-aura')).not.toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-manual-qr')).toBeOnTheScreen()
  })

  it('keeps manual claims in reconciliation and does not show the QR again', async () => {
    const onRefreshPayment = jest.fn(async () => true)
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = manualBankPayment({ status: 'manual_reconcile_required' })
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      onRefreshPayment,
      paymentRailProvider: 'platform_bank_manual',
    })

    expect(screen.getByTestId('customer-v21-case-manual-payment-reconcile')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-manual-qr')).not.toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('customer-v21-case-payment-refresh'))
    await waitFor(() => expect(onRefreshPayment).toHaveBeenCalledTimes(1))
  })

  it('requires the customer direct-payment confirmation without marking the job paid', async () => {
    const onRespondToDirectWorkerPayment = jest.fn(async () => true)
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = manualBankPayment({
      collateralAmount: 67_500,
      directResponseDeadline: '2099-01-01T00:00:00.000Z',
      provider: 'direct_worker',
      status: 'direct_awaiting_confirmation',
    })
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      onRespondToDirectWorkerPayment,
      paymentRailProvider: 'platform_bank_manual',
    })

    fireEvent.press(screen.getByTestId('customer-v21-case-direct-payment-confirm'))
    await waitFor(() => expect(onRespondToDirectWorkerPayment).toHaveBeenCalledWith(true))
    expect(screen.queryByTestId('customer-v21-case-payment-confirmed')).not.toBeOnTheScreen()
  })

  it('submits a real review inline after the server reports paid', async () => {
    const onSubmitReview = jest.fn(async () => true)
    renderPanel(dealFixture('paid'), jest.fn(), jest.fn(), jest.fn(), { onSubmitReview })

    expect(screen.getByTestId('customer-v21-case-payment-confirmed')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-review-controls')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('customer-v21-case-review-rating-5'))
    fireEvent.changeText(screen.getByTestId('customer-v21-case-review-comment'), 'Completed within scope.')
    fireEvent.press(screen.getByTestId('customer-v21-case-review-submit'))

    await waitFor(() => expect(onSubmitReview).toHaveBeenCalledWith({
      comment: 'Completed within scope.',
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
    expect(screen.getByTestId('customer-v21-case-work-response-status')).toBeOnTheScreen()
  })

  it('offers one explicit retry only after the worker broadcast expires', () => {
    const onRetryWorkerSearch = jest.fn()
    renderPanel(dealFixture('broadcasting', 'waiting_customer_decision', 'expired'), jest.fn(), onRetryWorkerSearch)

    fireEvent.press(screen.getByTestId('customer-v21-case-retry-worker-search'))
    expect(onRetryWorkerSearch).toHaveBeenCalledTimes(1)
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
      fullAddressLabel: 'TÃƒÂ²a A, QuÃ¡ÂºÂ­n 1',
      fullAddressVisible: false,
      generalArea: 'QuÃ¡ÂºÂ­n 1',
      prebrief: [],
      problemSummary: 'Ã¡Â»â€ cÃ¡ÂºÂ¯m bÃ¡Â»â€¹ chÃƒÂ¡y xÃƒÂ©m',
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
    onClaimManualBankPayment?: () => Promise<boolean>
    onCreateManualBankPaymentOrder?: () => Promise<boolean>
    onCreatePaymentIntent?: () => Promise<boolean>
    onRefreshPayment?: () => Promise<boolean>
    onRespondToDirectWorkerPayment?: (received: boolean) => Promise<boolean>
    onSelectDirectWorkerPayment?: () => Promise<boolean>
    onSubmitReview?: (input: { rating: number; tags: string[]; comment?: string }) => Promise<boolean>
    paymentRailProvider?: 'platform_bank_manual' | 'sepay_vietqr' | null
    themeMode?: 'light' | 'dark'
  } = {},
) {
  return render(
    <AgenticCaseThreadPanel
      activityLabel="Xem hoÃ¡ÂºÂ¡t Ã„â€˜Ã¡Â»â„¢ng"
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
       onCreateManualBankPaymentOrder={options.onCreateManualBankPaymentOrder ?? jest.fn(async () => false)}
       onClaimManualBankPayment={options.onClaimManualBankPayment ?? jest.fn(async () => false)}
       onSelectDirectWorkerPayment={options.onSelectDirectWorkerPayment ?? jest.fn(async () => false)}
       onRespondToDirectWorkerPayment={options.onRespondToDirectWorkerPayment ?? jest.fn(async () => false)}
       onChooseMatchingPreference={jest.fn(async () => false)}
      onLoadSavedWorkers={jest.fn(async () => [])}
      onRefreshPayment={options.onRefreshPayment ?? jest.fn(async () => false)}
      onApproveQuote={jest.fn()}
      onApproveScopeChange={jest.fn()}
      onOpenActivity={onOpenActivity}
      onQuoteRejectReasonChange={jest.fn()}
      onQuoteRejectReasonSubmit={jest.fn()}
      onRejectQuote={jest.fn()}
      onRejectScopeChange={jest.fn()}
      onRetryWorkerSearch={onRetryWorkerSearch}
      onStopMatching={jest.fn(async () => false)}
      onSubmitReview={options.onSubmitReview ?? jest.fn(async () => false)}
      reduceMotion
      retryingWorkerSearch={false}
      submittingCaseQuoteRejectReason={false}
      paymentRailProvider={options.paymentRailProvider ?? null}
      textInputStyle={{}}
      tokens={getCustomerThemeTokens(options.themeMode ?? 'light')}
    />,
  )
}

function manualBankPayment(
  overrides: Partial<NonNullable<LocalDeal['payment']>> = {},
): NonNullable<LocalDeal['payment']> {
  const paymentCode = 'NS-DEAL-PAYMENT-0001'
  return {
    accountHolder: 'Platform account',
    accountMasked: '****6789',
    bankCode: 'VCB',
    grossAmount: 450_000,
    paymentCode,
    platformFee: 45_000,
    provider: 'platform_bank_manual',
    qrImageUrl: 'https://qr.example.test/' + paymentCode,
    status: 'manual_qr_ready',
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
          generalArea: 'ThÃƒÂ nh phÃ¡Â»â€˜ ThÃ¡Â»Â§ Ã„ÂÃ¡Â»Â©c',
          prebrief: [],
          problemSummary: 'Ã¡Â»â€ cÃ¡ÂºÂ¯m bÃ¡Â»â€¹ chÃƒÂ¡y xÃƒÂ©m',
          secondsRemaining: broadcastStatus === 'expired' ? 0 : 42,
          serviceType: 'electrical',
          status: broadcastStatus,
        }
      : null,
    createdAt: '2026-07-19T08:00:00.000Z',
    draft: {
      addressLabel: 'Vinhomes Grand Park',
      description: 'LÃ¡ÂºÂ¯p xÃƒÂ  Ã„â€˜Ã†Â¡n trÃƒÂªn tÃ†Â°Ã¡Â»Âng bÃƒÂª tÃƒÂ´ng',
      districtLabel: 'ThÃƒÂ nh phÃ¡Â»â€˜ ThÃ¡Â»Â§ Ã„ÂÃ¡Â»Â©c',
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
          reason: 'CÃ¡ÂºÂ§n Ã„â€˜Ã¡Â»â€¢i vÃ¡Â»â€¹ trÃƒÂ­ khoan Ã„â€˜Ã¡Â»Æ’ trÃƒÂ¡nh Ã„â€˜Ã†Â°Ã¡Â»Âng Ã„â€˜iÃ¡Â»â€¡n ÃƒÂ¢m tÃ†Â°Ã¡Â»Âng.',
          requestedDescription: 'DÃ¡Â»Âi vÃ¡Â»â€¹ trÃƒÂ­ khoan sang trÃƒÂ¡i 20 cm.',
          status: scopeStatus,
        }
      : null,
    status,
  }
}
