import type React from 'react'
import type { ImageSourcePropType } from 'react-native'
import type { StageFiveLanguage } from './stage-five-copy'

export type StageFiveJobStatus = 'worker_candidate_pending' | 'worker_matched' | 'worker_on_way' | 'arrived' | 'inspecting' | 'repairing' | 'scope_change_pending' | 'completed_by_worker' | 'completed' | 'closed' | 'cancelled'
export type TaskPhase = 'prepare' | 'working' | 'inspect' | 'finish' | 'handover'
export type ActionId = 'back' | 'call' | 'chat' | 'details' | 'directions' | 'share' | 'guide' | 'recenter' | 'layers' | 'startTravel' | 'arrival' | 'editArrival' | 'progress' | 'pause' | 'photo' | 'note' | 'scope' | 'support' | 'complete'
export interface ActionSpec {
  enabled: boolean
  onPress: () => void | Promise<void>
  /** Visible in accessibility help; never pretend a missing capability is wired. */
  disabledReason?: string
}
export type Actions = Partial<Record<ActionId, ActionSpec>>
export interface JourneyModel {
  jobId: string | null
  stage: 4
  jobStatus: StageFiveJobStatus | null
  /** True only after backend has released a destination. */
  addressReleased: boolean
  destinationTitle: string | null
  development: string | null
  addressLine: string | null
  unit: string | null
  instructions: string | null
  customerPhone: string | null
  distanceMeters: number | null
  durationSeconds: number | null
  trafficLabel: string | null
  routeState: 'ready' | 'locked' | 'loading' | 'denied' | 'unavailable'
  routeImage?: ImageSourcePropType
  /** Host-owned map with its existing authorization, SDK and provider attribution. */
  renderMap?: () => React.ReactNode
  primary: 'startTravel' | 'arrival'
  demo?: boolean
}
export interface WorkModel {
  jobId: string | null
  stage: 5
  jobStatus: StageFiveJobStatus | null
  serviceTitle: string | null
  serviceCategory: string | null
  addressLine: string | null
  photo?: ImageSourcePropType
  arrivedLabel: string | null
  startedLabel: string | null
  /** Server timestamp. Never initialise production timing with Date.now(). */
  startedAtMs: number | null
  pausedAtMs: number | null
  pausedMs: number
  phase: TaskPhase | null
  phaseLabels?: readonly [string,string,string,string,string]
  note: string | null
  evidenceCount: number
  canPrepareCompletion: boolean
  demo?: boolean
}
export interface SurfaceProps<M> {
  model: M
  actions: Actions
  busy?: boolean
  language?: StageFiveLanguage
  reduceMotion?: boolean
  /** Exact reference copy & sample metadata ONLY in the isolated Design Lab. */
  referenceMode?: boolean
  /** Deterministic screenshot / preview recording only. */
  nowMs?: number
}
