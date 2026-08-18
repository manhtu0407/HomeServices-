import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { Image } from 'expo-image'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import Svg, { Circle, G, Path } from 'react-native-svg'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated'

import { KaelButton } from '@/components/ui/kael-primitives'
import { motionTokens } from '@/components/ui/motion-tokens'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'
import type { CustomerServiceHistoryItem } from '@/lib/api-types'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { formatVnd } from '@/lib/format'
import { jobService } from '@/lib/services'

import { CaseWideMintAura, SourceCardSkin, ZipMintAura } from '../ui/aura-surfaces'
import { customerV21Assets } from '../ui/assets'
import { customerV21ServiceCopy } from '../ui/copy'
import { ProfileSettingsGlyph } from '../profile/profile-settings-icons'
import { ServiceHistoryFilterRail, type HistoryFilter } from './service-history-filter-rail'
import { customerV21SharedStyles as sharedStyles } from '../ui/shared-styles'
import { AssetTile, EmptyState, V21Card, V21Screen, useCustomerV21SurfaceTheme } from '../ui/shared-surfaces'
import { customerV21ServiceHistoryStyles as styles } from './service-history-styles'

const historyDayFormatters = {
  en: new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
  vi: new Intl.DateTimeFormat('vi-VN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
} satisfies Record<AppLanguage, Intl.DateTimeFormat>

const historyTimeFormatters = {
  en: new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }),
  vi: new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }),
} satisfies Record<AppLanguage, Intl.DateTimeFormat>

const savedWorkerStarPath = 'M12 2.9 14.83 8.64l6.34.92-4.59 4.48 1.08 6.32L12 17.38l-5.66 2.98 1.08-6.32-4.59-4.48 6.34-.92L12 2.9Z'

type HistoryState = {
  favoriteWorkerIdsInFlight: Set<string>
  filter: HistoryFilter
  items: CustomerServiceHistoryItem[]
  loadFailed: boolean
  loading: boolean
  supportingJobId: string | null
}

type HistoryAction =
  | { type: 'filter'; filter: HistoryFilter }
  | { type: 'load_start' }
  | { type: 'load_success'; items: CustomerServiceHistoryItem[] }
  | { type: 'load_failure' }
  | { type: 'favorite_start'; workerId: string }
  | { type: 'favorite_change'; workerId: string; isFavorite: boolean }
  | { type: 'favorite_finish'; workerId: string }
  | { type: 'supporting'; jobId: string | null }

const initialHistoryState: HistoryState = {
  favoriteWorkerIdsInFlight: new Set(),
  filter: 'all',
  items: [],
  loadFailed: false,
  loading: true,
  supportingJobId: null,
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'filter':
      return { ...state, filter: action.filter }
    case 'load_start':
      return { ...state, loadFailed: false, loading: true }
    case 'load_success':
      return { ...state, items: action.items, loadFailed: false, loading: false }
    case 'load_failure':
      return { ...state, items: [], loadFailed: true, loading: false }
    case 'favorite_start':
      return { ...state, favoriteWorkerIdsInFlight: new Set(state.favoriteWorkerIdsInFlight).add(action.workerId) }
    case 'favorite_change':
      return {
        ...state,
        items: state.items.map((item) => (
          item.worker?.id === action.workerId
            ? { ...item, worker: { ...item.worker, is_favorite: action.isFavorite } }
            : item
        )),
      }
    case 'favorite_finish': {
      const favoriteWorkerIdsInFlight = new Set(state.favoriteWorkerIdsInFlight)
      favoriteWorkerIdsInFlight.delete(action.workerId)
      return { ...state, favoriteWorkerIdsInFlight }
    }
    case 'supporting':
      return { ...state, supportingJobId: action.jobId }
  }
}

function isCompletedHistoryItem(item: CustomerServiceHistoryItem) {
  return item.status === 'paid' || item.status === 'reviewed'
}

function historyStatus(item: CustomerServiceHistoryItem, language: AppLanguage) {
  if (item.status === 'cancelled') {
    return { label: language === 'vi' ? 'Đã hủy' : 'Cancelled', tone: 'cancelled' as const }
  }
  return { label: language === 'vi' ? 'Đã hoàn tất' : 'Completed', tone: 'completed' as const }
}

function historyDayKey(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function historyDayLabel(value: string, language: AppLanguage) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return language === 'vi' ? 'Chưa có ngày ghi nhận' : 'Date unavailable'

  const today = new Date()
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDifference = Math.round((startToday - startDate) / 86_400_000)
  if (dayDifference === 0) return language === 'vi' ? 'Hôm nay' : 'Today'
  if (dayDifference === 1) return language === 'vi' ? 'Hôm qua' : 'Yesterday'

  return historyDayFormatters[language].format(date)
}

function historyTimeLabel(value: string, language: AppLanguage) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return language === 'vi' ? 'Chưa có giờ' : 'Time unavailable'
  return historyTimeFormatters[language].format(date)
}

function groupHistoryItems(items: CustomerServiceHistoryItem[], language: AppLanguage) {
  const grouped = new Map<string, { key: string; label: string; items: CustomerServiceHistoryItem[] }>()
  const sorted = [...items].sort((left, right) => Date.parse(right.ended_at) - Date.parse(left.ended_at))
  for (const item of sorted) {
    const key = historyDayKey(item.ended_at)
    const existing = grouped.get(key)
    if (existing) {
      existing.items.push(item)
    } else {
      grouped.set(key, { key, label: historyDayLabel(item.ended_at, language), items: [item] })
    }
  }
  return Array.from(grouped.values())
}

function HistoryCardSkin({
  dark,
  testIDPrefix,
}: {
  dark: boolean
  testIDPrefix: string
}) {
  return dark ? null : <SourceCardSkin testID={`${testIDPrefix}-card-skin`} />
}

function HistoryCardAura({
  dark,
  softenTopRight = false,
  scope,
  testIDPrefix,
}: {
  dark: boolean
  softenTopRight?: boolean
  scope: string
  testIDPrefix: string
}) {
  return (
    <>
      <HistoryCardSkin dark={dark} testIDPrefix={testIDPrefix} />
      <CaseWideMintAura
        intensity={softenTopRight ? 'soft' : 'default'}
        scope={`${scope}Wide`}
        testID={`${testIDPrefix}-wide-mint-aura`}
      />
      <ZipMintAura
        intensity={softenTopRight ? 'soft' : 'default'}
        scope={`${scope}Fine`}
        testID={`${testIDPrefix}-mint-aura`}
      />
    </>
  )
}

export function CustomerServiceHistorySurface({
  onOpenDetail,
  onRebook,
}: {
  onOpenDetail: (item: CustomerServiceHistoryItem) => void
  onRebook: (item: CustomerServiceHistoryItem) => void
}) {
  const language = useAppLanguage()
  const { mode, reduceMotion, tokens } = useCustomerV21SurfaceTheme()
  const { width: viewportWidth } = useWindowDimensions()
  const contentWidth = Math.max(0, Math.min(viewportWidth - 32, 560))
  const [historyState, dispatch] = useReducer(historyReducer, initialHistoryState)
  const { favoriteWorkerIdsInFlight, filter, items, loadFailed, loading, supportingJobId } = historyState

  const load = useCallback(async () => {
    dispatch({ type: 'load_start' })
    try {
      const result = await jobService.listMyServiceHistory()
      if (!result.success) {
        dispatch({ type: 'load_failure' })
        return
      }
      dispatch({ type: 'load_success', items: result.data.service_history })
    } catch {
      dispatch({ type: 'load_failure' })
    }
  }, [])

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void load()
    }, 0)
    return () => clearTimeout(initialLoad)
  }, [load])

  const visibleItems = useMemo(() => {
    if (filter === 'all') return items
    if (filter === 'saved') return items.filter((item) => item.worker?.is_favorite)
    return items.filter((item) => item.service_type === filter)
  }, [filter, items])
  const groupedItems = useMemo(() => groupHistoryItems(visibleItems, language), [language, visibleItems])

  const toggleFavorite = async (item: CustomerServiceHistoryItem) => {
    const worker = item.worker
    if (!worker || favoriteWorkerIdsInFlight.has(worker.id)) return
    const nextFavorite = !worker.is_favorite
    dispatch({ type: 'favorite_start', workerId: worker.id })
    dispatch({ type: 'favorite_change', workerId: worker.id, isFavorite: nextFavorite })

    try {
      const result = await jobService.setFavoriteWorker(worker.id, nextFavorite)
      if (!result.success) throw new Error('favorite_worker_update_failed')
    } catch {
      dispatch({ type: 'favorite_change', workerId: worker.id, isFavorite: worker.is_favorite })
      Alert.alert(
        language === 'vi' ? 'Chưa cập nhật được thợ đã lưu' : 'Saved worker was not updated',
        language === 'vi' ? 'Vui lòng thử lại khi kết nối ổn định hơn.' : 'Please try again when your connection is stable.',
      )
    } finally {
      dispatch({ type: 'favorite_finish', workerId: worker.id })
    }
  }

  const submitSupport = async (item: CustomerServiceHistoryItem) => {
    dispatch({ type: 'supporting', jobId: item.id })
    try {
      const result = await jobService.openDispute(item.id, {
        dispute_type: 'other',
        evidence_photo_urls: [],
        initiator_statement: 'Khách hàng cần hỗ trợ sau dịch vụ.',
      })
      if (!result.success) {
        Alert.alert(
          language === 'vi' ? 'Chưa mở được yêu cầu' : 'Support request not opened',
          language === 'vi' ? 'Vui lòng thử lại sau.' : 'Please try again later.',
        )
        return
      }
      Alert.alert(
        language === 'vi' ? 'Đã gửi yêu cầu hỗ trợ' : 'Support request sent',
        language === 'vi'
          ? 'NestScout sẽ lưu bằng chứng hiện có để đội ngũ xem xét. Chưa có thay đổi nào với thanh toán.'
          : 'NestScout will preserve the current evidence for review. No payment has changed.',
      )
    } catch {
      Alert.alert(
        language === 'vi' ? 'Chưa mở được yêu cầu' : 'Support request not opened',
        language === 'vi' ? 'Vui lòng thử lại sau.' : 'Please try again later.',
      )
    } finally {
      dispatch({ type: 'supporting', jobId: null })
    }
  }

  const confirmSupport = (item: CustomerServiceHistoryItem) => {
    Alert.alert(
      language === 'vi' ? 'Hỗ trợ sau dịch vụ' : 'After-service support',
      language === 'vi'
        ? 'NestScout sẽ mở yêu cầu để đội ngũ xem lại công việc này. Chưa có thay đổi nào với thanh toán.'
        : 'NestScout will open a request for this job to be reviewed. No payment has changed.',
      [
        { text: language === 'vi' ? 'Để sau' : 'Not now', style: 'cancel' },
        { text: language === 'vi' ? 'Mở yêu cầu hỗ trợ' : 'Open support request', onPress: () => void submitSupport(item) },
      ],
    )
  }

  return (
    <V21Screen screenId="2.6-case-overview" testID="customer-v21-activity">
      <View style={[styles.screenContent, { width: contentWidth }]}>
      <View style={styles.historySectionHeader}>
        <Text style={[sharedStyles.screenTitle, { color: tokens.text }]} testID="customer-v21-history-title">
          {language === 'vi' ? 'Hoạt động gần đây' : 'Recent activity'}
        </Text>
        <Text style={[styles.historyCount, { color: tokens.muted }]}>
          {items.length > 0 ? `${items.length}` : ''}
        </Text>
      </View>

      <ServiceHistoryFilterRail onSelect={(nextFilter) => dispatch({ type: 'filter', filter: nextFilter })} selected={filter} />

      <View style={[styles.savedWorkerHint, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
        <View style={styles.savedWorkerHintContent}>
          <View
            accessible={false}
            style={[styles.savedWorkerHintIconTile, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
            testID="customer-v21-history-saved-hint-star-tile"
          >
            <SavedWorkerStarMark color={tokens.primary} outline={tokens.text} />
          </View>
          <View style={styles.savedWorkerHintCopy}>
            <Text style={[styles.savedWorkerHintTitle, { color: tokens.text }]}>
              {language === 'vi' ? 'Thợ đã lưu' : 'Saved workers'}
            </Text>
            <Text style={[styles.savedWorkerHintText, { color: tokens.muted }]}>
              {language === 'vi'
                ? 'Kael sẽ ưu tiên họ trong lần tìm tiếp theo.'
                : 'Kael will prioritize them in your next worker search.'}
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <V21Card style={[styles.loadingCard, styles.historyAuraCard]} testID="customer-v21-history-loading">
          <HistoryCardAura dark={mode === 'dark'} scope="HistoryLoading" testIDPrefix="customer-v21-history-loading" />
          <View style={styles.loadingCardContent}>
            <ActivityIndicator color={tokens.primary} />
            <Text style={[styles.loadingText, { color: tokens.muted }]}>{language === 'vi' ? 'Đang tải hoạt động…' : 'Loading activity…'}</Text>
          </View>
        </V21Card>
      ) : loadFailed ? (
        <V21Card
          style={[
            styles.historyAuraCard,
            styles.historyErrorCard,
            { backgroundColor: tokens.raised, borderColor: tokens.border },
          ]}
          testID="customer-v21-history-error"
        >
          <HistoryCardAura
            dark={mode === 'dark'}
            scope="HistoryError"
            softenTopRight
            testIDPrefix="customer-v21-history-error"
          />
          <View style={styles.historyErrorContent}>
            <Image
              accessibilityIgnoresInvertColors
              accessible={false}
              contentFit="contain"
              source={customerV21Assets.historyErrorWorkart}
              style={[styles.historyErrorIllustration, mode === 'dark' ? styles.historyErrorIllustrationDark : null]}
              testID="customer-v21-history-error-workart"
            />
            <View style={styles.historyErrorIconFrame} testID="customer-v21-history-error-icon">
              <HistoryErrorIcon color={tokens.primary} />
            </View>
            <Text style={[styles.historyErrorTitle, { color: tokens.text }]} testID="customer-v21-history-error-title">
              {language === 'vi' ? 'Chưa tải được lịch sử dịch vụ' : 'Service history is unavailable'}
            </Text>
            <Text style={[styles.historyErrorBody, { color: tokens.muted }]} testID="customer-v21-history-error-body">
              {language === 'vi'
                ? 'Không thể tải lịch sử dịch vụ lúc này. Vui lòng kiểm tra kết nối và thử lại.'
                : 'Service history could not load right now. Check your connection and try again.'}
            </Text>
            <KaelButton
              label={language === 'vi' ? 'THỬ LẠI' : 'TRY AGAIN'}
              leftAdornment={<HistoryRefreshIcon color={tokens.primary} />}
              onPress={() => void load()}
              size="small"
              style={[styles.historyErrorRetry, { borderColor: tokens.primary, backgroundColor: tokens.raised }]}
              testID="customer-v21-history-retry"
              textStyle={{ color: tokens.primary, fontWeight: '400' }}
              variant="secondary"
            />
          </View>
        </V21Card>
      ) : (
        <View style={styles.historyList} testID="customer-v21-history-list">
          {visibleItems.length === 0 ? (
            <EmptyState
              assetSize={76}
              assetTile={AssetTile}
              bareAsset
              body={filter === 'all'
                ? (language === 'vi' ? 'Chưa có dịch vụ đã hoàn tất hoặc đã hủy.' : 'There are no completed or cancelled services yet.')
                : (language === 'vi' ? 'Không có dịch vụ phù hợp với bộ lọc này.' : 'No services match this filter.')}
              formulaMintAura
              image={customerV21Assets.activityEmpty}
              testID="customer-v21-history-empty"
              title={language === 'vi' ? 'Chưa có hoạt động' : 'No activity yet'}
            />
          ) : groupedItems.map((group, groupIndex) => (
            <ReduceMotionAwareEntranceView
              delayMs={Math.min(groupIndex, 2) * 45}
              distanceY={8}
              key={group.key}
              style={styles.historyGroup}
              testID={`customer-v21-history-group-${group.key}`}
            >
              <Text style={[styles.historyGroupLabel, { color: tokens.muted }]}>{group.label}</Text>
              <View style={styles.historyGroupItems}>
                {group.items.map((item) => (
                  <HistoryDealCard
                    favoriteBusy={Boolean(item.worker && favoriteWorkerIdsInFlight.has(item.worker.id))}
                    item={item}
                    key={item.id}
                    language={language}
                    onOpenDetail={() => onOpenDetail(item)}
                    onRebook={() => onRebook(item)}
                    onSupport={() => confirmSupport(item)}
                    onToggleFavorite={() => void toggleFavorite(item)}
                    reduceMotion={reduceMotion}
                    supportBusy={supportingJobId === item.id}
                    tokens={tokens}
                  />
                ))}
              </View>
            </ReduceMotionAwareEntranceView>
          ))}
        </View>
      )}
      </View>
    </V21Screen>
  )
}

function HistoryErrorIcon({ color }: { color: string }) {
  return (
    <Svg height={42} viewBox="0 0 48 48" width={42}>
      <Path
        d="M14.2 35.8h19.6a7.7 7.7 0 0 0 1.5-15.25A11.45 11.45 0 0 0 13.6 18.2 8.9 8.9 0 0 0 14.2 35.8Z"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.25}
      />
      <Path d="M24 17.4v6.5" stroke={color} strokeLinecap="round" strokeWidth={2.25} />
      <Circle cx={24} cy={28.2} fill={color} r={1.35} />
    </Svg>
  )
}

function HistoryRefreshIcon({ color }: { color: string }) {
  return (
    <Svg height={22} viewBox="0 0 24 24" width={22}>
      <G transform="translate(-1 -2.8)">
        <Path d="M20 11a8 8 0 1 0 1 4.1" fill="none" stroke={color} strokeLinecap="round" strokeWidth={2} />
        <Path d="M20.4 6.8v4.8h-4.8" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </G>
    </Svg>
  )
}

function HistoryDealCard({
  favoriteBusy,
  item,
  language,
  onOpenDetail,
  onRebook,
  onSupport,
  onToggleFavorite,
  reduceMotion,
  supportBusy,
  tokens,
}: {
  favoriteBusy: boolean
  item: CustomerServiceHistoryItem
  language: AppLanguage
  onOpenDetail: () => void
  onRebook: () => void
  onSupport: () => void
  onToggleFavorite: () => void
  reduceMotion: boolean
  supportBusy: boolean
  tokens: ReturnType<typeof useCustomerV21SurfaceTheme>['tokens']
}) {
  const completed = isCompletedHistoryItem(item)
  const status = historyStatus(item, language)
  const workerName = item.worker?.display_name?.trim() || (language === 'vi' ? 'Hồ sơ thợ' : 'Worker profile')

  return (
    <View
      accessibilityLabel={`${customerV21ServiceCopy[language][item.service_type].label}, ${historyTimeLabel(item.ended_at, language)}, ${status.label}`}
      style={[styles.historyCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID={`customer-v21-history-item-${item.id}`}
    >
      <View style={styles.historyCardContent}>
        <View style={styles.historyItemHeader}>
          <View
            style={[styles.stateMark, { backgroundColor: tokens.raised, borderColor: completed ? tokens.text : tokens.border }]}
            testID={`customer-v21-history-item-${item.id}-state-mark`}
          >
            {completed ? <CompletedHistoryMark color={tokens.text} /> : <CancelledHistoryMark color={tokens.muted} />}
          </View>
          <View style={styles.historyMetaCopy}>
            <Text style={[styles.historyItemMeta, { color: tokens.muted }]}>
              {customerV21ServiceCopy[language][item.service_type].label} · {historyTimeLabel(item.ended_at, language)}
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: status.tone === 'completed' ? tokens.service : tokens.raised,
                borderColor: status.tone === 'completed' ? tokens.primary : tokens.border,
              },
            ]}
            testID={`customer-v21-history-item-${item.id}-status`}
          >
            <Text style={[styles.statusPillText, { color: status.tone === 'completed' ? tokens.primary : tokens.muted }]}>{status.label}</Text>
          </View>
        </View>

        {completed ? (
          item.worker ? (
            <View style={styles.workerRow} testID={`customer-v21-history-worker-row-${item.id}`}>
              {item.worker.avatar_url ? (
                <Image
                  accessibilityIgnoresInvertColors
                  contentFit="cover"
                  source={{ uri: item.worker.avatar_url }}
                  style={[styles.workerAvatar, { borderColor: tokens.text }]}
                  testID={`customer-v21-history-worker-avatar-${item.id}`}
                />
              ) : (
                <View
                  style={[styles.workerAvatar, styles.workerAvatarFallback, { backgroundColor: tokens.raised, borderColor: tokens.text }]}
                  testID={`customer-v21-history-worker-avatar-${item.id}`}
                >
                  <ProfileSettingsGlyph
                    color={tokens.text}
                    name="personal"
                    testID={`customer-v21-history-worker-avatar-${item.id}-placeholder-icon`}
                  />
                </View>
              )}
              <View style={styles.workerCopy}>
                <Text numberOfLines={1} style={[styles.workerName, { color: tokens.text }]}>{workerName}</Text>
                <Text style={[styles.workerEyebrow, { color: tokens.muted }]}>{language === 'vi' ? 'Thợ đã thực hiện' : 'Completed by'}</Text>
              </View>
              <FavoriteWorkerButton
                busy={favoriteBusy}
                language={language}
                onPress={onToggleFavorite}
                reduceMotion={reduceMotion}
                selected={item.worker.is_favorite}
                testID={`customer-v21-history-favorite-${item.id}`}
                tokens={tokens}
                workerName={workerName}
              />
            </View>
          ) : (
            <Text style={[styles.workerUnavailable, { color: tokens.muted }]}>
              {language === 'vi' ? 'Thông tin thợ chưa khả dụng.' : 'Worker information is unavailable.'}
            </Text>
          )
        ) : null}

        <View style={[styles.divider, { backgroundColor: tokens.border }]} />

        <View style={styles.dealFooter}>
          <View style={styles.priceSlot}>
            {item.final_price !== null ? (
              <>
                <Text style={[styles.priceEyebrow, { color: tokens.muted }]}>{language === 'vi' ? 'Giá cuối' : 'Final price'}</Text>
                <Text style={[styles.priceValue, { color: tokens.text }]}>{formatVnd(item.final_price, language)}</Text>
              </>
            ) : null}
          </View>
          {completed ? (
            <View style={styles.actionRow}>
              <KaelButton
                label={language === 'vi' ? 'Đặt lại' : 'Rebook'}
                onPress={onRebook}
                size="small"
                style={styles.rebookButton}
                testID={`customer-v21-history-rebook-${item.id}`}
                variant="secondary"
              />
              <KaelButton
                label={supportBusy ? (language === 'vi' ? 'Đang gửi' : 'Sending') : (language === 'vi' ? 'Hỗ trợ' : 'Support')}
                loading={supportBusy}
                onPress={onSupport}
                size="small"
                style={styles.supportButton}
                testID={`customer-v21-history-support-${item.id}`}
                variant="ghost"
              />
            </View>
          ) : (
            <KaelButton
              label={language === 'vi' ? 'Xem chi tiết' : 'View details'}
              onPress={onOpenDetail}
              size="small"
              style={styles.detailButton}
              testID={`customer-v21-history-detail-${item.id}`}
              variant="secondary"
            />
          )}
        </View>
      </View>
    </View>
  )
}

function CompletedHistoryMark({ color }: { color: string }) {
  return (
    <Svg fill="none" height={18} viewBox="0 0 24 24" width={18}>
      <Circle cx={12} cy={12} r={8.7} stroke={color} strokeWidth={1.8} />
      <Path d="m8.3 12.1 2.5 2.5 5-5.1" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
    </Svg>
  )
}

function CancelledHistoryMark({ color }: { color: string }) {
  return (
    <Svg fill="none" height={18} viewBox="0 0 24 24" width={18}>
      <Circle cx={12} cy={12} r={8.7} stroke={color} strokeWidth={1.8} />
      <Path d="M8.5 12h7" stroke={color} strokeLinecap="round" strokeWidth={1.8} />
    </Svg>
  )
}

function HistoryStarMark({
  filled,
  fill,
  outline,
  testID,
}: {
  filled: boolean
  fill: string
  outline: string
  testID?: string
}) {
  return (
    <Svg fill="none" height={19} testID={testID} viewBox="0 0 24 24" width={19}>
      <Path
        d={savedWorkerStarPath}
        fill={filled ? fill : 'none'}
        stroke={outline}
        strokeLinejoin="round"
        strokeWidth={filled ? 1.5 : 0.8}
      />
    </Svg>
  )
}

function SavedWorkerStarMark({ color, outline }: { color: string; outline: string }) {
  return <HistoryStarMark fill={color} filled outline={outline} testID="customer-v21-history-saved-hint-star" />
}

function FavoriteWorkerButton({
  busy,
  language,
  onPress,
  reduceMotion,
  selected,
  testID,
  tokens,
  workerName,
}: {
  busy: boolean
  language: AppLanguage
  onPress: () => void
  reduceMotion: boolean
  selected: boolean
  testID: string
  tokens: ReturnType<typeof useCustomerV21SurfaceTheme>['tokens']
  workerName: string
}) {
  const scale = useSharedValue(1)
  const handlePress = () => {
    if (reduceMotion) {
      scale.value = 1
    } else {
      scale.value = withSequence(
        withSpring(selected ? 0.9 : 1.18, motionTokens.liquid.press),
        withSpring(1, motionTokens.liquid.press),
      )
    }
    onPress()
  }
  useEffect(() => () => cancelAnimation(scale), [scale])
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const accessibilityLabel = selected
    ? (language === 'vi' ? `Bỏ lưu thợ ${workerName}` : `Remove saved worker ${workerName}`)
    : (language === 'vi' ? `Lưu thợ ${workerName}` : `Save worker ${workerName}`)

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy, selected }}
        disabled={busy}
        hitSlop={4}
        onPress={handlePress}
        style={[
          styles.favoriteButton,
          {
            backgroundColor: selected ? tokens.service : tokens.raised,
            borderColor: selected ? tokens.primary : tokens.border,
          },
        ]}
        testID={testID}
      >
        {busy ? (
          <ActivityIndicator color={tokens.primary} size="small" />
        ) : (
          <>
            <HistoryStarMark
              fill={tokens.service}
              filled={selected}
              outline={tokens.primary}
              testID={`${testID}-icon`}
            />
            <Text style={[styles.favoriteLabel, { color: tokens.primary }]}>{language === 'vi' ? 'Lưu thợ' : 'Save worker'}</Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  )
}
