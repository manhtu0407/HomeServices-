import { type ComponentType } from 'react'
import { View, type ImageSourcePropType } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import type { WorkerV5ScreenId } from '../dock/types'
import {
  WorkerV5ProfileHeader,
} from './header-surfaces'
import { WorkerV5ProfileDossierCard } from './overview-surfaces'
import {
  WorkerV5RankingSection,
  WorkerV5ReliabilitySection,
  WorkerV5ReviewsSection,
  WorkerV5VerificationSection,
} from './worker-profile-sections-surfaces'
import {
  WorkerV5ServiceCardGrid,
} from './services-surfaces'
import { WorkerV5WorkerRegistrationBody } from './registration-surfaces'
import { workerNeedsRegistration } from './registration-model'
import { styles } from './body-styles'
type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerV5DossierIconMap = Record<'logout' | 'reliability' | 'schedule' | 'services' | 'settings', ImageSourcePropType>
type WorkerV5AuraComponent = ComponentType<{ testID: string }>
type WorkerV5ServiceAreaMapCardComponent = ComponentType<{
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}>
export function WorkerV5ProfileOverviewBody({
  avatarUploadBusy,
  dossierIcons,
  heroAura,
  language,
  navigateToScreen,
  onPickAvatar,
  onSignOut,
  reduceMotion,
  reduceTransparency,
  runtime,
}: {
  avatarUploadBusy: boolean
  dossierIcons: WorkerV5DossierIconMap
  heroAura: WorkerV5AuraComponent
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  onPickAvatar: () => void
  onSignOut: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  const insights = runtime.workerPerformanceInsights
  return (
    <View style={styles.sectionStack}>
      <WorkerV5ProfileHeader
        avatarUploadBusy={avatarUploadBusy}
        heroAura={heroAura}
        language={language}
        onPickAvatar={onPickAvatar}
        profile={profile}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5ProfileDossierCard
        icons={dossierIcons}
        insights={insights}
        language={language}
        onOpenReliability={() => navigateToScreen('5.4-reliability-insights')}
        onOpenSchedule={() => navigateToScreen('5.11-worker-availability')}
        onOpenSettings={() => navigateToScreen('5.10-support-settings')}
        onOpenSkills={() => navigateToScreen('5.3-skills-service-area')}
        onSignOut={onSignOut}
        profile={profile}
      />
    </View>
  )
}

export function WorkerV5WorkerRankingBody({
  language,
  runtime,
}: {
  language: AppLanguage
  runtime: WorkerV5Runtime
}) {
  const insights = runtime.workerPerformanceInsights
  const profile = runtime.workerProfile
  return <WorkerV5RankingSection insights={insights} language={language} profile={profile} />
}

export function WorkerV5SkillsServiceAreaBody({
  language,
  reduceTransparency,
  runtime,
  serviceAreaMapCard: ServiceAreaMapCard,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  serviceAreaMapCard: WorkerV5ServiceAreaMapCardComponent
}) {
  const profile = runtime.workerProfile
  const serviceAreaOwnerKey = [
    profile?.id ?? 'no-profile',
    profile?.districts?.join('|') ?? '',
    language,
  ].join(':')
  const servicePreferencesOwnerKey = [
    profile?.id ?? 'no-profile',
    profile?.service_types?.join('|') ?? '',
    profile?.selected_service_types?.join('|') ?? '',
    profile?.active_service_types?.join('|') ?? '',
    profile?.service_quality?.map((quality) =>
      `${quality.service_type}:${quality.status}:${quality.locked_until ?? ''}`
    ).join('|') ?? '',
    language,
  ].join(':')

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ServiceCardGrid
        key={servicePreferencesOwnerKey}
        language={language}
        onSave={runtime.actions.workerUpdateServicePreferences}
        profile={profile}
        reduceTransparency={reduceTransparency}
      />
      <ServiceAreaMapCard
        key={serviceAreaOwnerKey}
        language={language}
        reduceTransparency={reduceTransparency}
        runtime={runtime}
      />
    </View>
  )
}

export function WorkerV5ReliabilityInsightsBody({
  language,
  runtime,
}: {
  language: AppLanguage
  runtime: WorkerV5Runtime
}) {
  const insights = runtime.workerPerformanceInsights
  const profile = runtime.workerProfile
  return <WorkerV5ReliabilitySection insights={insights} language={language} profile={profile} />
}

export function WorkerV5VerificationDocumentsBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  if (workerNeedsRegistration(profile)) {
    return (
      <View style={styles.sectionStack}>
        <WorkerV5WorkerRegistrationBody
          language={language}
          profile={profile}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      </View>
    )
  }
  return (
    <WorkerV5VerificationSection
      language={language}
      profile={profile}
    />
  )
}

export function WorkerV5ReviewsFeedbackBody({
  language,
  runtime,
}: {
  language: AppLanguage
  runtime: WorkerV5Runtime
}) {
  const insights = runtime.workerPerformanceInsights
  const profile = runtime.workerProfile
  return <WorkerV5ReviewsSection insights={insights} language={language} profile={profile} />
}
