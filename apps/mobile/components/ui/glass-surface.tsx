import { type ReactNode } from 'react'
import { BlurView, type BlurTint } from 'expo-blur'
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable, type GlassColorScheme, type GlassStyle } from 'expo-glass-effect'
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'
import { useGlassAccessibility } from './accessibility-motion'
import { createGlassSurfaceStyle, type GlassMaterial, type GlassMode, type GlassVariant } from './tokens'

type GlassSurfaceProps = {
  backgroundColor?: string
  borderColor?: string
  children: ReactNode
  material?: GlassMaterial
  mode?: GlassMode
  onLayout?: ViewProps['onLayout']
  style?: StyleProp<ViewStyle>
  testID?: string
  variant: GlassVariant
}

export function GlassSurface({ backgroundColor, borderColor, children, material = 'standard', mode = 'light', onLayout, style, testID, variant }: GlassSurfaceProps) {
  const { reduceTransparency } = useGlassAccessibility()
  const surfaceStyle = createGlassSurfaceStyle({ backgroundColor, borderColor, material, mode, reduceTransparency, variant })
  const webNavBackingStyle = Platform.OS === 'web' && variant === 'nav' && !reduceTransparency
    ? material === 'liquid'
      ? mode === 'dark'
        ? styles.webLiquidNavBackingDark
        : styles.webLiquidNavBackingLight
      : mode === 'dark'
      ? styles.webNavBackingDark
      : styles.webNavBackingLight
    : null
  const composedStyle = [styles.surface, surfaceStyle, webNavBackingStyle, style]
  const shouldUseBlurFallback = variant !== 'nav' || Platform.OS !== 'web'
  // Manual 1px highlight for the blur / solid fallbacks only. The native GlassView
  // path draws its own edge, so stacking this there double-highlights the surface.
  const edgeHighlightStyle = [styles.edgeHighlight, material === 'liquid' ? liquidEdgeHighlightStyle(mode) : null]
  const blurIntensity = material === 'liquid' ? liquidBlurIntensityByVariant[variant] : blurIntensityByVariant[variant]

  // Require both APIs: isLiquidGlassAvailable() can be true while the native
  // module is missing on some iOS 26 betas, where using GlassView crashes.
  if (!reduceTransparency && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    if (__DEV__) warnIfGlassOpacityFlattened(style)
    return (
      <GlassView
        colorScheme={glassColorSchemeByMode[mode]}
        glassEffectStyle={glassStyleByVariant[variant]}
        isInteractive={variant === 'control' || variant === 'nav'}
        onLayout={onLayout}
        style={composedStyle}
        testID={testID}
        tintColor={backgroundColor}
      >
        {children}
      </GlassView>
    )
  }

  if (!reduceTransparency && shouldUseBlurFallback && Platform.OS !== 'web') {
    return (
      <BlurView
        experimentalBlurMethod="none"
        intensity={blurIntensity}
        onLayout={onLayout}
        style={composedStyle}
        testID={testID}
        tint={blurTintByMode[mode]}
      >
        <View pointerEvents="none" style={edgeHighlightStyle} />
        {children}
      </BlurView>
    )
  }

  return (
    <View
      onLayout={onLayout}
      style={composedStyle}
      testID={testID}
    >
      {!reduceTransparency ? <View pointerEvents="none" style={edgeHighlightStyle} /> : null}
      {children}
    </View>
  )
}

const blurIntensityByVariant: Record<GlassVariant, number> = {
  nav: 28,
  control: 18,
  hero: 24,
  sheet: 30,
}

const liquidBlurIntensityByVariant: Record<GlassVariant, number> = {
  nav: 24,
  control: 18,
  hero: 22,
  sheet: 26,
}

const blurTintByMode: Record<GlassMode, BlurTint> = {
  dark: 'systemThinMaterialDark',
  light: 'systemThinMaterialLight',
}

const glassColorSchemeByMode: Record<GlassMode, GlassColorScheme> = {
  dark: 'dark',
  light: 'light',
}

const glassStyleByVariant: Record<GlassVariant, GlassStyle> = {
  nav: 'regular',
  control: 'regular',
  hero: 'regular',
  sheet: 'regular',
}

function liquidEdgeHighlightStyle(mode: GlassMode): ViewStyle {
  return {
    backgroundColor: mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.46)',
    opacity: mode === 'dark' ? 1 : 0.98,
  }
}

// Opacity < 1 on a GlassView (or an ancestor) flattens the native Liquid Glass
// effect into a plain translucent box. Warn in development so the fade is moved
// to a child view or the surface switched to a standard material.
function warnIfGlassOpacityFlattened(style: StyleProp<ViewStyle>) {
  const flat = StyleSheet.flatten(style)
  if (flat && typeof flat.opacity === 'number' && flat.opacity < 1) {
    console.warn('[GlassSurface] opacity < 1 flattens the native Liquid Glass effect; fade a child view or use a standard material instead.')
  }
}

const styles = StyleSheet.create({
  edgeHighlight: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    height: 1,
    left: 14,
    opacity: 0.62,
    position: 'absolute',
    right: 14,
    top: 1,
    zIndex: 1,
  },
  surface: {
    position: 'relative',
  },
  webNavBackingDark: {
    backgroundColor: '#102420',
    borderColor: 'rgba(105,222,198,0.20)',
  },
  webNavBackingLight: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    backgroundImage: 'radial-gradient(circle at 52% 0%, rgba(207,255,243,0.52), transparent 38%)',
    borderColor: 'rgba(255,255,255,0.88)',
  } as any,
  webLiquidNavBackingDark: {
    backdropFilter: 'blur(24px) saturate(1.45) contrast(1.04)',
    backgroundColor: 'rgba(22,29,27,0.42)',
    borderColor: 'rgba(190,210,205,0.16)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.45) contrast(1.04)',
  } as any,
  webLiquidNavBackingLight: {
    backdropFilter: 'blur(24px) saturate(1.95) contrast(1.07)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    backgroundImage: 'radial-gradient(circle at 18% 8%, rgba(255,255,255,0.38), transparent 28%), radial-gradient(circle at 52% 106%, rgba(23,169,149,0.040), transparent 44%), linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.024))',
    borderColor: 'rgba(255,255,255,0.70)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.95) contrast(1.07)',
  } as any,
})
