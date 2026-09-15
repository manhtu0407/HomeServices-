import type { ImageSourcePropType } from 'react-native'

export const stageTenAssets = {
  lettering: require('@/assets/worker-stage-ten/well-done-lettering.png') as ImageSourcePropType,
  medallion: require('@/assets/worker-stage-ten/completion-medallion.png') as ImageSourcePropType,
  workart: require('@/assets/worker-stage-ten/completion-workart.png') as ImageSourcePropType,
} as const
