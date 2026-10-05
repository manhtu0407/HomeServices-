import { useId } from 'react'
import { type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect'
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import Svg, { Circle, Defs, Path, Rect } from 'react-native-svg'

import { color } from '@/design/theme'

import { useGlassAccessibility } from './accessibility-motion'
import { GlassSurface } from './glass-surface'
import { motionTokens } from './motion-tokens'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient, NativeSafeRadialGradient as RadialGradient } from './svg-alpha-stop'
import type { GlassMode } from './tokens'

const DEFAULT_SIZE = 50
const DEFAULT_ICON_SIZE = 21

const liquidBackButtonPalette = {
  dark: {
    contactEnd: 'rgba(255,255,255,0)',
    contactMid: 'rgba(255,255,255,0.12)',
    contactStart: 'rgba(255,255,255,0.32)',
    edgeDark: 'rgba(0,0,0,0.45)',
    edgeLight: 'rgba(255,255,255,0.30)',
    frostEnd: 'rgba(255,255,255,0.04)',
    frostMid: 'rgba(255,255,255,0.06)',
    frostStart: 'rgba(255,255,255,0.18)',
    sceneEnd: 'rgba(255,255,255,0.04)',
    sceneStart: 'rgba(255,255,255,0.16)',
  },
  light: {
    contactEnd: 'rgba(255,255,255,0)',
    contactMid: 'rgba(255,255,255,0.38)',
    contactStart: 'rgba(255,255,255,0.92)',
    edgeDark: 'rgba(20,73,66,0.10)',
    edgeLight: 'rgba(255,255,255,0.86)',
    frostEnd: 'rgba(255,255,255,0.08)',
    frostMid: 'rgba(255,255,255,0.14)',
    frostStart: 'rgba(255,255,255,0.42)',
    sceneEnd: 'rgba(23,169,149,0.12)',
    sceneStart: 'rgba(255,255,255,0.42)',
  },
} as const

function safeGradientId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '') || 'liquidBackButton'
}

export function LiquidSendArrowIcon({ color: strokeColor, size = 21, testID }: { color: string; size?: number; testID?: string }) {
  return (
    <Svg fill="none" height={size} testID={testID} viewBox="0 0 24 24" width={size}>
      <Path d="M12 19V5M6.8 10.2 12 5l5.2 5.2" stroke={strokeColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.35} />
    </Svg>
  )
}

type LiquidSurfaceDimension = number | string

function LiquidSurfaceLayers({
  designHeight,
  designWidth,
  height,
  mode,
  nativeGlassAvailable,
  pressProgress,
  reduceTransparency,
  radius,
  testID,
  width,
}: {
  designHeight: number
  designWidth: number
  height: LiquidSurfaceDimension
  mode: GlassMode
  nativeGlassAvailable: boolean
  pressProgress: SharedValue<number>
  reduceTransparency: boolean
  radius: number
  testID?: string
  width: LiquidSurfaceDimension
}) {
  const palette = liquidBackButtonPalette[mode]
  const gradientPrefix = `liquidBackButton${safeGradientId(useId())}`
  const sceneGradientId = `${gradientPrefix}Scene`
  const frostGradientId = `${gradientPrefix}Frost`
  const edgeGradientId = `${gradientPrefix}Edge`
  const contactGradientId = `${gradientPrefix}Contact`
  const frostStyle = useAnimatedStyle(() => ({
    opacity: 0.76 + pressProgress.value * 0.08,
    transform: [{ scale: 1 + pressProgress.value * 0.018 }],
  }))
  const edgeStyle = useAnimatedStyle(() => ({
    opacity: 0.78 + pressProgress.value * 0.12,
    transform: [
      { rotateZ: `${designWidth === designHeight ? -8 + pressProgress.value * 8 : 0}deg` },
      { scale: 1 + pressProgress.value * 0.02 },
    ],
  }))
  const contactStyle = useAnimatedStyle(() => ({
    opacity: pressProgress.value * 0.42,
    transform: [{ scale: 0.72 + pressProgress.value * 0.36 }],
  }))

  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={[styles.layers, { borderRadius: radius }]} testID={testID ? `${testID}-layers` : undefined}>
      <Svg height={height} style={StyleSheet.absoluteFill} viewBox={`0 0 ${designWidth} ${designHeight}`} width={width}>
        <Defs>
          <LinearGradient id={sceneGradientId} x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={palette.sceneStart} />
            <Stop offset="1" stopColor={palette.sceneEnd} />
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${sceneGradientId})`} height={designHeight} opacity={0.42} rx={radius} width={designWidth} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, styles.frostLayer, frostStyle]}>
        <Svg height={height} viewBox={`0 0 ${designWidth} ${designHeight}`} width={width}>
          <Defs>
            <RadialGradient cx="27%" cy="12%" id={frostGradientId} r="88%">
              <Stop offset="0" stopColor={palette.frostStart} />
              <Stop offset="0.48" stopColor={palette.frostMid} />
              <Stop offset="1" stopColor={palette.frostEnd} />
            </RadialGradient>
          </Defs>
          <Rect fill={`url(#${frostGradientId})`} height={designHeight} rx={radius} width={designWidth} />
        </Svg>
      </Animated.View>
      {!nativeGlassAvailable ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.edgeLayer, edgeStyle]}>
          <Svg height={height} viewBox={`0 0 ${designWidth} ${designHeight}`} width={width}>
            <Defs>
              <LinearGradient id={edgeGradientId} x1="0" x2="1" y1="0" y2="1">
                <Stop offset="0" stopColor={palette.edgeLight} />
                <Stop offset="0.5" stopColor={palette.edgeDark} />
                <Stop offset="1" stopColor={palette.edgeLight} />
              </LinearGradient>
            </Defs>
            <Rect
              fill="none"
              height={designHeight - 2.4}
              rx={Math.max(0, radius - 1.2)}
              stroke={`url(#${edgeGradientId})`}
              strokeWidth={1.2}
              width={designWidth - 2.4}
              x={1.2}
              y={1.2}
            />
          </Svg>
        </Animated.View>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, styles.contactLayer, contactStyle]}>
        <Svg height={height} viewBox={`0 0 ${designWidth} ${designHeight}`} width={width}>
          <Defs>
            <RadialGradient cx="32%" cy="26%" id={contactGradientId} r="68%">
              <Stop offset="0" stopColor={palette.contactStart} />
              <Stop offset="0.34" stopColor={palette.contactMid} />
              <Stop offset="1" stopColor={palette.contactEnd} />
            </RadialGradient>
          </Defs>
          <Circle
            cx={designWidth * 0.32}
            cy={designHeight * 0.26}
            fill={`url(#${contactGradientId})`}
            r={Math.min(designWidth, designHeight) * 0.36}
          />
        </Svg>
      </Animated.View>
    </View>
  )
}

export function LiquidControlButton({
  accessibilityLabel,
  accessibilityState,
  children,
  dimWhenDisabled = true,
  disabled = false,
  hitSlop,
  mode = 'light',
  onPress,
  radius,
  size = DEFAULT_SIZE,
  style,
  testID,
}: {
  accessibilityLabel: string
  accessibilityState?: PressableProps['accessibilityState']
  children: ReactNode
  dimWhenDisabled?: boolean
  disabled?: boolean
  hitSlop?: PressableProps['hitSlop']
  mode?: GlassMode
  onPress: () => void
  radius?: number
  size?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const scale = useSharedValue(1)
  const pressProgress = useSharedValue(0)
  const cornerRadius = radius ?? size / 2
  const sizeStyle = { borderRadius: cornerRadius, height: size, width: size }
  const webSurfaceStyle = Platform.OS === 'web' && !reduceTransparency ? styles.webSurface : null
  const nativeGlassAvailable = !reduceTransparency && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const setPressed = (pressed: boolean) => {
    if (disabled || reduceMotion) {
      scale.value = 1
      pressProgress.value = 0
      return
    }
    scale.value = withSpring(pressed ? motionTokens.feedback.scale : 1, motionTokens.liquid.press)
    pressProgress.value = withSpring(pressed ? 1 : 0, motionTokens.liquid.press)
  }

  return (
    <Animated.View style={[styles.frame, sizeStyle, disabled && dimWhenDisabled ? styles.disabled : null, style, animatedStyle]}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ ...accessibilityState, disabled }}
        disabled={disabled}
        hitSlop={hitSlop}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[styles.pressable, sizeStyle]}
        testID={testID}
      >
        <GlassSurface
          material="liquid"
          mode={mode}
          showEdgeHighlight={false}
          style={[sizeStyle, webSurfaceStyle]}
          testID={testID ? `${testID}-surface` : undefined}
          variant="control"
        >
          <LiquidSurfaceLayers
            designHeight={size}
            designWidth={size}
            height={size}
            mode={mode}
            nativeGlassAvailable={nativeGlassAvailable}
            pressProgress={pressProgress}
            reduceTransparency={reduceTransparency}
            radius={cornerRadius}
            testID={testID}
            width={size}
          />
          <View pointerEvents="none" style={styles.iconLayer}>
            {children}
          </View>
        </GlassSurface>
      </Pressable>
    </Animated.View>
  )
}

export function LiquidSurfaceOverlay({
  designHeight = 160,
  designWidth = 360,
  height = '100%',
  mode = 'light',
  radius = 18,
  testID,
  width = '100%',
}: {
  designHeight?: number
  designWidth?: number
  height?: LiquidSurfaceDimension
  mode?: GlassMode
  radius?: number
  testID?: string
  width?: LiquidSurfaceDimension
}) {
  const { reduceTransparency } = useGlassAccessibility()
  const pressProgress = useSharedValue(0)
  const nativeGlassAvailable = !reduceTransparency && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()

  return (
    <LiquidSurfaceLayers
      designHeight={designHeight}
      designWidth={designWidth}
      height={height}
      mode={mode}
      nativeGlassAvailable={nativeGlassAvailable}
      pressProgress={pressProgress}
      radius={radius}
      reduceTransparency={reduceTransparency}
      testID={testID}
      width={width}
    />
  )
}

export function LiquidBackButton({
  disabled = false,
  iconColor,
  label,
  mode = 'light',
  onPress,
  size = DEFAULT_SIZE,
  style,
  testID,
}: {
  disabled?: boolean
  iconColor?: string
  label: string
  mode?: GlassMode
  onPress: () => void
  size?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const iconSize = Math.round(size * DEFAULT_ICON_SIZE / DEFAULT_SIZE)

  return (
    <LiquidControlButton
      accessibilityLabel={label}
      disabled={disabled}
      mode={mode}
      onPress={onPress}
      size={size}
      style={style}
      testID={testID}
    >
      <View pointerEvents="none" style={styles.iconLayer}>
        <Svg fill="none" height={iconSize} viewBox="0 0 24 24" width={iconSize}>
          <Path
            d="M14.8 5.8 8.6 12l6.2 6.2"
            stroke={iconColor ?? (mode === 'dark' ? '#FFFFFF' : color.brand.primaryDark)}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.35}
          />
        </Svg>
      </View>
    </LiquidControlButton>
  )
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.54 },
  frame: { alignItems: 'center', justifyContent: 'center' },
  contactLayer: { zIndex: 3 },
  edgeLayer: { zIndex: 2 },
  frostLayer: { zIndex: 1 },
  iconLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  layers: { ...StyleSheet.absoluteFill, overflow: 'hidden', zIndex: 0 },
  pressable: { alignItems: 'center', justifyContent: 'center' },
  webSurface: {
    backdropFilter: 'blur(17px) saturate(1.6) brightness(1.09) contrast(1.04)',
    backgroundColor: 'rgba(255,255,255,0.16)',
    backgroundImage: 'radial-gradient(circle at 26% 12%, rgba(255,255,255,0.34), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
    borderColor: 'rgba(255,255,255,0.72)',
    WebkitBackdropFilter: 'blur(17px) saturate(1.6) brightness(1.09) contrast(1.04)',
  } as any,
})
