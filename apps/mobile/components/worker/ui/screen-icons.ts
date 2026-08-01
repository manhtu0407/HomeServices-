import { type ImageSourcePropType } from 'react-native'
import { WorkerV5IconName } from '../dock/types'
import { type ServiceType } from '@nestscout/shared'
import { workerV5CapturedIconAssets } from './worker-v5-icon-assets'

export const workerV5Icons: Record<WorkerV5IconName, ImageSourcePropType> = {
  calendar: require('@/assets/worker-image-icons/utility-calendar.png') as ImageSourcePropType,
  camera: require('@/assets/worker-image-icons/utility-camera.png') as ImageSourcePropType,
  chat: require('@/assets/worker-image-icons/utility-chat.png') as ImageSourcePropType,
  clock: require('@/assets/worker-image-icons/utility-clock.png') as ImageSourcePropType,
  document: require('@/assets/worker-image-icons/utility-document.png') as ImageSourcePropType,
  earnings: require('@/assets/worker-image-icons/nav-earnings.png') as ImageSourcePropType,
  evidence: require('@/assets/worker-image-icons/utility-evidence-core.png') as ImageSourcePropType,
  home: require('@/assets/worker-image-icons/nav-home.png') as ImageSourcePropType,
  jobs: require('@/assets/worker-image-icons/nav-jobs.png') as ImageSourcePropType,
  map: require('@/assets/worker-image-icons/utility-map.png') as ImageSourcePropType,
  profile: require('@/assets/worker-image-icons/nav-profile.png') as ImageSourcePropType,
  shield: require('@/assets/worker-image-icons/utility-shield.png') as ImageSourcePropType,
  scope: require('@/assets/worker-image-icons/utility-scope-core.png') as ImageSourcePropType,
  tools: require('@/assets/worker-image-icons/utility-tools.png') as ImageSourcePropType,
  wallet: require('@/assets/worker-image-icons/utility-wallet.png') as ImageSourcePropType,
}

export const WORKER_V5_PROFILE_ICON_VISUAL_BOOST = new Set<WorkerV5IconName>(['document', 'scope'])

export const workerV5ServiceIcons: Record<ServiceType, ImageSourcePropType> = {
  cleaning: require('@/assets/worker-image-icons/service-cleaning.png') as ImageSourcePropType,
  electrical: require('@/assets/worker-image-icons/service-electrical.png') as ImageSourcePropType,
  handyman: require('../../customer/ui/assets/service-icons/client-service-handyman-installation.png') as ImageSourcePropType,
  hvac: require('../../customer/ui/assets/service-icons/client-service-hvac.png') as ImageSourcePropType,
  plumbing: require('@/assets/worker-image-icons/service-plumbing.png') as ImageSourcePropType,
  upholstery: require('../../customer/ui/assets/service-icons/client-service-upholstery-care.png') as ImageSourcePropType,
}
export const workerV5OpportunityServiceIcons: Record<ServiceType, ImageSourcePropType> = {
  ...workerV5ServiceIcons,
  plumbing: workerV5CapturedIconAssets.opportunityPlumbing,
}
