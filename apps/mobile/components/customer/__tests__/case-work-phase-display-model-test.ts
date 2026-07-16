import type { LocalDeal, LocalDealStatus, LocalScopeChange } from '@nestscout/shared'

import { screenIdsForStatus } from '../v21/case-stage-display-model'
import {
  buildAgenticCaseThreadMatchingCardModel,
  buildAgenticCaseThreadModel,
  isDealPaymentProtected,
  paymentLedgerConfirmationStep,
  scopeChangeAmountLabel,
} from '../v21/case-work-display-model'

const estimate = {
  advisory: 'Kael is still explaining the verified estimate.',
  complexity: 'medium' as const,
  confidenceLabel: '84%',
  disclaimer: 'Server estimate only.',
  hasVndPrice: true,
  priceRangeLabel: '180.000đ - 260.000đ',
  problemLabel: 'Ổ cắm chập chờn',
}

function makeScopeChange(overrides: Partial<LocalScopeChange> = {}): LocalScopeChange {
  return {
    createdAt: '2026-07-11T08:00:00.000Z',
    evidencePhotoUrls: [],
    id: 'scope_1',
    kaelProgress: null,
    kaelReview: { confidence: 0.82 },
    priceMax: 650000,
    priceMin: 450000,
    reason: 'Hidden wiring requires a new run.',
    requestedDescription: 'Replace the damaged hidden wire.',
    status: 'waiting_customer_decision',
    ...overrides,
  }
}

function makeDeal(status: LocalDealStatus, overrides: Partial<LocalDeal> = {}): LocalDeal {
  return {
    broadcast: null,
    draft: {
      addressLabel: 'Tòa A, Quận 7',
      description: 'Ổ cắm chập chờn và có mùi khét nhẹ.',
      districtLabel: 'Quận 7',
      inferredProblemLabel: null,
      mediaCount: 1,
      needsServiceChoice: false,
      problemChips: ['Ổ cắm/công tắc hỏng'],
      serviceType: 'electrical',
      source: 'booking',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate,
    id: 'job_1',
    payment: null,
    scopeChange: null,
    status,
    ...overrides,
  }
}

function buildModel(deal: LocalDeal, caseOptionsAcknowledged = false) {
  return buildAgenticCaseThreadModel({
    caseEvidenceGateActive: false,
    caseOptionsAcknowledged,
    deal,
    editing: false,
    language: 'vi',
    sourceFooterLabel: 'Dữ liệu máy chủ',
    submittingCaseEvidence: false,
  })
}

describe('Kael Case Work server-phase display model', () => {
  it('does not expose offer decisions while the server is only estimate_ready', () => {
    const model = buildModel(makeDeal('estimate_ready'), true)

    expect(model.optionsGateActive).toBe(false)
    expect(model.quoteDecision).toBeNull()
    expect(screenIdsForStatus('estimate_ready')).not.toContain('2.9-quotes')
  })

  it('keeps payment_pending as a pending payment phase and never labels it paid', () => {
    const deal = makeDeal('payment_pending', {
      backendStatus: 'payment_pending',
      payment: {
        grossAmount: 260000,
        platformFee: 39000,
        provider: 'sepay_vietqr',
        status: 'pending',
        workerNet: 221000,
      },
    })

    expect(buildModel(deal).paymentGateActive).toBe(true)
    expect(screenIdsForStatus('payment_pending')).toContain('3.3-payment-protected')
    expect(paymentLedgerConfirmationStep(false, 'vi')).toEqual({
      state: 'pending',
      title: 'Lệnh thanh toán',
    })
    expect(isDealPaymentProtected({
      ...deal,
      payment: { ...deal.payment!, status: 'received' },
    })).toBe(false)
  })

  it('labels payment as paid only after the server reaches paid with confirmed payment data', () => {
    const deal = makeDeal('paid', {
      backendStatus: 'paid',
      payment: {
        grossAmount: 260000,
        platformFee: 39000,
        provider: 'sepay_vietqr',
        status: 'received',
        workerNet: 221000,
      },
    })

    expect(isDealPaymentProtected(deal)).toBe(true)
    expect(paymentLedgerConfirmationStep(isDealPaymentProtected(deal), 'vi')).toEqual({
      state: 'done',
      title: 'Đã thanh toán',
    })
  })

  it.each(['requested_by_worker', 'reviewing_by_kael'] as const)(
    'does not expose scope decisions while the server state is %s',
    (status) => {
      const scopeChange = makeScopeChange({ status })
      const model = buildModel(makeDeal('scope_change_pending', { scopeChange }))

      expect(model.approval).toBeNull()
    },
  )

  it('requires a real reviewed scope price before exposing scope decisions', () => {
    const missingPrice = makeScopeChange({ priceMax: null, priceMin: null })
    const reviewedPrice = makeScopeChange()

    expect(buildModel(makeDeal('scope_change_pending', { scopeChange: missingPrice })).approval).toBeNull()
    expect(scopeChangeAmountLabel(missingPrice, 'vi')).not.toBe('0')
    expect(scopeChangeAmountLabel(makeScopeChange({ priceMax: 0, priceMin: 0 }), 'vi')).toBe('Kael đang xét')
    expect(buildModel(makeDeal('scope_change_pending', { scopeChange: reviewedPrice })).approval).not.toBeNull()
  })

  it('does not invent zero confidence while matching has no estimate', () => {
    const matching = buildAgenticCaseThreadMatchingCardModel(
      makeDeal('broadcasting', { estimate: null }),
      'vi',
    )

    expect(matching.confidence).toBe('Chưa có')
    expect(matching.confidence).not.toBe('0')
  })
})
