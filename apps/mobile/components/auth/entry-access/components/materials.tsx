import { type PropsWithChildren, useEffect, useState } from 'react'
import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import {
  AccessibilityInfo,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { entryTheme } from '../theme'
import { EntryIcon, type EntryIconName } from './icons'

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

export function TextAction({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress} style={({ pressed }: { pressed: boolean }) => [styles.textAction, pressed && { opacity: 0.62 }]} testID={testID}>
      <Text style={styles.textActionLabel}>{label}</Text>
    </Pressable>
  )
}

export function IconButton({ icon = 'back', label, onPress }: { icon?: EntryIconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }: { pressed: boolean }) => [styles.iconButton, pressed && styles.pressed]}>
      <EntryIcon color={entryTheme.color.text.strong} name={icon} size={18} />
    </Pressable>
  )
}

export function NestScoutBrandMark({ size = 102, source }: { size?: number; source: ImageSourcePropType }) {
  return (
    <View
      accessibilityLabel="NestScout — Aurora Nest"
      accessible
      style={[styles.brandMarkShell, { borderRadius: Math.round(size * 0.30), height: size, width: size }]}
    >
      <Image resizeMode="cover" source={source} style={styles.brandMarkImage} />
      <View pointerEvents="none" style={[styles.brandMarkHighlight, { borderRadius: Math.round(size * 0.25) }]} />
    </View>
  )
}

export function KaelStatus({ source }: { source: ImageSourcePropType }) {
  const { reduceTransparency } = useEntryAccessibility()

  return (
    <View accessibilityLabel="Kael đang sẵn sàng" accessible style={styles.kaelStatus}>
      {reduceTransparency ? <View pointerEvents="none" style={styles.kaelStatusAuraFallback} /> : <KaelStatusAura />}
      <Image resizeMode="contain" source={source} style={styles.kaelStatusImage} />
      <View pointerEvents="none" style={styles.kaelStatusDot} />
    </View>
  )
}

function KaelStatusAura() {
  return (
    <Svg pointerEvents="none" viewBox="0 0 90 90" style={styles.kaelStatusAura}>
      <Defs>
        <LinearGradient id="kaelStatusMintBase" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor="#F0FCFB" stopOpacity="0.98" />
          <Stop offset="0.56" stopColor="#E4FAF8" stopOpacity="0.96" />
          <Stop offset="1" stopColor="#D8F5F3" stopOpacity="0.94" />
        </LinearGradient>
        <RadialGradient id="kaelStatusMintAura" cx="52%" cy="44%" r="68%">
          <Stop offset="0" stopColor="#8FE9E3" stopOpacity="0.22" />
          <Stop offset="0.58" stopColor="#5FDCD6" stopOpacity="0.12" />
          <Stop offset="1" stopColor="#2CBAB4" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="90" height="90" rx="30" fill="url(#kaelStatusMintBase)" />
      <Circle cx="50" cy="39" r="54" fill="url(#kaelStatusMintAura)" />
      <Circle cx="24" cy="24" r="20" fill="#FFFFFF" opacity="0.18" />
      <Circle cx="68" cy="64" r="23" fill="#8FE9E3" opacity="0.10" />
    </Svg>
  )
}

export function KaelMascot({ compact = false, source }: { compact?: boolean; source: ImageSourcePropType }) {
  const { reduceMotion, reduceTransparency } = useEntryAccessibility()
  return (
    <View accessible accessibilityLabel="Kael, trợ lý gia đình" style={[styles.mascotShell, compact && styles.mascotShellCompact]}>
      <View style={[styles.mascotAura, compact && styles.mascotAuraCompact]} />
      {!reduceTransparency ? <MascotPrimaryAura compact={compact} /> : null}
      <View style={[styles.mascotRing, compact && styles.mascotRingCompact]} />
      <Image source={source} resizeMode="contain" style={[styles.mascotImage, compact && styles.mascotImageCompact, reduceMotion && { transform: [{ translateY: 0 }] }]} />
      {!compact ? <View style={styles.mascotPedestal} /> : null}
    </View>
  )
}

function MascotPrimaryAura({ compact }: { compact: boolean }) {
  return (
    <Svg pointerEvents="none" viewBox="0 0 290 290" style={[styles.mascotPrimaryAura, compact && styles.mascotPrimaryAuraCompact]}>
      <Defs>
        <RadialGradient id="mascotPrimaryAuraGradient" cx="50%" cy="48%" r="56%">
          <Stop offset="0" stopColor="#49CFC0" stopOpacity="0.18" />
          <Stop offset="0.54" stopColor="#24B3A1" stopOpacity="0.10" />
          <Stop offset="1" stopColor="#088779" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="145" cy="145" r="132" fill="url(#mascotPrimaryAuraGradient)" />
    </Svg>
  )
}

export function Eyebrow({ children }: PropsWithChildren) {
  return (
    <View style={styles.eyebrow}>
      <View style={styles.eyebrowDot} />
      <Text style={styles.eyebrowText}>{children}</Text>
    </View>
  )
}

export function AssetTile({ source }: { source: ImageSourcePropType }) {
  return (
    <View style={styles.assetTile}>
      <Image resizeMode="contain" source={source} style={styles.assetImage} />
    </View>
  )
}

const styles = StyleSheet.create({
  assetImage: { height: 68, width: 68 },
  brandMarkHighlight: {
    borderColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    bottom: 5,
    left: 5,
    position: 'absolute',
    right: 5,
    top: 5,
  },
  brandMarkImage: { height: '100%', transform: [{ scale: 1.025 }], width: '100%' },
  brandMarkShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: entryTheme.color.surface.stroke,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#3E68A9',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 17,
  },
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
  eyebrow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(230,251,243,0.82)',
    borderColor: 'rgba(184,231,223,0.78)',
    borderRadius: entryTheme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  eyebrowDot: { backgroundColor: entryTheme.color.mint.mint600, borderRadius: 3, height: 6, width: 6 },
  eyebrowText: { color: entryTheme.color.mint.mint700, fontSize: 11, fontWeight: '700', letterSpacing: 0, textTransform: 'uppercase' },
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
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 21,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
    ...entryTheme.shadow.soft,
  },
  kaelStatus: {
    backgroundColor: 'rgba(240,252,251,0.96)',
    borderColor: 'rgba(255,255,255,0.76)',
    borderRadius: 30,
    borderWidth: 1,
    height: 90,
    marginTop: -9,
    overflow: 'hidden',
    position: 'relative',
    width: 90,
    ...entryTheme.shadow.soft,
  },
  kaelStatusAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  kaelStatusAuraFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E8FAF8',
    zIndex: 0,
  },
  kaelStatusDot: {
    backgroundColor: entryTheme.color.accent.success,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 3,
    bottom: 9,
    height: 16,
    position: 'absolute',
    right: 9,
    width: 16,
    zIndex: 3,
  },
  kaelStatusImage: {
    bottom: -17,
    height: 110,
    left: -10,
    position: 'absolute',
    width: 110,
    zIndex: 2,
  },
  mascotAura: {
    backgroundColor: 'rgba(200,244,234,0.28)',
    borderRadius: 145,
    height: 290,
    position: 'absolute',
    width: 290,
  },
  mascotAuraCompact: { borderRadius: 130, height: 260, top: 28, width: 260 },
  mascotImage: { height: 285, width: 285, zIndex: 2 },
  mascotImageCompact: { height: 245, top: 28, width: 245 },
  mascotPedestal: {
    backgroundColor: 'rgba(13,174,154,0.13)',
    borderRadius: 95,
    bottom: 42,
    height: 23,
    position: 'absolute',
    width: 190,
  },
  mascotPrimaryAura: {
    height: 290,
    position: 'absolute',
    width: 290,
  },
  mascotPrimaryAuraCompact: { height: 260, top: 28, width: 260 },
  mascotRing: {
    borderColor: 'rgba(143,226,212,0.40)',
    borderRadius: 109,
    borderWidth: 1,
    height: 218,
    position: 'absolute',
    width: 218,
  },
  mascotRingCompact: { borderRadius: 95, height: 190, top: 28, width: 190 },
  mascotShell: { alignItems: 'center', height: 310, justifyContent: 'center', width: '100%' },
  mascotShellCompact: { height: 278 },
  pressed: { opacity: 0.94, transform: [{ scale: 0.985 }] },
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
  textAction: { alignItems: 'center', justifyContent: 'center', minHeight: 42, paddingHorizontal: 8 },
  textActionLabel: { color: entryTheme.color.mint.mint700, fontSize: 13, fontWeight: '700' },
})
