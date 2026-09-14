/** DESIGN LAB ONLY. Never imported by stage-eleven-runtime.tsx. */
import type { StageElevenInput, StageElevenSupplement } from './stage-eleven.types'
export const demoInput: StageElevenInput = {
  jobId: 'DEMO-STAGE11', status: 'paid', backendStatus: 'paid', paymentStatus: 'paid',
  provider: 'sepay_vietqr', amountReceived: 600000, grossAmount: 600000,
  serviceType: 'cleaning', district: 'Quận 1, TP.HCM',
  completedAt: '2026-09-06T08:06:00.000Z', paymentReceivedAt: '2026-09-06T08:09:00.000Z',
  paymentCode: 'DEMO-72468193', photoRef: null,
  ledger: [{ job_id: 'DEMO-STAGE11', entry_type: 'worker_credit', payment_state: 'available',
    gross_amount: 600000, platform_fee: 50000, worker_net: 550000,
    recorded_at: '2026-09-06T08:09:00.000Z', available_at: '2026-09-06T08:09:00.000Z' }],
}
export const demoSupplement: StageElevenSupplement = {
  customerMaskedName: 'Chị M.**', jobRating: 5, receiverAccountLabel: 'Vietcombank ···· 2681',
  receiptAvailable: true, bankPayoutConfirmed: true,
}
