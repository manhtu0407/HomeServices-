import type { ImageSourcePropType } from 'react-native'
import type { ServiceType } from '@nestscout/shared'

export const workerV5CapturedIconAssets = {
  caseCompletionRecord: require('@/assets/worker-image-icons/utility-completion-record-core.png') as ImageSourcePropType,
  caseIncomeLedger: require('@/assets/worker-image-icons/utility-income-ledger-core.png') as ImageSourcePropType,
  earningsHero: require('@/assets/worker-image-icons/utility-earnings-wallet-core.png') as ImageSourcePropType,
  earningsRecentTransactions: require('@/assets/worker-image-icons/utility-recent-transactions-sync-core.png') as ImageSourcePropType,
  homeQuickEarnings: require('@/assets/worker-image-icons/nav-earnings.png') as ImageSourcePropType,
  homeQuickIncoming: require('@/assets/worker-image-icons/nav-jobs.png') as ImageSourcePropType,
  homeQuickKael: require('@/assets/worker-image-icons/utility-chat.png') as ImageSourcePropType,
  homeQuickSkillsArea: require('@/assets/worker-image-icons/utility-scope-core.png') as ImageSourcePropType,
  opportunityPlumbing: require('@/assets/worker-image-icons/service-plumbing.png') as ImageSourcePropType,
  payoutBankAccount: require('@/assets/worker-image-icons/payout-add-bank-account-core.png') as ImageSourcePropType,
  payoutLimitPolicy: require('@/assets/worker-image-icons/payout-limit-policy-core.png') as ImageSourcePropType,
  payoutReceivingAccount: require('@/assets/worker-image-icons/payout-receiving-account-core.png') as ImageSourcePropType,
  payoutVerifiedAccount: require('@/assets/worker-image-icons/utility-identity.png') as ImageSourcePropType,
  profileDossierReliability: require('@/assets/worker-image-icons/profile-reliability-core.png') as ImageSourcePropType,
  profileDossierServices: require('@/assets/worker-image-icons/profile-skills.png') as ImageSourcePropType,
  profileDossierSettings: require('@/assets/worker-image-icons/setting-theme.png') as ImageSourcePropType,
  profileServiceArea: require('@/assets/worker-image-icons/profile-service-area.png') as ImageSourcePropType,
  rankingArrival: require('@/assets/worker-image-icons/utility-calendar.png') as ImageSourcePropType,
  rankingCompletion: require('@/assets/worker-image-icons/utility-document.png') as ImageSourcePropType,
  rankingFeedback: require('@/assets/worker-image-icons/ranking-feedback-core.png') as ImageSourcePropType,
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
  skillsHero: require('@/assets/worker-image-icons/utility-tools.png') as ImageSourcePropType,
} as const

export const workerV5ProfileDossierIconAssets = {
  reliability: workerV5CapturedIconAssets.profileDossierReliability,
  services: workerV5CapturedIconAssets.profileDossierServices,
  settings: workerV5CapturedIconAssets.profileDossierSettings,
} as const

export const workerV5ProfileServiceIconAssets: Record<ServiceType, ImageSourcePropType> = {
  cleaning: workerV5CapturedIconAssets.serviceGridCleaning,
  electrical: workerV5CapturedIconAssets.serviceGridElectrical,
  plumbing: workerV5CapturedIconAssets.serviceGridPlumbing,
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
  hero: workerV5CapturedIconAssets.settingsHero,
  kaelMemory: workerV5CapturedIconAssets.settingsKaelMemory,
  language: workerV5CapturedIconAssets.settingsLanguage,
  personal: workerV5CapturedIconAssets.settingsPersonal,
  security: workerV5CapturedIconAssets.settingsSecurity,
  serviceArea: workerV5CapturedIconAssets.settingsServiceArea,
} as const

export const workerV5RankingIconAssets = {
  arrival: workerV5CapturedIconAssets.rankingArrival,
  completion: workerV5CapturedIconAssets.rankingCompletion,
  fallback: workerV5CapturedIconAssets.rankingFeedback,
  rating: workerV5CapturedIconAssets.rankingFeedback,
  worker: workerV5CapturedIconAssets.rankingWorker,
} as const
