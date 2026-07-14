import type { ComponentType, ReactNode } from 'react'
import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import type { ServiceType } from '@nestscout/shared'

import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import type { WorkerV5IconName, WorkerV5ScreenId } from '../dock/types'
import { WorkerV5KaelBriefCard } from '../home/action-surfaces'
import { WorkerV5BankCard, WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import {
  formatCountOrEmpty,
  formatDateRange,
  formatNullablePercent,
  formatNullableRating,
  formatVnd,
  textByLanguage,
} from '../ui/format'
import {
  formatWorkerDistrict,
  workerDocumentSummary,
} from '../ui/labels'
import {
  workerV5ReliabilityAxes,
  workerV5ReliabilityAxisScore,
  workerV5ReliabilityAxisTitle,
  workerV5ReliabilityPercentValue,
  workerV5ReliabilityRatingValue,
} from '../ui/performance'
import { WorkerV5KaelDraftCard } from '../jobs/shared-surfaces'
import { resolveWorkerV5BankLogo } from '../earnings/banks'
import {
  WorkerV5AccountChangeGuard,
  WorkerV5BankChipGrid,
  WorkerV5BankTaxHero,
  WorkerV5PayoutRulesList,
} from './bank-tax-surfaces'
import {
  WorkerV5ProfileDashboardCards,
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
} from './services-surfaces'
import {
  WorkerV5VerificationChecklist,
  WorkerV5VerificationHero,
  WorkerV5VerificationRenewalCard,
  workerV5VerificationChecks,
} from './verification-surfaces'
import { styles } from './body-styles'
type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerV5IconMap = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5DossierIconMap = Record<'reliability' | 'services' | 'settings', ImageSourcePropType>
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
  items: ReadonlyArray<{ enabled: boolean; label: string; value: string }>
  reduceTransparency: boolean
}>
export function WorkerV5ProfileOverviewBody({
  avatarUploadBusy,
  caseWideAura,
  dossierIcons,
  heroAura,
  language,
  listAura,
  navigateToScreen,
  onPickAvatar,
  reduceMotion,
  reduceTransparency,
  runtime,
  zipAura,
}: {
  avatarUploadBusy: boolean
  caseWideAura: WorkerV5ScopedAuraComponent
  dossierIcons: WorkerV5DossierIconMap
  heroAura: WorkerV5AuraComponent
  language: AppLanguage
  listAura: WorkerV5AuraComponent
  navigateToScreen: (id: WorkerV5ScreenId) => void
  onPickAvatar: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  zipAura: WorkerV5ScopedAuraComponent
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
      <WorkerV5ProfileDashboardCards
        insights={insights}
        language={language}
        listAura={listAura}
        profile={profile}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Chi tiết hơn', 'More detail')}
        title={textByLanguage(language, 'Hồ sơ nghiệp vụ', 'Work dossier')}
      />
      <WorkerV5ProfileDossierCard
        caseWideAura={caseWideAura}
        icons={dossierIcons}
        insights={insights}
        language={language}
        onOpenReliability={() => navigateToScreen('5.4-reliability-insights')}
        onOpenSettings={() => navigateToScreen('5.10-support-settings')}
        onOpenSkills={() => navigateToScreen('5.3-skills-service-area')}
        profile={profile}
        reduceTransparency={reduceTransparency}
        zipAura={zipAura}
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

  return (
    <View style={styles.sectionStack}>
      <WorkerV5SkillsServiceHero
        heroAura={heroAura}
        language={language}
        profile={profile}
        reduceTransparency={reduceTransparency}
        toolsIcon={skillsHeroIcon}
      />
      <WorkerV5ServiceCardGrid
        language={language}
        listAura={listAura}
        profile={profile}
        reduceTransparency={reduceTransparency}
        serviceIcons={serviceIcons}
        toolsIcon={skillsGridEmptyIcon}
      />
      <ServiceAreaMapCard language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
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
  const weakestAxis = syncedAxes.slice().sort((left, right) => left.score - right.score)[0]
  const onTimeValue = workerV5ReliabilityPercentValue(insights?.on_time_rate_percent)
  const ratingValue = workerV5ReliabilityRatingValue(insights?.average_rating ?? profile?.rating, language)
  return (
    <View style={styles.sectionStack}>
      <ReliabilityHero insights={insights} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <View style={reliabilityStyles.reliabilityStatsGrid} testID="worker-v5-reliability-stat-grid">
        <WorkerV5ReliabilityStatTile
          label={textByLanguage(language, 'Hoàn tất', 'Completion')}
          testID="worker-v5-reliability-stat-completion"
          value={workerV5ReliabilityPercentValue(workerV5ReliabilityAxisScore(insights, 'completion'))}
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
        action={textByLanguage(language, 'Kael theo dõi', 'Kael tracks')}
        title={textByLanguage(language, 'Nhắc gia hạn', 'Renewal reminder')}
      />
      <WorkerV5VerificationRenewalCard
        language={language}
        profile={profile}
        readOnlyToggleList={ReadOnlyToggleList}
        reduceTransparency={reduceTransparency}
      />
    </View>
  )
}

export function WorkerV5BankTaxBody({
  caseWideAura,
  icons,
  infoListCard: InfoListCard,
  infoRow: InfoRow,
  language,
  metricTile: MetricTile,
  reduceTransparency,
  runtime,
  zipAura,
}: {
  caseWideAura: WorkerV5ScopedAuraComponent
  icons: WorkerV5IconMap
  infoListCard: WorkerV5InfoListCardComponent
  infoRow: WorkerV5InfoRowComponent
  language: AppLanguage
  metricTile: WorkerV5MetricTileComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  zipAura: WorkerV5ScopedAuraComponent
}) {
  const earnings = runtime.workerEarnings
  const profile = runtime.workerProfile
  const hasBank = Boolean(profile?.bank_account_masked)
  const netEarnings = earnings?.net_earnings && earnings.net_earnings > 0
    ? formatVnd(earnings.net_earnings, language)
    : textByLanguage(language, 'Chưa có số dư thật', 'No real balance')
  const pending = earnings?.pending_payment_amount && earnings.pending_payment_amount > 0
    ? formatVnd(earnings.pending_payment_amount, language)
    : textByLanguage(language, 'Chưa có khoản đang chờ', 'No pending amount')

  return (
    <View style={styles.sectionStack}>
      <WorkerV5BankTaxHero
        earnings={earnings}
        language={language}
        profile={profile}
        reduceTransparency={reduceTransparency}
        walletIcon={icons.wallet}
      />
      <WorkerV5PayoutRulesList
        earnings={earnings}
        icons={icons}
        language={language}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5BankCard
        bankLogo={resolveWorkerV5BankLogo(profile?.bank_name)}
        language={language}
        profile={profile}
        reduceTransparency={reduceTransparency}
        walletIcon={icons.wallet}
      />
      <WorkerV5BankChipGrid
        items={[
          {
            label: hasBank ? profile?.bank_name ?? textByLanguage(language, 'Ngân hàng', 'Bank') : textByLanguage(language, 'Ngân hàng', 'Bank'),
            selected: hasBank,
            value: hasBank ? profile?.bank_account_masked ?? textByLanguage(language, 'Đã xác minh', 'Verified') : textByLanguage(language, 'Chưa xác minh', 'Not verified'),
          },
          {
            label: textByLanguage(language, 'ĐẢnh danh', 'Identity'),
            selected: Boolean(profile?.has_cccd && profile?.has_selfie),
            value: workerDocumentSummary(profile, language),
          },
          {
            label: textByLanguage(language, 'Đối soát', 'Settlement'),
            selected: Boolean(earnings?.total_jobs_paid),
            value: formatDateRange(earnings?.from_date, earnings?.to_date, language),
          },
        ]}
        reduceTransparency={reduceTransparency}
      />
      <View style={styles.metricsGrid}>
        <MetricTile label={textByLanguage(language, 'Có thể rút', 'Available')} value={netEarnings} />
        <MetricTile label={textByLanguage(language, 'Đang chờ', 'Pending')} value={pending} />
      </View>
      <WorkerV5AccountChangeGuard
        caseWideAura={caseWideAura}
        language={language}
        profile={profile}
        reduceTransparency={reduceTransparency}
        zipAura={zipAura}
      />
      <InfoListCard reduceTransparency={reduceTransparency}>
        <InfoRow icon="wallet" label={textByLanguage(language, 'Tài khoản nhận tiền', 'Payout account')} reduceTransparency={reduceTransparency} value={hasBank ? `${profile?.bank_name ?? textByLanguage(language, 'Ngân hàng', 'Bank')} · ${profile?.bank_account_masked}` : textByLanguage(language, 'Chưa xác minh tài khoản', 'No verified account')} />
        <InfoRow icon="shield" label={textByLanguage(language, 'Trùng định danh hồ sơ', 'Profile identity match')} reduceTransparency={reduceTransparency} value={profile?.legal_name ? profile.legal_name : textByLanguage(language, 'Chưa có tên pháp lý', 'No legal name')} />
        <InfoRow icon="document" label={textByLanguage(language, 'Kỳ đối soát', 'Settlement period')} reduceTransparency={reduceTransparency} value={formatDateRange(earnings?.from_date, earnings?.to_date, language)} />
        <InfoRow icon="document" label={textByLanguage(language, 'Chứng từ thu nhập', 'Income document')} reduceTransparency={reduceTransparency} value={textByLanguage(language, 'Chưa có chứng từ thu nhập được đồng bộ', 'No synced income document')} />
        <InfoRow icon="clock" label={textByLanguage(language, 'Đổi tài khoản', 'Change account')} reduceTransparency={reduceTransparency} value={textByLanguage(language, 'Cần xác minh lại trước khi dùng cho rút tiền', 'Requires verification before payout use')} />
      </InfoListCard>
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
  const reviewCount = insights?.review_count ?? 0
  return (
    <View style={styles.sectionStack}>
      <WorkerV5ReviewsHero insights={insights} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5ReviewSignalGrid insights={insights} language={language} metricTile={MetricTile} profile={profile} />
      <View style={styles.metricsGrid}>
        <MetricTile label={textByLanguage(language, 'Đánh giá', 'Rating')} value={formatNullableRating(insights?.average_rating ?? profile?.rating, language)} />
        <MetricTile label={textByLanguage(language, 'Phản hồi', 'Reviews')} value={formatCountOrEmpty(reviewCount, textByLanguage(language, 'Chưa có', 'None yet'))} />
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
        <InfoRow icon="chat" label={textByLanguage(language, 'Phản hồi gần đây', 'Recent feedback')} reduceTransparency={reduceTransparency} value={reviewCount > 0 ? textByLanguage(language, 'Chưa đồng bộ nội dung phản hồi chi tiết', 'Detailed review content is not synced') : textByLanguage(language, 'Chưa có phản hồi thật', 'No real feedback yet')} />
        <InfoRow icon="shield" label={textByLanguage(language, 'Tỷ lệ phản hồi', 'Response rate')} reduceTransparency={reduceTransparency} value={formatNullablePercent(insights?.response_rate_percent, language)} />
        <InfoRow icon="jobs" label={textByLanguage(language, 'Việc hoàn tất', 'Completed cases')} reduceTransparency={reduceTransparency} value={insights ? formatCountOrEmpty(insights.completed_job_count, textByLanguage(language, 'Chưa có', 'None yet')) : textByLanguage(language, 'Chưa có dữ liệu', 'No data')} />
        <InfoRow icon="document" label={textByLanguage(language, 'Gợi ý cải thiện', 'Improvement signal')} reduceTransparency={reduceTransparency} value={insights?.performance_score != null ? textByLanguage(language, 'Kael có thể giải thích từ dữ liệu hiệu suất hiện có', 'Kael can explain the current performance data') : textByLanguage(language, 'Cần thêm dữ liệu thật trước khi gợi ý', 'Needs more real data before suggestions')} />
      </InfoListCard>
    </View>
  )
}
