import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated'
import { motionTokens } from '@/components/ui/motion-tokens'
import { type AppLanguage } from '@/lib/app-language'
import { textByLanguage } from '../ui/format'
import { workerAvailabilityLabel } from '../ui/labels'
import { styles } from '../worker-v5-flow-styles'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

export const availabilitySwitchSpring = {
  damping: 19,
  mass: 0.68,
  stiffness: 300,
}

export function WorkerV5AvailabilityCard({
  availabilityGuardReady,
  hasActiveJob,
  language,
  onToggleAvailability,
  profile,
  reduceMotion = false,
  reduceTransparency,
}: {
  availabilityGuardReady: boolean
  hasActiveJob: boolean
  language: AppLanguage
  onToggleAvailability?: (isAvailable: boolean) => Promise<boolean>
  profile: WorkerV5Runtime['workerProfile']
  reduceMotion?: boolean
  reduceTransparency: boolean
}) {
  const [pending, setPending] = useState(false)
  const [optimisticAvailable, setOptimisticAvailable] = useState<boolean | null>(null)
  const [inlineFailure, setInlineFailure] = useState<string | null>(null)
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
    <View style={[styles.availabilityCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-availability-card">
      <View style={styles.availabilityCopy}>
        <Animated.Text
          numberOfLines={1}
          style={[styles.workerCustomerFontText, styles.availabilityTitle, availabilityTitleMotionStyle]}
          testID="worker-v5-availability-title"
        >
          {availabilityTitle}
        </Animated.Text>
      </View>
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
    </View>
  )
}

