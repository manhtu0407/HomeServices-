import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Image } from 'expo-image'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
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

import { CaseWideMintAura, SourceCardSkin, ZipMintAura } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { customerV21ServiceCopy } from './copy'
import { initialsForName } from './profile-display-model'
import { ServiceHistoryFilterRail, type HistoryFilter } from './service-history-filter-rail'
import { AssetTile, EmptyState, V21Card, V21Screen, V21TopBar, useCustomerV21SurfaceTheme } from './shared-surfaces'
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

function HistoryCardAura({
  dark,
  scope,
  testIDPrefix,
}: {
  dark: boolean
  scope: string
  testIDPrefix: string
}) {
  return (
    <>
      {dark ? null : <SourceCardSkin testID={`${testIDPrefix}-card-skin`} />}
      <CaseWideMintAura scope={`${scope}Wide`} testID={`${testIDPrefix}-wide-mint-aura`} />
      <ZipMintAura scope={`${scope}Fine`} testID={`${testIDPrefix}-mint-aura`} />
    </>
  )
}

export function CustomerServiceHistorySurface({
  onBack,
  onOpenDetail,
  onRebook,
}: {
  onBack: () => void
  onOpenDetail: (item: CustomerServiceHistoryItem) => void
  onRebook: (item: CustomerServiceHistoryItem) => void
}) {
  const language = useAppLanguage()
  const { mode, reduceMotion, tokens } = useCustomerV21SurfaceTheme()
  const { width: viewportWidth } = useWindowDimensions()
  const contentWidth = Math.max(0, Math.min(viewportWidth - 32, 560))
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [items, setItems] = useState<CustomerServiceHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [supportingJobId, setSupportingJobId] = useState<string | null>(null)
  const [favoriteWorkerIdsInFlight, setFavoriteWorkerIdsInFlight] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const result = await jobService.listMyServiceHistory()
      if (!result.success) {
        setItems([])
        setLoadFailed(true)
        return
      }
      setItems(result.data.service_history)
    } catch {
      setItems([])
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
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
    setFavoriteWorkerIdsInFlight((current) => new Set(current).add(worker.id))
    setItems((current) => current.map((historyItem) => (
      historyItem.worker?.id === worker.id
        ? { ...historyItem, worker: { ...historyItem.worker, is_favorite: nextFavorite } }
        : historyItem
    )))

    try {
      const result = await jobService.setFavoriteWorker(worker.id, nextFavorite)
      if (!result.success) throw new Error('favorite_worker_update_failed')
    } catch {
      setItems((current) => current.map((historyItem) => (
        historyItem.worker?.id === worker.id
          ? { ...historyItem, worker: { ...historyItem.worker, is_favorite: worker.is_favorite } }
          : historyItem
      )))
      Alert.alert(
        language === 'vi' ? 'Chưa cập nhật được thợ đã lưu' : 'Saved worker was not updated',
        language === 'vi' ? 'Vui lòng thử lại khi kết nối ổn định hơn.' : 'Please try again when your connection is stable.',
      )
    } finally {
      setFavoriteWorkerIdsInFlight((current) => {
        const next = new Set(current)
        next.delete(worker.id)
        return next
      })
    }
  }

  const submitSupport = async (item: CustomerServiceHistoryItem) => {
    setSupportingJobId(item.id)
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
      setSupportingJobId(null)
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
      <V21TopBar
        onBack={onBack}
        subtitle={language === 'vi' ? 'Lịch sử dịch vụ và thợ bạn đã lưu' : 'Service history and your saved workers'}
        title={language === 'vi' ? 'Hoạt động' : 'Activity'}
      />

      <View style={styles.historySectionHeader}>
        <Text style={[styles.historySectionTitle, { color: tokens.text }]} testID="customer-v21-history-title">
          {language === 'vi' ? 'Hoạt động gần đây' : 'Recent activity'}
        </Text>
        <Text style={[styles.historyCount, { color: tokens.muted }]}>
          {items.length > 0 ? `${items.length}` : ''}
        </Text>
      </View>

      <ServiceHistoryFilterRail onSelect={setFilter} selected={filter} />

      <View style={[styles.savedWorkerHint, styles.historyAuraCard, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
        <HistoryCardAura dark={mode === 'dark'} scope="HistorySavedHint" testIDPrefix="customer-v21-history-saved-hint" />
        <View style={styles.savedWorkerHintContent}>
          <Text style={[styles.savedWorkerHintIcon, { color: tokens.primary }]}>★</Text>
          <Text style={[styles.savedWorkerHintText, { color: tokens.muted }]}>
            {language === 'vi'
              ? 'Thợ đã lưu được Kael ưu tiên khi tìm thợ cho lần tiếp theo.'
              : 'Kael prioritizes saved workers during your next worker search.'}
          </Text>
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
        <V21Card style={styles.historyAuraCard} testID="customer-v21-history-error">
          <HistoryCardAura dark={mode === 'dark'} scope="HistoryError" testIDPrefix="customer-v21-history-error" />
          <View style={styles.historyAuraStack}>
            <Text style={[styles.historyItemTitle, { color: tokens.text }]}>{language === 'vi' ? 'Chưa tải được lịch sử dịch vụ' : 'Service history is unavailable'}</Text>
            <KaelButton label={language === 'vi' ? 'Thử lại' : 'Try again'} onPress={() => void load()} size="small" testID="customer-v21-history-retry" variant="secondary" />
          </View>
        </V21Card>
      ) : (
        <View style={styles.historyList} testID="customer-v21-history-list">
          {visibleItems.length === 0 ? (
            <EmptyState
              assetTile={AssetTile}
              body={filter === 'all'
                ? (language === 'vi' ? 'Chưa có dịch vụ đã hoàn tất hoặc đã hủy.' : 'There are no completed or cancelled services yet.')
                : (language === 'vi' ? 'Không có dịch vụ phù hợp với bộ lọc này.' : 'No services match this filter.')}
              image={customerV21Assets.activity}
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
      style={[styles.historyCard, styles.historyAuraCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID={`customer-v21-history-item-${item.id}`}
    >
      <HistoryCardAura
        dark={tokens.mode === 'dark'}
        scope={`HistoryItem${item.id.replace(/[^a-zA-Z0-9]/g, '')}`}
        testIDPrefix={`customer-v21-history-item-${item.id}`}
      />
      <View style={styles.historyCardContent}>
        <View style={styles.historyItemHeader}>
          <Text style={[styles.historyItemMeta, { color: tokens.muted }]}>
            {customerV21ServiceCopy[language][item.service_type].label} · {historyTimeLabel(item.ended_at, language)}
          </Text>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: status.tone === 'completed' ? tokens.service : tokens.ghost },
            ]}
          >
            <Text style={[styles.statusPillText, { color: status.tone === 'completed' ? tokens.primary : tokens.muted }]}>{status.label}</Text>
          </View>
        </View>

        {completed ? (
          item.worker ? (
            <View style={styles.workerRow}>
              {item.worker.avatar_url ? (
                <Image accessibilityIgnoresInvertColors contentFit="cover" source={{ uri: item.worker.avatar_url }} style={styles.workerAvatar} />
              ) : (
                <View style={[styles.workerAvatar, styles.workerAvatarFallback, { backgroundColor: tokens.service }]}>
                  <Text style={[styles.workerAvatarText, { color: tokens.primary }]}>{initialsForName(workerName)}</Text>
                </View>
              )}
              <View style={styles.workerCopy}>
                <Text style={[styles.workerEyebrow, { color: tokens.muted }]}>{language === 'vi' ? 'Thợ đã thực hiện' : 'Completed by'}</Text>
                <Text numberOfLines={1} style={[styles.workerName, { color: tokens.text }]}>{workerName}</Text>
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
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (reduceMotion) {
      scale.value = 1
      return
    }
    scale.value = withSequence(
      withSpring(selected ? 1.18 : 0.9, motionTokens.liquid.press),
      withSpring(1, motionTokens.liquid.press),
    )
  }, [reduceMotion, scale, selected])
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
        onPress={onPress}
        style={[
          styles.favoriteButton,
          {
            backgroundColor: selected ? tokens.service : tokens.ghost,
            borderColor: selected ? tokens.primary : tokens.border,
          },
        ]}
        testID={testID}
      >
        {busy ? (
          <ActivityIndicator color={tokens.primary} size="small" />
        ) : (
          <Text style={[styles.favoriteIcon, { color: selected ? tokens.primary : tokens.muted }]}>{selected ? '★' : '☆'}</Text>
        )}
      </Pressable>
    </Animated.View>
  )
}
