import { type PropsWithChildren, useEffect, useState } from 'react'
import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { Image } from 'expo-image'
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { KaelCoreV9 } from '@/components/ui/kael-core-v9'
import { useAppLanguage } from '@/lib/app-language'
import { entryAccessCopy } from '../copy'
import { entryTheme } from '../theme'

type AccessibilityPreferences = {
  reduceMotion: boolean
  reduceTransparency: boolean
}

type AccessibilityInfoWithTransparency = typeof AccessibilityInfo & {
  isReduceTransparencyEnabled?: () => Promise<boolean>
}

type AccessibilitySubscription = { remove: () => void }

function subscribePreference(
  api: AccessibilityInfoWithTransparency,
  eventName: 'reduceMotionChanged' | 'reduceTransparencyChanged',
  listener: (enabled: boolean) => void,
): AccessibilitySubscription | undefined {
  const addEventListener = api.addEventListener as unknown as
    | ((event: string, callback: (enabled: boolean) => void) => AccessibilitySubscription)
    | undefined
  return typeof addEventListener === 'function' ? addEventListener(eventName, listener) : undefined
}

export function useEntryAccessibility(): AccessibilityPreferences {
  const [reduceMotion, setReduceMotion] = useState(false)
  const [reduceTransparency, setReduceTransparency] = useState(false)

  useEffect(() => {
    let mounted = true
    const api = AccessibilityInfo as AccessibilityInfoWithTransparency
    const readReduceTransparency = api.isReduceTransparencyEnabled
    api.isReduceMotionEnabled?.().then((value: boolean) => mounted && setReduceMotion(value)).catch(() => undefined)
    readReduceTransparency?.().then((value: boolean) => mounted && setReduceTransparency(value)).catch(() => undefined)
    const motion = subscribePreference(api, 'reduceMotionChanged', setReduceMotion)
    const transparency = typeof readReduceTransparency === 'function'
      ? subscribePreference(api, 'reduceTransparencyChanged', setReduceTransparency)
      : undefined

    return () => {
      mounted = false
      motion?.remove()
      transparency?.remove()
    }
  }, [])

  return { reduceMotion, reduceTransparency }
}

export function PageAura() {
  return null
}

export function GlassPanel({ children, style, testID }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  const { reduceTransparency } = useEntryAccessibility()
  const composed = [styles.glassBase, reduceTransparency && styles.glassOpaque, style]

  if (!reduceTransparency && isLiquidGlassAvailable()) {
    return (
      <GlassView colorScheme="light" glassEffectStyle="regular" style={composed} testID={testID}>
        <GlassHighlight />
        {children}
      </GlassView>
    )
  }

  if (!reduceTransparency && Platform.OS !== 'web') {
    return (
      <BlurView intensity={22} tint="systemThinMaterialLight" style={composed} testID={testID}>
        <GlassHighlight />
        {children}
      </BlurView>
    )
  }

  return (
    <View style={composed} testID={testID}>
      {!reduceTransparency ? <GlassHighlight /> : null}
      {children}
    </View>
  )
}

export function NativeSafeGlassPanel({ children, style, testID }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  const { reduceTransparency } = useEntryAccessibility()

  return (
    <View style={[styles.glassBase, reduceTransparency && styles.glassOpaque, style]} testID={testID}>
      {!reduceTransparency ? <GlassHighlight /> : null}
      {children}
    </View>
  )
}

function GlassHighlight() {
  return <View pointerEvents="none" style={styles.glassHighlight} />
}

export function PrimaryButton({
  disabled,
  label,
  onPress,
  testID,
}: {
  disabled?: boolean
  label: string
  onPress: () => void
  testID?: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.primaryButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
      testID={testID}
    >
      <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="primaryGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0" stopColor="#49CFC0" />
            <Stop offset="0.5" stopColor="#24B3A1" />
            <Stop offset="1" stopColor="#088779" />
          </LinearGradient>
          <RadialGradient id="buttonLight" cx="22%" cy="0%" r="78%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.34" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" rx="24" fill="url(#primaryGradient)" />
        <Rect width="100%" height="100%" rx="24" fill="url(#buttonLight)" />
      </Svg>
      <View style={styles.primaryLabelSlot}>
        <Text style={styles.primaryLabel}>{label}</Text>
      </View>
    </Pressable>
  )
}

export function KaelCoreHero({ compact = false }: { compact?: boolean }) {
  const language = useAppLanguage()
  const { reduceMotion } = useEntryAccessibility()
  return (
    <View accessibilityLabel={entryAccessCopy[language].accessibility.kaelAssistant} accessible style={[styles.kaelCoreHero, compact && styles.kaelCoreHeroCompact]}>
      <KaelCoreV9 reduceMotion={reduceMotion} size={compact ? 136 : 188} />
    </View>
  )
}

export function AssetTile({ source }: { source: ImageSourcePropType }) {
  return (
    <View style={styles.assetTile}>
      <Image contentFit="contain" source={source} style={styles.assetImage} />
    </View>
  )
}

const styles = StyleSheet.create({
  assetImage: { height: 68, width: 68 },
  assetTile: {
    alignItems: 'center',
    backgroundColor: '#FAFDFC',
    borderColor: entryTheme.color.surface.stroke,
    borderRadius: 24,
    borderWidth: 1,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  disabled: { opacity: 0.54 },
  glassBase: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(255,255,255,0.90)',
    borderWidth: 1,
    overflow: 'hidden',
    ...entryTheme.shadow.soft,
  },
  glassHighlight: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 1,
    height: 1,
    left: 16,
    position: 'absolute',
    right: 16,
    top: 1,
    zIndex: 2,
  },
  glassOpaque: { backgroundColor: '#FFFFFF', borderColor: entryTheme.color.surface.stroke },
  kaelCoreHero: { alignItems: 'center', height: 310, justifyContent: 'center', width: '100%' },
  kaelCoreHeroCompact: { height: 278 },
  pressed: { opacity: 0.78 },
  primaryButton: {
    borderColor: 'rgba(255,255,255,0.68)',
    borderRadius: 24,
    borderWidth: 1,
    height: 52,
    overflow: 'hidden',
    width: '100%',
    ...entryTheme.shadow.primary,
  },
  primaryLabel: { ...entryTheme.typography.subheadline, color: entryTheme.color.text.inverse, fontWeight: '600' },
  primaryLabelSlot: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
})
