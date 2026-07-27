import { ScrollView, Text as RNText, View, type StyleProp, type TextProps, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { useDockScrollHandler } from '@/components/ui/dock-scroll-state'
import { glass } from '@/design/theme'
import { type AppLanguage } from '@/lib/app-language'
import { getWorkerV5Screen } from '../dock/screens'
import { WorkerV5ScreenDefinition } from '../dock/types'
import { WorkerV5HomeQuickActionsAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { workerV5HomeDisplayName } from '../ui/labels'
import { WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { workerV5HomeQuickIconAssets } from '../ui/worker-v5-icon-assets'
import { styles } from '../worker-v5-flow-styles'
import { WorkerV5HomeQuickActionGrid } from './action-surfaces'
import { localizedStatusLabel } from '@/lib/app-language'
import { isWorkerOperationalJobStatus } from '@/lib/frontend-workflow/helpers'
import { formatVnd } from '../ui/format'
import { formatWorkerDistrict } from '../ui/labels'
import { WorkerV5KaelBriefCard, WorkerV5QuickActionGrid } from './action-surfaces'
import { WorkerV5AvailabilityCard } from './availability-surfaces'
import { type LocalDeal } from '@nestscout/shared'
import { localizedServiceLabel } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { InfoListCard, MetricTile, WorkerV5ScreenInfoRow } from '../ui/screen-atoms-surfaces'
import { workerV5Icons } from '../ui/screen-icons'
import { Circle, Defs, LinearGradient } from 'react-native-svg'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import Svg from 'react-native-svg'
import { WorkerV5HomeAuraBackground, WorkerV5HomeHeroSourceAura } from '../ui/aura-surfaces'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5HomeScreenSurface({
  glass,
  language,
  minHeight,
  openScreen,
  runtime,
  surfaceStyle,
}: {
  glass: ReturnType<typeof useGlassAccessibility>
  language: AppLanguage
  minHeight: number
  openScreen: (target: WorkerV5ScreenDefinition | null) => void
  runtime: WorkerV5Runtime
  surfaceStyle: StyleProp<ViewStyle>
}) {
  const onDockScroll = useDockScrollHandler()
  const profile = runtime.workerProfile
  const deal = runtime.state.deal
  const earnings = runtime.workerEarnings
  const insights = runtime.workerPerformanceInsights
  const displayName = workerV5HomeDisplayName(profile, language)
  const score = typeof insights?.performance_score === 'number' && Number.isFinite(insights.performance_score)
    ? Math.max(0, Math.min(100, Math.round(insights.performance_score)))
    : null
  const scoreRingRadius = 36
  const scoreCircumference = 2 * Math.PI * scoreRingRadius
  const scoreStroke = score == null ? 0 : (score / 100) * scoreCircumference
  const dataPending = textByLanguage(language, 'Chờ dữ liệu', 'Data pending')
  const jobsEmpty = textByLanguage(language, 'Chưa có', 'None')
  const pendingSettlementCount = !earnings
    ? dataPending
    : earnings.pending_payment_count > 0
      ? String(earnings.pending_payment_count)
      : earnings.pending_payment_amount > 0
        ? '1'
        : jobsEmpty
  const stats = [
    {
      label: textByLanguage(language, 'Cơ hội mới', 'New opportunities'),
      value: deal?.broadcast ? '1' : runtime.workerJobsHydrated ? jobsEmpty : dataPending,
    },
    {
      label: textByLanguage(language, 'Việc đang chạy', 'Active work'),
      value: deal ? '1' : runtime.workerJobsHydrated ? jobsEmpty : dataPending,
    },
    {
      label: textByLanguage(language, 'Chờ đối soát', 'Settlement'),
      value: pendingSettlementCount,
    },
  ]
  const quickActions = [
    {
      details: [
        { glyph: 'document' as const, label: textByLanguage(language, 'Cơ hội thật', 'Real opportunities') },
        { glyph: 'check' as const, label: textByLanguage(language, 'Bạn quyết định', 'You decide') },
      ],
      icon: workerV5HomeQuickIconAssets.incoming,
      meta: deal?.broadcast
        ? textByLanguage(language, '1 cơ hội đã lọc', '1 filtered opportunity')
        : runtime.workerJobsHydrated
          ? textByLanguage(language, 'Chưa có cơ hội thật', 'No real opportunity')
          : dataPending,
      targetId: '2.1-opportunity-inbox' as const,
      tone: 'document' as const,
      title: textByLanguage(language, 'Nhận việc ngay', 'Open work'),
    },
    {
      details: [
        { glyph: 'spark' as const, label: textByLanguage(language, 'Kael lọc', 'Kael filters') },
        { glyph: 'shield' as const, label: textByLanguage(language, 'Không tự nhận', 'No auto-accept') },
      ],
      icon: workerV5HomeQuickIconAssets.kael,
      meta: deal?.broadcast
        ? textByLanguage(language, 'Giải thích cơ hội hiện tại', 'Explain the current opportunity')
        : runtime.workerJobsHydrated
          ? textByLanguage(language, 'Lọc theo kỹ năng & khu vực', 'Filter by skills and area')
          : dataPending,
      targetId: '3.2-kael-job-intake' as const,
      tone: 'signal' as const,
      title: textByLanguage(language, 'Kael nhận việc', 'Kael job intake'),
    },
    {
      details: [
        { glyph: 'service' as const, label: textByLanguage(language, 'Kỹ năng', 'Skills') },
        { glyph: 'location' as const, label: textByLanguage(language, 'Khu vực', 'Area') },
      ],
      icon: workerV5HomeQuickIconAssets.skillsArea,
      meta: !profile
        ? textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
        : profile.districts.length
          ? textByLanguage(language, `${profile.districts.length} khu vực phục vụ`, `${profile.districts.length} service areas`)
          : textByLanguage(language, 'Bổ sung để tăng cơ hội phù hợp', 'Complete this for better matches'),
      targetId: '5.3-skills-service-area' as const,
      tone: 'location' as const,
      title: textByLanguage(language, 'Kỹ năng & khu vực', 'Skills and area'),
    },
    {
      details: [
        { glyph: 'document' as const, label: textByLanguage(language, 'Đối soát', 'Settlement') },
        { glyph: 'money' as const, label: textByLanguage(language, 'Thu nhập ròng', 'Net income') },
      ],
      icon: workerV5HomeQuickIconAssets.earnings,
      meta: !earnings
        ? dataPending
        : earnings.net_earnings > 0
          ? formatVnd(earnings.net_earnings, language)
          : textByLanguage(language, 'Chưa có đối soát', 'No settlement yet'),
      targetId: '4.1-earnings-overview' as const,
      tone: 'money' as const,
      title: textByLanguage(language, 'Thu nhập', 'Earnings'),
    },
  ]
  return (
    <SafeAreaView style={[styles.safeArea, surfaceStyle]} testID="worker-v5-screen-1.1-worker-home">
      <WorkerV5HomeAuraBackground reduceTransparency={glass.reduceTransparency} />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.homeSourceScrollContent, { minHeight }]}
        onScroll={onDockScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.homeSourceScroll}
        testID="worker-v5-scroll"
      >
        <View style={styles.homeSourceHeader} testID="worker-v5-home-header">
          <View style={styles.homeSourceHeaderCopy}>
            <Text style={styles.homeSourceTitle} numberOfLines={2}>
              {textByLanguage(language, `Chào buổi sáng, ${displayName}!`, `Good morning, ${displayName}!`)}
            </Text>
            <Text style={styles.homeSourceSubtitle} numberOfLines={2}>
              {deal
                ? textByLanguage(language, 'Kael đã đồng bộ lịch, khu vực và việc đang chạy', 'Kael synced schedule, area, and active work')
                : profile
                  ? textByLanguage(language, 'Kael đã đồng bộ hồ sơ và khu vực nhận việc', 'Kael synced profile and service area')
                  : textByLanguage(language, 'Đang chờ hồ sơ và dữ liệu nhận việc', 'Waiting for profile and work data')}
            </Text>
          </View>
        </View>

        <WorkerV5AvailabilityCard
          availabilityGuardReady={runtime.workerJobsHydrated}
          hasActiveJob={runtime.workerJobs.some((job) => isWorkerOperationalJobStatus(job.status))}
          key={profile?.id ?? 'worker-profile-loading'}
          language={language}
          onToggleAvailability={runtime.actions.workerUpdateAvailability}
          profile={profile}
          reduceMotion={glass.reduceMotion}
          reduceTransparency={glass.reduceTransparency}
        />

        <View style={[styles.homeCommandCard, glass.reduceTransparency && styles.opaqueCard]} testID="worker-v5-home-command-center">
          {!glass.reduceTransparency ? <WorkerV5HomeHeroSourceAura /> : null}
          <View style={styles.homeCommandTopRow}>
            <View style={styles.homeCommandCopy}>
              <Text style={styles.homeCommandTitle}>{textByLanguage(language, 'Giải quyết công việc hôm nay', 'Today work resolution')}</Text>
              <Text style={styles.homeCommandBody}>
                {textByLanguage(language, 'Kael đề xuất; bạn luôn là người nhận hoặc từ chối việc.', 'Kael suggests; you always accept or decline work.')}
              </Text>
            </View>
            <View style={styles.homeScoreShell} testID="worker-v5-home-score-ring">
              <Svg height={92} width={92} viewBox="0 0 92 92">
                <Defs>
                  <LinearGradient id="worker-v5-home-score-gradient" x1="0" x2="1" y1="0" y2="1">
                    <Stop offset="0" stopColor="#48DCC9" />
                    <Stop offset="1" stopColor="#078D7D" />
                  </LinearGradient>
                </Defs>
                <Circle cx="46" cy="46" fill="rgba(255,255,255,0.72)" r="38" />
                <Circle cx="46" cy="46" fill="none" r={scoreRingRadius} stroke="rgba(184,231,223,0.55)" strokeWidth="8" />
                <Circle
                  cx="46"
                  cy="46"
                  fill="none"
                  r={scoreRingRadius}
                  stroke="url(#worker-v5-home-score-gradient)"
                  strokeDasharray={`${scoreStroke} ${scoreCircumference}`}
                  strokeLinecap="round"
                  strokeWidth="8"
                  transform="rotate(-90 46 46)"
                />
              </Svg>
              <View style={styles.homeScoreText}>
                <Text style={styles.homeScoreValue}>{score ?? '—'}</Text>
                <Text style={styles.homeScoreLabel} numberOfLines={2}>{score != null ? textByLanguage(language, 'Tỷ lệ hoàn tất', 'Completion') : textByLanguage(language, 'Chờ dữ liệu', 'No data')}</Text>
              </View>
            </View>
          </View>
          <View style={styles.homeStatGrid}>
            {stats.map((item) => (
              <View key={item.label} style={styles.homeStatTile} testID={`worker-v5-home-stat-${item.label}`}>
                <Text style={styles.homeStatValue} numberOfLines={1}>{item.value}</Text>
                <Text style={styles.homeStatLabel} numberOfLines={2}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <WorkerV5SectionHeader
          action={textByLanguage(language, 'Được cá nhân hóa', 'Personalized')}
          title={textByLanguage(language, 'Hành động nhanh', 'Quick actions')}
        />
        <View style={styles.homeQuickAuraFrame}>
          {!glass.reduceTransparency ? <WorkerV5HomeQuickActionsAura /> : null}
          <WorkerV5HomeQuickActionGrid
            items={quickActions}
            onOpen={(id) => openScreen(getWorkerV5Screen(id))}
            reduceMotion={glass.reduceMotion}
            reduceTransparency={glass.reduceTransparency}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

export function WorkerV5HomeBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  const deal = runtime.state.deal
  const availability = profile?.is_suspended
    ? textByLanguage(language, 'Hồ sơ đang bị khóa', 'Profile suspended')
    : profile?.is_available && profile?.is_approved
      ? textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready for work')
      : profile?.is_approved
        ? textByLanguage(language, 'Đang tắt nhận việc', 'Not accepting jobs')
        : textByLanguage(language, 'Cần hoàn tất hồ sơ', 'Profile needed')
  const pendingPayment = runtime.workerEarnings?.pending_payment_amount
  const pendingPaymentLabel = pendingPayment && pendingPayment > 0
    ? formatVnd(pendingPayment, language)
    : textByLanguage(language, 'Chưa có đối soát đang chờ', 'No pending settlement')
  const quickActions = [
    {
      icon: 'jobs' as const,
      meta: deal ? buildDealSummary(deal, language) : textByLanguage(language, 'Mở khi có cơ hội thật', 'Opens when a real broadcast exists'),
      title: textByLanguage(language, 'Nhận việc ngay', 'Open work'),
    },
    {
      icon: 'map' as const,
      meta: profile?.districts?.length
        ? profile.districts.map((district) => formatWorkerDistrict(district, language)).join(', ')
        : textByLanguage(language, 'Chưa có khu vực phục vụ', 'No service area'),
      title: textByLanguage(language, 'Bản đồ cơ hội', 'Opportunity map'),
    },
    {
      icon: 'calendar' as const,
      meta: textByLanguage(language, 'Kael cần dữ liệu thật trước khi xếp lịch', 'Kael needs real data before sequencing'),
        title: textByLanguage(language, 'Tối ưu việc làm', 'Work optimization'),
    },
    {
      icon: 'scope' as const,
      meta: deal ? deal.displayCode ?? deal.id : textByLanguage(language, 'Chưa có việc đang chạy', 'No active work'),
      title: textByLanguage(language, 'Việc đang chạy', 'Active work'),
    },
  ]

  return (
    <View style={styles.sectionStack}>
      <WorkerV5AvailabilityCard
        availabilityGuardReady={runtime.workerJobsHydrated}
        hasActiveJob={runtime.workerJobs.some((job) => isWorkerOperationalJobStatus(job.status))}
        key={profile?.id ?? 'worker-profile-loading'}
        language={language}
        onToggleAvailability={runtime.actions.workerUpdateAvailability}
        profile={profile}
        reduceTransparency={reduceTransparency}
      />
      <View style={styles.metricsGrid}>
        <MetricTile label={textByLanguage(language, 'Trạng thái', 'Status')} value={availability} />
        <MetricTile
          label={textByLanguage(language, 'Việc đang chạy', 'Active work')}
          value={deal ? localizedStatusLabel(deal.status, language) : textByLanguage(language, 'Chưa có việc', 'No active work')}
        />
        <MetricTile label={textByLanguage(language, 'Đối soát', 'Settlement')} value={pendingPaymentLabel} />
      </View>
      <WorkerV5KaelBriefCard
        body={deal?.broadcast?.prebrief?.[0] ?? textByLanguage(language, 'Kael chỉ chuẩn bị gợi ý khi có lịch, khu vực hoặc việc thật để đối chiếu.', 'Kael prepares suggestions only from real schedule, area, or job data.')}
        icon="chat"
        icons={workerV5Icons}
        reduceTransparency={reduceTransparency}
        title={deal ? textByLanguage(language, 'Kael đã chuẩn bị việc phù hợp', 'Kael prepared matching work') : textByLanguage(language, 'Kael đang chờ nguồn thật', 'Kael is waiting for real sources')}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Được cá nhân hóa', 'Personalized')}
        title={textByLanguage(language, 'Hành động nhanh', 'Quick actions')}
      />
      <WorkerV5QuickActionGrid icons={workerV5Icons} items={quickActions} reduceTransparency={reduceTransparency} />
      <InfoListCard reduceTransparency={reduceTransparency}>
        <WorkerV5ScreenInfoRow
          icon="jobs"
          label={textByLanguage(language, 'Nhận việc ngay', 'Open work')}
          value={deal ? buildDealSummary(deal, language) : textByLanguage(language, 'Hộp cơ hội sẽ mở khi có cơ hội thật', 'Inbox opens when a real broadcast exists')}
        />
        <WorkerV5ScreenInfoRow
          icon="map"
          label={textByLanguage(language, 'Bản đồ cơ hội', 'Opportunity map')}
          value={profile?.districts?.length ? profile.districts.join(', ') : textByLanguage(language, 'Chưa có khu vực phục vụ', 'No service area yet')}
        />
        <WorkerV5ScreenInfoRow
          icon="calendar"
          label={textByLanguage(language, 'Tối ưu việc làm', 'Work optimization')}
          value={textByLanguage(language, 'Chờ đề xuất khi có danh sách cơ hội thật', 'Suggestions require real opportunities')}
        />
      </InfoListCard>
    </View>
  )
}

export function buildDealSummary(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return textByLanguage(language, 'Chưa có việc', 'No work')
  const service = localizedServiceLabel(deal.draft.serviceType, language)
  const area = deal.draft.districtLabel || textByLanguage(language, 'chưa rõ khu vực', 'unknown area')
  return `${service} · ${area} · ${localizedStatusLabel(deal.status, language)}`
}

