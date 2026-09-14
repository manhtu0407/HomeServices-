/** View-only contract. No fixture, payment mutation, or invented backend field. */
export type StageElevenLanguage = 'vi' | 'en'
export type StageElevenState = 'confirmed' | 'pending' | 'held' | 'failed' | 'missing'
export type StageElevenImage = number | { uri: string }
export type StageElevenMethod = 'bank' | 'cash' | 'unknown'
export type StageElevenAmountKind = 'worker-net' | 'payment-total' | 'direct-total'

export type StageElevenLedgerEntry = {
  job_id: string
  entry_type: string
  payment_state: string
  settlement_state?: string | null
  gross_amount: number
  platform_fee: number
  worker_net: number
  recorded_at: string
  available_at?: string | null
}

/** Only fields found in the supplied LocalDeal usages and WorkerJobListResponse. */
export type StageElevenInput = {
  jobId: string | null
  status?: string | null
  backendStatus?: string | null
  paymentStatus?: string | null
  provider?: string | null
  amountReceived?: number | null
  grossAmount?: number | null
  serviceType?: string | null
  district?: string | null
  completedAt?: string | null
  paymentReceivedAt?: string | null
  paymentCode?: string | null
  photoRef?: string | null
  ledger: readonly StageElevenLedgerEntry[]
}

export type StageElevenModel = {
  jobId: string | null
  state: StageElevenState
  method: StageElevenMethod
  amount: number | null
  amountKind: StageElevenAmountKind
  transactionCode: string | null
  recordedAt: string | null
  job: {
    serviceType: string | null
    district: string | null
    completedAt: string | null
    photoRef: string | null
    completed: boolean
  }
  income: { gross: number; fee: number; net: number } | null
}

/** Optional display data MUST be supplied by an authorized per-job backend reader.
 * Do not populate from worker average rating, device time, a mock bank, or job id.
 * Runtime adapter deliberately leaves these absent when its snapshot lacks them.
 */
export type StageElevenSupplement = {
  customerMaskedName?: string | null
  jobRating?: number | null
  receiverAccountLabel?: string | null
  receiptAvailable?: boolean
  /** Only supplied when an actual, verified worker payout exists. */
  bankPayoutConfirmed?: boolean
}

export type StageElevenActions = {
  onBack?: () => void
  onHome?: () => void
  onHistory: () => void
  onEarnings: () => void
  onRefresh?: () => Promise<boolean>
  onCopyTransaction?: (value: string) => Promise<void>
  onOpenReceipt?: () => Promise<void>
}
