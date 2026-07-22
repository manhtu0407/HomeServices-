import type { LocalDeal, LocalScopeChange } from '@nestscout/shared'

import { screenIdsForStatus } from '../v21/case-stage-display-model'
import {
  canCustomerDecideScopeChange,
  isDealPaymentProtected,
  paymentLedgerConfirmationStep,
  scopeChangeAmountLabel,
} from '../v21/case-work-display-model'

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

function makePaymentDeal(
  status: LocalDeal['status'],
  paymentStatus: NonNullable<LocalDeal['payment']>['status'],
): LocalDeal {
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
    estimate: null,
    id: 'job_1',
    payment: {
      grossAmount: 260000,
      platformFee: 39000,
      provider: 'sepay_vietqr',
      status: paymentStatus,
      workerNet: 221000,
    },
    scopeChange: null,
    status,
  }
}

describe('Kael Case Work server phase authority', () => {
  it('does not expose offer decisions while the server is only estimate_ready', () => {
    expect(screenIdsForStatus('estimate_ready')).not.toContain('2.9-quotes')
  })

  it('keeps payment pending until both workflow and ledger confirm payment', () => {
    const pending = makePaymentDeal('payment_pending', 'pending')

    expect(screenIdsForStatus(pending.status)).toContain('3.3-payment-protected')
    expect(isDealPaymentProtected(pending)).toBe(false)
    expect(paymentLedgerConfirmationStep(false, 'vi')).toEqual({
      state: 'pending',
      title: 'Lệnh thanh toán',
    })
  })

  it('labels payment as paid only after the server and ledger are confirmed', () => {
    const paid = makePaymentDeal('paid', 'received')

    expect(isDealPaymentProtected(paid)).toBe(true)
    expect(paymentLedgerConfirmationStep(true, 'vi')).toEqual({
      state: 'done',
      title: 'Đã thanh toán',
    })
  })

  it.each(['requested_by_worker', 'reviewing_by_kael'] as const)(
    'does not expose scope decisions while the server state is %s',
    (status) => {
      expect(canCustomerDecideScopeChange(makeScopeChange({ status }))).toBe(false)
    },
  )

  it('requires a real reviewed scope price before exposing a decision', () => {
    const missingPrice = makeScopeChange({ priceMax: null, priceMin: null })
    const zeroPrice = makeScopeChange({ priceMax: 0, priceMin: 0 })

    expect(canCustomerDecideScopeChange(missingPrice)).toBe(false)
    expect(scopeChangeAmountLabel(missingPrice, 'vi')).not.toBe('0')
    expect(scopeChangeAmountLabel(zeroPrice, 'vi')).toBe('Kael đang xét')
    expect(canCustomerDecideScopeChange(makeScopeChange())).toBe(true)
  })
})
