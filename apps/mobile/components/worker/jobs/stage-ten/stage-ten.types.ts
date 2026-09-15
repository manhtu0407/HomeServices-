import type { ImageSourcePropType } from 'react-native'

import type { ServiceType } from '@nestscout/shared'
import type { AppLanguage } from '@/lib/app-language'

export type StageTenLedgerEntry = {
  entry_type?: string | null
  job_id?: string | null
  payment_state?: string | null
  recorded_at?: string | null
  settlement_state?: string | null
  worker_net?: number | null
}

export type StageTenModelInput = {
  averageRating?: number | null
  completedAt?: string | null
  district?: string | null
  jobId?: string | null
  ledger?: readonly StageTenLedgerEntry[]
  performanceScore?: number | null
  photoRef?: string | null
  reviewCount?: number | null
  serviceType?: ServiceType | null
  status?: string | null
}

export type StageTenWorkState = 'awaiting-confirmation' | 'closed' | 'in-progress' | 'missing'

export type StageTenIncomeState = 'available' | 'held' | 'missing' | 'pending' | 'reversed'

export type StageTenModel = {
  income: {
    amount: number | null
    state: StageTenIncomeState
  }
  job: {
    completedAt: string | null
    district: string | null
    photoRef: string | null
    title: string
  }
  jobId: string | null
  ranking: {
    performanceScore: number | null
  }
  rating: {
    kind: 'average' | 'missing'
    reviewCount: number
    value: number | null
  }
  state: StageTenWorkState
}

export type StageTenActions = {
  onEarnings?: () => void
  onRanking?: () => void
}

export type StageTenContentProps = {
  actions: StageTenActions
  language?: AppLanguage
  model: StageTenModel
  photoSource: ImageSourcePropType | null
  reduceTransparency?: boolean
}

export type StageTenDateParts = {
  date: string
  time: string
}
