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
import { EntryIcon } from './icons'

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
  if (Platform.OS !== 'web') return null

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="topAura" cx="84%" cy="4%" r="72%">
            <Stop offset="0" stopColor="#8FE2D4" stopOpacity="0.30" />
            <Stop offset="0.36" stopColor="#E6F7F3" stopOpacity="0.23" />
            <Stop offset="0.72" stopColor="#F7FFFB" stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="baseWash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FCFFFE" />
            <Stop offset="0.50" stopColor="#F7FFFB" />
            <Stop offset="1" stopColor="#F4FAF9" />
          </LinearGradient>
        </Defs>
        <Rect width="390" height="844" fill="url(#baseWash)" />
        <Rect width="390" height="844" fill="url(#topAura)" />
      </Svg>
      <Svg width="620" height="230" viewBox="0 0 620 230" style={styles.ribbon}>
        <Defs>
          <LinearGradient id="ribbonFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#C8F4EA" stopOpacity="0.17" />
            <Stop offset="1" stopColor="#28C4B3" stopOpacity="0.12" />
          </LinearGradient>
        </Defs>
        <PathWithFallback />
        <Rect x="58" y="48" width="500" height="104" rx="52" fill="none" stroke="#8FE2D4" strokeOpacity="0.18" />
        <Rect x="24" y="78" width="566" height="128" rx="64" fill="none" stroke="#8FE2D4" strokeOpacity="0.28" />
      </Svg>
    </View>
  )
}

function PathWithFallback() {
  // Rect/large radius renders more consistently than a complex path on old Android SVG engines.
  return <Rect x="0" y="112" width="620" height="190" rx="95" fill="url(#ribbonFill)" />
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
      <Text style={styles.primaryLabel}>{label}</Text>
      <EntryIcon color="#FFFFFF" name="arrow-right" size={16} />
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
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.68)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
    ...entryTheme.shadow.primary,
  },
  primaryLabel: { color: entryTheme.color.text.inverse, fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  ribbon: { bottom: -120, left: -124, position: 'absolute', transform: [{ rotate: '-7deg' }] },
})
