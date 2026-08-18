import type { LocalDeal, LocalScopeChange } from '@nestscout/shared'

import { screenIdsForStatus } from '../kael-chat/case-stage-display-model'
import {
  canCustomerDecideScopeChange,
  isDealPaymentProtected,
  paymentLedgerConfirmationStep,
  scopeChangeAmountLabel,
} from '../kael-chat/case-work-display-model'

function makeScopeChange(overrides: Partial<LocalScopeChange> = {}): LocalScopeChange {
  return {
    createdAt: '2026-07-11T08:00:00.000Z',
    evidencePhotoUrls: [],
    id: 'scope_1',
    kaelProgress: null,
    kaelReview: {
      baseline_evidence: baselineEvidenceReceipt(),
      baseline_source: 'multi_source_hcmc_cabinet_door_2026_08',
      baseline_used: 'handyman:replace_cabinet_hinges:small:hcmc_all',
      confidence: 0.82,
      price_source: 'verified_baseline',
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
    },
    priceMax: 258000,
    priceMin: 258000,
    reason: 'Hidden wiring requires a new run.',
    requestedDescription: 'Replace the damaged hidden wire.',
    status: 'waiting_customer_decision',
    ...overrides,
  }
}

function baselineEvidenceReceipt() {
  return {
    schema_version: 'baseline_price_evidence_receipt.v1',
    accepted_source_count: 2,
    aggregate_price_min: 140000,
    aggregate_price_max: 375000,
    high_trust_source_count: 2,
    quorum_met: true,
    required_quorum: 2,
    unit: 'per_cabinet_door',
    sources: ['source-a.example', 'source-b.example'].map((domain) => ({
      domain,
      url: `https://${domain}/price`,
      observed_at: '2026-08-13',
      price_min: 140000,
      price_max: 375000,
      unit: 'per_cabinet_door',
      effective_tier: 1,
      weight: 1,
    })),
  }
}

function makeCompositeScopeChange(): LocalScopeChange {
  const originalEvidence = {
    ...baselineEvidenceReceipt(),
    aggregate_price_min: 700000,
    aggregate_price_max: 1200000,
    required_quorum: 3,
    accepted_source_count: 3,
    high_trust_source_count: 3,
    unit: 'per_visit',
    sources: ['diagnostic-a.example', 'diagnostic-b.example', 'diagnostic-c.example'].map((domain) => ({
      domain,
      url: `https://${domain}/price`,
      observed_at: '2026-08-14',
      price_min: 700000,
      price_max: 1200000,
      unit: 'per_visit',
      effective_tier: 1,
      weight: 1,
    })),
  }
  const repairEvidence = {
    ...baselineEvidenceReceipt(),
    aggregate_price_min: 150000,
    aggregate_price_max: 375000,
    unit: 'per_repair_point',
    sources: ['repair-a.example', 'repair-b.example'].map((domain) => ({
      domain,
      url: `https://${domain}/price`,
      observed_at: '2026-08-14',
      price_min: 150000,
      price_max: 375000,
      unit: 'per_repair_point',
      effective_tier: 1,
      weight: 1,
    })),
  }
  const scope = makeScopeChange()
  return {
    ...scope,
    priceMax: 1213000,
    priceMin: 1213000,
    kaelReview: {
      ...scope.kaelReview,
      baseline_evidence: repairEvidence,
      reference_price_max: 1575000,
      reference_price_min: 850000,
      pricing_components: [
        {
          evidence_receipt: originalEvidence,
          kind: 'original_confirmed_scope',
          price_max: 1200000,
          price_min: 700000,
          selected_price: 950000,
        },
        {
          evidence_receipt: repairEvidence,
          kind: 'approved_scope_change',
          price_max: 375000,
          price_min: 150000,
          selected_price: 263000,
        },
      ],
      stakeholder_balance: {
        commission_level: 1,
        commission_rate_bps: 1500,
        customer_confirmation_required: true,
        customer_total: 1213000,
        platform_fee: 181950,
        worker_confirmation_required: true,
        worker_net: 1031050,
      },
    },
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

  it('rejects a numeric scope price when its verified case receipt is missing or inconsistent', () => {
    expect(canCustomerDecideScopeChange(makeScopeChange({ kaelReview: { confidence: 0.99 } }))).toBe(false)
    expect(canCustomerDecideScopeChange(makeScopeChange({ priceMax: 390000, priceMin: 390000 }))).toBe(false)
  })

  it('accepts only an internally consistent two-component full-scope receipt', () => {
    const composite = makeCompositeScopeChange()
    expect(canCustomerDecideScopeChange(composite)).toBe(true)

    const pricingComponents = composite.kaelReview?.pricing_components as Record<string, unknown>[]
    const tampered = {
      ...composite,
      kaelReview: {
        ...composite.kaelReview,
        pricing_components: [
          { ...pricingComponents[0], selected_price: 951000 },
          pricingComponents[1],
        ],
      },
    }
    expect(canCustomerDecideScopeChange(tampered)).toBe(false)
  })
})
