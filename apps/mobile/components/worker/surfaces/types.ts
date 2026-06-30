// Worker UI shared types, extracted from worker-surfaces.tsx (C4 stage 2).
import type { LocalDeal } from '@home-services/shared'
import type { AppLanguage } from '@/lib/app-language'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'

export type WorkerThemeMode = 'dark' | 'light'
export type WorkerLanguageMode = AppLanguage
export type WorkerVerificationFileSlot = 'cccdFront' | 'cccdBack' | 'selfie'

export type WorkerActiveTab = 'chat' | 'earnings' | 'home' | 'jobs' | 'profile'
export type WorkerJobsTab = 'active' | 'needs' | 'waiting'
export type WorkerRoutePath = '/(worker)/home' | '/(worker)/jobs?tab=waiting' | '/(worker)/earnings' | '/(worker)/profile'
export type WorkerTone = 'base' | 'cream' | 'cyan' | 'depth' | 'mint' | 'raised' | 'strong' | 'warm'
export type WorkerEarningsChromeVariant = 'cell' | 'chart' | 'hero' | 'ledger'
export type WorkerProfileChromeVariant = 'collapsed' | 'form' | 'hero' | 'mini' | 'panel' | 'preference'
export type WorkerKaelChatTone = 'agent' | 'avatar' | 'brief' | 'bubble' | 'composer' | 'header' | 'icon' | 'send' | 'status' | 'step'
export type WorkerHeaderPillTone = 'cream' | 'mint'
export type WorkerDockIconName = 'apartment' | 'document' | 'kael' | 'payment' | 'person'
export type WorkerIconName =
  | 'back'
  | 'bank'
  | 'bolt'
  | 'broom'
  | 'brief'
  | 'chat'
  | 'check'
  | 'clock'
  | 'document'
  | 'evidence'
  | 'faucet'
  | 'globe'
  | 'home'
  | 'jobs'
  | 'map'
  | 'mic'
  | 'money'
  | 'moon'
  | 'person'
  | 'pin'
  | 'plug'
  | 'plus'
  | 'send'
  | 'shield'
  | 'spark'
  | 'sun'
  | 'tools'
  | 'trend'
  | 'water'
export type WorkerChatLocalState = {
  draft: string
  localMessages: WorkerChatLocalMessage[]
  mediaDrafts: LocalMediaUploadDraft[]
  reveal: { requested: number; step: number }
}
export type WorkerChatLocalMessage = {
  id: string
  mine: boolean
  system: boolean
  text: string
  who: string
}
export type WorkerWebSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onresult: ((event: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null
  start: () => void
  stop?: () => void
}
export type WorkerWebSpeechRecognitionConstructor = new () => WorkerWebSpeechRecognition
export type WorkerBroadcastView = NonNullable<LocalDeal['broadcast']>
export type WorkerMapMode = 'area' | 'locked' | 'route'
export type WorkerMapPoint = { lat: number; lng: number }
export type WorkerMapProviderModel = {
  areaLabel: string
  fullAddressLabel: string | null
  mapMode: WorkerMapMode
  serviceRadius: number | null
  routeRequestReady: boolean
  trafficEnabled: boolean
  workerOrigin: WorkerMapPoint | null
}
export type WorkerHomeMapState = {
  centered: boolean
  compassNorth: boolean
  expanded: boolean
  layerDetailed: boolean
  trafficEnabled: boolean
  zoom: number
}
export type WorkerHomeMapAction =
  | { type: 'close' }
  | { type: 'open' }
  | { type: 'recenter' }
  | { type: 'toggle_compass' }
  | { type: 'toggle_layer' }
  | { type: 'toggle_traffic' }
  | { type: 'zoom_in' }
  | { type: 'zoom_out' }
export type WorkerMapSurface = 'active' | 'home' | 'jobroom' | 'needs' | 'waiting'
export type WorkerHomeMaterialContrast = 'quiet' | 'recessed' | 'standard' | 'prominent'
export type WorkerHomeMaterialDepth = 'anchored' | 'content' | 'floating' | 'focus' | 'substrate'
export type WorkerHomeMaterialGroup = 'content' | 'control' | 'navigation' | 'surface'
export type WorkerHomeMaterialRole = 'glass-control' | 'glass-focus' | 'opaque-content' | 'substrate'
export type WorkerHomeMaterialSurface = 'cta' | 'dock' | 'map' | 'mapControl' | 'mapHud' | 'readiness' | 'sheet' | 'tile'

export type WorkerProfileLevelSignal = {
  id: 'jobs' | 'rating' | 'recommendation'
  label: string
  value: string
}

export type WorkerProfileLevelMilestoneState = 'current' | 'mystery' | 'next' | 'open' | 'reached'

export type WorkerProfileLevelMilestone = {
  level: number
  requirement: string
  reward: string
  state: WorkerProfileLevelMilestoneState
  stateLabel: string
  title: string
}

export type WorkerProfileLevelModel = {
  body: string
  currentFloor: number
  level: number
  milestones: WorkerProfileLevelMilestone[]
  nextLabel: string
  nextThreshold: number
  points: number
  progress: number
  signals: WorkerProfileLevelSignal[]
  title: string
}
