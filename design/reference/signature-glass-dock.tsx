/**
 * GOLD REFERENCE — Glass-Liquid Signature dock + liquid pill.
 *
 * design memory, NOT production. Do NOT import this from app code (RULES: no
 * production import from design/). It is not in apps/mobile tsconfig, so it is
 * not type-checked or compiled in the app build — treat it as a spec-with-code.
 * Copy the PATTERN (tokens + spring + sheen + mode-aware edge highlight) into
 * the real apps/mobile/components/ui primitives, then get Tu's visual sign-off
 * on Expo. Do not claim "9/10" without his eyes.
 *
 * Canonical spec: design/signature.md. Timing: design/motion.md. General motion
 * discipline + anti-slop: kael-motion. Glass guardrails: RULES.md.
 *
 * What this demonstrates (the 7→9 deltas vs the current code):
 *  1. SPRING with slight overshoot (not withTiming) for the pill "bubble pop".
 *  2. One specular SHEEN sweep on activate, then fade — never loops.
 *  3. Mode-aware 1px inner edge highlight (neutral-gray in dark, NOT white).
 *  4. NEUTRAL surface + a single MINT accent (no multi-mint zoo).
 *  5. Reduce Motion / Reduce Transparency fallbacks.
 *
 * In production the glass surface itself should be the existing <GlassSurface>
 * (expo-glass-effect / BlurView). Here it is a plain View so the file is
 * self-contained illustration.
 */
import { useEffect } from 'react'
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

type Mode = 'light' | 'dark'

// §2 Palette — neutral base + ONE mint accent (proposed; pending Tu sign-off).
const tokens = {
  light: {
    surface: 'rgba(255,255,255,0.62)', // glassTint
    line: '#E4E8E7',
    edgeHighlight: 'rgba(255,255,255,0.30)', // 1px inner border, light
    mint: '#17A995', // the single accent
    mintDeep: '#00756A',
    sheen: 'rgba(255,255,255,0.52)',
    text: '#14201E',
    textMuted: '#5C6B68',
  },
  dark: {
    surface: 'rgba(22,29,27,0.55)',
    line: 'rgba(255,255,255,0.08)',
    edgeHighlight: 'rgba(190,210,205,0.14)', // neutral-gray, NOT white — the dark fix
    mint: '#17A995',
    mintDeep: '#39C8B2',
    sheen: 'rgba(255,255,255,0.10)',
    text: '#EAF1EF',
    textMuted: '#9DB0AB',
  },
} as const

// §4 Spring tokens — slight overshoot = the "bubble pop" feel.
const spring = {
  pill: { mass: 1, stiffness: 200, damping: 14 }, // ζ≈0.49 → visible overshoot
  press: { mass: 1, stiffness: 320, damping: 22 }, // snappy, minimal overshoot
} as const

export type SignatureDockItem = { key: string; label: string }

export function SignatureGlassDock({
  items,
  activeKey,
  onPress,
  mode = 'light',
  reduceMotion = false,
  reduceTransparency = false,
}: {
  items: SignatureDockItem[]
  activeKey: string
  onPress: (key: string) => void
  mode?: Mode
  reduceMotion?: boolean
  reduceTransparency?: boolean
}) {
  const t = tokens[mode]
  const activeIndex = Math.max(0, items.findIndex((i) => i.key === activeKey))
  const slot = 100 / Math.max(items.length, 1) // % width per slot

  // Pill position (spring) + bubble scale (spring overshoot) + sheen sweep (one-shot).
  const pillX = useSharedValue(activeIndex)
  const pillScale = useSharedValue(1)
  const sheen = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) {
      pillX.value = activeIndex
      pillScale.value = 1
      sheen.value = 0
      return
    }
    // travel to the new slot with a soft overshoot
    pillX.value = withSpring(activeIndex, spring.pill)
    // bubble pop: dip then overshoot then settle
    pillScale.value = withSequence(
      withTiming(0.92, { duration: 90 }),
      withSpring(1, spring.pill),
    )
    // one specular sheen crossing, then gone (never loops)
    sheen.value = 0
    sheen.value = withSequence(
      withTiming(1, { duration: 260 }),
      withDelay(40, withTiming(0, { duration: 180 })),
    )
    return () => {
      cancelAnimation(pillX)
      cancelAnimation(pillScale)
      cancelAnimation(sheen)
    }
  }, [activeIndex, reduceMotion, pillX, pillScale, sheen])

  const pillStyle = useAnimatedStyle(() => ({
    left: `${pillX.value * slot}%`,
    width: `${slot}%`,
    transform: [{ scale: pillScale.value }],
  }))
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheen.value * (reduceTransparency ? 0.0 : 1),
    transform: [{ translateX: -20 + sheen.value * 40 }], // sweep across
  }))

  const surfaceStyle: ViewStyle = {
    backgroundColor: reduceTransparency ? (mode === 'dark' ? '#161D1B' : '#FFFFFF') : t.surface,
    borderColor: t.line,
  }

  return (
    <View style={[styles.dock, surfaceStyle]}>
      {/* 1px mode-aware inner edge highlight (the "viền trong suốt nhẹ") */}
      {!reduceTransparency ? (
        <View pointerEvents="none" style={[styles.edgeHighlight, { backgroundColor: t.edgeHighlight }]} />
      ) : null}

      {/* The single mint accent: the active liquid pill */}
      {!reduceMotion ? (
        <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: t.mint }, pillStyle]}>
          <Animated.View style={[styles.sheen, { backgroundColor: t.sheen }, sheenStyle]} />
        </Animated.View>
      ) : (
        <View pointerEvents="none" style={[styles.pill, styles.pillStatic, { backgroundColor: t.mint, left: `${activeIndex * slot}%`, width: `${slot}%` }]} />
      )}

      {items.map((item) => {
        const focused = item.key === activeKey
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => onPress(item.key)}
            style={({ pressed }) => [styles.item, pressed && !reduceMotion ? styles.itemPressed : null]}
          >
            <PressLabel focused={focused} label={item.label} mode={mode} reduceMotion={reduceMotion} />
          </Pressable>
        )
      })}
    </View>
  )
}

// Press feedback via spring (overshoot-free, snappy) — not linear timing.
function PressLabel({ focused, label, mode, reduceMotion }: { focused: boolean; label: string; mode: Mode; reduceMotion: boolean }) {
  const t = tokens[mode]
  const s = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }))
  return (
    <Animated.Text
      onPressIn={() => { if (!reduceMotion) s.value = withSpring(0.97, spring.press) }}
      onPressOut={() => { if (!reduceMotion) s.value = withSpring(1, spring.press) }}
      style={[styles.label, { color: focused ? t.mintDeep : t.textMuted }, style]}
    >
      {label}
    </Animated.Text>
  )
}

const styles = StyleSheet.create({
  dock: {
    alignItems: 'center',
    borderCurve: 'continuous', // slightly curved corners
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    overflow: 'hidden',
    paddingHorizontal: 8,
    position: 'relative',
  },
  edgeHighlight: { height: 1, left: 14, opacity: 0.7, position: 'absolute', right: 14, top: 1, zIndex: 3 },
  item: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 50, zIndex: 2 },
  itemPressed: { transform: [{ translateY: 0.5 }] },
  label: { fontSize: 11, fontWeight: '700' },
  pill: {
    borderCurve: 'continuous',
    borderRadius: 22,
    bottom: 8,
    opacity: 0.9,
    overflow: 'hidden',
    position: 'absolute',
    top: 8,
    zIndex: 1,
  },
  pillStatic: { opacity: 0.85 },
  sheen: { borderRadius: 999, bottom: 6, left: '40%', position: 'absolute', top: 6, width: '20%' },
})
