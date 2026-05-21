import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export type GlassAccessibilityPreferences = {
  reduceMotion: boolean
  reduceTransparency: boolean
}

export function useGlassAccessibility(): GlassAccessibilityPreferences {
  const [reduceMotion, setReduceMotion] = useState(false)
  const [reduceTransparency, setReduceTransparency] = useState(false)

  useEffect(() => {
    let mounted = true
    const accessibilityInfo = AccessibilityInfo as typeof AccessibilityInfo & {
      isReduceTransparencyEnabled?: () => Promise<boolean>
    }

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

    let removeMotionListener = () => undefined
    let removeTransparencyListener = () => undefined

    if (typeof accessibilityInfo.addEventListener === 'function') {
      const motionSubscription = accessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
      removeMotionListener = () => {
        motionSubscription.remove()
      }
    }

    if (typeof accessibilityInfo.addEventListener === 'function' && typeof accessibilityInfo.isReduceTransparencyEnabled === 'function') {
      const transparencySubscription = accessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency)
      removeTransparencyListener = () => {
        transparencySubscription.remove()
      }
    }

    return () => {
      mounted = false
      removeMotionListener()
      removeTransparencyListener()
    }
  }, [])

  return { reduceMotion, reduceTransparency }
}
