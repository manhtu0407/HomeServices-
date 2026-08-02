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
import type { WorkerProfileResponse } from '@/lib/api-types'

import { textByLanguage } from '../ui/format'
import { useWorkerThemeMode } from '../worker-theme'
import { styles } from './header-styles'

type WorkerV5ProfileHeaderProfile = WorkerProfileResponse | null | undefined
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
  const isDark = useWorkerThemeMode() === 'dark'
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
    <View style={[styles.profileHeader, isDark ? styles.profileHeaderDark : null, reduceTransparency && !isDark ? styles.opaqueCard : null]} testID="worker-v5-worker-avatar">
      {!reduceTransparency && !isDark ? <HeroAura testID="worker-v5-profile-mint-aura" /> : null}
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
          isDark ? styles.profileAvatarDark : null,
          pressed && !reduceMotion ? styles.profileAvatarPressed : null,
        ]}
        testID="worker-v5-profile-avatar-picker"
      >
        {!reduceTransparency && !isDark ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
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
            <Text style={[styles.profileAvatarAddGlyph, isDark ? styles.profileAvatarAddGlyphDark : null]}>＋</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.profileHeaderText}>
        <Text style={[styles.profileHeaderName, isDark ? styles.profileHeaderNameDark : null]} numberOfLines={1} testID="worker-v5-profile-header-name">{name}</Text>
        <View
          accessibilityLabel={lifetimeLabel}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: WORKER_LIFETIME_MAX_MINUTES, now: activeMinutes, text: lifetimeValueText }}
          style={[styles.profileProgressTrack, isDark ? styles.profileProgressTrackDark : null]}
          testID="worker-v5-profile-lifetime-progress"
        >
          <Animated.View
            style={[styles.profileProgressFill, progressStyle]}
            testID="worker-v5-profile-lifetime-progress-fill"
          />
        </View>
        <Text style={[styles.profileHeaderMeta, isDark ? styles.profileHeaderMetaDark : null]} numberOfLines={2} testID="worker-v5-profile-lifetime-progress-label">{lifetimeLabel}</Text>
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
