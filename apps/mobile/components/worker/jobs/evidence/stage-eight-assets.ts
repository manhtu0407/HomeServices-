import type { ImageSourcePropType } from 'react-native'

export const stageEightAssets = {
  hero: require('@/assets/worker-stage-eight/stage8-hero.png') as ImageSourcePropType,
  logo: require('@/assets/worker-stage-eight/stage8-logo.png') as ImageSourcePropType,
  camera: require('@/assets/worker-stage-eight/stage8-camera.png') as ImageSourcePropType,
  check: require('@/assets/worker-stage-eight/stage8-check.png') as ImageSourcePropType,
  note: require('@/assets/worker-stage-eight/stage8-note.png') as ImageSourcePropType,
  upload: require('@/assets/worker-stage-eight/stage8-upload.png') as ImageSourcePropType,
  plane: require('@/assets/worker-stage-eight/stage8-plane.png') as ImageSourcePropType,
} as const
