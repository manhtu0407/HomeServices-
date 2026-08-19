import { Image } from 'expo-image'
import { type ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Defs, Rect } from 'react-native-svg'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { useDockScrollHandler } from '@/components/ui/dock-scroll-state'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import { color, shadow, typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { isWorkerOperationalJobStatus } from '@/lib/frontend-workflow/helpers'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import { getWorkerV5Screen } from '../dock/screens'
import type { WorkerV5ScreenDefinition } from '../dock/types'
import { WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { formatVnd, textByLanguage } from '../ui/format'
import { workerV5HomeDisplayName } from '../ui/labels'
import { WorkerV5AvailabilityCard } from './availability-surfaces'

const workart = {
  hero: require('../../../assets/client-image-icons/client-booking-journey-workart.png'),
  incoming: require('../../../assets/client-image-icons/client-booking-journey-workart.png'),
  kael: require('../../../assets/client-image-icons/client-booking-workart-cleaning.png'),
  skills: require('../../../assets/client-image-icons/client-booking-workart-handyman.png'),
  account: require('../../../assets/client-image-icons/client-booking-workart-upholstery.png'),
} as const

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

type WorkerQuickAction = {
  art: number
  details: readonly string[]
  meta: string
  targetId: Parameters<typeof getWorkerV5Screen>[0]
  title: string
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.text, style]} />
}

export function WorkerHomeRebuildSurface({
  avatarUploadBusy,
  glass,
  language,
  minHeight,
  onPickAvatar,
  openScreen,
  runtime,
  surfaceStyle,
  themeMode,
}: {
  avatarUploadBusy: boolean
  glass: ReturnType<typeof useGlassAccessibility>
  language: AppLanguage
  minHeight: number
  onPickAvatar: () => void
  openScreen: (target: WorkerV5ScreenDefinition | null) => void
  runtime: WorkerV5Runtime
  surfaceStyle: StyleProp<ViewStyle>
  themeMode: 'dark' | 'light'
}) {
  const { width } = useWindowDimensions()
  const onDockScroll = useDockScrollHandler()
  const isDark = themeMode === 'dark'
  const profile = runtime.workerProfile
  const deal = runtime.state.deal
  const earnings = runtime.workerEarnings
  const displayName = workerV5HomeDisplayName(profile, language)
  const dataPending = textByLanguage(language, 'Chờ dữ liệu', 'Data pending')
  const jobsEmpty = textByLanguage(language, 'Chưa có', 'None')
  const workflowStatus = deal?.backendStatus ?? deal?.status ?? null
  const hasIncomingOffer = deal?.status === 'broadcasting' && deal.broadcast?.status === 'sent'
  const hasActiveWork = Boolean(workflowStatus && isWorkerOperationalJobStatus(workflowStatus))
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
      value: hasIncomingOffer ? '1' : runtime.workerJobsHydrated ? jobsEmpty : dataPending,
    },
    {
      label: textByLanguage(language, 'Việc đang chạy', 'Active work'),
      value: hasActiveWork ? '1' : runtime.workerJobsHydrated ? jobsEmpty : dataPending,
    },
    {
      label: textByLanguage(language, 'Chờ đối soát', 'Settlement'),
      value: pendingSettlementCount,
    },
  ]
  const quickActions: readonly WorkerQuickAction[] = [
    {
      art: workart.incoming,
      details: [
        hasActiveWork
          ? textByLanguage(language, 'Công việc đang chạy', 'Active work')
          : textByLanguage(language, 'Cơ hội thật', 'Real opportunities'),
        hasActiveWork
          ? textByLanguage(language, 'Bạn tiếp tục', 'You continue')
          : textByLanguage(language, 'Bạn quyết định', 'You decide'),
      ],
      meta: hasIncomingOffer
        ? textByLanguage(language, '1 cơ hội đã lọc', '1 filtered opportunity')
        : hasActiveWork
          ? textByLanguage(language, 'Đang thực hiện', 'In progress')
          : runtime.workerJobsHydrated
            ? textByLanguage(language, 'Chưa có cơ hội thật', 'No real opportunity')
            : dataPending,
      targetId: '2.1-opportunity-inbox',
      title: hasActiveWork
        ? textByLanguage(language, 'Tiếp tục công việc', 'Continue work')
        : textByLanguage(language, 'Nhận việc ngay', 'Open work'),
    },
    {
      art: workart.kael,
      details: [
        textByLanguage(language, 'Kael lọc', 'Kael filters'),
        textByLanguage(language, 'Không tự nhận', 'No auto-accept'),
      ],
      meta: hasIncomingOffer
        ? textByLanguage(language, 'Giải thích cơ hội hiện tại', 'Explain the current opportunity')
        : hasActiveWork
          ? textByLanguage(language, 'Hỗ trợ công việc đang chạy', 'Support active work')
          : runtime.workerJobsHydrated
            ? textByLanguage(language, 'Lọc theo kỹ năng & khu vực', 'Filter by skills and area')
            : dataPending,
      targetId: '3.2-kael-job-intake',
      title: textByLanguage(language, 'Kael nhận việc', 'Kael job intake'),
    },
    {
      art: workart.skills,
      details: [
        textByLanguage(language, 'Kỹ năng', 'Skills'),
        textByLanguage(language, 'Khu vực', 'Area'),
      ],
      meta: !profile
        ? textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
        : profile.districts.length
          ? textByLanguage(language, `${profile.districts.length} khu vực phục vụ`, `${profile.districts.length} service areas`)
          : textByLanguage(language, 'Bổ sung để tăng cơ hội phù hợp', 'Complete this for better matches'),
      targetId: '5.3-skills-service-area',
      title: textByLanguage(language, 'Kỹ năng & khu vực', 'Skills and area'),
    },
    {
      art: workart.account,
      details: [
        textByLanguage(language, 'Đối soát', 'Settlement'),
        textByLanguage(language, 'Tài khoản thợ', 'Worker account'),
      ],
      meta: !earnings
        ? dataPending
        : earnings.available_balance > 0
          ? formatVnd(earnings.available_balance, language)
          : textByLanguage(language, 'Chưa có đối soát', 'No settlement yet'),
      targetId: '4.1-earnings-overview',
      title: textByLanguage(language, 'Tài khoản thợ', 'Worker account'),
    },
  ]
  const contentWidth = Math.min(Math.max(width - 32, 0), 920)
  const gridGap = width >= 640 ? 12 : 8
  const twoColumns = width >= 360
  const quickCardWidth = twoColumns ? (contentWidth - gridGap) / 2 : contentWidth
  const blendColor = isDark ? 'rgba(26,51,47,1)' : 'rgba(248,246,241,1)'
  const blendStops = isDark
    ? ['rgba(26,51,47,0)', 'rgba(26,51,47,0.04)', 'rgba(26,51,47,0.2)', 'rgba(26,51,47,0.68)', blendColor]
    : ['rgba(248,246,241,0)', 'rgba(248,246,241,0.04)', 'rgba(248,246,241,0.2)', 'rgba(248,246,241,0.68)', blendColor]

  return (
    <SafeAreaView style={[styles.safeArea, surfaceStyle]} testID="worker-v5-screen-1.1-worker-home">
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.scrollContent, { minHeight }]}
        onScroll={onDockScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="worker-home-rebuild-scroll"
      >
        <View style={[styles.content, { maxWidth: contentWidth }]} testID="worker-home-rebuild-surface">
          <View style={styles.header} testID="worker-home-rebuild-header">
            <View testID="worker-v5-home-header">
              <Text style={[styles.headerTitle, isDark ? styles.headerTitleDark : null]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.84}>
                {textByLanguage(language, `Chào buổi sáng, ${displayName}!`, `Good morning, ${displayName}!`)}
              </Text>
            </View>
          </View>

          <WorkerV5AvailabilityCard
            availabilityGuardReady={runtime.workerJobsHydrated}
            avatarPresentation="profile"
            avatarUploadBusy={avatarUploadBusy}
            hasActiveJob={runtime.workerJobs.some((job) => isWorkerOperationalJobStatus(job.status))}
            key={profile?.id ?? 'worker-profile-loading'}
            language={language}
            onPickAvatar={onPickAvatar}
            onOpenProfileSetup={() => openScreen(getWorkerV5Screen('5.7-verification-documents'))}
            onToggleAvailability={runtime.actions.workerUpdateAvailability}
            profile={profile}
            avatarUrl={profile?.avatar_url}
            reduceMotion={glass.reduceMotion}
            reduceTransparency={glass.reduceTransparency}
            themeMode={themeMode}
          />

          <View
            style={[
              styles.hero,
              isDark ? styles.heroDark : null,
              glass.reduceTransparency ? (isDark ? styles.heroOpaqueDark : styles.heroOpaque) : null,
            ]}
            testID="worker-v5-home-command-center"
          >
            <View style={styles.heroArtworkFrame} pointerEvents="none">
              <Image accessibilityIgnoresInvertColors contentFit="cover" source={workart.hero} style={styles.heroArtwork} />
            </View>
            <View
              style={[
                styles.statGrid,
                isDark ? styles.statGridDark : null,
                glass.reduceTransparency ? (isDark ? styles.statGridOpaqueDark : styles.statGridOpaque) : null,
              ]}
              testID="worker-home-rebuild-stat-grid"
            >
              {stats.map((item, index) => (
                <View
                  accessible
                  key={item.label}
                  accessibilityLabel={`${item.value}. ${item.label}`}
                  style={[styles.stat, index > 0 ? (isDark ? styles.statDividerDark : styles.statDivider) : null]}
                  testID={`worker-v5-home-stat-${item.label}`}
                >
                  <Text style={[styles.statLabel, isDark ? styles.statLabelDark : null]} numberOfLines={2}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <WorkerV5SectionHeader
            action={textByLanguage(language, 'Được cá nhân hóa', 'Personalized')}
            title={textByLanguage(language, 'Hành động nhanh', 'Quick actions')}
          />
          <View style={[styles.quickGrid, { gap: gridGap }]} testID="worker-home-rebuild-quick-action-grid">
            {quickActions.map((item, index) => (
              <Pressable
                accessibilityLabel={`${item.title}. ${item.meta}`}
                accessibilityRole="button"
                key={item.title}
                onPress={() => openScreen(getWorkerV5Screen(item.targetId))}
                style={({ pressed }) => [
                  styles.quickCard,
                  isDark ? styles.quickCardDark : null,
                  glass.reduceTransparency ? (isDark ? styles.quickCardOpaqueDark : styles.quickCardOpaque) : null,
                  { width: quickCardWidth },
                  pressed && !glass.reduceMotion ? styles.quickCardPressed : null,
                ]}
                testID={`worker-v5-quick-action-${index}`}
              >
                <View style={styles.quickArtworkFrame} pointerEvents="none">
                  <Image accessibilityIgnoresInvertColors contentFit="cover" source={item.art} style={styles.quickArtwork} />
                  {!glass.reduceTransparency ? (
                    <View style={styles.quickArtworkBlend}>
                      <SvgBlendGradient index={index} stops={blendStops} />
                    </View>
                  ) : null}
                </View>
                <View style={styles.quickCopy} testID={`worker-v5-home-quick-action-detail-${index}`}>
                  <Text
                    adjustsFontSizeToFit
                    minimumFontScale={0.84}
                    numberOfLines={2}
                    style={[styles.quickTitle, isDark ? styles.quickTitleDark : null]}
                  >
                    {item.title}
                  </Text>
                  {item.details.map((detail) => (
                    <View key={detail} style={styles.detailRow}>
                      <View style={styles.detailDot} />
                      <Text
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                        numberOfLines={1}
                        style={[styles.detailText, isDark ? styles.detailTextDark : null]}
                      >
                        {detail}
                      </Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function SvgBlendGradient({ index, stops }: { index: number; stops: readonly string[] }) {
  return (
    <SvgBlendRoot>
      <Defs>
        <LinearGradient id={`worker-home-rebuild-quick-blend-${index}`} x1="0%" x2="100%" y1="50%" y2="50%">
          {stops.map((stopColor, stopIndex) => <Stop key={`${index}-${stopIndex}`} offset={String(stopIndex / (stops.length - 1))} stopColor={stopColor} />)}
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#worker-home-rebuild-quick-blend-${index})`} height="100" width="100" x="0" y="0" />
    </SvgBlendRoot>
  )
}

function SvgBlendRoot({ children }: { children: ReactNode }) {
  return <Svg height="100%" style={StyleSheet.absoluteFill} viewBox="0 0 100 100" width="100%">{children}</Svg>
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    gap: 12,
    paddingBottom: 120,
    paddingTop: 12,
    width: '100%',
  },
  detailDot: {
    backgroundColor: color.brand.primary,
    borderRadius: 3,
    height: 5,
    marginRight: 6,
    width: 5,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 16,
  },
  detailText: {
    color: color.text.secondary,
    flex: 1,
    ...typography.caption2,
    fontWeight: '600',
  },
  detailTextDark: {
    color: '#D9E8E3',
  },
  header: {
    minHeight: 42,
    paddingHorizontal: 2,
  },
  headerTitle: {
    color: color.text.strong,
    ...typography.title1,
    fontWeight: '600',
  },
  headerTitleDark: {
    color: '#F1F6F4',
  },
  hero: {
    backgroundColor: 'rgba(226, 250, 245, 0.24)',
    borderColor: 'rgba(255,255,255,0.98)',
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'flex-end',
    minHeight: 184,
    overflow: 'hidden',
    padding: 18,
    position: 'relative',
    ...shadow.raised,
  },
  heroArtwork: {
    height: '100%',
    opacity: 0.96,
    width: '100%',
  },
  heroArtworkFrame: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  heroDark: {
    backgroundColor: 'rgba(18,39,36,0.92)',
    borderColor: 'rgba(169,213,204,0.35)',
  },
  heroOpaque: {
    backgroundColor: color.mint.white,
  },
  heroOpaqueDark: {
    backgroundColor: '#1A332F',
  },
  quickArtwork: {
    height: '100%',
    opacity: 0.84,
    position: 'absolute',
    left: 0,
    top: 0,
    width: '60%',
  },
  quickArtworkBlend: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: '8%',
    top: 0,
    zIndex: 1,
  },
  quickArtworkFrame: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  quickCard: {
    backgroundColor: '#f8f6f1',
    borderColor: 'rgba(255,255,255,0.98)',
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 132,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  quickCardDark: {
    backgroundColor: '#1A332F',
    borderColor: 'rgba(169,213,204,0.35)',
  },
  quickCardOpaque: {
    backgroundColor: color.mint.white,
  },
  quickCardOpaqueDark: {
    backgroundColor: '#1A332F',
  },
  quickCardPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }],
  },
  quickCopy: {
    bottom: 0,
    flexDirection: 'column',
    gap: 6,
    justifyContent: 'space-between',
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 14,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '40%',
    zIndex: 2,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  quickTitle: {
    color: color.text.strong,
    ...typography.subheadline,
    fontWeight: '600',
  },
  quickTitleDark: {
    color: '#F1F6F4',
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    position: 'relative',
    zIndex: 1,
  },
  scrollContent: {
    alignItems: 'stretch',
    paddingHorizontal: 16,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 8,
  },
  statDivider: {
    borderLeftColor: 'rgba(112,176,166,0.22)',
    borderLeftWidth: 1,
  },
  statDividerDark: {
    borderLeftColor: 'rgba(169,213,204,0.28)',
  },
  statGrid: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(255,255,255,0.84)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingVertical: 8,
    position: 'relative',
    zIndex: 1,
  },
  statGridDark: {
    backgroundColor: 'rgba(23,49,45,0.92)',
    borderColor: 'rgba(169,213,204,0.32)',
  },
  statGridOpaque: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
  },
  statGridOpaqueDark: {
    backgroundColor: '#1A332F',
    borderColor: 'rgba(169,213,204,0.32)',
  },
  statLabel: {
    color: color.text.primary,
    ...typography.caption2,
    fontWeight: '600',
    textAlign: 'center',
  },
  statLabelDark: {
    color: '#A9B7B3',
  },
  text: {
    ...typography.body,
  },
})
