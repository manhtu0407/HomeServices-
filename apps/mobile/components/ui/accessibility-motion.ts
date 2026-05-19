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

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value)
      })
      .catch(() => undefined)

    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (mounted) setReduceTransparency(value)
      })
      .catch(() => undefined)

    const motionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    const transparencySub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency)

    return () => {
      mounted = false
      motionSub.remove()
      transparencySub.remove()
    }
  }, [])

  return { reduceMotion, reduceTransparency }
}
