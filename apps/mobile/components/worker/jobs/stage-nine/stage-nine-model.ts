import type { LocalDeal } from '@nestscout/shared'

import { isDealPaymentProtected } from '@/lib/frontend-workflow/payment-proof'

export type StageNineRecordState = {
  awaitingDirectPaymentConfirmation: boolean
  customerConfirmed: boolean
  hasSubmittedArtifact: boolean
  paymentRecorded: boolean
  sourceCount: number
}

const CUSTOMER_CONFIRMED_STATUSES: ReadonlySet<string> = new Set([
  'confirmed_by_customer',
  'payment_pending',
  'paid',
  'reviewed',
])

export function readStageNineRecordState(deal: LocalDeal | null | undefined): StageNineRecordState {
  const sourceCount = (deal?.completionPhotoUrls?.length ?? 0) + (deal?.completionNotes?.trim() ? 1 : 0)
  const payment = deal?.payment

  return {
    awaitingDirectPaymentConfirmation: payment?.provider === 'direct_worker'
      && (payment.status === 'direct_awaiting_worker_confirmation'
        || (payment.status === 'direct_awaiting_confirmation' && Boolean(payment.directCustomerConfirmedAt)))
      && !payment.directWorkerConfirmedAt,
    customerConfirmed: Boolean(deal && CUSTOMER_CONFIRMED_STATUSES.has(deal.status)),
    hasSubmittedArtifact: Boolean(deal && sourceCount > 0),
    paymentRecorded: isDealPaymentProtected(deal),
    sourceCount,
  }
}

/**
 * True only when nothing downstream of completion exists yet. The full-screen empty stage has
 * no status readout of its own, so every submitted, confirmed, or payment state must keep the
 * status layout that reads real data.
 */
export function isStageNineRecordEmpty(record: StageNineRecordState): boolean {
  return !record.customerConfirmed
    && !record.hasSubmittedArtifact
    && !record.paymentRecorded
    && !record.awaitingDirectPaymentConfirmation
}
