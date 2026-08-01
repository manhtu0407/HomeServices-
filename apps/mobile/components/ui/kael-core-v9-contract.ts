export const KAEL_CORE_V9_SIZE = 72
const KAEL_CORE_V9_DEFAULT_PROXIMITY = 112
export const KAEL_CORE_V9_BOW_DURATION_MS = 1220
export const KAEL_CORE_V9_AUTOPLAY_CLIP_DURATION_MS = 3800
export const KAEL_CORE_V9_AUTOPLAY_REPEAT_COUNT = -1

export const KAEL_CORE_V9_CONTRACT = Object.freeze({
  accessoryCount: 0,
  autoplayClipDurationMs: KAEL_CORE_V9_AUTOPLAY_CLIP_DURATION_MS,
  autoplayRepeatCount: KAEL_CORE_V9_AUTOPLAY_REPEAT_COUNT,
  bowDurationMs: KAEL_CORE_V9_BOW_DURATION_MS,
  defaultProximity: KAEL_CORE_V9_DEFAULT_PROXIMITY,
  defaultSize: KAEL_CORE_V9_SIZE,
  handCount: 0,
  legacyMotionCount: 0,
  legacyStatusCount: 0,
  maxDropPx: 6.4,
  maxEyeTravelPx: 1.55,
  maxPitchDeg: 16,
  motionVocabulary: ['autoplay-clip', 'formal-bow'] as const,
  reducedMotionDuration: 480,
  renderer: 'inline-svg',
  triggers: ['proximity', 'pointer-press', 'keyboard-focus', 'enter-space', 'api'] as const,
  version: '11.0.0',
})

export type KaelCoreV9BowSource = 'api' | 'focus' | 'keyboard' | 'pointer-press' | 'proximity' | 'touch'

export type KaelCoreV9Handle = {
  bow: (source?: KaelCoreV9BowSource) => boolean
}
