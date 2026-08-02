import type { ImageSourcePropType } from 'react-native'
import type { ServiceType } from '@nestscout/shared'

export const workerV5CapturedIconAssets = {
  caseCompletionRecord: require('@/assets/worker-image-icons/utility-completion-record-core.png') as ImageSourcePropType,
  caseIncomeLedger: require('@/assets/worker-image-icons/utility-income-ledger-core.png') as ImageSourcePropType,
  earningsCommissionPolicy: require('@/assets/worker-image-icons/earnings-commission-policy-core.png') as ImageSourcePropType,
  earningsReceivingAccount: require('@/assets/worker-image-icons/earnings-receiving-account-core.png') as ImageSourcePropType,
  earningsTransactionHistory: require('@/assets/worker-image-icons/earnings-transaction-history-core.png') as ImageSourcePropType,
  homeQuickEarnings: require('@/assets/worker-image-icons/nav-earnings.png') as ImageSourcePropType,
  homeQuickIncoming: require('@/assets/worker-image-icons/nav-jobs.png') as ImageSourcePropType,
  homeQuickKael: require('@/assets/worker-image-icons/utility-chat.png') as ImageSourcePropType,
  homeQuickSkillsArea: require('@/assets/worker-image-icons/home-quick-skills-area-map-kit.png') as ImageSourcePropType,
  opportunityPlumbing: require('@/assets/worker-image-icons/service-plumbing.png') as ImageSourcePropType,
  profileDossierReliability: require('@/assets/worker-image-icons/profile-reliability-core.png') as ImageSourcePropType,
  profileDossierServices: require('@/assets/worker-image-icons/profile-skills.png') as ImageSourcePropType,
  profileDossierSettings: require('@/assets/worker-image-icons/setting-theme.png') as ImageSourcePropType,
  profileServiceArea: require('@/assets/worker-image-icons/profile-service-area.png') as ImageSourcePropType,
  rankingArrival: require('@/assets/worker-image-icons/utility-calendar.png') as ImageSourcePropType,
  rankingCompletion: require('@/assets/worker-image-icons/utility-document.png') as ImageSourcePropType,
  rankingFeedback: require('@/assets/worker-image-icons/ranking-feedback-core.png') as ImageSourcePropType,
  rankingIncidentHandling: require('@/assets/worker-image-icons/ranking-incident-resolution-core.png') as ImageSourcePropType,
  rankingWorkResponse: require('@/assets/worker-image-icons/ranking-work-response-core.png') as ImageSourcePropType,
  rankingWorker: require('@/assets/worker-image-icons/profile-avatar-core.png') as ImageSourcePropType,
  reliabilityCommunication: require('@/assets/worker-image-icons/utility-bell.png') as ImageSourcePropType,
  reliabilityEvidence: require('@/assets/worker-image-icons/utility-evidence-core.png') as ImageSourcePropType,
  reliabilityPunctuality: require('@/assets/worker-image-icons/utility-clock.png') as ImageSourcePropType,
  serviceGridCleaning: require('@/assets/worker-image-icons/service-cleaning.png') as ImageSourcePropType,
  serviceGridElectrical: require('@/assets/worker-image-icons/service-electrical.png') as ImageSourcePropType,
  serviceGridPlumbing: require('@/assets/worker-image-icons/service-plumbing-worker-profile-core.png') as ImageSourcePropType,
  settingsHero: require('@/assets/worker-image-icons/profile-settings-hub-core.png') as ImageSourcePropType,
  settingsKaelMemory: require('@/assets/worker-image-icons/setting-kael-memory-core.png') as ImageSourcePropType,
  settingsLanguage: require('@/assets/worker-image-icons/setting-language.png') as ImageSourcePropType,
  settingsPersonal: require('@/assets/worker-image-icons/profile-identity.png') as ImageSourcePropType,
  settingsSecurity: require('@/assets/worker-image-icons/profile-verified.png') as ImageSourcePropType,
  settingsServiceArea: require('@/assets/worker-image-icons/utility-map.png') as ImageSourcePropType,
  skillsHero: require('@/assets/worker-image-icons/skills-service-kit.png') as ImageSourcePropType,
} as const

export const workerV5ProfileDossierIconAssets = {
  logout: require('@/assets/worker-image-icons/utility-shield.png') as ImageSourcePropType,
  reliability: workerV5CapturedIconAssets.profileDossierReliability,
  schedule: workerV5CapturedIconAssets.rankingArrival,
  services: workerV5CapturedIconAssets.profileDossierServices,
  settings: workerV5CapturedIconAssets.profileDossierSettings,
} as const

export const workerV5ProfileServiceIconAssets: Record<ServiceType, ImageSourcePropType> = {
  cleaning: workerV5CapturedIconAssets.serviceGridCleaning,
  electrical: workerV5CapturedIconAssets.serviceGridElectrical,
  handyman: require('../../customer/ui/assets/service-icons/client-service-handyman-installation.png') as ImageSourcePropType,
  hvac: require('../../customer/ui/assets/service-icons/client-service-hvac.png') as ImageSourcePropType,
  plumbing: workerV5CapturedIconAssets.serviceGridPlumbing,
  upholstery: require('../../customer/ui/assets/service-icons/client-service-upholstery-care.png') as ImageSourcePropType,
}

export const workerV5HomeQuickIconAssets = {
  earnings: workerV5CapturedIconAssets.homeQuickEarnings,
  incoming: workerV5CapturedIconAssets.homeQuickIncoming,
  kael: workerV5CapturedIconAssets.homeQuickKael,
  skillsArea: workerV5CapturedIconAssets.homeQuickSkillsArea,
} as const

export const workerV5ReliabilityIconAssets = {
  arrival: workerV5CapturedIconAssets.reliabilityPunctuality,
  completion: workerV5CapturedIconAssets.reliabilityEvidence,
  fallback: workerV5CapturedIconAssets.reliabilityCommunication,
  rating: workerV5CapturedIconAssets.reliabilityCommunication,
} as const

export const workerV5SettingsIconAssets = {
  appearance: require('@/assets/worker-image-icons/setting-theme.png') as ImageSourcePropType,
  hero: workerV5CapturedIconAssets.settingsHero,
  kaelMemory: workerV5CapturedIconAssets.settingsKaelMemory,
  language: workerV5CapturedIconAssets.settingsLanguage,
  notifications: require('@/assets/worker-image-icons/utility-bell.png') as ImageSourcePropType,
  personal: workerV5CapturedIconAssets.settingsPersonal,
  policy: require('@/assets/worker-image-icons/utility-shield.png') as ImageSourcePropType,
  security: workerV5CapturedIconAssets.settingsSecurity,
  serviceArea: workerV5CapturedIconAssets.settingsServiceArea,
  support: require('@/assets/worker-image-icons/utility-chat.png') as ImageSourcePropType,
} as const

export const workerV5RankingIconAssets = {
  arrival: workerV5CapturedIconAssets.rankingArrival,
  completion: workerV5CapturedIconAssets.rankingCompletion,
  fallback: workerV5CapturedIconAssets.rankingFeedback,
  incident_handling: workerV5CapturedIconAssets.rankingIncidentHandling,
  rating: workerV5CapturedIconAssets.rankingFeedback,
  work_response: workerV5CapturedIconAssets.rankingWorkResponse,
  worker: workerV5CapturedIconAssets.rankingWorker,
} as const
