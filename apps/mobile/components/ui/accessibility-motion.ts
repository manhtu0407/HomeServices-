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

    const motionSub = typeof accessibilityInfo.addEventListener === 'function'
      ? accessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
      : null
    const transparencySub = typeof accessibilityInfo.addEventListener === 'function' && typeof accessibilityInfo.isReduceTransparencyEnabled === 'function'
      ? accessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency)
      : null

    return () => {
      mounted = false
      motionSub?.remove()
      transparencySub?.remove()
    }
  }, [])

  return { reduceMotion, reduceTransparency }
}
