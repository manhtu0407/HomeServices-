import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

type GlassAccessibilityPreferences = {
  reduceMotion: boolean
  reduceTransparency: boolean
}

type AccessibilityInfoWithTransparency = typeof AccessibilityInfo & {
  isReduceTransparencyEnabled?: () => Promise<boolean>
}

function subscribeAccessibilityPreference(
  accessibilityInfo: AccessibilityInfoWithTransparency,
  eventName: 'reduceMotionChanged' | 'reduceTransparencyChanged',
  listener: (enabled: boolean) => void,
) {
  if (typeof accessibilityInfo.addEventListener !== 'function') return () => undefined
  const subscription = accessibilityInfo.addEventListener(eventName, listener)
  return () => {
    subscription.remove()
  }
}

export function useGlassAccessibility(): GlassAccessibilityPreferences {
  const [reduceMotion, setReduceMotion] = useState(false)
  const [reduceTransparency, setReduceTransparency] = useState(false)

  useEffect(() => {
    let mounted = true
    const accessibilityInfo = AccessibilityInfo as AccessibilityInfoWithTransparency

    if (typeof accessibilityInfo.isReduceMotionEnabled === 'function') {
      accessibilityInfo.isReduceMotionEnabled()
        .then((value) => {
          if (mounted) setReduceMotion(value)
        })
        .catch(() => undefined)
    }

    if (typeof accessibilityInfo.isReduceTransparencyEnabled === 'function') {
      accessibilityInfo.isReduceTransparencyEnabled()
        .then((value) => {
          if (mounted) setReduceTransparency(value)
        })
        .catch(() => undefined)
    }

    const removeMotionListener = subscribeAccessibilityPreference(accessibilityInfo, 'reduceMotionChanged', setReduceMotion)
    const removeTransparencyListener = typeof accessibilityInfo.isReduceTransparencyEnabled === 'function'
      ? subscribeAccessibilityPreference(accessibilityInfo, 'reduceTransparencyChanged', setReduceTransparency)
      : () => undefined

    return () => {
      mounted = false
      removeMotionListener()
      removeTransparencyListener()
    }
  }, [])

  return { reduceMotion, reduceTransparency }
}
