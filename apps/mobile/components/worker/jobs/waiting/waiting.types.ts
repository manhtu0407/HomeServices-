import type { ImageSourcePropType } from 'react-native'

export type WaitingKind = 'customer-confirmation' | 'scope-approval'
export type WaitingState = 'waiting' | 'approved' | 'rejected' | 'unavailable'
export type WaitingLanguage = 'vi' | 'en'

/** Capture at RESPONSE RECEIPT, not on every render. */
export interface ClockAnchor { epochMs: number; monotonicMs: number }
export interface WaitingClockInput {
  requestKey: string
  startedAt?: string | number | null
  expiresAt?: string | number | null
  anchor?: ClockAnchor
}
export interface WaitingModel {
  kind: WaitingKind
  state: WaitingState
  clock: WaitingClockInput
  /** True only for the explicit Design Lab fixture; never import fixtures in runtime. */
  referenceCopy?: boolean
  /** Extra data must already be authorized by the backend. */
  detail?: { title: string; description: string }
}
export interface WaitingAssets { hero: ImageSourcePropType; footer: ImageSourcePropType }
export interface WaitingActions {
  onBack: () => void
  onOpenDetails: () => void
  onDeadlineReached?: () => void
}
export interface WaitingContentProps extends WaitingActions {
  model: WaitingModel
  language?: WaitingLanguage
  reduceMotion?: boolean
  /** For screenshot QA only: stable server time; not a production timer source. */
  previewNowMs?: number
  /** Optional token override supplied by the production button system. */
  buttonColors?: readonly [string, string]
}
