import { useState, type ComponentType, type ReactNode } from 'react'
import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import type { ServiceType } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import type { WorkerV5IconName, WorkerV5ScreenId } from '../dock/types'
import { WorkerV5KaelBriefCard } from '../home/action-surfaces'
import { WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import {
  formatCountOrEmpty,
  formatNullablePercent,
  formatNullableRating,
  textByLanguage,
} from '../ui/format'
import {
  workerV5ReliabilityAxes,
  workerV5ReliabilityAxisScore,
  workerV5ReliabilityAxisTitle,
  workerV5ReliabilityPercentValue,
  workerV5ReliabilityRatingValue,
} from '../ui/performance'
import { WorkerV5KaelDraftCard } from '../jobs/shared-surfaces'
import {
  WorkerV5ProfileHeader,
} from './header-surfaces'
import { WorkerV5ProfileDossierCard } from './overview-surfaces'
import {
  WorkerV5RankingImprovementList,
  WorkerV5RankingLeaderboard,
  WorkerV5RankingStatsStrip,
} from './ranking-surfaces'
import {
  WorkerV5ReliabilityComponentList,
  WorkerV5ReliabilityStatTile,
} from './reliability-surfaces'
import { styles as reliabilityStyles } from './reliability-styles'
import {
  WorkerV5RecentFeedbackList,
  WorkerV5ReviewImprovementPlan,
  WorkerV5ReviewSignalGrid,
  WorkerV5ReviewsHero,
} from './reviews-surfaces'
import {
  WorkerV5ServiceCardGrid,
  WorkerV5SkillsServiceHero,
  type WorkerV5ServicePreferenceInteraction,
} from './services-surfaces'
import {
  WorkerV5VerificationChecklist,
  WorkerV5VerificationHero,
  WorkerV5VerificationRenewalCard,
} from './verification-surfaces'
import { workerV5VerificationChecks } from './verification-model'
import { WorkerV5WorkerRegistrationBody } from './registration-surfaces'
import { workerNeedsRegistration } from './registration-model'
import { styles } from './body-styles'
type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerV5IconMap = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5DossierIconMap = Record<'logout' | 'reliability' | 'schedule' | 'services' | 'settings', ImageSourcePropType>
type WorkerV5ServiceIconMap = Record<ServiceType, ImageSourcePropType>
type WorkerV5AuraComponent = ComponentType<{ testID: string }>
type WorkerV5ScopedAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>
type WorkerV5MetricTileComponent = ComponentType<{ label: string; value: string }>
type WorkerV5InfoListCardComponent = ComponentType<{
  aura?: 'accountSecurity' | 'demandMap'
  children: ReactNode
  reduceTransparency: boolean
}>
type WorkerV5InfoRowComponent = ComponentType<{
  icon: WorkerV5IconName
  label: string
  reduceTransparency?: boolean
  value: string
}>
type WorkerV5RankingHeroComponent = ComponentType<{
  heroAura: WorkerV5AuraComponent
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}>
type WorkerV5ServiceAreaMapCardComponent = ComponentType<{
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}>
type WorkerV5ReliabilityHeroComponent = ComponentType<{
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}>
type WorkerV5ReliabilityAxisFillComponent = ComponentType<{
  hasData: boolean
  index: number
  reduceMotion: boolean
  score: number
}>
type WorkerV5ReadOnlyToggleListComponent = ComponentType<{
  items: readonly { enabled: boolean; label: string; value: string }[]
  reduceTransparency: boolean
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
  heroAura,
  language,
  listAura,
  rankingIcons,
  rankingHero: RankingHero,
  reduceTransparency,
  runtime,
}: {
  heroAura: WorkerV5AuraComponent
  language: AppLanguage
  listAura: WorkerV5AuraComponent
  rankingIcons: Record<string, ImageSourcePropType>
  rankingHero: WorkerV5RankingHeroComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const insights = runtime.workerPerformanceInsights
  const profile = runtime.workerProfile
  return (
    <View style={styles.sectionStack}>
      <RankingHero
        heroAura={heroAura}
        insights={insights}
        language={language}
        profile={profile}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5RankingStatsStrip
        insights={insights}
        language={language}
        listAura={listAura}
        profile={profile}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Dữ liệu thật', 'Real data')}
        title={textByLanguage(language, 'Bảng xếp hạng khu vực', 'Area ranking')}
      />
      <WorkerV5RankingLeaderboard
        insights={insights}
        language={language}
        listAura={listAura}
        profile={profile}
        profileIcon={rankingIcons.worker}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Có thể hành động', 'Actionable')}
        title={textByLanguage(language, 'Điều giúp bạn thăng hạng', 'Ranking improvements')}
      />
      <WorkerV5RankingImprovementList
        axisIcons={rankingIcons}
        insights={insights}
        language={language}
        listAura={listAura}
        reduceTransparency={reduceTransparency}
      />
    </View>
  )
}

export function WorkerV5SkillsServiceAreaBody({
  heroAura,
  language,
  listAura,
  reduceTransparency,
  runtime,
  serviceAreaMapCard: ServiceAreaMapCard,
  serviceIcons,
  skillsGridEmptyIcon,
  skillsHeroIcon,
}: {
  heroAura: WorkerV5AuraComponent
  language: AppLanguage
  listAura: WorkerV5AuraComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  serviceAreaMapCard: WorkerV5ServiceAreaMapCardComponent
  serviceIcons: WorkerV5ServiceIconMap
  skillsGridEmptyIcon: ImageSourcePropType
  skillsHeroIcon: ImageSourcePropType
}) {
  const profile = runtime.workerProfile
  const profileOwnerId = profile?.id ?? null
  const [servicePreferenceInteraction, setServicePreferenceInteraction] = useState<{
    ownerId: string | null
    value: WorkerV5ServicePreferenceInteraction
  } | null>(null)
  const currentServicePreferenceInteraction =
    servicePreferenceInteraction?.ownerId === profileOwnerId
      ? servicePreferenceInteraction.value
      : null
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
      <WorkerV5SkillsServiceHero
        heroAura={heroAura}
        interaction={currentServicePreferenceInteraction}
        language={language}
        profile={profile}
        reduceTransparency={reduceTransparency}
        toolsIcon={skillsHeroIcon}
      />
      <WorkerV5ServiceCardGrid
        key={servicePreferencesOwnerKey}
        language={language}
        listAura={listAura}
        onInteractionChange={(value) => {
          setServicePreferenceInteraction({ ownerId: profileOwnerId, value })
        }}
        onSave={runtime.actions.workerUpdateServicePreferences}
        profile={profile}
        reduceTransparency={reduceTransparency}
        serviceIcons={serviceIcons}
        toolsIcon={skillsGridEmptyIcon}
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
  caseWideAura,
  icons,
  language,
  listAura,
  reduceMotion,
  reduceTransparency,
  reliabilityIcons,
  reliabilityAxisFill: ReliabilityAxisFill,
  reliabilityHero: ReliabilityHero,
  runtime,
  zipAura,
}: {
  caseWideAura: WorkerV5ScopedAuraComponent
  icons: WorkerV5IconMap
  language: AppLanguage
  listAura: WorkerV5AuraComponent
  reduceMotion: boolean
  reduceTransparency: boolean
  reliabilityIcons: Record<string, ImageSourcePropType>
  reliabilityAxisFill: WorkerV5ReliabilityAxisFillComponent
  reliabilityHero: WorkerV5ReliabilityHeroComponent
  runtime: WorkerV5Runtime
  zipAura: WorkerV5ScopedAuraComponent
}) {
  const insights = runtime.workerPerformanceInsights
  const profile = runtime.workerProfile
  const axes = workerV5ReliabilityAxes(insights)
  const syncedAxes = axes.filter((axis) => axis.hasData)
  const weakestAxis = syncedAxes.reduce<(typeof syncedAxes)[number] | undefined>(
    (weakest, axis) => !weakest || axis.score < weakest.score ? axis : weakest,
    undefined,
  )
  const onTimeValue = workerV5ReliabilityPercentValue(insights?.on_time_rate_percent, language)
  const ratingValue = workerV5ReliabilityRatingValue(insights?.average_rating ?? profile?.rating, language)
  return (
    <View style={styles.sectionStack}>
      <ReliabilityHero insights={insights} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <View style={reliabilityStyles.reliabilityStatsGrid} testID="worker-v5-reliability-stat-grid">
        <WorkerV5ReliabilityStatTile
          label={textByLanguage(language, 'Hoàn tất', 'Completion')}
          testID="worker-v5-reliability-stat-completion"
          value={workerV5ReliabilityPercentValue(workerV5ReliabilityAxisScore(insights, 'completion'), language)}
        />
        <WorkerV5ReliabilityStatTile
          label={textByLanguage(language, 'Đúng hẹn', 'On-time')}
          testID="worker-v5-reliability-stat-arrival"
          value={onTimeValue}
        />
        <WorkerV5ReliabilityStatTile
          label={textByLanguage(language, 'Đánh giá', 'Rating')}
          testID="worker-v5-reliability-stat-rating"
          value={ratingValue}
        />
      </View>
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Có thể giải thích', 'Explainable')}
        title={textByLanguage(language, 'Thành phần điểm', 'Score components')}
      />
      <WorkerV5ReliabilityComponentList
        axes={axes}
        axisIcons={reliabilityIcons}
        language={language}
        listAura={listAura}
        reduceTransparency={reduceTransparency}
        renderAxisFill={({ hasData, index, score }) => (
          <ReliabilityAxisFill
            hasData={hasData}
            index={index}
            reduceMotion={reduceMotion}
            score={score}
          />
        )}
      />
      {weakestAxis ? (
        <WorkerV5KaelDraftCard
          caseWideAura={caseWideAura}
          chatIcon={icons.chat}
          body={textByLanguage(language, `Kael ưu tiên cải thiện ${workerV5ReliabilityAxisTitle(weakestAxis.id, language)} vì đây là thành phần thấp nhất trong dữ liệu thật.`, `Kael prioritizes ${workerV5ReliabilityAxisTitle(weakestAxis.id, language)} because it is the lowest real component.`)}
          formulaAura
          language={language}
          reduceTransparency={reduceTransparency}
          title={textByLanguage(language, 'Kael gợi ý cải thiện', 'Kael coaching')}
          zipAura={zipAura}
        />
      ) : null}
    </View>
  )
}

export function WorkerV5VerificationDocumentsBody({
  caseWideAura,
  icons,
  language,
  profileIconVisualBoost,
  readOnlyToggleList: ReadOnlyToggleList,
  reduceTransparency,
  runtime,
  zipAura,
}: {
  caseWideAura: WorkerV5ScopedAuraComponent
  icons: WorkerV5IconMap
  language: AppLanguage
  profileIconVisualBoost: ReadonlySet<WorkerV5IconName>
  readOnlyToggleList: WorkerV5ReadOnlyToggleListComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  zipAura: WorkerV5ScopedAuraComponent
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
  const checks = workerV5VerificationChecks(profile, language)
  const missingCount = checks.filter((check) => !check.done).length
  return (
    <View style={styles.sectionStack}>
      <WorkerV5VerificationHero icons={icons} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={missingCount ? textByLanguage(language, `${missingCount} mục thiếu`, `${missingCount} missing`) : textByLanguage(language, 'Không thiếu mục', 'No missing item')}
        title={textByLanguage(language, 'Hồ sơ bắt buộc', 'Required profile')}
      />
      <WorkerV5VerificationChecklist
        caseWideAura={caseWideAura}
        iconVisualBoost={profileIconVisualBoost}
        icons={icons}
        language={language}
        profile={profile}
        reduceTransparency={reduceTransparency}
        zipAura={zipAura}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Chưa khả dụng', 'Unavailable')}
        title={textByLanguage(language, 'Nhắc gia hạn', 'Renewal reminder')}
      />
      <WorkerV5VerificationRenewalCard
        language={language}
        readOnlyToggleList={ReadOnlyToggleList}
        reduceTransparency={reduceTransparency}
      />
    </View>
  )
}

export function WorkerV5ReviewsFeedbackBody({
  icons,
  infoListCard: InfoListCard,
  infoRow: InfoRow,
  language,
  metricTile: MetricTile,
  reduceTransparency,
  runtime,
}: {
  icons: WorkerV5IconMap
  infoListCard: WorkerV5InfoListCardComponent
  infoRow: WorkerV5InfoRowComponent
  language: AppLanguage
  metricTile: WorkerV5MetricTileComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const insights = runtime.workerPerformanceInsights
  const profile = runtime.workerProfile
  const hasReviewCount = typeof insights?.review_count === 'number' && Number.isFinite(insights.review_count)
  const reviewCount = hasReviewCount ? insights.review_count : null
  return (
    <View style={styles.sectionStack}>
      <WorkerV5ReviewsHero insights={insights} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5ReviewSignalGrid insights={insights} language={language} metricTile={MetricTile} profile={profile} />
      <View style={styles.metricsGrid}>
        <MetricTile label={textByLanguage(language, 'Đánh giá', 'Rating')} value={formatNullableRating(insights?.average_rating ?? profile?.rating, language)} />
        <MetricTile
          label={textByLanguage(language, 'Phản hồi', 'Reviews')}
          value={reviewCount === null
            ? textByLanguage(language, 'Chưa có dữ liệu', 'No data')
            : formatCountOrEmpty(reviewCount, textByLanguage(language, 'Chưa có', 'None yet'))}
        />
        <MetricTile label={textByLanguage(language, 'Đúng hẹn', 'On-time')} value={formatNullablePercent(insights?.on_time_rate_percent, language)} />
      </View>
      <WorkerV5RecentFeedbackList chatIcon={icons.chat} insights={insights} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5ReviewImprovementPlan
        insights={insights}
        kaelBriefCard={(props) => <WorkerV5KaelBriefCard {...props} icons={icons} />}
        language={language}
        reduceTransparency={reduceTransparency}
      />
      <InfoListCard reduceTransparency={reduceTransparency}>
        <InfoRow
          icon="chat"
          label={textByLanguage(language, 'Phản hồi gần đây', 'Recent feedback')}
          reduceTransparency={reduceTransparency}
          value={reviewCount === null
            ? textByLanguage(language, 'Chưa có dữ liệu đánh giá', 'No review data')
            : reviewCount > 0
              ? textByLanguage(language, 'Chưa đồng bộ nội dung phản hồi chi tiết', 'Detailed review content is not synced')
              : textByLanguage(language, 'Chưa có phản hồi thật', 'No real feedback yet')}
        />
        <InfoRow icon="shield" label={textByLanguage(language, 'Tỷ lệ phản hồi', 'Response rate')} reduceTransparency={reduceTransparency} value={formatNullablePercent(insights?.response_rate_percent, language)} />
        <InfoRow icon="jobs" label={textByLanguage(language, 'Việc hoàn tất', 'Completed cases')} reduceTransparency={reduceTransparency} value={insights ? formatCountOrEmpty(insights.completed_job_count, textByLanguage(language, 'Chưa có', 'None yet')) : textByLanguage(language, 'Chưa có dữ liệu', 'No data')} />
        <InfoRow icon="document" label={textByLanguage(language, 'Gợi ý cải thiện', 'Improvement signal')} reduceTransparency={reduceTransparency} value={insights?.performance_score != null ? textByLanguage(language, 'Kael có thể giải thích từ dữ liệu hiệu suất hiện có', 'Kael can explain the current performance data') : textByLanguage(language, 'Cần thêm dữ liệu thật trước khi gợi ý', 'Needs more real data before suggestions')} />
      </InfoListCard>
    </View>
  )
}
