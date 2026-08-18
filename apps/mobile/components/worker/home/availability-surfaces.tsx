import { Image } from 'expo-image'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text as RNText, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { motionTokens } from '@/components/ui/motion-tokens'
import { KaelButton } from '@/components/ui/kael-primitives'
import { ProfileSettingsGlyph } from '@/components/customer/profile/profile-settings-icons'
import { color } from '@/design/theme'
import { type AppLanguage } from '@/lib/app-language'
import { textByLanguage } from '../ui/format'
import { workerAvailabilityLabel } from '../ui/labels'
import { workerIsWaitingForReview, workerNeedsAvailabilityVerification, workerNeedsRegistration } from '../profile/registration-model'
import { styles } from '../worker-v5-flow-styles'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

const availabilitySwitchSpring = {
  damping: 19,
  mass: 0.68,
  stiffness: 300,
}

export function WorkerV5AvailabilityCard({
  availabilityGuardReady,
  hasActiveJob,
  language,
  onOpenProfileSetup,
  onToggleAvailability,
  profile,
  reduceMotion = false,
  reduceTransparency,
  artwork,
  avatarUrl,
  avatarPresentation = 'workart',
  avatarUploadBusy = false,
  description,
  onPickAvatar,
  surface = 'default',
  themeMode = 'light',
}: {
  availabilityGuardReady: boolean
  hasActiveJob: boolean
  language: AppLanguage
  onOpenProfileSetup?: () => void
  onToggleAvailability?: (isAvailable: boolean) => Promise<boolean>
  profile: WorkerV5Runtime['workerProfile']
  reduceMotion?: boolean
  reduceTransparency: boolean
  artwork?: number
  avatarUrl?: string | null
  avatarPresentation?: 'profile' | 'workart'
  avatarUploadBusy?: boolean
  description?: string
  onPickAvatar?: () => void
  surface?: 'default' | 'profile'
  themeMode?: 'dark' | 'light'
}) {
  const [pending, setPending] = useState(false)
  const [optimisticAvailable, setOptimisticAvailable] = useState<boolean | null>(null)
  const [inlineFailure, setInlineFailure] = useState<string | null>(null)
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)
  const availabilityInteractionRef = useRef(false)
  const availabilityRequestIdRef = useRef(0)
  const availabilitySwitchDidMountRef = useRef(false)
  const availabilitySwitchLastCheckedRef = useRef(false)
  const availabilityTitleDidMountRef = useRef(false)
  const availabilityTitleProgress = useSharedValue(1)
  const availabilitySwitchProgress = useSharedValue(profile?.is_available ? 1 : 0)
  const availabilitySwitchPressProgress = useSharedValue(0)
  const availabilitySwitchSheenProgress = useSharedValue(1)
  const profileAvailable = Boolean(profile?.is_available)
  if (!pending && optimisticAvailable !== null && profileAvailable === optimisticAvailable) {
    setOptimisticAvailable(null)
  }
  const rawAvailable = optimisticAvailable ?? profileAvailable
  const effectiveProfile = profile ? { ...profile, is_available: rawAvailable } : profile
  const blockedByGuardLoading = Boolean(profile && !availabilityGuardReady && !rawAvailable)
  const showProfileSetupAction = Boolean(
    onOpenProfileSetup
      && workerNeedsAvailabilityVerification(profile)
      // Opening the real verification screen is safe before the work list hydrates;
      // submitting it remains guarded by the real API response.
  )
  const usesProfileAvatarPresentation = avatarPresentation === 'profile'
  const hasArtwork = Boolean(artwork || avatarUrl || usesProfileAvatarPresentation)
  const showAvatar = Boolean(avatarUrl && avatarUrl !== failedAvatarUrl)
  const showProfilePlaceholder = usesProfileAvatarPresentation && !showAvatar
  const profileSetupActionLabel = workerNeedsRegistration(profile)
    ? textByLanguage(language, 'Hoàn tất hồ sơ', 'Complete profile')
    : workerIsWaitingForReview(profile)
      ? textByLanguage(language, 'Xem trạng thái hồ sơ', 'View profile status')
      : textByLanguage(language, 'Xem hồ sơ xác minh', 'View verification profile')
  const availabilityTitle = inlineFailure
    ?? (blockedByGuardLoading
      ? textByLanguage(language, 'Đang đồng bộ công việc', 'Syncing current work')
      : hasActiveJob && rawAvailable
        ? textByLanguage(language, 'Đã bật nhận công việc', 'Enabled for the next job')
      : workerAvailabilityLabel(effectiveProfile, language))
  const checked = Boolean(rawAvailable && profile?.is_approved && !profile?.is_suspended)
  const canToggle = Boolean(
    onToggleAvailability
      && profile
      && !blockedByGuardLoading
      && ((profile.is_approved && !profile.is_suspended) || rawAvailable),
  )
  const disabled = !canToggle || pending

  useEffect(() => {
    // The title is derived from profile props; this effect synchronizes animation to external state.
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (reduceMotion) {
      availabilityTitleProgress.value = 1
      availabilityTitleDidMountRef.current = true
      return
    }
    if (!availabilityTitleDidMountRef.current) {
      availabilityTitleProgress.value = 1
      availabilityTitleDidMountRef.current = true
      return
    }
    availabilityTitleProgress.value = 0.74
    availabilityTitleProgress.value = withTiming(1, {
      duration: 145,
      easing: Easing.out(Easing.quad),
    })
  }, [availabilityTitle, availabilityTitleProgress, reduceMotion])

  useEffect(() => {
    const target = checked ? 1 : 0
    const checkedChanged = availabilitySwitchLastCheckedRef.current !== checked
    availabilitySwitchLastCheckedRef.current = checked

    if (reduceMotion || !availabilitySwitchDidMountRef.current || !checkedChanged) {
      availabilitySwitchProgress.value = target
      availabilitySwitchPressProgress.value = 0
      availabilitySwitchSheenProgress.value = 1
      availabilitySwitchDidMountRef.current = true
      return
    }

    availabilitySwitchProgress.value = withSpring(target, availabilitySwitchSpring)
    availabilitySwitchSheenProgress.value = 0
    availabilitySwitchSheenProgress.value = withDelay(35, withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    }))
  }, [
    availabilitySwitchPressProgress,
    availabilitySwitchProgress,
    availabilitySwitchSheenProgress,
    checked,
    reduceMotion,
  ])

  const availabilityTitleMotionStyle = useAnimatedStyle(() => ({
    opacity: availabilityTitleProgress.value,
    transform: [{ translateY: (1 - availabilityTitleProgress.value) * 8 }],
  }))
  const availabilitySwitchOnMotionStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, availabilitySwitchProgress.value)),
  }))
  const availabilitySwitchPressMotionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - availabilitySwitchPressProgress.value * 0.018 }],
  }))
  const availabilityKnobMotionStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, Math.min(1, availabilitySwitchProgress.value))
    const travelStretch = 4 * progress * (1 - progress)
    const pressProgress = availabilitySwitchPressProgress.value

    return {
      transform: [
        { translateX: availabilitySwitchProgress.value * 18 },
        { scaleX: 1 + travelStretch * 0.12 + pressProgress * 0.08 },
        { scaleY: 1 - travelStretch * 0.03 - pressProgress * 0.03 },
      ],
    }
  })
  const availabilitySwitchSheenMotionStyle = useAnimatedStyle(() => {
    const progress = availabilitySwitchSheenProgress.value
    const isTravelling = progress > 0 && progress < 1

    return {
      opacity: isTravelling ? Math.sin(progress * Math.PI) * 0.24 : 0,
      transform: [
        { translateX: -12 + progress * 58 },
        { skewX: '-12deg' },
      ],
    }
  })

  const handleSwitchPressIn = () => {
    if (disabled || reduceMotion) return
    availabilitySwitchPressProgress.value = withSpring(1, motionTokens.liquid.press)
  }

  const handleSwitchPressOut = () => {
    availabilitySwitchPressProgress.value = reduceMotion
      ? 0
      : withSpring(0, motionTokens.liquid.press)
  }

  const handleToggle = async () => {
    if (!onToggleAvailability || !canToggle || availabilityInteractionRef.current) return
    availabilityInteractionRef.current = true
    const nextAvailability = rawAvailable ? false : true
    const requestId = availabilityRequestIdRef.current + 1
    availabilityRequestIdRef.current = requestId
    setInlineFailure(null)
    setOptimisticAvailable(nextAvailability)
    setPending(true)
    try {
      // The request-id guard must run after the mutation so an older toggle cannot overwrite the latest one.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const saved = await onToggleAvailability(nextAvailability)
      if (availabilityRequestIdRef.current !== requestId) return
      if (!saved) {
        setOptimisticAvailable(null)
        setInlineFailure(textByLanguage(language, 'Chưa cập nhật được — kiểm tra việc đang chạy', 'Could not update — check active work'))
        Alert.alert(
          textByLanguage(language, 'Chưa cập nhật được trạng thái', 'Could not update status'),
          textByLanguage(language, 'Vui lòng thử lại sau khi kết nối ổn định.', 'Please try again once the connection is stable.'),
        )
      }
    } catch {
      if (availabilityRequestIdRef.current !== requestId) return
      setOptimisticAvailable(null)
      setInlineFailure(textByLanguage(language, 'Chưa cập nhật được — kiểm tra kết nối', 'Could not update — check your connection'))
      Alert.alert(
        textByLanguage(language, 'Chưa cập nhật được trạng thái', 'Could not update status'),
        textByLanguage(language, 'Vui lòng thử lại sau khi kết nối ổn định.', 'Please try again once the connection is stable.'),
      )
    } finally {
      if (availabilityRequestIdRef.current === requestId) setPending(false)
      availabilityInteractionRef.current = false
    }
  }

  return (
    <View
      style={[
        styles.availabilityCard,
        hasArtwork ? styles.availabilityCardRebuild : null,
        themeMode === 'dark' ? styles.availabilityCardDark : null,
        reduceTransparency ? (themeMode === 'dark' ? styles.opaqueCardDark : styles.opaqueCard) : null,
        surface === 'profile' ? styles.availabilityCardProfile : null,
      ]}
      testID="worker-v5-availability-card"
    >
      {hasArtwork ? (() => {
        const artworkFrameStyle = [
          styles.availabilityArtworkFrame,
          themeMode === 'dark' ? styles.availabilityArtworkFrameDark : null,
        ]
        const avatarContent = avatarUploadBusy && usesProfileAvatarPresentation ? (
          <ActivityIndicator color={themeMode === 'dark' ? '#63E6D0' : color.brand.primaryDark} size="small" testID="worker-v5-availability-avatar-loading" />
        ) : showAvatar ? (
          <Image
            accessibilityLabel={textByLanguage(language, 'Ảnh đại diện của thợ', 'Worker profile photo')}
            accessibilityIgnoresInvertColors
            contentFit="cover"
            onError={avatarUrl ? () => setFailedAvatarUrl(avatarUrl) : undefined}
            onLoad={avatarUrl ? () => setFailedAvatarUrl(null) : undefined}
            source={{ uri: avatarUrl! }}
            style={styles.availabilityArtwork}
            testID="worker-v5-availability-avatar"
          />
        ) : showProfilePlaceholder ? (
          <View style={styles.availabilityAvatarPlaceholder} testID="worker-v5-availability-avatar-placeholder">
            <ProfileSettingsGlyph
              color={themeMode === 'dark' ? '#F1F6F4' : color.text.primary}
              name="personal"
              testID="worker-v5-availability-avatar-placeholder-glyph"
            />
          </View>
        ) : (
          <Image
            accessibilityIgnoresInvertColors
            contentFit="cover"
            source={artwork}
            style={styles.availabilityArtwork}
            testID="worker-v5-availability-artwork"
          />
        )
        const cameraBadge = usesProfileAvatarPresentation ? (
          <View
            pointerEvents="none"
            style={[styles.availabilityCameraBadge, themeMode === 'dark' ? styles.availabilityCameraBadgeDark : null]}
            testID="worker-v5-availability-camera-badge"
          >
            <CameraGlyph
              color={themeMode === 'dark' ? '#F1F6F4' : color.text.primary}
              testID="worker-v5-availability-camera-glyph"
            />
          </View>
        ) : null

        return usesProfileAvatarPresentation ? (
          <Pressable
            accessibilityLabel={showAvatar
              ? textByLanguage(language, 'Đổi ảnh đại diện', 'Change profile photo')
              : textByLanguage(language, 'Thêm ảnh đại diện', 'Add profile photo')}
            accessibilityRole="button"
            accessibilityState={{ busy: avatarUploadBusy, disabled: !onPickAvatar || avatarUploadBusy }}
            disabled={!onPickAvatar || avatarUploadBusy}
            onPress={onPickAvatar}
            style={({ pressed }) => [
              ...artworkFrameStyle,
              pressed && !avatarUploadBusy ? styles.availabilityArtworkPressed : null,
            ]}
            testID="worker-v5-availability-avatar-picker"
          >
            {avatarContent}
            {cameraBadge}
          </Pressable>
        ) : (
          <View style={artworkFrameStyle} pointerEvents="none" testID="worker-v5-availability-artwork-frame">
            {avatarContent}
          </View>
        )
      })() : null}
      <View style={[styles.availabilityCopy, hasArtwork ? styles.availabilityCopyRebuild : null]}>
        <Animated.Text
          numberOfLines={1}
          style={[styles.workerCustomerFontText, styles.availabilityTitle, themeMode === 'dark' ? styles.availabilityTitleDark : null, availabilityTitleMotionStyle]}
          testID="worker-v5-availability-title"
        >
          {availabilityTitle}
        </Animated.Text>
        {hasArtwork && description ? (
          <RNText style={[styles.availabilityDescription, themeMode === 'dark' ? styles.availabilityDescriptionDark : null]}>{description}</RNText>
        ) : null}
      </View>
      {showProfileSetupAction ? (
        <KaelButton
          label={profileSetupActionLabel}
          onPress={onOpenProfileSetup ?? (() => undefined)}
          showPrimaryGradient={false}
          size="small"
          testID="worker-v5-availability-open-registration"
          variant="secondary"
        />
      ) : (
        <Animated.View
          style={availabilitySwitchPressMotionStyle}
          testID="worker-v5-availability-switch-motion-shell"
        >
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Bật tắt nhận việc', 'Toggle work availability')}
            accessibilityRole="switch"
            accessibilityState={{ busy: pending, checked, disabled }}
            disabled={disabled}
            onPress={handleToggle}
            onPressIn={handleSwitchPressIn}
            onPressOut={handleSwitchPressOut}
            style={[
              styles.availabilitySwitch,
              themeMode === 'dark' ? styles.availabilitySwitchDark : null,
              disabled ? styles.availabilitySwitchDisabled : null,
            ]}
            testID="worker-v5-availability-switch"
          >
            <Animated.View
              style={[styles.availabilitySwitchOn, availabilitySwitchOnMotionStyle]}
              testID="worker-v5-availability-switch-fill"
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.availabilitySwitchSheen, availabilitySwitchSheenMotionStyle]}
              testID="worker-v5-availability-switch-sheen"
            />
            <Animated.View
              style={[styles.availabilityKnob, availabilityKnobMotionStyle]}
              testID="worker-v5-availability-switch-knob"
            />
          </Pressable>
        </Animated.View>
      )}
    </View>
  )
}

function CameraGlyph({ color: strokeColor, testID }: { color: string; testID?: string }) {
  return (
    <Svg height={13} testID={testID} viewBox="0 0 20 20" width={13}>
      <Rect fill="none" height={9.5} rx={2} stroke={strokeColor} strokeWidth={1.4} width={14} x={3} y={5.8} />
      <Path d="M7.2 5.8 8.2 4h3.6l1 1.8" fill="none" stroke={strokeColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} />
      <Circle cx={10} cy={10.5} fill="none" r={2.4} stroke={strokeColor} strokeWidth={1.4} />
    </Svg>
  )
}

