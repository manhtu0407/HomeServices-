import type { ImageSourcePropType } from 'react-native'

export const stageNineAssets = {
  scene: require('@/assets/worker-stage-nine/completion-empty-scene.png') as ImageSourcePropType,
} as const

// The same scene re-lit for the dark theme: the objects keep their colour, the mint haze becomes
// a faint tint on black and the light beam a soft warm glow.
export const stageNineDarkAssets = {
  scene: require('@/assets/worker-stage-nine/completion-empty-scene-dark.png') as ImageSourcePropType,
} as const
