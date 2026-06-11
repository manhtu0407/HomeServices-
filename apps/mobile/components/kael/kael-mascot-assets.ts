export const KAEL_CORE_STATES = [
  'welcome',
  'listening',
  'thinking',
  'analyzing',
  'processing',
  'understood',
  'proposing',
  'success',
  'warning',
  'error',
] as const

export const KAEL_CONTEXTUAL_STATES = [
  'typing',
  'recording',
  'fileReview',
  'locationMap',
  'findingWorker',
  'priceCheck',
  'compareOptions',
  'report',
  'reminder',
  'miniCelebration',
] as const

export const KAEL_EMOTIONS = [
  'happy',
  'focused',
  'surprised',
  'curious',
  'confident',
  'concerned',
  'confused',
  'disappointed',
  'angry',
  'tired',
] as const

export type KaelMascotState = (typeof KAEL_CORE_STATES)[number] | (typeof KAEL_CONTEXTUAL_STATES)[number]
export type KaelMascotEmotion = (typeof KAEL_EMOTIONS)[number]

const kaelFull = require('../../assets/kael-model-8a.png')
const kaelHead = require('../../assets/kael-model-8a-head.png')

const stateAssets: Partial<Record<KaelMascotState, unknown>> = {}
const emotionAssets: Partial<Record<KaelMascotEmotion, unknown>> = {}

export function resolveKaelMascotAsset(state: KaelMascotState, variant: 'full' | 'head', emotion?: KaelMascotEmotion) {
  const emotionSource = emotion ? emotionAssets[emotion] : null
  const stateSource = stateAssets[state]
  const source = emotionSource ?? stateSource ?? (variant === 'head' ? kaelHead : kaelFull)
  return { source, usesFallback: !emotionSource && !stateSource }
}

export function getKaelMascotAssetStatus(state: KaelMascotState, emotion?: KaelMascotEmotion) {
  if (emotion && emotionAssets[emotion]) return 'emotion'
  if (stateAssets[state]) return 'state'
  return 'fallback'
}
