import type { ComponentType } from 'react'
import { Image } from 'expo-image'
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'
import Animated, { Easing, useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerPerformanceInsightsResponse, WorkerProfileResponse } from '@/lib/api-types'

import { textByLanguage } from '../ui/format'
import { workerV5HasNumber } from '../ui/performance'
import { styles } from './header-styles'

type WorkerV5ProfileHeaderProfile = WorkerProfileResponse | null | undefined
type WorkerV5ProfileHeaderInsights = WorkerPerformanceInsightsResponse | null | undefined
type WorkerV5HeaderAura = ComponentType<{ testID: string }>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ProfileHeader({
  avatarUploadBusy,
  heroAura: HeroAura,
  language,
  onPickAvatar,
  profile,
  reduceMotion,
  reduceTransparency,
}: {
  avatarUploadBusy: boolean
  heroAura: WorkerV5HeaderAura
  language: AppLanguage
  onPickAvatar: () => void
  profile: WorkerV5ProfileHeaderProfile
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  const legalName = profile?.legal_name?.trim() || ''
  const name = profile
    ? legalName || textByLanguage(language, 'Chưa có tên pháp lý', 'No legal name')
    : textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
  const activeMinutes = clampWorkerActiveMinutes(profile?.active_minutes)
  const lifetimeLabel = textByLanguage(language, 'Thời gian hoạt động', 'Active time')
  const lifetimeValueText = workerLifetimeValueText(activeMinutes, language)
  const targetProgress = activeMinutes / WORKER_LIFETIME_MAX_MINUTES
  const progress = useDerivedValue(() => reduceMotion
    ? targetProgress
    : withTiming(targetProgress, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
      }), [reduceMotion, targetProgress])

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, progress.value)) * 100}%`,
  }))
  return (
    <View style={[styles.profileHeader, reduceTransparency && styles.opaqueCard]} testID="worker-v5-worker-avatar">
      {!reduceTransparency ? <HeroAura testID="worker-v5-profile-mint-aura" /> : null}
      <Pressable
        accessibilityLabel={profile?.avatar_url
          ? textByLanguage(language, 'Đổi ảnh đại diện', 'Change profile photo')
          : textByLanguage(language, 'Thêm ảnh đại diện', 'Add profile photo')}
        accessibilityRole="button"
        accessibilityState={{ busy: avatarUploadBusy, disabled: avatarUploadBusy }}
        disabled={avatarUploadBusy}
        onPress={onPickAvatar}
        style={({ pressed }) => [
          styles.profileAvatar,
          pressed && !reduceMotion ? styles.profileAvatarPressed : null,
        ]}
        testID="worker-v5-profile-avatar-picker"
      >
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        {avatarUploadBusy ? (
          <ActivityIndicator color="#078D7F" size="small" testID="worker-v5-profile-avatar-loading" />
        ) : profile?.avatar_url ? (
          <Image
            contentFit="cover"
            source={{ uri: profile.avatar_url }}
            style={styles.profileAvatarImage}
            testID="worker-v5-profile-avatar-image"
          />
        ) : (
          <View style={styles.profileAvatarEmpty} testID="worker-v5-profile-avatar-empty">
            <Text style={styles.profileAvatarAddGlyph}>＋</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.profileHeaderText}>
        <Text style={styles.profileHeaderName} numberOfLines={1} testID="worker-v5-profile-header-name">{name}</Text>
        <View
          accessibilityLabel={lifetimeLabel}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: WORKER_LIFETIME_MAX_MINUTES, now: activeMinutes, text: lifetimeValueText }}
          style={styles.profileProgressTrack}
          testID="worker-v5-profile-lifetime-progress"
        >
          <Animated.View
            style={[styles.profileProgressFill, progressStyle]}
            testID="worker-v5-profile-lifetime-progress-fill"
          />
        </View>
        <Text style={styles.profileHeaderMeta} numberOfLines={2} testID="worker-v5-profile-lifetime-progress-label">{lifetimeLabel}</Text>
      </View>
    </View>
  )
}

const WORKER_LIFETIME_MAX_MINUTES = 10_000 * 60

function clampWorkerActiveMinutes(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0
  return Math.min(WORKER_LIFETIME_MAX_MINUTES, Math.max(0, Math.trunc(value ?? 0)))
}

function workerLifetimeValueText(activeMinutes: number, language: AppLanguage) {
  const hours = Math.floor(activeMinutes / 60)
  const minutes = activeMinutes % 60
  const elapsed = language === 'vi'
    ? hours > 0
      ? `${hours.toLocaleString('vi-VN')} giờ${minutes > 0 ? ` ${minutes} phút` : ''}`
      : `${minutes} phút`
    : hours > 0
      ? `${hours.toLocaleString('en-US')} hr${hours === 1 ? '' : 's'}${minutes > 0 ? ` ${minutes} min` : ''}`
      : `${minutes} min`
  return textByLanguage(
    language,
    `Thời gian hoạt động: ${elapsed} / 10.000 giờ`,
    `Active time: ${elapsed} / 10,000 hrs`,
  )
}

export function WorkerV5ProfileDashboardCards({
  insights,
  language,
  listAura: ListAura,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5ProfileHeaderInsights
  language: AppLanguage
  listAura: WorkerV5HeaderAura
  profile: WorkerV5ProfileHeaderProfile
  reduceTransparency: boolean
}) {
  const score = insights?.performance_score ?? null
  const rating = insights?.average_rating ?? profile?.rating ?? null
  const hasScore = workerV5HasNumber(score)
  const hasRating = typeof rating === 'number' && Number.isFinite(rating) && rating > 0
  const cards = [
    {
      icon: 'profile' as const,
      score: hasScore ? `${score}` : textByLanguage(language, 'Chờ', 'Pending'),
      scoreLabel: textByLanguage(language, 'xếp hạng', 'ranking'),
      title: hasScore ? textByLanguage(language, 'Điểm xếp hạng', 'Ranking score') : textByLanguage(language, 'Chưa có xếp hạng thật', 'No real ranking yet'),
    },
    {
      icon: 'shield' as const,
      score: hasRating ? `${rating}` : textByLanguage(language, 'Chờ', 'Pending'),
      scoreLabel: textByLanguage(language, 'đánh giá', 'rating'),
      title: hasRating ? textByLanguage(language, 'Độ tin cậy có nguồn', 'Sourced reliability') : textByLanguage(language, 'Chưa có đánh giá thật', 'No real rating yet'),
    },
  ]
  return (
    <View style={styles.profileDashboard} testID="worker-v5-profile-dashboard">
      {cards.map((card, index) => (
        <View key={card.title} style={[styles.profileDashboardCard, reduceTransparency && styles.opaqueCard]} testID={`worker-v5-profile-dashboard-card-${index}`}>
          {!reduceTransparency ? <ListAura testID={`worker-v5-profile-dashboard-mint-aura-${index}`} /> : null}
          <View style={styles.profileDashboardScore}>
            <Text style={styles.profileDashboardScoreValue} numberOfLines={1} testID={`worker-v5-profile-dashboard-score-${index}`}>{card.score}</Text>
            <Text style={styles.profileDashboardScoreLabel} numberOfLines={1} testID={`worker-v5-profile-dashboard-score-label-${index}`}>{card.scoreLabel}</Text>
          </View>
          <View style={styles.profileDashboardCopy}>
            <Text style={styles.profileDashboardTitle} numberOfLines={2} testID={`worker-v5-profile-dashboard-title-${index}`}>{card.title}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}
