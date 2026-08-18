import { Text as RNText, type ImageSourcePropType, type TextProps } from 'react-native'
import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import type { LocalDeal } from '@nestscout/shared'
import type { WorkerV5ScreenDefinition, WorkerV5ScreenId } from '../dock/types'
import type { WorkerV5RoutePreviewState } from './use-worker-route-preview'
import { prototypeStyles } from './worker-jobs-legacy-prototype-styles'
export type WorkerJobsLegacyPrototypeRuntime = ReturnType<typeof useFrontendWorkflow>

export type WorkerJobsLegacyPrototypeStage = 'payment-confirmed'

export type WorkerJobsLegacyPrototypeBodyProps = {
  actionBusy: boolean
  language: AppLanguage
  navigateActiveJobChat: () => void
  navigateJobChat: () => void
  navigateNext: () => void
  navigateToScreen: (id: WorkerV5ScreenId) => void
  prototypeStage?: WorkerJobsLegacyPrototypeStage
  reduceMotion: boolean
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
  runRouteAction: () => void | Promise<void>
  runWorkerAction: (
    action: () => Promise<boolean>,
    options?: { navigateOnSuccess?: boolean },
  ) => void | Promise<void>
  runtime: WorkerJobsLegacyPrototypeRuntime
  screen: WorkerV5ScreenDefinition
}

const workerJobsLegacyPrototypeOpportunityWorkart = {
  journey: require('@/assets/client-image-icons/client-booking-journey-workart-cutout.png') as ImageSourcePropType,
  electrical: require('@/assets/client-image-icons/worker-jobs-workart-electrical-transparent.png') as ImageSourcePropType,
  plumbing: require('@/assets/client-image-icons/worker-jobs-workart-plumbing-transparent.png') as ImageSourcePropType,
  cleaning: require('@/assets/client-image-icons/worker-jobs-workart-cleaning-transparent.png') as ImageSourcePropType,
  hvac: require('@/assets/client-image-icons/worker-jobs-workart-hvac-transparent.png') as ImageSourcePropType,
  handyman: require('@/assets/client-image-icons/worker-jobs-workart-handyman-transparent.png') as ImageSourcePropType,
  upholstery: require('@/assets/client-image-icons/worker-jobs-workart-upholstery-transparent.png') as ImageSourcePropType,
} as const

export const workerJobsLegacyPrototypeStageSevenArtwork = require('@/assets/client-image-icons/worker-stage-seven-approval-workart-transparent.png') as ImageSourcePropType
export const workerJobsLegacyPrototypeStageNineWorkart = require('@/assets/client-image-icons/worker-stage-nine-completion-workart.png') as ImageSourcePropType
export const workerJobsLegacyPrototypeStageTenWorkart = require('@/assets/client-image-icons/worker-stage-ten-earnings-workart.png') as ImageSourcePropType
export const workerJobsLegacyPrototypeStageElevenWorkart = require('@/assets/client-image-icons/worker-stage-eleven-payment-workart.png') as ImageSourcePropType

export function workerJobsLegacyPrototypeOpportunityArtwork(deal: LocalDeal | null) {
  switch (deal?.draft.serviceType) {
    case 'electrical':
      return workerJobsLegacyPrototypeOpportunityWorkart.electrical
    case 'plumbing':
      return workerJobsLegacyPrototypeOpportunityWorkart.plumbing
    case 'cleaning':
      return workerJobsLegacyPrototypeOpportunityWorkart.cleaning
    case 'hvac':
      return workerJobsLegacyPrototypeOpportunityWorkart.hvac
    case 'handyman':
      return workerJobsLegacyPrototypeOpportunityWorkart.handyman
    case 'upholstery':
      return workerJobsLegacyPrototypeOpportunityWorkart.upholstery
    default:
      return workerJobsLegacyPrototypeOpportunityWorkart.journey
  }
}

export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[prototypeStyles.text, style]} />
}
