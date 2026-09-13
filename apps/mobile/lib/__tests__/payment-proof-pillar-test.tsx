import type { LocalDeal } from '@nestscout/shared'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { isDealPaymentProtected } from '../frontend-workflow/payment-proof'

export const PILLAR = {
  id: 'P90-payment-receipt-ui-authority',
  invariant: 'Customer and Worker paid UI requires the canonical paid phase and a recognized non-simulator receipt rail; completion or an unknown provider cannot unlock payment success',
  authority: ['governance/RULES.md #8 (no fabricated payment success)'],
  target: 'apps/mobile/lib/frontend-workflow/payment-proof.ts',
  layer: 'unit',
  siblings: ['P68-completion-payment-authority', 'P06-payment-unlock-gate'],
  mutation: 'accept received receipts from an unknown provider or trust local paid over backend payment_pending; the corresponding fail-closed assertion turns red',
} as const satisfies PillarManifest

function deal(provider: string | null, status: NonNullable<LocalDeal['payment']>['status']): LocalDeal {
  return {
    id: 'payment-proof-fixture', status: 'paid', backendStatus: 'paid',
    draft: {
      serviceType: 'plumbing', problemChips: [], description: 'Rò nước', mediaCount: 0,
      addressLabel: 'Quận 7', districtLabel: 'q7', timeChoice: 'now', source: 'booking',
      needsServiceChoice: false, inferredProblemLabel: null, unsupportedServiceLabel: null,
    },
    estimate: null, broadcast: null, scopeChange: null,
    payment: { provider, status, grossAmount: 400000, platformFee: 60000, workerNet: 340000 },
  }
}

describe('Verified payment presentation', () => {
  it.each([null, 'unknown_provider', 'staging_simulator'])('refuses an unproven %s receipt even when the job says paid', (provider) => {
    withPillarContext(PILLAR, () => expect(isDealPaymentProtected(deal(provider, 'received'))).toBe(false))
  })

  it('keeps the authoritative backend state above a stale local paid state', () => {
    const pending = { ...deal('platform_bank_manual', 'manual_verified'), backendStatus: 'payment_pending' as const }
    withPillarContext(PILLAR, () => expect(isDealPaymentProtected(pending)).toBe(false))
  })

  it.each(['pending', 'manual_qr_ready', 'manual_customer_claimed', 'manual_reconcile_required'] as const)(
    'does not turn %s into a verified bank receipt', (status) => {
      withPillarContext(PILLAR, () => expect(isDealPaymentProtected(deal('platform_bank_manual', status))).toBe(false))
    },
  )

  it.each([
    ['platform_bank_manual', 'manual_verified'], ['sepay_vietqr', 'received'],
    ['bank_transfer', 'reconciled'], ['cash', 'cash_confirmed'], ['direct_worker', 'direct_paid'],
  ] as const)('preserves the recorded %s receipt without re-enabling its retired mutation', (provider, status) => {
    withPillarContext(PILLAR, () => expect(isDealPaymentProtected(deal(provider, status))).toBe(true))
  })

  it('does not invent payment when no job or receipt is available', () => {
    withPillarContext(PILLAR, () => {
      expect(isDealPaymentProtected(null)).toBe(false)
      expect(isDealPaymentProtected({ ...deal('platform_bank_manual', 'manual_verified'), payment: null })).toBe(false)
    })
  })
})
