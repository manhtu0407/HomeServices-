import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import { getCustomerThemeTokens } from '../customer-theme'
import { AgenticCaseThreadPanel } from '../kael-chat/chat-case-thread-stateful-surfaces'

describe('Case Work phase controls', () => {
  it('locks retry and stop while the workflow is still reconciling a retry', () => {
    const deal = dealFixture('broadcasting', 'waiting_customer_decision', 'expired')
    deal.matchingState = { stage: 'exhausted', strategy: 'general', batch: null, checks: [], event_history: [] }
    renderPanel(deal, jest.fn(), jest.fn(), jest.fn(), { retryingWorkerSearch: true })
    expect(screen.getByTestId('customer-v21-finding-workers-exhausted-retry')).toBeDisabled()
    expect(screen.getByTestId('customer-v21-finding-workers-stop')).toBeDisabled()
  })
  it('shows Worker and Kael scope-review progress before any Customer decision is available', () => {
    const deal = dealFixture('inspecting')
    deal.finalPrice = 350_000
    deal.scopeReview = {
      createdAt: '2026-08-13T02:10:00.000Z',
      evidenceCount: 1,
      evidenceStatus: 'ready',
      id: 'incident-1',
      lastNextActor: 'worker',
      lastQuestion: null,
      lastSummary: 'Kael đã đủ căn cứ để chuẩn bị đề xuất.',
      reportedDescription: 'Thay đúng hai bản lề kim loại bị nứt',
      reportedReason: 'Hai bản lề nứt, gỗ và cánh tủ không hư hỏng.',
      status: 'ready_for_scope_proposal',
      updatedAt: '2026-08-13T02:12:00.000Z',
    }

    renderPanel(deal)

    expect(screen.getByTestId('customer-v21-case-work-scope-reviewing')).toBeOnTheScreen()
    expect(screen.getByText('Phần việc thợ đề nghị')).toBeOnTheScreen()
    expect(screen.getByText('Lý do thợ cung cấp')).toBeOnTheScreen()
    expect(screen.getByText('Kael đối chiếu theo dữ liệu đã nhận')).toBeOnTheScreen()
    expect(screen.getByText('Phạm vi khách đã duyệt')).toBeOnTheScreen()
    expect(screen.getByText('Điểm thay đổi cần xem xét')).toBeOnTheScreen()
    expect(screen.getByText('Đủ dữ liệu để lập đề xuất')).toBeOnTheScreen()
    expect(screen.getByText(/chưa xác minh vật lý độc lập/)).toBeOnTheScreen()
    expect(screen.getByText(/chưa xác nhận giá mới/)).toBeOnTheScreen()
    expect(screen.getAllByText(/Thay đúng hai bản lề kim loại bị nứt/)).toHaveLength(2)
    expect(screen.getByText(/Kael đã đủ căn cứ/)).toBeOnTheScreen()
    expect(screen.getByText(/350\.000/)).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-work-scope-approve')).not.toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-work-scope-reject')).not.toBeOnTheScreen()
  })

  it('does not expose scope decisions before Kael finishes reviewing the change', () => {
    renderPanel(dealFixture('scope_change_pending', 'reviewing_by_kael'))

    expect(screen.queryByTestId('customer-v21-case-work-scope-approve')).not.toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-work-scope-reject')).not.toBeOnTheScreen()
  })

  it('exposes scope decisions only at the authoritative customer-decision state', () => {
    renderPanel(dealFixture('scope_change_pending', 'waiting_customer_decision'))

    expect(screen.getByTestId('customer-v21-case-work-scope-proposal-receipt')).toBeOnTheScreen()
    expect(screen.getByText('1. Thợ đã báo cáo')).toBeOnTheScreen()
    expect(screen.getByText('2. Kael đã đối chiếu')).toBeOnTheScreen()
    expect(screen.getByText('3. Căn cứ giá cho công việc này')).toBeOnTheScreen()
    expect(screen.getByText(/140\.000.*375\.000/)).toBeOnTheScreen()
    expect(screen.getByText(/Trung điểm.*258\.000.*trung điểm/)).toBeOnTheScreen()
    expect(screen.getByText(/258\.000.*toàn bộ phạm vi mới.*không cộng vào giá cũ/)).toBeOnTheScreen()
    expect(screen.getByText(/hạng mục, vật tư hoặc phần hoàn thiện ngoài phạm vi/)).toBeOnTheScreen()
    expect(screen.queryByText(/điểm rò/)).not.toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-scope-approve')).toBeOnTheScreen()
    expect(screen.getByText('Xác nhận tổng 258.000đ')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-scope-reject')).toBeOnTheScreen()
  })

  it('keeps Production in an honest unavailable payment state without losing the Case Work context', () => {
    const onOpenActivity = jest.fn()
    renderPanel(dealFixture('confirmed_by_customer'), onOpenActivity)

    expect(screen.getByTestId('customer-v21-case-payment-unavailable')).toBeOnTheScreen()
    expect(onOpenActivity).not.toHaveBeenCalled()
  })

  it('keeps a legacy test payment unavailable instead of exposing a customer confirmation', () => {
    const pendingDeal = dealFixture('payment_pending')
    if (pendingDeal.payment) pendingDeal.payment.provider = 'staging_simulator'
    renderPanel(pendingDeal)

    expect(screen.getByTestId('customer-v21-case-payment-unavailable')).toBeOnTheScreen()
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
    pendingDeal.payment = manualBankPayment({ directPaymentAvailable: true })
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
    expect(screen.queryByTestId('customer-v21-case-direct-payment-warning')).not.toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-direct-payment-select')).not.toBeOnTheScreen()
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

  it('confirms that a claimed transfer was checked even when Admin has not reconciled it yet', async () => {
    const onRefreshPayment = jest.fn(async () => true)
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = manualBankPayment({ status: 'manual_customer_claimed' })
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      onRefreshPayment,
      paymentRailProvider: 'platform_bank_manual',
    })

    fireEvent.press(screen.getByTestId('customer-v21-case-payment-refresh'))

    await waitFor(() => expect(screen.getByTestId('customer-v21-case-payment-refresh-feedback')).toHaveTextContent(
      'Đã kiểm tra lại. Chưa có xác nhận mới từ bộ phận vận hành.',
    ))
  })

  it('shows a retryable error when payment status refresh fails', async () => {
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = manualBankPayment({ status: 'manual_customer_claimed' })
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), {
      onRefreshPayment: jest.fn(async () => false),
      paymentRailProvider: 'platform_bank_manual',
    })

    fireEvent.press(screen.getByTestId('customer-v21-case-payment-refresh'))

    await waitFor(() => expect(screen.getByTestId('customer-v21-case-payment-refresh-feedback')).toHaveTextContent(
      'Chưa thể cập nhật trạng thái. Vui lòng thử lại.',
    ))
  })

  it('keeps a legacy direct-payment record read-only without marking the job paid', () => {
    const pendingDeal = dealFixture('payment_pending')
    pendingDeal.payment = manualBankPayment({
      collateralAmount: 67_500,
      directResponseDeadline: '2099-01-01T00:00:00.000Z',
      provider: 'direct_worker',
      status: 'direct_awaiting_confirmation',
    })
    renderPanel(pendingDeal, jest.fn(), jest.fn(), jest.fn(), { paymentRailProvider: 'platform_bank_manual' })

    expect(screen.getByText(/chỉ được giữ để đối soát/)).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-direct-payment-confirm')).not.toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-direct-payment-problem')).not.toBeOnTheScreen()
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
    retryingWorkerSearch?: boolean
    onClaimManualBankPayment?: () => Promise<boolean>
    onCreateManualBankPaymentOrder?: () => Promise<boolean>
    onRefreshPayment?: () => Promise<boolean>
    onSubmitReview?: (input: { rating: number; tags: string[]; comment?: string }) => Promise<boolean>
    paymentRailProvider?: 'platform_bank_manual' | 'sepay_vietqr' | null
    themeMode?: 'light' | 'dark'
  } = {},
) {
  return render(
    <AgenticCaseThreadPanel
      apartmentAccessState={{ jobId: deal.id, ready: true, pending: false, message: null }}
      activityLabel="Xem hoạt động"
      caseEvidenceGateActive={false}
      caseEvidenceGateNode={null}
      caseOptionsAcknowledged
      caseQuoteRejectOpen={false}
      caseQuoteRejectReason=""
      completionReviewNode={null}
      confirmingCaseQuote={false}
      deal={deal}
      matchingSelectionState={{ jobId: deal.id, scopeKey: `test-owner:${deal.id}`, ready: true, choice: null }}
      language="vi"
      onAcknowledgeOptions={jest.fn()}
       onAuthorizeApartmentAccess={onAuthorizeApartmentAccess}
       onCreateManualBankPaymentOrder={options.onCreateManualBankPaymentOrder ?? jest.fn(async () => false)}
       onClaimManualBankPayment={options.onClaimManualBankPayment ?? jest.fn(async () => false)}
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
      retryingWorkerSearch={options.retryingWorkerSearch ?? false}
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

function verifiedBaselineEvidence() {
  return {
    schema_version: 'baseline_price_evidence_receipt.v1',
    accepted_source_count: 2,
    aggregate_price_min: 140000,
    aggregate_price_max: 375000,
    high_trust_source_count: 2,
    quorum_met: true,
    required_quorum: 2,
    unit: 'per_cabinet_door',
    sources: [
      {
        domain: 'suachuatainha.com.vn',
        url: 'https://suachuatainha.com.vn/thay-sua-ray-truot-ban-le-phu-kien-tu-go/',
        observed_at: '2026-08-14',
        price_min: 120000,
        price_max: 250000,
        unit: 'per_cabinet_door',
        effective_tier: 1,
        weight: 1,
      },
      {
        domain: 'nhabepsaigon.vn',
        url: 'https://nhabepsaigon.vn/bao-gia-sua-tu-bep-moi-nhat',
        observed_at: '2026-08-14',
        price_min: 160000,
        price_max: 500000,
        unit: 'per_cabinet_door',
        effective_tier: 1,
        weight: 1,
      },
    ],
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
          kaelReview: {
            baseline_source: 'multi_source_hcmc_cabinet_door_2026_08',
            baseline_evidence: verifiedBaselineEvidence(),
            baseline_used: 'handyman:replace_cabinet_hinges:small:hcmc_all',
            confidence: 0.9,
            confirmed_facts: ['Hai bản lề nứt', 'Gỗ và cánh tủ còn nguyên', 'Lối tiếp cận bình thường'],
            price_source: 'verified_baseline',
            pricing_basis: {
              calculation: 'neutral midpoint of 140000-375000 VND = 258000 VND',
              quantity: 1,
              unit: 'cabinet_door_scope',
              unit_price_max: 258000,
              unit_price_min: 258000,
            },
            pricing_mode: 'full_scope_total',
            reference_price_max: 375000,
            reference_price_min: 140000,
            selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
            stakeholder_balance: {
              commission_level: 1,
              commission_rate_bps: 1500,
              customer_confirmation_required: true,
              customer_total: 258000,
              platform_fee: 38700,
              worker_confirmation_required: true,
              worker_net: 219300,
            },
            worker_price_confirmation: {
              confirmed: true,
              confirmed_at: '2026-08-13T08:00:00.000Z',
              quote_id: 'a7500000-0000-4000-8000-000000000010',
            },
            unknowns: [],
          },
          priceMax: 258000,
          priceMin: 258000,
          reason: 'Cần đổi vị trí khoan để tránh đường điện âm tường.',
          requestedDescription: 'Dời vị trí khoan sang trái 20 cm.',
          status: scopeStatus,
        }
      : null,
    status,
  }
}
