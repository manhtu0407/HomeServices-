import type { StageElevenInput, StageElevenLanguage, StageElevenModel } from './stage-eleven.types'

export const text11 = (language: StageElevenLanguage, vi: string, en: string): string => language === 'en' ? en : vi
export function validMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(value)
}
const clean = (value: string | null | undefined): string | null => value?.trim() || null
const timestamp = (value: string | null | undefined): number => {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}
const completeStates = new Set(['completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'])
const paidStates = new Set(['paid', 'reviewed'])
const blockedStates = new Set(['failed', 'payment_failed', 'manual_rejected', 'direct_disputed', 'refunded', 'reversed'])

/** Pure projection: viewing Stage 11 never marks a payment as paid. */
export function buildStageElevenModel(input: StageElevenInput): StageElevenModel {
  const jobId = clean(input.jobId)
  const provider = clean(input.provider)
  const method = provider === 'direct_worker' || provider === 'cash'
    ? 'cash'
    : ['bank_transfer', 'platform_bank_manual', 'sepay_vietqr'].includes(provider ?? '') ? 'bank' : 'unknown'
  // Never mistake a commission debit or another job's money for this job's income.
  // On equal timestamps prefer the restrictive record instead of assuming credit.
  const restriction = (state: string) => (({ reversed: 4, on_hold: 3, pending: 2, available: 1 } as Record<string, number>)[state] ?? 0)
  const ledger = jobId ? input.ledger
    .filter((row) => row.job_id === jobId && row.entry_type === 'worker_credit')
    .slice().sort((a, b) => timestamp(b.recorded_at) - timestamp(a.recorded_at)
      || restriction(b.payment_state) - restriction(a.payment_state))[0] : undefined
  const statuses = [input.status, input.backendStatus, input.paymentStatus].filter(Boolean) as string[]
  const failed = ledger?.payment_state === 'reversed'
    || ledger?.settlement_state === 'admin_rejected'
    || statuses.some((status) => blockedStates.has(status))
  const held = ledger?.payment_state === 'on_hold'
    || input.paymentStatus === 'direct_admin_confirmation_required'
  const ledgerAvailable = ledger?.payment_state === 'available' && validMoney(ledger.worker_net)
  const paymentRecorded = paidStates.has(input.status ?? '')
    || paidStates.has(input.backendStatus ?? '')
    || input.paymentStatus === 'direct_paid'
  const state = !jobId ? 'missing' : failed ? 'failed' : held ? 'held'
    : ledgerAvailable || paymentRecorded ? 'confirmed' : 'pending'
  const directAmount = validMoney(input.amountReceived) && input.amountReceived > 0 ? input.amountReceived
    : method === 'cash' && validMoney(input.grossAmount) ? input.grossAmount : null
  // Gross amount / estimate alone is NOT evidence of a received bank payment.
  const amount = state !== 'confirmed' ? null : ledgerAvailable ? ledger!.worker_net : directAmount
  const income = state === 'confirmed' && ledgerAvailable && ledger
    && validMoney(ledger.gross_amount) && validMoney(ledger.platform_fee)
    && ledger.gross_amount - ledger.platform_fee === ledger.worker_net
      ? { gross: ledger.gross_amount, fee: ledger.platform_fee, net: ledger.worker_net }
      : null
  return {
    jobId, state, method, amount,
    amountKind: ledgerAvailable ? 'worker-net' : method === 'cash' ? 'direct-total' : 'payment-total',
    transactionCode: clean(input.paymentCode),
    recordedAt: timestamp(input.paymentReceivedAt) ? input.paymentReceivedAt! : ledger?.recorded_at ?? null,
    job: {
      serviceType: clean(input.serviceType), district: clean(input.district),
      completedAt: timestamp(input.completedAt) ? input.completedAt! : null,
      photoRef: clean(input.photoRef),
      completed: Boolean(jobId && (input.completedAt || statuses.some((status) => completeStates.has(status)))),
    },
    income,
  }
}

export function formatStageElevenMoney(value: number, language: StageElevenLanguage): string {
  if (!validMoney(value)) return '—'
  return `${new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 0 }).format(value)} ₫`
}
export function formatStageElevenDate(value: string | null, language: StageElevenLanguage): string {
  if (!timestamp(value)) return text11(language, 'Chưa có thông tin', 'Not available')
  const parts = new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value!))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('hour')}:${get('minute')} · ${get('day')}/${get('month')}/${get('year')}`
}
export function stageElevenServiceName(service: string | null, language: StageElevenLanguage): string {
  const names: Record<string, [string, string]> = {
    electrical: ['Sửa điện', 'Electrical repair'], plumbing: ['Sửa nước', 'Plumbing'],
    cleaning: ['Vệ sinh căn hộ', 'Home cleaning'], hvac: ['Vệ sinh máy lạnh', 'Air conditioning'],
    upholstery: ['Vệ sinh sofa', 'Sofa cleaning'], handyman: ['Sửa vặt & lắp đặt', 'Repairs & installation'],
  }
  const pair = names[service ?? '']
  return pair ? pair[language === 'vi' ? 0 : 1] : text11(language, 'Công việc', 'Job')
}
