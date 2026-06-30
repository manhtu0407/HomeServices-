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

const stateAssets: Record<KaelMascotState, number> = {
  analyzing: require('../../assets/kael-states/kael-state-analyzing.png'),
  compareOptions: require('../../assets/kael-states/kael-state-compareOptions.png'),
  error: require('../../assets/kael-states/kael-state-error.png'),
  fileReview: require('../../assets/kael-states/kael-state-fileReview.png'),
  findingWorker: require('../../assets/kael-states/kael-state-findingWorker.png'),
  listening: require('../../assets/kael-states/kael-state-listening.png'),
  locationMap: require('../../assets/kael-states/kael-state-locationMap.png'),
  miniCelebration: require('../../assets/kael-states/kael-state-miniCelebration.png'),
  priceCheck: require('../../assets/kael-states/kael-state-priceCheck.png'),
  processing: require('../../assets/kael-states/kael-state-processing.png'),
  proposing: require('../../assets/kael-states/kael-state-proposing.png'),
  recording: require('../../assets/kael-states/kael-state-recording.png'),
  reminder: require('../../assets/kael-states/kael-state-reminder.png'),
  report: require('../../assets/kael-states/kael-state-report.png'),
  success: require('../../assets/kael-states/kael-state-success.png'),
  thinking: require('../../assets/kael-states/kael-state-thinking.png'),
  typing: require('../../assets/kael-states/kael-state-typing.png'),
  understood: require('../../assets/kael-states/kael-state-understood.png'),
  warning: require('../../assets/kael-states/kael-state-warning.png'),
  welcome: require('../../assets/kael-states/kael-state-welcome.png'),
}
const emotionAssets: Record<KaelMascotEmotion, number> = {
  angry: require('../../assets/kael-emotions/kael-emotion-angry.png'),
  concerned: require('../../assets/kael-emotions/kael-emotion-concerned.png'),
  confident: require('../../assets/kael-emotions/kael-emotion-confident.png'),
  confused: require('../../assets/kael-emotions/kael-emotion-confused.png'),
  curious: require('../../assets/kael-emotions/kael-emotion-curious.png'),
  disappointed: require('../../assets/kael-emotions/kael-emotion-disappointed.png'),
  focused: require('../../assets/kael-emotions/kael-emotion-focused.png'),
  happy: require('../../assets/kael-emotions/kael-emotion-happy.png'),
  surprised: require('../../assets/kael-emotions/kael-emotion-surprised.png'),
  tired: require('../../assets/kael-emotions/kael-emotion-tired.png'),
}

export function resolveKaelMascotAsset(state: KaelMascotState, _variant: 'full' | 'head', emotion?: KaelMascotEmotion) {
  return { source: emotion ? emotionAssets[emotion] : stateAssets[state] }
}

export function getKaelMascotAssetStatus(_state: KaelMascotState, emotion?: KaelMascotEmotion) {
  return emotion ? 'emotion' : 'state'
}
